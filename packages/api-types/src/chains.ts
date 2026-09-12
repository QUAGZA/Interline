import { z } from "zod";
import { ChainId, DecimalString, HexAddress, OracleMode } from "./primitives.js";
import { Freshness } from "./freshness.js";

export const ChainSummary = z.object({
  chainId: ChainId,
  name: z.string(),
  factory: HexAddress.nullable(),
  startBlock: DecimalString,
  oracleMode: OracleMode,
  marketCount: z.number().int().nonnegative(),
  freshness: Freshness,
});
export type ChainSummary = z.infer<typeof ChainSummary>;

export const ChainsResponse = z.object({
  chains: z.array(ChainSummary),
});
export type ChainsResponse = z.infer<typeof ChainsResponse>;
