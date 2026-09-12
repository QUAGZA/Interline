import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  asAddress,
  type ChainConfig,
  type CursorRecord,
  type Hex,
  type IndexedEventRecord,
  type MarketRecord,
  type OracleStatus,
  type PositionRecord,
  type VaultRecord,
} from "../domain.js";
import { emptyMarket } from "./memory.js";
import * as schema from "./schema.js";
import type { EventListQuery, IndexerStore } from "./store.js";

type Db = NodePgDatabase<typeof schema>;

function big(value: string | bigint | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  return BigInt(value);
}

function oracleStatus(value: string | null | undefined): OracleStatus {
  switch (value) {
    case "OK":
    case "STALE":
    case "SEQUENCER_DOWN":
    case "INVALID":
    case "UNAVAILABLE":
      return value;
    default:
      return "UNAVAILABLE";
  }
}

function mapMarket(row: typeof schema.markets.$inferSelect): MarketRecord {
  return {
    chainId: row.chainId,
    marketId: row.marketId,
    address: asAddress(row.address),
    label: row.label,
    deliveryMode: row.deliveryMode === "restricted" ? "restricted" : "wallet",
    loanToken: asAddress(row.loanToken),
    loanSymbol: row.loanSymbol,
    loanDecimals: row.loanDecimals,
    collateralToken: asAddress(row.collateralToken),
    collateralSymbol: row.collateralSymbol,
    collateralDecimals: row.collateralDecimals,
    oracle: row.oracle ? asAddress(row.oracle) : null,
    accountedCash: big(row.accountedCash),
    totalDebtShares: big(row.totalDebtShares),
    totalSupplyShares: big(row.totalSupplyShares),
    epochIndexRay: big(row.epochIndexRay),
    epochTimestamp: big(row.epochTimestamp),
    epochAprRay: big(row.epochAprRay),
    supplyCap: big(row.supplyCap),
    borrowCap: big(row.borrowCap),
    maxLtvBps: row.maxLtvBps,
    liquidationThresholdBps: row.liquidationThresholdBps,
    liquidationBonusBps: row.liquidationBonusBps,
    defaultPositionCap: big(row.defaultPositionCap),
    supplyFrozen: row.supplyFrozen,
    borrowFrozen: row.borrowFrozen,
    recallActive: row.recallActive,
    recallDeadline: big(row.recallDeadline),
    recallClearableAt: big(row.recallClearableAt),
    terminal: row.terminal,
    unaccountedSurplus: big(row.unaccountedSurplus),
    quoteScale36: big(row.quoteScale36),
    collateralUsdWad: big(row.collateralUsdWad),
    loanUsdWad: big(row.loanUsdWad),
    oracleStatus: oracleStatus(row.oracleStatus),
    oracleMode: "simulated",
  };
}

function mapPosition(row: typeof schema.positions.$inferSelect): PositionRecord {
  return {
    chainId: row.chainId,
    marketId: row.marketId,
    marketAddress: asAddress(row.marketAddress),
    owner: asAddress(row.owner),
    supplyShares: big(row.supplyShares),
    debtShares: big(row.debtShares),
    collateral: big(row.collateral),
    principalOutstanding: big(row.principalOutstanding),
    defaulted: row.defaulted,
    writtenOffLiability: big(row.writtenOffLiability),
    positionCap: big(row.positionCap),
    vault: row.vault ? asAddress(row.vault) : null,
  };
}

function mapVault(row: typeof schema.vaults.$inferSelect): VaultRecord {
  return {
    chainId: row.chainId,
    marketAddress: asAddress(row.marketAddress),
    owner: asAddress(row.owner),
    vault: asAddress(row.vault),
    venueAssets: big(row.venueAssets),
  };
}

