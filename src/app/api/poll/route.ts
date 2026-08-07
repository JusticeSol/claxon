import { NextRequest, NextResponse } from "next/server";
import { fetchSystemSnapshot } from "@/lib/agents";
import { evaluate } from "@/lib/rules";
import { broadcast } from "@/lib/telegram";
import {
  filterUnsent,
  listSubscribers,
  loadHeartbeat,
  loadPrevSnapshot,
  markSent,
  saveHeartbeat,
  saveSnapshot,
} from "@/lib/store";
import { STALE_AFTER_MS } from "@/config";

export const maxDuration = 60; // Vercel function limit headroom for ~20 agents

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== "Bearer " + process.env.POLL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // How long since the last completed poll? Used to tell subscribers when
  // Claxon itself went dark — silence must not be mistaken for "all clear".
  const lastBeat = await loadHeartbeat();
  const gapMs = lastBeat ? Date.now() - Date.parse(lastBeat.at) : 0;

  try {
    const prev = await loadPrevSnapshot();
    const current = await fetchSystemSnapshot();
    const alerts = evaluate(current, prev);

    const unsent = await filterUnsent(alerts.map((a) => a.key));
    const toSend = alerts.filter((a) => unsent.has(a.key));

    const recovered = lastBeat !== null && gapMs > STALE_AFTER_MS;
    if (recovered) {
      toSend.unshift({
        key: `heartbeat:recovered:${Math.floor(Date.now() / 60000)}`,
        severity: "info",
        message:
          `🟡 Claxon was offline for ~${Math.round(gapMs / 60000)} min and has resumed. ` +
          `Alerts during that window may have been missed — check /status.`,
      });
    }

    if (toSend.length > 0) {
      const subs = await listSubscribers();
      if (subs.length > 0) {
        const text = toSend.map((a) => a.message).join("\n\n");
        await broadcast(subs, text);
      }
      await markSent(toSend.map((a) => a.key));
    }

    await saveSnapshot(current);
    await saveHeartbeat({
      at: new Date().toISOString(),
      ok: true,
      block: current.blockNumber.toString(),
      agents: current.agents.length,
    });

    return NextResponse.json({
      block: current.blockNumber.toString(),
      agents: current.agents.length,
      alertsEvaluated: alerts.length,
      alertsSent: toSend.length,
      recovered,
    });
  } catch (e) {
    // Record the failure so /api/health can report it rather than the run
    // vanishing into a GitHub Actions log nobody reads.
    const message = e instanceof Error ? e.message : String(e);
    await saveHeartbeat({ at: new Date().toISOString(), ok: false, error: message }).catch(
      () => {}
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
