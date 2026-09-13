import { z } from "zod";
import { ChainId, DecimalString, HexAddress, TxHash } from "./primitives";

export const IndexedEvent = z.object({
  chainId: ChainId,
  marketId: z.string().nullable(),
  address: HexAddress,
  event: z.string(),
  product: z.enum(["POOL", "DIRECT"]).optional(),
  blockNumber: DecimalString,
  blockHash: TxHash.nullable(),
  txHash: TxHash,
  logIndex: z.number().int().nonnegative(),
  timestamp: DecimalString,
  args: z.record(z.string(), z.string()),
});
export type IndexedEvent = z.infer<typeof IndexedEvent>;

export const EventsResponse = z.object({
  events: z.array(IndexedEvent),
  nextCursor: z.string().nullable(),
});
export type EventsResponse = z.infer<typeof EventsResponse>;
