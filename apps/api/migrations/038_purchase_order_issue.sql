ALTER TABLE procurement_purchase_orders
 ADD COLUMN approved_by uuid,ADD COLUMN approved_at timestamptz,
 ADD COLUMN issued_by uuid,ADD COLUMN issued_at timestamptz,ADD COLUMN document_id uuid,
 ADD CONSTRAINT procurement_po_document_fk FOREIGN KEY(business_id,document_id) REFERENCES business_documents(business_id,id);
CREATE TABLE procurement_purchase_order_events (
 business_id uuid NOT NULL,po_id uuid NOT NULL,id uuid NOT NULL,po_version bigint NOT NULL,
 event_type text NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 command_id uuid NOT NULL,staff_id uuid NOT NULL,device_id uuid NOT NULL,occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),UNIQUE(business_id,po_id,po_version),UNIQUE(business_id,command_id),
 FOREIGN KEY(business_id,po_id) REFERENCES procurement_purchase_orders(business_id,id)
);
CREATE TRIGGER procurement_po_events_immutable BEFORE UPDATE OR DELETE ON procurement_purchase_order_events
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE FUNCTION servos_guard_po_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
 SELECT status INTO current_status FROM procurement_purchase_orders
 WHERE business_id=COALESCE(NEW.business_id,OLD.business_id) AND id=COALESCE(NEW.po_id,OLD.po_id);
 IF current_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only draft purchase lines can change'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER procurement_po_lines_draft_only BEFORE INSERT OR UPDATE OR DELETE ON procurement_purchase_order_lines
 FOR EACH ROW EXECUTE FUNCTION servos_guard_po_lines();
CREATE FUNCTION servos_guard_po_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.document_number IS DISTINCT FROM OLD.document_number THEN RAISE EXCEPTION 'Immutable purchase order identity'; END IF;
 IF OLD.status<>'DRAFT' AND (NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.supplier_snapshot IS DISTINCT FROM OLD.supplier_snapshot OR NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.expected_delivery_date IS DISTINCT FROM OLD.expected_delivery_date OR NEW.notes IS DISTINCT FROM OLD.notes) THEN RAISE EXCEPTION 'Approved purchase order content is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER procurement_po_snapshot_guard BEFORE UPDATE ON procurement_purchase_orders
 FOR EACH ROW EXECUTE FUNCTION servos_guard_po_snapshot();
