# Inventory Overview

Section: Inventory
Roles: Admin, Manager, Server
Permission: inventory.view
Screen: inventory
Keywords: inventory overview, inventory, ServOS

## Overview

Inventory is location-driven and every operational change creates a stock movement. Barcodes identify stock masters; they do not bypass location, quantity or ledger rules.

## Configure stock barcodes

In Catalog, open a stock master and enter its physical barcode or EAN in **Physical barcode / EAN / UPC**. Set **Quantity represented by one scan** in the item's base unit. Examples: a 750 ml bottle tracked as ml uses 750; a case of 24 cans tracked as cans uses 24; a single bottle tracked as bottles uses 1. Keep the internal stock code separate from the barcode. A barcode must be unique within stock masters.

## Stock control dashboard

The Inventory screen summarizes stock value, low-stock and out-of-stock masters using the same location-driven stock records. Search by stock name, SKU or barcode, filter by stock state, and focus quantities on one location without creating a second stock balance. A configured reorder level is advisory only: it highlights a stock master when total on-hand is at or below that threshold. Replenishment still enters through Procurement.

Select a stock item to review its per-location quantities and recent movement history. Count, transfer and waste actions continue through their existing native inventory commands. A physical count shows expected quantity and draft variance before commit, and barcode scans remain draft input until the count is committed.

## Procedure

Review each stock item across the configured locations. Current stock is derived from durable stock records, while the movement ledger explains receipts, opening balance, sale consumption, transfers, counts and waste. When counting, select **Count**, choose the location, then scan the stock barcode or SKU. Each scan adds the configured scan quantity to the count draft. You can scan several packages or edit the counted total directly in base units. Scans do not change stock until you submit the count with a reason; the backend records the resulting delta as an inventory adjustment.

If a scan is unknown, duplicated, or assigned to the wrong stock master, stop and fix Catalog first. Do not compensate by scanning a different item or by treating a package count as a base-unit count.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
