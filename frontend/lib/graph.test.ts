import { describe, expect, it } from "vitest";
import { mapGraphActivity } from "./graph";

describe("mapGraphActivity", () => {
  it("maps subgraph rows into activity events", () => {
    const page = mapGraphActivity(
      {
        protocolEvents: [
          {
            chainId: 11155111,
            product: "POOL",
            name: "Supplied",
            marketOrFacility: "0xfc844a015A5174b52e294ADd739d08c17b3578Af",
            detail: "supplier=0xabc  assets=1000000",
            txHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
            logIndex: 2,
            blockNumber: "11695340",
            timestamp: "1710000000",
          },
          {
            name: "SkipMe",
            txHash: "not-a-hash",
          },
        ],
      },
      11155111,
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.name).toBe("Supplied");
    expect(page.items[0]?.product).toBe("POOL");
    expect(page.items[0]?.marketId).toBe("0xfc844a015A5174b52e294ADd739d08c17b3578Af");
    expect(page.items[0]?.logIndex).toBe(2);
    expect(page.nextCursor).toBeNull();
  });

  it("returns an empty page when the payload is missing", () => {
    expect(mapGraphActivity(null, 11155111)).toEqual({ items: [], nextCursor: null });
  });
});
