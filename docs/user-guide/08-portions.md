# Portions, Modifiers and Recipes

Section: Portions
Roles: Admin, Manager
Permission: catalog.manage
Screen: catalog
Keywords: portions, modifiers and recipes, portions, ServOS

## Overview

Portions and recipes turn one stock item into correctly measured sellables.

## Procedure

Create a stock item such as a 750ml spirit. Add sellable portions with volumes and prices. Add modifiers/mixers with optional price and ingredient adjustments. Add recipe ingredients for cocktails. The frozen ingredient snapshot is consumed when the order is fired.

## What ServOS records

Actions that change the business are committed through the native backend. When applicable, business records, audit evidence and synchronization outbox entries commit together.

## Common mistakes and correction

Do not treat a button, toast or browser preview as proof that a business transaction was committed. Correct mistakes through the documented reversal, void, refund, count or manager-approved workflow rather than deleting historical transactions.
