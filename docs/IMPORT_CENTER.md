# Import Center

Patch 03 establishes a staging and validation workspace for migration data.

## Safety boundary

Patch 03 can write only to:

- `import_batches`
- `import_rows`
- `import_events`
- the authenticated session's activity timestamp

It does not write business `records`, `commands`, `audit`, `outbox`, stock movements, journals, payments, receipts, Supabase replicas, or v2 command tables.

There is deliberately no `runtime_import_apply` command in Patch 03.

## Template packs

### Business setup
- `business.csv`
- `outlets.csv`
- `suppliers.csv`
- `customers.csv`
- `employees.csv`

### Inventory & catalog
- `stock_locations.csv`
- `products.csv`
- `inventory.csv`

### Rooms / PMS
- `room_types.csv`
- `rooms.csv`
- `rate_plans.csv`
- `hotel_services.csv`

### Assets
- `asset_categories.csv`
- `assets.csv`

Each CSV uses `external_id` as the migration identity. Relationships use fields such as `outlet_external_id`, `room_type_external_id`, and `category_external_id`. Patch 04 resolves these external IDs to ServOS record IDs during reviewed application.

Employee templates never contain PINs or passwords. Credentials remain a ServOS staff-security action.

## Limits

- CSV only.
- 5 MB maximum per staged file.
- 20,000 data rows maximum per file.
- First 500 rows are returned to the UI for preview; validation totals cover the complete file.
- Sensitive credential column names are rejected.
- Duplicate headers and duplicate `external_id` values are rejected/flagged.
- Numeric, boolean, enum, email and required-field validation runs before a batch becomes `READY`.

## Batch statuses

`READY` means all rows passed Patch 03 structural validation. It does not mean the batch is safe to apply to LIVE business records.

`NEEDS_REVIEW` contains at least one invalid row.

`CANCELLED` preserves the batch and immutable event evidence but prevents normal continuation.

`APPLIED` is reserved for Patch 04.

## Patch 04 handoff

Patch 04 will add:

1. dependency-aware external ID resolution;
2. dry-run diff against current business records;
3. create/update/conflict/no-op decisions;
4. LIVE restrictions that prevent CSV from rewriting transactions, payments, stock history, audit history, receipt documents or arbitrary balances;
5. reviewed atomic application through versioned ServOS business commands;
6. application audit/outbox evidence and resumability.
