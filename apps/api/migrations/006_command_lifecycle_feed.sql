ALTER TABLE api_commands
  ADD COLUMN status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('RECEIVED','PROCESSING','CONFIRMED','REJECTED','CONFLICT')),
  ADD COLUMN request jsonb,
  ADD COLUMN error jsonb,
  ADD COLUMN received_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE api_commands ALTER COLUMN outcome DROP NOT NULL;
ALTER TABLE api_commands ALTER COLUMN committed_at DROP NOT NULL;
CREATE INDEX IF NOT EXISTS api_commands_status_updated_idx ON api_commands(business_id,status,updated_at);
