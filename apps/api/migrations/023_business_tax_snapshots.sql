CREATE TABLE business_receipt_settings (
 business_id uuid PRIMARY KEY REFERENCES businesses(id),
 business_name text NOT NULL CHECK(length(btrim(business_name)) BETWEEN 1 AND 160),
 address text NOT NULL CHECK(length(address)<=500),
 contact text NOT NULL CHECK(length(contact)<=160),
 tax_pin text NOT NULL CHECK(length(tax_pin)<=80),
 footer text NOT NULL CHECK(length(footer)<=500),
 vat_rate_basis_points integer NOT NULL CHECK(vat_rate_basis_points BETWEEN 0 AND 10000),
 levy_rate_basis_points integer NOT NULL CHECK(levy_rate_basis_points BETWEEN 0 AND 10000),
 version bigint NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL
);
ALTER TABLE pos_orders ADD COLUMN business_snapshot jsonb CHECK(business_snapshot IS NULL OR jsonb_typeof(business_snapshot)='object');
ALTER TABLE pos_order_lines
 ADD COLUMN tax_snapshot jsonb CHECK(tax_snapshot IS NULL OR jsonb_typeof(tax_snapshot)='object'),
 ADD COLUMN net_minor bigint CHECK(net_minor>=0),
 ADD COLUMN vat_minor bigint CHECK(vat_minor>=0),
 ADD COLUMN levy_minor bigint CHECK(levy_minor>=0),
 ADD CONSTRAINT pos_line_tax_conservation CHECK(
  (tax_snapshot IS NULL AND net_minor IS NULL AND vat_minor IS NULL AND levy_minor IS NULL) OR
  (tax_snapshot IS NOT NULL AND net_minor IS NOT NULL AND vat_minor IS NOT NULL AND levy_minor IS NOT NULL AND line_total_minor=net_minor+vat_minor+levy_minor)
 );

ALTER TABLE pos_orders ADD COLUMN receipt_document_id uuid,
 ADD CONSTRAINT pos_orders_receipt_document_fk FOREIGN KEY(business_id,receipt_document_id) REFERENCES business_documents(business_id,id);
CREATE INDEX pos_orders_receipt_document_idx ON pos_orders(business_id,receipt_document_id) WHERE receipt_document_id IS NOT NULL;
