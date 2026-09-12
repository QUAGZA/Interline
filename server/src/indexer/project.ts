import {
  borrowApyGrowthRay,
  collateralValueLoan,
  debtFromShares,
  healthFactorWad,
  isLiquidatable,
  maxWithdrawAssets,
  projectIndex,
  supplierClaim,
  supplyAprRay,
  supplyApyEstGrowthRay,
  utilizationRay,
} from "@interline/math";
import type { HealthCode } from "@interline/api-types";
import type { MarketRecord, PositionRecord } from "../domain.js";

export type ProjectedMarket = {
  indexRay: bigint;
  totalDebt: bigint;
  supplierAssets: bigint;
  utilizationRay: bigint;
  borrowAprRay: bigint;
  supplyAprRay: bigint;
  borrowApyGrowthRay: bigint;
  supplyApyGrowthRay: bigint;
};

export function projectMarket(market: MarketRecord, timestamp: bigint): ProjectedMarket {
  const ts = timestamp < market.epochTimestamp ? market.epochTimestamp : timestamp;
  const indexRay =
    market.epochIndexRay === 0n ? 0n : projectIndex(market.epochIndexRay, market.epochAprRay, market.epochTimestamp, ts);
  const totalDebt =
    market.totalDebtShares === 0n || indexRay === 0n ? 0n : debtFromShares(market.totalDebtShares, indexRay);
  const supplierAssets = market.accountedCash + totalDebt;
  const util = utilizationRay(market.accountedCash, totalDebt);
  const borrowApr = market.epochAprRay;
  return {
    indexRay,
    totalDebt,
    supplierAssets,
    utilizationRay: util,
    borrowAprRay: borrowApr,
    supplyAprRay: supplyAprRay(borrowApr, util),
    borrowApyGrowthRay: borrowApyGrowthRay(borrowApr),
    supplyApyGrowthRay: supplyApyEstGrowthRay(borrowApr, util),
  };
}

export type ProjectedPosition = {
  projectedDebt: bigint;
  supplyAssets: bigint;
  maxWithdraw: bigint;
  collateralValueLoan: bigint | null;
  healthCode: HealthCode;
  healthFactorWad: bigint | null;
  liquidatable: boolean;
};

export function projectPosition(
  market: MarketRecord,
  position: PositionRecord,
  timestamp: bigint,
): ProjectedPosition {
  const m = projectMarket(market, timestamp);
  const projectedDebt =
    position.debtShares === 0n || m.indexRay === 0n ? 0n : debtFromShares(position.debtShares, m.indexRay);
  const supplyAssets = supplierClaim(position.supplyShares, market.totalSupplyShares, m.supplierAssets);
  const maxWithdraw = maxWithdrawAssets(
    position.supplyShares,
    market.totalSupplyShares,
    m.supplierAssets,
    market.accountedCash,
    m.totalDebt,
  );
  let collatValue: bigint | null = null;
  let healthCode: HealthCode = projectedDebt === 0n ? "NO_DEBT" : "UNAVAILABLE";
  let hf: bigint | null = null;
  let liquidatable = false;
  if (market.oracleStatus === "OK" && market.quoteScale36 > 0n) {
    collatValue = collateralValueLoan(position.collateral, market.quoteScale36);
    if (projectedDebt === 0n) {
      healthCode = "NO_DEBT";
    } else {
      const liq = (collatValue * BigInt(market.liquidationThresholdBps)) / 10_000n;
      healthCode = "OK";
      hf = healthFactorWad(liq, projectedDebt);
      liquidatable = isLiquidatable(projectedDebt, liq);
    }
  } else if (projectedDebt === 0n) {
    healthCode = "NO_DEBT";
  }
  return {
    projectedDebt,
    supplyAssets,
    maxWithdraw,
    collateralValueLoan: collatValue,
    healthCode,
    healthFactorWad: hf,
    liquidatable,
  };
}

export function marketStatus(market: MarketRecord): "active" | "supply_frozen" | "borrow_frozen" | "recall" | "terminal" {
  if (market.terminal) return "terminal";
  if (market.recallActive) return "recall";
  if (market.supplyFrozen) return "supply_frozen";
  if (market.borrowFrozen) return "borrow_frozen";
  return "active";
}
