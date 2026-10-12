-- Expand-only delivery evidence. Existing outbox keys and retry semantics remain valid.
CREATE TABLE operational_push_attempts (
 business_id uuid NOT NULL,
 event_id uuid NOT NULL,
 subscription_id uuid NOT NULL,
 attempt integer NOT NULL CHECK (attempt > 0),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 outcome text NOT NULL DEFAULT 'STARTED'
  CHECK (outcome IN ('STARTED','ACCEPTED','QUEUED','FAILED','EXPIRED','CANCELLED','ABANDONED')),
 provider_status integer,
 PRIMARY KEY (business_id,event_id,subscription_id,attempt),
 FOREIGN KEY (business_id,event_id,subscription_id)
  REFERENCES operational_push_deliveries(business_id,event_id,subscription_id),
 CHECK ((outcome='STARTED' AND finished_at IS NULL) OR (outcome<>'STARTED' AND finished_at IS NOT NULL))
);
