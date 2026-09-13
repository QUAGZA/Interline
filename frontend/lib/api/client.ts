import {
  ChainsResponse,
  EventsResponse,
  HealthResponse,
  LagResponse,
  MarketResponse,
  MarketsResponse,
  PortfolioResponse,
  PositionResponse,
  PositionsResponse,
  DirectFacilitiesResponse,
  DirectFacilityResponse,
} from "@interline/api-types";
import { catalogSlugForMode, chainHasLiveMarkets, directChainConfig, withCatalogTokens } from "@/lib/catalog";
import { apiBaseUrl } from "@/lib/config";
import {
  rpcDirectFacilities,
  rpcDirectFacility,
  rpcMarketDetail,
  rpcMarkets,
  rpcPortfolio,
  rpcPosition,
} from "@/lib/onchain-catalog";
import {
  emptyPosition,
  mapChain,
  mapEvent,
  mapHealthLag,
  mapMarketDetail,
  mapMarketSummary,
  mapPortfolio,
  mapPosition,
} from "./map";
import {
  stubChains,
  stubEvents,
  stubHealth,
  stubMarket,
  stubMarkets,
  stubPortfolio,
  stubPosition,
  stubPositions,
} from "./stubs";
import type {
  AddressString,
  ApiHealthDto,
  ChainDto,
  Envelope,
  EventsPageDto,
  MarketDetailDto,
  MarketSummaryDto,
  PortfolioDto,
  PositionDto,
  PositionsPageDto,
  PositionsQuery,
} from "./types";

/** True after any successful live indexer parse this session. */
let liveIndexer = false;
const lastKnown = new Map<string, unknown>();

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function getJson(path: string): Promise<{ ok: true; status: number; json: unknown } | { ok: false }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${apiBaseUrl}${path}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    const json: unknown = await res.json().catch(() => null);
    return { ok: true, status: res.status, json };
  } catch {
    return { ok: false };
  }
}

function remember<T>(key: string, data: T): Envelope<T> {
  liveIndexer = true;
  lastKnown.set(key, data);
  return { data, usingStub: false, stale: false, source: "indexer" };
}

function recover<T>(key: string, stub: () => T, empty: () => T): Envelope<T> {
  if (lastKnown.has(key)) {
    return { data: lastKnown.get(key) as T, usingStub: false, stale: true, source: "indexer" };
  }
  if (liveIndexer) {
    return { data: empty(), usingStub: false, stale: true, source: "indexer" };
  }
  return { data: stub(), usingStub: true, source: "stub" };
}

function rpcOk<T>(data: T): Envelope<T> {
  return { data, usingStub: false, source: "rpc" };
}

function chainHasRpcFallback(chainId: number): boolean {
  return chainHasLiveMarkets(chainId) || Boolean(directChainConfig(chainId)?.directFactory);
}

function emptyPortfolio(chainId: number, address: string): PortfolioDto {
  return {
    chainId,
    address: address as AddressString,
    supplies: [],
    borrows: [],
    lowestHealthFactorWad: null,
    lowestHealthCode: "NONE",
    freshness: { blockNumber: "0", blockHash: null, indexedAt: new Date(0).toISOString(), indexedBlockTimestamp: "0", lagSeconds: 0 },
    directLending: [],
    directBorrowing: [],
    directRequests: [],
  };
}

export async function fetchHealth(): Promise<Envelope<ApiHealthDto>> {
  const key = "health";
  const res = await getJson("/v1/health");
  if (!res.ok) return recover(key, stubHealth, () => ({ ok: false, lagSeconds: 0, usingStub: false }));
  const lag = LagResponse.safeParse(res.json);
  if (lag.success) {
    const first = lag.data.chains[0];
    return remember(key, mapHealthLag(lag.data.ok, first?.lagBlocks));
  }
  const health = HealthResponse.safeParse(res.json);
  if (health.success) return remember(key, mapHealthLag(health.data.ok));
  return recover(key, stubHealth, () => ({ ok: false, lagSeconds: 0, usingStub: false }));
}

