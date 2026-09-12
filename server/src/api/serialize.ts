import {
  type Freshness,
  type MarketSummary,
  type Position,
} from "@interline/api-types";
import type { CursorRecord, MarketRecord, PositionRecord } from "../domain.js";
import { dec } from "../domain.js";
import { marketStatus, projectMarket, projectPosition } from "../indexer/project.js";

export function freshnessOf(cursor: CursorRecord | null, oracleStatus: MarketRecord["oracleStatus"]): Freshness {
  const indexed = cursor?.lastBlock ?? 0n;
  const head = cursor?.headBlock ?? indexed;
  const lag = head > indexed ? head - indexed : 0n;
  return {
    indexedBlockNumber: dec(indexed < 0n ? 0n : indexed),
    indexedBlockHash: cursor?.lastHash ?? null,
    indexedBlockTimestamp: dec(cursor?.lastTimestamp ?? 0n),
    headBlockNumber: dec(head < 0n ? 0n : head),
    lagBlocks: dec(lag),
    indexedAt: cursor?.updatedAt ?? new Date(0).toISOString(),
    oracleStatus,
    oracleMode: "simulated",
  };
}

export function serializeMarket(
  market: MarketRecord,
  cursor: CursorRecord | null,
  timestamp: bigint,
): MarketSummary {
  const p = projectMarket(market, timestamp);
  return {
    chainId: market.chainId,
    marketId: market.marketId,
    address: market.address,
    label: market.label,
    deliveryMode: market.deliveryMode,
    status: marketStatus(market),
    loanToken: { address: market.loanToken, symbol: market.loanSymbol, decimals: market.loanDecimals },
    collateralToken: {
      address: market.collateralToken,
      symbol: market.collateralSymbol,
      decimals: market.collateralDecimals,
    },
    accountedCash: dec(market.accountedCash),
    totalDebt: dec(p.totalDebt),
    supplierAssets: dec(p.supplierAssets),
    totalSupplyShares: dec(market.totalSupplyShares),
    totalDebtShares: dec(market.totalDebtShares),
    utilizationRay: dec(p.utilizationRay),
    borrowAprRay: dec(p.borrowAprRay),
    supplyAprRay: dec(p.supplyAprRay),
    borrowApyGrowthRay: dec(p.borrowApyGrowthRay),
    supplyApyGrowthRay: dec(p.supplyApyGrowthRay),
    epochIndexRay: dec(market.epochIndexRay),
    epochTimestamp: dec(market.epochTimestamp),
    supplyCap: dec(market.supplyCap),
    borrowCap: dec(market.borrowCap),
    maxLtvBps: market.maxLtvBps,
    liquidationThresholdBps: market.liquidationThresholdBps,
    liquidationBonusBps: market.liquidationBonusBps,
    supplyFrozen: market.supplyFrozen,
    borrowFrozen: market.borrowFrozen,
    recallActive: market.recallActive,
    recallDeadline: dec(market.recallDeadline),
    terminal: market.terminal,
    oracleStatus: market.oracleStatus,
    oracleMode: "simulated",
    unaccountedSurplus: dec(market.unaccountedSurplus),
    freshness: freshnessOf(cursor, market.oracleStatus),
  };
}

export function serializePosition(
  market: MarketRecord,
  position: PositionRecord,
  cursor: CursorRecord | null,
  timestamp: bigint,
): Position {
  const p = projectPosition(market, position, timestamp);
  return {
    chainId: position.chainId,
    marketId: position.marketId,
    marketAddress: position.marketAddress,
    owner: position.owner,
    deliveryMode: market.deliveryMode,
    projectedDebt: dec(p.projectedDebt),
    principalOutstanding: dec(position.principalOutstanding),
    debtShares: dec(position.debtShares),
    collateral: dec(position.collateral),
    collateralValueLoan: p.collateralValueLoan === null ? null : dec(p.collateralValueLoan),
    supplyShares: dec(position.supplyShares),
    supplyAssets: dec(p.supplyAssets),
    maxWithdraw: dec(p.maxWithdraw),
    healthCode: p.healthCode,
    healthFactorWad: p.healthFactorWad === null ? null : dec(p.healthFactorWad),
    liquidatable: p.liquidatable,
    defaulted: position.defaulted,
    writtenOffLiability: dec(position.writtenOffLiability),
    vault: position.vault,
    freshness: freshnessOf(cursor, market.oracleStatus),
  };
}

export function projectionTimestamp(cursor: CursorRecord | null): bigint {
  if (cursor && cursor.lastTimestamp > 0n) return cursor.lastTimestamp;
  return BigInt(Math.floor(Date.now() / 1000));
}
