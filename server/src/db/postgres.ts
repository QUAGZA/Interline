import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  asAddress,
  type ChainConfig,
  type CursorRecord,
  cursorHydrationDefaults,
  type DirectAuxiliary,
  type DirectFacilityRecord,
  type DirectHistoryRecord,
  type Hex,
  type IndexedEventRecord,
  type MarketRecord,
  type OracleStatus,
  type PositionRecord,
  type VaultRecord,
  ZERO_ADDRESS,
} from "../domain.js";
import { emptyMarket } from "./memory.js";
import * as schema from "./schema.js";
import type { EventListQuery, IndexedRangeCommit, IndexerStore } from "./store.js";

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
  constructor(
    private readonly db: Db,
    private readonly nested = false,
  ) {}

  async ping(): Promise<boolean> {
    await this.db.execute(sql`select 1`);
    return true;
  }

  async getCursor(chainId: number): Promise<CursorRecord | null> {
    const rows = await this.db.select().from(schema.indexerCursors).where(eq(schema.indexerCursors.chainId, chainId));
    const row = rows[0];
    if (!row) return null;
    const updatedAt = row.updatedAt.toISOString();
    const defaults = cursorHydrationDefaults({ updatedAt });
    return {
      chainId: row.chainId,
      startBlock: row.startBlock,
      lastBlock: row.lastBlock,
      lastHash: (row.lastHash as Hex | null) ?? null,
      lastTimestamp: row.lastTimestamp,
      headBlock: row.headBlock,
      lastError: row.lastError,
      updatedAt,
      hydratedBlockNumber: row.hydratedBlockNumber ?? defaults.hydratedBlockNumber,
      hydratedBlockHash: (row.hydratedBlockHash as Hex | null) ?? defaults.hydratedBlockHash,
      hydratedBlockTimestamp: row.hydratedBlockTimestamp ?? defaults.hydratedBlockTimestamp,
      lastHydratedAt: row.lastHydratedAt?.toISOString() ?? defaults.lastHydratedAt,
      lastPolledAt: row.lastPolledAt?.toISOString() ?? defaults.lastPolledAt,
      hydrationOk: row.hydrationOk ?? defaults.hydrationOk,
    };
  }

  async upsertCursor(cursor: CursorRecord): Promise<void> {
    const values = {
      chainId: cursor.chainId,
      startBlock: cursor.startBlock,
      lastBlock: cursor.lastBlock,
      lastHash: cursor.lastHash,
      lastTimestamp: cursor.lastTimestamp,
      headBlock: cursor.headBlock,
      lastError: cursor.lastError,
      updatedAt: new Date(),
      hydratedBlockNumber: cursor.hydratedBlockNumber,
      hydratedBlockHash: cursor.hydratedBlockHash,
      hydratedBlockTimestamp: cursor.hydratedBlockTimestamp,
      lastHydratedAt: cursor.lastHydratedAt ? new Date(cursor.lastHydratedAt) : null,
      lastPolledAt: cursor.lastPolledAt ? new Date(cursor.lastPolledAt) : new Date(),
      hydrationOk: cursor.hydrationOk,
    };
    await this.db
      .insert(schema.indexerCursors)
      .values(values)
      .onConflictDoUpdate({
        target: schema.indexerCursors.chainId,
        set: {
          startBlock: values.startBlock,
          lastBlock: values.lastBlock,
          lastHash: values.lastHash,
          lastTimestamp: values.lastTimestamp,
          headBlock: values.headBlock,
          lastError: values.lastError,
          updatedAt: values.updatedAt,
          hydratedBlockNumber: values.hydratedBlockNumber,
          hydratedBlockHash: values.hydratedBlockHash,
          hydratedBlockTimestamp: values.hydratedBlockTimestamp,
          lastHydratedAt: values.lastHydratedAt,
          lastPolledAt: values.lastPolledAt,
          hydrationOk: values.hydrationOk,
        },
      });
  }

  async commitIndexedRange(commit: IndexedRangeCommit): Promise<void> {
    const apply = async (store: PgStore) => {
      for (const block of commit.blocks) await store.putBlock(block);
      for (const event of commit.events) await store.insertEvent(event);
      await store.replaceChainDerived(commit.chainId, commit.derived);
      await store.upsertCursor(commit.cursor);
    };
    if (this.nested) {
      await apply(this);
      return;
    }
    await this.db.transaction(async (tx) => {
      await apply(new PgStore(tx as Db, true));
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
    data: {
      markets: MarketRecord[];
      positions: PositionRecord[];
      vaults: VaultRecord[];
      facilities?: DirectFacilityRecord[];
      auxiliary?: DirectAuxiliary;
    },
  ): Promise<void> {
    await this.db.delete(schema.positions).where(eq(schema.positions.chainId, chainId));
    await this.db.delete(schema.vaults).where(eq(schema.vaults.chainId, chainId));
    await this.db.delete(schema.markets).where(eq(schema.markets.chainId, chainId));
    await this.db.delete(schema.directFacilities).where(eq(schema.directFacilities.chainId, chainId));
    for (const m of data.markets) await this.upsertMarket(m);
    for (const p of data.positions) await this.upsertPosition(p);
    for (const v of data.vaults) await this.upsertVault(v);
    for (const f of data.facilities ?? []) await this.upsertDirectFacility(f);
    if (data.auxiliary) await this.replaceDirectAuxiliary(chainId, data.auxiliary);
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

  async listDirectFacilities(chainId?: number): Promise<DirectFacilityRecord[]> {
    const rows =
      chainId === undefined
        ? await this.db.select().from(schema.directFacilities)
        : await this.db.select().from(schema.directFacilities).where(eq(schema.directFacilities.chainId, chainId));
    return rows.map(mapDirect);
  }

  async getDirectFacility(chainId: number, facility: string): Promise<DirectFacilityRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.directFacilities)
      .where(and(eq(schema.directFacilities.chainId, chainId), eq(schema.directFacilities.facility, facility.toLowerCase())));
    return rows[0] ? mapDirect(rows[0]) : null;
  }

  async upsertDirectFacility(row: DirectFacilityRecord): Promise<void> {
    const values = {
      chainId: row.chainId,
      facility: row.facility.toLowerCase(),
      lender: row.lender.toLowerCase(),
      borrower: row.borrower.toLowerCase(),
      vault: row.vault.toLowerCase(),
      asset: row.asset.toLowerCase(),
      termsHash: row.termsHash,
      lenderAccepted: row.lenderAccepted,
      borrowerAccepted: row.borrowerAccepted,
      declined: row.declined,
      cancelled: row.cancelled,
      ended: row.ended,
      acceptanceDeadline: row.acceptanceDeadline.toString(10),
      activatedAt: row.activatedAt.toString(10),
      borrowExpiry: row.borrowExpiry.toString(10),
      repaymentDueAt: row.repaymentDueAt.toString(10),
      creditLimit: row.creditLimit.toString(10),
      accountedCash: row.accountedCash.toString(10),
      debtShares: row.debtShares.toString(10),
      principal: row.principal.toString(10),
      lastDebt: row.lastDebt.toString(10),
      aprRay: row.aprRay.toString(10),
      recallDeadline: row.recallDeadline.toString(10),
      recallActive: row.recallActive,
      borrowingPaused: row.borrowingPaused,
      venue: (row.venue ?? ZERO_ADDRESS).toLowerCase(),
      swapRouter: (row.swapRouter ?? ZERO_ADDRESS).toLowerCase(),
      otherToken: (row.otherToken ?? ZERO_ADDRESS).toLowerCase(),
      borrowPeriod: (row.borrowPeriod ?? 0n).toString(10),
      recallWindow: (row.recallWindow ?? 0n).toString(10),
    };
    await this.db
      .insert(schema.directFacilities)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.directFacilities.chainId, schema.directFacilities.facility],
        set: values,
      });
  }

  async listDirectAuxiliary(chainId: number): Promise<DirectAuxiliary> {
    const [terms, acceptances, cashflows, caps, recalls, history] = await Promise.all([
      this.db.select().from(schema.directTerms).where(eq(schema.directTerms.chainId, chainId)),
      this.db.select().from(schema.directAcceptances).where(eq(schema.directAcceptances.chainId, chainId)),
      this.db.select().from(schema.directCashflows).where(eq(schema.directCashflows.chainId, chainId)),
      this.db.select().from(schema.directCapProposals).where(eq(schema.directCapProposals.chainId, chainId)),
      this.db.select().from(schema.directRecallEpisodes).where(eq(schema.directRecallEpisodes.chainId, chainId)),
      this.db.select().from(schema.directHistory).where(eq(schema.directHistory.chainId, chainId)),
    ]);
    return {
      terms: terms.map((t) => ({
        chainId: t.chainId,
        facility: asAddress(t.facility),
        loanToken: asAddress(t.loanToken),
        creditLimit: big(t.creditLimit),
        aprRay: big(t.aprRay),
        acceptanceLifetime: big(t.acceptanceLifetime),
        borrowPeriod: big(t.borrowPeriod),
        recallWindow: big(t.recallWindow),
        venue: asAddress(t.venue),
        swapRouter: asAddress(t.swapRouter),
        otherToken: asAddress(t.otherToken),
        termsHash: (t.termsHash.startsWith("0x") ? t.termsHash : `0x${t.termsHash}`) as DirectFacilityRecord["termsHash"],
      })),
      acceptances: acceptances.map((a) => ({
        chainId: a.chainId,
        facility: asAddress(a.facility),
        party: asAddress(a.party),
        accepted: a.accepted,
        txHash: a.txHash as Hex,
        logIndex: a.logIndex,
        timestamp: big(a.timestamp),
      })),
      cashflows: cashflows.map((c) => ({
        chainId: c.chainId,
        facility: asAddress(c.facility),
        kind: c.kind,
        assets: big(c.assets),
        cashAfter: big(c.cashAfter),
        debtAfter: big(c.debtAfter),
        txHash: c.txHash as Hex,
        logIndex: c.logIndex,
        blockNumber: c.blockNumber,
        timestamp: big(c.timestamp),
      })),
      caps: caps.map((c) => ({
        chainId: c.chainId,
        facility: asAddress(c.facility),
        digest: (c.digest.startsWith("0x") ? c.digest : `0x${c.digest}`) as Hex,
        proposer: asAddress(c.proposer),
        nonce: big(c.nonce),
        validUntil: big(c.validUntil),
        newCap: big(c.newCap),
        lenderApproved: c.lenderApproved,
        borrowerApproved: c.borrowerApproved,
        cancelled: c.cancelled,
        executed: c.executed,
      })),
      recalls: recalls.map((r) => ({
        chainId: r.chainId,
        facility: asAddress(r.facility),
        reasonHash: (r.reasonHash.startsWith("0x") ? r.reasonHash : `0x${r.reasonHash}`) as Hex,
        reasonCode: r.reasonCode,
        deadline: big(r.deadline),
        cleared: r.cleared,
        startedTxHash: r.startedTxHash as Hex,
        startedLogIndex: r.startedLogIndex,
        timestamp: big(r.timestamp),
      })),
      history: history.map(mapHistory),
    };
  }

  async replaceDirectAuxiliary(chainId: number, aux: DirectAuxiliary): Promise<void> {
    await this.db.delete(schema.directTerms).where(eq(schema.directTerms.chainId, chainId));
    await this.db.delete(schema.directAcceptances).where(eq(schema.directAcceptances.chainId, chainId));
    await this.db.delete(schema.directCashflows).where(eq(schema.directCashflows.chainId, chainId));
    await this.db.delete(schema.directCapProposals).where(eq(schema.directCapProposals.chainId, chainId));
    await this.db.delete(schema.directRecallEpisodes).where(eq(schema.directRecallEpisodes.chainId, chainId));
    await this.db.delete(schema.directHistory).where(eq(schema.directHistory.chainId, chainId));
    for (const t of aux.terms) {
      await this.db.insert(schema.directTerms).values({
        chainId: t.chainId,
        facility: t.facility.toLowerCase(),
        loanToken: t.loanToken.toLowerCase(),
        creditLimit: t.creditLimit.toString(10),
        aprRay: t.aprRay.toString(10),
        acceptanceLifetime: t.acceptanceLifetime.toString(10),
        borrowPeriod: t.borrowPeriod.toString(10),
        recallWindow: t.recallWindow.toString(10),
        venue: t.venue.toLowerCase(),
        swapRouter: t.swapRouter.toLowerCase(),
        otherToken: t.otherToken.toLowerCase(),
        termsHash: t.termsHash,
      });
    }
    for (const a of aux.acceptances) {
      await this.db.insert(schema.directAcceptances).values({
        chainId: a.chainId,
        facility: a.facility.toLowerCase(),
        party: a.party.toLowerCase(),
        accepted: a.accepted,
        txHash: a.txHash.toLowerCase(),
        logIndex: a.logIndex,
        timestamp: a.timestamp.toString(10),
      });
    }
    for (const c of aux.cashflows) {
      await this.db.insert(schema.directCashflows).values({
        chainId: c.chainId,
        facility: c.facility.toLowerCase(),
        kind: c.kind,
        assets: c.assets.toString(10),
        cashAfter: c.cashAfter.toString(10),
        debtAfter: c.debtAfter.toString(10),
        txHash: c.txHash.toLowerCase(),
        logIndex: c.logIndex,
        blockNumber: c.blockNumber,
        timestamp: c.timestamp.toString(10),
      });
    }
    for (const c of aux.caps) {
      await this.db.insert(schema.directCapProposals).values({
        chainId: c.chainId,
        facility: c.facility.toLowerCase(),
        digest: c.digest,
        proposer: c.proposer.toLowerCase(),
        nonce: c.nonce.toString(10),
        validUntil: c.validUntil.toString(10),
        newCap: c.newCap.toString(10),
        lenderApproved: c.lenderApproved,
        borrowerApproved: c.borrowerApproved,
        cancelled: c.cancelled,
        executed: c.executed,
      });
    }
    for (const r of aux.recalls) {
      await this.db.insert(schema.directRecallEpisodes).values({
        chainId: r.chainId,
        facility: r.facility.toLowerCase(),
        reasonHash: r.reasonHash,
        reasonCode: r.reasonCode,
        deadline: r.deadline.toString(10),
        cleared: r.cleared,
        startedTxHash: r.startedTxHash.toLowerCase(),
        startedLogIndex: r.startedLogIndex,
        timestamp: r.timestamp.toString(10),
      });
    }
    for (const h of aux.history) {
      await this.db.insert(schema.directHistory).values({
        chainId: h.chainId,
        facility: h.facility.toLowerCase(),
        cash: h.cash.toString(10),
        debt: h.debt.toString(10),
        principal: h.principal.toString(10),
        creditLimit: h.creditLimit.toString(10),
        txHash: h.txHash.toLowerCase(),
        logIndex: h.logIndex,
        blockNumber: h.blockNumber,
        timestamp: h.timestamp.toString(10),
      });
    }
  }

  async listDirectHistory(chainId: number, facility: string): Promise<DirectHistoryRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.directHistory)
      .where(and(eq(schema.directHistory.chainId, chainId), eq(schema.directHistory.facility, facility.toLowerCase())));
    return rows
      .map(mapHistory)
      .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  }
}

