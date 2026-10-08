ALTER TABLE procurement_payables ADD COLUMN credited_minor bigint NOT NULL DEFAULT 0 CHECK(credited_minor BETWEEN 0 AND amount_minor);
ALTER TABLE procurement_payables DROP CONSTRAINT procurement_payables_check;
ALTER TABLE procurement_payables ADD CONSTRAINT procurement_payables_settlement_total_check CHECK(paid_minor+credited_minor<=amount_minor);
ALTER TABLE procurement_payables DROP CONSTRAINT procurement_payables_payment_state;
ALTER TABLE procurement_payables ADD CONSTRAINT procurement_payables_payment_state CHECK(
 (status IN ('RECEIVED_UNINVOICED','MATCHED_UNPAID') AND paid_minor=0)
 OR (status='PARTIALLY_PAID' AND paid_minor>0 AND paid_minor<amount_minor)
 OR (status='PAID' AND paid_minor=amount_minor AND credited_minor=0)
 OR status='REVERSED'
);
ALTER TABLE procurement_supplier_returns ADD COLUMN estimated_credit_minor bigint CHECK(estimated_credit_minor BETWEEN 0 AND 9007199254740991);
ALTER TABLE procurement_supplier_returns ADD COLUMN credited_minor bigint NOT NULL DEFAULT 0 CHECK(credited_minor BETWEEN 0 AND 9007199254740991);
ALTER TABLE procurement_supplier_returns DROP CONSTRAINT procurement_supplier_returns_status_check;
ALTER TABLE procurement_supplier_returns ADD CHECK(status IN ('DRAFT','APPROVED','DISPATCHED','PARTIALLY_CREDITED','CREDIT_MATCHED','CANCELLED'));
ALTER TABLE procurement_supplier_returns DROP CONSTRAINT procurement_supplier_returns_check;
ALTER TABLE procurement_supplier_returns DROP CONSTRAINT procurement_supplier_returns_check1;
ALTER TABLE procurement_supplier_returns ADD CHECK((status IN ('DRAFT','CANCELLED') AND approved_by IS NULL AND approved_at IS NULL AND dispatched_by IS NULL) OR (status IN ('APPROVED','DISPATCHED','PARTIALLY_CREDITED','CREDIT_MATCHED') AND approved_by IS NOT NULL AND approved_at IS NOT NULL));
ALTER TABLE procurement_supplier_returns ADD CHECK((status IN ('DISPATCHED','PARTIALLY_CREDITED','CREDIT_MATCHED'))=(dispatched_at IS NOT NULL AND dispatched_by IS NOT NULL));
ALTER TABLE procurement_supplier_returns ADD CHECK(status NOT IN ('DISPATCHED','PARTIALLY_CREDITED','CREDIT_MATCHED') OR estimated_credit_minor IS NOT NULL);
ALTER TABLE procurement_supplier_return_events DROP CONSTRAINT procurement_supplier_return_events_event_type_check;
ALTER TABLE procurement_supplier_return_events ADD CHECK(event_type IN ('CREATE','APPROVE','DISPATCH','CANCEL','CREDIT_MATCH'));
CREATE TABLE procurement_supplier_credit_notes (
 business_id uuid NOT NULL,id uuid NOT NULL,return_id uuid NOT NULL,supplier_id uuid NOT NULL,reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 1 AND 100),
 credit_date date NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9007199254740991),
 applied_to_payable_minor bigint NOT NULL CHECK(applied_to_payable_minor BETWEEN 0 AND amount_minor),available_minor bigint NOT NULL CHECK(available_minor=amount_minor-applied_to_payable_minor),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 version bigint NOT NULL CHECK(version>0),source_command_id uuid NOT NULL,staff_id uuid NOT NULL,device_id uuid NOT NULL,matched_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,return_id) REFERENCES procurement_supplier_returns(business_id,id),FOREIGN KEY(business_id,supplier_id) REFERENCES procurement_suppliers(business_id,id)
);
CREATE UNIQUE INDEX procurement_credit_note_reference_idx ON procurement_supplier_credit_notes(business_id,supplier_id,lower(btrim(reference)));
CREATE INDEX procurement_credit_notes_supplier_idx ON procurement_supplier_credit_notes(business_id,supplier_id,credit_date DESC);
CREATE OR REPLACE FUNCTION servos_guard_supplier_return() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supplier return evidence cannot be deleted'; END IF;
 IF ROW(NEW.business_id,NEW.id,NEW.return_number,NEW.supplier_id,NEW.grn_id,NEW.expected_credit_note,NEW.source_command_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.business_id,OLD.id,OLD.return_number,OLD.supplier_id,OLD.grn_id,OLD.expected_credit_note,OLD.source_command_id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Supplier return identity is immutable'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Supplier return transition requires the next version'; END IF;
 IF NOT ((OLD.status='DRAFT' AND NEW.status IN ('APPROVED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='DISPATCHED') OR (OLD.status='DISPATCHED' AND NEW.status IN ('PARTIALLY_CREDITED','CREDIT_MATCHED')) OR (OLD.status='PARTIALLY_CREDITED' AND NEW.status IN ('PARTIALLY_CREDITED','CREDIT_MATCHED'))) THEN RAISE EXCEPTION 'Invalid supplier return transition'; END IF;
 IF NEW.credited_minor<OLD.credited_minor OR (NEW.estimated_credit_minor IS NOT NULL AND NEW.credited_minor>NEW.estimated_credit_minor) THEN RAISE EXCEPTION 'Supplier return credit total is invalid'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_source_type_check;
ALTER TABLE financial_journals ADD CHECK(source_type IN ('PAYMENT','REFUND','GOODS_RECEIPT','SUPPLIER_PAYMENT','SUPPLIER_RETURN','SUPPLIER_CREDIT_NOTE'));
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_check;
ALTER TABLE financial_journals ADD CHECK(
 (source_type='PAYMENT' AND payment_id IS NOT NULL AND source_id=payment_id AND refund_id IS NULL AND original_journal_id IS NULL)
 OR (source_type='REFUND' AND payment_id IS NOT NULL AND source_id=refund_id AND refund_id IS NOT NULL AND original_journal_id IS NOT NULL)
 OR (source_type IN ('GOODS_RECEIPT','SUPPLIER_PAYMENT','SUPPLIER_RETURN','SUPPLIER_CREDIT_NOTE') AND payment_id IS NULL AND refund_id IS NULL AND original_journal_id IS NULL)
);
ALTER TABLE financial_journal_lines DROP CONSTRAINT financial_journal_lines_account_code_check;
ALTER TABLE financial_journal_lines ADD CHECK(account_code IN ('ASSET_TENDER','REVENUE_SALES','LIABILITY_VAT','LIABILITY_LEVY','ASSET_INVENTORY','LIABILITY_ACCOUNTS_PAYABLE','ASSET_SUPPLIER_CREDIT_PENDING','ASSET_SUPPLIER_CREDIT'));
CREATE TRIGGER procurement_supplier_credit_notes_immutable BEFORE UPDATE OR DELETE ON procurement_supplier_credit_notes FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
