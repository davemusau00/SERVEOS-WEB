# ServOS CSV Import Templates

These are canonical Patch 03 staging templates.

Rules:
1. Keep the first row exactly as the canonical header row.
2. Keep `external_id` stable. It links related files before ServOS internal IDs exist.
3. Multi-value `*_external_ids` fields use semicolons, for example `outlet-main;outlet-pool`.
4. Dates use `YYYY-MM-DD`.
5. Monetary values are plain decimal numbers without currency symbols.
6. Booleans use `true` or `false`.
7. Do not add PIN, password, device token, access token or cloud-key columns.
8. A template's example row is illustrative. Replace it with real business data before staging.

Patch 03 only stages and validates. Patch 04 will apply reviewed batches to business records.