function mapDirect(row: typeof schema.directFacilities.$inferSelect): DirectFacilityRecord {
  return {
    chainId: row.chainId,
    facility: asAddress(row.facility),
    lender: asAddress(row.lender),
    borrower: asAddress(row.borrower),
    vault: asAddress(row.vault),
    asset: asAddress(row.asset),
    termsHash: (row.termsHash.startsWith("0x") ? row.termsHash : `0x${row.termsHash}`) as DirectFacilityRecord["termsHash"],
    lenderAccepted: row.lenderAccepted,
    borrowerAccepted: row.borrowerAccepted,
    declined: row.declined,
    cancelled: row.cancelled,
    ended: row.ended,
    acceptanceDeadline: big(row.acceptanceDeadline),
    activatedAt: big(row.activatedAt),
    borrowExpiry: big(row.borrowExpiry),
    repaymentDueAt: big(row.repaymentDueAt),
    creditLimit: big(row.creditLimit),
    accountedCash: big(row.accountedCash),
    debtShares: big(row.debtShares),
    principal: big(row.principal),
    lastDebt: big(row.lastDebt),
    aprRay: big(row.aprRay),
    recallDeadline: big(row.recallDeadline),
    recallActive: row.recallActive,
    borrowingPaused: row.borrowingPaused,
    venue: asAddress(row.venue),
    swapRouter: asAddress(row.swapRouter),
    otherToken: asAddress(row.otherToken),
    borrowPeriod: big(row.borrowPeriod),
    recallWindow: big(row.recallWindow),
  };
}

function mapHistory(row: typeof schema.directHistory.$inferSelect): DirectHistoryRecord {
  return {
    chainId: row.chainId,
    facility: asAddress(row.facility),
    cash: big(row.cash),
    debt: big(row.debt),
    principal: big(row.principal),
    creditLimit: big(row.creditLimit),
    txHash: row.txHash as Hex,
    logIndex: row.logIndex,
    blockNumber: row.blockNumber,
    timestamp: big(row.timestamp),
  };
}
