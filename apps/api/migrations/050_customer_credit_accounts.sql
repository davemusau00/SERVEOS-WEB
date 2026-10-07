CREATE TABLE customer_credit_accounts (
 business_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('ACTIVE','HOLD','CLOSED')),
 credit_limit_minor bigint NOT NULL CHECK (credit_limit_minor >= 0),
 terms_days integer NOT NULL CHECK (terms_days BETWEEN 0 AND 365),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
 version bigint NOT NULL CHECK (version > 0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,customer_id),
 FOREIGN KEY (business_id,customer_id) REFERENCES business_customers(business_id,id)
);

CREATE TABLE customer_credit_account_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 customer_id uuid NOT NULL,
 version bigint NOT NULL CHECK (version > 0),
 event_type text NOT NULL CHECK (event_type = 'TERMS_SAVED'),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
 before_state jsonb,
 after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
 command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,id),
 UNIQUE (business_id,command_id),
 FOREIGN KEY (business_id,customer_id) REFERENCES customer_credit_accounts(business_id,customer_id)
);

CREATE INDEX customer_credit_account_events_history_idx
 ON customer_credit_account_events (business_id,customer_id,occurred_at DESC,id);

CREATE FUNCTION prevent_customer_credit_account_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'customer credit account events are append only';
END;
$$;

CREATE TRIGGER customer_credit_account_events_immutable
 BEFORE UPDATE OR DELETE ON customer_credit_account_events
 FOR EACH ROW EXECUTE FUNCTION prevent_customer_credit_account_event_mutation();
