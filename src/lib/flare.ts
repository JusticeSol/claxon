import { createPublicClient, http, parseAbi, type Address } from "viem";
import { flare, flareTestnet } from "viem/chains";
// The artifact JSON *is* the ABI array for this package.
import assetManagerAbiJson from "@flarenetwork/flare-periphery-contract-artifacts/flare/artifacts/contracts/IAssetManager.sol/IAssetManager.json";
import { CHAIN_ID, RPC_URL, CONTRACT_REGISTRY, ASSET_MANAGER_NAME } from "@/config";

export const assetManagerAbi = assetManagerAbiJson as any;

export const client = createPublicClient({
  chain: CHAIN_ID === 114 ? flareTestnet : flare,
  transport: http(RPC_URL),
});

const registryAbi = parseAbi([
  "function getContractAddressByName(string _name) view returns (address)",
]);

let cached: Address | null = null;

export async function getAssetManagerAddress(): Promise<Address> {
  const override = process.env.ASSET_MANAGER_ADDRESS;
  if (override) return override as Address;
  if (cached) return cached;
  cached = (await client.readContract({
    address: CONTRACT_REGISTRY,
    abi: registryAbi,
    functionName: "getContractAddressByName",
    args: [ASSET_MANAGER_NAME],
  })) as Address;
  if (!cached || cached === "0x0000000000000000000000000000000000000000") {
    throw new Error("Registry returned zero address for " + ASSET_MANAGER_NAME);
  }
  return cached;
}
