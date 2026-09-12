import { parseRouteChainId, type V2ChainId } from "./chains";

/** Wave 5 public indexer. Fixture DTOs are used only when this host is unreachable. */
export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);

/**
 * V2 catalog default. Independent of NEXT_PUBLIC_CHAIN_ID (v0 leftover may be Ethereum Sepolia).
 */
export const defaultV2ChainId: V2ChainId =
  parseRouteChainId(process.env.NEXT_PUBLIC_V2_CHAIN_ID) ?? 31337;

export const PAGE_SIZE = 25;
export const ORACLE_LABEL = "Simulated prices / testnet";
