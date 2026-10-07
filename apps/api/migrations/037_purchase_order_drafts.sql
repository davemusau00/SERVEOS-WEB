CREATE TABLE procurement_purchase_orders (
 business_id uuid NOT NULL REFERENCES businesses(id),id uuid NOT NULL,supplier_id uuid NOT NULL,
 document_number text NOT NULL,supplier_snapshot jsonb NOT NULL CHECK(jsonb_typeof(supplier_snapshot)='object'),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','ISSUED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
 currency text NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
 subtotal_minor bigint NOT NULL CHECK(subtotal_minor BETWEEN 0 AND 9007199254740991),
 expected_delivery_date date,notes text CHECK(notes IS NULL OR length(notes)<=2000),
 version bigint NOT NULL CHECK(version>0),created_by uuid NOT NULL,created_at timestamptz NOT NULL,updated_by uuid NOT NULL,updated_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),UNIQUE(business_id,document_number),
 FOREIGN KEY(business_id,supplier_id) REFERENCES procurement_suppliers(business_id,id)
);
CREATE INDEX procurement_purchase_orders_supplier_idx ON procurement_purchase_orders(business_id,supplier_id,status,id);
CREATE INDEX procurement_purchase_orders_recovery_idx ON procurement_purchase_orders(business_id,status,updated_at DESC,id);
CREATE TABLE procurement_purchase_order_lines (
 business_id uuid NOT NULL,po_id uuid NOT NULL,id uuid NOT NULL,line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 100),
 stock_item_id uuid NOT NULL,stock_snapshot jsonb NOT NULL CHECK(jsonb_typeof(stock_snapshot)='object'),
 purchase_package_snapshot jsonb CHECK(purchase_package_snapshot IS NULL OR jsonb_typeof(purchase_package_snapshot)='object'),
 quantity_ordered numeric(18,6) NOT NULL CHECK(quantity_ordered>0),base_quantity_ordered numeric(18,6) NOT NULL CHECK(base_quantity_ordered>0),
 unit_price_minor bigint NOT NULL CHECK(unit_price_minor BETWEEN 0 AND 9007199254740991),
 line_total_minor bigint NOT NULL CHECK(line_total_minor BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(business_id,po_id,id),UNIQUE(business_id,po_id,line_no),UNIQUE(business_id,po_id,stock_item_id),
 FOREIGN KEY(business_id,po_id) REFERENCES procurement_purchase_orders(business_id,id),
 FOREIGN KEY(business_id,stock_item_id) REFERENCES stock_items(business_id,id)
);
CREATE INDEX procurement_purchase_order_lines_stock_idx ON procurement_purchase_order_lines(business_id,stock_item_id);
