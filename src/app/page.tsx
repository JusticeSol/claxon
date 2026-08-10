import { fetchSystemSnapshot, fmtCr, fmtXrp, fmtXrpShort, type SystemSnapshot } from "@/lib/agents";
import { loadHeartbeat, type Heartbeat } from "@/lib/store";
import { STALE_AFTER_MS } from "@/config";

// Live mainnet read, cached 60s: fast page, polite to the RPC.
export const revalidate = 60;

const BOT = "https://t.me/ClaxonFlareBot";
const REPO = "https://github.com/JusticeSol/claxon";

// ---- gauge geometry -------------------------------------------------------
// A 240° sweep, the way a tachometer reads: rest at lower-left, redline first.
// The needle tracks collateral ratio ÷ enforced minimum, so 1.0 is always the
// liquidation threshold no matter which collateral type is being shown.
const R = 70;
const CX = 100;
const CY = 90;
const A0 = 210; // ratio 0
const A1 = -30; // ratio MAX
const MAX = 4;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)];
}

/** Small chevron just past full scale, for needles pinned at the stop. */
function pegMarker(): string {
  const [ax, ay] = polar(R + 6, A1 + 4);
  const [bx, by] = polar(R + 14, A1);
  const [cx2, cy2] = polar(R + 6, A1 - 4);
  return `${ax},${ay} ${bx},${by} ${cx2},${cy2}`;
}

