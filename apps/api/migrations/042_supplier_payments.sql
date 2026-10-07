CREATE TABLE procurement_supplier_payments (
 business_id uuid NOT NULL,id uuid NOT NULL,payable_id uuid NOT NULL,supplier_id uuid NOT NULL,account_id uuid NOT NULL,
 account_snapshot jsonb NOT NULL CHECK(jsonb_typeof(account_snapshot)='object'),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9007199254740991),
 method text NOT NULL CHECK(method IN ('CASH','BANK','MPESA')),reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 1 AND 100),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 origin text NOT NULL CHECK(origin IN ('MANUALLY_CONFIRMED_EXTERNAL','MANUALLY_CONFIRMED_PETTY_CASH')),
 paid_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL,staff_id uuid NOT NULL,device_id uuid NOT NULL,source_command_id uuid NOT NULL,
 PRIMARY KEY(business_id,id),UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,payable_id) REFERENCES procurement_payables(business_id,id),
 FOREIGN KEY(business_id,supplier_id) REFERENCES procurement_suppliers(business_id,id),
 FOREIGN KEY(business_id,account_id) REFERENCES payment_accounts(business_id,id)
);
CREATE UNIQUE INDEX procurement_supplier_payment_reference_idx ON procurement_supplier_payments(business_id,method,lower(btrim(reference)));
CREATE INDEX procurement_supplier_payment_payable_idx ON procurement_supplier_payments(business_id,payable_id);
CREATE INDEX procurement_supplier_payment_supplier_idx ON procurement_supplier_payments(business_id,supplier_id,recorded_at DESC);
CREATE INDEX procurement_supplier_payment_account_idx ON procurement_supplier_payments(business_id,account_id);
CREATE TRIGGER procurement_supplier_payments_immutable BEFORE UPDATE OR DELETE ON procurement_supplier_payments FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_source_type_check;
ALTER TABLE financial_journals ADD CHECK(source_type IN ('PAYMENT','REFUND','GOODS_RECEIPT','SUPPLIER_PAYMENT'));
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_check;
ALTER TABLE financial_journals ADD CHECK(
 (source_type='PAYMENT' AND payment_id IS NOT NULL AND source_id=payment_id AND refund_id IS NULL AND original_journal_id IS NULL)
 OR (source_type='REFUND' AND payment_id IS NOT NULL AND source_id=refund_id AND refund_id IS NOT NULL AND original_journal_id IS NOT NULL)
 OR (source_type IN ('GOODS_RECEIPT','SUPPLIER_PAYMENT') AND payment_id IS NULL AND refund_id IS NULL AND original_journal_id IS NULL)
);
