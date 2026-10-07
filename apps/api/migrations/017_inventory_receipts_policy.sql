-- Unit valuation is a rate, not a posted currency amount.
ALTER TABLE stock_items ALTER COLUMN average_unit_cost_minor TYPE numeric(30,12);
ALTER TABLE inventory_movement_states ALTER COLUMN average_unit_cost_minor TYPE numeric(30,12);

CREATE TABLE business_inventory_policy (
 business_id uuid PRIMARY KEY REFERENCES businesses(id),
 allow_direct_receipts boolean NOT NULL DEFAULT false,
 require_supplier_reference boolean NOT NULL DEFAULT true,
 require_purchase_order boolean NOT NULL DEFAULT true,
 version bigint NOT NULL CHECK (version > 0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL
);

CREATE TABLE inventory_receipts (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 stock_item_id uuid NOT NULL,
 location_id uuid NOT NULL,
 source_key char(64) NOT NULL,
 source_document jsonb NOT NULL CHECK (jsonb_typeof(source_document)='object'),
 purchase_package_id uuid,
 purchase_package_snapshot jsonb,
 quantity_received numeric(18,6) NOT NULL CHECK (quantity_received > 0),
 base_quantity numeric(18,6) NOT NULL CHECK (base_quantity > 0),
 total_cost_minor bigint NOT NULL CHECK (total_cost_minor >= 0),
 unit_cost_minor numeric(30,12) NOT NULL CHECK (unit_cost_minor >= 0),
 before_average_cost_minor numeric(30,12) NOT NULL,
 after_average_cost_minor numeric(30,12) NOT NULL,
 received_sealed_containers bigint,
 received_open_quantity numeric(18,6),
 source_command_id uuid NOT NULL,
 received_by uuid NOT NULL,
 received_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,id),
 UNIQUE (business_id,source_key),
 UNIQUE (business_id,source_command_id),
 FOREIGN KEY (business_id,stock_item_id) REFERENCES stock_items(business_id,id),
 FOREIGN KEY (business_id,location_id) REFERENCES stock_locations(business_id,id),
 CHECK ((received_sealed_containers IS NULL AND received_open_quantity IS NULL) OR
        (received_sealed_containers IS NOT NULL AND received_open_quantity IS NOT NULL AND received_sealed_containers >= 0 AND received_open_quantity >= 0))
);
CREATE INDEX inventory_receipts_history_idx ON inventory_receipts(business_id,received_at DESC,id);

CREATE INDEX inventory_receipts_stock_idx ON inventory_receipts(business_id,stock_item_id);
CREATE INDEX inventory_receipts_location_idx ON inventory_receipts(business_id,location_id);
