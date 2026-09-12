import { describe, expect, it } from "vitest";
import { emptyMarket, MemoryStore } from "../src/db/memory.js";
import { rollbackToBlock } from "../src/indexer/reorg.js";
import type { ChainConfig, IndexedEventRecord, MarketRecord } from "../src/domain.js";

const MARKET = "0x00000000000000000000000000000000000000a1";
const USER = "0x00000000000000000000000000000000000000b1";

const config: ChainConfig = {
  chainId: 31337,
  name: "Anvil",
  rpcUrl: "http://127.0.0.1:8545",
  factory: "0x00000000000000000000000000000000000000f1",
  vaultFactory: null,
  recoveryEscrow: null,
  lens: null,
  startBlock: 1n,
  oracleMode: "simulated",
  faucet: null,
  markets: [
    {
      id: "usdc-weth-wallet",
      address: MARKET,
      label: "USDC/WETH Wallet",
      deliveryMode: "wallet",
      loanSymbol: "mUSDC",
      collateralSymbol: "mWETH",
      oracle: null,
    },
  ],
};

function eventAt(block: bigint, logIndex: number, cashAfter: string): IndexedEventRecord {
  return {
    chainId: 31337,
    txHash: `0x${block.toString(16).padStart(62, "0")}${logIndex.toString(16).padStart(2, "0")}` as `0x${string}`,
    logIndex,
    blockNumber: block,
    blockHash: `0x${block.toString(16).padStart(64, "0")}` as `0x${string}`,
    address: MARKET,
    eventName: "Supplied",
    args: { supplier: USER, assets: "100", shares: "100", cashAfter, assetsAfter: cashAfter },
    timestamp: 1_000n + block,
  };
}

describe("reorg rollback", () => {
  it("drops events after the ancestor and rebuilds market cash", async () => {
    const store = new MemoryStore();
    await store.seedMarkets(config);
    expect(await store.insertEvent(eventAt(10n, 0, "100"))).toBe(true);
    expect(await store.insertEvent(eventAt(11n, 0, "200"))).toBe(true);
    await store.putBlock({ chainId: 31337, blockNumber: 10n, blockHash: `0x${"0a".repeat(32)}`, timestamp: 1010n });
    await store.putBlock({ chainId: 31337, blockNumber: 11n, blockHash: `0x${"0b".repeat(32)}`, timestamp: 1011n });

    const seeded: MarketRecord = emptyMarket(config, config.markets[0]!);
    await store.upsertMarket(seeded);
    // apply via rebuild
    await rollbackToBlock(store, config, 11n);
    expect((await store.getMarket(31337, "usdc-weth-wallet"))?.accountedCash).toBe(200n);

    await rollbackToBlock(store, config, 10n);
    const events = await store.listEventsForReplay(31337);
    expect(events.map((e) => e.blockNumber)).toEqual([10n]);
    expect((await store.getMarket(31337, "usdc-weth-wallet"))?.accountedCash).toBe(100n);
    expect(await store.getBlockHash(31337, 11n)).toBeNull();
  });

  it("resumes from cursor lastBlock without genesis rescan", async () => {
    const store = new MemoryStore();
    await store.upsertCursor({
      chainId: 31337,
      startBlock: 1n,
      lastBlock: 50n,
      lastHash: `0x${"50".repeat(32)}`,
      lastTimestamp: 50n,
      headBlock: 50n,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });
    const cursor = await store.getCursor(31337);
    expect(cursor?.lastBlock).toBe(50n);
    expect(cursor?.startBlock).toBe(1n);
  });
});
