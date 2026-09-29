BEGIN IMMEDIATE;

CREATE UNIQUE INDEX IF NOT EXISTS asset_acquisition_source_unit_unique
ON records(json_extract(data,'$.sourceUnitKey'))
WHERE collection='assetAcquisitions' AND json_type(data,'$.sourceUnitKey')='text';

CREATE INDEX IF NOT EXISTS asset_acquisition_status_lookup
ON records(json_extract(data,'$.status'),json_extract(data,'$.assetCategoryId'))
WHERE collection='assetAcquisitions';

CREATE INDEX IF NOT EXISTS asset_acquisition_receipt_lookup
ON records(json_extract(data,'$.goodsReceiptId'),json_extract(data,'$.purchaseLineId'))
WHERE collection='assetAcquisitions';

PRAGMA user_version=8;
COMMIT;
