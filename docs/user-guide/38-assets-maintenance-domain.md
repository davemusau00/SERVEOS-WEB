# Assets and maintenance domain

Section: Operations
Roles: Admin, Manager
Permission: assets.view, assets.manage, assets.operate, maintenance.view, maintenance.manage
Screen: Domain engine / Import Center

## Overview

Patch 08 establishes the native Assets and Maintenance command domain before the Asset Register UI arrives in Patch 09.

Assets use permanent unique tags across active and archived history. Metadata edits cannot silently move an asset. Custody, transfers, inspections, loss, retirement and disposal use dedicated versioned commands and create immutable asset events.

Maintenance follows:

`REPORTED → ASSIGNED → IN_PROGRESS → COMPLETED`

An open order can also become `CANCELLED`.

Maintenance completion can consume stock parts and recognize external service cost. Parts, stock movements, maintenance expense journals, supplier payables, the work-order transition, audit and outbox evidence commit in one SQLite transaction.

## Procedure

### Import asset masters

Import and apply `asset_categories.csv` before `assets.csv`.

Asset category external IDs become durable migration mappings. `assets.csv` resolves its category and its location external ID. A location must resolve unambiguously to either an applied room or an applied stock location.

Imports create active assets only. Lost, retired or disposed state must be recorded through explicit lifecycle commands.

### Create or edit an asset

Use `asset.save` with:

- name;
- permanent asset tag;
- asset category;
- room and/or stock location;
- serial number when known;
- acquisition date and cost;
- optional supplier/warranty/notes.

After creation, changing room/location through `asset.save` is rejected. Use `asset.transfer` so location history remains explicit.

If a future procurement commissioning record supplies `acquisitionSourceId`, acquisition supplier/cost cannot be silently rewritten.

### Custody and lifecycle

`asset.assign` requires an active employee and an unassigned active asset.

`asset.return` clears the current custodian.

`asset.transfer` changes the physical room/stock location without rewriting unrelated asset metadata.

`asset.inspect` records `GOOD`, `FAIR`, `POOR`, or `BROKEN` and can schedule the next inspection date.

`asset.lose`, `asset.retire`, and `asset.dispose` are explicit terminal lifecycle actions. Retirement/disposal requires the asset to be returned first. Open maintenance must be resolved before terminal lifecycle actions.

Archive is allowed only after retirement/disposal and after maintenance is resolved. Asset tags remain reserved even after archive.

### Report maintenance

Use `maintenance.report` against an asset, room, or a matching asset+room pair.

Priority must be `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.

Assign an active employee, then start the work. Completion is rejected until the order reaches `IN_PROGRESS`.

### Complete maintenance with parts

Each part line identifies:

- stock item;
- current stock-item version;
- stock location;
- positive quantity.

ServOS rejects insufficient or stale stock.

Successful completion posts `MAINTENANCE` stock movements and recognizes:

`DR MAINTENANCE_EXPENSE / CR INVENTORY`

using the stock item's average unit cost snapshot.

If any later validation fails, including supplier validation, the transaction rolls back the part issues and work-order change together.

### External maintenance service

A positive `serviceCostMinor` requires an existing supplier and a supplier invoice reference.

Completion creates a `MATCHED_UNPAID` supplier payable and posts:

`DR MAINTENANCE_EXPENSE / CR ACCOUNTS_PAYABLE`

The existing Procurement payable workflow remains responsible for actual supplier settlement.

### Link room downtime

`room.block` may carry a `maintenanceOrderId` when that open maintenance order belongs to the same room.

Completing/cancelling maintenance does not automatically release the room. `room.unblock` still requires an explicit inspection note and rejects release while linked maintenance remains open.

This preserves the operational distinction between “repair work is finished” and “the room has been inspected and is safe to sell.”

## Patch 09 boundary

Patch 08 intentionally does not add the searchable Asset Register UI.

Patch 09 adds the asset register, tag scanning, custody/location timeline, warranty/inspection views, and procurement-to-asset commissioning. The domain commands and invariant tests established here are the authority those interfaces will call.
