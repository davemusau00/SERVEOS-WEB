-- Receiving creates a liability once; invoice matching must not post it again.
CREATE TABLE procurement_payables (
 business_id uuid NOT NULL,id uuid NOT NULL,grn_id uuid NOT NULL,supplier_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9007199254740991),
 paid_minor bigint NOT NULL DEFAULT 0 CHECK(paid_minor BETWEEN 0 AND amount_minor),
 status text NOT NULL DEFAULT 'RECEIVED_UNINVOICED' CHECK(status IN ('RECEIVED_UNINVOICED','MATCHED_UNPAID','PARTIALLY_PAID','PAID','REVERSED')),
 invoice_number text,invoice_date date,due_date date,invoice_snapshot jsonb,
 version bigint NOT NULL CHECK(version>0),source_command_id uuid NOT NULL,staff_id uuid NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),UNIQUE(business_id,grn_id),UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,grn_id) REFERENCES procurement_goods_receipts(business_id,id),
 FOREIGN KEY(business_id,supplier_id) REFERENCES procurement_suppliers(business_id,id),
 CHECK(due_date IS NULL OR invoice_date IS NULL OR due_date>=invoice_date),
 CHECK(invoice_snapshot IS NULL OR jsonb_typeof(invoice_snapshot)='object')
);
CREATE UNIQUE INDEX procurement_invoice_reference_idx ON procurement_payables(business_id,supplier_id,lower(btrim(invoice_number))) WHERE invoice_number IS NOT NULL;
CREATE INDEX procurement_payables_supplier_idx ON procurement_payables(business_id,supplier_id,status);
ALTER TABLE financial_journals ALTER COLUMN payment_id DROP NOT NULL;
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_source_type_check;
ALTER TABLE financial_journals ADD CHECK(source_type IN ('PAYMENT','REFUND','GOODS_RECEIPT'));
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_check;
ALTER TABLE financial_journals ADD CHECK(
 (source_type='PAYMENT' AND payment_id IS NOT NULL AND source_id=payment_id AND refund_id IS NULL AND original_journal_id IS NULL)
 OR (source_type='REFUND' AND payment_id IS NOT NULL AND source_id=refund_id AND refund_id IS NOT NULL AND original_journal_id IS NOT NULL)
 OR (source_type='GOODS_RECEIPT' AND payment_id IS NULL AND refund_id IS NULL AND original_journal_id IS NULL)
);
ALTER TABLE financial_journal_lines DROP CONSTRAINT financial_journal_lines_account_code_check;
ALTER TABLE financial_journal_lines ADD CHECK(account_code IN ('ASSET_TENDER','REVENUE_SALES','LIABILITY_VAT','LIABILITY_LEVY','ASSET_INVENTORY','LIABILITY_ACCOUNTS_PAYABLE'));
-- Existing GRNs are not silently backfilled; reconcile historical liabilities before cutover.
