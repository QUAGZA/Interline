import type {
  ChainConfig,
  CursorRecord,
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

export interface IndexerStore {
  ping(): Promise<boolean>;
  getCursor(chainId: number): Promise<CursorRecord | null>;
  upsertCursor(cursor: CursorRecord): Promise<void>;
  getBlockHash(chainId: number, blockNumber: bigint): Promise<Hex | null>;
  putBlock(row: {
    chainId: number;
    blockNumber: bigint;
    blockHash: Hex;
    parentHash?: Hex | null;
    timestamp: bigint;
  }): Promise<void>;
  deleteAfter(chainId: number, blockNumber: bigint): Promise<void>;
  insertEvent(event: IndexedEventRecord): Promise<boolean>;
  listEvents(query: EventListQuery): Promise<IndexedEventRecord[]>;
  listEventsForReplay(chainId: number): Promise<IndexedEventRecord[]>;
  getMarket(chainId: number, marketIdOrAddress: string): Promise<MarketRecord | null>;
  listMarkets(chainId?: number): Promise<MarketRecord[]>;
  upsertMarket(market: MarketRecord): Promise<void>;
  replaceChainDerived(chainId: number, data: {
    markets: MarketRecord[];
    positions: PositionRecord[];
    vaults: VaultRecord[];
  }): Promise<void>;
  getPosition(chainId: number, marketId: string, owner: string): Promise<PositionRecord | null>;
  listPositions(chainId?: number): Promise<PositionRecord[]>;
  upsertPosition(position: PositionRecord): Promise<void>;
  listVaults(chainId?: number): Promise<VaultRecord[]>;
  upsertVault(vault: VaultRecord): Promise<void>;
  seedMarkets(config: ChainConfig): Promise<void>;
}
