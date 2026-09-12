import { BASE_APR_RAY, RAY } from "@interline/math";
import {
  asAddress,
  type ChainConfig,
  type CursorRecord,
  dec,
  type Hex,
  type IndexedEventRecord,
  type MarketRecord,
  positionKey,
  type PositionRecord,
  type VaultRecord,
} from "../domain.js";
import type { EventListQuery, IndexerStore } from "./store.js";

function cloneMarket(m: MarketRecord): MarketRecord {
  return { ...m };
}
function clonePosition(p: PositionRecord): PositionRecord {
  return { ...p };
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
    maxLtvBps: 7000,
    liquidationThresholdBps: 8000,
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

export class MemoryStore implements IndexerStore {
  cursors = new Map<number, CursorRecord>();
  blocks = new Map<string, { hash: Hex; parentHash: Hex | null; timestamp: bigint }>();
  events: IndexedEventRecord[] = [];
  markets = new Map<string, MarketRecord>();
  positions = new Map<string, PositionRecord>();
  vaults = new Map<string, VaultRecord>();

  async ping(): Promise<boolean> {
    return true;
  }

  async getCursor(chainId: number): Promise<CursorRecord | null> {
    return this.cursors.get(chainId) ?? null;
  }

  async upsertCursor(cursor: CursorRecord): Promise<void> {
    this.cursors.set(cursor.chainId, { ...cursor });
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
      const market = [...this.markets.values()].find(
        (m) =>
          m.chainId === (query.chainId ?? m.chainId) &&
          (m.marketId === query.marketId || m.address.toLowerCase() === query.marketId.toLowerCase()),
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
    data: { markets: MarketRecord[]; positions: PositionRecord[]; vaults: VaultRecord[] },
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
    for (const m of data.markets) await this.upsertMarket(m);
    for (const p of data.positions) await this.upsertPosition(p);
    for (const v of data.vaults) await this.upsertVault(v);
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
