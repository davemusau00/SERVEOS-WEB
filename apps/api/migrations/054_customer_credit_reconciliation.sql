CREATE TABLE customer_credit_reconciliations (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 customer_id uuid NOT NULL,
 ledger_balance_minor bigint NOT NULL,
 statement_balance_minor bigint NOT NULL CHECK (statement_balance_minor >= 0),
 variance_minor bigint NOT NULL,
 statement_reference text NOT NULL CHECK (length(btrim(statement_reference)) BETWEEN 1 AND 160),
 notes text NOT NULL CHECK (length(btrim(notes)) BETWEEN 3 AND 500),
 status text NOT NULL CHECK (status IN ('MATCHED','DISCREPANCY_OPEN')),
 source_command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 reconciled_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,id),
 UNIQUE (business_id,source_command_id),
 FOREIGN KEY (business_id,customer_id) REFERENCES customer_credit_accounts(business_id,customer_id),
 CHECK (variance_minor = statement_balance_minor - ledger_balance_minor),
 CHECK ((status='MATCHED' AND variance_minor=0) OR (status='DISCREPANCY_OPEN' AND variance_minor<>0))
);
CREATE INDEX customer_credit_reconciliations_history_idx
 ON customer_credit_reconciliations(business_id,customer_id,reconciled_at DESC,id);

CREATE TABLE customer_credit_discrepancies (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 reconciliation_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 variance_minor bigint NOT NULL CHECK (variance_minor<>0),
 status text NOT NULL DEFAULT 'OPEN' CHECK (status='OPEN'),
 opened_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,id),
 UNIQUE (business_id,reconciliation_id),
 FOREIGN KEY (business_id,reconciliation_id) REFERENCES customer_credit_reconciliations(business_id,id),
 FOREIGN KEY (business_id,customer_id) REFERENCES customer_credit_accounts(business_id,customer_id)
);
CREATE INDEX customer_credit_discrepancies_open_idx
 ON customer_credit_discrepancies(business_id,opened_at DESC,id);

CREATE TABLE customer_credit_discrepancy_resolutions (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 discrepancy_id uuid NOT NULL,
 outcome text NOT NULL CHECK (outcome IN ('STATEMENT_ERROR','MISSING_PAYMENT','MISSING_CHARGE','ACCEPTED_VARIANCE','WRITE_OFF_REQUIRED')),
 resolution text NOT NULL CHECK (length(btrim(resolution)) BETWEEN 3 AND 500),
 source_command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 resolved_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,id),
 UNIQUE (business_id,discrepancy_id),
 UNIQUE (business_id,source_command_id),
 FOREIGN KEY (business_id,discrepancy_id) REFERENCES customer_credit_discrepancies(business_id,id)
);
CREATE INDEX customer_credit_discrepancy_resolutions_history_idx
 ON customer_credit_discrepancy_resolutions(business_id,discrepancy_id,resolved_at DESC,id);

CREATE FUNCTION prevent_customer_credit_reconciliation_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'customer credit reconciliation evidence is append only'; END; $$;
CREATE TRIGGER customer_credit_reconciliations_immutable BEFORE UPDATE OR DELETE ON customer_credit_reconciliations FOR EACH ROW EXECUTE FUNCTION prevent_customer_credit_reconciliation_mutation();
CREATE TRIGGER customer_credit_discrepancies_immutable BEFORE UPDATE OR DELETE ON customer_credit_discrepancies FOR EACH ROW EXECUTE FUNCTION prevent_customer_credit_reconciliation_mutation();
CREATE TRIGGER customer_credit_discrepancy_resolutions_immutable BEFORE UPDATE OR DELETE ON customer_credit_discrepancy_resolutions FOR EACH ROW EXECUTE FUNCTION prevent_customer_credit_reconciliation_mutation();
