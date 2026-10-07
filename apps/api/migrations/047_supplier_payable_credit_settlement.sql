-- A supplier credit can settle all or part of an invoiced payable without
-- pretending that cash was paid. Preserve RECEIVED_UNINVOICED until invoice
-- evidence is matched, then represent a fully settled credit balance explicitly.
ALTER TABLE procurement_payables DROP CONSTRAINT procurement_payables_invoice_state;
ALTER TABLE procurement_payables ADD CONSTRAINT procurement_payables_invoice_state CHECK(
 (status='RECEIVED_UNINVOICED' AND invoice_snapshot IS NULL AND invoice_number IS NULL AND invoice_date IS NULL AND due_date IS NULL AND paid_minor=0)
 OR (status IN ('MATCHED_UNPAID','PARTIALLY_PAID','PAID','SETTLED') AND invoice_snapshot IS NOT NULL AND invoice_number IS NOT NULL AND length(btrim(invoice_number)) BETWEEN 1 AND 80 AND invoice_date IS NOT NULL AND due_date IS NOT NULL)
 OR status='REVERSED'
);
ALTER TABLE procurement_payables DROP CONSTRAINT procurement_payables_payment_state;
ALTER TABLE procurement_payables ADD CONSTRAINT procurement_payables_payment_state CHECK(
 (status='RECEIVED_UNINVOICED' AND paid_minor=0)
 OR (status='MATCHED_UNPAID' AND paid_minor=0 AND paid_minor+credited_minor<amount_minor)
 OR (status='PARTIALLY_PAID' AND paid_minor>0 AND paid_minor+credited_minor<amount_minor)
 OR (status='PAID' AND paid_minor=amount_minor AND credited_minor=0)
 OR (status='SETTLED' AND credited_minor>0 AND paid_minor+credited_minor=amount_minor)
 OR status='REVERSED'
);
