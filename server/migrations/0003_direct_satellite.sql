-- Direct lending satellite tables + extra facility columns
ALTER TABLE direct_facilities ADD COLUMN IF NOT EXISTS venue text NOT NULL DEFAULT '0x0000000000000000000000000000000000000000';
ALTER TABLE direct_facilities ADD COLUMN IF NOT EXISTS swap_router text NOT NULL DEFAULT '0x0000000000000000000000000000000000000000';
ALTER TABLE direct_facilities ADD COLUMN IF NOT EXISTS other_token text NOT NULL DEFAULT '0x0000000000000000000000000000000000000000';
ALTER TABLE direct_facilities ADD COLUMN IF NOT EXISTS borrow_period numeric(78, 0) NOT NULL DEFAULT 0;
ALTER TABLE direct_facilities ADD COLUMN IF NOT EXISTS recall_window numeric(78, 0) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS direct_facilities_debt ON direct_facilities (chain_id, last_debt);

CREATE TABLE IF NOT EXISTS direct_terms (
  chain_id integer NOT NULL,
  facility text NOT NULL,
  loan_token text NOT NULL,
  credit_limit numeric(78, 0) NOT NULL DEFAULT 0,
  apr_ray numeric(78, 0) NOT NULL DEFAULT 0,
  acceptance_lifetime numeric(78, 0) NOT NULL DEFAULT 0,
  borrow_period numeric(78, 0) NOT NULL DEFAULT 0,
  recall_window numeric(78, 0) NOT NULL DEFAULT 0,
  venue text NOT NULL,
  swap_router text NOT NULL,
  other_token text NOT NULL,
  terms_hash text NOT NULL,
  PRIMARY KEY (chain_id, facility)
);

CREATE TABLE IF NOT EXISTS direct_acceptances (
  chain_id integer NOT NULL,
  facility text NOT NULL,
  party text NOT NULL,
  accepted boolean NOT NULL DEFAULT true,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  timestamp numeric(78, 0) NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, facility, party)
);

CREATE TABLE IF NOT EXISTS direct_cashflows (
  chain_id integer NOT NULL,
  facility text NOT NULL,
  kind text NOT NULL,
  assets numeric(78, 0) NOT NULL DEFAULT 0,
  cash_after numeric(78, 0) NOT NULL DEFAULT 0,
  debt_after numeric(78, 0) NOT NULL DEFAULT 0,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  timestamp numeric(78, 0) NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS direct_cashflows_facility ON direct_cashflows (chain_id, facility);

CREATE TABLE IF NOT EXISTS direct_cap_proposals (
  chain_id integer NOT NULL,
  facility text NOT NULL,
  digest text NOT NULL,
  proposer text NOT NULL,
  nonce numeric(78, 0) NOT NULL DEFAULT 0,
  valid_until numeric(78, 0) NOT NULL DEFAULT 0,
  new_cap numeric(78, 0) NOT NULL DEFAULT 0,
  lender_approved boolean NOT NULL DEFAULT false,
  borrower_approved boolean NOT NULL DEFAULT false,
  cancelled boolean NOT NULL DEFAULT false,
  executed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (chain_id, facility, digest)
);

CREATE TABLE IF NOT EXISTS direct_recall_episodes (
  chain_id integer NOT NULL,
  facility text NOT NULL,
  reason_hash text NOT NULL DEFAULT '0x',
  reason_code integer NOT NULL DEFAULT 0,
  deadline numeric(78, 0) NOT NULL DEFAULT 0,
  cleared boolean NOT NULL DEFAULT false,
  started_tx_hash text NOT NULL,
  started_log_index integer NOT NULL,
  timestamp numeric(78, 0) NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, facility)
);

CREATE TABLE IF NOT EXISTS direct_history (
  chain_id integer NOT NULL,
  facility text NOT NULL,
  cash numeric(78, 0) NOT NULL DEFAULT 0,
  debt numeric(78, 0) NOT NULL DEFAULT 0,
  principal numeric(78, 0) NOT NULL DEFAULT 0,
  credit_limit numeric(78, 0) NOT NULL DEFAULT 0,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  timestamp numeric(78, 0) NOT NULL DEFAULT 0,
  PRIMARY KEY (chain_id, tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS direct_history_facility ON direct_history (chain_id, facility);
