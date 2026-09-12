import { z } from "zod";
import { ChainId, DecimalString, TxHash } from "./primitives.js";

export const ChainLag = z.object({
  chainId: ChainId,
  name: z.string(),
  startBlock: DecimalString,
  indexedBlockNumber: DecimalString,
  indexedBlockHash: TxHash.nullable(),
  headBlockNumber: DecimalString,
  lagBlocks: DecimalString,
  lastError: z.string().nullable(),
});
export type ChainLag = z.infer<typeof ChainLag>;

export const HealthResponse = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  service: z.literal("interline-indexer"),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const LagResponse = z.object({
  ok: z.boolean(),
  chains: z.array(ChainLag),
});
export type LagResponse = z.infer<typeof LagResponse>;
