CREATE TABLE IF NOT EXISTS inventory_batch_preparations (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  product_id uuid NOT NULL,
  output_stock_item_id uuid NOT NULL,
  location_id uuid NOT NULL,
  batch_count integer NOT NULL CHECK (batch_count BETWEEN 1 AND 1000),
  output_quantity numeric(18,6) NOT NULL CHECK (output_quantity > 0),
  ingredient_usage jsonb NOT NULL,
  total_cost_minor bigint NOT NULL CHECK (total_cost_minor >= 0),
  reason text NOT NULL,
  source_command_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,source_command_id),
  FOREIGN KEY (business_id,product_id) REFERENCES products(business_id,id),
  FOREIGN KEY (business_id,output_stock_item_id) REFERENCES stock_items(business_id,id),
  FOREIGN KEY (business_id,location_id) REFERENCES stock_locations(business_id,id)
);
CREATE INDEX IF NOT EXISTS inventory_batch_preparations_created_idx
  ON inventory_batch_preparations (business_id,created_at DESC,id);
