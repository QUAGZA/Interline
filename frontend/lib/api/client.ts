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
} from "@interline/api-types";
import { catalogSlugForMode } from "@/lib/catalog";
import { apiBaseUrl } from "@/lib/config";
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

export async function fetchHealth(): Promise<Envelope<ApiHealthDto>> {
  const res = await getJson("/v1/health");
  if (!res.ok) return { data: stubHealth(), usingStub: true };
  const lag = LagResponse.safeParse(res.json);
  if (lag.success) {
    const first = lag.data.chains[0];
    return { data: mapHealthLag(lag.data.ok, first?.lagBlocks), usingStub: false };
  }
  const health = HealthResponse.safeParse(res.json);
  if (health.success) return { data: mapHealthLag(health.data.ok), usingStub: false };
  return { data: stubHealth(), usingStub: true };
}

export async function fetchChains(): Promise<Envelope<ChainDto[]>> {
  const res = await getJson("/v1/chains");
  if (!res.ok) return { data: stubChains(), usingStub: true };
  const parsed = ChainsResponse.safeParse(res.json);
  if (!parsed.success) return { data: stubChains(), usingStub: true };
  return { data: parsed.data.chains.map(mapChain), usingStub: false };
}

export async function fetchMarkets(chainId?: number): Promise<Envelope<MarketSummaryDto[]>> {
  const res = await getJson(`/v1/markets${qs({ chainId })}`);
  if (!res.ok) return { data: stubMarkets(chainId), usingStub: true };
  const parsed = MarketsResponse.safeParse(res.json);
  if (!parsed.success) return { data: stubMarkets(chainId), usingStub: true };
  return { data: parsed.data.markets.map(mapMarketSummary), usingStub: false };
}

export async function fetchMarket(
  chainId: number,
  marketId: string,
): Promise<Envelope<MarketDetailDto | null>> {
  const res = await getJson(`/v1/markets/${chainId}/${marketId}`);
  if (!res.ok) return { data: stubMarket(chainId, marketId), usingStub: true };
  if (res.status === 404) return { data: null, usingStub: false };
  const parsed = MarketResponse.safeParse(res.json);
  if (!parsed.success) return { data: stubMarket(chainId, marketId), usingStub: true };
  return { data: mapMarketDetail(parsed.data.market), usingStub: false };
}

export async function fetchPositions(query: PositionsQuery): Promise<Envelope<PositionsPageDto>> {
  const marketId =
    query.marketId ||
    (query.deliveryMode ? catalogSlugForMode(query.chainId ?? 0, query.deliveryMode) : undefined);
  const res = await getJson(
    `/v1/positions${qs({
      chainId: query.chainId,
      marketId,
      cursor: query.cursor,
    })}`,
  );
  if (!res.ok) return { data: stubPositions(query), usingStub: true };
  const parsed = PositionsResponse.safeParse(res.json);
  if (!parsed.success) return { data: stubPositions(query), usingStub: true };
  return {
    data: {
      items: parsed.data.positions.map((p) => mapPosition(p)),
      nextCursor: parsed.data.nextCursor,
      limit: parsed.data.limit,
    },
    usingStub: false,
  };
}

export async function fetchPosition(
  chainId: number,
  marketId: string,
  owner: string,
): Promise<Envelope<PositionDto | null>> {
  const res = await getJson(`/v1/positions/${chainId}/${marketId}/${owner}`);
  if (!res.ok) return { data: stubPosition(chainId, marketId, owner), usingStub: true };
  if (res.status === 404) {
    const market = await fetchMarket(chainId, marketId);
    return {
      data: emptyPosition(chainId, marketId, owner, market.data ?? undefined),
      usingStub: market.usingStub,
    };
  }
  const parsed = PositionResponse.safeParse(res.json);
  if (!parsed.success) return { data: stubPosition(chainId, marketId, owner), usingStub: true };
  return { data: mapPosition(parsed.data.position), usingStub: false };
}

export async function fetchPortfolio(chainId: number, address: string): Promise<Envelope<PortfolioDto>> {
  const res = await getJson(`/v1/accounts/${chainId}/${address}/portfolio`);
  if (!res.ok) return { data: stubPortfolio(chainId, address), usingStub: true };
  const parsed = PortfolioResponse.safeParse(res.json);
  if (!parsed.success) return { data: stubPortfolio(chainId, address), usingStub: true };
  return { data: mapPortfolio(parsed.data), usingStub: false };
}

export async function fetchEvents(chainId?: number, address?: string): Promise<Envelope<EventsPageDto>> {
  const res = await getJson(`/v1/events${qs({ chainId, address })}`);
  if (!res.ok) return { data: stubEvents(chainId, address), usingStub: true };
  const parsed = EventsResponse.safeParse(res.json);
  if (!parsed.success) return { data: stubEvents(chainId, address), usingStub: true };
  return {
    data: { items: parsed.data.events.map(mapEvent), nextCursor: parsed.data.nextCursor },
    usingStub: false,
  };
}
