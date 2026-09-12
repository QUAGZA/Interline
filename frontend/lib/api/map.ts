import type {
  ChainSummary,
  Freshness,
  IndexedEvent,
  MarketSummary,
  OracleStatus,
  PortfolioResponse,
  Position,
  SupplyHolding,
} from "@interline/api-types";
import { catalogById, isWritableMarket } from "@/lib/catalog";
import type {
  AmountDto,
  ApiHealthDto,
  ChainDto,
  EventDto,
  HealthCode,
  MarketDetailDto,
  MarketSummaryDto,
  PortfolioDto,
  PositionDto,
  TokenRef,
} from "./types";

function asAddr(value: string): `0x${string}` {
  return value as `0x${string}`;
}

function amt(raw: string, decimals: number, symbol: string): AmountDto {
  return { raw, decimals, symbol };
}

function token(ref: { address: string; symbol: string; decimals: number }): TokenRef {
  return {
    address: asAddr(ref.address),
    symbol: ref.symbol,
    decimals: ref.decimals,
    testAsset: true,
  };
}

function mapOracle(status: OracleStatus): "ok" | "stale" | "unavailable" {
  if (status === "OK") return "ok";
  if (status === "STALE") return "stale";
  return "unavailable";
}

function freshnessUi(f: Freshness) {
  return {
    blockNumber: f.indexedBlockNumber,
    blockHash: f.indexedBlockHash ? asAddr(f.indexedBlockHash) : null,
    indexedAt: f.indexedAt,
    lagSeconds: Number(BigInt(f.lagBlocks) > 1_000_000n ? 0n : BigInt(f.lagBlocks)),
  };
}

export function mapChain(row: ChainSummary): ChainDto {
  return { chainId: row.chainId, name: row.name, oracleMode: row.oracleMode };
}

export function mapMarketSummary(row: MarketSummary): MarketSummaryDto {
  const loan = token(row.loanToken);
  const collateral = token(row.collateralToken);
  const listed = catalogById(row.chainId, row.marketId) ?? catalogById(row.chainId, row.address);
  return {
    chainId: row.chainId,
    marketId: row.marketId,
    address: asAddr(row.address),
    label: listed?.label ?? row.label,
    deliveryMode: row.deliveryMode,
    loan,
    collateral,
    supplyApyGrowthRay: row.supplyApyGrowthRay,
    borrowAprRay: row.borrowAprRay,
    supplied: amt(row.supplierAssets, loan.decimals, loan.symbol),
    borrowed: amt(row.totalDebt, loan.decimals, loan.symbol),
    liquidity: amt(row.accountedCash, loan.decimals, loan.symbol),
    utilizationRay: row.utilizationRay,
    status: row.status,
    oracleMode: row.oracleMode,
    oracleStatus: mapOracle(row.oracleStatus),
    writable: isWritableMarket(row.chainId, row.address) || isWritableMarket(row.chainId, row.marketId),
    freshness: freshnessUi(row.freshness),
  };
}

export function mapMarketDetail(row: MarketSummary): MarketDetailDto {
  const base = mapMarketSummary(row);
  const loan = base.loan;
  return {
    ...base,
    maxLtvBps: row.maxLtvBps,
    liquidationThresholdBps: row.liquidationThresholdBps,
    liquidationBonusBps: row.liquidationBonusBps,
    supplyCap: amt(row.supplyCap, loan.decimals, loan.symbol),
    borrowCap: amt(row.borrowCap, loan.decimals, loan.symbol),
    defaultPositionCap: amt(
      row.deliveryMode === "restricted" ? "25000000000" : row.borrowCap,
      loan.decimals,
      loan.symbol,
    ),
    minBorrow: amt("10000000", loan.decimals, loan.symbol),
    minSupply: amt("1000000", loan.decimals, loan.symbol),
    recallWindowSeconds: row.chainId === 31337 ? 300 : 3600,
    recallDeadline: row.recallDeadline,
    supplyFrozen: row.supplyFrozen,
    borrowFrozen: row.borrowFrozen,
    recallActive: row.recallActive,
  };
}

export function mapPosition(row: Position, market?: MarketSummary | MarketDetailDto): PositionDto {
  const listed = catalogById(row.chainId, row.marketId);
  const loanSymbol = market && "loan" in market ? market.loan.symbol : (listed?.loanSymbol ?? "mUSDC");
  const collSymbol = market && "collateral" in market ? market.collateral.symbol : (listed?.collateralSymbol ?? "mWETH");
  const loanDecimals = market && "loan" in market ? market.loan.decimals : 6;
  const collDecimals = market && "collateral" in market ? market.collateral.decimals : 18;
  return {
    chainId: row.chainId,
    marketId: row.marketId,
    address: asAddr(row.marketAddress),
    owner: asAddr(row.owner),
    marketLabel: listed?.label ?? row.marketId,
    deliveryMode: row.deliveryMode,
    debt: amt(row.projectedDebt, loanDecimals, loanSymbol),
    principal: amt(row.principalOutstanding, loanDecimals, loanSymbol),
    collateral: amt(row.collateral, collDecimals, collSymbol),
    collateralValueLoan: amt(row.collateralValueLoan ?? "0", loanDecimals, loanSymbol),
    collateralUsdWad: "0",
    supplyAssets: amt(row.supplyAssets, loanDecimals, loanSymbol),
    maxWithdraw: amt(row.maxWithdraw, loanDecimals, loanSymbol),
    healthFactorWad: row.healthFactorWad,
    healthCode: row.healthCode,
    liquidatable: row.liquidatable,
    maxBorrow: amt("0", loanDecimals, loanSymbol),
    defaulted: row.defaulted,
    writtenOffLiability: amt(row.writtenOffLiability, loanDecimals, loanSymbol),
    vaultAddress: row.vault ? asAddr(row.vault) : null,
    recallActive: market && "recallActive" in market ? Boolean(market.recallActive) : false,
    recallDeadline: market && "recallDeadline" in market ? market.recallDeadline : "0",
    freshness: freshnessUi(row.freshness),
  };
}

