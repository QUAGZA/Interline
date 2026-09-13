/**
 * Optional testnet helper. Anyone may liquidate or execute post-deadline recovery;
 * this process has no exclusive rights and never holds a user key.
 * It does not provide complete automatic protection: API pages can lag, quotes can
 * drift, venues can be illiquid, settlement can fail, and uneconomic full-debt closes are skipped.
 *
 *   KEEPER_PRIVATE_KEY=0x... RPC_URL=http://127.0.0.1:8545 npm run start -w @interline/keeper
 */
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, http, parseAbiItem, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadV2Manifest, type V2Manifest } from "@interline/protocol";
import { faucetAbi, marketAbi } from "./abi.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKeeperConfig, type KeeperConfig } from "./config.js";
import { liquidateIfUnhealthy } from "./liquidations.js";
import { publicRecallExitIfOpen } from "./recalls.js";
import { recoverDirectIfOpen } from "./recovery.js";
import { sendCall, type TxClients } from "./transactions.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const API_PAGE_CAP = 200;

const borrowedEvent = parseAbiItem(
  "event Borrowed(address indexed owner, uint256 assets, uint256 shares, address destination, uint256 debtAfter)",
);

type PositionRow = { market: Address; owner: Address };

function chainOf(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: chainId === 31337 ? "Anvil" : `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

async function pageJson<T>(
  apiUrl: string,
  path: string,
  query: Record<string, string>,
): Promise<{ items: T[]; ok: boolean }> {
  const items: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let ok = false;
  do {
    const url = new URL(path, `${apiUrl.replace(/\/$/, "")}/`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) return { items, ok };
    ok = true;
    const body = (await res.json()) as {
      positions?: T[];
      items?: T[];
      facilities?: T[];
      nextCursor?: string | null;
    };
    const page = body.positions ?? body.facilities ?? body.items ?? [];
    items.push(...page);
    cursor = body.nextCursor ?? null;
    pages += 1;
  } while (cursor && pages < API_PAGE_CAP);
  return { items, ok };
}

async function positionsFromApi(apiUrl: string, chainId: number): Promise<PositionRow[] | undefined> {
  try {
    const { items, ok } = await pageJson<{ marketAddress?: string; market?: string; owner?: string }>(
      apiUrl,
      "v1/positions",
      { chainId: String(chainId) },
    );
    if (!ok) return undefined;
    const out: PositionRow[] = [];
    for (const row of items) {
      const market = (row.marketAddress ?? row.market) as Address | undefined;
      const owner = row.owner as Address | undefined;
      if (market && owner) out.push({ market, owner });
    }
    return out;
  } catch {
    return undefined;
  }
}

async function facilitiesFromApi(apiUrl: string, chainId: number): Promise<Address[] | undefined> {
  try {
    const { items, ok } = await pageJson<{ facility?: string }>(apiUrl, "v1/direct-facilities", {
      chainId: String(chainId),
    });
    if (!ok) return undefined;
    const out: Address[] = [];
    const seen = new Set<string>();
    for (const row of items) {
      const facility = row.facility as Address | undefined;
      if (!facility || seen.has(facility.toLowerCase())) continue;
      seen.add(facility.toLowerCase());
      out.push(facility);
    }
    return out;
  } catch {
    return undefined;
  }
}

async function ownersFromLogs(clients: TxClients, market: Address, startBlock: bigint): Promise<Address[]> {
  const logs = await clients.publicClient.getLogs({
    address: market,
    event: borrowedEvent,
    fromBlock: startBlock,
    toBlock: "latest",
  });
  const seen = new Set<string>();
  const owners: Address[] = [];
  for (const log of logs) {
    const owner = log.args.owner;
    if (!owner || seen.has(owner.toLowerCase())) continue;
    seen.add(owner.toLowerCase());
    owners.push(owner);
  }
  return owners;
}

async function maybeDrip(clients: TxClients, dryRun: boolean, faucet: Address): Promise<void> {
  try {
    const data = encodeFunctionData({ abi: faucetAbi, functionName: "drip" });
    await sendCall(clients, dryRun, "faucet drip", faucet, data);
  } catch (err) {
    console.warn("faucet drip skipped:", err instanceof Error ? err.message : err);
  }
}

async function tickDirectRecovery(clients: TxClients, cfg: KeeperConfig, manifest: V2Manifest): Promise<void> {
  if (!cfg.apiUrl) return;
  const facilities = await facilitiesFromApi(cfg.apiUrl, manifest.chainId);
  if (!facilities) {
    console.warn("direct recovery discovery skipped: /v1/direct-facilities unavailable");
    return;
  }
  for (const facility of facilities) {
    try {
      await recoverDirectIfOpen(clients, cfg.dryRun, { facility });
    } catch (err) {
      console.warn(`direct recover ${facility} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

async function tick(clients: TxClients, cfg: KeeperConfig, manifest: V2Manifest): Promise<void> {
  const apiPositions = cfg.apiUrl ? await positionsFromApi(cfg.apiUrl, manifest.chainId) : undefined;

  for (const marketRow of manifest.markets) {
    const market = marketRow.address;
    const loanToken = (manifest.loanToken ??
      (await clients.publicClient.readContract({
        address: market,
        abi: marketAbi,
        functionName: "loanToken",
      }))) as Address;
    const deliveryMode = await clients.publicClient.readContract({
      address: market,
      abi: marketAbi,
      functionName: "deliveryMode",
    });
    const vaultFactory = (manifest.vaultFactory ??
      (await clients.publicClient.readContract({
        address: market,
        abi: marketAbi,
        functionName: "vaultFactory",
      }))) as Address;

    let owners: Address[] = [];
    if (apiPositions && apiPositions.length > 0) {
      owners = apiPositions.filter((p) => p.market.toLowerCase() === market.toLowerCase()).map((p) => p.owner);
    }
    if (owners.length === 0) {
      owners = await ownersFromLogs(clients, market, BigInt(manifest.startBlock));
    }

    const recallActive = await clients.publicClient.readContract({
      address: market,
      abi: marketAbi,
      functionName: "recallActive",
    });
    const recallDeadline = await clients.publicClient.readContract({
      address: market,
      abi: marketAbi,
      functionName: "recallDeadline",
    });
    const now = BigInt((await clients.publicClient.getBlock()).timestamp);
    const recallExitOpen = Boolean(recallActive && now > recallDeadline && deliveryMode === 1);

    for (const owner of owners) {
      try {
        await liquidateIfUnhealthy(clients, cfg.dryRun, { market, owner, loanToken });
      } catch (err) {
        console.warn(`liquidate ${owner} failed:`, err instanceof Error ? err.message : err);
      }
      if (recallExitOpen && vaultFactory !== "0x0000000000000000000000000000000000000000") {
        try {
          await publicRecallExitIfOpen(clients, cfg.dryRun, { market, owner, vaultFactory });
        } catch (err) {
          console.warn(`recall-exit ${owner} failed:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }

  await tickDirectRecovery(clients, cfg, manifest);
}

async function main(): Promise<void> {
  const cfg = loadKeeperConfig(REPO_ROOT);
  const chain = chainOf(cfg.chainId, cfg.rpcUrl);
  const account = privateKeyToAccount(cfg.privateKey);
  const transport = http(cfg.rpcUrl);
  const clients: TxClients = {
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
    account,
    chain,
  };

  const manifest = loadV2Manifest(cfg.chainId, REPO_ROOT);
  console.log(
    `keeper ${account.address} chain=${cfg.chainId} dryRun=${cfg.dryRun} markets=${manifest.markets.length} (public liquidate/recall-exit/direct-recover/settleDefault; no exclusive rights; not complete automatic protection)`,
  );
  await maybeDrip(clients, cfg.dryRun, manifest.faucet);

  let inFlight = false;
  const loop = async () => {
    if (inFlight) {
      console.warn("keeper tick skipped: previous tick still in flight");
      return;
    }
    inFlight = true;
    try {
      await tick(clients, cfg, manifest);
    } catch (err) {
      console.error("keeper tick failed:", err instanceof Error ? err.message : err);
    } finally {
      inFlight = false;
    }
  };
  await loop();
  setInterval(() => {
    void loop();
  }, cfg.pollMs);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
