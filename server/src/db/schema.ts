import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const uintStr = (name: string) =>
  numeric(name, { precision: 78, scale: 0, mode: "string" }).notNull().default("0");

export const indexerCursors = pgTable("indexer_cursors", {
  chainId: integer("chain_id").primaryKey(),
  startBlock: bigint("start_block", { mode: "bigint" }).notNull(),
  lastBlock: bigint("last_block", { mode: "bigint" }).notNull(),
  lastHash: text("last_hash"),
  lastTimestamp: bigint("last_timestamp", { mode: "bigint" }).notNull().default(0n),
  headBlock: bigint("head_block", { mode: "bigint" }).notNull().default(0n),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chainBlocks = pgTable(
  "chain_blocks",
  {
    chainId: integer("chain_id").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: text("block_hash").notNull(),
    parentHash: text("parent_hash"),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull().default(0n),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.blockNumber] })],
);

export const indexedEvents = pgTable(
  "indexed_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    chainId: integer("chain_id").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: text("block_hash"),
    address: text("address").notNull(),
    eventName: text("event_name").notNull(),
    args: jsonb("args").$type<Record<string, string>>().notNull(),
    timestamp: bigint("timestamp", { mode: "bigint" }).notNull().default(0n),
  },
  (t) => [
    uniqueIndex("indexed_events_chain_tx_log").on(t.chainId, t.txHash, t.logIndex),
    index("indexed_events_chain_block").on(t.chainId, t.blockNumber, t.logIndex),
    index("indexed_events_chain_address").on(t.chainId, t.address),
  ],
);

export const markets = pgTable(
  "markets",
  {
    chainId: integer("chain_id").notNull(),
    marketId: text("market_id").notNull(),
    address: text("address").notNull(),
    label: text("label").notNull(),
    deliveryMode: text("delivery_mode").notNull(),
    loanToken: text("loan_token").notNull(),
    loanSymbol: text("loan_symbol").notNull(),
    loanDecimals: integer("loan_decimals").notNull(),
    collateralToken: text("collateral_token").notNull(),
    collateralSymbol: text("collateral_symbol").notNull(),
    collateralDecimals: integer("collateral_decimals").notNull(),
    oracle: text("oracle"),
    accountedCash: uintStr("accounted_cash"),
    totalDebtShares: uintStr("total_debt_shares"),
    totalSupplyShares: uintStr("total_supply_shares"),
    epochIndexRay: uintStr("epoch_index_ray"),
    epochTimestamp: uintStr("epoch_timestamp"),
    epochAprRay: uintStr("epoch_apr_ray"),
    supplyCap: uintStr("supply_cap"),
    borrowCap: uintStr("borrow_cap"),
    maxLtvBps: integer("max_ltv_bps").notNull().default(7000),
    liquidationThresholdBps: integer("liquidation_threshold_bps").notNull().default(8000),
    liquidationBonusBps: integer("liquidation_bonus_bps").notNull().default(500),
    defaultPositionCap: uintStr("default_position_cap"),
    supplyFrozen: boolean("supply_frozen").notNull().default(false),
    borrowFrozen: boolean("borrow_frozen").notNull().default(false),
    recallActive: boolean("recall_active").notNull().default(false),
    recallDeadline: uintStr("recall_deadline"),
    recallClearableAt: uintStr("recall_clearable_at"),
    terminal: boolean("terminal").notNull().default(false),
    unaccountedSurplus: uintStr("unaccounted_surplus"),
    quoteScale36: uintStr("quote_scale36"),
    collateralUsdWad: uintStr("collateral_usd_wad"),
    loanUsdWad: uintStr("loan_usd_wad"),
    oracleStatus: text("oracle_status").notNull().default("UNAVAILABLE"),
    oracleMode: text("oracle_mode").notNull().default("simulated"),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.marketId] }),
    uniqueIndex("markets_chain_address").on(t.chainId, t.address),
  ],
);

export const positions = pgTable(
  "positions",
  {
    chainId: integer("chain_id").notNull(),
    marketId: text("market_id").notNull(),
    marketAddress: text("market_address").notNull(),
    owner: text("owner").notNull(),
    supplyShares: uintStr("supply_shares"),
    debtShares: uintStr("debt_shares"),
    collateral: uintStr("collateral"),
    principalOutstanding: uintStr("principal_outstanding"),
    defaulted: boolean("defaulted").notNull().default(false),
    writtenOffLiability: uintStr("written_off_liability"),
    positionCap: uintStr("position_cap"),
    vault: text("vault"),
    projectedDebt: uintStr("projected_debt"),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.marketId, t.owner] }),
    index("positions_projected_debt").on(t.chainId, t.projectedDebt),
  ],
);

export const vaults = pgTable(
  "vaults",
  {
    chainId: integer("chain_id").notNull(),
    marketAddress: text("market_address").notNull(),
    owner: text("owner").notNull(),
    vault: text("vault").notNull(),
    venueAssets: uintStr("venue_assets"),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.vault] })],
);

export const schemaMigrations = pgTable("schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});