export async function fetchChains(): Promise<Envelope<ChainDto[]>> {
  const key = "chains";
  const res = await getJson("/v1/chains");
  if (!res.ok) return recover(key, stubChains, () => []);
  const parsed = ChainsResponse.safeParse(res.json);
  if (!parsed.success) return recover(key, stubChains, () => []);
  return remember(key, parsed.data.chains.map(mapChain));
}

export async function fetchMarkets(chainId?: number): Promise<Envelope<MarketSummaryDto[]>> {
  const key = `markets:${chainId ?? "all"}`;
  const res = await getJson(`/v1/markets${qs({ chainId })}`);
  if (res.ok) {
    const parsed = MarketsResponse.safeParse(res.json);
    if (parsed.success) return remember(key, parsed.data.markets.map((row) => withCatalogTokens(mapMarketSummary(row))));
  }
  const rpc = await rpcMarkets(chainId);
  if (rpc) return rpcOk(rpc);
  return recover(
    key,
    () => stubMarkets(chainId).map((row) => withCatalogTokens(row)),
    () => [],
  );
}

export async function fetchMarket(
  chainId: number,
  marketId: string,
): Promise<Envelope<MarketDetailDto | null>> {
  const key = `market:${chainId}:${marketId}`;
  const res = await getJson(`/v1/markets/${chainId}/${marketId}`);
  if (res.ok && res.status !== 404) {
    const parsed = MarketResponse.safeParse(res.json);
    if (parsed.success) return remember(key, withCatalogTokens(mapMarketDetail(parsed.data.market)));
  }
  const rpc = await rpcMarketDetail(chainId, marketId);
  if (rpc) return rpcOk(rpc);
  if (res.ok && res.status === 404) return remember(key, null);
  return recover(key, () => {
    const stub = stubMarket(chainId, marketId);
    return stub ? withCatalogTokens(stub) : null;
  }, () => null);
}

export async function fetchPositions(query: PositionsQuery): Promise<Envelope<PositionsPageDto>> {
  const marketId =
    query.marketId ||
    (query.deliveryMode ? catalogSlugForMode(query.chainId ?? 0, query.deliveryMode) : undefined);
  const key = `positions:${query.chainId ?? "all"}:${marketId ?? ""}:${query.cursor ?? ""}`;
  const empty = (): PositionsPageDto => ({ items: [], nextCursor: null, limit: query.limit ?? 25 });
  const res = await getJson(
    `/v1/positions${qs({
      chainId: query.chainId,
      marketId,
      cursor: query.cursor,
    })}`,
  );
  if (res.ok) {
    const parsed = PositionsResponse.safeParse(res.json);
    if (parsed.success) {
      return remember(key, {
        items: parsed.data.positions.map((p) => mapPosition(p)),
        nextCursor: parsed.data.nextCursor,
        limit: parsed.data.limit,
      });
    }
  }
  if (query.chainId !== undefined && chainHasLiveMarkets(query.chainId)) {
    return rpcOk(empty());
  }
  return recover(key, () => stubPositions(query), empty);
}

export async function fetchPosition(
  chainId: number,
  marketId: string,
  owner: string,
): Promise<Envelope<PositionDto | null>> {
  const key = `position:${chainId}:${marketId}:${owner.toLowerCase()}`;
  const res = await getJson(`/v1/positions/${chainId}/${marketId}/${owner}`);
  if (res.ok && res.status !== 404) {
    const parsed = PositionResponse.safeParse(res.json);
    if (parsed.success) return remember(key, mapPosition(parsed.data.position));
  }
  const rpc = await rpcPosition(chainId, marketId, owner);
  if (rpc) return rpcOk(rpc);
  if (res.ok && res.status === 404) {
    liveIndexer = true;
    const market = await fetchMarket(chainId, marketId);
    const data = emptyPosition(chainId, marketId, owner, market.data ?? undefined);
    lastKnown.set(key, data);
    return { data, usingStub: market.usingStub, stale: market.stale, source: market.source };
  }
  return recover(key, () => stubPosition(chainId, marketId, owner), () => null);
}

