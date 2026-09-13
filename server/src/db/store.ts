import type {
  ChainConfig,
  CursorRecord,
  DirectAuxiliary,
  DirectFacilityRecord,
  DirectHistoryRecord,
  Hex,
  IndexedEventRecord,
  MarketRecord,
  PositionRecord,
  VaultRecord,
} from "../domain.js";

export type EventListQuery = {
  chainId?: number;
  marketId?: string;
  address?: string;
  eventName?: string;
  afterBlock?: bigint;
  afterLogIndex?: number;
  beforeBlock?: bigint;
  beforeLogIndex?: number;
  limit: number;
};

export type BlockRow = {
  chainId: number;
  blockNumber: bigint;
  blockHash: Hex;
  parentHash?: Hex | null;
  timestamp: bigint;
};

export type ChainDerived = {
  markets: MarketRecord[];
  positions: PositionRecord[];
  vaults: VaultRecord[];
  facilities?: DirectFacilityRecord[];
  auxiliary?: DirectAuxiliary;
};

export type IndexedRangeCommit = {
  chainId: number;
  events: IndexedEventRecord[];
  blocks: BlockRow[];
  derived: ChainDerived;
  cursor: CursorRecord;
};

export interface IndexerStore {
  ping(): Promise<boolean>;
  getCursor(chainId: number): Promise<CursorRecord | null>;
  upsertCursor(cursor: CursorRecord): Promise<void>;
  getBlockHash(chainId: number, blockNumber: bigint): Promise<Hex | null>;
  putBlock(row: BlockRow): Promise<void>;
  /** Persist events, block refs, derived rows, and cursor in one writer-critical section. */
  commitIndexedRange(commit: IndexedRangeCommit): Promise<void>;
  deleteAfter(chainId: number, blockNumber: bigint): Promise<void>;
  insertEvent(event: IndexedEventRecord): Promise<boolean>;
  listEvents(query: EventListQuery): Promise<IndexedEventRecord[]>;
  listEventsForReplay(chainId: number): Promise<IndexedEventRecord[]>;
  getMarket(chainId: number, marketIdOrAddress: string): Promise<MarketRecord | null>;
  listMarkets(chainId?: number): Promise<MarketRecord[]>;
  upsertMarket(market: MarketRecord): Promise<void>;
  replaceChainDerived(chainId: number, data: ChainDerived): Promise<void>;
  getPosition(chainId: number, marketId: string, owner: string): Promise<PositionRecord | null>;
  listPositions(chainId?: number): Promise<PositionRecord[]>;
  upsertPosition(position: PositionRecord): Promise<void>;
  listVaults(chainId?: number): Promise<VaultRecord[]>;
  upsertVault(vault: VaultRecord): Promise<void>;
  listDirectFacilities(chainId?: number): Promise<DirectFacilityRecord[]>;
  getDirectFacility(chainId: number, facility: string): Promise<DirectFacilityRecord | null>;
  upsertDirectFacility(row: DirectFacilityRecord): Promise<void>;
  listDirectAuxiliary(chainId: number): Promise<DirectAuxiliary>;
  replaceDirectAuxiliary(chainId: number, aux: DirectAuxiliary): Promise<void>;
  listDirectHistory(chainId: number, facility: string): Promise<DirectHistoryRecord[]>;
  seedMarkets(config: ChainConfig): Promise<void>;
}
