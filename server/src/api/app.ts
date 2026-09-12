import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  EVENTS_DEFAULT_LIMIT,
  EVENTS_MAX_LIMIT,
  POSITIONS_PAGE_SIZE,
} from "@interline/api-types";
import type { ChainConfig } from "../domain.js";
import { dec } from "../domain.js";
import type { IndexerStore } from "../db/store.js";
import { chainLag } from "../health/lag.js";
import { chainName } from "../indexer/deployments.js";
import { projectPosition } from "../indexer/project.js";
import {
  afterPositionCursor,
  cmpActiveLoan,
  decodeEventCursor,
  decodePositionCursor,
  encodeCursor,
} from "./cursor.js";
import { freshnessOf, projectionTimestamp, serializeMarket, serializePosition } from "./serialize.js";

export type AppContext = {
  store: IndexerStore;
  configs: ChainConfig[];
};

function parseChainId(raw: string): number | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  return Number(raw);
}

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();
  app.use("*", cors());

  app.get("/health", async (c) => {
    let db = false;
    try {
      db = await ctx.store.ping();
    } catch {
      db = false;
    }
    return c.json({ ok: db, db, service: "interline-indexer" as const }, db ? 200 : 503);
  });

  app.get("/health/lag", async (c) => {
    return c.json(await chainLag(ctx.store, ctx.configs));
  });

  app.get("/v1/health", async (c) => {
    const lag = await app.request("/health/lag");
    return new Response(lag.body, { status: lag.status, headers: { "content-type": "application/json" } });
  });

  app.get("/v1/chains", async (c) => {
    const chains = [];
    for (const config of ctx.configs) {
      const cursor = await ctx.store.getCursor(config.chainId);
      const markets = await ctx.store.listMarkets(config.chainId);
      chains.push({
        chainId: config.chainId,
        name: chainName(config.chainId),
        factory: config.factory,
        startBlock: dec(config.startBlock),
        oracleMode: "simulated" as const,
        marketCount: markets.length,
        freshness: freshnessOf(cursor, "UNAVAILABLE"),
      });
    }
    return c.json({ chains });
  });

  app.get("/v1/markets", async (c) => {
    const chainQ = c.req.query("chainId");
    const chainId = chainQ ? parseChainId(chainQ) : undefined;
    if (chainQ && chainId === null) return c.json({ error: "invalid chainId" }, 400);
    const markets = await ctx.store.listMarkets(chainId);
    const body = [];
    for (const market of markets) {
      const cursor = await ctx.store.getCursor(market.chainId);
      body.push(serializeMarket(market, cursor, projectionTimestamp(cursor)));
    }
    return c.json({ markets: body });
  });

  app.get("/v1/markets/:chainId/:marketId", async (c) => {
    const chainId = parseChainId(c.req.param("chainId"));
    if (chainId === null) return c.json({ error: "invalid chainId" }, 400);
    const market = await ctx.store.getMarket(chainId, c.req.param("marketId"));
    if (!market) return c.json({ error: "market not found" }, 404);
    const cursor = await ctx.store.getCursor(chainId);
    return c.json({ market: serializeMarket(market, cursor, projectionTimestamp(cursor)) });
  });

  app.get("/v1/positions", async (c) => {
    const chainQ = c.req.query("chainId");
    const chainId = chainQ ? parseChainId(chainQ) : undefined;
    if (chainQ && chainId === null) return c.json({ error: "invalid chainId" }, 400);
    const marketId = c.req.query("marketId");
    const ownerQ = c.req.query("owner");
    const activeOnly = (c.req.query("active") ?? "true") !== "false";
    const cursorTok = decodePositionCursor(c.req.query("cursor"));

    const markets = await ctx.store.listMarkets(chainId);
    const marketMap = new Map(markets.map((m) => [`${m.chainId}:${m.address.toLowerCase()}`, m]));
    const positions = await ctx.store.listPositions(chainId);
    const serialized = [];
    for (const position of positions) {
      if (marketId && position.marketId !== marketId && position.marketAddress.toLowerCase() !== marketId.toLowerCase()) {
        continue;
      }
      if (ownerQ && position.owner.toLowerCase() !== ownerQ.toLowerCase()) continue;
      const market = marketMap.get(`${position.chainId}:${position.marketAddress.toLowerCase()}`);
      if (!market) continue;
      const cursor = await ctx.store.getCursor(position.chainId);
      const row = serializePosition(market, position, cursor, projectionTimestamp(cursor));
      if (activeOnly && BigInt(row.projectedDebt) === 0n) continue;
      serialized.push(row);
    }
    serialized.sort(cmpActiveLoan);
    const page = [];
    for (const row of serialized) {
      if (cursorTok && !afterPositionCursor(row, cursorTok)) continue;
      page.push(row);
      if (page.length === POSITIONS_PAGE_SIZE) break;
    }
    const last = page[page.length - 1];
    const nextCursor =
      page.length === POSITIONS_PAGE_SIZE && last
        ? encodeCursor({
            debt: last.projectedDebt,
            chainId: last.chainId,
            marketId: last.marketId,
            owner: last.owner,
          })
        : null;
    return c.json({ positions: page, nextCursor, limit: POSITIONS_PAGE_SIZE });
  });

  app.get("/v1/positions/:chainId/:marketId/:owner", async (c) => {
    const chainId = parseChainId(c.req.param("chainId"));
    if (chainId === null) return c.json({ error: "invalid chainId" }, 400);
    const market = await ctx.store.getMarket(chainId, c.req.param("marketId"));
    if (!market) return c.json({ error: "market not found" }, 404);
    const position = await ctx.store.getPosition(chainId, market.marketId, c.req.param("owner"));
    if (!position) return c.json({ error: "position not found" }, 404);
    const cursor = await ctx.store.getCursor(chainId);
    return c.json({
      position: serializePosition(market, position, cursor, projectionTimestamp(cursor)),
    });
  });

  app.get("/v1/accounts/:chainId/:address/portfolio", async (c) => {
    const chainId = parseChainId(c.req.param("chainId"));
    if (chainId === null) return c.json({ error: "invalid chainId" }, 400);
    const address = c.req.param("address").toLowerCase();
    const cursor = await ctx.store.getCursor(chainId);
    const ts = projectionTimestamp(cursor);
    const markets = await ctx.store.listMarkets(chainId);
    const positions = (await ctx.store.listPositions(chainId)).filter((p) => p.owner.toLowerCase() === address);
    const supplies = [];
    const borrows = [];
    let lowest: bigint | null = null;
    for (const position of positions) {
      const market = markets.find((m) => m.marketId === position.marketId);
      if (!market) continue;
      const proj = projectPosition(market, position, ts);
      if (position.supplyShares > 0n) {
        supplies.push({
          chainId,
          marketId: position.marketId,
          marketAddress: position.marketAddress,
          owner: position.owner,
          supplyShares: position.supplyShares.toString(10),
          supplyAssets: proj.supplyAssets.toString(10),
          maxWithdraw: proj.maxWithdraw.toString(10),
        });
      }
      if (proj.projectedDebt > 0n || position.collateral > 0n || position.defaulted) {
        const row = serializePosition(market, position, cursor, ts);
        borrows.push(row);
        if (proj.healthCode === "OK" && proj.healthFactorWad !== null) {
          if (lowest === null || proj.healthFactorWad < lowest) lowest = proj.healthFactorWad;
        }
      }
    }
    return c.json({
      chainId,
      address,
      supplies,
      borrows,
      lowestHealthFactorWad: lowest === null ? null : lowest.toString(10),
      freshness: freshnessOf(cursor, "UNAVAILABLE"),
    });
  });

  app.get("/v1/events", async (c) => {
    const chainQ = c.req.query("chainId");
    const chainId = chainQ ? parseChainId(chainQ) : undefined;
    if (chainQ && chainId === null) return c.json({ error: "invalid chainId" }, 400);
    const limitRaw = Number(c.req.query("limit") ?? String(EVENTS_DEFAULT_LIMIT));
    const limit = Math.min(EVENTS_MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : EVENTS_DEFAULT_LIMIT));
    const evCursor = decodeEventCursor(c.req.query("cursor"));
    const rows = await ctx.store.listEvents({
      chainId,
      marketId: c.req.query("marketId"),
      address: c.req.query("address"),
      eventName: c.req.query("event"),
      beforeBlock: evCursor ? BigInt(evCursor.blockNumber) : undefined,
      beforeLogIndex: evCursor?.logIndex,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const markets = await ctx.store.listMarkets(chainId);
    const events = page.map((e) => {
      const market = markets.find(
        (m) =>
          m.address.toLowerCase() === e.address.toLowerCase() ||
          e.args.market?.toLowerCase() === m.address.toLowerCase(),
      );
      return {
        chainId: e.chainId,
        marketId: market?.marketId ?? null,
        address: e.address,
        event: e.eventName,
        blockNumber: e.blockNumber.toString(10),
        blockHash: e.blockHash,
        txHash: e.txHash,
        logIndex: e.logIndex,
        timestamp: e.timestamp.toString(10),
        args: e.args,
      };
    });
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({ blockNumber: last.blockNumber.toString(10), logIndex: last.logIndex })
        : null;
    return c.json({ events, nextCursor });
  });

  return app;
}
