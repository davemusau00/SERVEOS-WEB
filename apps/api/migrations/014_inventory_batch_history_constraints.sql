ALTER TABLE inventory_batch_preparations
  ADD CONSTRAINT inventory_batch_preparations_usage_check
  CHECK (jsonb_typeof(ingredient_usage) = 'array' AND jsonb_array_length(ingredient_usage) BETWEEN 1 AND 100),
  ADD CONSTRAINT inventory_batch_preparations_reason_check
  CHECK (length(btrim(reason)) BETWEEN 3 AND 180),
  ADD CONSTRAINT inventory_batch_preparations_distinct_output_check
  CHECK (output_quantity <= 1000000000);

CREATE INDEX IF NOT EXISTS inventory_batch_preparations_product_idx
  ON inventory_batch_preparations (business_id,product_id);
CREATE INDEX IF NOT EXISTS inventory_batch_preparations_output_stock_idx
  ON inventory_batch_preparations (business_id,output_stock_item_id);
CREATE INDEX IF NOT EXISTS inventory_batch_preparations_location_idx
  ON inventory_batch_preparations (business_id,location_id);
