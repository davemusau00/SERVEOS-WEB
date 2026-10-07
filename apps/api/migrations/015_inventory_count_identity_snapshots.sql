-- Existing rows stay NULL: today's catalog cannot prove names/units at count time.
ALTER TABLE inventory_stock_count_rows
  ADD COLUMN IF NOT EXISTS stock_item_name_snapshot text,
  ADD COLUMN IF NOT EXISTS base_unit_snapshot text;

ALTER TABLE inventory_stock_count_rows
  ADD CONSTRAINT inventory_stock_count_rows_identity_snapshot_check
  CHECK (
    (stock_item_name_snapshot IS NULL AND base_unit_snapshot IS NULL)
    OR (
      stock_item_name_snapshot IS NOT NULL AND base_unit_snapshot IS NOT NULL
      AND length(btrim(stock_item_name_snapshot)) BETWEEN 1 AND 160
      AND length(btrim(base_unit_snapshot)) BETWEEN 1 AND 40
    )
  );
