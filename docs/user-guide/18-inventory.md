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

The terminal and Web Catalog both expose a Smart Item workflow. Web actions use queued business commands; recipe-only dishes/mixed drinks save as sellable products without creating an unrelated stock master. Web package/recipe and full item-type parity remain in progress and unverified. A saved opening quantity is a committed opening movement; it is not a supplier receipt.

## Prepare a recipe batch

Create a BATCH sellable item in Terminal or Web Smart Item setup. Enter ingredient amounts for one full batch and its portion yield; ServOS converts them to per-portion recipe quantities and creates a linked, zero-on-hand finished-portions stock master atomically. Keep that output separate from raw ingredient stock. In Inventory, choose **Prepare a recipe batch**, select the saved recipe, location, whole batch count and a reason, then review the derived yield and ingredient quantities before submitting. ServOS calculates each requirement from saved per-portion quantity × batch yield × batch count; it blocks shortages and records ingredient deductions plus finished portions as stock movements with cost valuation. POS sales of a BATCH item draw from prepared portion stock, so recipe inputs are not deducted again at sale. Web batch setup/preparation is online-only and remains behind the staged v2 gate. These source workflows are unverified; all acceptance remains pending.

For a weight ingredient, enter the physical amount in one supplier package (for example, `5 kg` per bag). ServOS converts it to `5,000 g`, derives cost per gram, and uses grams for new stock and recipe deductions. Native and Web recipe editors let you enter a compatible kitchen unit such as `0.2 kg` or `200 g`; ServOS converts it to the selected stock item's stored unit before previewing cost and saving. Cross-runtime item-type parity and final acceptance remain pending.

## Stock control dashboard

The Inventory screen summarizes stock value, low-stock and out-of-stock masters using the same location-driven stock records. Search by stock name, SKU or barcode, filter by stock state, and focus quantities on one location without creating a second stock balance. A configured reorder level is advisory only: it highlights a stock master when total on-hand is at or below that threshold. Replenishment still enters through Procurement.

Select a stock item to review its per-location quantities and recent movement history. Count, transfer and waste actions continue through their existing native inventory commands. Authorized operators with `inventory.adjust` also have a distinct **Correct selected stock** action: it previews current balance and delta, requires a reason, and posts an absolute corrected balance as an `ADMIN_CORRECTION` movement. Use it for a reviewed correction; use **Count stock** for the physical count workflow.

## Procedure

Review each stock item across the configured locations. Current stock is derived from durable stock records, while the movement ledger explains receipts, opening balance, sale consumption, transfers, counts, Admin corrections and waste. When counting, select **Count**, choose the location, then scan the stock barcode, saved purchase-package barcode or SKU. A package barcode adds its canonical base quantity; other stock barcodes add the configured scan quantity. You can scan several packages or edit the counted total directly in base units. Scans do not change stock until you submit the count with a reason; the backend records the resulting delta as a count adjustment.

For a purchase order, select the saved supplier package. Order and receive whole package counts at the price per package. A package scan on that PO adds one package (not the package's contents as PO quantity); the posted receipt converts accepted packages to base stock quantity and unit cost. If accepted quantity exceeds the remaining approved PO balance, a manager approval token is required. The separate physical-count scanner always adds base quantity.

If a scan is unknown, an operator with `inventory.adjust` may assign it inline to the correct stock master. Assignment only adds a barcode alias; it does not change quantity. Rescan the assigned code to count its stock quantity. Duplicate matches must be resolved in Catalog, and removing an unknown scan explicitly excludes it from the count. Do not compensate by scanning a different item or by treating a package count as a base-unit count.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
# Spirit and wine stock (source slice)

For eligible stock tracked in millilitres, configure a sealed-container size (for example, one bottle's ml capacity). Opening stock is split into whole sealed containers plus any open remainder. Serving sales draw from the open amount first and open only as many sealed containers as needed. A whole-container sale uses sealed stock only; open liquid does not count as a sealed bottle.

When correcting this stock, enter sealed bottles and open millilitres separately and provide a reason. During a Web location count, count sealed bottles and the liquid in the open bottle separately; ServOS calculates the canonical millilitre total, and the staged count command checks both values against it before changing stock. Transfers also preserve location-level sealed/open state; a destination that cannot represent the incoming open amount is blocked rather than having liquid silently mislabeled. These source workflows have not yet passed final acceptance; migration, browser, packaged-terminal and hosted evidence remain open.

