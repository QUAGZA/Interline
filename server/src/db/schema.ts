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
  hydratedBlockNumber: bigint("hydrated_block_number", { mode: "bigint" }),
  hydratedBlockHash: text("hydrated_block_hash"),
  hydratedBlockTimestamp: bigint("hydrated_block_timestamp", { mode: "bigint" }).notNull().default(0n),
  lastHydratedAt: timestamp("last_hydrated_at", { withTimezone: true }),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  hydrationOk: boolean("hydration_ok").notNull().default(false),
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
    maxLtvBps: integer("max_ltv_bps").notNull().default(8000),
    liquidationThresholdBps: integer("liquidation_threshold_bps").notNull().default(9000),
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

export const directFacilities = pgTable(
  "direct_facilities",
  {
    chainId: integer("chain_id").notNull(),
    facility: text("facility").notNull(),
    lender: text("lender").notNull(),
    borrower: text("borrower").notNull(),
    vault: text("vault").notNull(),
    asset: text("asset").notNull().default("0x0000000000000000000000000000000000000000"),
    termsHash: text("terms_hash").notNull().default("0x"),
    lenderAccepted: boolean("lender_accepted").notNull().default(false),
    borrowerAccepted: boolean("borrower_accepted").notNull().default(false),
    declined: boolean("declined").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    ended: boolean("ended").notNull().default(false),
    acceptanceDeadline: uintStr("acceptance_deadline"),
    activatedAt: uintStr("activated_at"),
    borrowExpiry: uintStr("borrow_expiry"),
    repaymentDueAt: uintStr("repayment_due_at"),
    creditLimit: uintStr("credit_limit"),
    accountedCash: uintStr("accounted_cash"),
    debtShares: uintStr("debt_shares"),
    principal: uintStr("principal"),
    lastDebt: uintStr("last_debt"),
    aprRay: uintStr("apr_ray"),
    recallDeadline: uintStr("recall_deadline"),
    recallActive: boolean("recall_active").notNull().default(false),
    borrowingPaused: boolean("borrowing_paused").notNull().default(false),
    venue: text("venue").notNull().default("0x0000000000000000000000000000000000000000"),
    swapRouter: text("swap_router").notNull().default("0x0000000000000000000000000000000000000000"),
    otherToken: text("other_token").notNull().default("0x0000000000000000000000000000000000000000"),
    borrowPeriod: uintStr("borrow_period"),
    recallWindow: uintStr("recall_window"),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.facility] }),
    index("direct_facilities_lender").on(t.chainId, t.lender),
    index("direct_facilities_borrower").on(t.chainId, t.borrower),
    index("direct_facilities_debt").on(t.chainId, t.lastDebt),
  ],
);

export const directTerms = pgTable(
  "direct_terms",
  {
    chainId: integer("chain_id").notNull(),
    facility: text("facility").notNull(),
    loanToken: text("loan_token").notNull(),
    creditLimit: uintStr("credit_limit"),
    aprRay: uintStr("apr_ray"),
    acceptanceLifetime: uintStr("acceptance_lifetime"),
    borrowPeriod: uintStr("borrow_period"),
    recallWindow: uintStr("recall_window"),
    venue: text("venue").notNull(),
    swapRouter: text("swap_router").notNull(),
    otherToken: text("other_token").notNull(),
    termsHash: text("terms_hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.facility] })],
);

export const directAcceptances = pgTable(
  "direct_acceptances",
  {
    chainId: integer("chain_id").notNull(),
    facility: text("facility").notNull(),
    party: text("party").notNull(),
    accepted: boolean("accepted").notNull().default(true),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    timestamp: uintStr("timestamp"),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.facility, t.party] })],
);

export const directCashflows = pgTable(
  "direct_cashflows",
  {
    chainId: integer("chain_id").notNull(),
    facility: text("facility").notNull(),
    kind: text("kind").notNull(),
    assets: uintStr("assets"),
    cashAfter: uintStr("cash_after"),
    debtAfter: uintStr("debt_after"),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    timestamp: uintStr("timestamp"),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.txHash, t.logIndex] }),
    index("direct_cashflows_facility").on(t.chainId, t.facility),
  ],
);

export const directCapProposals = pgTable(
  "direct_cap_proposals",
  {
    chainId: integer("chain_id").notNull(),
    facility: text("facility").notNull(),
    digest: text("digest").notNull(),
    proposer: text("proposer").notNull(),
    nonce: uintStr("nonce"),
    validUntil: uintStr("valid_until"),
    newCap: uintStr("new_cap"),
    lenderApproved: boolean("lender_approved").notNull().default(false),
    borrowerApproved: boolean("borrower_approved").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    executed: boolean("executed").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.facility, t.digest] })],
);

export const directRecallEpisodes = pgTable(
  "direct_recall_episodes",
  {
    chainId: integer("chain_id").notNull(),
    facility: text("facility").notNull(),
    reasonHash: text("reason_hash").notNull().default("0x"),
    reasonCode: integer("reason_code").notNull().default(0),
    deadline: uintStr("deadline"),
    cleared: boolean("cleared").notNull().default(false),
    startedTxHash: text("started_tx_hash").notNull(),
    startedLogIndex: integer("started_log_index").notNull(),
    timestamp: uintStr("timestamp"),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.facility] })],
);

export const directHistory = pgTable(
  "direct_history",
  {
    chainId: integer("chain_id").notNull(),
    facility: text("facility").notNull(),
    cash: uintStr("cash"),
    debt: uintStr("debt"),
    principal: uintStr("principal"),
    creditLimit: uintStr("credit_limit"),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    timestamp: uintStr("timestamp"),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.txHash, t.logIndex] }),
    index("direct_history_facility").on(t.chainId, t.facility),
  ],
);

export const schemaMigrations = pgTable("schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});
