import { z } from "zod";
import {
  ChainId,
  DecimalString,
  DeliveryMode,
  HealthCode,
  HexAddress,
  POSITIONS_PAGE_SIZE,
} from "./primitives.js";
import { Freshness } from "./freshness.js";

export const Position = z.object({
  chainId: ChainId,
  marketId: z.string(),
  marketAddress: HexAddress,
  owner: HexAddress,
  deliveryMode: DeliveryMode,
  /** Active loan = projectedDebt > 0. Keyed (chain, market, owner). */
  projectedDebt: DecimalString,
  principalOutstanding: DecimalString,
  debtShares: DecimalString,
  collateral: DecimalString,
  collateralValueLoan: DecimalString.nullable(),
  supplyShares: DecimalString,
  supplyAssets: DecimalString,
  maxWithdraw: DecimalString,
  healthCode: HealthCode,
  healthFactorWad: DecimalString.nullable(),
  liquidatable: z.boolean(),
  defaulted: z.boolean(),
  writtenOffLiability: DecimalString,
  vault: HexAddress.nullable(),
  freshness: Freshness,
});
export type Position = z.infer<typeof Position>;

export const PositionsResponse = z.object({
  positions: z.array(Position),
  nextCursor: z.string().nullable(),
  limit: z.literal(POSITIONS_PAGE_SIZE),
});
export type PositionsResponse = z.infer<typeof PositionsResponse>;

export const PositionResponse = z.object({
  position: Position,
});
export type PositionResponse = z.infer<typeof PositionResponse>;
