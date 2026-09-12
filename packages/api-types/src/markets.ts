import { z } from "zod";
import {
  ChainId,
  DecimalString,
  DeliveryMode,
  HexAddress,
  MarketStatus,
  OracleMode,
  OracleStatus,
  TokenRef,
} from "./primitives.js";
import { Freshness } from "./freshness.js";

export const MarketSummary = z.object({
  chainId: ChainId,
  marketId: z.string(),
  address: HexAddress,
  label: z.string(),
  deliveryMode: DeliveryMode,
  status: MarketStatus,
  loanToken: TokenRef,
  collateralToken: TokenRef,
  accountedCash: DecimalString,
  totalDebt: DecimalString,
  supplierAssets: DecimalString,
  totalSupplyShares: DecimalString,
  totalDebtShares: DecimalString,
  utilizationRay: DecimalString,
  borrowAprRay: DecimalString,
  supplyAprRay: DecimalString,
  borrowApyGrowthRay: DecimalString,
  supplyApyGrowthRay: DecimalString,
  epochIndexRay: DecimalString,
  epochTimestamp: DecimalString,
  supplyCap: DecimalString,
  borrowCap: DecimalString,
  maxLtvBps: z.number().int(),
  liquidationThresholdBps: z.number().int(),
  liquidationBonusBps: z.number().int(),
  supplyFrozen: z.boolean(),
  borrowFrozen: z.boolean(),
  recallActive: z.boolean(),
  recallDeadline: DecimalString,
  terminal: z.boolean(),
  oracleStatus: OracleStatus,
  oracleMode: OracleMode,
  unaccountedSurplus: DecimalString,
  freshness: Freshness,
});
export type MarketSummary = z.infer<typeof MarketSummary>;

export const MarketsResponse = z.object({
  markets: z.array(MarketSummary),
});
export type MarketsResponse = z.infer<typeof MarketsResponse>;

export const MarketResponse = z.object({
  market: MarketSummary,
});
export type MarketResponse = z.infer<typeof MarketResponse>;
