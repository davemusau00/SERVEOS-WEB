-- Expand-only: existing business commands and projections remain unchanged.
CREATE TABLE operational_events (
 business_id uuid NOT NULL REFERENCES businesses(id), id uuid NOT NULL, command_id uuid NOT NULL,
 kind text NOT NULL, target_type text NOT NULL, target_id uuid NOT NULL, outlet_id uuid,
 summary text NOT NULL, created_at timestamptz NOT NULL, resolved_at timestamptz,
 escalated_at timestamptz, PRIMARY KEY(business_id,id), UNIQUE(business_id,command_id,kind,target_id)
);
CREATE TABLE operational_inbox (
 business_id uuid NOT NULL, event_id uuid NOT NULL, staff_id uuid NOT NULL, device_id uuid,
 read_at timestamptz, PRIMARY KEY(business_id,event_id,staff_id),
 FOREIGN KEY(business_id,event_id) REFERENCES operational_events(business_id,id)
);
CREATE INDEX operational_inbox_staff ON operational_inbox(business_id,staff_id,event_id);
CREATE TABLE operational_push_subscriptions (
 id uuid PRIMARY KEY, business_id uuid NOT NULL, staff_id uuid NOT NULL, device_id uuid NOT NULL,
 session_id uuid NOT NULL REFERENCES api_staff_sessions(id), endpoint text NOT NULL UNIQUE,
 subscription jsonb NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE operational_push_deliveries (
 business_id uuid NOT NULL, event_id uuid NOT NULL, subscription_id uuid NOT NULL REFERENCES operational_push_subscriptions(id),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','ACCEPTED','FAILED','EXPIRED','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_status integer,
 PRIMARY KEY(business_id,event_id,subscription_id),
 FOREIGN KEY(business_id,event_id) REFERENCES operational_events(business_id,id)
);
CREATE TABLE mpesa_reference_submissions (
 business_id uuid NOT NULL, id uuid NOT NULL, order_id uuid NOT NULL, ticket_id uuid NOT NULL,
 outlet_id uuid NOT NULL, submitted_by uuid NOT NULL, code text NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0),
 received_at timestamptz NOT NULL, note text NOT NULL, status text NOT NULL CHECK(status IN ('SUBMITTED','VERIFIED','REJECTED','PAID')),
 duplicate boolean NOT NULL DEFAULT false, version bigint NOT NULL, source_command_id uuid NOT NULL,
 created_at timestamptz NOT NULL, reviewed_by uuid, reviewed_at timestamptz, reason text,
 PRIMARY KEY(business_id,id), UNIQUE(business_id,source_command_id)
);
CREATE INDEX mpesa_reference_code ON mpesa_reference_submissions(business_id,code);
CREATE TABLE mpesa_reference_reviews (
 business_id uuid NOT NULL, submission_id uuid NOT NULL, command_id uuid NOT NULL,
 actor_id uuid NOT NULL, status text NOT NULL, reason text NOT NULL, occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,command_id), FOREIGN KEY(business_id,submission_id) REFERENCES mpesa_reference_submissions(business_id,id)
);
