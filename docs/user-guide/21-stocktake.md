# Physical Stocktake

Section: Stocktake
Roles: Admin, Manager
Permission: inventory.count
Screen: inventory
Keywords: physical stocktake, stocktake, ServOS

## Overview

A stock count posts the difference between expected and physical quantity as an auditable adjustment. Barcode scans speed up counting while preserving the base-unit stock ledger.

## Procedure

Select **Count** and choose the stock location. Scan a stock barcode or SKU for each package counted. Each scan adds the item's configured **Quantity represented by one scan**, in base units, to the count draft. For example, scanning a 750 ml bottle three times adds 2,250 ml when the stock master is tracked in ml and has a scan quantity of 750. You may also edit the total counted quantity directly; it must remain in base units.

Check the item and location before applying each scan. If a code is unknown or matches multiple stock masters, fix the catalog mapping first. Enter the count reason and commit when the draft matches the physical stocktake. Until commit, scans are only draft input and do not alter inventory. ServOS calculates the delta against expected stock and rejects invalid quantities.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
