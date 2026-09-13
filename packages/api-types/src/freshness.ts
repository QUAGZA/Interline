import { z } from "zod";
import { BlockHash, DecimalString, OracleMode, OracleStatus } from "./primitives";

export const Freshness = z.object({
  indexedBlockNumber: DecimalString,
  indexedBlockHash: BlockHash.nullable(),
  indexedBlockTimestamp: DecimalString,
  headBlockNumber: DecimalString,
  lagBlocks: DecimalString,
  indexedAt: z.string(),
  oracleStatus: OracleStatus,
  oracleMode: OracleMode,
  hydratedBlockNumber: DecimalString,
  hydratedBlockHash: BlockHash.nullable(),
  hydratedBlockTimestamp: DecimalString,
  lastHydratedAt: z.string().nullable(),
  lastPolledAt: z.string(),
  lastError: z.string().nullable(),
  hydrationOk: z.boolean(),
});
export type Freshness = z.infer<typeof Freshness>;
