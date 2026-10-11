# Print a receipt

Section: Point of Sale
Roles: Cashier, Manager
Permission: pos.sell, payment.record
Screen: activity
Guide: receipt.print
Keywords: receipt, print, browser, printer, duplicate

## Overview

After a confirmed sale, open its immutable receipt from Activity, preview it, then print from the browser/PWA. The operating-system print dialog lets you choose the accepted 80 mm thermal printer preset. A dialog opening does not prove that paper printed. ServOS does not require or offer a Print Bridge or printer service.

## Procedure

1. Confirm that payment evidence and the order balance agree. An offline slip remains clearly provisional until reconciliation.
2. Open Activity and find Documents and printing.
3. Select the sales receipt and preview it.
4. Choose **Print with browser** and select the accepted operating-system 80 mm thermal printer with 100% scaling, browser headers/footers disabled and no fit-to-page.
5. Check the physical output. Confirm delivery only after the receipt has printed.

## What ServOS handles

ServOS keeps the issued receipt immutable and tracks print attempts. The operator confirms physical delivery only after checking the printer output.

## Common mistakes and correction

Do not treat a browser dialog or a queued job as proof of delivery. If delivery is uncertain, check the printer before retrying because a retry may create a duplicate.


Every receipt, preparation ticket, stock/supplier/hotel document and printed report uses an 80 mm thermal roll with 72 mm default content width. There is no A4, Letter or landscape fallback. QR codes appear before the footer. A pay-to QR is not payment confirmation; do not ask a customer to pay a settled receipt again.

Local slips carry a stable readable reference and **PENDING SERVER SYNC / NOT FISCAL INVOICE**. Use **View original local slips** in local activity. Direct local printing stays disabled outside the physically accepted printer cohort. Reconciliation links the official document without automatically printing or changing an already printed provisional slip. Check uncertain physical delivery before requesting an explicitly marked reprint.
