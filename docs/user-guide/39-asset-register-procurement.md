# Asset Register and procurement commissioning

Section: Operations
Roles: Admin, Manager
Permission: assets.view, assets.manage, assets.operate, maintenance.view, maintenance.manage, procurement.view, procurement.manage, procurement.receive
Screen: Asset Register / Procurement

## Overview

Patch 09 turns the Patch 08 asset and maintenance command domain into an operational register and connects procurement to fixed-asset commissioning.

Purchase-order lines now carry one explicit treatment:

- `STOCK` increases stock when accepted.
- `EXPENSE` posts the accepted cost directly to a controlled operating-expense account.
- `ASSET` posts accepted cost to `ASSET_CLEARING` and creates one pending commissioning unit per accepted physical asset.

An ASSET line never creates stock. Commissioning creates the permanent tagged asset and reclassifies its accepted cost from Asset Clearing to Fixed Assets.

The Asset Register provides tag/scanner lookup, custody, location, condition, warranty, inspections, maintenance history, pending procurement commissioning and asset category setup.

## Procedure

### Use the Asset Register

Open **Asset Register** and search by tag, name, serial, category or location.

A keyboard-wedge scanner can scan the permanent asset tag. A unique match opens the asset. Unknown or duplicate tags do not mutate any record.

The detail panel shows:

- permanent tag and status;
- category;
- physical location;
- custodian;
- serial;
- purchase cost;
- acquisition source;
- warranty;
- last/next inspection;
- immutable lifecycle history;
- maintenance history.

### Create a manual asset

Choose **Manual asset** for an asset that did not originate from the procurement commissioning flow.

Enter a permanent tag, category, physical location and known acquisition metadata. After creation, physical moves use `asset.transfer`; editing metadata cannot silently relocate the asset.

### Custody and transfers

Choose **Assign** to issue an active asset to an active employee.

Choose **Return** before assigning a different custodian or before retirement/disposal where required.

Choose **Transfer** to move the asset to a room or stock/service location. The transfer is a dedicated command and appears in immutable asset history.

### Inspections

Choose **Inspect** and record `GOOD`, `FAIR`, `POOR` or `BROKEN`.

A next-inspection date can be scheduled. The Register highlights overdue inspection dates.

### Maintenance workbench

Maintenance can be reported against an asset, room, or matching asset+room.

The workbench supports assign, start, complete and cancel.

Completion can issue multiple stock parts. Each part carries the current stock-item version, location and quantity. External service cost can also create a supplier payable.

Room work can create a maintenance-linked availability block. Completion does not release the room automatically; the existing inspected `room.unblock` workflow still controls return to sale.

### Create a classified purchase order

In Procurement choose **Classified PO**.

For each line select:

`STOCK`, `EXPENSE`, or `ASSET`.

For STOCK choose a stock master. For EXPENSE choose the controlled expense category and description. For ASSET choose the asset category and asset/model name. ASSET quantities must be whole units.

The existing stock-only PO action remains backward compatible and is stored as STOCK treatment.

### Receive a mixed purchase order

A single GRN may accept STOCK, EXPENSE and ASSET lines.

Accepted STOCK:
- updates stock and weighted average cost;
- creates inventory receipt/movement evidence;
- debits Inventory.

Accepted EXPENSE:
- does not touch stock;
- debits the controlled expense account.

Accepted ASSET:
- does not touch stock;
- debits Asset Clearing;
- creates one `PENDING_COMMISSION` acquisition unit per accepted physical asset.

All accepted treatments credit one Accounts Payable liability and belong to the same supplier payable / invoice match.

### Match the supplier invoice

Invoice matching now follows stable purchase-line IDs rather than assuming every GRN line has a stock item.

Quantity, unit cost and total must still match the accepted GRN and approved PO exactly.

### Commission a procured asset

Open **Asset Register → Commissioning**.

For each pending unit:

1. assign its permanent tag;
2. record serial number if known;
3. choose its physical room or stock/service location;
4. record warranty information if known;
5. confirm commissioning.

ServOS then:

`DR FIXED_ASSETS / CR ASSET_CLEARING`

for the exact accepted unit cost, creates the active asset, links it to the PO/GRN acquisition evidence, and marks the acquisition unit `COMMISSIONED`.

No stock movement is created.

Multi-quantity ASSET lines therefore require a separate unique tag for every accepted physical unit.

## Accounting boundary

The procurement treatments are intentionally exclusive:

- STOCK cannot also become an asset acquisition.
- ASSET cannot also create inventory stock.
- EXPENSE cannot quietly capitalize itself.

Changing an asset's acquisition value after procurement commissioning is rejected by the native asset domain. Corrections must be handled through the procurement/accounting evidence chain rather than editing the asset master.
