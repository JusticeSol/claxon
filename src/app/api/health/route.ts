import { NextResponse } from "next/server";
import { loadHeartbeat } from "@/lib/store";
import { STALE_AFTER_MS } from "@/config";

// Public and unauthenticated: it exposes no secrets, and the whole point is
// that something *outside* Claxon can check whether Claxon is still running.
// Point any uptime monitor (UptimeRobot, Better Stack, Pingdom) at this URL —
// it returns 503 when the poller has gone quiet, so the monitor pages you.
export const dynamic = "force-dynamic";

export async function GET() {
  let hb = null;
  try {
    hb = await loadHeartbeat();
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "store unreachable", error: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }

  if (!hb) {
    return NextResponse.json(
      { ok: false, reason: "no poll has completed yet" },
      { status: 503 }
    );
  }

  const ageMs = Date.now() - Date.parse(hb.at);
  const stale = ageMs > STALE_AFTER_MS;
  const healthy = hb.ok && !stale;

  return NextResponse.json(
    {
      ok: healthy,
      lastPollAt: hb.at,
      ageSeconds: Math.round(ageMs / 1000),
      staleAfterSeconds: Math.round(STALE_AFTER_MS / 1000),
      stale,
      lastPollSucceeded: hb.ok,
      ...(hb.block ? { block: hb.block } : {}),
      ...(hb.agents !== undefined ? { agents: hb.agents } : {}),
      ...(hb.error ? { lastError: hb.error } : {}),
    },
    { status: healthy ? 200 : 503 }
  );
}
