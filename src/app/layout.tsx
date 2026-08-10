import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";

// Archivo: a sturdy grotesk with real weight at display sizes, without the
// Inter/Roboto ubiquity. Plex Mono carries every number on the instrument face.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const SITE = "https://claxon-eta.vercel.app";
const TITLE = "Claxon — FXRP agent collateral, watched";
const DESC =
  "Claxon sounds before liquidation does. Telegram alerts for FAssets agent health on Flare: collateral warnings, liquidations, backing shortfalls and system pauses.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  openGraph: {
    title: TITLE,
    description: DESC,
    url: SITE,
    siteName: "Claxon",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
  },
};

export const viewport: Viewport = {
  themeColor: "#efe9dc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
