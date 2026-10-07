-- One API command can post several accepted GRN lines while direct receipts remain single-post.
ALTER TABLE inventory_receipts ADD COLUMN source_line_id uuid;
ALTER TABLE inventory_receipts DROP CONSTRAINT inventory_receipts_business_id_source_command_id_key;
CREATE UNIQUE INDEX inventory_receipts_direct_command_uq ON inventory_receipts(business_id,source_command_id) WHERE source_line_id IS NULL;
CREATE UNIQUE INDEX inventory_receipts_linked_command_line_uq ON inventory_receipts(business_id,source_command_id,source_line_id) WHERE source_line_id IS NOT NULL;
CREATE TABLE procurement_goods_receipts (
 business_id uuid NOT NULL,id uuid NOT NULL,po_id uuid NOT NULL,supplier_id uuid NOT NULL,
 document_id uuid NOT NULL,document_number text NOT NULL,
 delivery_reference text NOT NULL CHECK(length(btrim(delivery_reference)) BETWEEN 1 AND 160),
 location_id uuid NOT NULL,accepted_total_minor bigint NOT NULL CHECK(accepted_total_minor BETWEEN 0 AND 9007199254740991),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 source_command_id uuid NOT NULL,received_by uuid NOT NULL,device_id uuid NOT NULL,received_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),UNIQUE(business_id,id,po_id),UNIQUE(business_id,source_command_id),UNIQUE(business_id,document_number),
 FOREIGN KEY(business_id,po_id) REFERENCES procurement_purchase_orders(business_id,id),
 FOREIGN KEY(business_id,supplier_id) REFERENCES procurement_suppliers(business_id,id),
 FOREIGN KEY(business_id,location_id) REFERENCES stock_locations(business_id,id),
 FOREIGN KEY(business_id,document_id) REFERENCES business_documents(business_id,id)
);
CREATE UNIQUE INDEX procurement_grn_delivery_uq ON procurement_goods_receipts(business_id,po_id,lower(btrim(delivery_reference)));
CREATE INDEX procurement_grn_supplier_idx ON procurement_goods_receipts(business_id,supplier_id,received_at DESC,id);
CREATE INDEX procurement_grn_location_idx ON procurement_goods_receipts(business_id,location_id);
CREATE INDEX procurement_grn_document_idx ON procurement_goods_receipts(business_id,document_id);
CREATE TABLE procurement_goods_receipt_lines (
 business_id uuid NOT NULL,grn_id uuid NOT NULL,id uuid NOT NULL,po_id uuid NOT NULL,po_line_id uuid NOT NULL,
 delivered_quantity numeric(18,6) NOT NULL CHECK(delivered_quantity>0),
 accepted_quantity numeric(18,6) NOT NULL CHECK(accepted_quantity>=0),
 rejected_quantity numeric(18,6) NOT NULL CHECK(rejected_quantity>=0),
 accepted_base_quantity numeric(18,6) NOT NULL CHECK(accepted_base_quantity>=0),
 accepted_total_minor bigint NOT NULL CHECK(accepted_total_minor BETWEEN 0 AND 9007199254740991),
 rejection_reason text CHECK(rejection_reason IS NULL OR length(btrim(rejection_reason)) BETWEEN 3 AND 500),
 inventory_receipt_id uuid,
 PRIMARY KEY(business_id,grn_id,id),UNIQUE(business_id,grn_id,po_line_id),
 CHECK(delivered_quantity=accepted_quantity+rejected_quantity),
 CHECK(rejected_quantity=0 OR rejection_reason IS NOT NULL),
 CHECK((accepted_quantity=0 AND inventory_receipt_id IS NULL AND accepted_base_quantity=0 AND accepted_total_minor=0) OR (accepted_quantity>0 AND inventory_receipt_id IS NOT NULL AND accepted_base_quantity>0)),
 FOREIGN KEY(business_id,grn_id,po_id) REFERENCES procurement_goods_receipts(business_id,id,po_id),
 FOREIGN KEY(business_id,po_id,po_line_id) REFERENCES procurement_purchase_order_lines(business_id,po_id,id),
 FOREIGN KEY(business_id,inventory_receipt_id) REFERENCES inventory_receipts(business_id,id)
);
CREATE INDEX procurement_grn_lines_po_idx ON procurement_goods_receipt_lines(business_id,po_id,po_line_id);
CREATE INDEX procurement_grn_lines_receipt_idx ON procurement_goods_receipt_lines(business_id,inventory_receipt_id);
CREATE TRIGGER procurement_grn_immutable BEFORE UPDATE OR DELETE ON procurement_goods_receipts FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER procurement_grn_lines_immutable BEFORE UPDATE OR DELETE ON procurement_goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
