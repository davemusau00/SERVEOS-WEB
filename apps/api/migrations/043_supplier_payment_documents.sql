ALTER TABLE procurement_supplier_payments ADD COLUMN document_id uuid;
ALTER TABLE procurement_supplier_payments ADD CONSTRAINT procurement_supplier_payment_document_fk FOREIGN KEY(business_id,document_id) REFERENCES business_documents(business_id,id);
CREATE UNIQUE INDEX procurement_supplier_payment_document_idx ON procurement_supplier_payments(business_id,document_id) WHERE document_id IS NOT NULL;
-- Prior payment evidence remains immutable; no generated historical voucher is implied.