export async function fetchPortfolio(chainId: number, address: string): Promise<Envelope<PortfolioDto>> {
  const key = `portfolio:${chainId}:${address.toLowerCase()}`;
  const res = await getJson(`/v1/accounts/${chainId}/${address}/portfolio`);
  if (res.ok) {
    const parsed = PortfolioResponse.safeParse(res.json);
    if (parsed.success) {
      const mapped = mapPortfolio(parsed.data);
      const missingDirect =
        !(mapped.directRequests?.length || mapped.directLending?.length || mapped.directBorrowing?.length);
      if (missingDirect) {
        const rpc = await rpcPortfolio(chainId, address);
        if (rpc) {
          return remember(key, {
            ...mapped,
            directLending: rpc.directLending,
            directBorrowing: rpc.directBorrowing,
            directRequests: rpc.directRequests,
          });
        }
      }
      return remember(key, mapped);
    }
  }
  const rpc = await rpcPortfolio(chainId, address);
  if (rpc) return rpcOk(rpc);
  if (chainHasRpcFallback(chainId)) {
    return { data: emptyPortfolio(chainId, address), usingStub: false, stale: true, source: "rpc" };
  }
  return recover(key, () => stubPortfolio(chainId, address), () => emptyPortfolio(chainId, address));
}

export async function fetchEvents(chainId?: number, address?: string): Promise<Envelope<EventsPageDto>> {
  const key = `events:${chainId ?? "all"}:${address ?? ""}`;
  const empty = (): EventsPageDto => ({ items: [], nextCursor: null });
  const res = await getJson(`/v1/events${qs({ chainId, address })}`);
  if (!res.ok) return recover(key, () => stubEvents(chainId, address), empty);
  const parsed = EventsResponse.safeParse(res.json);
  if (!parsed.success) return recover(key, () => stubEvents(chainId, address), empty);
  return remember(key, { items: parsed.data.events.map(mapEvent), nextCursor: parsed.data.nextCursor });
}

export async function fetchDirectFacilities(args: {
  chainId?: number;
  party?: string;
  role?: string;
}): Promise<Envelope<import("@/features/direct/dto").DirectFacilityDto[]>> {
  const key = `directs:${args.chainId ?? "all"}:${args.party ?? ""}:${args.role ?? ""}`;
  const res = await getJson(`/v1/direct-facilities${qs({ chainId: args.chainId, party: args.party, role: args.role })}`);
  if (res.ok) {
    const parsed = DirectFacilitiesResponse.safeParse(res.json);
    if (parsed.success) {
      const mapped = parsed.data.facilities as import("@/features/direct/dto").DirectFacilityDto[];
      if (mapped.length > 0) return remember(key, mapped);
    }
  }
  const rpc = await rpcDirectFacilities(args);
  if (rpc) return rpcOk(rpc);
  return recover(key, () => [], () => []);
}

export async function fetchDirectFacility(
  chainId: number,
  facility: string,
): Promise<Envelope<import("@/features/direct/dto").DirectFacilityDto | null>> {
  const key = `direct:${chainId}:${facility.toLowerCase()}`;
  const res = await getJson(`/v1/direct-facilities/${chainId}/${facility}`);
  if (res.ok && res.status !== 404) {
    const parsed = DirectFacilityResponse.safeParse(res.json);
    if (parsed.success) return remember(key, parsed.data.facility as import("@/features/direct/dto").DirectFacilityDto);
  }
  const rpc = await rpcDirectFacility(chainId, facility);
  if (rpc) return rpcOk(rpc);
  if (res.ok && res.status === 404) return remember(key, null);
  return recover(key, () => null, () => null);
}
