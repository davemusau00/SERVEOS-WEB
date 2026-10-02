BEGIN IMMEDIATE;

-- Explicit business authority mode. This is persistent terminal state, not a
-- property of the current login session. A local PIN unlock must never be able
-- to re-enable the legacy writer while this value says SHARED_V2.
--
--   LEGACY_LOCAL  SQLite is the authoritative business store.
--   CUTOVER_PREP  Legacy mutations are frozen; cutover import/verification and
--                 read-only v2 baseline installation are permitted.
--   SHARED_V2     servos_v2 is the sole business authority. Legacy reads,
--                 writes and upload are refused without a legacy fallback.
CREATE TABLE IF NOT EXISTS authority_state(
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    mode TEXT NOT NULL DEFAULT 'LEGACY_LOCAL'
        CHECK(mode IN ('LEGACY_LOCAL','CUTOVER_PREP','SHARED_V2')),
    cutover_id TEXT,
    updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO authority_state(singleton,mode,updated_at)
VALUES(1,'LEGACY_LOCAL','1970-01-01T00:00:00Z');

-- Formal resolution for legacy outbox rows that will never reach
-- servos_upload. CLOUD_ACKNOWLEDGED preserves the historical meaning; the new
-- SUPERSEDED_BY_V2_CUTOVER state records that a verified v2 cutover, not an
-- upload, is what closed the row. Never delete an outbox row instead.
--
-- This is a side table rather than extra `outbox` columns because SQLite has no
-- "ADD COLUMN IF NOT EXISTS". A database whose user_version was rewound for an
-- upgrade test may already carry the columns, and a bare ALTER TABLE would then
-- abort the whole migration. A table keyed by the outbox sequence is idempotent,
-- keeps the original envelope untouched, and records the evidence the cutover
-- runbook requires.
CREATE TABLE IF NOT EXISTS legacy_outbox_resolution(
    sequence INTEGER PRIMARY KEY REFERENCES outbox(sequence),
    resolution TEXT NOT NULL
        CHECK(resolution IN ('CLOUD_ACKNOWLEDGED','SUPERSEDED_BY_V2_CUTOVER')),
    cutover_id TEXT,
    envelope_hash TEXT NOT NULL,
    resolved_at TEXT NOT NULL
);
-- SQLite has no CREATE TRIGGER IF NOT EXISTS, so drop first. These guards exist
-- precisely so the resolution evidence cannot be rewritten after the fact.
DROP TRIGGER IF EXISTS legacy_outbox_resolution_no_update;
DROP TRIGGER IF EXISTS legacy_outbox_resolution_no_delete;
CREATE TRIGGER legacy_outbox_resolution_no_update
BEFORE UPDATE ON legacy_outbox_resolution
BEGIN SELECT RAISE(ABORT,'Legacy outbox resolution is immutable evidence'); END;
CREATE TRIGGER legacy_outbox_resolution_no_delete
BEFORE DELETE ON legacy_outbox_resolution
BEGIN SELECT RAISE(ABORT,'Legacy outbox resolution is immutable evidence'); END;

-- Immutable local evidence for every authority transition. Operators must be
-- able to show who moved the business between writers and when.
CREATE TABLE IF NOT EXISTS authority_transitions(
    id TEXT PRIMARY KEY,
    from_mode TEXT NOT NULL,
    to_mode TEXT NOT NULL CHECK(to_mode IN ('LEGACY_LOCAL','CUTOVER_PREP','SHARED_V2')),
    actor_id TEXT,
    cutover_id TEXT,
    reason TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);
DROP TRIGGER IF EXISTS authority_transitions_no_update;
DROP TRIGGER IF EXISTS authority_transitions_no_delete;
CREATE TRIGGER authority_transitions_no_update
BEFORE UPDATE ON authority_transitions
BEGIN SELECT RAISE(ABORT,'Authority transitions cannot be updated'); END;
CREATE TRIGGER authority_transitions_no_delete
BEFORE DELETE ON authority_transitions
BEGIN SELECT RAISE(ABORT,'Authority transitions cannot be deleted'); END;

-- A row is only "pending legacy work" while it is neither acknowledged nor
-- formally resolved. This replaces the acknowledged_at IS NULL test that
-- previously blocked every v2 baseline install.
--
-- SQLite forbids subqueries in a partial index predicate, so the unresolved
-- count is a small table scan over unacknowledged rows joined against the
-- resolution side table. This is an operator-scale queue, not a hot path.
CREATE INDEX IF NOT EXISTS outbox_unacknowledged
ON outbox(sequence) WHERE acknowledged_at IS NULL;

PRAGMA user_version=15;
COMMIT;