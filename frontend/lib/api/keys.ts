import { PAGE_SIZE } from "@/lib/config";
import type { V2ChainId } from "@/lib/chains";
import type { AddressString, PositionsQuery } from "./types";

/** Keys bind route/catalog chain, market, and account — never wallet chainId. */
export const qk = {
  health: ["v2", "health"] as const,
  chains: ["v2", "chains"] as const,
  markets: (chainId?: number) => ["v2", "markets", chainId ?? "all"] as const,
  market: (chainId: number, marketId: string) => ["v2", "market", chainId, marketId.toLowerCase()] as const,
  positions: (q: PositionsQuery) =>
    [
      "v2",
      "positions",
      q.chainId ?? "all",
      (q.marketId ?? "all").toLowerCase(),
      q.deliveryMode ?? "all",
      q.cursor ?? "",
      q.sort ?? "debt",
      q.limit ?? PAGE_SIZE,
    ] as const,
  position: (chainId: number, marketId: string, owner: string) =>
    ["v2", "position", chainId, marketId.toLowerCase(), owner.toLowerCase()] as const,
  portfolio: (chainId: V2ChainId, address: AddressString) =>
    ["v2", "portfolio", chainId, address.toLowerCase()] as const,
  events: (chainId?: number, address?: string) =>
    ["v2", "events", chainId ?? "all", address?.toLowerCase() ?? "all"] as const,
  directFacilities: (chainId?: number, party?: string, role?: string) =>
    ["v2", "direct", chainId ?? "all", party?.toLowerCase() ?? "all", role ?? "either"] as const,
  directFacility: (chainId: number, facility: string) =>
    ["v2", "direct-one", chainId, facility.toLowerCase()] as const,
};
