const API = () => "https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN;

export async function sendMessage(chatId: number | string, text: string) {
  const res = await fetch(API() + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("telegram sendMessage failed", await res.text());
}

export async function broadcast(chatIds: (number | string)[], text: string) {
  // Telegram global limit ~30 msg/s — fine at hackathon scale, chunk anyway.
  for (const id of chatIds) {
    await sendMessage(id, text);
    await new Promise((r) => setTimeout(r, 50));
  }
}
