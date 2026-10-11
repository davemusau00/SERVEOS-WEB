CREATE TABLE pos_checkout_terminals (
 business_id uuid PRIMARY KEY REFERENCES businesses(id),
 outlet_id uuid NOT NULL,
 device_id uuid NOT NULL,
 enrolled_by uuid NOT NULL,
 enrolled_at timestamptz NOT NULL,
 version bigint NOT NULL DEFAULT 1
);
CREATE TABLE pos_ticket_submissions (
 business_id uuid NOT NULL REFERENCES businesses(id),
 ticket_id uuid NOT NULL,
 outlet_id uuid NOT NULL,
 table_id uuid,
 created_by_staff_id uuid NOT NULL,
 source_device_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('SUBMITTED','APPROVED','REJECTED','NEEDS_REVIEW','CANCELLED')),
 revision bigint NOT NULL CHECK(revision>0),
 ticket_payload jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 submitted_at timestamptz NOT NULL,
 approved_by_staff_id uuid,
 approved_at timestamptz,
 approval_order_id uuid,
 reason text,
 source_command_id uuid NOT NULL,
 PRIMARY KEY(business_id,ticket_id)
);
CREATE INDEX pos_ticket_inbox ON pos_ticket_submissions(business_id,outlet_id,status,submitted_at);
