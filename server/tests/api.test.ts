import { describe, expect, it } from "vitest";
import { BASE_APR_RAY, RAY } from "@interline/math";
import { MarketsResponse, Position, PositionsResponse, POSITIONS_PAGE_SIZE } from "@interline/api-types";
import { createApp } from "../src/api/app.js";
import { MemoryStore } from "../src/db/memory.js";
import type { ChainConfig, MarketRecord, PositionRecord } from "../src/domain.js";

const MARKET = "0x00000000000000000000000000000000000000a1";
const OWNER = "0x00000000000000000000000000000000000000b1";

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

function marketRow(): MarketRecord {
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
    accountedCash: 900_000000n,
    totalDebtShares: 100_000000n * 10n ** 27n,
    totalSupplyShares: 1_000_000000n * 10n ** 12n,
    epochIndexRay: RAY,
    epochTimestamp: 1_700_000_000n,
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

async function seededStore() {
  const store = new MemoryStore();
  await store.seedMarkets(config);
  await store.upsertMarket(marketRow());
  await store.upsertCursor({
    chainId: 31337,
    startBlock: 1n,
    lastBlock: 42n,
    lastHash: `0x${"42".repeat(32)}`,
    lastTimestamp: 1_700_000_010n,
    headBlock: 45n,
    lastError: null,
    updatedAt: new Date().toISOString(),
  });
  const position: PositionRecord = {
    chainId: 31337,
    marketId: "usdc-weth-wallet",
    marketAddress: MARKET,
    owner: OWNER,
    supplyShares: 0n,
    debtShares: 100_000000n * 10n ** 27n,
    collateral: 10n ** 18n,
    principalOutstanding: 100_000000n,
    defaulted: false,
    writtenOffLiability: 0n,
    positionCap: 0n,
    vault: null,
  };
  await store.upsertPosition(position);
  await store.insertEvent({
    chainId: 31337,
    txHash: `0x${"ab".repeat(32)}`,
    logIndex: 1,
    blockNumber: 40n,
    blockHash: `0x${"40".repeat(32)}`,
    address: MARKET,
    eventName: "Borrowed",
    args: { owner: OWNER, assets: "100000000", shares: "100000000", destination: OWNER, debtAfter: "100000000" },
    timestamp: 1_700_000_000n,
  });
  return store;
}

describe("GET /v1 API", () => {
  it("serves chains, markets, positions, portfolio, events, health/lag", async () => {
    const store = await seededStore();
    const app = createApp({ store, configs: [config] });

    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, service: "interline-indexer" });

    const lag = await app.request("/health/lag");
    expect(lag.status).toBe(200);
    const lagBody = await lag.json();
    expect(lagBody.chains[0].lagBlocks).toBe("3");

    const chains = await app.request("/v1/chains");
    expect(chains.status).toBe(200);
    const chainBody = await chains.json();
    expect(chainBody.chains[0].chainId).toBe(31337);
    expect(chainBody.chains[0].startBlock).toBe("1");

    const markets = await app.request("/v1/markets");
    expect(markets.status).toBe(200);
    const parsedMarkets = MarketsResponse.parse(await markets.json());
    expect(parsedMarkets.markets[0]!.marketId).toBe("usdc-weth-wallet");
    expect(parsedMarkets.markets[0]!.accountedCash).toBe("900000000");
    expect(parsedMarkets.markets[0]!.freshness.lagBlocks).toBe("3");

    const oneMarket = await app.request("/v1/markets/31337/usdc-weth-wallet");
    expect(oneMarket.status).toBe(200);

    const positions = await app.request("/v1/positions");
    expect(positions.status).toBe(200);
    const parsedPositions = PositionsResponse.parse(await positions.json());
    expect(parsedPositions.limit).toBe(POSITIONS_PAGE_SIZE);
    expect(parsedPositions.positions).toHaveLength(1);
    expect(BigInt(parsedPositions.positions[0]!.projectedDebt) > 0n).toBe(true);

    const onePos = await app.request(`/v1/positions/31337/usdc-weth-wallet/${OWNER}`);
    expect(onePos.status).toBe(200);
    const pos = Position.parse((await onePos.json()).position);
    expect(pos.owner).toBe(OWNER);

    const portfolio = await app.request(`/v1/accounts/31337/${OWNER}/portfolio`);
    expect(portfolio.status).toBe(200);
    const port = await portfolio.json();
    expect(port.borrows).toHaveLength(1);
    expect(port.chainId).toBe(31337);

    const events = await app.request("/v1/events?chainId=31337");
    expect(events.status).toBe(200);
    const evBody = await events.json();
    expect(evBody.events[0].event).toBe("Borrowed");
    expect(evBody.events[0].args.assets).toBe("100000000");
  });

  it("paginates active positions at 25", async () => {
    const store = await seededStore();
    const market = marketRow();
    for (let i = 0; i < 30; i++) {
      const owner = `0x${(i + 2).toString(16).padStart(40, "0")}` as `0x${string}`;
      await store.upsertPosition({
        chainId: 31337,
        marketId: "usdc-weth-wallet",
        marketAddress: MARKET,
        owner,
        supplyShares: 0n,
        debtShares: BigInt(30 - i) * 10n ** 27n,
        collateral: 1n,
        principalOutstanding: BigInt(30 - i),
        defaulted: false,
        writtenOffLiability: 0n,
        positionCap: 0n,
        vault: null,
      });
    }
    const app = createApp({ store, configs: [config] });
    const first = PositionsResponse.parse(await (await app.request("/v1/positions")).json());
    expect(first.positions).toHaveLength(25);
    expect(first.nextCursor).toBeTruthy();
    const second = PositionsResponse.parse(
      await (await app.request(`/v1/positions?cursor=${encodeURIComponent(first.nextCursor!)}`)).json(),
    );
    expect(second.positions.length).toBeGreaterThan(0);
    expect(second.positions[0]!.owner).not.toBe(first.positions[0]!.owner);
  });
});
