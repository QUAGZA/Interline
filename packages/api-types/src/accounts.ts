import { z } from "zod";
import { ChainId, DecimalString, HexAddress } from "./primitives.js";
import { Freshness } from "./freshness.js";
import { Position } from "./positions.js";

export const SupplyHolding = z.object({
  chainId: ChainId,
  marketId: z.string(),
  marketAddress: HexAddress,
  owner: HexAddress,
  supplyShares: DecimalString,
  supplyAssets: DecimalString,
  maxWithdraw: DecimalString,
});
export type SupplyHolding = z.infer<typeof SupplyHolding>;

export const PortfolioResponse = z.object({
  chainId: ChainId,
  address: HexAddress,
  supplies: z.array(SupplyHolding),
  borrows: z.array(Position),
  /** Lowest numerical HF among isolated markets with healthCode OK. Never blended. */
  lowestHealthFactorWad: DecimalString.nullable(),
  freshness: Freshness,
});
export type PortfolioResponse = z.infer<typeof PortfolioResponse>;
