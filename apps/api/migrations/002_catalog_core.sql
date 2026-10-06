CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  time_zone text NOT NULL DEFAULT 'Africa/Nairobi',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_categories (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  name text NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  PRIMARY KEY (business_id, id)
);

CREATE TABLE IF NOT EXISTS catalog_items (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  category_id uuid,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  sku text,
  base_price_minor bigint NOT NULL CHECK (base_price_minor >= 0),
  currency char(3) NOT NULL,
  track_inventory boolean NOT NULL DEFAULT false,
  version bigint NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, category_id) REFERENCES catalog_categories(business_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_active_sku_uq
  ON catalog_items (business_id, lower(sku))
  WHERE sku IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS catalog_items_business_name_idx
  ON catalog_items (business_id, name, id)
  WHERE archived_at IS NULL;
