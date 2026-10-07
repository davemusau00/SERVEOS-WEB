CREATE TABLE IF NOT EXISTS inventory_stock_adjustments (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id text NOT NULL,
  stock_item_id uuid NOT NULL,
  location_id uuid NOT NULL,
  before_quantity numeric(18,6) NOT NULL CHECK (before_quantity >= 0),
  after_quantity numeric(18,6) NOT NULL CHECK (after_quantity >= 0),
  variance numeric(18,6) NOT NULL,
  before_sealed_containers integer,
  before_open_quantity numeric(18,6),
  after_sealed_containers integer,
  after_open_quantity numeric(18,6),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  source_command_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,source_command_id),
  FOREIGN KEY (business_id,stock_item_id) REFERENCES stock_items(business_id,id),
  FOREIGN KEY (business_id,location_id) REFERENCES stock_locations(business_id,id),
  CHECK ((before_sealed_containers IS NULL AND before_open_quantity IS NULL AND after_sealed_containers IS NULL AND after_open_quantity IS NULL) OR
    (before_sealed_containers IS NOT NULL AND before_open_quantity IS NOT NULL AND after_sealed_containers IS NOT NULL AND after_open_quantity IS NOT NULL AND before_sealed_containers >= 0 AND after_sealed_containers >= 0 AND before_open_quantity >= 0 AND after_open_quantity >= 0))
);

CREATE INDEX IF NOT EXISTS inventory_stock_adjustments_location_created_idx
  ON inventory_stock_adjustments (business_id,location_id,created_at DESC);
