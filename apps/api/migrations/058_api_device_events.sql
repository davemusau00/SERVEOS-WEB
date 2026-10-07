CREATE TABLE IF NOT EXISTS api_device_events (
  business_id uuid NOT NULL,
  id uuid NOT NULL,
  device_id uuid NOT NULL,
  device_version bigint NOT NULL CHECK (device_version > 0),
  event_type text NOT NULL CHECK (event_type IN ('ENROLLED','REVOKED')),
  before_state jsonb,
  after_state jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
  command_id uuid NOT NULL,
  actor_staff_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id)
);

CREATE INDEX IF NOT EXISTS api_device_events_history_idx
  ON api_device_events(business_id,device_id,occurred_at DESC,id DESC);