function marketValues(m: MarketRecord) {
  return {
    chainId: m.chainId,
    marketId: m.marketId,
    address: m.address.toLowerCase(),
    label: m.label,
    deliveryMode: m.deliveryMode,
    loanToken: m.loanToken.toLowerCase(),
    loanSymbol: m.loanSymbol,
    loanDecimals: m.loanDecimals,
    collateralToken: m.collateralToken.toLowerCase(),
    collateralSymbol: m.collateralSymbol,
    collateralDecimals: m.collateralDecimals,
    oracle: m.oracle?.toLowerCase() ?? null,
    accountedCash: m.accountedCash.toString(10),
    totalDebtShares: m.totalDebtShares.toString(10),
    totalSupplyShares: m.totalSupplyShares.toString(10),
    epochIndexRay: m.epochIndexRay.toString(10),
    epochTimestamp: m.epochTimestamp.toString(10),
    epochAprRay: m.epochAprRay.toString(10),
    supplyCap: m.supplyCap.toString(10),
    borrowCap: m.borrowCap.toString(10),
    maxLtvBps: m.maxLtvBps,
    liquidationThresholdBps: m.liquidationThresholdBps,
    liquidationBonusBps: m.liquidationBonusBps,
    defaultPositionCap: m.defaultPositionCap.toString(10),
    supplyFrozen: m.supplyFrozen,
    borrowFrozen: m.borrowFrozen,
    recallActive: m.recallActive,
    recallDeadline: m.recallDeadline.toString(10),
    recallClearableAt: m.recallClearableAt.toString(10),
    terminal: m.terminal,
    unaccountedSurplus: m.unaccountedSurplus.toString(10),
    quoteScale36: m.quoteScale36.toString(10),
    collateralUsdWad: m.collateralUsdWad.toString(10),
    loanUsdWad: m.loanUsdWad.toString(10),
    oracleStatus: m.oracleStatus,
    oracleMode: m.oracleMode,
  };
}

function positionValues(p: PositionRecord) {
  return {
    chainId: p.chainId,
    marketId: p.marketId,
    marketAddress: p.marketAddress.toLowerCase(),
    owner: p.owner.toLowerCase(),
    supplyShares: p.supplyShares.toString(10),
    debtShares: p.debtShares.toString(10),
    collateral: p.collateral.toString(10),
    principalOutstanding: p.principalOutstanding.toString(10),
    defaulted: p.defaulted,
    writtenOffLiability: p.writtenOffLiability.toString(10),
    positionCap: p.positionCap.toString(10),
    vault: p.vault?.toLowerCase() ?? null,
    projectedDebt: "0",
  };
}

export class PgStore implements IndexerStore {
  constructor(private readonly db: Db) {}

  async ping(): Promise<boolean> {
    await this.db.execute(sql`select 1`);
    return true;
  }

