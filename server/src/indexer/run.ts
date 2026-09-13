import { createPublicClient, http, type Address, type Log, type PublicClient } from "viem";
import { cursorHydrationDefaults, type ChainConfig, type CursorRecord, type Hex, type IndexedEventRecord } from "../domain.js";
import type { IndexerEnv } from "../env.js";
import { emptyMarket } from "../db/memory.js";
import type { BlockRow, IndexerStore } from "../db/store.js";
import { derivedFromRecords, flattenDerived, replayEvents, termsFromFacility } from "./apply.js";
import { allEventAbis } from "./abis.js";
import { decodeLog } from "./decode.js";
import {
  hydrateFacilityFromChain,
  hydrateMarketFromChain,
  hydratePositionFromChain,
  type HydrationPin,
} from "./hydrate.js";
import { findCommonAncestor, rollbackToBlock } from "./reorg.js";

const MAX_DISCOVERY_ROUNDS = 16;
const ZERO = "0x0000000000000000000000000000000000000000";

const chainLocks = new Map<number, Promise<void>>();

function isoNow(): string {
  return new Date().toISOString();
}

export async function withChainLock<T>(chainId: number, fn: () => Promise<T>): Promise<T> {
  const prev = chainLocks.get(chainId) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  chainLocks.set(
    chainId,
    prev.then(() => held),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function watchedAddresses(config: ChainConfig, extra: Address[]): Address[] {
  const set = new Set<string>();
  if (config.factory) set.add(config.factory.toLowerCase());
  if (config.vaultFactory) set.add(config.vaultFactory.toLowerCase());
  if (config.recoveryEscrow) set.add(config.recoveryEscrow.toLowerCase());
  if (config.directFactory) set.add(config.directFactory.toLowerCase());
  for (const m of config.markets) set.add(m.address.toLowerCase());
  for (const a of extra) set.add(a.toLowerCase());
  return [...set] as Address[];
}

function discoveryAddresses(event: IndexedEventRecord): Address[] {
  const take = (name: string): Address | null => {
    const v = event.args[name];
    if (!v || !v.startsWith("0x") || v.toLowerCase() === ZERO) return null;
    return v as Address;
  };
  switch (event.eventName) {
    case "MarketCreated": {
      const market = take("market");
      return market ? [market] : [];
    }
    case "VaultCreated": {
      const vault = take("vault");
      return vault ? [vault] : [];
    }
    case "FacilityCreated": {
      const out: Address[] = [];
      const facility = take("facility");
      const vault = take("vault");
      if (facility) out.push(facility);
      if (vault) out.push(vault);
      return out;
    }
    default:
      return [];
  }
}

function logKey(log: Pick<Log, "transactionHash" | "logIndex">): string | null {
  if (!log.transactionHash || log.logIndex === null || log.logIndex === undefined) return null;
  return `${log.transactionHash.toLowerCase()}:${log.logIndex}`;
}

function eventKey(event: IndexedEventRecord): string {
  return `${event.txHash.toLowerCase()}:${event.logIndex}`;
}

function sortLogs(logs: Log[]): Log[] {
  return [...logs].sort((a, b) => {
    const bn = (a.blockNumber ?? 0n) - (b.blockNumber ?? 0n);
    if (bn !== 0n) return bn < 0n ? -1 : 1;
    const tx = (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0);
    if (tx !== 0) return tx;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });
}

function sortEvents(events: IndexedEventRecord[]): IndexedEventRecord[] {
  return [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
}

function mergeEvents(prior: IndexedEventRecord[], incoming: IndexedEventRecord[]): IndexedEventRecord[] {
  const byId = new Map<string, IndexedEventRecord>();
  for (const event of prior) byId.set(eventKey(event), event);
  for (const event of incoming) byId.set(eventKey(event), event);
  return sortEvents([...byId.values()]);
}

function extraFromStore(args: {
  markets: { address: Address }[];
  vaults: { vault: Address }[];
  facilities: { facility: Address; vault: Address }[];
}): Address[] {
  return [
    ...args.markets.map((m) => m.address),
    ...args.vaults.map((v) => v.vault),
    ...args.facilities.map((f) => f.facility),
    ...args.facilities.map((f) => f.vault),
  ].filter((a) => a && a.toLowerCase() !== ZERO) as Address[];
}

function withHydration(cursor: CursorRecord, now: string): CursorRecord {
  return { ...cursorHydrationDefaults(cursor), ...cursor, lastPolledAt: cursor.lastPolledAt ?? now, updatedAt: now };
}

async function ensureCursor(store: IndexerStore, config: ChainConfig): Promise<CursorRecord> {
  const existing = await store.getCursor(config.chainId);
  if (existing) return existing;
  const now = isoNow();
  const initial: CursorRecord = {
    chainId: config.chainId,
    startBlock: config.startBlock,
    lastBlock: config.startBlock === 0n ? -1n : config.startBlock - 1n,
    lastHash: null,
    lastTimestamp: 0n,
    headBlock: 0n,
    lastError: null,
    updatedAt: now,
    ...cursorHydrationDefaults({ updatedAt: now }),
    lastPolledAt: now,
  };
  await store.upsertCursor(initial);
  return initial;
}

async function projectFromJournal(
  store: IndexerStore,
  config: ChainConfig,
  incoming: IndexedEventRecord[],
  upTo: bigint,
) {
  const prior = await store.listEventsForReplay(config.chainId);
  const merged = mergeEvents(prior, incoming).filter((e) => e.blockNumber <= upTo);
  const seeded = config.markets.map((m) => emptyMarket(config, m));
  return replayEvents(derivedFromRecords(seeded, [], []), merged);
}

export async function indexOnce(args: {
  store: IndexerStore;
  config: ChainConfig;
  env: IndexerEnv;
  client: PublicClient;
}): Promise<CursorRecord> {
  return withChainLock(args.config.chainId, () => indexOnceUnlocked(args));
}

async function indexOnceUnlocked(args: {
  store: IndexerStore;
  config: ChainConfig;
  env: IndexerEnv;
  client: PublicClient;
}): Promise<CursorRecord> {
  const { store, config, env, client } = args;
  await store.seedMarkets(config);
  let cursor = withHydration(await ensureCursor(store, config), isoNow());

  const head = await client.getBlockNumber();
  cursor = { ...cursor, headBlock: head, lastPolledAt: isoNow(), updatedAt: isoNow() };

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
        hydrationOk: false,
        updatedAt: isoNow(),
        lastPolledAt: isoNow(),
      };
      await store.upsertCursor(cursor);
    }
  }

  let from = cursor.lastBlock + 1n;
  if (from < config.startBlock) from = config.startBlock;
  const caughtUp = from > head;
  let to = caughtUp ? head : from + BigInt(env.maxBlockRange) - 1n;
  if (to > head) to = head;
  if (to < config.startBlock && !caughtUp) {
    cursor = { ...cursor, headBlock: head, lastError: null, lastPolledAt: isoNow(), updatedAt: isoNow() };
    await store.upsertCursor(cursor);
    return cursor;
  }

  const pinBlockNumber = caughtUp ? head : to;
  const pinBlock = await client.getBlock({ blockNumber: pinBlockNumber });
  const pin: HydrationPin = {
    blockNumber: pinBlockNumber,
    blockHash: pinBlock.hash as Hex,
    timestamp: pinBlock.timestamp,
  };

  const blocks: BlockRow[] = [
    {
      chainId: config.chainId,
      blockNumber: pin.blockNumber,
      blockHash: pin.blockHash,
      parentHash: pinBlock.parentHash as Hex,
      timestamp: pin.timestamp,
    },
  ];
  const timestamps = new Map<string, bigint>();
  timestamps.set(pin.blockNumber.toString(), pin.timestamp);

  const rememberBlock = async (blockNumber: bigint) => {
    let ts = timestamps.get(blockNumber.toString());
    if (ts !== undefined) return ts;
    const blk = await client.getBlock({ blockNumber });
    ts = blk.timestamp;
    timestamps.set(blockNumber.toString(), ts);
    blocks.push({
      chainId: config.chainId,
      blockNumber,
      blockHash: blk.hash as Hex,
      parentHash: blk.parentHash as Hex,
      timestamp: ts,
    });
    return ts;
  };

  if (!caughtUp) {
    await rememberBlock(from);
    if (to !== from) await rememberBlock(to);
  }

  const incoming: IndexedEventRecord[] = [];
  if (!caughtUp) {
    const markets = await store.listMarkets(config.chainId);
    const vaults = await store.listVaults(config.chainId);
    const facilities = await store.listDirectFacilities(config.chainId);
    const known = new Set(
      watchedAddresses(config, extraFromStore({ markets, vaults, facilities })).map((a) => a.toLowerCase()),
    );
    let frontier = [...known] as Address[];
    const mergedLogs = new Map<string, Log>();

    for (let round = 0; round < MAX_DISCOVERY_ROUNDS && frontier.length > 0; round++) {
      const logs = await client.getLogs({
        address: frontier,
        events: [...allEventAbis],
        fromBlock: from,
        toBlock: to,
      });
      const newly: Address[] = [];
      for (const log of logs) {
        const key = logKey(log);
        if (!key || mergedLogs.has(key)) continue;
        mergedLogs.set(key, log);
        const ts = await rememberBlock(log.blockNumber ?? 0n);
        const decoded = decodeLog(config.chainId, log, ts);
        if (!decoded) continue;
        for (const addr of discoveryAddresses(decoded)) {
          const lower = addr.toLowerCase();
          if (known.has(lower)) continue;
          known.add(lower);
          newly.push(addr);
        }
      }
      frontier = newly;
    }

    for (const log of sortLogs([...mergedLogs.values()])) {
      const ts = timestamps.get((log.blockNumber ?? 0n).toString()) ?? pin.timestamp;
      const decoded = decodeLog(config.chainId, log, ts);
      if (decoded) incoming.push(decoded);
    }
  }

  const derived = await projectFromJournal(store, config, incoming, pin.blockNumber);
  const hydrationErrors: string[] = [];

  for (const [key, market] of derived.markets) {
    const result = await hydrateMarketFromChain(client, market, pin);
    derived.markets.set(key, result.value);
    if (!result.ok && result.error) hydrationErrors.push(`market ${market.address}: ${result.error}`);
  }
  for (const [key, position] of derived.positions) {
    const market = [...derived.markets.values()].find(
      (m) => m.address.toLowerCase() === position.marketAddress.toLowerCase(),
    );
    if (!market) continue;
    const result = await hydratePositionFromChain(client, market, position, pin);
    derived.positions.set(key, result.value);
    if (!result.ok && result.error) hydrationErrors.push(`position ${position.owner}: ${result.error}`);
  }
  for (const [key, facility] of derived.facilities) {
    const result = await hydrateFacilityFromChain(client, facility, pin);
    derived.facilities.set(key, result.value);
    derived.terms.set(`${result.value.chainId}:${result.value.facility.toLowerCase()}`, termsFromFacility(result.value));
    if (!result.ok && result.error) hydrationErrors.push(`facility ${facility.facility}: ${result.error}`);
  }

  const hydrationOk = hydrationErrors.length === 0;
  const now = isoNow();
  const lastError = hydrationOk ? null : hydrationErrors.join("; ");
  cursor = {
    ...cursor,
    lastBlock: pin.blockNumber,
    lastHash: pin.blockHash,
    lastTimestamp: pin.timestamp,
    headBlock: head,
    lastError,
    updatedAt: now,
    lastPolledAt: now,
    hydrationOk,
    hydratedBlockNumber: hydrationOk ? pin.blockNumber : cursor.hydratedBlockNumber,
    hydratedBlockHash: hydrationOk ? pin.blockHash : cursor.hydratedBlockHash,
    hydratedBlockTimestamp: hydrationOk ? pin.timestamp : cursor.hydratedBlockTimestamp,
    lastHydratedAt: hydrationOk ? now : cursor.lastHydratedAt,
  };

  const flat = flattenDerived(derived);
  await store.commitIndexedRange({
    chainId: config.chainId,
    events: incoming,
    blocks,
    derived: flat,
    cursor,
  });
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
        const now = isoNow();
        const cursor = (await args.store.getCursor(config.chainId)) ?? {
          chainId: config.chainId,
          startBlock: config.startBlock,
          lastBlock: config.startBlock === 0n ? -1n : config.startBlock - 1n,
          lastHash: null,
          lastTimestamp: 0n,
          headBlock: 0n,
          lastError: message,
          updatedAt: now,
          ...cursorHydrationDefaults({ updatedAt: now }),
          lastPolledAt: now,
        };
        await args.store.upsertCursor({
          ...cursor,
          lastError: message,
          lastPolledAt: now,
          hydrationOk: false,
          updatedAt: now,
        });
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
