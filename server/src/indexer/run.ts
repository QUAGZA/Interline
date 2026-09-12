import { createPublicClient, http, type Address, type PublicClient } from "viem";
import type { ChainConfig, CursorRecord, Hex } from "../domain.js";
import type { IndexerEnv } from "../env.js";
import type { IndexerStore } from "../db/store.js";
import { applyEvent, derivedFromRecords, flattenDerived } from "./apply.js";
import { allEventAbis } from "./abis.js";
import { decodeLog } from "./decode.js";
import { hydrateMarketFromChain, hydratePositionFromChain } from "./hydrate.js";
import { findCommonAncestor, rollbackToBlock } from "./reorg.js";

function isoNow(): string {
  return new Date().toISOString();
}

function watchedAddresses(config: ChainConfig, extra: Address[]): Address[] {
  const set = new Set<string>();
  if (config.factory) set.add(config.factory.toLowerCase());
  if (config.vaultFactory) set.add(config.vaultFactory.toLowerCase());
  if (config.recoveryEscrow) set.add(config.recoveryEscrow.toLowerCase());
  for (const m of config.markets) set.add(m.address.toLowerCase());
  for (const a of extra) set.add(a.toLowerCase());
  return [...set] as Address[];
}

async function ensureCursor(store: IndexerStore, config: ChainConfig): Promise<CursorRecord> {
  const existing = await store.getCursor(config.chainId);
  if (existing) return existing;
  const initial: CursorRecord = {
    chainId: config.chainId,
    startBlock: config.startBlock,
    lastBlock: config.startBlock === 0n ? -1n : config.startBlock - 1n,
    lastHash: null,
    lastTimestamp: 0n,
    headBlock: 0n,
    lastError: null,
    updatedAt: isoNow(),
  };
  await store.upsertCursor(initial);
  return initial;
}

