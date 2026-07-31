import "./globals.css";

export const metadata = {
  title: "Claxon — FXRP agent health alerts on Flare",
  description:
    "Claxon sounds before liquidation does. Telegram alerts for FAssets agent health on Flare: liquidations, collateral-ratio warnings, backing shortfalls, and system pauses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
