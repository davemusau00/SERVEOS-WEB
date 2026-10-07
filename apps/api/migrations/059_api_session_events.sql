CREATE TABLE IF NOT EXISTS api_session_events (
  business_id uuid NOT NULL,
  id uuid NOT NULL,
  session_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type='REVOKED'),
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  command_id uuid NOT NULL,
  actor_staff_id uuid NOT NULL,
  actor_device_id uuid,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id)
);

CREATE INDEX IF NOT EXISTS api_session_events_staff_history_idx
  ON api_session_events(business_id,staff_id,occurred_at DESC,id DESC);
