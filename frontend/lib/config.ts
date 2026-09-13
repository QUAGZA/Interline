import { parseRouteChainId, type V2ChainId } from "./chains";

/** An absent production indexer skips HTTP immediately and uses honest RPC fallbacks. */
export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8787")).replace(
  /\/$/,
  "",
);

/**
 * V2 catalog default. Independent of NEXT_PUBLIC_CHAIN_ID (v0 leftover may be Ethereum Sepolia).
 */
export const defaultV2ChainId: V2ChainId =
  parseRouteChainId(process.env.NEXT_PUBLIC_V2_CHAIN_ID) ?? (process.env.NODE_ENV === "production" ? 11155111 : 31337);

export const PAGE_SIZE = 25;
export const ORACLE_LABEL = "Simulated prices / testnet";
