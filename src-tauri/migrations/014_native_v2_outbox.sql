BEGIN IMMEDIATE;

-- Staged native protocol state. No legacy command is copied into this queue;
-- entries are written only by the future online-only v2 adapter.
CREATE TABLE IF NOT EXISTS native_v2_state(
    device_id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sequence>=0),
    feed_cursor INTEGER NOT NULL DEFAULT 0 CHECK(feed_cursor>=0),
    snapshot_complete INTEGER NOT NULL DEFAULT 0 CHECK(snapshot_complete IN (0,1)),
    snapshot_policy TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS native_v2_outbox(
    command_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    client_sequence INTEGER NOT NULL CHECK(client_sequence>0),
    envelope TEXT NOT NULL CHECK(json_valid(envelope)),
    state TEXT NOT NULL CHECK(state IN ('PENDING','SYNCHRONIZED','CONFLICT','REJECTED')),
    result TEXT CHECK(result IS NULL OR json_valid(result)),
    server_sequence INTEGER CHECK(server_sequence IS NULL OR server_sequence>=0),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
    created_at TEXT NOT NULL,
    acknowledged_at TEXT,
    UNIQUE(device_id,client_sequence)
);
-- Isolated server-feed replica. It is intentionally not read by the legacy
-- operational UI; migration/reconciliation must establish a complete baseline
-- before any future authority switch.
CREATE TABLE IF NOT EXISTS native_v2_records(
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version>0),
    data TEXT NOT NULL CHECK(json_valid(data) AND json_type(data)='object'),
    archived INTEGER NOT NULL CHECK(archived IN (0,1)),
    feed_sequence INTEGER NOT NULL CHECK(feed_sequence>=0),
    PRIMARY KEY(collection,record_id)
);
CREATE INDEX IF NOT EXISTS native_v2_records_feed_sequence
ON native_v2_records(feed_sequence);
CREATE INDEX IF NOT EXISTS native_v2_outbox_pending
ON native_v2_outbox(device_id,client_sequence) WHERE state='PENDING';

PRAGMA user_version=14;
COMMIT;
