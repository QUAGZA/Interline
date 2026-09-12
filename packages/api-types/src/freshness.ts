import { z } from "zod";
import { BlockHash, DecimalString, OracleMode, OracleStatus } from "./primitives.js";

export const Freshness = z.object({
  indexedBlockNumber: DecimalString,
  indexedBlockHash: BlockHash.nullable(),
  indexedBlockTimestamp: DecimalString,
  headBlockNumber: DecimalString,
  lagBlocks: DecimalString,
  indexedAt: z.string(),
  oracleStatus: OracleStatus,
  oracleMode: OracleMode,
});
export type Freshness = z.infer<typeof Freshness>;
