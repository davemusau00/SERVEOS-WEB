# Data import

The operator import feature is the API controlled CSV importer in `apps/api/src/csv-import.mjs` and the PWA Import Center. The API publishes the supported templates and headers, validates staged rows, performs a server dry run, and applies reviewed rows through normal domain commands.

Imports are create only and use external IDs to connect dependencies. The current manifest supports products, stock items, stock locations, outlets, suppliers, customers, room types, rooms, rate plans, hotel services, asset categories and assets. It excludes staff credentials, business identity and opening inventory.

Download a template from the Import Center; do not maintain a second copy of the header list. Omit optional fields that are not supplied so the API command owns its defaults. Do not send empty strings or fake `null` values for missing optional business data. Rate-plan currency is currently KES only; other values are blocked during row validation. A blocked plan must be corrected by staging a fresh batch.

One time migration of existing tenant history is a separate project under `tools/migration/` and must not use the operator importer for unsupported records. See the [migration boundary](../tools/migration/README.md).
