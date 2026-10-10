-- The change feed is the authoritative projection source for browser clients.
-- Clients require strictly increasing per-record versions; re-emitting an
-- unchanged record (for example an idempotent replay returning existing rows)
-- would wedge the client change cursor. This registry lets insertChange drop
-- any record whose version is not strictly newer than the last emitted one.
CREATE TABLE IF NOT EXISTS business_change_records (
  business_id uuid NOT NULL,
  collection text NOT NULL,
  record_id text NOT NULL,
  version bigint NOT NULL,
  cursor bigint NOT NULL,
  PRIMARY KEY (business_id, collection, record_id)
);
