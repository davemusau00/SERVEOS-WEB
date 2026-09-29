# Running Bar Tabs

Section: POS
Roles: Admin, Manager, Server
Permission: pos.sell
Screen: pos
Keywords: running bar tabs, pos, ServOS

## Overview

Use quick tabs or available tables, add products, fire rounds and settle from one native order. A USB scanner that presents itself as a keyboard can find a sellable by barcode without a model-specific ServOS driver.

## Before scanning

1. In Catalog, edit the sellable and enter its physical barcode in **Barcode / EAN / UPC**. Keep its internal SKU in the separate **Code** field.
2. Save the item and confirm that the barcode is assigned to the intended sellable. ServOS prevents the same barcode from being assigned twice within the sellable catalog.
3. Connect the scanner and open Bar POS. Use **Test scanner** and scan a code. The test only displays the received text; it does not add a sale line or change stock.

For spirits sold by measures and bottles, assign the retail bottle barcode to the sealed-bottle sellable. Assign measure barcodes only when the actual label identifies that measure sellable.

## Procedure

Open a quick tab or an available table. Search by product name, category, SKU or barcode, or scan directly while Bar POS is open. A unique barcode match follows the same product-selection path as a click, including any required portion or modifier choice. Check the order line before firing the round. Change quantities before firing, then fire and repeat for each new round. Settle using an enabled tender.

If a scan is unknown, ServOS displays the code and leaves the order unchanged. If a code matches multiple sellables, resolve the duplicate in Catalog before selling. Search manually by name or SKU while the barcode is being corrected.

## Scanner behavior

The supported integration is USB HID keyboard-wedge input: the scanner types the decoded characters and terminates the code with Enter. It works offline and does not need WebUSB or vendor-specific scanner software. The scanner is captured by the open POS screen; avoid scanning while a modal action is open. The search box can also be focused for scanner input.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
