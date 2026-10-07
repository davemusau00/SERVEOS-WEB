ALTER TABLE pos_orders ADD COLUMN refunded_amount_minor bigint NOT NULL DEFAULT 0 CHECK(refunded_amount_minor>=0 AND refunded_amount_minor<=amount_paid_minor);
CREATE TABLE payment_refunds (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 payment_id uuid NOT NULL,
 order_id uuid NOT NULL,
 till_session_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 method text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('REFUND','FULL_REMAINING_REVERSAL')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 external_reference text,
 manually_confirmed boolean NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 source_command_id uuid NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,payment_id) REFERENCES order_payments(business_id,id),
 FOREIGN KEY(business_id,order_id) REFERENCES pos_orders(business_id,id),
 FOREIGN KEY(business_id,till_session_id) REFERENCES till_sessions(business_id,id),
 CHECK((method='CASH' AND external_reference IS NULL) OR
       (method IN ('MPESA','CARD','BANK') AND external_reference IS NOT NULL AND length(btrim(external_reference)) BETWEEN 1 AND 160 AND manually_confirmed))
);
CREATE INDEX payment_refunds_payment_idx ON payment_refunds(business_id,payment_id);
CREATE INDEX payment_refunds_order_idx ON payment_refunds(business_id,order_id);
CREATE INDEX payment_refunds_till_idx ON payment_refunds(business_id,till_session_id);
CREATE UNIQUE INDEX payment_refunds_external_uq ON payment_refunds(business_id,method,upper(btrim(external_reference))) WHERE external_reference IS NOT NULL;
CREATE TRIGGER payment_refunds_immutable BEFORE UPDATE OR DELETE ON payment_refunds
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
INSERT INTO business_entity_versions(business_id,entity_type,entity_id,version)
 SELECT business_id,'payments',id::text,1 FROM order_payments ON CONFLICT DO NOTHING;
