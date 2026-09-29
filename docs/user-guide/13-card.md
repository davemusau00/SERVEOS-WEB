# Card Payments

Section: Payments
Roles: Admin, Manager, Server
Permission: payment.record
Screen: pos
Keywords: card payments, payments, ServOS

## Overview

Card is an external handoff. ServOS stores the external approval reference.

## Procedure

Run the card on the actual terminal/provider. In ServOS select Card, enter the exact approval/reference code and record payment. ServOS never claims it processed the external provider transaction.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
