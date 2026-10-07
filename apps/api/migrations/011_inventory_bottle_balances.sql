ALTER TABLE inventory_location_balances
  ADD COLUMN IF NOT EXISTS sealed_containers numeric(18,6),
  ADD COLUMN IF NOT EXISTS open_quantity numeric(18,6);

UPDATE inventory_location_balances b
SET sealed_containers = floor(b.quantity / s.sealed_container_size),
    open_quantity = mod(b.quantity, s.sealed_container_size)
FROM stock_items s
WHERE s.business_id = b.business_id
  AND s.id = b.stock_item_id
  AND s.base_unit = 'ml'
  AND s.sealed_container_size IS NOT NULL
  AND b.sealed_containers IS NULL;

ALTER TABLE inventory_location_balances
  ADD CONSTRAINT inventory_location_balances_bottle_state_check
  CHECK (
    (sealed_containers IS NULL AND open_quantity IS NULL)
    OR (
      sealed_containers IS NOT NULL
      AND open_quantity IS NOT NULL
      AND sealed_containers >= 0
      AND sealed_containers = trunc(sealed_containers)
      AND open_quantity >= 0
    )
  );