export async function indexOnce(args: {
  store: IndexerStore;
  config: ChainConfig;
  env: IndexerEnv;
  client: PublicClient;
}): Promise<CursorRecord> {
  const { store, config, env, client } = args;
  await store.seedMarkets(config);
  let cursor = await ensureCursor(store, config);

  const head = await client.getBlockNumber();
  cursor = { ...cursor, headBlock: head, updatedAt: isoNow() };

  if (cursor.lastBlock >= config.startBlock) {
    const onchain = await client.getBlock({ blockNumber: cursor.lastBlock });
    const storedHash = cursor.lastHash ?? (await store.getBlockHash(config.chainId, cursor.lastBlock));
    if (storedHash && onchain.hash.toLowerCase() !== storedHash.toLowerCase()) {
      const ancestor = await findCommonAncestor({
        store,
        chainId: config.chainId,
        startBlock: config.startBlock,
        fromBlock: cursor.lastBlock,
        reorgDepth: env.reorgDepth,
        getHash: async (n) => {
          const b = await client.getBlock({ blockNumber: n });
          return b.hash as Hex;
        },
      });
      await rollbackToBlock(store, config, ancestor);
      cursor = {
        ...cursor,
        lastBlock: ancestor,
        lastHash: ancestor < config.startBlock ? null : ((await store.getBlockHash(config.chainId, ancestor)) ?? null),
        lastError: `reorg rollback to ${ancestor.toString()}`,
        updatedAt: isoNow(),
      };
      await store.upsertCursor(cursor);
    }
  }

  let from = cursor.lastBlock + 1n;
  if (from < config.startBlock) from = config.startBlock;
  if (from > head) {
    cursor = { ...cursor, headBlock: head, lastError: null, updatedAt: isoNow() };
    await store.upsertCursor(cursor);
    return cursor;
  }
  let to = from + BigInt(env.maxBlockRange) - 1n;
  if (to > head) to = head;

  const markets = await store.listMarkets(config.chainId);
  const vaults = await store.listVaults(config.chainId);
  const extra = [...markets.map((m) => m.address), ...vaults.map((v) => v.vault)] as Address[];
  const addresses = watchedAddresses(config, extra);

  const startBlock = await client.getBlock({ blockNumber: from });
  const endBlock = to === from ? startBlock : await client.getBlock({ blockNumber: to });
  await store.putBlock({
    chainId: config.chainId,
    blockNumber: from,
    blockHash: startBlock.hash as Hex,
    parentHash: startBlock.parentHash as Hex,
    timestamp: startBlock.timestamp,
  });
  await store.putBlock({
    chainId: config.chainId,
    blockNumber: to,
    blockHash: endBlock.hash as Hex,
    parentHash: endBlock.parentHash as Hex,
    timestamp: endBlock.timestamp,
  });

  if (addresses.length > 0) {
    const logs = await client.getLogs({
      address: addresses,
      events: [...allEventAbis],
      fromBlock: from,
      toBlock: to,
    });
    const timestamps = new Map<string, bigint>();
    timestamps.set(from.toString(), startBlock.timestamp);
    timestamps.set(to.toString(), endBlock.timestamp);

    const derived = derivedFromRecords(markets, await store.listPositions(config.chainId), vaults);

    for (const log of logs) {
      const bn = log.blockNumber ?? 0n;
      let ts = timestamps.get(bn.toString());
      if (ts === undefined) {
        const blk = await client.getBlock({ blockNumber: bn });
        ts = blk.timestamp;
        timestamps.set(bn.toString(), ts);
        await store.putBlock({
          chainId: config.chainId,
          blockNumber: bn,
          blockHash: blk.hash as Hex,
          parentHash: blk.parentHash as Hex,
          timestamp: ts,
        });
      }
      const decoded = decodeLog(config.chainId, log, ts);
      if (!decoded) continue;
      const inserted = await store.insertEvent(decoded);
      if (inserted) applyEvent(derived, decoded);
    }

    const flat = flattenDerived(derived);
    for (const m of flat.markets) await store.upsertMarket(m);
    for (const p of flat.positions) await store.upsertPosition(p);
    for (const v of flat.vaults) await store.upsertVault(v);
  }

  const latestMarkets = await store.listMarkets(config.chainId);
  for (const market of latestMarkets) {
    const hydrated = await hydrateMarketFromChain(client, market);
    await store.upsertMarket(hydrated);
  }
  const latestPositions = await store.listPositions(config.chainId);
  const byAddr = new Map(latestMarkets.map((m) => [m.address.toLowerCase(), m]));
  for (const position of latestPositions) {
    const market = byAddr.get(position.marketAddress.toLowerCase());
    if (!market) continue;
    const hydrated = await hydratePositionFromChain(client, market, position);
    await store.upsertPosition(hydrated);
  }

  cursor = {
    ...cursor,
    lastBlock: to,
    lastHash: endBlock.hash as Hex,
    lastTimestamp: endBlock.timestamp,
    headBlock: head,
    lastError: null,
    updatedAt: isoNow(),
  };
  await store.upsertCursor(cursor);
  return cursor;
}

export async function runIndexer(args: {
  store: IndexerStore;
  env: IndexerEnv;
  configs: ChainConfig[];
  signal?: AbortSignal;
}): Promise<void> {
  const clients = new Map<number, PublicClient>();
  for (const config of args.configs) {
    clients.set(config.chainId, createPublicClient({ transport: http(config.rpcUrl) }));
  }

  const tick = async () => {
    for (const config of args.configs) {
      const client = clients.get(config.chainId);
      if (!client) continue;
      try {
        await indexOnce({ store: args.store, config, env: args.env, client });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`indexer chain ${config.chainId}: ${message}`);
        const cursor = (await args.store.getCursor(config.chainId)) ?? {
          chainId: config.chainId,
          startBlock: config.startBlock,
          lastBlock: config.startBlock === 0n ? -1n : config.startBlock - 1n,
          lastHash: null,
          lastTimestamp: 0n,
          headBlock: 0n,
          lastError: message,
          updatedAt: isoNow(),
        };
        await args.store.upsertCursor({ ...cursor, lastError: message, updatedAt: isoNow() });
      }
    }
  };

  await tick();
  while (!args.signal?.aborted) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, args.env.pollMs);
      args.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        resolve(undefined);
      });
    });
    if (args.signal?.aborted) break;
    await tick();
  }
}
