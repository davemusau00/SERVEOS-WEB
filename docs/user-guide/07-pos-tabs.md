# Make a sale

Section: Point of Sale
Roles: Cashier, Server, Manager
Permission: pos.sell, payment.record
Screen: pos
Guide: pos.first-sale
Keywords: sale, tab, order, payment

## Overview

Use the POS workspace to prepare an order and record cash received or an external tender verified according to the configured settlement policy.

## Procedure

1. Open or select the correct tab.
2. Add the requested products and quantities.
3. Review the order, outlet, customer and displayed total.
4. Choose payment, enter the tender details, and confirm only after receiving the money.
5. Review the command outcome before starting another transaction.

## What ServOS handles

The API validates prices, permissions and record versions, then stores the order and payment outcome.

## Common mistakes and correction

Do not record a tender that has not been received. If the outcome is unknown, recover that command in Activity instead of creating another payment.


When the simple cashier cohort is enabled, tap a product to add it immediately to the new-sale bill; tap again to increment it. Only required choices open an options sheet. Review the visible total and use **Pay KES …**. Creating the server order happens at checkout, so product taps do not wait for API round trips. Advanced authorized workflows remain under **More / Shift / Activity**.

Waiters use **Send to cashier** for an order proposal and wait for acknowledgement. Submission does not fire preparation, consume stock or record payment. The enrolled cashier reviews or edits the pending revision, then explicitly approves it once or rejects it with a reason. A later add-on is a new pending round.
