CREATE TABLE IF NOT EXISTS stock_items (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  code text NOT NULL,
  base_unit text NOT NULL,
  barcode text,
  barcode_aliases text[] NOT NULL DEFAULT '{}',
  scan_unit_quantity numeric(18,6) NOT NULL DEFAULT 1 CHECK (scan_unit_quantity > 0),
  reorder_level numeric(18,6) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  average_unit_cost_minor bigint NOT NULL DEFAULT 0 CHECK (average_unit_cost_minor >= 0),
  sealed_container_size numeric(18,6) CHECK (sealed_container_size IS NULL OR sealed_container_size > 0),
  version bigint NOT NULL CHECK (version > 0),
  archived_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_active_code_uq ON stock_items(business_id, lower(code)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_active_barcode_uq ON stock_items(business_id, lower(barcode)) WHERE barcode IS NOT NULL AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS stock_purchase_packages (
  business_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  unit_cost_minor bigint NOT NULL CHECK (unit_cost_minor >= 0),
  barcode text,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, stock_item_id, id),
  FOREIGN KEY (business_id, stock_item_id) REFERENCES stock_items(business_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  code text NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  category text NOT NULL,
  route_to text NOT NULL,
  stock_item_id uuid,
  barcode text,
  favorite boolean NOT NULL DEFAULT false,
  tax_class_id text NOT NULL DEFAULT '',
  recipe boolean NOT NULL DEFAULT false,
  recipe_yield integer CHECK (recipe_yield IS NULL OR recipe_yield > 0),
  version bigint NOT NULL CHECK (version > 0),
  archived_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, stock_item_id) REFERENCES stock_items(business_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS products_active_code_uq ON products(business_id, lower(code)) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_active_barcode_uq ON products(business_id, lower(barcode)) WHERE barcode IS NOT NULL AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS product_recipe_ingredients (
  business_id uuid NOT NULL,
  product_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT '',
  PRIMARY KEY (business_id, product_id, stock_item_id),
  FOREIGN KEY (business_id, product_id) REFERENCES products(business_id, id) ON DELETE CASCADE,
  FOREIGN KEY (business_id, stock_item_id) REFERENCES stock_items(business_id, id)
);

CREATE TABLE IF NOT EXISTS stock_locations (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  version bigint NOT NULL CHECK (version > 0),
  archived_at timestamptz,
  PRIMARY KEY (business_id, id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity_delta numeric(18,6) NOT NULL CHECK (quantity_delta <> 0),
  reason text NOT NULL,
  source_command_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id, id),
  UNIQUE (business_id, source_command_id),
  FOREIGN KEY (business_id, stock_item_id) REFERENCES stock_items(business_id, id),
  FOREIGN KEY (business_id, location_id) REFERENCES stock_locations(business_id, id)
);
