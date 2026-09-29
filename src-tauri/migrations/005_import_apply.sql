BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS import_external_ids(
  namespace TEXT NOT NULL,
  external_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(namespace,external_id)
);
CREATE INDEX IF NOT EXISTS import_external_record ON import_external_ids(collection,record_id);
CREATE UNIQUE INDEX IF NOT EXISTS import_external_identity_ci ON import_external_ids(namespace,lower(external_id));

CREATE TABLE IF NOT EXISTS import_apply_plans(
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  status TEXT NOT NULL CHECK(status IN ('READY','BLOCKED','APPLYING','APPLIED','PARTIAL','SUPERSEDED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  installation_stage TEXT NOT NULL,
  summary TEXT NOT NULL CHECK(json_valid(summary))
);
CREATE INDEX IF NOT EXISTS import_apply_plans_batch ON import_apply_plans(batch_id,created_at DESC);

CREATE TABLE IF NOT EXISTS import_apply_steps(
  plan_id TEXT NOT NULL REFERENCES import_apply_plans(id),
  step_index INTEGER NOT NULL CHECK(step_index>0),
  row_number INTEGER NOT NULL CHECK(row_number>0),
  action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','NO_CHANGE','BLOCKED','CONFLICT')),
  status TEXT NOT NULL CHECK(status IN ('PLANNED','SKIPPED','APPLIED','FAILED','BLOCKED')),
  operation TEXT,
  target_collection TEXT,
  target_id TEXT,
  expected_version INTEGER,
  command_id TEXT,
  payload TEXT CHECK(payload IS NULL OR json_valid(payload)),
  reason TEXT NOT NULL,
  map_namespace TEXT,
  map_external_id TEXT,
  error TEXT,
  PRIMARY KEY(plan_id,step_index)
);
CREATE INDEX IF NOT EXISTS import_apply_steps_status ON import_apply_steps(plan_id,status,step_index);

PRAGMA user_version=5;
COMMIT;
