import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createPublicClient, http, type Address, type Hex } from "viem";

if (process.env.PRIVATE_KEY) {
  console.error("Refusing to start: PRIVATE_KEY is set");
  process.exit(1);
}

function loadEnvFile(path: string) {
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

loadEnvFile(resolve(process.cwd(), "../.env"));
loadEnvFile(resolve(process.cwd(), ".env"));

if (process.env.PRIVATE_KEY) {
  console.error("Refusing to start: PRIVATE_KEY is set");
  process.exit(1);
}

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const port = Number(process.env.INDEXER_PORT ?? "8787");
const line = process.env.CREDIT_LINE_ADDRESS as Address | undefined;
const vault = process.env.VAULT_ADDRESS as Address | undefined;
const usdc = process.env.USDC_ADDRESS as Address | undefined;
const target = process.env.MOCK_TARGET_ADDRESS as Address | undefined;

const lineAbi = [
  { type: "function", name: "cap", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "drawn", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "utilizationBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "potBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "drawsPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "recallDeadline", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "recallActive", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  {
    type: "event",
    name: "Deposited",
    inputs: [{ name: "amount", type: "uint256", indexed: false }],
  },
  {
    type: "event",
    name: "Drawn",
    inputs: [
      { name: "amount", type: "uint256", indexed: false },
      { name: "drawnAfter", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Repaid",
    inputs: [
      { name: "amount", type: "uint256", indexed: false },
      { name: "drawnAfter", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CapProposed",
    inputs: [
      { name: "hash", type: "bytes32", indexed: true },
      { name: "by", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "CapApproved",
    inputs: [
      { name: "hash", type: "bytes32", indexed: true },
      { name: "by", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "CapChanged",
    inputs: [
      { name: "oldCap", type: "uint256", indexed: false },
      { name: "newCap", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Panicked",
    inputs: [
      { name: "by", type: "address", indexed: true },
      { name: "recallDeadline", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RecallStarted",
    inputs: [{ name: "deadline", type: "uint256", indexed: false }],
  },
  {
    type: "event",
    name: "PausedDraws",
    inputs: [{ name: "paused", type: "bool", indexed: false }],
  },
] as const;

const vaultAbi = [
  {
    type: "function",
    name: "exposure",
    stateMutability: "view",
    inputs: [{ name: "target", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "EnteredTarget",
    inputs: [
      { name: "target", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ExitedTarget",
    inputs: [
      { name: "target", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SwapExecuted",
    inputs: [
      { name: "tokenOut", type: "address", indexed: true },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BlockedSwap",
    inputs: [
      { name: "tokenOut", type: "address", indexed: true },
      { name: "amountIn", type: "uint256", indexed: false },
    ],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const client = createPublicClient({ transport: http(rpcUrl) });

type LineCache = { at: number; body: unknown };
let lineCache: LineCache | null = null;
const TTL_MS = 2000;

async function readLine() {
  if (!line || !vault || !usdc || !target) {
    return { error: "missing CREDIT_LINE_ADDRESS / VAULT_ADDRESS / USDC_ADDRESS / MOCK_TARGET_ADDRESS" };
  }
  const [cap, drawn, util, pot, paused, deadline, active, vaultIdle, exposure] = await Promise.all([
    client.readContract({ address: line, abi: lineAbi, functionName: "cap" }),
    client.readContract({ address: line, abi: lineAbi, functionName: "drawn" }),
    client.readContract({ address: line, abi: lineAbi, functionName: "utilizationBps" }),
    client.readContract({ address: line, abi: lineAbi, functionName: "potBalance" }),
    client.readContract({ address: line, abi: lineAbi, functionName: "drawsPaused" }),
    client.readContract({ address: line, abi: lineAbi, functionName: "recallDeadline" }),
    client.readContract({ address: line, abi: lineAbi, functionName: "recallActive" }),
    client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [vault] }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: "exposure", args: [target] }),
  ]);
  return {
    cap: cap.toString(),
    drawn: drawn.toString(),
    utilizationBps: util.toString(),
    pot: pot.toString(),
    vaultIdle: vaultIdle.toString(),
    drawsPaused: paused,
    recallDeadline: deadline.toString(),
    recallActive: active,
    exposures: [{ target, usdc: exposure.toString() }],
  };
}

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.get("/line", async (c) => {
  const now = Date.now();
  if (lineCache && now - lineCache.at < TTL_MS) return c.json(lineCache.body);
  const body = await readLine();
  lineCache = { at: now, body };
  return c.json(body);
});

app.get("/events", async (c) => {
  if (!line || !vault) return c.json({ error: "missing addresses" }, 400);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "15")));
  const [lineLogs, vaultLogs] = await Promise.all([
    client.getContractEvents({ address: line, abi: lineAbi, fromBlock: 0n, toBlock: "latest" }),
    client.getContractEvents({ address: vault, abi: vaultAbi, fromBlock: 0n, toBlock: "latest" }),
  ]);
  const events = [...lineLogs, ...vaultLogs]
    .sort((a, b) => {
      const bd = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
      if (bd !== 0) return bd;
      return (a.logIndex ?? 0) - (b.logIndex ?? 0);
    })
    .slice(-limit)
    .reverse()
    .map((log) => ({
      event: log.eventName,
      block: (log.blockNumber ?? 0n).toString(),
      tx: log.transactionHash as Hex | undefined,
      args: Object.fromEntries(
        Object.entries((log.args ?? {}) as Record<string, unknown>).map(([k, v]) => [
          k,
          typeof v === "bigint" ? v.toString() : v,
        ]),
      ),
    }));
  return c.json({ events });
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`interline indexer listening on :${port} (read-only)`);
});
