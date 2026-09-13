import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { asAddress, type ChainConfig } from "../domain.js";
import type { IndexerEnv } from "../env.js";

const NAMES: Record<number, string> = {
  31337: "Anvil",
  84532: "Base Sepolia",
  11155111: "Ethereum Sepolia",
};

type ManifestMarket = {
  id: string;
  address: string;
  label: string;
  deliveryMode: "wallet" | "restricted";
  loanSymbol: string;
  collateralSymbol: string;
  oracle?: string;
};

type Manifest = {
  chainId: number;
  factory: string;
  vaultFactory?: string;
  recoveryEscrow?: string;
  lens?: string;
  directFactory?: string;
  directLens?: string;
  startBlock: number;
  oracleMode: "simulated";
  faucet: string;
  markets: ManifestMarket[];
};

function readManifest(dir: string, chainId: number): Manifest | null {
  const path = join(dir, String(chainId), "v2.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function rpcFor(env: IndexerEnv, chainId: number): string | undefined {
  return env.rpcByChain.get(chainId);
}

export function loadChainConfigs(env: IndexerEnv): ChainConfig[] {
  const configs: ChainConfig[] = [];
  const seen = new Set<number>();

  const tryChain = (chainId: number) => {
    if (seen.has(chainId)) return;
    const rpcUrl = rpcFor(env, chainId);
    if (!rpcUrl) return;
    const manifest = readManifest(env.deploymentsDir, chainId);
    if (manifest) {
      seen.add(chainId);
      configs.push({
        chainId,
        name: NAMES[chainId] ?? `chain-${chainId}`,
        rpcUrl,
        factory: asAddress(manifest.factory),
        vaultFactory: manifest.vaultFactory ? asAddress(manifest.vaultFactory) : env.vaultFactoryAddress ?? null,
        recoveryEscrow: manifest.recoveryEscrow ? asAddress(manifest.recoveryEscrow) : env.recoveryEscrowAddress ?? null,
        lens: manifest.lens ? asAddress(manifest.lens) : env.lensAddress ?? null,
        startBlock: BigInt(manifest.startBlock),
        oracleMode: "simulated",
        faucet: asAddress(manifest.faucet),
        directFactory: manifest.directFactory ? asAddress(manifest.directFactory) : null,
        directLens: manifest.directLens ? asAddress(manifest.directLens) : null,
        markets: manifest.markets.map((m) => ({
          id: m.id,
          address: asAddress(m.address),
          label: m.label,
          deliveryMode: m.deliveryMode,
          loanSymbol: m.loanSymbol,
          collateralSymbol: m.collateralSymbol,
          oracle: m.oracle ? asAddress(m.oracle) : null,
        })),
      });
      return;
    }
    if (env.chainId === chainId && env.factoryAddress && env.startBlock !== undefined) {
      seen.add(chainId);
      configs.push({
        chainId,
        name: NAMES[chainId] ?? `chain-${chainId}`,
        rpcUrl,
        factory: env.factoryAddress,
        vaultFactory: env.vaultFactoryAddress ?? null,
        recoveryEscrow: env.recoveryEscrowAddress ?? null,
        lens: env.lensAddress ?? null,
        startBlock: env.startBlock,
        oracleMode: "simulated",
        faucet: null,
        directFactory: null,
        directLens: null,
        markets: [],
      });
    }
  };

  if (env.chainId) tryChain(env.chainId);
  tryChain(31337);
  tryChain(84532);
  tryChain(11155111);
  return configs;
}

export function chainName(chainId: number): string {
  return NAMES[chainId] ?? `chain-${chainId}`;
}
