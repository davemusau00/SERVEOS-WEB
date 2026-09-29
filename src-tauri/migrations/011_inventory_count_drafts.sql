BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS inventory_count_drafts (
    staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    location_id TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(staff_id, location_id)
);

CREATE INDEX IF NOT EXISTS inventory_count_drafts_updated
ON inventory_count_drafts(staff_id, updated_at DESC);

PRAGMA user_version=11;
COMMIT;
