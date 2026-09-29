BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS guidance_progress (
    staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    guide_id TEXT NOT NULL,
    guide_version INTEGER NOT NULL CHECK(guide_version > 0),
    state TEXT NOT NULL CHECK(state IN ('IN_PROGRESS','COMPLETED','DISMISSED')),
    current_step_id TEXT,
    completed_step_ids TEXT NOT NULL CHECK(json_valid(completed_step_ids)),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(staff_id, guide_id)
);

CREATE INDEX IF NOT EXISTS guidance_progress_staff_updated
ON guidance_progress(staff_id, updated_at DESC);

PRAGMA user_version=10;
COMMIT;
