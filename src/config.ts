export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 14);

export const RPC_URL =
  process.env.FLARE_RPC_URL ??
  (CHAIN_ID === 114
    ? "https://coston2-api.flare.network/ext/C/rpc"
    : "https://flare-api.flare.network/ext/C/rpc");

// FlareContractRegistry lives at the same address on every Flare network.
export const CONTRACT_REGISTRY =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as const;

// Registry name of the FXRP asset manager (see flare-periphery artifacts "products").
export const ASSET_MANAGER_NAME = "AssetManagerFXRP";

// Early-warning band: alert when CR is within this margin of the enforced minimum.
export const CR_WARNING_MARGIN_BIPS = BigInt(
  process.env.CR_WARNING_MARGIN_BIPS ?? 2000
);

// Claxon polls every 5 minutes. Four consecutive misses means something is
// actually broken rather than a single slow run, so treat >20 min as offline.
export const STALE_AFTER_MS = Number(process.env.STALE_AFTER_MS ?? 20 * 60 * 1000);

export const AGENT_STATUS = [
  "NORMAL",
  "LIQUIDATION",
  "FULL_LIQUIDATION",
  "DESTROYING",
  "DESTROYED",
] as const;
// Source: flare-foundation/fassets contracts/userInterfaces/data/AgentInfo.sol
