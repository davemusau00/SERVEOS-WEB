BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS import_batches(
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('READY','NEEDS_REVIEW','CANCELLED','APPLIED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count>=0),
  valid_count INTEGER NOT NULL DEFAULT 0 CHECK(valid_count>=0),
  invalid_count INTEGER NOT NULL DEFAULT 0 CHECK(invalid_count>=0),
  source_hash TEXT NOT NULL,
  headers TEXT NOT NULL CHECK(json_valid(headers)),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS import_batches_created ON import_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS import_batches_status ON import_batches(status,created_at DESC);
CREATE INDEX IF NOT EXISTS import_batches_hash ON import_batches(source_hash);

CREATE TABLE IF NOT EXISTS import_rows(
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  row_number INTEGER NOT NULL CHECK(row_number>0),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  normalized_json TEXT NOT NULL CHECK(json_valid(normalized_json)),
  status TEXT NOT NULL CHECK(status IN ('VALID','INVALID')),
  errors TEXT NOT NULL CHECK(json_valid(errors)),
  warnings TEXT NOT NULL CHECK(json_valid(warnings)),
  external_id TEXT,
  PRIMARY KEY(batch_id,row_number)
);

CREATE INDEX IF NOT EXISTS import_rows_status ON import_rows(batch_id,status,row_number);
CREATE INDEX IF NOT EXISTS import_rows_external_id ON import_rows(batch_id,external_id);

CREATE TABLE IF NOT EXISTS import_events(
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL REFERENCES import_batches(id),
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  detail TEXT NOT NULL CHECK(json_valid(detail))
);

CREATE TRIGGER IF NOT EXISTS import_event_no_update
BEFORE UPDATE ON import_events
BEGIN SELECT RAISE(ABORT,'Import events cannot be updated'); END;

CREATE TRIGGER IF NOT EXISTS import_event_no_delete
BEFORE DELETE ON import_events
BEGIN SELECT RAISE(ABORT,'Import events cannot be deleted'); END;

PRAGMA user_version=4;
COMMIT;
