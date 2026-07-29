import { NextRequest, NextResponse } from "next/server";
import { fetchSystemSnapshot } from "@/lib/agents";
import { evaluate } from "@/lib/rules";
import { broadcast } from "@/lib/telegram";
import {
  filterUnsent,
  listSubscribers,
  loadPrevSnapshot,
  markSent,
  saveSnapshot,
} from "@/lib/store";

export const maxDuration = 60; // Vercel function limit headroom for ~20 agents

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== "Bearer " + process.env.POLL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const prev = await loadPrevSnapshot();
  const current = await fetchSystemSnapshot();
  const alerts = evaluate(current, prev);

  const unsent = await filterUnsent(alerts.map((a) => a.key));
  const toSend = alerts.filter((a) => unsent.has(a.key));

  if (toSend.length > 0) {
    const subs = await listSubscribers();
    if (subs.length > 0) {
      const text = toSend.map((a) => a.message).join("\n\n");
      await broadcast(subs, text);
    }
    await markSent(toSend.map((a) => a.key));
  }

  await saveSnapshot(current);

  return NextResponse.json({
    block: current.blockNumber.toString(),
    agents: current.agents.length,
    alertsEvaluated: alerts.length,
    alertsSent: toSend.length,
  });
}
