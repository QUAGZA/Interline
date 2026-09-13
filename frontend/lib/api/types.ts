/**
 * Public API DTOs. Amounts are decimal integer strings in token base units.
 * Matches Wave 5 `/v1` shapes (packages/api-types) — bigint strings, never JS Number money.
 */

export type DecString = string;
export type AddressString = `0x${string}`;
export type DeliveryMode = "wallet" | "restricted";
export type OracleMode = "simulated";
export type MarketStatus = "active" | "supply_frozen" | "borrow_frozen" | "recall" | "terminal";
export type HealthCode = "NO_DEBT" | "OK" | "UNAVAILABLE";
export type OracleStatus = "ok" | "stale" | "unavailable";

export type TokenRef = {
  address: AddressString;
  symbol: string;
  decimals: number;
  testAsset: true;
};

export type AmountDto = {
  raw: DecString;
  decimals: number;
  symbol: string;
};

export type FreshnessDto = {
  blockNumber: DecString;
  blockHash: AddressString | `0x${string}` | null;
  indexedAt: string;
  indexedBlockTimestamp: DecString;
  lagSeconds: number;
};

export type ChainDto = {
  chainId: number;
  name: string;
  oracleMode: OracleMode;
};

export type MarketSummaryDto = {
  chainId: number;
  /** Indexer slug (e.g. usdc-weth-wallet). Not the spender. */
  marketId: string;
  address: AddressString;
  label: string;
  deliveryMode: DeliveryMode;
  loan: TokenRef;
  collateral: TokenRef;
  supplyApyGrowthRay: DecString;
  borrowAprRay: DecString;
  supplied: AmountDto;
  borrowed: AmountDto;
  liquidity: AmountDto;
  utilizationRay: DecString;
  epochIndexRay: DecString;
  epochTimestamp: DecString;
  status: MarketStatus;
  oracleMode: OracleMode;
  oracleStatus: OracleStatus;
  writable: boolean;
  freshness: FreshnessDto;
};

export type MarketDetailDto = MarketSummaryDto & {
  maxLtvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  supplyCap: AmountDto;
  borrowCap: AmountDto;
  defaultPositionCap: AmountDto;
  minBorrow: AmountDto;
  minSupply: AmountDto;
  recallWindowSeconds: number;
  recallDeadline: DecString;
  supplyFrozen: boolean;
  borrowFrozen: boolean;
  recallActive: boolean;
};

export type PositionDto = {
  chainId: number;
  marketId: string;
  address: AddressString;
  owner: AddressString;
  marketLabel: string;
  deliveryMode: DeliveryMode;
  debt: AmountDto;
  debtShares: DecString;
  principal: AmountDto;
  collateral: AmountDto;
  collateralValueLoan: AmountDto;
  collateralUsdWad: DecString;
  supplyAssets: AmountDto;
  maxWithdraw: AmountDto;
  healthFactorWad: DecString | null;
  healthCode: HealthCode;
  liquidatable: boolean;
  maxBorrow: AmountDto;
  defaulted: boolean;
  writtenOffLiability: AmountDto;
  vaultAddress: AddressString | null;
  recallActive: boolean;
  recallDeadline: DecString;
  freshness: FreshnessDto;
};

export type PositionsPageDto = {
  items: PositionDto[];
  nextCursor: string | null;
  limit: number;
};

export type PortfolioSupplyDto = {
  marketId: string;
  label: string;
  deliveryMode: DeliveryMode;
  assets: AmountDto;
  maxWithdraw: AmountDto;
  apyGrowthRay: DecString;
};

export type PortfolioBorrowDto = {
  marketId: string;
  label: string;
  deliveryMode: DeliveryMode;
  debt: AmountDto;
  collateral: AmountDto;
  collateralUsdWad: DecString;
  healthFactorWad: DecString | null;
  healthCode: HealthCode;
  liquidatable: boolean;
};

export type PortfolioDto = {
  chainId: number;
  address: AddressString;
  supplies: PortfolioSupplyDto[];
  borrows: PortfolioBorrowDto[];
  /** Minimum isolated HF wad among positions with debt. Never a blended ratio. */
  lowestHealthFactorWad: DecString | null;
  lowestHealthCode: HealthCode | "NONE";
  freshness: FreshnessDto;
  directLending?: import("@/features/direct/dto").DirectFacilityDto[];
  directBorrowing?: import("@/features/direct/dto").DirectFacilityDto[];
  directRequests?: import("@/features/direct/dto").DirectFacilityDto[];
};

export type EventDto = {
  chainId: number;
  marketId: string | null;
  txHash: `0x${string}`;
  logIndex: number;
  blockNumber: DecString;
  name: string;
  detail: string;
  at: string;
  product?: "POOL" | "DIRECT";
};

export type EventsPageDto = {
  items: EventDto[];
  nextCursor: string | null;
};

export type ApiHealthDto = {
  ok: boolean;
  lagSeconds: number;
  usingStub: boolean;
};

export type PositionsQuery = {
  chainId?: number;
  marketId?: string;
  deliveryMode?: DeliveryMode | "";
  cursor?: string;
  sort?: "debt";
  limit?: number;
};

export type DataSource = "indexer" | "rpc" | "stub" | "unavailable" | "graph";

export type Envelope<T> = {
  data: T;
  usingStub: boolean;
  stale?: boolean;
  source?: DataSource;
};
