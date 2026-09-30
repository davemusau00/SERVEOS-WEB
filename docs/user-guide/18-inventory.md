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

## Add an item on the terminal

Use **Add item** to open the staged Smart Item Wizard. Select the closest item type, enter its identity, configure selling/recipe details, optionally link or create stock and enter opening stock, then review the derived summary. Raw count- or weight-based ingredients create a stock-only item; dishes and batch recipes create sellable items with stock-linked recipe lines. For a physical sellable item, enter the container contents separately from its stock quantity (for example, a 330 ml can can be tracked as one piece). For a dish or batch recipe, add each ingredient using its stock base unit; a batch also asks how many sale portions it yields. The wizard displays calculated ingredient cost. The purchase-package flow derives stock units and average unit cost from package size/price. Creating a sellable product with stock, or a stock-only ingredient, plus its optional opening balance uses one native atomic command; rejection leaves all records and movements unchanged.

This wizard is currently a terminal workflow. Web Smart Item parity, supplier purchase-package definitions, and broader recipe/measurement UX are still in progress. A saved opening quantity is a local committed movement; it is not a supplier receipt.

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
