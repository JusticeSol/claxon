import type { Address } from "viem";
import { client, assetManagerAbi, getAssetManagerAddress } from "@/lib/flare";
import { AGENT_STATUS } from "@/config";

export interface AgentSnapshot {
  vault: Address;
  status: number; // index into AGENT_STATUS
  statusName: (typeof AGENT_STATUS)[number];
  publiclyAvailable: boolean;
  underlyingAddress: string;
  // Collateral health (BIPS: 10000 = 100%)
  vaultCrBips: bigint;
  poolCrBips: bigint;
  minVaultCrBips: bigint;
  minPoolCrBips: bigint;
  // Liquidation
  liquidationStartTimestamp: bigint;
  maxLiquidationAmountUBA: bigint;
  liquidationPaymentFactorVaultBips: bigint;
  liquidationPaymentFactorPoolBips: bigint;
  // Underlying backing
  underlyingBalanceUBA: bigint; // int256 — can go negative
  requiredUnderlyingBalanceUBA: bigint;
  freeUnderlyingBalanceUBA: bigint; // int256
  // Exposure
  mintedUBA: bigint;
  redeemingUBA: bigint;
  freeCollateralLots: bigint;
}

export interface SystemSnapshot {
  blockNumber: bigint;
  assetManager: Address;
  emergencyPaused: boolean;
  mintingPaused: boolean;
  agents: AgentSnapshot[];
}

const PAGE = 50n;

export async function fetchSystemSnapshot(): Promise<SystemSnapshot> {
  const assetManager = await getAssetManagerAddress();
  const blockNumber = await client.getBlockNumber();

  const [emergencyPaused, mintingPaused] = await Promise.all([
    client.readContract({
      address: assetManager,
      abi: assetManagerAbi,
      functionName: "emergencyPaused",
    }) as Promise<boolean>,
    client.readContract({
      address: assetManager,
      abi: assetManagerAbi,
      functionName: "mintingPaused",
    }) as Promise<boolean>,
  ]);

  // getAllAgents(start, end) -> (address[] agents, uint256 totalLength)
  const vaults: Address[] = [];
  for (let start = 0n; ; start += PAGE) {
    const [page, total] = (await client.readContract({
      address: assetManager,
      abi: assetManagerAbi,
      functionName: "getAllAgents",
      args: [start, start + PAGE],
    })) as [Address[], bigint];
    vaults.push(...page);
    if (start + PAGE >= total) break;
  }

  const agents = await Promise.all(
    vaults.map((vault) => fetchAgent(assetManager, vault))
  );

  return { blockNumber, assetManager, emergencyPaused, mintingPaused, agents };
}

async function fetchAgent(
  assetManager: Address,
  vault: Address
): Promise<AgentSnapshot> {
  const [info, minVaultCrBips, minPoolCrBips] = await Promise.all([
    client.readContract({
      address: assetManager,
      abi: assetManagerAbi,
      functionName: "getAgentInfo",
      args: [vault],
    }) as Promise<any>,
    client.readContract({
      address: assetManager,
      abi: assetManagerAbi,
      functionName: "getAgentMinVaultCollateralRatioBIPS",
      args: [vault],
    }) as Promise<bigint>,
    client.readContract({
      address: assetManager,
      abi: assetManagerAbi,
      functionName: "getAgentMinPoolCollateralRatioBIPS",
      args: [vault],
    }) as Promise<bigint>,
  ]);

  const status = Number(info.status);
  return {
    vault,
    status,
    statusName: AGENT_STATUS[status] ?? "NORMAL",
    publiclyAvailable: info.publiclyAvailable,
    underlyingAddress: info.underlyingAddressString,
    vaultCrBips: BigInt(info.vaultCollateralRatioBIPS),
    poolCrBips: BigInt(info.poolCollateralRatioBIPS),
    minVaultCrBips,
    minPoolCrBips,
    liquidationStartTimestamp: BigInt(info.liquidationStartTimestamp),
    maxLiquidationAmountUBA: BigInt(info.maxLiquidationAmountUBA),
    liquidationPaymentFactorVaultBips: BigInt(
      info.liquidationPaymentFactorVaultBIPS
    ),
    liquidationPaymentFactorPoolBips: BigInt(
      info.liquidationPaymentFactorPoolBIPS
    ),
    underlyingBalanceUBA: BigInt(info.underlyingBalanceUBA),
    requiredUnderlyingBalanceUBA: BigInt(info.requiredUnderlyingBalanceUBA),
    freeUnderlyingBalanceUBA: BigInt(info.freeUnderlyingBalanceUBA),
    mintedUBA: BigInt(info.mintedUBA),
    redeemingUBA: BigInt(info.redeemingUBA),
    freeCollateralLots: BigInt(info.freeCollateralLots),
  };
}

/** FXRP has 6 decimals (drops). Format UBA amounts for messages. */
export function fmtXrp(uba: bigint): string {
  const neg = uba < 0n;
  const abs = neg ? -uba : uba;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${neg ? "-" : ""}${whole}.${frac} XRP`;
}

export function fmtCr(bips: bigint): string {
  return `${(Number(bips) / 100).toFixed(1)}%`;
}
