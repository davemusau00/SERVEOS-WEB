# Mixed / Split Tender

Section: Payments
Roles: Admin, Manager, Server
Permission: payment.split
Screen: pos
Keywords: mixed / split tender, payments, ServOS

## Overview

Split tender posts multiple payment lines atomically against the exact outstanding balance.

## Procedure

Choose Split Tender. Pick two enabled payment methods and allocate the amounts so they equal the outstanding balance. Supply M-Pesa/card evidence when those methods are used. If any line fails the transaction rolls back.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
