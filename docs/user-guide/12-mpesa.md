# Manual M-Pesa

Section: M-Pesa
Roles: Admin, Manager, Server
Permission: mpesa.record
Screen: pos
Keywords: manual m-pesa, m-pesa, ServOS

## Overview

M-Pesa is manually confirmed from the real business receipt, then reconciled later by a manager.

## Procedure

Check the business M-Pesa receipt. Select M-Pesa and enter the transaction code against the configured account. ServOS enforces account/code uniqueness and allocation limits. This is not Daraja verification.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
