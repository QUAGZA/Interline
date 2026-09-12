import { describe, expect, it } from "vitest";
import { BASE_APR_RAY, DEBT_DENOMINATOR, RAY } from "@interline/math";
import { projectMarket, projectPosition } from "../src/indexer/project.js";
import type { MarketRecord, PositionRecord } from "../src/domain.js";

const market: MarketRecord = {
  chainId: 31337,
  marketId: "m",
  address: "0x00000000000000000000000000000000000000a1",
  label: "m",
  deliveryMode: "wallet",
  loanToken: "0x00000000000000000000000000000000000000c1",
  loanSymbol: "mUSDC",
  loanDecimals: 6,
  collateralToken: "0x00000000000000000000000000000000000000c2",
  collateralSymbol: "mWETH",
  collateralDecimals: 18,
  oracle: null,
  accountedCash: 1_000_000000n,
  totalDebtShares: 100_000000n * 10n ** 27n,
  totalSupplyShares: 1_000_000000n * 10n ** 12n,
  epochIndexRay: RAY,
  epochTimestamp: 100n,
  epochAprRay: BASE_APR_RAY,
  supplyCap: 0n,
  borrowCap: 0n,
  maxLtvBps: 7000,
  liquidationThresholdBps: 8000,
  liquidationBonusBps: 500,
  defaultPositionCap: 0n,
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

const position: PositionRecord = {
  chainId: 31337,
  marketId: "m",
  marketAddress: market.address,
  owner: "0x00000000000000000000000000000000000000b1",
  supplyShares: 0n,
  debtShares: 100_000000n * 10n ** 27n,
  collateral: 1n,
  principalOutstanding: 100_000000n,
  defaulted: false,
  writtenOffLiability: 0n,
  positionCap: 0n,
  vault: null,
};

describe("projection", () => {
  it("projects debt as ceil(q * I / DEBT_DENOMINATOR) and treats >0 as an active loan", () => {
    const atEpoch = projectPosition(market, position, 100n);
    expect(atEpoch.projectedDebt).toBe((position.debtShares * RAY + DEBT_DENOMINATOR - 1n) / DEBT_DENOMINATOR);
    expect(atEpoch.projectedDebt).toBeGreaterThan(0n);
    expect(atEpoch.healthCode).toBe("UNAVAILABLE");

    const later = projectMarket(market, 100n + 31_536_000n);
    expect(later.indexRay).toBeGreaterThan(RAY);
    expect(later.totalDebt).toBeGreaterThan(atEpoch.projectedDebt);
  });
});
