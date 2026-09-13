import { BASE_APR_RAY, RAY } from "@interline/math";
import {
  asAddress,
  type ChainConfig,
  type CursorRecord,
  cursorHydrationDefaults,
  dec,
  type DirectAcceptanceRecord,
  type DirectAuxiliary,
  type DirectCapProposalRecord,
  type DirectCashflowRecord,
  type DirectFacilityRecord,
  type DirectHistoryRecord,
  type DirectRecallEpisodeRecord,
  type DirectTermsRecord,
  type Hex,
  type IndexedEventRecord,
  type MarketRecord,
  positionKey,
  type PositionRecord,
  type VaultRecord,
  ZERO_ADDRESS,
} from "../domain.js";
import type { EventListQuery, IndexedRangeCommit, IndexerStore } from "./store.js";

function cloneMarket(m: MarketRecord): MarketRecord {
  return { ...m };
}
function clonePosition(p: PositionRecord): PositionRecord {
  return { ...p };
}
function cloneFacility(f: DirectFacilityRecord): DirectFacilityRecord {
  return { ...f };
}
function cloneVault(v: VaultRecord): VaultRecord {
  return { ...v };
}

function eventId(e: IndexedEventRecord): string {
  return `${e.chainId}:${e.txHash.toLowerCase()}:${e.logIndex}`;
}

export function emptyMarket(cfg: ChainConfig, listed: ChainConfig["markets"][number]): MarketRecord {
  return {
    chainId: cfg.chainId,
    marketId: listed.id,
    address: asAddress(listed.address),
    label: listed.label,
    deliveryMode: listed.deliveryMode,
    loanToken: asAddress("0x0000000000000000000000000000000000000000"),
    loanSymbol: listed.loanSymbol,
    loanDecimals: 6,
    collateralToken: asAddress("0x0000000000000000000000000000000000000000"),
    collateralSymbol: listed.collateralSymbol,
    collateralDecimals: 18,
    oracle: listed.oracle,
    accountedCash: 0n,
    totalDebtShares: 0n,
    totalSupplyShares: 0n,
    epochIndexRay: RAY,
    epochTimestamp: 0n,
    epochAprRay: BASE_APR_RAY,
    supplyCap: 0n,
    borrowCap: 0n,
    maxLtvBps: 8000,
    liquidationThresholdBps: 9000,
    liquidationBonusBps: 500,
    defaultPositionCap: 0n,
    supplyFrozen: false,
    borrowFrozen: false,
    recallActive: false,
    recallDeadline: 0n,
    recallClearableAt: 0n,
    terminal: false,
    unaccountedSurplus: 0n,
    quoteScale36: 0n,
    collateralUsdWad: 0n,
    loanUsdWad: 0n,
    oracleStatus: "UNAVAILABLE",
    oracleMode: "simulated",
  };
}

type MemorySnapshot = {
  cursors: Map<number, CursorRecord>;
  blocks: Map<string, { hash: Hex; parentHash: Hex | null; timestamp: bigint }>;
  events: IndexedEventRecord[];
  markets: Map<string, MarketRecord>;
  positions: Map<string, PositionRecord>;
  vaults: Map<string, VaultRecord>;
  facilities: Map<string, DirectFacilityRecord>;
  terms: Map<string, DirectTermsRecord>;
  acceptances: Map<string, DirectAcceptanceRecord>;
  cashflows: Map<string, DirectCashflowRecord>;
  caps: Map<string, DirectCapProposalRecord>;
  recalls: Map<string, DirectRecallEpisodeRecord>;
  history: Map<string, DirectHistoryRecord>;
};

export class MemoryStore implements IndexerStore {
  cursors = new Map<number, CursorRecord>();
  blocks = new Map<string, { hash: Hex; parentHash: Hex | null; timestamp: bigint }>();
  events: IndexedEventRecord[] = [];
  markets = new Map<string, MarketRecord>();
  positions = new Map<string, PositionRecord>();
  vaults = new Map<string, VaultRecord>();
  facilities = new Map<string, DirectFacilityRecord>();
  terms = new Map<string, DirectTermsRecord>();
  acceptances = new Map<string, DirectAcceptanceRecord>();
  cashflows = new Map<string, DirectCashflowRecord>();
  caps = new Map<string, DirectCapProposalRecord>();
  recalls = new Map<string, DirectRecallEpisodeRecord>();
  history = new Map<string, DirectHistoryRecord>();
  private writes = new Map<number, Promise<void>>();

