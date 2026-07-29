// Manual end-to-end proof: real chain read -> real rules -> real Telegram send.
// Usage: CR_WARNING_MARGIN_BIPS=7000 TEST_CHAT_ID=<id> npm run test:alert
// Sends only to TEST_CHAT_ID. Does not touch the subscriber table.
import { fetchSystemSnapshot } from "../src/lib/agents";
import { evaluate } from "../src/lib/rules";
import { sendMessage } from "../src/lib/telegram";

async function main() {
  const chatId = process.env.TEST_CHAT_ID;
  if (!chatId) throw new Error("set TEST_CHAT_ID");

  const s = await fetchSystemSnapshot();
  const alerts = evaluate(s, null); // cold start
  console.log(`block ${s.blockNumber} — ${s.agents.length} agents — ${alerts.length} alerts`);

  if (!alerts.length) {
    console.log("no alerts fired; widen CR_WARNING_MARGIN_BIPS to force one");
    return;
  }
  for (const a of alerts) {
    console.log(` -> sending [${a.severity}] ${a.key}`);
    await sendMessage(chatId, `[${a.severity.toUpperCase()}] ${a.message}`);
  }
  console.log("sent.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
