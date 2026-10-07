CREATE TABLE order_payments (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 order_id uuid NOT NULL,
 account_id uuid NOT NULL,
 account_snapshot jsonb NOT NULL CHECK(jsonb_typeof(account_snapshot)='object'),
 till_session_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('CASH','MPESA','CARD','BANK')),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 cash_tendered_minor bigint,
 change_minor bigint,
 external_reference text,
 normalized_reference text,
 received_amount_minor bigint,
 external_received_at timestamptz,
 origin text NOT NULL CHECK(origin IN ('CASHIER_CASH','CASHIER_CONFIRMED_EXTERNAL')),
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL,
 source_command_id uuid NOT NULL,
 tender_index integer NOT NULL CHECK(tender_index BETWEEN 0 AND 9),
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,source_command_id,tender_index),
 FOREIGN KEY(business_id,order_id) REFERENCES pos_orders(business_id,id),
 FOREIGN KEY(business_id,account_id) REFERENCES payment_accounts(business_id,id),
 FOREIGN KEY(business_id,till_session_id) REFERENCES till_sessions(business_id,id),
 CHECK((method='CASH' AND cash_tendered_minor IS NOT NULL AND cash_tendered_minor>=amount_minor
        AND change_minor IS NOT NULL AND change_minor=cash_tendered_minor-amount_minor AND origin='CASHIER_CASH'
        AND external_reference IS NULL AND normalized_reference IS NULL)
       OR (method<>'CASH' AND cash_tendered_minor IS NULL AND change_minor IS NULL AND origin='CASHIER_CONFIRMED_EXTERNAL')),
 CHECK((external_reference IS NULL AND normalized_reference IS NULL) OR
       (external_reference IS NOT NULL AND normalized_reference IS NOT NULL AND length(btrim(external_reference)) BETWEEN 1 AND 160 AND normalized_reference=upper(btrim(external_reference)))),
 CHECK((method='MPESA' AND received_amount_minor IS NOT NULL AND received_amount_minor=amount_minor AND external_received_at IS NOT NULL) OR
       (method<>'MPESA' AND received_amount_minor IS NULL AND external_received_at IS NULL))
);
CREATE UNIQUE INDEX order_payments_external_reference_uq ON order_payments(business_id,method,normalized_reference) WHERE normalized_reference IS NOT NULL;
CREATE INDEX order_payments_order_idx ON order_payments(business_id,order_id,recorded_at,id);
CREATE INDEX order_payments_account_idx ON order_payments(business_id,account_id);
CREATE INDEX order_payments_till_idx ON order_payments(business_id,till_session_id);
CREATE TRIGGER order_payments_immutable BEFORE UPDATE OR DELETE ON order_payments
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
