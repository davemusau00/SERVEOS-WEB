CREATE TABLE api_business_bootstrap_snapshots (
  snapshot_id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id),
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  session_id uuid NOT NULL,
  authorization_hash char(64) NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  high_water_cursor bigint NOT NULL CHECK (high_water_cursor >= 0),
  record_count integer NOT NULL CHECK (record_count >= 0),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest)='object'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at)
);

CREATE INDEX api_business_bootstrap_snapshots_owner_idx
  ON api_business_bootstrap_snapshots(business_id,session_id,created_at DESC);

CREATE INDEX api_business_bootstrap_snapshots_expiry_idx
  ON api_business_bootstrap_snapshots(expires_at);

CREATE TABLE api_business_bootstrap_snapshot_records (
  snapshot_id uuid NOT NULL REFERENCES api_business_bootstrap_snapshots(snapshot_id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  collection text NOT NULL,
  record_id text NOT NULL,
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection)='object'),
  PRIMARY KEY (snapshot_id,ordinal),
  UNIQUE (snapshot_id,collection,record_id)
);
