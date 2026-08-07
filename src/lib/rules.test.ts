/**
 * Rules engine tests — pure functions, no network, no credentials.
 *   npm test
 *
 * These cover the property the whole product depends on: alerts are
 * EDGE-triggered. A condition that is merely *true* must stay silent; only a
 * condition that *became* true may fire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./rules";
import type { AgentSnapshot, SystemSnapshot } from "./agents";

const VAULT = "0x1111111111111111111111111111111111111111" as const;

// A healthy agent: CR comfortably above the minimum, backing fully covered.
function agent(over: Partial<AgentSnapshot> = {}): AgentSnapshot {
  return {
    vault: VAULT,
    status: 0,
    statusName: "NORMAL",
    publiclyAvailable: true,
    underlyingAddress: "rTest",
    vaultCrBips: 30000n, // 300%
    poolCrBips: 30000n,
    minVaultCrBips: 12000n, // 120%
    minPoolCrBips: 15000n, // 150%
    liquidationStartTimestamp: 0n,
    maxLiquidationAmountUBA: 0n,
    liquidationPaymentFactorVaultBips: 0n,
    liquidationPaymentFactorPoolBips: 0n,
    underlyingBalanceUBA: 1000n,
    requiredUnderlyingBalanceUBA: 1000n,
    freeUnderlyingBalanceUBA: 0n,
    mintedUBA: 1000n,
    redeemingUBA: 0n,
    freeCollateralLots: 5n,
    ...over,
  };
}

function system(agents: AgentSnapshot[], over: Partial<SystemSnapshot> = {}): SystemSnapshot {
  return {
    blockNumber: 1n,
    assetManager: "0x2222222222222222222222222222222222222222",
    emergencyPaused: false,
    mintingPaused: false,
    agents,
    ...over,
  };
}

const keys = (s: SystemSnapshot, p: SystemSnapshot | null) => evaluate(s, p).map((a) => a.key);

// ---------------------------------------------------------------- healthy

test("healthy agents produce no alerts", () => {
  const s = system([agent()]);
  assert.deepEqual(evaluate(s, s), []);
});

test("healthy agent on cold start produces no alerts", () => {
  assert.deepEqual(evaluate(system([agent()]), null), []);
});

// ------------------------------------------------------------ liquidation

test("NORMAL -> LIQUIDATION fires a critical alert", () => {
  const prev = system([agent()]);
  const curr = system([agent({ status: 1, statusName: "LIQUIDATION" })]);
  const alerts = evaluate(curr, prev);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "critical");
  assert.match(alerts[0].message, /LIQUIDATION/);
});

test("agent already in liquidation does NOT re-fire (edge-triggered)", () => {
  const inLiq = system([agent({ status: 1, statusName: "LIQUIDATION" })]);
  assert.deepEqual(evaluate(inLiq, inLiq), []);
});

test("agent found already in liquidation on cold start fires once", () => {
  const inLiq = system([agent({ status: 1, statusName: "LIQUIDATION" })]);
  assert.deepEqual(keys(inLiq, null), [`status:${VAULT}:1`]);
});

test("recovery LIQUIDATION -> NORMAL reports as info, not critical", () => {
  const prev = system([agent({ status: 1, statusName: "LIQUIDATION" })]);
  const curr = system([agent()]);
  const alerts = evaluate(curr, prev);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "info");
});

// ------------------------------------------------------- collateral ratio

test("vault CR entering the warning band fires exactly once", () => {
  const healthy = system([agent()]);
  // default margin 2000 bips -> band is CR < 12000 + 2000 = 14000
  const slipping = system([agent({ vaultCrBips: 13000n })]);

  assert.deepEqual(keys(slipping, healthy), [`cr-vault:${VAULT}`]);
  // still in the band on the next poll: must stay silent
  assert.deepEqual(evaluate(slipping, slipping), []);
});

test("CR just outside the warning band stays silent", () => {
  const healthy = system([agent()]);
  const edge = system([agent({ vaultCrBips: 14000n })]); // exactly min+margin, not inside
  assert.deepEqual(evaluate(edge, healthy), []);
});

test("pool CR is evaluated independently of vault CR", () => {
  const healthy = system([agent()]);
  const poolSlipping = system([agent({ poolCrBips: 16000n })]); // < 15000 + 2000
  assert.deepEqual(keys(poolSlipping, healthy), [`cr-pool:${VAULT}`]);
});

test("CR recovering then slipping again re-fires", () => {
  const healthy = system([agent()]);
  const slipping = system([agent({ vaultCrBips: 13000n })]);
  assert.equal(evaluate(slipping, healthy).length, 1);
  assert.equal(evaluate(healthy, slipping).length, 0); // recovery is silent
  assert.equal(evaluate(slipping, healthy).length, 1); // slips again -> fires again
});

// ---------------------------------------------------- liquidation opportunity

test("liquidation opportunity fires when the amount appears", () => {
  const before = system([agent()]);
  const open = system([
    agent({ maxLiquidationAmountUBA: 500n, liquidationPaymentFactorVaultBips: 11000n }),
  ]);
  const alerts = evaluate(open, before);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "opportunity");
  assert.match(alerts[0].message, /10\.0% vault-collateral premium/);
});

test("liquidation opportunity does not re-fire while it stays open", () => {
  const open = system([agent({ maxLiquidationAmountUBA: 500n })]);
  assert.deepEqual(evaluate(open, open), []);
});

// -------------------------------------------------------- underlying backing

test("underlying shortfall fires once when backing drops below required", () => {
  const ok = system([agent()]);
  const short = system([agent({ underlyingBalanceUBA: 900n, requiredUnderlyingBalanceUBA: 1000n })]);
  assert.deepEqual(keys(short, ok), [`underlying:${VAULT}`]);
  assert.deepEqual(evaluate(short, short), []);
});

test("negative underlying balance is handled (int256 can go below zero)", () => {
  const ok = system([agent()]);
  const negative = system([agent({ underlyingBalanceUBA: -50n })]);
  assert.deepEqual(keys(negative, ok), [`underlying:${VAULT}`]);
});

// ------------------------------------------------------------------ system

test("emergency pause fires once", () => {
  const normal = system([agent()]);
  const paused = system([agent()], { emergencyPaused: true });
  assert.deepEqual(keys(paused, normal), ["system:emergency-pause"]);
  assert.deepEqual(evaluate(paused, paused), []);
});

test("minting pause fires as a warning, separately from emergency pause", () => {
  const normal = system([agent()]);
  const paused = system([agent()], { mintingPaused: true });
  const alerts = evaluate(paused, normal);
  assert.deepEqual(alerts.map((a) => a.key), ["system:minting-pause"]);
  assert.equal(alerts[0].severity, "warning");
});

test("system pause on cold start fires (prev is null)", () => {
  const paused = system([agent()], { emergencyPaused: true });
  assert.deepEqual(keys(paused, null), ["system:emergency-pause"]);
});

// ------------------------------------------------------------- multi-agent

test("a new agent appearing is treated as cold start for that agent only", () => {
  const a2 = "0x3333333333333333333333333333333333333333" as const;
  const prev = system([agent()]);
  const curr = system([agent(), agent({ vault: a2, status: 1, statusName: "LIQUIDATION" })]);
  assert.deepEqual(keys(curr, prev), [`status:${a2}:1`]);
});

test("alert keys are stable per agent so dedupe can rely on them", () => {
  const healthy = system([agent()]);
  const slipping = system([agent({ vaultCrBips: 13000n })]);
  assert.deepEqual(keys(slipping, healthy), keys(slipping, healthy));
});
