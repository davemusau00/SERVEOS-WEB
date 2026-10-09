# Count stock

Section: Inventory
Roles: Admin, Manager, Storekeeper
Permission: inventory.view, inventory.count
Screen: inventory
Guide: stock.count
Keywords: count, stocktake, quantity, scanner

## Overview

A stock count compares the physical quantity at a location with the current API balance.

## Procedure

1. Choose Count stock and select the location.
2. Count each listed item in its base unit or scan a configured barcode.
3. Review the differences and resolve unknown or duplicate scans.
4. Enter the reason and confirm the count.
5. Check the result in stock count history.

## What ServOS handles

The API checks the reviewed balances and records the count as a versioned command.

## Common mistakes and correction

An unfinished draft is not a posted count. Do not open a second count to bypass an unresolved command outcome.
