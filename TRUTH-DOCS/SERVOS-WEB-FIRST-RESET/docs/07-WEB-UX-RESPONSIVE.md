# 07 — Web UX, UI and Responsive Product Reset

## 1. Product principle

ServOS should present tasks, not the database schema.

The UI should be simpler than the domain model underneath it.

## 2. Primary navigation

Recommended shell:

```text
TODAY

SELL
  POS
  Tabs / Tables
  Kitchen

STOCK
  Receive
  Count
  Transfer
  Waste
  Items

HOTEL
  Front Desk
  Rooms
  Housekeeping

MONEY
  Tills
  M-Pesa
  Credit
  Suppliers

MANAGE
  Reports
  Staff
  Assets
  Settings

HELP
```

Sections are capability/role filtered.

## 3. Role examples

### Cashier

```text
Today
Sell
Tabs
Receipts
Close Shift
Help
```

### Storekeeper

```text
Today
Receive Delivery
Count Stock
Transfer
Waste
Items
Purchase Orders
Help
```

### Receptionist

```text
Today
Front Desk
Rooms
Guests
Payments
Help
```

### Housekeeper

```text
Today
Rooms to Clean
Inspections
Problems
Help
```

### Manager

Broad workspaces plus approvals and reporting.

The backend permission matrix remains authoritative even if the UI hides an action.

## 4. Dashboard rule

"Today" should show exceptions and next actions, not decorative analytics.

Examples:

- till not opened;
- 4 rooms checking out today;
- 2 rooms need cleaning;
- 3 stock items low;
- 1 PO awaiting approval;
- M-Pesa discrepancy;
- sync attention;
- printer unavailable.

## 5. Standard viewports

Every Tier-A workflow must be tested at:

```text
1024 × 600   compact POS/AIO
1280 × 720   AIO terminal
1280 × 800   tablet landscape
1366 × 768   laptop
1920 × 1080  desktop
800 × 1280   tablet portrait
390 × 844    mobile manager
```

The 1024×600 height is a release target, not an afterthought.

## 6. Responsive rules

### Desktop

- persistent navigation where room permits;
- tables for information-dense management;
- centered dialogs with max height;
- split panes where useful.

### Small-height terminal/tablet

- condensed navigation;
- full-height sheets;
- sticky action/footer regions;
- no critical button below an unreachable fold.

### Mobile

- full-screen flows;
- card lists rather than wide tables;
- bottom action bars;
- manager/owner workflows prioritized over full cashier operation unless intentionally supported.

## 7. Dialog contract

Every shared dialog provides:

- accessible title;
- close/cancel semantics;
- internal scrolling;
- sticky action footer;
- busy state;
- validation summary;
- command outcome/recovery state;
- keyboard focus trap;
- Escape behavior where safe.

No feature should build its own ad hoc overlay.

## 8. Touch contract

- minimum ~44–48 px interactive target;
- clear pressed/selected states;
- adequate spacing;
- numeric keyboard hints for quantities/money;
- search inputs large enough for scanner/manual use;
- avoid tiny inline icon-only destructive controls.

## 9. Keyboard/scanner contract

POS/procurement/inventory remain keyboard efficient.

Support:

- Enter to confirm safe focused actions;
- Escape to cancel/close;
- arrow navigation where appropriate;
- quick search focus;
- scanner keyboard wedge capture;
- numeric keypad workflow.

Scanner capture must be explicitly suspended when typing into unrelated fields such as guest name, payment reference or reason.

## 10. Status language

Technical codes are translated.

Examples:

`VERSION_CONFLICT`
→ "This changed on another device. Review the latest version before saving."

`OUTCOME_UNKNOWN`
→ "We're checking whether this was saved. Do not submit it again."

`OFFLINE_GRANT_REQUIRED`
→ "This action needs the server. You can continue with offline selling."

## 11. Progressive disclosure

Simple workflow first; advanced options second.

Examples:

- Menu item: name + price + kitchen route, then optional recipe.
- Room check-in: name + nights + pay now/later, then optional profile/deposit details.
- PO: supplier + item/package + quantity + price, then optional expense/asset classification.
- Item: physical buying/selling language, then Advanced exposes tax/code/internal settings.

## 12. Settings information architecture

```text
BUSINESS
  Identity
  Branding
  Locations

SELLING
  Payments
  Tax
  Receipts
  Printer

STOCK
  Locations
  Defaults
  Counting

HOTEL
  Rooms
  Default rate
  Checkout policy
  Deposits
  Guest requirements

STAFF
  Roles
  Access

SYSTEM
  Devices
  Sync
  Backup
  Diagnostics
```

## 13. Reusable primitives

Finish a shared design system before adding more module-specific widgets:

```text
Dialog
Drawer
FormField
Select
Combobox
MoneyInput
QuantityInput
DateTimeField
DataTable
CardList
Search
FilterBar
ActionMenu
ConfirmDialog
ManagerApprovalDialog
CommandRecoveryState
PermissionGate
LoadingState
EmptyState
ErrorState
SyncState
StatusChip
StickyActionBar
```

## 14. Forms

Rules:

- preserve input until command is confirmed;
- show interpretation before committing ambiguous quantities/prices;
- do not silently drop invalid lines;
- required fields must correspond to actual business necessity;
- default intelligently from business policy;
- inline create supplier/customer only asks for the minimum.

## 15. Destructive actions

Void, comp, refund, write-off, stock correction and delete/archive must have visibly distinct semantics.

They require reason/approval according to policy and should never share a vague "Remove" button.

## 16. Accessibility

Target WCAG-conscious interaction:

- semantic labels;
- keyboard navigation;
- visible focus;
- error associations;
- sufficient contrast;
- status not communicated by color alone;
- dialogs correctly labelled;
- live-region announcements for command outcomes.

## 17. Perceived performance

- optimistic UI only when safe and reversible;
- skeletons for slower management reads;
- no full-page spinner for a tiny command;
- virtualize large catalog/transaction lists;
- cache stable reference data;
- background refresh rather than destructive reload.

## 18. UX acceptance

A workflow fails UX acceptance if:

- primary action is clipped;
- operator needs horizontal scrolling for a routine task;
- a technical concept is required without business meaning;
- two workspaces expose the same ordinary action ambiguously;
- command failure clears the user's work;
- disabled control has no understandable reason;
- role sees irrelevant disabled graveyards;
- mobile/tablet layout merely shrinks desktop tables.
