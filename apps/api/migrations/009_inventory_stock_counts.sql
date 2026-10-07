-- A stocktake command may create one movement per item, so source command is indexed
-- for lookup but is not unique across its movement rows.
ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_business_id_source_command_id_key;
CREATE INDEX IF NOT EXISTS inventory_movements_source_command_idx
  ON inventory_movements (business_id, source_command_id);
CREATE INDEX IF NOT EXISTS inventory_movements_stock_occurred_idx
  ON inventory_movements (business_id,stock_item_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_location_idx
  ON inventory_movements (business_id,location_id);
CREATE INDEX IF NOT EXISTS inventory_balances_location_idx
  ON inventory_location_balances (business_id,location_id);

CREATE TABLE IF NOT EXISTS inventory_stock_counts (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('FULL','SELECTED')),
  location_id uuid NOT NULL,
  selected_stock_item_ids uuid[] NOT NULL,
  item_count integer NOT NULL CHECK (item_count > 0),
  matches integer NOT NULL CHECK (matches >= 0),
  short integer NOT NULL CHECK (short >= 0),
  over integer NOT NULL CHECK (over >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  source_command_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,source_command_id),
  FOREIGN KEY (business_id,location_id) REFERENCES stock_locations(business_id,id),
  CHECK (matches + short + over = item_count)
);
CREATE INDEX IF NOT EXISTS inventory_stock_counts_business_created_idx
  ON inventory_stock_counts (business_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS inventory_stock_counts_location_idx
  ON inventory_stock_counts (business_id,location_id,created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_stock_count_rows (
  business_id uuid NOT NULL,
  count_id text NOT NULL,
  stock_item_id uuid NOT NULL,
  expected_quantity numeric(18,6) NOT NULL CHECK (expected_quantity >= 0),
  counted_quantity numeric(18,6) NOT NULL CHECK (counted_quantity >= 0),
  variance numeric(18,6) NOT NULL,
  counted_sealed_containers integer CHECK (counted_sealed_containers IS NULL OR counted_sealed_containers >= 0),
  counted_open_quantity numeric(18,6) CHECK (counted_open_quantity IS NULL OR counted_open_quantity >= 0),
  measurement_method text NOT NULL DEFAULT 'EXACT' CHECK (measurement_method IN ('EXACT','ESTIMATED')),
  consumption_product_ids uuid[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (business_id,count_id,stock_item_id),
  FOREIGN KEY (business_id,count_id) REFERENCES inventory_stock_counts(business_id,id) ON DELETE CASCADE,
  FOREIGN KEY (business_id,stock_item_id) REFERENCES stock_items(business_id,id)
);
CREATE INDEX IF NOT EXISTS inventory_stock_count_rows_stock_idx
  ON inventory_stock_count_rows (business_id,stock_item_id,count_id);
