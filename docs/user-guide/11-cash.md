# Cash Payments

Section: Payments
Roles: Admin, Manager, Server
Permission: payment.record
Screen: pos
Keywords: cash payments, payments, ServOS

## Overview

Cash payments require an open till and actual cash tendered.

## Procedure

Choose Cash, enter the payment amount and cash tendered, then record payment. ServOS increases expected drawer cash by the paid amount and calculates change in the UI. Partial payments remain attached to the same order.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
