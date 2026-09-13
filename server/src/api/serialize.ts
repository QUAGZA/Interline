import {
  type DirectFacility,
  type Freshness,
  type MarketSummary,
  type Position,
} from "@interline/api-types";
import type { CursorRecord, DirectFacilityRecord, MarketRecord, PositionRecord } from "../domain.js";
import { dec } from "../domain.js";
import { marketStatus, projectMarket, projectPosition } from "../indexer/project.js";

export function freshnessOf(cursor: CursorRecord | null, oracleStatus: MarketRecord["oracleStatus"]): Freshness {
  const indexed = cursor?.lastBlock ?? 0n;
  const head = cursor?.headBlock ?? indexed;
  const lag = head > indexed ? head - indexed : 0n;
  const hydrated = cursor?.hydratedBlockNumber ?? null;
  const hydrationOk = cursor?.hydrationOk === true && cursor.lastError === null;
  const publishedOracle = hydrationOk ? oracleStatus : oracleStatus === "OK" ? "UNAVAILABLE" : oracleStatus;
  const lastPolledAt = cursor?.lastPolledAt ?? cursor?.updatedAt ?? new Date(0).toISOString();
  return {
    indexedBlockNumber: dec(indexed < 0n ? 0n : indexed),
    indexedBlockHash: cursor?.lastHash ?? null,
    indexedBlockTimestamp: dec(cursor?.lastTimestamp ?? 0n),
    headBlockNumber: dec(head < 0n ? 0n : head),
    lagBlocks: dec(lag),
    indexedAt: cursor?.lastHydratedAt ?? lastPolledAt,
    oracleStatus: publishedOracle,
    oracleMode: "simulated",
    hydratedBlockNumber: dec(hydrated !== null && hydrated >= 0n ? hydrated : 0n),
    hydratedBlockHash: cursor?.hydratedBlockHash ?? null,
    hydratedBlockTimestamp: dec(cursor?.hydratedBlockTimestamp ?? 0n),
    lastHydratedAt: cursor?.lastHydratedAt ?? null,
    lastPolledAt,
    lastError: cursor?.lastError ?? null,
    hydrationOk,
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

export function serializeDirectFacility(
  row: DirectFacilityRecord,
  cursor: CursorRecord | null,
): DirectFacility {
  const hash = row.termsHash.length >= 66 ? row.termsHash : (`0x${row.termsHash.slice(2).padEnd(64, "0")}` as const);
  const principal = row.principal;
  const debt = row.lastDebt > 0n ? row.lastDebt : row.principal;
  const interest = debt > principal ? debt - principal : 0n;
  return {
    product: "DIRECT",
    protocolVersion: "interline-direct-v2",
    chainId: row.chainId,
    facility: row.facility,
    lender: row.lender,
    borrower: row.borrower,
    vault: row.vault,
    asset: { address: row.asset, symbol: "mUSDC", decimals: 6 },
    termsHash: hash,
    lenderAccepted: row.lenderAccepted,
    borrowerAccepted: row.borrowerAccepted,
    declined: row.declined,
    cancelled: row.cancelled,
    ended: row.ended,
    acceptanceDeadline: dec(row.acceptanceDeadline),
    activatedAt: row.activatedAt === 0n ? null : dec(row.activatedAt),
    borrowExpiry: row.borrowExpiry === 0n ? null : dec(row.borrowExpiry),
    repaymentDueAt: row.repaymentDueAt === 0n ? null : dec(row.repaymentDueAt),
    creditLimitRaw: dec(row.creditLimit),
    availableCashRaw: dec(row.accountedCash),
    principalRaw: dec(principal),
    debtRaw: dec(debt),
    accruedInterestRaw: dec(interest),
    fixedAprRay: dec(row.aprRay),
    recallDeadline: row.recallDeadline === 0n ? null : dec(row.recallDeadline),
    borrowingPaused: row.borrowingPaused,
    collateralization: "OVERCOLLATERALIZED_80",
    healthFactorWad: null,
    priceLiquidatable: false,
    freshness: freshnessOf(cursor, "UNAVAILABLE"),
  };
}

export function projectionTimestamp(cursor: CursorRecord | null): bigint {
  if (cursor && cursor.hydratedBlockTimestamp > 0n) return cursor.hydratedBlockTimestamp;
  if (cursor && cursor.lastTimestamp > 0n) return cursor.lastTimestamp;
  return BigInt(Math.floor(Date.now() / 1000));
}
