# Transfer or waste stock

Section: Inventory
Roles: Admin, Manager, Storekeeper
Permission: inventory.transfer, inventory.waste
Screen: inventory
Keywords: transfer, waste, movement, reason

## Overview

Transfers move stock between locations. Waste records stock that is no longer usable.

## Procedure

1. Select the stock item and the source location.
2. Enter a positive quantity in the item's base unit.
3. For a transfer, choose the destination location.
4. Enter a clear reason and review the movement before confirming.

## What ServOS handles

The API applies the movement to the reviewed balances and records its command and audit history.

## Common mistakes and correction

Do not record waste as a transfer or transfer stock to the same location. Reverse or correct a mistaken movement using its reviewed history.
