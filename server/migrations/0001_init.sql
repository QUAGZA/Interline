-- Wave 5 durable indexer schema
CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexer_cursors (
  chain_id integer PRIMARY KEY,
  start_block bigint NOT NULL,
  last_block bigint NOT NULL,
  last_hash text,
  last_timestamp bigint NOT NULL DEFAULT 0,
  head_block bigint NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_blocks (
  chain_id integer NOT NULL,
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  parent_hash text,
  timestamp bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, block_number)
);

CREATE TABLE IF NOT EXISTS indexed_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chain_id integer NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  block_hash text,
  address text NOT NULL,
  event_name text NOT NULL,
  args jsonb NOT NULL,
  timestamp bigint NOT NULL DEFAULT 0,
  CONSTRAINT indexed_events_chain_tx_log UNIQUE (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS indexed_events_chain_block ON indexed_events (chain_id, block_number, log_index);
CREATE INDEX IF NOT EXISTS indexed_events_chain_address ON indexed_events (chain_id, address);

CREATE TABLE IF NOT EXISTS markets (
  chain_id integer NOT NULL,
  market_id text NOT NULL,
  address text NOT NULL,
  label text NOT NULL,
  delivery_mode text NOT NULL,
  loan_token text NOT NULL,
  loan_symbol text NOT NULL,
  loan_decimals integer NOT NULL,
  collateral_token text NOT NULL,
  collateral_symbol text NOT NULL,
  collateral_decimals integer NOT NULL,
  oracle text,
  accounted_cash numeric(78, 0) NOT NULL DEFAULT 0,
  total_debt_shares numeric(78, 0) NOT NULL DEFAULT 0,
  total_supply_shares numeric(78, 0) NOT NULL DEFAULT 0,
  epoch_index_ray numeric(78, 0) NOT NULL DEFAULT 0,
  epoch_timestamp numeric(78, 0) NOT NULL DEFAULT 0,
  epoch_apr_ray numeric(78, 0) NOT NULL DEFAULT 0,
  supply_cap numeric(78, 0) NOT NULL DEFAULT 0,
  borrow_cap numeric(78, 0) NOT NULL DEFAULT 0,
  max_ltv_bps integer NOT NULL DEFAULT 7000,
  liquidation_threshold_bps integer NOT NULL DEFAULT 8000,
  liquidation_bonus_bps integer NOT NULL DEFAULT 500,
  default_position_cap numeric(78, 0) NOT NULL DEFAULT 0,
  supply_frozen boolean NOT NULL DEFAULT false,
  borrow_frozen boolean NOT NULL DEFAULT false,
  recall_active boolean NOT NULL DEFAULT false,
  recall_deadline numeric(78, 0) NOT NULL DEFAULT 0,
  recall_clearable_at numeric(78, 0) NOT NULL DEFAULT 0,
  terminal boolean NOT NULL DEFAULT false,
  unaccounted_surplus numeric(78, 0) NOT NULL DEFAULT 0,
  quote_scale36 numeric(78, 0) NOT NULL DEFAULT 0,
  collateral_usd_wad numeric(78, 0) NOT NULL DEFAULT 0,
  loan_usd_wad numeric(78, 0) NOT NULL DEFAULT 0,
  oracle_status text NOT NULL DEFAULT 'UNAVAILABLE',
  oracle_mode text NOT NULL DEFAULT 'simulated',
  PRIMARY KEY (chain_id, market_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS markets_chain_address ON markets (chain_id, address);

CREATE TABLE IF NOT EXISTS positions (
  chain_id integer NOT NULL,
  market_id text NOT NULL,
  market_address text NOT NULL,
  owner text NOT NULL,
  supply_shares numeric(78, 0) NOT NULL DEFAULT 0,
  debt_shares numeric(78, 0) NOT NULL DEFAULT 0,
  collateral numeric(78, 0) NOT NULL DEFAULT 0,
  principal_outstanding numeric(78, 0) NOT NULL DEFAULT 0,
  defaulted boolean NOT NULL DEFAULT false,
  written_off_liability numeric(78, 0) NOT NULL DEFAULT 0,
  position_cap numeric(78, 0) NOT NULL DEFAULT 0,
  vault text,
  projected_debt numeric(78, 0) NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, market_id, owner)
);

CREATE INDEX IF NOT EXISTS positions_projected_debt ON positions (chain_id, projected_debt);

CREATE TABLE IF NOT EXISTS vaults (
  chain_id integer NOT NULL,
  market_address text NOT NULL,
  owner text NOT NULL,
  vault text NOT NULL,
  venue_assets numeric(78, 0) NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, vault)
);