  async getCursor(chainId: number): Promise<CursorRecord | null> {
    const rows = await this.db.select().from(schema.indexerCursors).where(eq(schema.indexerCursors.chainId, chainId));
    const row = rows[0];
    if (!row) return null;
    return {
      chainId: row.chainId,
      startBlock: row.startBlock,
      lastBlock: row.lastBlock,
      lastHash: (row.lastHash as Hex | null) ?? null,
      lastTimestamp: row.lastTimestamp,
      headBlock: row.headBlock,
      lastError: row.lastError,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertCursor(cursor: CursorRecord): Promise<void> {
    await this.db
      .insert(schema.indexerCursors)
      .values({
        chainId: cursor.chainId,
        startBlock: cursor.startBlock,
        lastBlock: cursor.lastBlock,
        lastHash: cursor.lastHash,
        lastTimestamp: cursor.lastTimestamp,
        headBlock: cursor.headBlock,
        lastError: cursor.lastError,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.indexerCursors.chainId,
        set: {
          startBlock: cursor.startBlock,
          lastBlock: cursor.lastBlock,
          lastHash: cursor.lastHash,
          lastTimestamp: cursor.lastTimestamp,
          headBlock: cursor.headBlock,
          lastError: cursor.lastError,
          updatedAt: new Date(),
        },
      });
  }

  async getBlockHash(chainId: number, blockNumber: bigint): Promise<Hex | null> {
    const rows = await this.db
      .select()
      .from(schema.chainBlocks)
      .where(and(eq(schema.chainBlocks.chainId, chainId), eq(schema.chainBlocks.blockNumber, blockNumber)));
    return (rows[0]?.blockHash as Hex | undefined) ?? null;
  }

  async putBlock(row: {
    chainId: number;
    blockNumber: bigint;
    blockHash: Hex;
    parentHash?: Hex | null;
    timestamp: bigint;
  }): Promise<void> {
    await this.db
      .insert(schema.chainBlocks)
      .values({
        chainId: row.chainId,
        blockNumber: row.blockNumber,
        blockHash: row.blockHash,
        parentHash: row.parentHash ?? null,
        timestamp: row.timestamp,
      })
      .onConflictDoUpdate({
        target: [schema.chainBlocks.chainId, schema.chainBlocks.blockNumber],
        set: {
          blockHash: row.blockHash,
          parentHash: row.parentHash ?? null,
          timestamp: row.timestamp,
        },
      });
  }

  async deleteAfter(chainId: number, blockNumber: bigint): Promise<void> {
    await this.db.execute(
      sql`delete from indexed_events where chain_id = ${chainId} and block_number > ${blockNumber}`,
    );
    await this.db.execute(sql`delete from chain_blocks where chain_id = ${chainId} and block_number > ${blockNumber}`);
  }

  async insertEvent(event: IndexedEventRecord): Promise<boolean> {
    const inserted = await this.db
      .insert(schema.indexedEvents)
      .values({
        chainId: event.chainId,
        txHash: event.txHash.toLowerCase(),
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        address: event.address.toLowerCase(),
        eventName: event.eventName,
        args: event.args,
        timestamp: event.timestamp,
      })
      .onConflictDoNothing()
      .returning({ id: schema.indexedEvents.id });
    return inserted.length > 0;
  }

  async listEvents(query: EventListQuery): Promise<IndexedEventRecord[]> {
    const filtered = this.db.select().from(schema.indexedEvents);
    const rows = await (query.chainId !== undefined
      ? filtered.where(eq(schema.indexedEvents.chainId, query.chainId))
      : filtered
    )
      .orderBy(desc(schema.indexedEvents.blockNumber), desc(schema.indexedEvents.logIndex))
      .limit(Math.min(query.limit * 4, 400));

    let events: IndexedEventRecord[] = rows.map((row) => ({
      chainId: row.chainId,
      txHash: row.txHash as Hex,
      logIndex: row.logIndex,
      blockNumber: row.blockNumber,
      blockHash: (row.blockHash as Hex | null) ?? null,
      address: asAddress(row.address),
      eventName: row.eventName,
      args: row.args ?? {},
      timestamp: row.timestamp,
    }));

    if (query.address) {
      const addr = query.address.toLowerCase();
      events = events.filter((e) => e.address.toLowerCase() === addr);
    }
    if (query.eventName) events = events.filter((e) => e.eventName === query.eventName);
    if (query.marketId) {
      const market = await this.getMarket(query.chainId ?? events[0]?.chainId ?? 0, query.marketId);
      if (!market) return [];
      events = events.filter(
        (e) =>
          e.address.toLowerCase() === market.address.toLowerCase() ||
          e.args.market?.toLowerCase() === market.address.toLowerCase(),
      );
    }
    if (query.beforeBlock !== undefined) {
      events = events.filter(
        (e) =>
          e.blockNumber < query.beforeBlock! ||
          (e.blockNumber === query.beforeBlock && e.logIndex < (query.beforeLogIndex ?? 0)),
      );
    }
    return events.slice(0, query.limit);
  }

  async listEventsForReplay(chainId: number): Promise<IndexedEventRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.indexedEvents)
      .where(eq(schema.indexedEvents.chainId, chainId))
      .orderBy(schema.indexedEvents.blockNumber, schema.indexedEvents.logIndex);
    return rows.map((row) => ({
      chainId: row.chainId,
      txHash: row.txHash as Hex,
      logIndex: row.logIndex,
      blockNumber: row.blockNumber,
      blockHash: (row.blockHash as Hex | null) ?? null,
      address: asAddress(row.address),
      eventName: row.eventName,
      args: row.args ?? {},
      timestamp: row.timestamp,
    }));
  }

