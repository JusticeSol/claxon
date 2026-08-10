import { ImageResponse } from "next/og";
import { fetchSystemSnapshot, fmtCr, fmtXrp } from "@/lib/agents";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Claxon — live FXRP agent collateral on Flare";
// Regenerate at most every 5 minutes: link previews stay live without
// hammering the RPC every time someone pastes the URL.
export const revalidate = 300;

const PAPER = "#efe9dc";
const TRACK = "#ded5c2";
const INK = "#17150f";
const SOFT = "#6c6555";
const RED = "#c62828";
const AMBER = "#c8860d";

// Explicit heights throughout: Satori does not shrink content to fit, it
// overflows and overlaps, so the vertical budget has to add up to 630 by hand.
const BAR_H = 168;
const MIN_AT = BAR_H / 3; // ratio 1.0 on a 0..3 scale

export default async function Image() {
  let agents: { vault: string; ratio: number; label: string; alarm: boolean }[] = [];
  let backed = "";
  let block = "";

  try {
    const snap = await fetchSystemSnapshot();
    block = snap.blockNumber.toString();
    backed = fmtXrp(snap.agents.reduce((a, x) => a + x.mintedUBA, 0n));
    agents = snap.agents.map((a) => {
      const v = Number(a.vaultCrBips) / Number(a.minVaultCrBips);
      const p = Number(a.poolCrBips) / Number(a.minPoolCrBips);
      return {
        vault: `${a.vault.slice(0, 6)}…${a.vault.slice(-4)}`,
        ratio: Math.min(v, p),
        label: v <= p ? fmtCr(a.vaultCrBips) : fmtCr(a.poolCrBips),
        alarm: a.status !== 0,
      };
    });
  } catch {
    // A link preview must never fail; fall back to the type-only version.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: PAPER,
          color: INK,
          display: "flex",
          flexDirection: "column",
          padding: "44px 56px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>
          CLAXON
        </div>

        <div style={{ display: "flex", height: 7, background: INK, marginTop: 14 }} />

        <div style={{ display: "flex", fontSize: 33, fontWeight: 700, marginTop: 16 }}>
          Claxon sounds before liquidation does.
        </div>

        <div style={{ display: "flex", fontSize: 20, color: SOFT, marginTop: 8 }}>
          Telegram alerts for FXRP agent collateral · Flare mainnet
        </div>

        {/* One column per agent. Bar height is collateral ÷ minimum; the red
            rule is the minimum itself, so "how close to liquidation" is the
            distance between the two. */}
        <div style={{ display: "flex", gap: 16, marginTop: 22, height: BAR_H + 46 }}>
          {agents.map((a) => {
            const h = Math.round(Math.min(a.ratio / 3, 1) * BAR_H);
            const tone = a.alarm || a.ratio < 1 ? RED : a.ratio < 1.2 ? AMBER : INK;
            return (
              <div
                key={a.vault}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}
              >
                <div style={{ display: "flex", fontSize: 19, fontWeight: 700, height: 24 }}>
                  {a.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    position: "relative",
                    width: "100%",
                    height: BAR_H,
                    background: TRACK,
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ display: "flex", width: "100%", height: h, background: tone }} />
                  <div
                    style={{
                      display: "flex",
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: MIN_AT,
                      height: 3,
                      background: RED,
                    }}
                  />
                </div>
                <div style={{ display: "flex", fontSize: 15, color: SOFT, height: 22, marginTop: 4 }}>
                  {a.vault}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 19,
            color: SOFT,
            marginTop: 14,
          }}
        >
          <div style={{ display: "flex" }}>
            {agents.length ? `${agents.length} agents · ${backed} backed` : "FAssets agent health"}
          </div>
          <div style={{ display: "flex" }}>{block ? `block ${block}` : "claxon-eta.vercel.app"}</div>
        </div>
      </div>
    ),
    size
  );
}
