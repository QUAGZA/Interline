import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DeliveryMode = "wallet" | "restricted";

export type V2Market = {
  id: string;
  address: `0x${string}`;
  label: string;
  deliveryMode: DeliveryMode;
  loanSymbol: string;
  collateralSymbol: string;
  oracle?: `0x${string}`;
};

export type V2Manifest = {
  chainId: 31337 | 84532;
  factory: `0x${string}`;
  vaultFactory?: `0x${string}`;
  recoveryEscrow?: `0x${string}`;
  lens?: `0x${string}`;
  startBlock: number;
  oracleMode: "simulated";
  faucet: `0x${string}`;
  loanToken?: `0x${string}`;
  collateralToken?: `0x${string}`;
  swapRouter?: `0x${string}`;
  venue?: `0x${string}`;
  curator?: `0x${string}`;
  guardian?: `0x${string}`;
  markets: V2Market[];
};

export function manifestPath(chainId: number, root = process.cwd()): string {
  return resolve(root, "deployments", String(chainId), "v2.json");
}

export function loadV2Manifest(chainId: number, root = process.cwd()): V2Manifest {
  const path = manifestPath(chainId, root);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Deploy V2 (script/DeployV2Local.s.sol or DeployV2Testnet.s.sol) first.`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as V2Manifest;
  if (parsed.chainId !== chainId) {
    throw new Error(`Manifest chainId ${parsed.chainId} != requested ${chainId}`);
  }
  if (parsed.oracleMode !== "simulated") {
    throw new Error(`Unexpected oracleMode ${parsed.oracleMode}; V2 testnet manifests are simulated.`);
  }
  if (!Array.isArray(parsed.markets) || parsed.markets.length < 2) {
    throw new Error("V2 manifest must list at least two markets (wallet + restricted).");
  }
  return parsed;
}
