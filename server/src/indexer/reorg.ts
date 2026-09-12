import type { Hex } from "../domain.js";
import type { IndexerStore } from "../db/store.js";
import { derivedFromRecords, replayEvents } from "./apply.js";
import type { ChainConfig } from "../domain.js";
import { emptyMarket } from "../db/memory.js";

export async function rollbackToBlock(
  store: IndexerStore,
  config: ChainConfig,
  ancestorBlock: bigint,
): Promise<void> {
  await store.deleteAfter(config.chainId, ancestorBlock);
  await rebuildDerived(store, config);
}

export async function rebuildDerived(store: IndexerStore, config: ChainConfig): Promise<void> {
  const events = await store.listEventsForReplay(config.chainId);
  const seeded = config.markets.map((m) => emptyMarket(config, m));
  const base = derivedFromRecords(seeded, [], []);
  const next = replayEvents(base, events);
  const flat = {
    markets: [...next.markets.values()],
    positions: [...next.positions.values()],
    vaults: [...next.vaults.values()],
  };
  await store.replaceChainDerived(config.chainId, flat);
}

export async function findCommonAncestor(args: {
  store: IndexerStore;
  chainId: number;
  startBlock: bigint;
  fromBlock: bigint;
  reorgDepth: number;
  getHash: (blockNumber: bigint) => Promise<Hex | null>;
}): Promise<bigint> {
  const { store, chainId, startBlock, fromBlock, reorgDepth, getHash } = args;
  let n = fromBlock;
  let walked = 0;
  while (n >= startBlock && walked <= reorgDepth) {
    const stored = await store.getBlockHash(chainId, n);
    const onchain = await getHash(n);
    if (stored && onchain && stored.toLowerCase() === onchain.toLowerCase()) return n;
    if (n === 0n) break;
    n -= 1n;
    walked += 1;
  }
  return startBlock === 0n ? 0n : startBlock - 1n;
}
