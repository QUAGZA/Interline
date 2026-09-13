-- Direct lending (1:1) facilities
CREATE TABLE IF NOT EXISTS direct_facilities (
  chain_id integer NOT NULL,
  facility text NOT NULL,
  lender text NOT NULL,
  borrower text NOT NULL,
  vault text NOT NULL,
  asset text NOT NULL DEFAULT '0x0000000000000000000000000000000000000000',
  terms_hash text NOT NULL DEFAULT '0x',
  lender_accepted boolean NOT NULL DEFAULT false,
  borrower_accepted boolean NOT NULL DEFAULT false,
  declined boolean NOT NULL DEFAULT false,
  cancelled boolean NOT NULL DEFAULT false,
  ended boolean NOT NULL DEFAULT false,
  acceptance_deadline numeric(78, 0) NOT NULL DEFAULT 0,
  activated_at numeric(78, 0) NOT NULL DEFAULT 0,
  borrow_expiry numeric(78, 0) NOT NULL DEFAULT 0,
  repayment_due_at numeric(78, 0) NOT NULL DEFAULT 0,
  credit_limit numeric(78, 0) NOT NULL DEFAULT 0,
  accounted_cash numeric(78, 0) NOT NULL DEFAULT 0,
  debt_shares numeric(78, 0) NOT NULL DEFAULT 0,
  principal numeric(78, 0) NOT NULL DEFAULT 0,
  last_debt numeric(78, 0) NOT NULL DEFAULT 0,
  apr_ray numeric(78, 0) NOT NULL DEFAULT 0,
  recall_deadline numeric(78, 0) NOT NULL DEFAULT 0,
  recall_active boolean NOT NULL DEFAULT false,
  borrowing_paused boolean NOT NULL DEFAULT false,
  PRIMARY KEY (chain_id, facility)
);

CREATE INDEX IF NOT EXISTS direct_facilities_lender ON direct_facilities (chain_id, lender);
CREATE INDEX IF NOT EXISTS direct_facilities_borrower ON direct_facilities (chain_id, borrower);
