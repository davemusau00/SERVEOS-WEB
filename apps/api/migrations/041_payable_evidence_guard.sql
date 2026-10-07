-- Invoice matching evidence remains frozen during later settlement/correction.
CREATE FUNCTION servos_guard_payable_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payable evidence cannot be deleted'; END IF;
 IF ROW(NEW.business_id,NEW.id,NEW.grn_id,NEW.supplier_id,NEW.amount_minor,NEW.source_command_id,NEW.staff_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.business_id,OLD.id,OLD.grn_id,OLD.supplier_id,OLD.amount_minor,OLD.source_command_id,OLD.staff_id,OLD.created_at)
 THEN RAISE EXCEPTION 'Receiving liability identity/basis is immutable'; END IF;
 IF OLD.invoice_snapshot IS NOT NULL AND ROW(NEW.invoice_number,NEW.invoice_date,NEW.due_date,NEW.invoice_snapshot)
 IS DISTINCT FROM ROW(OLD.invoice_number,OLD.invoice_date,OLD.due_date,OLD.invoice_snapshot)
 THEN RAISE EXCEPTION 'Matched supplier invoice evidence is immutable'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Payable mutation requires next reviewed version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER procurement_payables_evidence_guard BEFORE UPDATE OR DELETE ON procurement_payables
 FOR EACH ROW EXECUTE FUNCTION servos_guard_payable_evidence();
ALTER TABLE procurement_payables ADD CONSTRAINT procurement_payables_invoice_state CHECK(
 (status='RECEIVED_UNINVOICED' AND invoice_snapshot IS NULL AND invoice_number IS NULL AND invoice_date IS NULL AND due_date IS NULL AND paid_minor=0)
 OR (status IN ('MATCHED_UNPAID','PARTIALLY_PAID','PAID') AND invoice_snapshot IS NOT NULL AND invoice_number IS NOT NULL AND length(btrim(invoice_number)) BETWEEN 1 AND 80 AND invoice_date IS NOT NULL AND due_date IS NOT NULL)
 OR status='REVERSED'
);
ALTER TABLE procurement_payables ADD CONSTRAINT procurement_payables_payment_state CHECK(
 (status IN ('RECEIVED_UNINVOICED','MATCHED_UNPAID') AND paid_minor=0)
 OR (status='PARTIALLY_PAID' AND paid_minor>0 AND paid_minor<amount_minor)
 OR (status='PAID' AND paid_minor=amount_minor)
 OR status='REVERSED'
);
