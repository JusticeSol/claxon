import { fetchSystemSnapshot, fmtCr, fmtXrp, type SystemSnapshot } from "@/lib/agents";
import { loadHeartbeat, type Heartbeat } from "@/lib/store";
import { STALE_AFTER_MS } from "@/config";

// Live mainnet read, cached for 60s so the page stays fast and we stay polite to the RPC.
export const revalidate = 60;

const BOT = "https://t.me/ClaxonFlareBot";
const REPO = "https://github.com/JusticeSol/claxon";

export default async function Home() {
  let snap: SystemSnapshot | null = null;
  let error: string | null = null;
  try {
    snap = await fetchSystemSnapshot();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  let beat: Heartbeat | null = null;
  try {
    beat = await loadHeartbeat();
  } catch {
    // The page must still render if the store is unreachable.
  }
  const beatAgeMs = beat ? Date.now() - Date.parse(beat.at) : null;
  const pollerOk = beat?.ok === true && beatAgeMs !== null && beatAgeMs < STALE_AFTER_MS;

  const agents = snap?.agents ?? [];
  const totalMinted = agents.reduce((acc, a) => acc + a.mintedUBA, 0n);
  const atRisk = agents.filter((a) => a.status !== 0).length;

  return (
    <>
      <div className="hazard" />
      <div className="wrap">
        <header className="hero">
          <h1 className="title">
            Clax<span>on</span>
          </h1>
          <p className="tagline">Claxon sounds before liquidation does.</p>
          <p className="sub">
            Telegram alerts for FXRP agent health on Flare. Claxon watches every FAssets agent on
            mainnet and messages you the moment collateral slips, a liquidation opens, backing falls
            short, or the system pauses — so you find out before the loss, not after.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href={BOT}>
              Start on Telegram →
            </a>
            <a className="btn btn-ghost" href={REPO}>
              View source
            </a>
          </div>
        </header>

        <section className="section">
          <div className="section-head">
            <h2>Live agent health · Flare mainnet</h2>
            <span className="meta">
              {snap ? `block ${snap.blockNumber.toString()} · refreshed every 60s` : "unavailable"}
            </span>
          </div>

          <div className="panel">
            {error && (
              <p className="err">
                Live chain read failed: {error}
                <br />
                The alerting poller runs independently of this page and is unaffected.
              </p>
            )}

            {snap && (
              <>
                <div className="stats">
                  <div className="stat">
                    <div className="stat-label">Agents tracked</div>
                    <div className="stat-value">{agents.length}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">FXRP backed</div>
                    <div className="stat-value">{fmtXrp(totalMinted)}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">In liquidation</div>
                    <div className={`stat-value ${atRisk ? "bad" : "ok"}`}>{atRisk}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">System</div>
                    <div
                      className={`stat-value ${
                        snap.emergencyPaused ? "bad" : snap.mintingPaused ? "warn" : "ok"
                      }`}
                    >
                      {snap.emergencyPaused ? "PAUSED" : snap.mintingPaused ? "MINT OFF" : "NORMAL"}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Poller</div>
                    <div className={`stat-value ${pollerOk ? "ok" : "bad"}`}>
                      {pollerOk ? "LIVE" : beat ? "STALE" : "—"}
                    </div>
                    {beatAgeMs !== null && (
                      <div className="stat-label" style={{ marginTop: 6, letterSpacing: 0 }}>
                        checked {fmtAge(beatAgeMs)} ago
                      </div>
                    )}
                  </div>
                </div>

                {agents.map((a) => (
                  <div className="agent" key={a.vault}>
                    <span className="addr">
                      {a.status === 0 ? "🟢" : "🔴"} {a.vault.slice(0, 10)}…{a.vault.slice(-8)}
                      {a.status !== 0 && <strong className="bad"> {a.statusName}</strong>}
                    </span>
                    <span className="agent-minted">{fmtXrp(a.mintedUBA)} backed</span>
                    <div className="bars">
                      <CrBar label="vault CR" cr={a.vaultCrBips} min={a.minVaultCrBips} />
                      <CrBar label="pool CR" cr={a.poolCrBips} min={a.minPoolCrBips} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>What triggers an alert</h2>
            <span className="meta">edge-triggered — fires on change, not on state</span>
          </div>
          <div className="panel">
            <div className="rules">
              <Rule sev="critical" color="bad" title="Liquidation started">
                Agent status moves out of NORMAL into LIQUIDATION or FULL_LIQUIDATION.
              </Rule>
              <Rule sev="warning" color="warn" title="Collateral ratio slipping">
                Vault or pool CR enters the warning band above its enforced minimum — the early
                warning, before liquidation is possible.
              </Rule>
              <Rule sev="opportunity" color="ok" title="Liquidation open">
                A position becomes liquidatable, with the available amount and the premium on offer.
              </Rule>
              <Rule sev="critical" color="bad" title="Backing shortfall">
                An agent&apos;s underlying XRP balance falls below what its minted FXRP requires.
              </Rule>
              <Rule sev="critical" color="bad" title="System pause">
                Emergency pause or minting pause on the FXRP asset manager.
              </Rule>
              <Rule sev="quiet" color="" title="Silence by default">
                Alerts fire only on transitions, backed by a 6-hour dedupe. A stuck agent produces
                one alert, not one every five minutes.
              </Rule>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Deployment</h2>
            <span className="meta">read-only · no contracts deployed · no funds held</span>
          </div>
          <div className="panel facts">
            <Fact k="Network" v="Flare Mainnet (chain 14)" />
            <Fact k="FlareContractRegistry" v="0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" />
            <Fact
              k="AssetManagerFXRP"
              v={snap ? snap.assetManager : "resolved at runtime from the registry"}
            />
            <Fact k="Poll interval" v="every 5 minutes · offline detected within 20" />
          </div>
        </section>

        <footer>
          <span>Built for Flare Summer Signal · Bounty 1 — Interoperable Asset Products</span>
          <span>
            <a href={REPO}>github.com/JusticeSol/claxon</a>
          </span>
        </footer>
      </div>
    </>
  );
}

function fmtAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`;
}

function CrBar({ label, cr, min }: { label: string; cr: bigint; min: bigint }) {
  // Scale the bar so the enforced minimum sits at 40% of the width; clamp the fill at 100%.
  const ratio = min > 0n ? Number(cr) / Number(min) : 0;
  const pct = Math.min(100, ratio * 40);
  const tone = ratio >= 1.6 ? "var(--green)" : ratio >= 1.2 ? "var(--amber)" : "var(--red)";
  return (
    <div className="bar-item">
      <div className="bar-top">
        <span>{label}</span>
        <span>
          <b>{fmtCr(cr)}</b> / min {fmtCr(min)}
        </span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct}%`, background: tone }} />
        <div className="bar-min" style={{ left: "40%" }} />
      </div>
    </div>
  );
}

function Rule({
  sev,
  color,
  title,
  children,
}: {
  sev: string;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rule">
      <div className={`rule-sev ${color}`}>{sev}</div>
      <div className="rule-title">{title}</div>
      <div className="rule-body">{children}</div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="fact">
      <span className="fact-k">{k}</span>
      <span className="fact-v">{v}</span>
    </div>
  );
}
