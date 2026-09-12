import type { IndexerStore } from "../db/store.js";
import type { ChainConfig } from "../domain.js";
import { chainName } from "../indexer/deployments.js";
import { dec } from "../domain.js";

export async function chainLag(store: IndexerStore, configs: ChainConfig[]) {
  const chains = [];
  for (const config of configs) {
    const cursor = await store.getCursor(config.chainId);
    const indexed = cursor?.lastBlock ?? 0n;
    const head = cursor?.headBlock ?? indexed;
    const lag = head > indexed ? head - indexed : 0n;
    chains.push({
      chainId: config.chainId,
      name: chainName(config.chainId),
      startBlock: dec(config.startBlock),
      indexedBlockNumber: dec(indexed < 0n ? 0n : indexed),
      indexedBlockHash: cursor?.lastHash ?? null,
      headBlockNumber: dec(head < 0n ? 0n : head),
      lagBlocks: dec(lag),
      lastError: cursor?.lastError ?? null,
    });
  }
  return { ok: true as const, chains };
}
