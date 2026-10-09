# Make a sale

Section: Point of Sale
Roles: Cashier, Server, Manager
Permission: pos.sell, payment.record
Screen: pos
Guide: pos.first-sale
Keywords: sale, tab, order, payment

## Overview

Use the POS workspace to prepare an order and record the payment confirmed by the customer.

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
