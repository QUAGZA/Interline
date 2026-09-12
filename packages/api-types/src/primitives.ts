import { z } from "zod";

/** Decimal string for uint256 / token amounts. Never JS Number. */
export const DecimalString = z.string().regex(/^(0|[1-9][0-9]*)$/);
export type DecimalString = z.infer<typeof DecimalString>;

export const HexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export type HexAddress = z.infer<typeof HexAddress>;

export const TxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export type TxHash = z.infer<typeof TxHash>;

export const BlockHash = TxHash;
export type BlockHash = z.infer<typeof BlockHash>;

export const ChainId = z.number().int().positive();
export type ChainId = z.infer<typeof ChainId>;

export const DeliveryMode = z.enum(["wallet", "restricted"]);
export type DeliveryMode = z.infer<typeof DeliveryMode>;

export const OracleStatus = z.enum(["OK", "STALE", "SEQUENCER_DOWN", "INVALID", "UNAVAILABLE"]);
export type OracleStatus = z.infer<typeof OracleStatus>;

export const OracleMode = z.enum(["simulated"]);
export type OracleMode = z.infer<typeof OracleMode>;

export const HealthCode = z.enum(["NO_DEBT", "OK", "UNAVAILABLE"]);
export type HealthCode = z.infer<typeof HealthCode>;

export const MarketStatus = z.enum(["active", "supply_frozen", "borrow_frozen", "recall", "terminal"]);
export type MarketStatus = z.infer<typeof MarketStatus>;

export const TokenRef = z.object({
  address: HexAddress,
  symbol: z.string(),
  decimals: z.number().int().min(6).max(18),
});
export type TokenRef = z.infer<typeof TokenRef>;

export const POSITIONS_PAGE_SIZE = 25;
export const EVENTS_DEFAULT_LIMIT = 25;
export const EVENTS_MAX_LIMIT = 100;
