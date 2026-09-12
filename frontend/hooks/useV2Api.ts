"use client";

import { useQuery } from "@tanstack/react-query";
// Query keys take explicit chain/market/account — never useAccount().chainId.
import { fetchChains, fetchEvents, fetchMarket, fetchMarkets, fetchPortfolio, fetchPosition, fetchPositions } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import type { PositionsQuery } from "@/lib/api/types";
import type { V2ChainId } from "@/lib/chains";

export function useMarketsQuery(chainId?: number) {
  return useQuery({
    queryKey: qk.markets(chainId),
    queryFn: () => fetchMarkets(chainId),
  });
}

export function useMarketQuery(chainId: number, marketId: string, enabled = true) {
  return useQuery({
    queryKey: qk.market(chainId, marketId),
    queryFn: () => fetchMarket(chainId, marketId),
    enabled,
  });
}

export function usePositionsQuery(query: PositionsQuery) {
  return useQuery({
    queryKey: qk.positions(query),
    queryFn: () => fetchPositions(query),
  });
}

export function usePositionQuery(chainId: number, marketId: string, owner: string, enabled = true) {
  return useQuery({
    queryKey: qk.position(chainId, marketId, owner),
    queryFn: () => fetchPosition(chainId, marketId, owner),
    enabled,
  });
}

export function usePortfolioQuery(chainId: V2ChainId, address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: qk.portfolio(chainId, address ?? "0x0000000000000000000000000000000000000000"),
    queryFn: () => fetchPortfolio(chainId, address!),
    enabled: Boolean(address),
  });
}

export function useEventsQuery(chainId?: number, address?: string) {
  return useQuery({
    queryKey: qk.events(chainId, address),
    queryFn: () => fetchEvents(chainId, address),
  });
}

export function useChainsQuery() {
  return useQuery({
    queryKey: qk.chains,
    queryFn: fetchChains,
  });
}
