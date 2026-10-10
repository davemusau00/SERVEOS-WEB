# Payments and till

Section: Point of Sale
Roles: Cashier, Manager, Accountant
Permission: payment.record, till.open, till.close
Screen: pos
Keywords: cash, payment, till, variance

## Overview

Payment and till commands record the tender and drawer events confirmed by staff.

## Procedure

1. Open the till for the current shift if required.
2. Select the tender that matches the money actually received.
3. Enter the required reference or amount and review the total.
4. At close, count the drawer and submit the actual count for review.

For M-Pesa, compare the transaction reference, actual received amount, and receipt time with the payment received before confirming. This is a manual staff confirmation; ServOS does not verify payments with an M-Pesa provider.

## What ServOS handles

The API records payment events, till sessions and any reviewed variance.

## Common mistakes and correction

Do not enter an expected amount as the counted drawer amount. Ask a manager to review a variance before closing it.
