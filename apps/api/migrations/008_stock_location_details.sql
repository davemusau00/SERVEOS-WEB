ALTER TABLE stock_locations
  ADD COLUMN code text NOT NULL DEFAULT '',
  ADD COLUMN location_type text NOT NULL DEFAULT 'STORE'
    CHECK (location_type IN ('STORE','FRIDGE','BAR','KITCHEN','OTHER'));

CREATE UNIQUE INDEX stock_locations_active_code_uq
  ON stock_locations (business_id, lower(code))
  WHERE archived_at IS NULL AND code <> '';
