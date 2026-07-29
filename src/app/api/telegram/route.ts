import { NextRequest, NextResponse } from "next/server";
import { fetchSystemSnapshot, fmtCr, fmtXrp } from "@/lib/agents";
import { sendMessage } from "@/lib/telegram";
import { addSubscriber, removeSubscriber } from "@/lib/store";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Telegram echoes back the secret you set with setWebhook.
  if (
    req.headers.get("x-telegram-bot-api-secret-token") !==
    process.env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = await req.json();
  const msg = update?.message;
  const chatId: number | undefined = msg?.chat?.id;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId) return NextResponse.json({ ok: true });

  if (text.startsWith("/start") || text.startsWith("/watch")) {
    await addSubscriber(chatId);
    await sendMessage(
      chatId,
      "📣 Claxon armed. You will get alerts for FXRP agent liquidations, collateral warnings, underlying shortfalls, and system pauses.\n\nCommands:\n/status — live agent overview\n/stop — unsubscribe"
    );
  } else if (text.startsWith("/stop") || text.startsWith("/unwatch")) {
    await removeSubscriber(chatId);
    await sendMessage(chatId, "Claxon silenced for this chat.");
  } else if (text.startsWith("/status")) {
    const s = await fetchSystemSnapshot();
    const lines = s.agents
      .filter((a) => a.publiclyAvailable || a.status > 0)
      .map(
        (a) =>
          `${a.status === 0 ? "🟢" : "🔴"} ${a.vault.slice(0, 6)}…${a.vault.slice(-4)}  ${a.statusName}  vaultCR ${fmtCr(a.vaultCrBips)} (min ${fmtCr(a.minVaultCrBips)})  minted ${fmtXrp(a.mintedUBA)}`
      );
    const header = s.emergencyPaused
      ? "🚨 SYSTEM EMERGENCY PAUSED\n\n"
      : `FXRP agents @ block ${s.blockNumber}\n\n`;
    await sendMessage(chatId, header + (lines.join("\n") || "No public agents found."));
  } else {
    await sendMessage(chatId, "Commands: /watch /status /stop");
  }

  return NextResponse.json({ ok: true });
}
