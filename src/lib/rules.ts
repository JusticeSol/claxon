import { CR_WARNING_MARGIN_BIPS } from "@/config";
import { fmtCr, fmtXrp, type AgentSnapshot, type SystemSnapshot } from "@/lib/agents";

export type Severity = "info" | "warning" | "critical" | "opportunity";

export interface Alert {
  key: string; // stable dedupe key, e.g. "cr-warning:0xabc"
  severity: Severity;
  vault?: string;
  message: string; // Telegram-ready (MarkdownV2-safe content is escaped at send time)
}

/**
 * Edge-triggered rules: an alert fires only when a condition BECOMES true
 * (or worsens) relative to the previous snapshot. `prev` may be null on
 * first run — then only currently-critical states fire, once.
 */
export function evaluate(
  current: SystemSnapshot,
  prev: SystemSnapshot | null
): Alert[] {
  const alerts: Alert[] = [];
  const prevAgents = new Map(prev?.agents.map((a) => [a.vault, a]) ?? []);

  // System-wide
  if (current.emergencyPaused && !prev?.emergencyPaused) {
    alerts.push({
      key: "system:emergency-pause",
      severity: "critical",
      message: "🚨 EMERGENCY PAUSE triggered on the FXRP AssetManager. All operations may be halted.",
    });
  }
  if (current.mintingPaused && !prev?.mintingPaused) {
    alerts.push({
      key: "system:minting-pause",
      severity: "warning",
      message: "⏸ Minting is paused on the FXRP AssetManager.",
    });
  }

  for (const a of current.agents) {
    const p = prevAgents.get(a.vault) ?? null;
    alerts.push(...agentRules(a, p));
  }
  return alerts;
}

function agentRules(a: AgentSnapshot, p: AgentSnapshot | null): Alert[] {
  const out: Alert[] = [];
  const v = short(a.vault);

  // 1. Status transitions (NORMAL=0 → LIQUIDATION=1 / FULL_LIQUIDATION=2 / DESTROYING=3)
  if (p && a.status !== p.status) {
    const sev: Severity = a.status >= 1 && a.status <= 2 ? "critical" : "info";
    out.push({
      key: `status:${a.vault}:${a.status}`,
      severity: sev,
      vault: a.vault,
      message: `${sev === "critical" ? "🔴" : "ℹ️"} Agent ${v}: status ${p.statusName} → ${a.statusName}`,
    });
  } else if (!p && a.status === 1) {
    out.push({
      key: `status:${a.vault}:1`,
      severity: "critical",
      vault: a.vault,
      message: `🔴 Agent ${v} is currently in LIQUIDATION`,
    });
  } else if (!p && a.status === 2) {
    out.push({
      key: `status:${a.vault}:2`,
      severity: "critical",
      vault: a.vault,
      message: `🔴 Agent ${v} is in FULL LIQUIDATION (illegal payment)`,
    });
  }

  // 2. Collateral ratio early warning: CR entered the band [min, min + margin)
  const vaultWarn = inWarningBand(a.vaultCrBips, a.minVaultCrBips);
  const prevVaultWarn = p ? inWarningBand(p.vaultCrBips, p.minVaultCrBips) : false;
  if (vaultWarn && !prevVaultWarn) {
    out.push({
      key: `cr-vault:${a.vault}`,
      severity: "warning",
      vault: a.vault,
      message: `⚠️ Agent ${v}: vault CR ${fmtCr(a.vaultCrBips)} approaching minimum ${fmtCr(a.minVaultCrBips)}`,
    });
  }
  const poolWarn = inWarningBand(a.poolCrBips, a.minPoolCrBips);
  const prevPoolWarn = p ? inWarningBand(p.poolCrBips, p.minPoolCrBips) : false;
  if (poolWarn && !prevPoolWarn) {
    out.push({
      key: `cr-pool:${a.vault}`,
      severity: "warning",
      vault: a.vault,
      message: `⚠️ Agent ${v}: pool CR ${fmtCr(a.poolCrBips)} approaching minimum ${fmtCr(a.minPoolCrBips)}`,
    });
  }

  // 3. Liquidation opportunity (for liquidators): liquidatable amount appeared or grew
  if (a.maxLiquidationAmountUBA > 0n && (!p || p.maxLiquidationAmountUBA === 0n)) {
    const premiumVault = Number(a.liquidationPaymentFactorVaultBips) / 100 - 100;
    out.push({
      key: `liq-opp:${a.vault}`,
      severity: "opportunity",
      vault: a.vault,
      message: `💰 Liquidation open on agent ${v}: up to ${fmtXrp(a.maxLiquidationAmountUBA)} at ~${premiumVault.toFixed(1)}% vault-collateral premium`,
    });
  }

  // 4. Underlying backing shortfall
  const short_ = a.underlyingBalanceUBA < a.requiredUnderlyingBalanceUBA;
  const prevShort = p ? p.underlyingBalanceUBA < p.requiredUnderlyingBalanceUBA : false;
  if (short_ && !prevShort) {
    out.push({
      key: `underlying:${a.vault}`,
      severity: "critical",
      vault: a.vault,
      message: `🔻 Agent ${v}: underlying balance ${fmtXrp(a.underlyingBalanceUBA)} below required ${fmtXrp(a.requiredUnderlyingBalanceUBA)}`,
    });
  }

  return out;
}

function inWarningBand(cr: bigint, min: bigint): boolean {
  return cr < min + CR_WARNING_MARGIN_BIPS;
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
