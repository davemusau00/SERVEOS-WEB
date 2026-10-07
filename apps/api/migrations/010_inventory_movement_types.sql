ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS movement_type text NOT NULL DEFAULT 'LEGACY';

UPDATE inventory_movements
SET movement_type = reason
WHERE movement_type = 'LEGACY';

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (length(btrim(movement_type)) BETWEEN 1 AND 40);
