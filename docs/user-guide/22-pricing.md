# Pricing and Happy Hour

Section: Pricing
Roles: Admin, Manager
Permission: pricing.manage
Screen: catalog
Keywords: pricing and happy hour, pricing, ServOS

## Overview

Price rules are persisted, time-aware and snapshotted onto order items.

## Procedure

Create a fixed or percentage rule. Scope it to all products, a product or category, set time window and priority. Overnight windows such as 17:00–02:00 are supported. Historical order lines retain their original applied rule snapshot.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
