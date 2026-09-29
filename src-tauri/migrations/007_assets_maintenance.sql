BEGIN IMMEDIATE;

CREATE UNIQUE INDEX IF NOT EXISTS asset_tag_unique_history
ON records(lower(trim(json_extract(data,'$.tag'))))
WHERE collection='assets' AND json_type(data,'$.tag')='text';

CREATE INDEX IF NOT EXISTS asset_category_lookup
ON records(json_extract(data,'$.assetCategoryId'))
WHERE collection='assets';

CREATE INDEX IF NOT EXISTS asset_location_lookup
ON records(json_extract(data,'$.locationId'),json_extract(data,'$.roomId'))
WHERE collection='assets';

CREATE INDEX IF NOT EXISTS maintenance_status_lookup
ON records(json_extract(data,'$.status'))
WHERE collection='maintenanceOrders';

CREATE INDEX IF NOT EXISTS maintenance_asset_lookup
ON records(json_extract(data,'$.assetId'))
WHERE collection='maintenanceOrders';

CREATE INDEX IF NOT EXISTS maintenance_room_lookup
ON records(json_extract(data,'$.roomId'))
WHERE collection='maintenanceOrders';

CREATE TRIGGER IF NOT EXISTS asset_events_no_update
BEFORE UPDATE ON records
WHEN OLD.collection IN ('assetEvents','maintenanceEvents')
   OR NEW.collection IN ('assetEvents','maintenanceEvents')
BEGIN SELECT RAISE(ABORT,'Immutable asset/maintenance history'); END;

CREATE TRIGGER IF NOT EXISTS asset_events_no_delete
BEFORE DELETE ON records
WHEN OLD.collection IN ('assetEvents','maintenanceEvents')
BEGIN SELECT RAISE(ABORT,'Immutable asset/maintenance history'); END;

PRAGMA user_version=7;
COMMIT;
