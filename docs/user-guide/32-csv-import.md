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

The Administration → Import Center provides a separate, online-only staged path for a v2 staging business. It supports new **products**, **stock-item definitions**, **guests**, and **suppliers**. Files are limited to 2 MB and 20,000 data rows. It does not import opening quantities, stock movements, rooms, staff, assets, or historical transactions. It does not replace the installed terminal's local import authority or enable v2 writes; shared v2 remains default-off until its release gates pass.

Use the Import Center's header suggestions as guidance. The server accepts these columns and common aliases:

- Products: `name`, `code`/`sku`, `price` (KES, up to two decimal places), optional `category`, `barcode`, and `external_id`.
- Stock-item definitions: `name`, `code`/`sku`, `base_unit`, optional `reorder_level` (up to six decimal places), `barcode`, and `external_id`.
- Guests: `name`, optional `phone`, `email`, and `external_id`.
- Suppliers: `name`, `code`, optional `phone`, `email`, and `external_id`.

Codes and external IDs are text, and barcode strings are never converted to numbers; leading zeroes are preserved and surrounding barcode whitespace is rejected instead of silently trimmed. Scientific notation is rejected for prices and quantities. Populated columns without a recognized mapping, duplicate mappings, malformed rows, and invalid domain values are rejected in the server dry-run. `external_id` becomes the imported record's stable ID; without it, the server derives a stable ID from the batch and row. Existing target IDs or conflicting product/supplier codes are rejected, not overwritten. Correct the source CSV and stage a new batch; existing rows cannot be edited inline.

Review the server's per-row result before choosing **Apply reviewed import**. Application requires both import authority and the permission for that data domain, uses the normal domain validators, and commits the batch atomically. The raw file and exact plan stay in private server storage while staged and are removed after successful application; replicated batch metadata excludes raw source and contact details. This path is source-backed but still requires migration application and staging acceptance; it is not evidence of completed legacy migration or cutover.
