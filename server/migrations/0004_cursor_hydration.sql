ALTER TABLE indexer_cursors ADD COLUMN IF NOT EXISTS hydrated_block_number bigint;
ALTER TABLE indexer_cursors ADD COLUMN IF NOT EXISTS hydrated_block_hash text;
ALTER TABLE indexer_cursors ADD COLUMN IF NOT EXISTS hydrated_block_timestamp bigint NOT NULL DEFAULT 0;
ALTER TABLE indexer_cursors ADD COLUMN IF NOT EXISTS last_hydrated_at timestamptz;
ALTER TABLE indexer_cursors ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;
ALTER TABLE indexer_cursors ADD COLUMN IF NOT EXISTS hydration_ok boolean NOT NULL DEFAULT false;
