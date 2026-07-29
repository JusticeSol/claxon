// Local dry-run: npm run poll
// Reads the chain, prints snapshot + cold-start alerts, sends nothing.
import { fetchSystemSnapshot, fmtCr } from "../src/lib/agents";
import { evaluate } from "../src/lib/rules";

async function main() {
  const s = await fetchSystemSnapshot();
  console.log(`block ${s.blockNumber} — ${s.agents.length} agents — emergencyPaused=${s.emergencyPaused}`);
  for (const a of s.agents) {
    console.log(
      ` ${a.statusName.padEnd(16)} ${a.vault} vaultCR ${fmtCr(a.vaultCrBips)}/min ${fmtCr(a.minVaultCrBips)} poolCR ${fmtCr(a.poolCrBips)}/min ${fmtCr(a.minPoolCrBips)}`
    );
  }
  console.log("\nAlerts on cold start:");
  for (const alert of evaluate(s, null)) console.log(" -", alert.severity, alert.message);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
