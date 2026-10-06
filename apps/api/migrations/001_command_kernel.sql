CREATE TABLE IF NOT EXISTS api_commands (
  business_id uuid NOT NULL,
  command_id uuid NOT NULL,
  command_name text NOT NULL,
  payload_hash char(64) NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  outcome jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (business_id, command_id)
);

CREATE TABLE IF NOT EXISTS business_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL,
  command_id uuid NOT NULL,
  event_type text NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE (business_id, command_id)
);

CREATE TABLE IF NOT EXISTS business_change_cursors (
  business_id uuid PRIMARY KEY,
  cursor bigint NOT NULL CHECK (cursor > 0)
);

CREATE TABLE IF NOT EXISTS business_changes (
  business_id uuid NOT NULL,
  cursor bigint NOT NULL,
  command_id uuid NOT NULL,
  change_type text NOT NULL,
  projection jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id, cursor),
  UNIQUE (business_id, command_id)
);

CREATE TABLE IF NOT EXISTS offline_grants (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  device_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  allowed_commands text[] NOT NULL,
  max_commands integer NOT NULL CHECK (max_commands > 0),
  used_commands integer NOT NULL DEFAULT 0 CHECK (used_commands >= 0 AND used_commands <= max_commands),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);

CREATE TABLE IF NOT EXISTS offline_grant_commands (
  grant_id uuid NOT NULL REFERENCES offline_grants(id),
  command_id uuid NOT NULL,
  PRIMARY KEY (grant_id, command_id)
);