function arc(r: number, from: number, to: number): string {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  const large = Math.abs(from - to) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

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
    // page must render even if the store is unreachable
  }
  const beatAge = beat ? Date.now() - Date.parse(beat.at) : null;
  const pollerOk = beat?.ok === true && beatAge !== null && beatAge < STALE_AFTER_MS;

  const agents = snap?.agents ?? [];
  const totalMinted = agents.reduce((acc, a) => acc + a.mintedUBA, 0n);
  const alarm = agents.some((a) => a.status !== 0) || !!snap?.emergencyPaused;

  return (
    <div className="sheet">
      <header className="masthead">
        <h1 className="wordmark">Claxon</h1>
        <div className="rule-heavy" />
        <div className="strapline">
          <span>FXRP agent collateral · Flare mainnet</span>
          <span>{snap ? `Block ${snap.blockNumber.toString()}` : "chain unavailable"}</span>
        </div>
        <div className="rule-hair" />

        <div className="lamps">
          <span className="lamp">
            <span className={`bulb ${alarm ? "on-red" : ""}`} />
            <span className={alarm ? "" : "lamp-off"}>{alarm ? "Alarm" : "No alarm"}</span>
          </span>
          <span className="lamp">
            <span className={`bulb ${pollerOk ? "on-green" : "on-red"}`} />
            <span className={pollerOk ? "" : ""}>
              {pollerOk ? "Watch active" : beat ? "Watch stale" : "Watch unknown"}
              {beatAge !== null && ` · ${fmtAge(beatAge)} ago`}
            </span>
          </span>
          {snap && (
            <span className="scope">
              {agents.length} agents watched · {fmtXrpShort(totalMinted)} backed
            </span>
          )}
        </div>
        <div className="rule-hair" />

        <p className="lede">Claxon sounds before liquidation does.</p>
        <p className="sub">
          FXRP is backed by agents posting collateral. When an agent&apos;s ratio falls toward its
          enforced minimum, it gets liquidated. That state is public on-chain and nobody is told.
          Claxon watches every agent and messages you on Telegram the moment it moves, while there
          is still time to top up.
        </p>

        <div className="actions">
          <a className="btn btn-solid" href={BOT}>
            Start on Telegram
          </a>
          <a className="btn btn-out" href={REPO}>
            Read the source
          </a>
        </div>
      </header>

      <section className="band">
        <p className="band-title">Collateral ratio · every agent, live</p>
        <p className="band-note">
          Needle reads collateral ÷ enforced minimum. Red arc is below minimum, where liquidation
          happens. Amber is the warning band where Claxon alerts.
        </p>

        {error && (
          <p className="notice">
            <strong>Live chain read failed.</strong>
            <br />
            {error}
            <br />
            The alerting poller runs independently of this page and is unaffected.
          </p>
        )}

        {snap && (
          <div className="dials">
            {agents.map((a) => {
              const vault = Number(a.vaultCrBips) / Number(a.minVaultCrBips);
              const pool = Number(a.poolCrBips) / Number(a.minPoolCrBips);
              const binding = vault <= pool ? "vault" : "pool";
              return (
                <div className={`dial ${a.status !== 0 ? "alarm" : ""}`} key={a.vault}>
                  <Gauge
                    ratio={Math.min(vault, pool)}
                    reading={binding === "vault" ? fmtCr(a.vaultCrBips) : fmtCr(a.poolCrBips)}
                    caption={`${binding} collateral`}
                  />
                  <div className="dial-addr">
                    {a.vault.slice(0, 8)}…{a.vault.slice(-6)}
                  </div>
                  <div className="dial-readout">
                    vault {fmtCr(a.vaultCrBips)} · min {fmtCr(a.minVaultCrBips)}
                    <br />
                    pool {fmtCr(a.poolCrBips)} · min {fmtCr(a.minPoolCrBips)}
                    <br />
                    {fmtXrp(a.mintedUBA)} backed
                  </div>
                  {a.status !== 0 && <div className="dial-flag">{a.statusName}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="band">
        <p className="band-title">When the alarm sounds</p>
        <p className="band-note">
          Edge-triggered: an alert fires when a condition <em>becomes</em> true, never while it
          merely stays true.
        </p>
        <div className="legend">
          <Row tone="var(--red)" name="Liquidation started">
            Agent status leaves NORMAL for LIQUIDATION or FULL_LIQUIDATION.
          </Row>
          <Row tone="var(--amber)" name="Ratio in warning band">
            Vault or pool collateral enters the margin above its enforced minimum. The early
            warning, while topping up is still possible.
          </Row>
          <Row tone="var(--ink)" name="Liquidation open">
            A position becomes liquidatable, with the amount available and the premium on offer.
          </Row>
          <Row tone="var(--red)" name="Backing shortfall">
            An agent&apos;s underlying XRP falls below what its minted FXRP requires.
          </Row>
          <Row tone="var(--red)" name="System pause">
            Emergency pause or minting pause on the FXRP asset manager.
          </Row>
          <Row tone="transparent" name="Otherwise, silence">
            A stuck agent produces one alert, not one every five minutes. Backed by a 6-hour
            dedupe and 19 tests over the rules engine.
          </Row>
        </div>
      </section>

      <section className="band">
        <p className="band-title">Instrument details</p>
        <div className="plate">
          <PlateRow k="Network" v="Flare mainnet · chain 14" />
          <PlateRow k="Contract registry" v="0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" />
          <PlateRow
            k="AssetManagerFXRP"
            v={snap ? snap.assetManager : "resolved at runtime from the registry"}
          />
          <PlateRow k="Poll interval" v="5 minutes · offline detected within 20" />
          <PlateRow k="Holds" v="no contracts deployed · no funds · no approvals" />
        </div>
      </section>

      <section className="band">
        <p className="band-title">Start watching</p>
        <div className="start">
          <div className="start-steps">
            <div className="step">
              <span className="step-n">1</span>
              <span>
                Open <a href={BOT}>@ClaxonFlareBot</a>
              </span>
            </div>
            <div className="step">
              <span className="step-n">2</span>
              <span>
                Send <code>/watch</code>
              </span>
            </div>
            <div className="step">
              <span className="step-n">3</span>
              <span>Alerts arrive when something moves</span>
            </div>
          </div>
          <div className="start-cmds">
            <div>
              <code>/watch</code> subscribe to alerts
            </div>
            <div>
              <code>/status</code> live reading of every agent
            </div>
            <div>
              <code>/stop</code> unsubscribe
            </div>
            <p className="start-note">
              No wallet, no approvals, no signatures. Claxon only reads the chain.
            </p>
          </div>
        </div>
        <div className="actions">
          <a className="btn btn-solid" href={BOT}>
            Start on Telegram
          </a>
        </div>
      </section>

      <footer>
        <span>Flare Summer Signal · Bounty 1</span>
        <span>
          <a href={REPO}>github.com/JusticeSol/claxon</a>
        </span>
      </footer>
    </div>
  );
}

function Gauge({
  ratio,
  reading,
  caption,
}: {
  ratio: number;
  reading: string;
  caption: string;
}) {
  const sweep = A0 - A1;
  const at = (r: number) => A0 - sweep * Math.min(Math.max(r / MAX, 0), 1);

  const needle = at(ratio);
  const [nx, ny] = polar(R - 15, needle);
  const [minX, minY] = polar(R + 13, at(1));

  const ticks = [0, 1, 2, 3, 4].map((t) => {
    const a = at(t);
    const [x0, y0] = polar(R - 9, a);
    const [x1, y1] = polar(R + 1, a);
    return { t, x0, y0, x1, y1 };
  });

  return (
    <svg viewBox="0 0 200 172" role="img" aria-label={`${caption} ${reading}`}>
      {/* full scale */}
      <path d={arc(R, A0, A1)} fill="none" stroke="var(--rule)" strokeWidth="9" />
      {/* danger: below the enforced minimum */}
      <path d={arc(R, at(0), at(1))} fill="none" stroke="var(--red)" strokeWidth="9" />
      {/* warning band Claxon alerts in */}
      <path d={arc(R, at(1), at(1.2))} fill="none" stroke="var(--amber)" strokeWidth="9" />

      {ticks.map((k) => (
        <line
          key={k.t}
          x1={k.x0}
          y1={k.y0}
          x2={k.x1}
          y2={k.y1}
          stroke="var(--ink)"
          strokeWidth={k.t === 1 ? 2.2 : 1.2}
        />
      ))}

      <text
        x={minX}
        y={minY}
        fontSize="9"
        fontWeight="700"
        fill="var(--red)"
        textAnchor="middle"
        letterSpacing="0.1"
      >
        MIN
      </text>

      {/* off-scale marker: without it a pegged needle reads as a broken gauge */}
      {ratio > MAX && (
        <polygon
          points={pegMarker()}
          fill="var(--ink)"
          aria-label="above full scale"
        />
      )}

      {/* needle */}
      <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="3.4" />
      <circle cx={CX} cy={CY} r="6" fill="var(--ink)" />

      {/* Readout sits in the open bottom of the dial, clear of the needle hub. */}
      <text x={CX} y={CY + 58} fontSize="25" fontWeight="800" fill="var(--ink)" textAnchor="middle">
        {reading}
      </text>
      <text
        x={CX}
        y={CY + 73}
        fontSize="8.5"
        fill="var(--ink-soft)"
        textAnchor="middle"
        letterSpacing="1.3"
      >
        {caption.toUpperCase()}
      </text>
    </svg>
  );
}

function Row({
  tone,
  name,
  children,
}: {
  tone: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="legend-row">
      <span
        className="legend-dot"
        style={{ background: tone, border: tone === "transparent" ? "1.5px solid var(--rule)" : "none" }}
      />
      <span className="legend-name">{name}</span>
      <span className="legend-desc">{children}</span>
    </div>
  );
}

function PlateRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="plate-row">
      <span className="plate-k">{k}</span>
      <span className="plate-v">{v}</span>
    </div>
  );
}

function fmtAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`;
}