  async ping(): Promise<boolean> {
    return true;
  }

  private async exclusive(chainId: number, fn: () => Promise<void>): Promise<void> {
    const prev = this.writes.get(chainId) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.writes.set(
      chainId,
      prev.then(() => held),
    );
    await prev;
    try {
      await fn();
    } finally {
      release();
    }
  }

  private snapshot(): MemorySnapshot {
    const cloneMap = <T>(m: Map<string, T>): Map<string, T> =>
      new Map([...m.entries()].map(([k, v]) => [k, { ...v }]));
    return {
      cursors: new Map([...this.cursors.entries()].map(([k, v]) => [k, { ...v }])),
      blocks: new Map([...this.blocks.entries()].map(([k, v]) => [k, { ...v }])),
      events: this.events.map((e) => ({ ...e, args: { ...e.args } })),
      markets: cloneMap(this.markets),
      positions: cloneMap(this.positions),
      vaults: cloneMap(this.vaults),
      facilities: cloneMap(this.facilities),
      terms: cloneMap(this.terms),
      acceptances: cloneMap(this.acceptances),
      cashflows: cloneMap(this.cashflows),
      caps: cloneMap(this.caps),
      recalls: cloneMap(this.recalls),
      history: cloneMap(this.history),
    };
  }

  private restore(snap: MemorySnapshot): void {
    this.cursors = snap.cursors;
    this.blocks = snap.blocks;
    this.events = snap.events;
    this.markets = snap.markets;
    this.positions = snap.positions;
    this.vaults = snap.vaults;
    this.facilities = snap.facilities;
    this.terms = snap.terms;
    this.acceptances = snap.acceptances;
    this.cashflows = snap.cashflows;
    this.caps = snap.caps;
    this.recalls = snap.recalls;
    this.history = snap.history;
  }

  async getCursor(chainId: number): Promise<CursorRecord | null> {
    const row = this.cursors.get(chainId);
    if (!row) return null;
    return { ...cursorHydrationDefaults(row), ...row };
  }

  async upsertCursor(cursor: CursorRecord): Promise<void> {
    this.cursors.set(cursor.chainId, { ...cursorHydrationDefaults(cursor), ...cursor });
  }

  async commitIndexedRange(commit: IndexedRangeCommit): Promise<void> {
    await this.exclusive(commit.chainId, async () => {
      const snap = this.snapshot();
      try {
        for (const block of commit.blocks) await this.putBlock(block);
        for (const event of commit.events) await this.insertEvent(event);
        await this.replaceChainDerived(commit.chainId, commit.derived);
        await this.upsertCursor(commit.cursor);
      } catch (err) {
        this.restore(snap);
        throw err;
      }
    });
  }

  async getBlockHash(chainId: number, blockNumber: bigint): Promise<Hex | null> {
    return this.blocks.get(`${chainId}:${blockNumber.toString()}`)?.hash ?? null;
  }

  async putBlock(row: {
    chainId: number;
    blockNumber: bigint;
    blockHash: Hex;
    parentHash?: Hex | null;
    timestamp: bigint;
  }): Promise<void> {
    this.blocks.set(`${row.chainId}:${row.blockNumber.toString()}`, {
      hash: row.blockHash,
      parentHash: row.parentHash ?? null,
      timestamp: row.timestamp,
    });
  }

  async deleteAfter(chainId: number, blockNumber: bigint): Promise<void> {
    for (const key of [...this.blocks.keys()]) {
      if (!key.startsWith(`${chainId}:`)) continue;
      const n = BigInt(key.split(":")[1] ?? "0");
      if (n > blockNumber) this.blocks.delete(key);
    }
    this.events = this.events.filter((e) => e.chainId !== chainId || e.blockNumber <= blockNumber);
  }

