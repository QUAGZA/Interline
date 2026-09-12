import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const FORBIDDEN_ENV = ["PRIVATE_KEY", "BORROWER_PRIVATE_KEY"] as const;

export const ALLOWED_ENV = [
  "DATABASE_URL",
  "RPC_URL",
  "RPC_URL_31337",
  "RPC_URL_84532",
  "CHAIN_ID",
  "INDEXER_PORT",
  "INDEXER_POLL_MS",
  "INDEXER_MAX_BLOCK_RANGE",
  "INDEXER_REORG_DEPTH",
  "DEPLOYMENTS_DIR",
  "FACTORY_ADDRESS",
  "START_BLOCK",
  "VAULT_FACTORY_ADDRESS",
  "RECOVERY_ESCROW_ADDRESS",
  "LENS_ADDRESS",
  "LOG_LEVEL",
  "NODE_ENV",
] as const;

export type AllowedEnvKey = (typeof ALLOWED_ENV)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_ENV);

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "foundry.toml")) && existsSync(join(dir, "compose.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function assertNoSigningKeys(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of FORBIDDEN_ENV) {
    const value = env[key];
    if (value !== undefined && value.trim() !== "") {
      throw new EnvError(`Refusing to start: ${key} is set`);
    }
  }
}

/** Copy allowlisted keys from files into process.env without overriding existing values. */
export function loadAllowlistedEnv(options?: { cwd?: string; repoRoot?: string }): void {
  assertNoSigningKeys();
  const cwd = options?.cwd ?? process.cwd();
  const repoRoot = options?.repoRoot ?? findRepoRoot(cwd);
  const files = [join(repoRoot, ".env"), join(cwd, ".env")];
  for (const file of files) {
    const parsed = parseEnvFile(file);
    for (const [key, value] of Object.entries(parsed)) {
      if (!ALLOWED_SET.has(key)) continue;
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  assertNoSigningKeys();
}

export type IndexerEnv = {
  databaseUrl: string;
  port: number;
  pollMs: number;
  maxBlockRange: number;
  reorgDepth: number;
  deploymentsDir: string;
  repoRoot: string;
  rpcUrl: string;
  rpcByChain: Map<number, string>;
  chainId: number | undefined;
  factoryAddress: `0x${string}` | undefined;
  startBlock: bigint | undefined;
  vaultFactoryAddress: `0x${string}` | undefined;
  recoveryEscrowAddress: `0x${string}` | undefined;
  lensAddress: `0x${string}` | undefined;
};

function optionalAddress(value: string | undefined): `0x${string}` | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new EnvError(`Invalid address: ${v}`);
  }
  return v as `0x${string}`;
}

export function readIndexerEnv(env: NodeJS.ProcessEnv = process.env): IndexerEnv {
  assertNoSigningKeys(env);
  const repoRoot = findRepoRoot();
  const rpcUrl = env.RPC_URL ?? "http://127.0.0.1:8545";
  const rpcByChain = new Map<number, string>();
  rpcByChain.set(31337, env.RPC_URL_31337 ?? (env.CHAIN_ID === "84532" ? rpcUrl : rpcUrl));
  if (env.RPC_URL_84532) rpcByChain.set(84532, env.RPC_URL_84532);
  else if (env.CHAIN_ID === "84532") rpcByChain.set(84532, rpcUrl);
  if (env.RPC_URL_31337) rpcByChain.set(31337, env.RPC_URL_31337);
  else if (env.CHAIN_ID !== "84532") rpcByChain.set(31337, rpcUrl);

  const chainIdRaw = env.CHAIN_ID;
  const chainId = chainIdRaw ? Number(chainIdRaw) : undefined;
  if (chainIdRaw && (!Number.isInteger(chainId) || (chainId !== 31337 && chainId !== 84532))) {
    throw new EnvError(`Unsupported CHAIN_ID: ${chainIdRaw}`);
  }

  const startBlockRaw = env.START_BLOCK;
  const startBlock = startBlockRaw !== undefined && startBlockRaw !== "" ? BigInt(startBlockRaw) : undefined;

  return {
    databaseUrl: env.DATABASE_URL ?? "postgres://interline:interline@127.0.0.1:5432/interline",
    port: Number(env.INDEXER_PORT ?? "8787"),
    pollMs: Number(env.INDEXER_POLL_MS ?? "2000"),
    maxBlockRange: Number(env.INDEXER_MAX_BLOCK_RANGE ?? "2000"),
    reorgDepth: Number(env.INDEXER_REORG_DEPTH ?? "64"),
    deploymentsDir: env.DEPLOYMENTS_DIR ?? join(repoRoot, "deployments"),
    repoRoot,
    rpcUrl,
    rpcByChain,
    chainId,
    factoryAddress: optionalAddress(env.FACTORY_ADDRESS),
    startBlock,
    vaultFactoryAddress: optionalAddress(env.VAULT_FACTORY_ADDRESS),
    recoveryEscrowAddress: optionalAddress(env.RECOVERY_ESCROW_ADDRESS),
    lensAddress: optionalAddress(env.LENS_ADDRESS),
  };
}

export function loadIndexerEnv(): IndexerEnv {
  loadAllowlistedEnv();
  const cfg = readIndexerEnv();
  if (!Number.isFinite(cfg.port) || cfg.port <= 0) throw new EnvError("Invalid INDEXER_PORT");
  if (!Number.isFinite(cfg.pollMs) || cfg.pollMs < 200) throw new EnvError("Invalid INDEXER_POLL_MS");
  if (!Number.isFinite(cfg.maxBlockRange) || cfg.maxBlockRange <= 0) {
    throw new EnvError("Invalid INDEXER_MAX_BLOCK_RANGE");
  }
  if (!Number.isFinite(cfg.reorgDepth) || cfg.reorgDepth <= 0) throw new EnvError("Invalid INDEXER_REORG_DEPTH");
  return cfg;
}
