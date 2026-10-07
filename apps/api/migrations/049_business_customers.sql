CREATE TABLE business_customers (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
 phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
 email text NOT NULL DEFAULT '' CHECK (length(email) <= 254),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
 version bigint NOT NULL CHECK (version > 0),
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 archived_at timestamptz,
 PRIMARY KEY (business_id,id)
);

CREATE INDEX business_customers_active_name_idx
 ON business_customers (business_id,lower(name),id)
 WHERE archived_at IS NULL;

CREATE TABLE business_customer_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 customer_id uuid NOT NULL,
 version bigint NOT NULL CHECK (version > 0),
 event_type text NOT NULL CHECK (event_type = 'SAVED'),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
 command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,id),
 UNIQUE (business_id,command_id),
 FOREIGN KEY (business_id,customer_id) REFERENCES business_customers(business_id,id)
);
CREATE INDEX business_customer_events_history_idx
 ON business_customer_events (business_id,customer_id,occurred_at DESC,id);
