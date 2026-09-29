BEGIN IMMEDIATE;
CREATE TABLE inventory_count_closed_sessions (
    staff_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    closed_at TEXT NOT NULL,
    PRIMARY KEY (staff_id, session_id)
);
PRAGMA user_version=12;
COMMIT;