export function emptyPosition(chainId: number, marketId: string, owner: string, market?: MarketDetailDto): PositionDto {
  const listed = catalogById(chainId, marketId);
  const loanSymbol = market?.loan.symbol ?? listed?.loanSymbol ?? "mUSDC";
  const collSymbol = market?.collateral.symbol ?? listed?.collateralSymbol ?? "mWETH";
  const loanDecimals = market?.loan.decimals ?? 6;
  const collDecimals = market?.collateral.decimals ?? 18;
  const address = (market?.address ?? listed?.address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
  return {
    chainId,
    marketId: listed?.id ?? marketId,
    address,
    owner: owner as `0x${string}`,
    marketLabel: listed?.label ?? market?.label ?? marketId,
    deliveryMode: listed?.deliveryMode ?? market?.deliveryMode ?? "wallet",
    debt: amt("0", loanDecimals, loanSymbol),
    principal: amt("0", loanDecimals, loanSymbol),
    collateral: amt("0", collDecimals, collSymbol),
    collateralValueLoan: amt("0", loanDecimals, loanSymbol),
    collateralUsdWad: "0",
    supplyAssets: amt("0", loanDecimals, loanSymbol),
    maxWithdraw: amt("0", loanDecimals, loanSymbol),
    healthFactorWad: null,
    healthCode: "NO_DEBT",
    liquidatable: false,
    maxBorrow: amt("0", loanDecimals, loanSymbol),
    defaulted: false,
    writtenOffLiability: amt("0", loanDecimals, loanSymbol),
    vaultAddress: null,
    recallActive: false,
    recallDeadline: "0",
    freshness: {
      blockNumber: "0",
      blockHash: null,
      indexedAt: new Date(0).toISOString(),
      lagSeconds: 0,
    },
  };
}

export function mapPortfolio(row: PortfolioResponse): PortfolioDto {
  const borrows = row.borrows.map((b) => mapPosition(b));
  const unavailable = borrows.some((b) => b.healthCode === "UNAVAILABLE");
  const ok = borrows.filter((b) => b.healthCode === "OK" && b.healthFactorWad);
  let lowestHealthCode: HealthCode | "NONE" = "NONE";
  if (unavailable) lowestHealthCode = "UNAVAILABLE";
  else if (ok.length > 0) lowestHealthCode = "OK";
  else if (borrows.length > 0) lowestHealthCode = "NO_DEBT";

  return {
    chainId: row.chainId,
    address: asAddr(row.address),
    supplies: row.supplies.map((s: SupplyHolding) => {
      const listed = catalogById(s.chainId, s.marketId);
      return {
        marketId: s.marketId,
        label: listed?.label ?? s.marketId,
        deliveryMode: listed?.deliveryMode ?? "wallet",
        assets: amt(s.supplyAssets, 6, listed?.loanSymbol ?? "mUSDC"),
        maxWithdraw: amt(s.maxWithdraw, 6, listed?.loanSymbol ?? "mUSDC"),
        apyGrowthRay: "1000000000000000000000000000",
      };
    }),
    borrows: borrows.map((b) => ({
      marketId: b.marketId,
      label: b.marketLabel,
      deliveryMode: b.deliveryMode,
      debt: b.debt,
      collateral: b.collateral,
      collateralUsdWad: b.collateralUsdWad,
      healthFactorWad: b.healthFactorWad,
      healthCode: b.healthCode,
      liquidatable: b.liquidatable,
    })),
    lowestHealthFactorWad: row.lowestHealthFactorWad,
    lowestHealthCode,
    freshness: freshnessUi(row.freshness),
  };
}

export function mapEvent(row: IndexedEvent): EventDto {
  const detail = Object.entries(row.args)
    .map(([k, v]) => `${k}=${v}`)
    .join("  ");
  return {
    chainId: row.chainId,
    marketId: row.marketId,
    txHash: asAddr(row.txHash),
    logIndex: row.logIndex,
    blockNumber: row.blockNumber,
    name: row.event,
    detail: detail || row.event,
    at: row.timestamp,
  };
}

export function mapHealthLag(ok: boolean, lagBlocks?: string): ApiHealthDto {
  const lag = lagBlocks && /^(0|[1-9][0-9]*)$/.test(lagBlocks) ? Number(BigInt(lagBlocks)) : 0;
  return { ok, lagSeconds: Number.isFinite(lag) ? lag : 0, usingStub: false };
}
