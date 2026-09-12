import { describe, expect, it } from "vitest";
import {
  ChainsResponse,
  DecimalString,
  EventsResponse,
  LagResponse,
  MarketsResponse,
  PortfolioResponse,
  PositionsResponse,
} from "@interline/api-types";

describe("api-types zod", () => {
  it("accepts bigint decimal strings and rejects floats", () => {
    expect(DecimalString.parse("0")).toBe("0");
    expect(DecimalString.parse("1000000")).toBe("1000000");
    expect(() => DecimalString.parse("1.5")).toThrow();
    expect(() => DecimalString.parse("01")).toThrow();
  });

  it("parses envelope shapes", () => {
    expect(ChainsResponse.parse({ chains: [] }).chains).toEqual([]);
    expect(MarketsResponse.parse({ markets: [] }).markets).toEqual([]);
    expect(PositionsResponse.parse({ positions: [], nextCursor: null, limit: 25 }).limit).toBe(25);
    expect(EventsResponse.parse({ events: [], nextCursor: null }).events).toEqual([]);
    expect(LagResponse.parse({ ok: true, chains: [] }).ok).toBe(true);
    expect(
      PortfolioResponse.parse({
        chainId: 31337,
        address: "0x0000000000000000000000000000000000000001",
        supplies: [],
        borrows: [],
        lowestHealthFactorWad: null,
        freshness: {
          indexedBlockNumber: "0",
          indexedBlockHash: null,
          indexedBlockTimestamp: "0",
          headBlockNumber: "0",
          lagBlocks: "0",
          indexedAt: "1970-01-01T00:00:00.000Z",
          oracleStatus: "UNAVAILABLE",
          oracleMode: "simulated",
        },
      }).chainId,
    ).toBe(31337);
  });
});
