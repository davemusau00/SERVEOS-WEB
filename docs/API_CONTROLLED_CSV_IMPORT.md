# API Controlled CSV Import

The Node API exposes an authenticated CSV workflow backed by PostgreSQL. It imports supported master records by calling the same versioned ServOS domain commands used by the operator UI. It does not replace business rows or write arbitrary JSON records.

## Workflow

1. `GET /v1/import/templates` returns the API template manifest and limits.
2. `POST /v1/import/batches` stores the CSV, SHA-256, headers, row validation and actor attribution.
3. `POST /v1/import/batches/{batchId}/plan` resolves previously imported external IDs and dry-runs each command through its current domain handler in a rolled-back PostgreSQL savepoint.
4. An authorized operator reviews row outcomes, then `POST /v1/import/plans/{planId}/apply` submits the reviewed commands through the API command kernel.
5. `GET /v1/import/batches/{batchId}` and `GET /v1/import/plans/{planId}` recover durable state. `POST /v1/import/batches/{batchId}/cancel` cancels an unapplied batch and purges its staged CSV.

All routes require an authenticated API staff session and enrolled device. Staging/review requires `data.import.stage`; application requires `data.import.execute` and the permission required by every row's domain command. Authorization is checked again when each command is applied.

## Templates

Template headers are returned by the API and downloaded by the API-authority PWA. Header names are exact; prices use decimal KES values, which the API converts to integer minor units.

| Template | Required columns | Domain operation |
| --- | --- | --- |
| `products` | `external_id,name,code,price` | `product.save` |
| `stockItems` | `external_id,name,code,base_unit` | `stockItem.save` |
| `stockLocations` | `external_id,name` | `stockLocation.save` |
| `outlets` | `external_id,name,default_stock_location_external_id` | `outlet.save` |
| `suppliers` | `external_id,name,code` | `supplier.save` |
| `customers` | `external_id,name` | `customer.save` |
| `roomTypes` | `external_id,name` | `roomType.save` |
| `rooms` | `external_id,room_number,room_type_external_id,capacity` | `room.save` |
| `ratePlans` | `external_id,name,room_type_external_id,nightly_rate` | `ratePlan.save` |
| `hotelServices` | `external_id,code,name,unit_price` | `hotelService.save` |
| `assetCategories` | `external_id,name` | `assetCategory.save` |
| `assets` | `external_id,name,asset_tag,category_external_id,acquisition_cost` | `asset.save` |

Optional columns and enum/range rules are provided by `GET /v1/import/templates`. Templates intentionally omit lifecycle state, credentials, payment and transaction history, stock balances, depreciation schedules, staff permissions and other fields that must use separate reviewed workflows.

Import referenced records first. For example, import stock items and outlets before products that refer to them; import stock locations before outlets; room types before rooms/rates; and asset categories plus rooms or stock locations before assets. `external_id` mappings are scoped to the business and template and are case-insensitive. A relation cannot point to an arbitrary record ID; it must resolve through an existing API importer mapping and is version-checked during dry run and apply.

## Limits and safety

- CSV is limited to 2 MiB and 20,000 data rows. The API accepts the JSON envelope up to 8 MiB to allow for JSON escaping; the raw CSV limit remains 2 MiB.
- The UI previews at most 500 rows. The server validates and plans the full file.
- Duplicate headers, duplicate external IDs, duplicate template identity fields, malformed quoting, unsupported columns, invalid prices/dates, credential columns, and unsupported references are rejected or blocked.
- Batches are create-only. Conflicting codes, tags or existing IDs are blocked; there is no CSV overwrite/update path.
- `business.csv`, employee credentials and `inventory.csv` opening balances are excluded. No stock quantity is created by a master-data import.
- Dry run invokes the actual domain handler in a savepoint and rolls back its writes. It is validation evidence, not a reservation of current values; expected versions and domain rules are checked again by the command at apply time.
- Each row applies as its own normal API command transaction. Command IDs, audit entries, outcomes and change-feed projections are durable. If a request or process is interrupted, resuming an `APPLYING` plan reuses those IDs and recovers already confirmed rows.
- A completed `PARTIAL` plan retains per-row command outcomes and requires reconciliation. Applied rows are not automatically rolled back; fix source data and stage a new batch for remaining work.
- The raw source is retained while a batch is open. On successful completion, partial completion or cancellation, the raw CSV and preview rows are purged; the source hash, external-ID mappings, plan outcomes and audit events remain.

## Deployment state

Migration `069_controlled_csv_import.sql` adds private batch, plan, external-ID mapping and importer-event tables. Apply it through the regular API migration runner before enabling these routes in a deployed API. Local PostgreSQL integration tests exercise the migration, routes, savepoint dry run, domain-command application, audit/outcome persistence, external-ID dependencies and source purge using only disposable schemas. This evidence does not imply a production migration or imported business data.
