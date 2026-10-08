CREATE TABLE IF NOT EXISTS api_import_batches (
  business_id uuid NOT NULL,
  id uuid NOT NULL,
  template_key text NOT NULL,
  file_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('STAGED','DRY_RUN_READY','DRY_RUN_BLOCKED','APPLYING','APPLIED','PARTIAL','CANCELLED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  source_hash char(64) NOT NULL,
  source_text text,
  headers jsonb NOT NULL,
  rows jsonb NOT NULL,
  row_count integer NOT NULL CHECK (row_count >= 0),
  valid_count integer NOT NULL CHECK (valid_count >= 0),
  invalid_count integer NOT NULL CHECK (invalid_count >= 0),
  notes text NOT NULL DEFAULT '',
  PRIMARY KEY (business_id, id)
);

CREATE INDEX IF NOT EXISTS api_import_batches_recent_idx
  ON api_import_batches (business_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS api_import_plans (
  business_id uuid NOT NULL,
  id uuid NOT NULL,
  batch_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('READY','BLOCKED','APPLYING','APPLIED','PARTIAL','CANCELLED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  source_hash char(64) NOT NULL,
  steps jsonb NOT NULL,
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, batch_id) REFERENCES api_import_batches (business_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS api_import_one_open_plan_per_batch_idx
  ON api_import_plans (business_id, batch_id)
  WHERE status IN ('READY','BLOCKED','APPLYING','PARTIAL');

CREATE TABLE IF NOT EXISTS api_import_external_ids (
  business_id uuid NOT NULL,
  template_key text NOT NULL,
  external_id text NOT NULL,
  external_id_key text NOT NULL,
  record_collection text NOT NULL,
  record_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (business_id, template_key, external_id_key),
  FOREIGN KEY (business_id, batch_id) REFERENCES api_import_batches (business_id, id)
);

CREATE TABLE IF NOT EXISTS api_import_events (
  business_id uuid NOT NULL,
  id uuid NOT NULL,
  batch_id uuid NOT NULL,
  plan_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('STAGED','PLANNED','APPLIED','PARTIAL','CANCELLED')),
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  reason text,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, batch_id) REFERENCES api_import_batches (business_id, id)
);
