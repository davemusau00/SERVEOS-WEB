BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS terminal_acceptance_evidence (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    details TEXT NOT NULL CHECK(json_valid(details)),
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS terminal_acceptance_kind_time
ON terminal_acceptance_evidence(kind, occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS terminal_acceptance_no_update
BEFORE UPDATE ON terminal_acceptance_evidence
BEGIN SELECT RAISE(ABORT,'Immutable terminal acceptance evidence'); END;

CREATE TRIGGER IF NOT EXISTS terminal_acceptance_no_delete
BEFORE DELETE ON terminal_acceptance_evidence
BEGIN SELECT RAISE(ABORT,'Immutable terminal acceptance evidence'); END;

PRAGMA user_version=9;
COMMIT;
