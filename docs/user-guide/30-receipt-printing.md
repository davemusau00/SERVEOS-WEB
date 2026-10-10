# Print a receipt

Section: Point of Sale
Roles: Cashier, Manager
Permission: pos.sell, payment.record
Screen: activity
Guide: receipt.print
Keywords: receipt, print, browser, printer, duplicate

## Overview

After a confirmed sale, open its immutable receipt from Activity, preview it, then print from the browser/PWA. The operating-system print dialog lets you choose an installed printer and paper options. A dialog opening does not prove that paper printed. ServOS does not require or offer a Print Bridge or printer service.

## Procedure

1. Confirm that the payment outcome is saved.
2. Open Activity and find Documents and printing.
3. Select the sales receipt and preview it.
4. Choose **Print with browser** and select the installed operating-system printer and paper options.
5. Check the physical output. Confirm delivery only after the receipt has printed.

## What ServOS handles

ServOS keeps the issued receipt immutable and tracks print attempts. The operator confirms physical delivery only after checking the printer output.

## Common mistakes and correction

Do not treat a browser dialog or a queued job as proof of delivery. If delivery is uncertain, check the printer before retrying because a retry may create a duplicate.
