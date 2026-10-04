BEGIN;
CREATE TRIGGER IF NOT EXISTS protect_inventory_correction_history_update
BEFORE UPDATE ON records
WHEN OLD.collection IN ('stockCounts','inventoryCorrections','receiptCorrections','procurementCorrectionBaselines','inventoryMovementBaselines','movementCorrections')
BEGIN SELECT RAISE(ABORT,'Inventory correction history is immutable'); END;
CREATE TRIGGER IF NOT EXISTS protect_inventory_correction_history_delete
BEFORE DELETE ON records
WHEN OLD.collection IN ('stockCounts','inventoryCorrections','receiptCorrections','procurementCorrectionBaselines','inventoryMovementBaselines','movementCorrections')
BEGIN SELECT RAISE(ABORT,'Inventory correction history is immutable'); END;
PRAGMA user_version=16;
COMMIT;