  async insertEvent(event: IndexedEventRecord): Promise<boolean> {
    const id = eventId(event);
    if (this.events.some((e) => eventId(e) === id)) return false;
    this.events.push({
      ...event,
      txHash: event.txHash.toLowerCase() as Hex,
      address: asAddress(event.address),
      args: { ...event.args },
    });
    return true;
  }

  async listEvents(query: EventListQuery): Promise<IndexedEventRecord[]> {
    let rows = this.events.slice();
    if (query.chainId !== undefined) rows = rows.filter((e) => e.chainId === query.chainId);
    if (query.address) {
      const addr = query.address.toLowerCase();
      rows = rows.filter((e) => e.address.toLowerCase() === addr);
    }
    if (query.eventName) rows = rows.filter((e) => e.eventName === query.eventName);
    if (query.marketId) {
      const marketId = query.marketId;
      const market = [...this.markets.values()].find(
        (m) =>
          m.chainId === (query.chainId ?? m.chainId) &&
          (m.marketId === marketId || m.address.toLowerCase() === marketId.toLowerCase()),
      );
      if (market) {
        rows = rows.filter(
          (e) =>
            e.address.toLowerCase() === market.address.toLowerCase() ||
            e.args.market?.toLowerCase() === market.address.toLowerCase(),
        );
      } else {
        rows = [];
      }
    }
    rows.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
      return b.logIndex - a.logIndex;
    });
    if (query.beforeBlock !== undefined) {
      rows = rows.filter(
        (e) =>
          e.blockNumber < query.beforeBlock! ||
          (e.blockNumber === query.beforeBlock && e.logIndex < (query.beforeLogIndex ?? 0)),
      );
    }
    return rows.slice(0, query.limit);
  }

  async listEventsForReplay(chainId: number): Promise<IndexedEventRecord[]> {
    return this.events
      .filter((e) => e.chainId === chainId)
      .sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
        return a.logIndex - b.logIndex;
      })
      .map((e) => ({ ...e, args: { ...e.args } }));
  }

  private marketMapKey(chainId: number, marketId: string): string {
    return `${chainId}:${marketId}`;
  }

  async getMarket(chainId: number, marketIdOrAddress: string): Promise<MarketRecord | null> {
    const direct = this.markets.get(this.marketMapKey(chainId, marketIdOrAddress));
    if (direct) return cloneMarket(direct);
    const needle = marketIdOrAddress.toLowerCase();
    for (const m of this.markets.values()) {
      if (m.chainId === chainId && (m.marketId === marketIdOrAddress || m.address.toLowerCase() === needle)) {
        return cloneMarket(m);
      }
    }
    return null;
  }

  async listMarkets(chainId?: number): Promise<MarketRecord[]> {
    return [...this.markets.values()]
      .filter((m) => chainId === undefined || m.chainId === chainId)
      .map(cloneMarket);
  }

  async upsertMarket(market: MarketRecord): Promise<void> {
    this.markets.set(this.marketMapKey(market.chainId, market.marketId), cloneMarket(market));
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
    for (const key of [...this.markets.keys()]) {
      if (key.startsWith(`${chainId}:`)) this.markets.delete(key);
    }
    for (const key of [...this.positions.keys()]) {
      if (key.startsWith(`${chainId}:`)) this.positions.delete(key);
    }
    for (const key of [...this.vaults.keys()]) {
      if (key.startsWith(`${chainId}:`)) this.vaults.delete(key);
    }
    for (const key of [...this.facilities.keys()]) {
      if (key.startsWith(`${chainId}:`)) this.facilities.delete(key);
    }
    for (const m of data.markets) await this.upsertMarket(m);
    for (const p of data.positions) await this.upsertPosition(p);
    for (const v of data.vaults) await this.upsertVault(v);
    for (const f of data.facilities ?? []) await this.upsertDirectFacility(f);
    if (data.auxiliary) await this.replaceDirectAuxiliary(chainId, data.auxiliary);
  }

  async getPosition(chainId: number, marketId: string, owner: string): Promise<PositionRecord | null> {
    const market = await this.getMarket(chainId, marketId);
    if (!market) return null;
    const row = this.positions.get(`${chainId}:${positionKey(market.address, owner)}`);
    return row ? clonePosition(row) : null;
  }

  async listPositions(chainId?: number): Promise<PositionRecord[]> {
    return [...this.positions.values()]
      .filter((p) => chainId === undefined || p.chainId === chainId)
      .map(clonePosition);
  }

  async upsertPosition(position: PositionRecord): Promise<void> {
    const key = `${position.chainId}:${positionKey(position.marketAddress, position.owner)}`;
    this.positions.set(key, clonePosition(position));
  }

  async listVaults(chainId?: number): Promise<VaultRecord[]> {
    return [...this.vaults.values()]
      .filter((v) => chainId === undefined || v.chainId === chainId)
      .map(cloneVault);
  }

  async upsertVault(vault: VaultRecord): Promise<void> {
    this.vaults.set(`${vault.chainId}:${vault.vault.toLowerCase()}`, cloneVault(vault));
  }

  async listDirectFacilities(chainId?: number): Promise<DirectFacilityRecord[]> {
    return [...this.facilities.values()]
      .filter((f) => chainId === undefined || f.chainId === chainId)
      .map(cloneFacility);
  }

  async getDirectFacility(chainId: number, facility: string): Promise<DirectFacilityRecord | null> {
    const row = this.facilities.get(`${chainId}:${facility.toLowerCase()}`);
    return row ? cloneFacility(row) : null;
  }

  async upsertDirectFacility(row: DirectFacilityRecord): Promise<void> {
    this.facilities.set(`${row.chainId}:${row.facility.toLowerCase()}`, cloneFacility({
      ...row,
      venue: row.venue ?? ZERO_ADDRESS,
      swapRouter: row.swapRouter ?? ZERO_ADDRESS,
      otherToken: row.otherToken ?? ZERO_ADDRESS,
      borrowPeriod: row.borrowPeriod ?? 0n,
      recallWindow: row.recallWindow ?? 0n,
    }));
  }

  async listDirectAuxiliary(chainId: number): Promise<DirectAuxiliary> {
    const take = <T extends { chainId: number }>(m: Map<string, T>): T[] =>
      [...m.values()].filter((x) => x.chainId === chainId).map((x) => ({ ...x }));
    return {
      terms: take(this.terms),
      acceptances: take(this.acceptances),
      cashflows: take(this.cashflows),
      caps: take(this.caps),
      recalls: take(this.recalls),
      history: take(this.history),
    };
  }

  async replaceDirectAuxiliary(chainId: number, aux: DirectAuxiliary): Promise<void> {
    const drop = (m: Map<string, { chainId: number }>) => {
      for (const [k, v] of [...m.entries()]) if (v.chainId === chainId) m.delete(k);
    };
    drop(this.terms);
    drop(this.acceptances);
    drop(this.cashflows);
    drop(this.caps);
    drop(this.recalls);
    drop(this.history);
    for (const t of aux.terms) this.terms.set(`${t.chainId}:${t.facility.toLowerCase()}`, { ...t });
    for (const a of aux.acceptances) {
      this.acceptances.set(`${a.chainId}:${a.facility.toLowerCase()}:${a.party.toLowerCase()}`, { ...a });
    }
    for (const c of aux.cashflows) this.cashflows.set(`${c.chainId}:${c.txHash.toLowerCase()}:${c.logIndex}`, { ...c });
    for (const c of aux.caps) {
      this.caps.set(`${c.chainId}:${c.facility.toLowerCase()}:${c.digest.toLowerCase()}`, { ...c });
    }
    for (const r of aux.recalls) this.recalls.set(`${r.chainId}:${r.facility.toLowerCase()}`, { ...r });
    for (const h of aux.history) this.history.set(`${h.chainId}:${h.txHash.toLowerCase()}:${h.logIndex}`, { ...h });
  }

  async listDirectHistory(chainId: number, facility: string): Promise<DirectHistoryRecord[]> {
    const needle = facility.toLowerCase();
    return [...this.history.values()]
      .filter((h) => h.chainId === chainId && h.facility.toLowerCase() === needle)
      .sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
        return a.logIndex - b.logIndex;
      })
      .map((h) => ({ ...h }));
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

export { dec };
