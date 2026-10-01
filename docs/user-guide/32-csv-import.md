# CSV product and inventory import

ServOS can import product and stock master data from a CSV in **Catalog & Pricing â†’ Import CSV**.

Section: Catalog
Roles: Admin, Manager
Permission: catalog.manage
Screen: Catalog & Pricing

## Overview

Import catalog records with validated SKU and barcode relationships.

## Procedure

Required columns:

- `sku`
- `name`

Supported columns:

- `barcode`
- `category`
- `sale_price`
- `cost_price`
- `quantity`
- `base_unit`
- `scan_unit_quantity`
- `route_to`
- `tax_class_id`
- `create_product`
- `portion_volume`
- `notes`

Existing records are matched case-insensitively by SKU/code. Duplicate product and stock barcodes remain blocked by the native backend.

## Import modes

**Products / stock master only** updates master data and ignores the quantity column.

Before Go Live, **opening balance** mode records the CSV quantity through the existing auditable `inventory.openingBalance` operation.

After Go Live, **receive stock** mode records the CSV quantity through `inventory.receive`, requires a receipt or invoice reference, and updates weighted-average inventory cost.

Use `create_product=FALSE` for stock that should not yet appear as a POS sellable, for example a keg before its serving yield is configured or an item whose retail price is still unknown.

## Barcode scanning at POS

The POS scanner path treats a normal USB scanner as a keyboard-wedge device. It now accepts both Enter and Tab scan suffixes and allows a slightly wider inter-key timing window for older scanners and Windows POS hardware.

A physical EAN/UPC belongs in the CSV `barcode` column. Supplier SKU remains in `sku`; POS can match either barcode or SKU/code.

## Staged Web v2 master-data imports

The Administration → Import Center provides a separate, online-only staged path for a v2 staging business. It supports new **products**, **stock-item definitions**, **stock locations**, **room types**, **nightly rate plans**, **rooms**, **guests**, **suppliers**, **asset categories**, **assets**, and **Auth-bound staff profiles**. Files are limited to 2 MB and 20,000 data rows. Staff rows can bind only existing Supabase Auth users; CSV does not create accounts, send invitations, set passwords, or grant custom permissions. It does not import opening quantities, stock movements, reservations/bookings, asset history, or historical transactions. It does not replace the installed terminal's local import authority or enable v2 writes; shared v2 remains default-off until its release gates pass.

The Import Center suggests a template from the selected file's header when the match is clear. Confirm the suggestion before staging; weak or tied matches do not change the selected template. Column suggestions are also advisory. The server accepts these columns and common aliases:

- Products: required `external_id`, `name`, `code`/`sku`, and `price` (KES, up to two decimal places); optional `category` and `barcode`.
- Stock-item definitions: required `external_id`, `name`, `code`/`sku`, and `base_unit`; optional `reorder_level` (up to six decimal places) and `barcode`.
- Guests: required `external_id` and `name`; optional `phone` and `email`.
- Suppliers: required `external_id`, `name`, and `code`; optional `phone` and `email`.
- Stock locations: required `external_id` and `name`; optional `code` and `type` (`STORE`, `FRIDGE`, `BAR`, `KITCHEN`, or `OTHER`; defaults to `STORE`).
- Room types: required `external_id`, `name`, and `code`; optional `max_guests` (defaults to 1 when no adult/child capacities are supplied; valid range 1–1000).
- Nightly rate plans: required `external_id`, `name`, `room_type_external_id`, `nightly_rate`, `currency` (`KES`), and `tax_basis_points` (0–10000); optional `mode` (must be `NIGHTLY`) and `notes`.
- Rooms: required `external_id`, `room_number`, `room_type_external_id`, `capacity`, and `turnaround_minutes`; optional `floor`, semicolon-separated `amenities`, and `notes`. The existing room command initializes new rooms as CLEAN and AVAILABLE. CSV cannot set housekeeping or maintenance status.
- Asset categories: required `external_id`, `name`, and `code`; optional `notes`. Import category records before assets. Depreciation configuration is intentionally not imported because the existing shared master-data validator does not accept those fields.
- Assets: required `external_id`, `name`, `asset_tag`, `asset_category_external_id`, `acquisition_cost`, and exactly one of `room_external_id` or `stock_location_external_id`; optional `serial_number`, `acquisition_date`, `warranty_until`, and `notes`. The referenced category, room, or location must already exist and be active. Asset tags remain globally unique. The existing `asset.save` domain handler creates the asset and immutable audit event; CSV cannot set status, condition, assignment, transfers, or history.
- Staff profiles: required `staff_id` (or `external_id`), `auth_user_id`, `name`, and explicit `role`; optional semicolon-separated `outlet_ids` and `service_areas`. Invite operators through Supabase Auth before staging this template and use each invited user's Auth UUID. The existing `staff.create` command checks Auth existence, stable-ID uniqueness, canonical role grants, actor permission ceilings, and Admin assignment rules. Extra permissions and active/archive state are not importable. No Auth user or credential is created by CSV.

Import room types before their nightly rates and rooms. Import asset categories and rooms/stock locations before assets. Invite all staff through Auth before importing their profiles. Each referenced external ID is the stable imported record ID and must already exist and be active when the dependent batch is reviewed and applied. Each template is a separate batch; server validation checks references and staff permissions again during apply.

Codes and external IDs are text, and barcode strings are never converted to numbers; leading zeroes are preserved and surrounding barcode whitespace is rejected instead of silently trimmed. Scientific notation is rejected for prices and quantities. Populated columns without a recognized mapping, duplicate mappings, malformed rows, and invalid domain values are rejected in the server dry-run. `external_id` becomes the imported record's stable ID and must be unique in the file, ignoring letter case. Existing target IDs or conflicting product/supplier codes are rejected, not overwritten. Correct the source CSV and stage a new batch; existing rows cannot be edited inline.

Review the server's per-row result before choosing **Apply reviewed import**. Application requires both import authority and the permission for that data domain, uses the normal domain validators, and commits the batch atomically. The raw file and exact plan stay in private server storage while the batch is open. Choose **Cancel batch** to permanently remove an unapplied source/plan; enter a reason, and the server preserves the operator, time, and reason on a cancelled audit record. Applied and cancelled batch IDs cannot be reused; stage a new batch to retry. There is no automatic expiry yet, so administrators should cancel abandoned batches. Replicated batch metadata excludes raw source and contact details. This path is source-backed but still requires migration application and staging acceptance; it is not evidence of completed legacy migration or cutover.
