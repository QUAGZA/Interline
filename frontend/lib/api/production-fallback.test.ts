import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/onchain-catalog", () => ({
  rpcDirectFacilities: vi.fn(async () => null),
  rpcDirectFacility: vi.fn(async () => null),
  rpcMarketDetail: vi.fn(async () => null),
  rpcMarkets: vi.fn(async () => null),
  rpcPortfolio: vi.fn(async () => null),
  rpcPosition: vi.fn(async () => null),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("production without an indexer", () => {
  it("skips HTTP and never reports fixture loans or activity as live data", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_GRAPH_URL", "");
    const fetch = vi.fn(async () => {
      throw new Error("network disabled in test");
    });
    vi.stubGlobal("fetch", fetch);
    const api = await import("./client");
    const [markets, positions, events, health] = await Promise.all([
      api.fetchMarkets(11155111),
      api.fetchPositions({ chainId: 11155111 }),
      api.fetchEvents(11155111),
      api.fetchHealth(),
    ]);
    expect(fetch).not.toHaveBeenCalled();
    for (const result of [markets, positions, events, health]) {
      expect(result.usingStub).toBe(false);
      expect(result.source).toBe("unavailable");
      expect(result.stale).toBe(true);
    }
    expect(markets.data).toEqual([]);
    expect(positions.data.items).toEqual([]);
    expect(events.data.items).toEqual([]);
    expect(health.data.ok).toBe(false);
  }, 20_000);

  it("prefers The Graph for activity when a query URL is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_GRAPH_URL", "https://graph.example/subgraphs/id/x");
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          protocolEvents: [
            {
              chainId: 11155111,
              product: "DIRECT",
              name: "Funded",
              detail: "funded",
              txHash: `0x${"ab".repeat(32)}`,
              logIndex: 0,
              blockNumber: "1",
              timestamp: "2",
            },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetch);
    const api = await import("./client");
    const events = await api.fetchEvents(11155111);
    expect(events.source).toBe("graph");
    expect(events.usingStub).toBe(false);
    expect(events.data.items[0]?.name).toBe("Funded");
    expect(fetch).toHaveBeenCalled();
  });
});
