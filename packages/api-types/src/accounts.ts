import { z } from "zod";
import { ChainId, DecimalString, HexAddress } from "./primitives";
import { Freshness } from "./freshness";
import { Position } from "./positions";
import { DirectFacility } from "./direct-facilities";

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
  directLending: z.array(DirectFacility).default([]),
  directBorrowing: z.array(DirectFacility).default([]),
  directRequests: z.array(DirectFacility).default([]),
  freshness: Freshness,
});
export type PortfolioResponse = z.infer<typeof PortfolioResponse>;
