import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Hex } from "viem";

export type KeeperConfig = {
  rpcUrl: string;
  chainId: number;
  privateKey: Hex;
  pollMs: number;
  dryRun: boolean;
  apiUrl: string | undefined;
  manifestRoot: string;
};

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key === "PRIVATE_KEY" || key === "BORROWER_PRIVATE_KEY") continue;
    const value = line.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function requireHexKey(value: string | undefined, label: string): Hex {
  if (!value) {
    throw new Error(`${label} is required. The keeper uses its own funded key and never user keys.`);
  }
  const v = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
    throw new Error(`${label} must be a 32-byte hex private key.`);
  }
  return v as Hex;
}

export function loadKeeperConfig(root = process.cwd()): KeeperConfig {
  loadEnvFile(resolve(root, ".env"));
  loadEnvFile(resolve(root, "keeper/.env"));

  if (process.env.BORROWER_PRIVATE_KEY) {
    console.warn("keeper: ignoring BORROWER_PRIVATE_KEY (participant keys are not used)");
  }
  if (process.env.PRIVATE_KEY && !process.env.KEEPER_PRIVATE_KEY) {
    throw new Error(
      "keeper refuses PRIVATE_KEY. Set KEEPER_PRIVATE_KEY to a dedicated funded key with no exclusive liquidation rights.",
    );
  }

  return {
    rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8545",
    chainId: Number(process.env.CHAIN_ID ?? "31337"),
    privateKey: requireHexKey(process.env.KEEPER_PRIVATE_KEY, "KEEPER_PRIVATE_KEY"),
    pollMs: Number(process.env.KEEPER_POLL_MS ?? "15000"),
    dryRun: process.env.KEEPER_DRY_RUN === "1" || process.env.KEEPER_DRY_RUN === "true",
    apiUrl: process.env.API_URL || process.env.INDEXER_URL || undefined,
    manifestRoot: root,
  };
}
