import { describe, expect, it } from "vitest";
import { BASE_APR_RAY, RAY } from "@interline/math";
import { MemoryStore } from "../src/db/memory.js";
import { applyEvent, derivedFromRecords, replayEvents } from "../src/indexer/apply.js";
import type { IndexedEventRecord, MarketRecord } from "../src/domain.js";

const MARKET = "0x00000000000000000000000000000000000000a1";
const USER = "0x00000000000000000000000000000000000000b1";

function marketFixture(): MarketRecord {
  return {
    chainId: 31337,
    marketId: "usdc-weth-wallet",
    address: MARKET,
    label: "USDC/WETH Wallet",
    deliveryMode: "wallet",
    loanToken: "0x00000000000000000000000000000000000000c1",
    loanSymbol: "mUSDC",
    loanDecimals: 6,
    collateralToken: "0x00000000000000000000000000000000000000c2",
    collateralSymbol: "mWETH",
    collateralDecimals: 18,
    oracle: null,
    accountedCash: 0n,
    totalDebtShares: 0n,
    totalSupplyShares: 0n,
    epochIndexRay: RAY,
    epochTimestamp: 1n,
    epochAprRay: BASE_APR_RAY,
    supplyCap: 1_000_000_000000n,
    borrowCap: 800_000_000000n,
    maxLtvBps: 7000,
    liquidationThresholdBps: 8000,
    liquidationBonusBps: 500,
    defaultPositionCap: 800_000_000000n,
    supplyFrozen: false,
    borrowFrozen: false,
    recallActive: false,
    recallDeadline: 0n,
    recallClearableAt: 0n,
    terminal: false,
    unaccountedSurplus: 0n,
    quoteScale36: 0n,
    collateralUsdWad: 0n,
    loanUsdWad: 0n,
    oracleStatus: "UNAVAILABLE",
    oracleMode: "simulated",
  };
}

function ev(partial: Partial<IndexedEventRecord> & Pick<IndexedEventRecord, "eventName" | "args" | "logIndex">): IndexedEventRecord {
  return {
    chainId: 31337,
    txHash: `0x${partial.logIndex.toString(16).padStart(64, "0")}` as `0x${string}`,
    blockNumber: 10n,
    blockHash: `0x${"11".repeat(32)}`,
    address: MARKET,
    timestamp: 1_700_000_000n,
    ...partial,
  };
}

describe("event apply", () => {
  it("updates cash, shares, debt from market events", () => {
    const state = derivedFromRecords([marketFixture()], [], []);
    applyEvent(
      state,
      ev({
        eventName: "Supplied",
        logIndex: 0,
        args: { supplier: USER, assets: "1000000000", shares: "1000000000000000000", cashAfter: "1000000000", assetsAfter: "1000000000" },
      }),
    );
    applyEvent(
      state,
      ev({
        eventName: "CollateralAdded",
        logIndex: 1,
        args: { owner: USER, from: USER, amount: "1000000000000000000" },
      }),
    );
    applyEvent(
      state,
      ev({
        eventName: "Borrowed",
        logIndex: 2,
        args: { owner: USER, assets: "100000000", shares: "100000000", destination: USER, debtAfter: "100000000" },
      }),
    );
    const market = [...state.markets.values()][0]!;
    const pos = [...state.positions.values()][0]!;
    expect(market.accountedCash).toBe(900_000000n);
    expect(market.totalSupplyShares).toBe(1000000000000000000n);
    expect(market.totalDebtShares).toBe(100000000n);
    expect(pos.supplyShares).toBe(1000000000000000000n);
    expect(pos.debtShares).toBe(100000000n);
    expect(pos.collateral).toBe(10n ** 18n);
    expect(pos.principalOutstanding).toBe(100000000n);
  });

  it("replays the same sequence deterministically", () => {
    const events = [
      ev({
        eventName: "Supplied",
        logIndex: 0,
        args: { supplier: USER, assets: "5", shares: "5", cashAfter: "5", assetsAfter: "5" },
      }),
      ev({
        eventName: "Supplied",
        logIndex: 1,
        args: { supplier: USER, assets: "5", shares: "5", cashAfter: "10", assetsAfter: "10" },
      }),
    ];
    const a = replayEvents(derivedFromRecords([marketFixture()], [], []), events);
    const b = replayEvents(derivedFromRecords([marketFixture()], [], []), events);
    expect([...a.markets.values()][0]!.accountedCash).toBe(10n);
    expect([...a.markets.values()][0]!.accountedCash).toBe([...b.markets.values()][0]!.accountedCash);
  });

  it("inserts unique (chainId, txHash, logIndex)", async () => {
    const store = new MemoryStore();
    const event = ev({
      eventName: "Supplied",
      logIndex: 3,
      args: { supplier: USER, assets: "1", shares: "1", cashAfter: "1", assetsAfter: "1" },
    });
    expect(await store.insertEvent(event)).toBe(true);
    expect(await store.insertEvent(event)).toBe(false);
    expect((await store.listEventsForReplay(31337)).length).toBe(1);
  });
});
