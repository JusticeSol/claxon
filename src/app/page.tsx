export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "4rem 2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Claxon</h1>
      <p style={{ fontWeight: "bold" }}>Claxon sounds before liquidation does.</p>
      <p>Telegram alerts for FXRP agent health on Flare: liquidations, collateral-ratio warnings, underlying shortfalls, and emergency pauses.</p>
      <p>Add the bot on Telegram and send /watch to subscribe, /status for a live overview.</p>
    </main>
  );
}
