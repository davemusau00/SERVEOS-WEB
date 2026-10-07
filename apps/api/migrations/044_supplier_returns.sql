CREATE TABLE procurement_supplier_returns (
 business_id uuid NOT NULL,id uuid NOT NULL,return_number text NOT NULL,supplier_id uuid NOT NULL,grn_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('DRAFT','APPROVED','DISPATCHED','CANCELLED')),
 reason text NOT NULL,expected_credit_note text,dispatch_reference text,supplier_ack_name text,approved_by uuid,approved_at timestamptz,dispatched_by uuid,dispatched_at timestamptz,
 version bigint NOT NULL CHECK(version>0),source_command_id uuid NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),UNIQUE(business_id,return_number),UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,supplier_id) REFERENCES procurement_suppliers(business_id,id),
 FOREIGN KEY(business_id,grn_id) REFERENCES procurement_goods_receipts(business_id,id),
 CHECK((status IN ('DRAFT','CANCELLED') AND approved_by IS NULL AND approved_at IS NULL AND dispatched_by IS NULL) OR (status IN ('APPROVED','DISPATCHED') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 CHECK((status='DISPATCHED')=(dispatched_at IS NOT NULL AND dispatched_by IS NOT NULL))
);
CREATE INDEX procurement_supplier_returns_supplier_idx ON procurement_supplier_returns(business_id,supplier_id,status,created_at DESC);
CREATE TABLE procurement_supplier_return_lines (
 business_id uuid NOT NULL,return_id uuid NOT NULL,id uuid NOT NULL,grn_id uuid NOT NULL,grn_line_id uuid NOT NULL,inventory_receipt_id uuid NOT NULL,
 stock_item_id uuid NOT NULL,location_id uuid NOT NULL,stock_snapshot jsonb NOT NULL CHECK(jsonb_typeof(stock_snapshot)='object'),
 package_snapshot jsonb,quantity numeric(18,6) NOT NULL CHECK(quantity>0),base_quantity numeric(18,6) NOT NULL CHECK(base_quantity>0),
 sealed_containers integer,open_quantity numeric(18,6),condition text NOT NULL CHECK(condition IN ('SEALED','OPENED','DAMAGED','OTHER')),
 reason text NOT NULL,unit_cost_minor bigint NOT NULL CHECK(unit_cost_minor BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(business_id,return_id,id),UNIQUE(business_id,return_id,grn_line_id),
 FOREIGN KEY(business_id,return_id) REFERENCES procurement_supplier_returns(business_id,id),
 FOREIGN KEY(business_id,grn_id,grn_line_id) REFERENCES procurement_goods_receipt_lines(business_id,grn_id,id),
 FOREIGN KEY(business_id,inventory_receipt_id) REFERENCES inventory_receipts(business_id,id),
 FOREIGN KEY(business_id,stock_item_id) REFERENCES stock_items(business_id,id),
 FOREIGN KEY(business_id,location_id) REFERENCES stock_locations(business_id,id),
 CHECK((sealed_containers IS NULL AND open_quantity IS NULL) OR (sealed_containers>=0 AND open_quantity>=0))
);
CREATE INDEX procurement_supplier_return_lines_stock_idx ON procurement_supplier_return_lines(business_id,stock_item_id,location_id);
ALTER TABLE financial_journal_lines DROP CONSTRAINT financial_journal_lines_account_code_check;
ALTER TABLE financial_journal_lines ADD CHECK(account_code IN ('ASSET_TENDER','REVENUE_SALES','LIABILITY_VAT','LIABILITY_LEVY','ASSET_INVENTORY','LIABILITY_ACCOUNTS_PAYABLE','ASSET_SUPPLIER_CREDIT_PENDING'));
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_source_type_check;
ALTER TABLE financial_journals ADD CHECK(source_type IN ('PAYMENT','REFUND','GOODS_RECEIPT','SUPPLIER_PAYMENT','SUPPLIER_RETURN'));
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_check;
ALTER TABLE financial_journals ADD CHECK(
 (source_type='PAYMENT' AND payment_id IS NOT NULL AND source_id=payment_id AND refund_id IS NULL AND original_journal_id IS NULL)
 OR (source_type='REFUND' AND payment_id IS NOT NULL AND source_id=refund_id AND refund_id IS NOT NULL AND original_journal_id IS NOT NULL)
 OR (source_type IN ('GOODS_RECEIPT','SUPPLIER_PAYMENT','SUPPLIER_RETURN') AND payment_id IS NULL AND refund_id IS NULL AND original_journal_id IS NULL)
);

CREATE TABLE procurement_supplier_return_events (business_id uuid NOT NULL,return_id uuid NOT NULL,id uuid NOT NULL,return_version bigint NOT NULL CHECK(return_version>0),event_type text NOT NULL CHECK(event_type IN ('CREATE','APPROVE','DISPATCH','CANCEL')),reason text NOT NULL,command_id uuid NOT NULL,staff_id uuid NOT NULL,device_id uuid NOT NULL,occurred_at timestamptz NOT NULL,PRIMARY KEY(business_id,return_id,id),UNIQUE(business_id,command_id),UNIQUE(business_id,return_id,return_version),FOREIGN KEY(business_id,return_id) REFERENCES procurement_supplier_returns(business_id,id));
CREATE TRIGGER procurement_supplier_return_events_immutable BEFORE UPDATE OR DELETE ON procurement_supplier_return_events FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();

CREATE FUNCTION servos_guard_supplier_return() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supplier return evidence cannot be deleted'; END IF;
 IF ROW(NEW.business_id,NEW.id,NEW.return_number,NEW.supplier_id,NEW.grn_id,NEW.expected_credit_note,NEW.source_command_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.business_id,OLD.id,OLD.return_number,OLD.supplier_id,OLD.grn_id,OLD.expected_credit_note,OLD.source_command_id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Supplier return identity is immutable'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Supplier return transition requires the next version'; END IF;
 IF NOT ((OLD.status='DRAFT' AND NEW.status IN ('APPROVED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status='DISPATCHED')) THEN RAISE EXCEPTION 'Invalid supplier return transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER procurement_supplier_return_guard BEFORE UPDATE OR DELETE ON procurement_supplier_returns FOR EACH ROW EXECUTE FUNCTION servos_guard_supplier_return();
CREATE TRIGGER procurement_supplier_return_lines_immutable BEFORE UPDATE OR DELETE ON procurement_supplier_return_lines FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
