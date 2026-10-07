CREATE TABLE procurement_supplier_credit_applications (
 business_id uuid NOT NULL,id uuid NOT NULL,credit_note_id uuid NOT NULL,payable_id uuid NOT NULL,supplier_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9007199254740991),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),source_command_id uuid NOT NULL,staff_id uuid NOT NULL,device_id uuid NOT NULL,applied_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,credit_note_id) REFERENCES procurement_supplier_credit_notes(business_id,id),
 FOREIGN KEY(business_id,payable_id) REFERENCES procurement_payables(business_id,id),
 FOREIGN KEY(business_id,supplier_id) REFERENCES procurement_suppliers(business_id,id)
);
CREATE INDEX procurement_credit_applications_note_idx ON procurement_supplier_credit_applications(business_id,credit_note_id,applied_at DESC);
CREATE INDEX procurement_credit_applications_payable_idx ON procurement_supplier_credit_applications(business_id,payable_id,applied_at DESC);
CREATE TRIGGER procurement_supplier_credit_applications_immutable BEFORE UPDATE OR DELETE ON procurement_supplier_credit_applications FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_source_type_check;
ALTER TABLE financial_journals ADD CHECK(source_type IN ('PAYMENT','REFUND','GOODS_RECEIPT','SUPPLIER_PAYMENT','SUPPLIER_RETURN','SUPPLIER_CREDIT_NOTE','SUPPLIER_CREDIT_APPLICATION'));
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_check;
ALTER TABLE financial_journals ADD CHECK(
 (source_type='PAYMENT' AND payment_id IS NOT NULL AND source_id=payment_id AND refund_id IS NULL AND original_journal_id IS NULL)
 OR (source_type='REFUND' AND payment_id IS NOT NULL AND source_id=refund_id AND refund_id IS NOT NULL AND original_journal_id IS NOT NULL)
 OR (source_type IN ('GOODS_RECEIPT','SUPPLIER_PAYMENT','SUPPLIER_RETURN','SUPPLIER_CREDIT_NOTE','SUPPLIER_CREDIT_APPLICATION') AND payment_id IS NULL AND refund_id IS NULL AND original_journal_id IS NULL)
);
