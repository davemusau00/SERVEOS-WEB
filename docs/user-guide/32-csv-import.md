# Import master data

Section: Administration
Roles: Admin, Manager
Permission: data.import.stage
Screen: settings
Keywords: CSV, import, template, dry run, opening stock, product

## Overview

Use the API Import Center for supported create-only master data.

For a first catalog load, choose **Products and opening stock (simple)**. It uses the product code as the row reference, creates linked stock and the optional opening balance in the same reviewed command, and does not ask for internal record IDs. Existing outlets and storage places must already exist.

## Procedure

1. Download the template from the Import Center.
2. Fill the required columns and preserve the exact header names.
3. For the simple item template, use existing outlet names separated by semicolons and an existing storage-place name for tracked items. Set `stock_mode` to `SERVICE`, `TRACKED`, `SPIRIT`, `WINE`, or `STOCK_ONLY`.
4. For the other templates, import dependencies first and keep external IDs stable.
5. Stage the file and review validation errors.
6. Run the server dry run, then apply only a ready plan after review.

Sellable rows in the simple template must include a price, supported tax class, service area, and outlet name. Tracked rows also need a storage place, base unit, package size, quantity per unit, and purchase price. `opening_packages` is optional and defaults to zero. For spirits and wine, use `ml`, set `quantity_per_unit` equal to `container_size`, and provide `portion_size` unless selling sealed bottles only. The import creates records only; it never updates an existing price or balance.

## What ServOS handles

The API validates rows and applies each accepted row using a normal domain command. Product, stock master, product-to-stock link, and opening quantity are created atomically for a tracked item.

## Common mistakes and correction

Do not add unsupported columns or use the importer for staff credentials or historical transactions. Correct a blocked import in a fresh batch. Stock creation and opening quantities require inventory adjustment access; sellable rows also require catalog management access.
