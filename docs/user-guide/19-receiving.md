# Receiving Stock

Section: Procurement
Roles: Admin, Manager, Server
Permission: procurement.view, procurement.manage, procurement.receive
Screen: procurement
Keywords: purchase order, procurement, GRN, goods receipt, barcode scanner, ServOS

## Overview

The Procurement screen keeps the purchase order (PO), goods received note (GRN), accepted stock and supplier accrual linked. It works offline: successful commands commit to the installed terminal's SQLite database and queue for synchronization. Creating a PO requires `procurement.manage`; receiving requires `procurement.receive`.

## Procedure

### Create the purchase order

1. Confirm that the supplier exists in Catalog. If it is missing and your role cannot manage the catalog, ask an Admin or Manager with `catalog.manage` to add it.
2. Open **Procurement** and choose **New purchase order**.
3. Select the supplier. Scan a stock barcode or SKU to select a stock master, or choose it from the list.
4. Enter the number of packages being ordered and the agreed price per package. The screen converts packages to the stock base unit using the scan quantity saved on the stock master. Review the converted quantity and price before adding the line.
5. Add each stock item once. Review the PO lines and total, then choose **Create and approve PO**. The PO stores ordered quantities and agreed cost per base unit; tax is not inferred.

### Receive a delivery and post its GRN

1. Open an **APPROVED** or **PARTIALLY_RECEIVED** PO and choose **Receive delivery**.
2. Select the stock location where the delivery physically arrived.
3. Scan each delivered package in **Scan delivered packages**. One scan adds the package size captured when that PO was created. You can edit the **Delivered** count manually; the number is in stock base units.
4. For damaged, short-dated or otherwise refused goods, enter the rejected quantity and a reason. Accepted quantity is delivered minus rejected. Check every line against the supplier's delivery before posting.
5. If accepted quantity would exceed the remaining PO quantity, a different Admin or Manager must approve with their own PIN. The approval is for this PO only, expires after two minutes and can be used once.
6. Enter the supplier invoice number and delivery note when available, add receipt notes, and choose **Post goods receipt**.

An unknown or duplicate barcode does not add quantity. Do not scan a barcode for a product that is not on the PO. Add the correct stock master or correct its barcode before receiving.

### Review the result

Open **Goods receipts** to review the GRN, delivery evidence, delivered/accepted/rejected quantities, receiver and timestamp. Accepted quantity alone increases stock and weighted-average cost and creates the stock movement. The GRN, accepted stock ledger, PO cumulative quantities, audit/outbox records, payable accrual and journal entry are written in one local transaction. Rejected quantities stay on the GRN with their reason and create no stock or payable value.

The **Payables** section is visible to users with `accounting.view`. Its receipt accrual uses accepted quantities at the agreed PO price. A typed invoice reference on the GRN is evidence only; it does not match or pay the invoice.

### Match the supplier invoice

1. In **Payables**, choose **Match supplier invoice** for the payable linked to the GRN.
2. Enter the invoice number, invoice date and due date. The supplier's payment terms prefill the due date; verify it against the invoice.
3. Compare each billed base-unit quantity and unit price with the accepted GRN and approved PO. Enter the invoice total.
4. Choose **Match invoice to PO and GRN**. Quantity, unit-price and total differences block matching and therefore block payment. This release does not override price variances, discounts or invoice tax. Resolve those with the supplier and an approved PO correction before matching.

Each payable is matched to one supplier invoice for one GRN. A supplier invoice spanning multiple GRNs must be split by the supplier or held outside this workflow until the invoice can be matched per GRN. The match records evidence only; it does not release money.

### Record a confirmed supplier payment

1. Make the supplier payment using the business's normal bank, business M-Pesa or cash process outside ServOS.
2. Open the matched payable and choose **Record payment**. Enter the amount, payment method, bank/M-Pesa reference or cash voucher, and a short note.
3. Confirm that the money has already been paid, then record the payment. Partial payments are supported; the screen shows the remaining balance and payment history.
4. The posted entry debits Accounts Payable and credits the selected cash, bank or business M-Pesa account. The payable becomes **PARTIALLY_PAID** or **PAID**. It does not call a bank or Safaricom service.

The due date and days overdue appear on the payable. Only users with `procurement.pay` can record payment; this capability is limited to Admin and Manager roles.

## What ServOS records

Actions that change the business are committed through the native backend. Receiving writes the GRN, stock movement and payable accrual atomically. Invoice matching and each confirmed payment separately commit the payable, journal, audit evidence and outbox together; synchronization remains pending until the terminal reconnects.

## Common mistakes and correction

Do not post a second GRN to fix a mistake without first reviewing the posted receipt. Posted GRNs are historical records and are not deleted by editing the PO. Record rejected goods before posting; after a receipt is posted, use the approved stock adjustment/return process and retain the supplier evidence. A price, quantity or total variance cannot be paid through the match flow; settle it with the supplier and correct the approved source documents first. A successful local commit is not proof that remote synchronization has completed.