  async getMarket(chainId: number, marketIdOrAddress: string): Promise<MarketRecord | null> {
    const byId = await this.db
      .select()
      .from(schema.markets)
      .where(and(eq(schema.markets.chainId, chainId), eq(schema.markets.marketId, marketIdOrAddress)));
    if (byId[0]) return mapMarket(byId[0]);
    const byAddr = await this.db
      .select()
      .from(schema.markets)
      .where(and(eq(schema.markets.chainId, chainId), eq(schema.markets.address, marketIdOrAddress.toLowerCase())));
    return byAddr[0] ? mapMarket(byAddr[0]) : null;
  }

  async listMarkets(chainId?: number): Promise<MarketRecord[]> {
    const rows =
      chainId === undefined
        ? await this.db.select().from(schema.markets)
        : await this.db.select().from(schema.markets).where(eq(schema.markets.chainId, chainId));
    return rows.map(mapMarket);
  }

  async upsertMarket(market: MarketRecord): Promise<void> {
    const values = marketValues(market);
    await this.db
      .insert(schema.markets)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.markets.chainId, schema.markets.marketId],
        set: values,
      });
  }

  async replaceChainDerived(
    chainId: number,
    data: { markets: MarketRecord[]; positions: PositionRecord[]; vaults: VaultRecord[] },
  ): Promise<void> {
    await this.db.delete(schema.positions).where(eq(schema.positions.chainId, chainId));
    await this.db.delete(schema.vaults).where(eq(schema.vaults.chainId, chainId));
    await this.db.delete(schema.markets).where(eq(schema.markets.chainId, chainId));
    for (const m of data.markets) await this.upsertMarket(m);
    for (const p of data.positions) await this.upsertPosition(p);
    for (const v of data.vaults) await this.upsertVault(v);
  }

  async getPosition(chainId: number, marketId: string, owner: string): Promise<PositionRecord | null> {
    const market = await this.getMarket(chainId, marketId);
    if (!market) return null;
    const rows = await this.db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.chainId, chainId),
          eq(schema.positions.marketId, market.marketId),
          eq(schema.positions.owner, owner.toLowerCase()),
        ),
      );
    return rows[0] ? mapPosition(rows[0]) : null;
  }

  async listPositions(chainId?: number): Promise<PositionRecord[]> {
    const rows =
      chainId === undefined
        ? await this.db.select().from(schema.positions)
        : await this.db.select().from(schema.positions).where(eq(schema.positions.chainId, chainId));
    return rows.map(mapPosition);
  }

  async upsertPosition(position: PositionRecord): Promise<void> {
    const values = positionValues(position);
    await this.db
      .insert(schema.positions)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.positions.chainId, schema.positions.marketId, schema.positions.owner],
        set: values,
      });
  }

  async listVaults(chainId?: number): Promise<VaultRecord[]> {
    const rows =
      chainId === undefined
        ? await this.db.select().from(schema.vaults)
        : await this.db.select().from(schema.vaults).where(eq(schema.vaults.chainId, chainId));
    return rows.map(mapVault);
  }

  async upsertVault(vault: VaultRecord): Promise<void> {
    await this.db
      .insert(schema.vaults)
      .values({
        chainId: vault.chainId,
        marketAddress: vault.marketAddress.toLowerCase(),
        owner: vault.owner.toLowerCase(),
        vault: vault.vault.toLowerCase(),
        venueAssets: vault.venueAssets.toString(10),
      })
      .onConflictDoUpdate({
        target: [schema.vaults.chainId, schema.vaults.vault],
        set: {
          marketAddress: vault.marketAddress.toLowerCase(),
          owner: vault.owner.toLowerCase(),
          venueAssets: vault.venueAssets.toString(10),
        },
      });
  }

  async seedMarkets(config: ChainConfig): Promise<void> {
    for (const listed of config.markets) {
      const existing = await this.getMarket(config.chainId, listed.id);
      if (existing) continue;
      const byAddr = await this.getMarket(config.chainId, listed.address);
      if (byAddr) continue;
      await this.upsertMarket(emptyMarket(config, listed));
    }
  }
}
