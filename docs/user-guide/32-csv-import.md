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
