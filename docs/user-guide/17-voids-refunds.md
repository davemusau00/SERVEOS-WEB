# Voids and Refunds

Section: Voids & Refunds
Roles: Admin, Manager
Permission: order.refund
Screen: refunds
Keywords: voids and refunds, voids & refunds, ServOS

## Overview

Money reversal and stock disposition are separate decisions.

## Procedure

Unpaid orders can be voided. Fired items require a disposition such as WASTE, CONSUMED, RETURN_SEALED or MANAGER_ADJUSTMENT. Payment refunds reverse money and journals but never automatically recreate consumed cocktail ingredients. Non-cash refunds require external reversal evidence.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
