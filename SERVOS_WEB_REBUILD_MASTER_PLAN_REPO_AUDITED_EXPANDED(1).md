# ServOS Web-First Rebuild Master Plan — Repo-Audited Rewrite

**Repository audited:** `davemusau00/servos-`  
**Main branch HEAD audited:** `243787655236c3a1b7f352ff7edf23e5f714b096`  
**Audit date:** 2026-09-29  
**Current package version:** `0.2.0`  
**Current production authority:** installed Tauri + SQLite terminal  
**Current web-v2 status:** staged/default-off; not production transaction authority

---

# 0. Why this plan is being rewritten

The previous rebuild plan was directionally correct but it understated how far the repository has already moved.

The current repository is no longer a native POS plus a thin web manager. The codebase now contains a substantial staged web-v2 business workspace, migrations through `021_room_stay_policy.sql`, IndexedDB queue/snapshot infrastructure, a service-worker shell, lifecycle/readiness views, web guidance, Front Desk, Guest Accounts, Housekeeping, Financial Controls, web staff/device administration, controlled import staging, record export, customer credit, M-Pesa reconciliation, POS parity work, and room-stay policy work.

Therefore the correct strategy is **not**:

> clone the repo and re-build all web modules again.

The correct strategy is:

> **clone the repo, freeze the current domain contracts, extract the stable web-v2/core logic, remove legacy/duplicate presentation layers, replace the shell and UI system, strengthen offline execution, and complete the remaining business domains around the current transaction protocol.**

This plan treats the current repository as a partially assembled next-generation ServOS rather than merely a source of ideas.

---

# 1. Current repository state observed directly

## 1.1 Current authority model

Production remains:

```text
Installed ServOS terminal
        ↓
Tauri
        ↓
Rust business command boundary
        ↓
SQLite
        ↓
ordered legacy Supabase upload
        ↓
remote manager/read replica
```

The staged target already exists alongside it:

```text
Authenticated browser
        ↓
WebBusinessApp
        ↓
BusinessStore / IndexedDB
        ↓
versioned command queue
        ↓
servos_v2_execute
        ↓
PostgreSQL/Supabase
        ↓
ordered change feed
```

The staged web path remains protected by:

```text
VITE_ENABLE_WEB_V2
+
servos_v2.control.enabled
```

Production must continue to keep that authority disabled until cutover.

---

## 1.2 Current staged PostgreSQL migration chain

The repository currently contains:

```text
001_protocol
002_allocations
003_domain_dispatch
004_domain_helpers
005_assets
006_read_permissions
007_rooms
008_folios
009_stays
010_web_session
011_inventory_catalog
012_procurement
013_pos
014_pos_payments
015_refunds_close_day
016_staff_devices_approvals
017_web_lifecycle_guidance
018_financial_controls
019_web_pos_parity
020_admin_operations
021_room_stay_policy
```

This means the rebuild should retain the migration sequence and business invariants unless a deliberate migration replacement is designed and tested.

---

## 1.3 Current web-v2 modules already present

The current source already contains web implementations for:

```text
Home / Start Here
POS
KDS
Catalog
Inventory
Procurement
Front Desk
Guest Accounts
Housekeeping
Rooms
Assets
Master Data
Refunds
Financial Controls
Settings
Finance / Close Day
Staff & Devices
Administration
Activity / queue state
Help
Lifecycle / readiness
Staff welcome
Guided tour
```

Do **not** recreate these as parallel modules.

They should be audited, normalized and migrated into the new shell.

---

## 1.4 Current browser data layer

`BusinessStore` already provides IndexedDB stores for:

```text
meta
queue
records
drafts
```

It already supports:

- per-business/device/actor database scope;
- client sequence persistence;
- queued commands;
- command acknowledgement;
- server snapshot replacement;
- policy-version tracking;
- ordered cursor tracking;
- change-page application;
- sequence-gap rejection;
- non-increasing record-version rejection;
- saved drafts.

`sync.ts` already provides:

- command replay;
- server acknowledgement verification;
- change-feed pulling;
- browser lock coordination;
- online/visibility-triggered retry;
- exponential failure backoff.

This is valuable and should be retained.

However, it is **not yet a full offline transaction engine**.

Today, when the browser is offline, many web operations are saved as drafts rather than becoming locally finalized business transactions. Therefore the rebuild must evolve this architecture from:

```text
offline form draft
```

to:

```text
authorized offline business commit
+
local projections
+
signed resource grants
+
later cloud reconciliation
```

for operations explicitly allowed offline.

---

## 1.5 Current PWA/offline shell

The repo already has:

```text
src/runtime/web/registerShell.ts
scripts/web-shell-plugin.ts
```

The service worker:

- is opt-in;
- caches application-shell assets;
- can reload the application shell offline;
- deliberately does not cache private business API responses;
- deliberately does not grant offline transaction authority.

This is the correct security boundary.

The new rebuild should **extend**, not replace, this foundation.

---

## 1.6 Current guidance/help state

The current repository has progressed beyond the older parity document.

Current web code already has:

- shared `GUIDES` definitions;
- `data-guide-anchor` semantic targets;
- server/RPC guidance-progress loading;
- guidance-progress save;
- resumable current step;
- completion state;
- route-aware tour steps;
- target-loss handling;
- keyboard navigation;
- web staff welcome;
- Help based on generated `help-index.json`.

The Help Center is still visually basic and the tour engine still needs a proper spotlight/positioning/practice architecture, but guidance is **not a blank module anymore**.

---

## 1.7 Current finance controls

Web source currently contains:

- till cash movement;
- till close;
- close-day report generation;
- payment/refund/reversal;
- customer credit accounts;
- customer credit charges from POS;
- customer credit settlement;
- credit reconciliation;
- write-off;
- M-Pesa receipt evidence;
- M-Pesa discrepancies;
- M-Pesa reconciliation;
- financial control exceptions.

These should be consolidated into the rebuilt Finance/Accounting experience rather than implemented again.

---

## 1.8 Current hospitality state

Current web source already contains:

```text
Front Desk
Guest Accounts
Housekeeping
Rooms
reservations
stays
folios
deposits
folio payments
hotel services
checkout conservation
room moves
room stay settings
NIGHTLY/DAY stay policy
```

Latest repository work simplifies room stay policy around one configured nightly rate:

- nightly checkout time;
- day-stay cutoff;
- DAY and NIGHTLY stay type;
- rate snapshot;
- room availability and turnaround.

This current model should be treated as the starting contract.

---

## 1.9 Current POS parity has advanced

Current web POS source now contains logic for:

- normal sale;
- split tender;
- refunds/reversals;
- customer credit;
- room charge;
- order transfer;
- order merge;
- discount;
- comp;
- barcode input.

Some repo planning ledgers still label several of these as missing. They are stale relative to source.

The rebuild process therefore requires a **fresh executable parity inventory**, not blind trust in old Markdown status tables.

---

# 2. Problems found in the current structure

The rebuild should target structural problems, not merely feature gaps.

## 2.1 Source/docs drift

The repository contains several plans and manifests that lag behind actual implementation.

Example classes of drift:

- web parity documentation describes modules as absent that now exist;
- operation manifests still mark some web operations missing although the current web POS invokes them;
- release documents describe earlier migration boundaries.

### Required fix

Generate authoritative coverage automatically from:

```text
registered routes
registered commands
permission map
migration dispatchers
tests
guide anchors
```

Hand-maintained parity documents become secondary documentation.

---

# 3. The actual rebuild goal

The rebuilt ServOS should be:

> **A web-native, local-first, multi-device hospitality/business operating system using Supabase/PostgreSQL as shared authority, IndexedDB as durable local state, signed delegated offline rights for disconnected work, and an optional small hardware bridge for devices browsers cannot reliably control.**

The goal is **not** simply "make the current web screen production."

The goal is to make one coherent application from the existing mature business logic.

---

# 4. Clone strategy

Create a clean long-lived rebuild branch/repository.

Suggested:

```text
servos-web
```

or:

```text
servos-next
```

Tag the current source first:

```text
servos-0.2-reference-2026-09-29
```

The clone should initially preserve history but immediately separate:

```text
legacy-native-reference
web-v2-core
shared-domain
new-web-shell
```

Do not delete the existing source until acceptance is complete.

---

# 5. What must be reused

## 5.1 PostgreSQL command authority

Reuse:

```text
servos_v2 command envelope
command IDs
device IDs
actor IDs
client sequence
expected versions
allocation references
change feed
record versions
conflict responses
audit records
```

## 5.2 Existing domain migrations

Preserve and test existing domain behavior for:

- inventory/catalog;
- procurement;
- assets;
- rooms;
- folios;
- stays;
- POS;
- payments;
- refunds;
- close day;
- staff/devices;
- approvals;
- lifecycle;
- financial controls;
- admin;
- room stay policy.

## 5.3 Browser store and synchronization

Retain the concepts from:

```text
BusinessStore
sync.ts
session.ts
```

Refactor them into standalone infrastructure packages rather than page-level runtime code.

## 5.4 Native business logic as oracle

Rust/SQLite remains extremely valuable as:

- behavior reference;
- migration source;
- acceptance oracle;
- fallback terminal during cutover.

Do not attempt a line-by-line port.

Use it to verify business behavior.

## 5.5 Existing Help corpus

Keep:

```text
docs/user-guide/*.md
→ build-help-index
→ generated help index
```

Do not manually duplicate Help content in React.

## 5.6 Existing guidance definitions

Reuse the typed guide model and semantic anchor approach.

## 5.7 Import templates

Preserve all current CSV templates.

---

# 6. What should NOT be carried into the clean architecture unchanged

## 6.1 Multiple UI generations

The current tree contains:

```text
src/components/*
src/native/*
src/runtime/web/*
```

with overlapping representations of the same product.

The rebuild should not continue three parallel UI generations.

Target:

```text
src/features/*
src/ui/*
src/domain/*
src/data/*
```

The old directories become reference-only until removed.

---

## 6.2 Repeated local UI classes

Current views repeatedly define local constants such as:

```text
field
button
primary
input
```

This is the source of much of the uneven spacing and inconsistent controls.

The rebuilt app must ban this pattern in feature modules.

---

## 6.3 Browser-default important dropdowns

Current forms contain many raw `<select>` elements.

These are responsible for:

- inconsistent popup behavior;
- awkward widths;
- different OS appearance;
- clipping;
- inaccessible long data sets;
- poor mobile behavior.

Replace them with shared Select/Combobox primitives.

---

## 6.4 Backup artifacts in source tree

The current tree contains committed development leftovers such as:

```text
.servos-patch-*-backup-*
*.bak
.playwright-tmp
```

Do not copy them into the clean rebuild.

Preserve historical code with Git tags/branches, not backup folders inside source.

---

# 7. New repository architecture

```text
src/
  app/
    App.tsx
    AppShell.tsx
    navigation.ts
    routes.ts
    providers.tsx

  ui/
    tokens/
    primitives/
    forms/
    data/
    overlays/
    feedback/
    layout/

  platform/
    auth/
    lifecycle/
    device/
    offline/
    pwa/
    sync/
    commands/
    queries/
    storage/
    printing/
    scanner/

  domain/
    business/
    catalog/
    inventory/
    procurement/
    sales/
    payments/
    credit/
    expenses/
    accounting/
    reports/
    customers/
    hospitality/
    assets/
    staff/
    permissions/
    approvals/
    imports/
    exports/
    audit/

  features/
    home/
    pos/
    kds/
    catalog/
    inventory/
    procurement/
    expenses/
    accounting/
    reports/
    front-desk/
    guest-accounts/
    housekeeping/
    rooms/
    assets/
    staff/
    administration/
    help/

  guidance/
    engine/
    definitions/
    anchors/
    progress/
    search/

  generated/
```

Backend:

```text
supabase/
  migrations/
  functions/
  tests/
  seeds/
```

---

# 8. Unified design system — P0

This must happen before feature migration.

## 8.1 Tokens

Create shared tokens for:

- spacing;
- typography;
- control heights;
- radii;
- borders;
- surfaces;
- focus;
- disabled;
- positive;
- caution;
- danger;
- informational;
- overlay;
- responsive gutters;
- content widths.

Recommended spacing scale:

```text
4
8
12
16
20
24
32
40
48
64
```

No arbitrary `p-3` / `p-5` / `gap-7` composition scattered without layout rules.

---

## 8.2 Required primitives

```text
Button
IconButton
Input
Textarea
MoneyInput
QuantityInput
PercentInput
DateInput
DateTimeInput
Select
Combobox
MultiSelect
Checkbox
Radio
Switch
FormField
FieldGroup
Card
Panel
StatCard
Badge
Status
Alert
Toast
Table
DataGrid
EmptyState
Skeleton
Dialog
Drawer
Sheet
Popover
DropdownMenu
Tabs
Breadcrumb
Pagination
PageHeader
Toolbar
Search
FilterBar
CommandPalette
PermissionGate
OfflineBadge
SyncStatus
```

Feature modules consume these.

---

# 9. Dropdown/selection normalization

This deserves its own workstream because the current UX problem is systemic.

## Short fixed choices

Use:

```text
Select
```

Examples:

- payment method;
- stay type;
- housekeeping state;
- adjustment reason.

## Large record sets

Use:

```text
Combobox
```

Examples:

- product;
- customer;
- supplier;
- room;
- employee;
- stock item;
- account.

Features:

- type-to-search;
- keyboard navigation;
- clear selection;
- virtualized lists when large;
- mobile sheet mode;
- collision-safe portal;
- accessible labels.

## Actions

Use:

```text
DropdownMenu
```

Never misuse a select for commands.

---

# 10. Shell/navigation rebuild

The existing shell contains the right concepts but its navigation is becoming brittle.

A concrete bug in the current source demonstrates this: `Finance Controls` and `Administration` exist in the type/permission/navigation/rendering logic, yet the manual visible `tabs` array omits them.

The rebuild must eliminate manually duplicated route lists.

Create one canonical route registry:

```ts
{
  id,
  label,
  group,
  icon,
  permissions,
  component,
  mobile,
  helpContext,
  guideAnchor
}
```

From that registry generate:

- desktop navigation;
- mobile navigation;
- permission filtering;
- route title;
- Help context;
- command palette;
- breadcrumbs;
- route tests.

One definition, many surfaces.

---

# 11. New top-level information architecture

## Start

```text
Home
Help & Training
```

## Sell & Serve

```text
POS
KDS
```

## Stock & Purchasing

```text
Catalog
Inventory
Procurement
```

## Hospitality

```text
Front Desk
Guest Accounts
Housekeeping
Rooms & Rates
```

## Money

```text
Finance
Expenses
Accounting
Reports
Financial Controls
```

## Business

```text
Customers
Suppliers
Assets
Staff
Master Data
```

## System

```text
Administration
Activity & Sync
Settings
```

Roles only see appropriate modules.

---

# 12. PWA foundation

Current shell caching is good and should remain strict.

## Service worker responsibilities

Cache:

- HTML shell;
- JS/CSS chunks;
- fonts;
- icons;
- Help content;
- non-sensitive static references.

Do not cache authenticated REST/RPC responses in Cache Storage.

Business data belongs in IndexedDB.

---

# 13. BusinessStore v2 redesign

Evolve current BusinessStore rather than replacing it.

Proposed IndexedDB stores:

```text
meta
records
commands
drafts
projections
grants
printJobs
guidance
conflicts
attachments
syncLog
```

## Current strength to preserve

- ordered sequence;
- durable queue;
- snapshot cursor;
- actor/device isolation;
- browser locking;
- versioned records.

## Missing piece

Local transactional projection.

Today many offline operations become drafts.

Target:

```text
validate local authority
↓
construct command
↓
atomically write:
  command
  affected local projections
  audit preview
  receipt draft where relevant
↓
commit IndexedDB transaction
↓
show success
```

Cloud acknowledgement later upgrades the local record from:

```text
LOCALLY_COMMITTED
```

to:

```text
SYNCHRONIZED
```

---

# 14. Offline authorization

This is one of the largest remaining architectural gates.

Current types already describe OfflineGrant and allocation references. Database allocation primitives already exist.

Finish:

```text
grant issuance
grant signature
grant verification
grant renewal
grant expiry
grant consumption
grant handover
grant quarantine
device revoke
replacement recovery
```

## Resource types

Use grants only where needed:

```text
stock
room
table
order
folio
credit ceiling
ticket/document numbers
cash/till session
```

Do not invent a global "offline can do anything" flag.

---

# 15. Offline capability matrix

## Safe local-finalizable with correct grant

Potential:

- cash sale;
- item fire;
- allocated stock depletion;
- stock count;
- waste;
- selected transfer;
- room work within reserved authority;
- till movements;
- locally generated receipt;
- existing customer lookup;
- limited customer credit.

## Queue/draft only

Potential:

- staff permission changes;
- business configuration;
- large write-offs;
- bulk import;
- global inventory corrections without allocation;
- new device registration;
- security-sensitive admin.

## Online required

Potential:

- password reset/invitation;
- acquiring new grants;
- global conflict resolution;
- hosted backup verification;
- provider-specific confirmations.

This matrix must be explicit per command.

---

# 16. Crash and power-loss recovery

Startup sequence:

```text
load app shell
↓
open IndexedDB
↓
validate local schema
↓
restore device identity
↓
restore last actor context
↓
load pending commands
↓
load local projections
↓
restore drafts
↓
restore print queue
↓
render cached workspace
↓
attempt session refresh
↓
sync queued work
↓
pull cloud changes
↓
surface conflicts
```

A sale should never disappear because the browser was closed after payment.

---

# 17. Command architecture

Create a typed command registry.

Example:

```ts
defineCommand({
  name: 'inventory.adjust',
  permission: 'inventory.adjust',
  offlinePolicy: 'GRANT_REQUIRED',
  targets: ['stockItems'],
  schema,
  projector,
  conflictPolicy
})
```

This should become the source for:

- client validation;
- offline behavior;
- permission-aware UI;
- telemetry;
- test generation;
- documentation;
- operation manifest.

This solves current status-document drift.

---

# 18. Inventory — reuse and extend

Current inventory is already substantial.

Retain:

- stock masters;
- locations;
- counts;
- scanner drafts in native reference;
- receiving;
- transfers;
- waste;
- movement ledger;
- opening balance;
- barcode rules.

## Add Admin Direct Adjustment

Create production command:

```text
inventory.adjust
```

UX:

```text
Item
Location
Current quantity
Adjustment:
  + quantity
  - quantity
  or new counted quantity
Reason category
Reason
Reference
Attachment/evidence
```

Never directly mutate a quantity record.

Transaction creates:

```text
stock movement
before
delta
after
cost impact
journal effect if applicable
audit
actor/device
```

## Adjustment approval

Policy:

```text
small correction
→ permission sufficient

large value adjustment
→ manager approval

negative result
→ block or approval depending business policy
```

---

# 19. Catalog

Keep current product/variant/family work.

Normalize around:

```text
Product
Variant
SKU
Barcode
Sale price
Tax
Category
Route
Stock link
Sale unit
Scan quantity
Portion/recipe
Preferred supplier
Reorder threshold
Availability
```

Add bulk editor.

---

# 20. Import Center — build on migration 020

Current web Administration can stage CSV.

Current SQL records staged batches.

The production rebuild should complete the actual controlled pipeline:

```text
Upload
↓
Parse
↓
Map
↓
Validate
↓
Resolve references
↓
Duplicate strategy
↓
Dry run
↓
Impact report
↓
Approval
↓
Apply
↓
Completion report
```

## Templates already worth preserving

```text
business
products
inventory
customers
suppliers
employees
outlets
stock locations
room types
rooms
rate plans
asset categories
assets
hotel services
```

## Import behavior options

```text
CREATE_ONLY
UPSERT_BY_EXTERNAL_ID
UPDATE_BY_SKU
UPDATE_BY_BARCODE
SKIP_DUPLICATES
FAIL_ON_DUPLICATE
```

No silent guessing.

---

# 21. Export Center — build on existing CSV export

Current Administration already exports selected collections to CSV.

Turn that into a full first-class module.

## Export types

```text
Products
Inventory
Stock movements
Customers
Suppliers
Orders
Payments
Receipts
Refunds
Customer credit
M-Pesa
Purchase orders
Goods receipts
Supplier invoices/payments
Expenses
Journals
Rooms
Reservations
Stays
Folios
Assets
Maintenance
Staff activity
Audit
```

## Filter support

```text
date range
status
location
staff
customer
supplier
tender
category
```

## Business archive

Add:

```text
Export Business Archive
```

Manifest:

```text
business ID
schema version
export version
generated timestamp
record counts
checksums
included collections
```

Eventually usable for verified restore/migration.

---

# 22. Procurement

Current v2 procurement already has useful advanced behavior:

- STOCK / EXPENSE / ASSET line classification;
- receiving;
- accepted/rejected quantities;
- inventory/journal effects;
- payables;
- invoice matching;
- supplier payment;
- over-receive approval.

Keep this intact.

UI rebuild should focus on:

```text
PO list
PO builder
Receive delivery
Exceptions
Invoices
Payables
Payments
Supplier history
```

---

# 23. Dedicated Expenses module

This remains a genuine major gap.

Current repository can recognize expense-classified procurement and maintenance expense journals, but there is no complete daily business-expense product workflow in the staged web app.

Build:

```text
Expenses
```

## Expense data

```text
id
date
category
vendor/payee
description
subtotal
tax
total
payment account
payment method
external reference
evidence
business purpose
outlet/department
linked supplier
linked asset
linked room
linked PO/invoice
status
actor
approver
```

## Lifecycle

```text
DRAFT
SUBMITTED
APPROVED
PAID
VOIDED
```

## Simple mode

For small businesses:

```text
Record Expense
```

creates approved/paid expense in one guarded operation.

## Recurring expense templates

Examples:

```text
rent
internet
security
subscription
cleaning
```

Recurring schedules create expected items, not fake paid transactions.

---

# 24. Accounting — build on existing journals

Current domains already emit many journal entries.

Do not replace that foundation.

Create a coherent accounting domain around it.

## Core

```text
Chart of Accounts
Journal Entries
Journal Lines
Fiscal periods
Payment Accounts
AR
AP
Inventory Asset
COGS
Revenue
Tax Liability
Customer Deposits
M-Pesa Clearing
Card Clearing
Expenses
Fixed Assets / Asset Clearing
```

## Automatic journal sources

```text
sale
refund
customer credit
credit settlement
stock receipt
inventory depletion
waste
inventory adjustment
supplier invoice
supplier payment
expense
asset acquisition
maintenance
folio charge
deposit
folio settlement
```

Posted journals remain immutable.

Corrections use reversal.

---

# 25. Accounting UI

Top-level:

```text
Accounting Overview
Journal
Chart of Accounts
Accounts Receivable
Accounts Payable
Payment Accounts
Reconciliation
Periods
```

Managers do not need to see raw debits/credits for ordinary workflows, but accountants must be able to trace every number.

---

# 26. Reports — new report domain, not collection export

Current reporting consists of:

- close-day snapshots;
- selected collection CSV exports;
- prototype/legacy reporting components.

Build a proper reporting layer.

## Report architecture

```text
Report Definition
        ↓
Server-side query / materialized computation
        ↓
Result schema
        ↓
filters
        ↓
table/chart
        ↓
drill-down
        ↓
CSV/print
```

Critical reports must not rely solely on client-side reduction of the currently cached snapshot.

---

# 27. Required reports

## Sales

```text
Sales summary
Daily
Hourly
By product
By category
By staff
Average ticket
Tender mix
Discounts
Comps
Voids
Refunds
Tax
```

## Inventory

```text
On hand
Valuation
Low stock
Stockout
Movement
Count variance
Waste
Transfers
Receiving
Adjustments
Slow-moving
```

## Procurement

```text
PO status
Goods received
Rejected goods
Supplier spend
Price variance
Supplier invoices
AP aging
Supplier payments
```

## Finance/accounting

```text
Expenses
Expense by category
Expense by vendor
P&L
Trial balance
Balance sheet
Cash flow
General ledger
AR aging
AP aging
Payment account reconciliation
```

## Hospitality

```text
Occupancy
Arrivals
Departures
Room revenue
Average daily rate
Length of stay
Folio balances
Housekeeping
Room status history
```

## Assets

```text
Asset register
Acquisition
Custody
Maintenance
Downtime
Disposal
```

## Controls

```text
Refunds
Inventory adjustments
Approvals
M-Pesa exceptions
Credit exceptions
Cash variances
Permission changes
```

## System

```text
Sync health
Pending commands
Conflicts
Device state
Backup evidence
Print failures
```

---

# 28. Finance UX consolidation

Today finance-related responsibilities are spread across:

```text
Finance
Finance Controls
Refunds
Administration reports
Guest Accounts
Procurement
```

That is valid at domain level but fragmented at management level.

Create a Finance landing workspace linking to:

```text
Today
Close Day
Reconciliation
Customer Accounts
Supplier Accounts
Expenses
Accounting
Reports
```

Role-specific shortcuts prevent overwhelming cashiers.

---

# 29. POS migration

Use current `WebPosView` behavior as starting point.

Preserve current implemented logic where server contracts are valid:

```text
sale
fire
tender
split
refund
reverse
credit charge
room charge
transfer
merge
discount
comp
scanner
receipt
```

Refactor the UI, not the domain.

Add automated parity tests so the operation manifest cannot become stale again.

---

# 30. Hospitality

Preserve the existing separated workspaces:

```text
Front Desk
Guest Accounts
Housekeeping
Rooms & Rates
```

Do not collapse them back into one technical Rooms page.

## Front Desk

Focus:

```text
arrivals
departures
in-house
reservation search
walk-in
check-in
move room
checkout
```

## Guest Accounts

Focus:

```text
folio
deposit
service posting
accommodation
settlement
room charge
history
```

## Housekeeping

Focus:

```text
dirty
cleaning
inspection
clean
out of order
blocked
maintenance
```

## Rooms & Rates

Focus:

```text
room types
rooms
nightly rate
room stay policy
checkout/cutoff
reservation configuration
```

Use the latest one-rate stay policy as the current default unless requirements change deliberately.

---

# 31. Assets and maintenance

Current Assets domain is strong but the web surface is thinner than the backend.

Build full UI around:

```text
Asset register
Asset profile
Tag/serial
Custody
Room/location
Inspection
Maintenance
Parts used
Supplier service cost
Acquisition
Commissioning
Retirement/disposal
```

Procurement ASSET lines must continue to avoid double-creating stock.

---

# 32. Staff/device/security administration

Retain existing:

```text
staff profiles
role ceilings
permissions
device registration
device revoke
manager approvals
Auth lifecycle edge function
```

Improve:

- custom permission editor;
- role templates;
- shared terminal/operator model;
- re-auth for sensitive actions;
- local sensitive-payload handling;
- audit view;
- approval inbox/history.

---

# 33. Help Center redesign

The existing Help implementation is functional but still resembles a document viewer.

New Help home:

```text
HELP & TRAINING

[ Search anything... ]

Continue
Your training
Recommended for your role
Quick fixes
Browse by workspace
System status
```

## Search should understand

```text
refund
stock wrong
printer
M-Pesa missing
room dirty
cash variance
barcode not found
guest checkout
```

Use the generated Markdown index as content authority.

---

# 34. Contextual Help Drawer

Every route gets:

```text
?
```

The drawer receives:

```text
route ID
selected record type
permissions
online/offline state
```

It surfaces:

- relevant articles;
- related guide;
- common mistakes;
- troubleshooting;
- Open workspace / Show me actions.

---

# 35. Guided tour engine upgrade

Current web tour foundation should be upgraded, not replaced.

## Keep

- semantic anchor IDs;
- shared guide definitions;
- route steps;
- persisted progress;
- keyboard support.

## Add

- spotlight rectangle;
- auto-scroll;
- collision-aware card placement;
- ResizeObserver;
- MutationObserver;
- `target-only` click-through mode;
- practice actions;
- success-operation matching;
- related Help article;
- guide recommendations;
- module-specific tours.

---

# 36. Operational practice guides

Create:

```text
ServOS Basics
First Sale
M-Pesa Payment
Customer Credit
Room Charge
Receive Delivery
Count Stock
Adjust Inventory
Create PO
Settle Supplier
Front Desk Check-In
Guest Checkout
Housekeeping Turnaround
Record Expense
Close Day
Run a Report
Import Products
Export Records
```

A workflow guide completes on successful command acknowledgement/local commit according to its defined offline policy, not merely button click.

---

# 37. Administration redesign

Current `WebAdministrationView` already has useful pieces:

```text
Import
Reports export
Business settings
Health/readiness
Auth lifecycle
```

Break this monolith into proper pages while preserving underlying actions.

Target:

```text
Administration
  Business Settings
  Import Center
  Export Center
  Staff & Access
  Devices
  Health
  Backup & Recovery
  Audit
  Integrations
```

---

# 38. Settings separation

Current settings/master data responsibilities overlap.

Separate:

## Business Settings

```text
identity
tax
payment methods
M-Pesa metadata
receipt
till
room stay
inventory policy
accounting policy
```

## Device Settings

```text
printer
scanner
display
offline storage
device identity
```

## Personal

```text
theme
density
accessibility
language later
```

## Master Data

```text
customers
suppliers
room types
asset categories
payment accounts
hotel services
expense categories
```

---

# 39. Hardware architecture

A web-first ServOS can still support serious POS hardware.

## Scanner

Continue keyboard-wedge support directly in browser.

Create central scanner service.

## Printer

Two modes:

```text
Browser print
```

for universal compatibility.

And optional:

```text
ServOS Hardware Bridge
localhost
↓
RAW ESC/POS
↓
XP-80T
```

The bridge is not the application authority.

It only handles hardware commands.

## Print queue

Persist locally:

```text
receipt ID
copy type
printer profile
status
attempt count
last error
```

A print failure must never roll back a completed sale.

---

# 40. Bundle/performance cleanup

The current verified staged build has previously crossed the configured large-chunk warning.

The rebuild should implement:

```text
route-level lazy loading
module splitting
deferred charts
deferred Help search index
deferred admin modules
```

POS initial load should not include the whole accounting/reporting universe.

---

# 41. Data loading architecture

Avoid sending every authorized record for every route forever.

Current authorized snapshot architecture is correct for bootstrap, but scale requires projections.

Introduce query/read models:

```text
POS snapshot
Inventory snapshot
Front Desk snapshot
Accounting summary
Report query
```

Maintain secure permission-filtered reads.

IndexedDB may retain commonly needed operational data.

---

# 42. Conflict Center

Current command results already distinguish conflict/rejection.

Create a human-facing Conflict Center.

Examples:

```text
Stock changed while you were offline
Room was booked elsewhere
Customer credit limit changed
Record was edited by another manager
Device permission changed
Offline grant expired
```

Actions:

```text
Review
Refresh
Retry with latest data
Discard local attempt
Request manager action
```

Never silently overwrite transactional conflicts.

---

# 43. Activity/Sync Center

Upgrade current Activity tab.

Show:

```text
Synced
Waiting
Rejected
Conflict
Local draft
Offline committed
```

Hide raw command IDs by default.

Technical details remain expandable for support.

---

# 44. Repo-generated coverage system

Replace stale status tables with generated evidence.

Create scripts to compare:

```text
command registry
web handlers
SQL dispatchers
native handlers
permissions
tests
guides
```

Generate:

```text
docs/generated/OPERATION_COVERAGE.json
docs/generated/ROUTE_COVERAGE.json
docs/generated/GUIDE_COVERAGE.json
```

CI fails when a declared production command has no required coverage metadata.

---

# 45. Testing strategy

## Domain

Preserve Rust and PostgreSQL domain tests.

## Browser

Add real web-v2 browser cases for all migrated modules.

## IndexedDB

Test:

- browser reload;
- process restart simulation;
- response loss;
- duplicate response;
- cursor rollback;
- queue persistence;
- local transaction rollback.

## Offline

Test two devices with distinct grants.

## Concurrency

Test:

```text
same room
same stock
same credit account
same order
same PO
```

## UI

Add screenshot/visual regression tests for the shared design system.

Especially:

```text
Select
Combobox
Dialog
Drawer
Tables
POS
Inventory
Reports
Mobile navigation
```

This catches the current uneven-spacing/dropdown class of regressions.

---

# 46. Deployment staging

Use three environments.

```text
LOCAL
Disposable PostgreSQL

STAGING
Vercel Preview
Dedicated Supabase project

PRODUCTION
Current terminal + legacy authority
```

Do not apply experimental v2 migrations to production until cutover rehearsal passes.

---

# 47. Cutover plan

The current rule remains non-negotiable:

```text
legacy writer ON
+
v2 writer ON
=
forbidden
```

Cutover:

1. freeze production candidate;
2. stop trading;
3. backup SQLite;
4. backup Supabase;
5. drain legacy outbox;
6. reconcile terminal/cloud;
7. import authoritative v2 state/history;
8. verify accounting totals;
9. verify inventory;
10. verify receivables/payables;
11. verify rooms/folios;
12. register devices;
13. issue initial grants;
14. download authorized snapshots;
15. fence `servos_upload`;
16. enable server v2;
17. enable web-v2 frontend;
18. run controlled smoke transactions;
19. reopen trading.

Rollback must be rehearsed before step 15.

---

# 48. Revised implementation phases

The previous plan spent too much time re-listing modules already built.

The new sequence prioritizes architecture consolidation.

## Phase A — Snapshot and freeze

- Tag HEAD.
- Generate source inventory.
- Run full verification.
- Record current SQL hashes.
- Freeze migration 001–021 baseline.

## Phase B — Clean clone

- Create rebuild branch/repo.
- Exclude backup directories and `.bak` files.
- Preserve tests and migrations.
- Preserve current web-v2 files as reference.

## Phase C — Design system

- Build all UI primitives.
- Replace local field/button/select styles.
- Establish layout rules.
- Add visual regression tests.

## Phase D — Canonical shell

- One route registry.
- One permission-aware navigation source.
- Desktop/mobile shell.
- Context Help.
- Command palette.
- Fix hidden Finance Controls/Administration class of bugs permanently.

## Phase E — Platform extraction

Extract:

```text
BusinessStore
sync
session
device registration
auth
lifecycle
guidance
service worker
```

into stable platform modules.

## Phase F — Offline transaction engine

- local projections;
- grants;
- grant persistence;
- local command commit;
- reconciliation;
- conflict center;
- crash recovery.

This is the largest technical milestone.

## Phase G — Migrate existing business surfaces

Move existing web modules into new feature structure **without changing domain behavior**:

```text
POS
KDS
Catalog
Inventory
Procurement
Hospitality
Assets
Finance
Financial Controls
Staff
Administration
Help
```

## Phase H — Inventory Admin + Import/Export

- direct audited adjustment;
- full Import Center;
- full Export Center;
- Business Archive.

## Phase I — Expenses

Build dedicated expense lifecycle and UI.

## Phase J — Accounting

Build chart of accounts, ledger UI, periods, account mapping and reconciliation around existing journals.

## Phase K — Reporting

Build server-side report domain and Reports Center.

## Phase L — Guidance completion

- new Help home;
- contextual Help;
- spotlight;
- workflow tours;
- role recommendations;
- practice mode later.

## Phase M — Hardware bridge

- printer bridge;
- print queue;
- diagnostics;
- scanner diagnostics.

## Phase N — Multi-device torture acceptance

Two physical/browser clients.

Test:

- internet failure;
- power failure;
- race conditions;
- device revoke;
- expired grants;
- conflict resolution.

## Phase O — Migration rehearsal

Use a clone of real business state.

No live changes.

## Phase P — Production cutover

Only after signed acceptance.

---

# 49. First milestone to build now

## `SERVOS WEB CORE RC1`

Do **not** add another business module first.

Deliver:

```text
clean clone
shared design system
canonical route registry
new shell
extracted BusinessStore/sync
PWA install/update
offline status
Conflict Center
Activity Center
Help shell
guidance integration
```

Then migrate the existing:

```text
Catalog
+
Inventory
+
Admin Adjustment
+
Import
+
Export
+
Inventory Reports
+
Help
```

as the first complete vertical slice.

Why Inventory first?

Because it exercises:

- high-volume data;
- scanner input;
- CRUD;
- permissions;
- imports;
- exports;
- reports;
- audit;
- accounting effect;
- offline behavior;
- conflicts;
- Help;
- guidance;
- multi-device resource ownership.

If this slice works correctly, the new platform foundation is credible.

---

# 50. First vertical-slice acceptance scenario

1. Admin signs in.
2. Existing device opens its cached workspace.
3. Inventory snapshot loads.
4. Admin imports products.
5. Duplicate SKU/barcode validation runs.
6. Valid rows apply.
7. Inventory search uses normalized Combobox/filter UI.
8. Scanner finds an item.
9. Admin disconnects internet.
10. Valid offline grant exists.
11. Admin records a stock correction.
12. Command and local projection commit atomically.
13. Browser is closed.
14. Browser reopens while still offline.
15. Corrected quantity remains visible.
16. Audit status shows local/offline.
17. Internet returns.
18. Command syncs once.
19. Cloud accepts it.
20. Change feed confirms authoritative state.
21. Movement ledger shows before/delta/after.
22. Journal effect is balanced where applicable.
23. Inventory report includes adjustment.
24. CSV export includes it.
25. Help explains stock correction.
26. Guided workflow demonstrates it.
27. Another device receives the authoritative change.
28. No duplicate transaction occurs.

Pass this before moving to the next complex slice.

---

# 51. Definition of done

Every production feature must have:

1. route registration;
2. permission contract;
3. typed command/query;
4. server validation;
5. atomic transaction;
6. audit effects;
7. offline policy;
8. local projection rule where applicable;
9. conflict rule;
10. loading state;
11. empty state;
12. validation state;
13. error state;
14. responsive state;
15. shared design-system controls;
16. contextual Help;
17. guide anchor if useful;
18. domain tests;
19. browser tests;
20. export/report impact;
21. documentation;
22. evidence recorded.

A component existing does not mean the feature is complete.

---

# 52. Important corrections to the previous plan

The rebuild plan should now explicitly recognize:

### Already exists and should be reused

- IndexedDB `BusinessStore`.
- Ordered web sync engine.
- service-worker shell caching.
- authenticated web-v2 session path.
- lifecycle/readiness structures.
- staff welcome.
- web guidance progress.
- semantic guide anchors.
- Front Desk.
- Guest Accounts.
- Housekeeping.
- Financial Controls.
- customer credit on web POS.
- M-Pesa reconciliation web surface.
- POS room charge/transfer/merge/discount/comp source.
- Staff/device administration.
- Auth invite/reset edge-function path.
- Admin import staging.
- CSV record export.
- room-stay configuration.

### Still needs major work

- production web-v2 activation/cutover;
- real offline transactional finalization;
- signed offline grants;
- deterministic local projections;
- conflict-center UX;
- clean design system;
- navigation normalization;
- dedicated Expenses module;
- complete accounting product;
- server-side report system;
- full import dry-run/apply UX;
- comprehensive export/archive;
- hardware bridge;
- target-device acceptance;
- hosted Supabase/Vercel staging acceptance;
- real multi-device outage testing.

---

# 53. Target end state

```text
                         SERVOS CLOUD
                    Supabase / PostgreSQL
                 Shared transaction authority
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
     Command execution                   Read/change APIs
          │                                   │
          └─────────────────┬─────────────────┘
                            │
                        SERVOS PWA
                            │
                Durable IndexedDB Runtime
                            │
        ┌──────────────┬────┴─────┬──────────────┐
        │              │          │              │
      POS          Management   Reception       Stock
        │              │          │              │
       KDS          Accounting   Rooms        Purchasing
                            │
                   signed offline grants
                            │
               optional hardware bridge
                            │
              printer / specialist devices
```

All business modules share:

```text
one design system
one route registry
one permission model
one command model
one sync engine
one local store
one conflict model
one Help system
one guidance engine
one reporting framework
one accounting ledger
```

That is the actual rebuild target based on the repository as it exists now.

---

# 54. Preview Recovery Track - mandatory rebuild scope

This section expands the rebuild after a direct source audit of the legacy browser preview under:

```text
src/components/*
src/context/ServOSContext.tsx
src/types/servos.ts
src/types/restaurant.ts
```

and comparison against the current staged operational web application under:

```text
src/runtime/web/*
```

The repository's own `docs/BUSINESS_OPERATIONS_SPEC.md` explicitly requires ServOS to preserve the existing hospitality workflows for restaurant tables, seats, coursing, waitlist/reservations, kitchen/bar preparation, catalog recipes/portions/modifiers, pricing, inventory/yield, procurement, hotel, CRM/loyalty, events, staff/payroll, reconciliation, accounting, reports and approvals.

Therefore the legacy preview is not disposable visual history.

It is a **UX and workflow mine**.

The implementation rule is:

> Extract good interaction design and workflow composition from the preview. Do not extract fake authority, hard-coded sample data, simulated integrations, simulated payouts, simulated fiscal status, simulated role switching, or component-local business mutations.

---

# 55. Preview vs current web screen inventory

## 55.1 Screen-by-screen recovery matrix

| Preview surface | Current staged web-v2 equivalent | Current gap | Rebuild treatment | Priority |
|---|---|---|---|---|
| Command Centre | `Home / Start Here` | Current Home is task-first but lacks live operational overview, exception feed, KPIs and action launchpad | Rebuild as **Operations Overview** using real queries | P0 |
| Global Search | none | No cross-module search/command palette in current runtime | Extract keyboard search UX and reconnect to real records/routes | P0 |
| Universal Action Inbox | none | No unified cross-domain work queue | Rebuild as **Tasks & Approvals / Needs Attention** | P0 |
| POS & Tables | Web POS | Business operations substantially exist, but preview has richer floor/table/ticket composition and auxiliary flows | Reuse interaction patterns, not preview state | P0 |
| Floor Plan Studio | native floorplan only | No production web floor-plan designer | Extract canvas/inspector UX and use authoritative `floorplan.save` | P1 |
| Host & Reservations | none | Restaurant booking, waitlist and seating are absent from web runtime | Restore as **Reservations & Seating** | P1 |
| KDS Pass | Web KDS | Core KDS exists, preview includes all-day summary and richer pass composition | Merge useful display patterns into operational KDS | P1 |
| Hotel PMS shell | Front Desk + Guest Accounts + Housekeeping + Rooms | Current architecture is better separated, but preview contains useful cross-room navigation | Extract sub-workspace composition without recreating monolithic PMS | P1 |
| Reservation Tape Chart | no production web tape chart | Timeline room allocation UI is missing | Build real **Room Plan / Tape Chart** | P1 |
| Dedicated Check-In Wizard | current Front Desk actions | Current check-in is less guided | Extract multi-step review/wizard pattern | P1 |
| Housekeeping Board | Web Housekeeping | Domain exists, preview has stronger board/checklist UX | Upgrade current workspace | P1 |
| Maintenance Workspace | backend asset/maintenance domain; no dedicated web maintenance workspace | Work-order UI missing | Build **Maintenance** workspace from preview structure | P1 |
| Reports Centre | close-day + admin CSV export | No complete reporting workspace | Rebuild as query-backed **Reports** | P1 |
| Executive Analytics | none as a dedicated operational screen | No broad real-data management dashboard | Recover selected KPI/chart composition inside Reports/Overview | P1 |
| Tender Settlement | Finance + Financial Controls | Current finance controls exist, but expected-vs-counted tender settlement view is missing | Build **Shift Reconciliation** | P1 |
| Batch Prep Studio | none | Production/batch workflow absent | Build **Prep & Production** | P1 |
| Catalog Studio | Web Catalog | Current operational catalog is narrower | Recover portions, recipes, pricing-rule and product-inspector UX | P1 |
| Inventory & Yield | Web Inventory | Core inventory exists, preview adds forecasting, yield, requisition and movement analysis | Add those real-data subviews | P1 |
| Store Requisition | transfer exists, no requisition workflow UI | Request/approval handoff absent | Add **Stock Requisition** if domain command is implemented | P1/P2 |
| Procurement & AP | Web Procurement | Current transaction domain is stronger, preview has useful 3-way-match/AP-aging presentation | Extract those views | P1 |
| Accounting & eTIMS | no complete accounting workspace | Journals exist in domains, but no full GL/P&L/account screen | Build **Accounting** from real journals | P1 |
| Control Engine | manager approvals exist but no unified screen | No anomaly/approval/evidence hub | Rebuild as **Controls & Audit** | P1 |
| Guest 360 & Loyalty | customer/master data + credit | No customer 360/loyalty/timeline workspace | Rebuild as **Customers** | P2 |
| Events & Nightlife | none | Ticket/promoter/event workflows absent | Rebuild as **Events** | P2 |
| Staff & HR Hub | Staff/Devices | Security admin exists, HR operations do not | Expand into **Staff Operations** and separate security administration | P2 |
| Settings Center | Settings + Administration | Current responsibilities are fragmented | Recover tabbed/settings composition, but use real v2 settings | P1 |
| Offline Queue Modal | Activity tab | Queue exists but current Activity is basic | Recover grouped/filterable queue UX as **Activity & Sync** | P0 |
| Edge Hardware Modal | basic current hardware information | Diagnostics are minimal | Recover inspector structure for real registered adapters | P2 |
| Guest QR Ordering | preview only | Explicitly excluded from current expansion contract | Preserve component as future reference only | Deferred |

---

# 56. Critical screens missing from current staged web-v2

The following are not cosmetic gaps. They represent documented workflows that exist in the old preview or accepted workflow specifications but do not currently have a production web runtime screen.

## 56.1 Operations Overview

Recover from:

```text
CommandCentreView
ExecutiveAnalyticsDashboard
UniversalInboxModal
```

Target user language:

```text
Home
Today's Operations
Needs Attention
Sales Today
Rooms Today
Stock Alerts
Open Tasks
Quick Actions
```

Do not use prototype copy such as:

```text
Executive Operations Center
Control Telemetry
AI Task Orchestrator
```

unless those terms are deliberately accepted later.

### Required sections

```text
Today's Sales
Open Orders
Open Till / Cash Position
Rooms Occupied / Arrivals / Departures
Low Stock / Stockout Risk
Pending Deliveries
Unpaid Supplier Items
Customer Credit Outstanding
M-Pesa Exceptions
Cash Variances
Maintenance Issues
Pending Approvals
Pending Sync / Conflicts
```

Every metric must have:

```text
real query source
business date/timezone
permission rule
drill-down destination
empty state
stale/offline state
```

The dashboard must never render static preview figures.

---

# 57. Global Search and Command Palette

Recover the UX concept from `GlobalSearchModal.tsx`.

Target shortcut:

```text
Ctrl/Cmd + K
```

Search real records across allowed domains:

```text
Products
Stock items
Orders
Receipts
Customers
Suppliers
Rooms
Reservations
Folios
Purchase orders
Invoices
Assets
Staff
Help
```

Result rows should show:

```text
record type
primary label
secondary context
status
matching field
destination
```

Examples:

```text
Jameson 750ml
Product
SKU JAM-750
Open product

Room 204
Room
Dirty - checkout completed 12:03
Open Housekeeping

INV-04482
Supplier invoice
East African Distillers
Open Accounts Payable
```

### Search must respect permissions

A user must never discover hidden record data through search.

### Search is not a generic database search

Create query adapters per domain.

---

# 58. Tasks & Approvals - recovered Universal Inbox

Recover the strongest UX concept from `UniversalInboxModal.tsx`, but use real events.

Rename:

```text
Universal Action Inbox
```

to:

```text
Tasks & Approvals
```

or:

```text
Needs Attention
```

Potential task categories:

```text
Cash variance
M-Pesa discrepancy
Customer credit discrepancy
Low stock
Stock count variance
Purchase approval
Over-receipt approval
Supplier invoice mismatch
Supplier invoice due
Room maintenance
Room turnaround
Housekeeping priority
Guest balance
Reservation conflict
Refund approval
Void approval
Discount/comp approval
Offline sync conflict
Device/security event
```

Each task has:

```text
id
category
severity
title
plain-language explanation
business context
createdAt
dueAt
record references
available actions
permission requirements
resolution state
resolvedBy
resolvedAt
```

No "Resolve All" for financially sensitive work.

Every sensitive task resolves through its actual domain command.

---

# 59. Restaurant service domain - Host & Reservations

The old preview contains a dedicated `HostStandView`.

The current web runtime does not contain a restaurant host/waitlist workspace.

The accepted workflow specification already defines:

```text
reservation.create
reservation.update
reservation.cancel
reservation.seat
waitlist.add
waitlist.update
waitlist.contact
waitlist.seat
```

Target product language:

```text
Reservations & Seating
```

not:

```text
Host Command
```

## 59.1 Screen layout to recover

Use the preview's three-part structure:

```text
Reservations / Waitlist queue
        +
Live floor availability
        +
Guest / booking detail
```

## 59.2 Required reservation flow

```text
New Reservation
↓
Guest name / contact
↓
Date/time
↓
Party size
↓
Area preference
↓
Notes / dietary information
↓
Deposit reference if applicable
↓
Save
↓
Arrived
↓
Assign table
↓
Seat
↓
Create/open order atomically
```

## 59.3 Waitlist flow

```text
Add to waitlist
↓
party/contact/size
↓
quoted wait
↓
contact attempt
↓
arrived
↓
seat at available table
```

Contact actions must record manual evidence unless an actual messaging integration exists.

## 59.4 Table claim

Seating must atomically claim:

```text
reservation/waitlist party
table
order
```

No React-only seat state.

---

# 60. Floor Plan Studio recovery

Recover the visual interaction model from:

```text
FloorPlanDesignerView.tsx
```

The preview already provides:

```text
section selector
preset table shapes
drag positioning
table inspector
capacity
shape
server zone
minimum spend
joinable flag
```

The native application already has an authoritative `floorplan.save`.

The web rebuild should reuse this same business contract.

## Required behavior

```text
Edit Layout
↓
make local visual changes
↓
review unsaved changes
↓
Save Layout
↓
send one versioned atomic command
```

Occupied table state must not be overwritten by layout editing.

---

# 61. POS UX recovery

Current `WebPosView` has substantially stronger real command coverage than older planning documents indicate.

Keep the current operational commands.

Recover selected layout and speed concepts from preview `POSView`.

## 61.1 Product browsing

Recover:

```text
category filters
search
favorites
recent items
large touch targets
portion selector
modifier selector
```

## 61.2 Ticket layout

Recover:

```text
product
portion
modifier
seat
course
quantity
line status
line amount
```

but use current authoritative order snapshots.

## 61.3 Fast operational actions

Target:

```text
Repeat Round
Transfer
Merge
Discount
Comp
Void
Split
Refund
Room Charge
Customer Account
Print
```

Buttons are shown only when eligible.

## 61.4 Seat and course support

The preview has useful:

```text
Seat 1
Seat 2
Shared
Drinks
Starters
Mains
Dessert
Held/Fired
```

Recover these only where current domain commands support them.

No UI-only course/seat mutation.

---

# 62. Guest QR ordering

`QROrderingGuestView.tsx` is visually reusable, but the accepted expansion contract explicitly keeps Guest QR as preview-only.

Therefore:

```text
DO NOT include Guest QR in core production scope.
```

Preserve it in a reference folder or Storybook-style design catalogue.

Future activation requires:

```text
guest session identity
menu publication
table/order binding
rate limiting
order review policy
payment policy
anti-abuse rules
offline behavior
KDS routing
audit
```

Until that exists, it remains an optional future channel.

---

# 63. KDS recovery

Current Web KDS remains the business foundation.

Recover from the preview:

```text
station-focused ticket columns
ticket age
all-day item totals
held-course visibility
ready/bump clarity
recall action
service urgency
```

Target operational language:

```text
Bar / Kitchen Pass
Preparing
Ready
Served
Recall
All-day totals
```

Avoid overloaded technical labels.

---

# 64. Room Plan / Tape Chart

The preview `HotelTapeChart.tsx` provides a useful horizontal room allocation concept that is not currently represented as a full production web screen.

Add:

```text
Room Plan
```

under Front Desk.

## View

Rows:

```text
rooms
```

Columns:

```text
calendar dates
```

Blocks:

```text
reservation
in-house stay
room block
maintenance block
turnaround
```

Click opens the actual reservation/stay/folio.

## Rules

The chart is a read/navigation surface first.

Drag-to-reschedule must not be enabled until a dedicated versioned reservation-move/update contract safely validates overlap and rate effects.

---

# 65. Check-In Wizard recovery

Extract the staged review experience from `DedicatedCheckInModal.tsx`.

Do not copy hardcoded:

```text
Room 312
KES 20k Deposit
RFID key paired
```

Target wizard:

```text
1 Guest
2 Reservation
3 Room readiness
4 Deposit / payment evidence
5 Stay summary
6 Confirm check-in
```

Optional configured steps:

```text
identity document reference
vehicle registration
special notes
key handover reference
```

A hardware key integration can only report success if a real registered integration confirms it.

---

# 66. Housekeeping board recovery

Current Web Housekeeping already has the correct business domain.

Recover from preview:

```text
status tabs
room queue
priority
assigned cleaner
elapsed turnaround time
mobile checklist
inspection action
```

Target screen:

```text
Housekeeping
```

with views:

```text
Needs cleaning
Cleaning
Ready for inspection
Clean
Blocked / out of order
```

Add clear mobile-first actions.

---

# 67. Maintenance workspace recovery

The backend assets/maintenance domain is stronger than the current web UI.

Recover `MaintenanceWorkspace.tsx` layout into a real screen.

Target:

```text
Maintenance
```

Required work-order flow:

```text
Report issue
↓
Assign
↓
Start work
↓
Record parts
↓
Record supplier service cost if any
↓
Complete
↓
Inspect / release room if linked
```

Current accepted commands include the lifecycle family:

```text
maintenance.report
maintenance.assign
maintenance.start
maintenance.complete
maintenance.cancel
```

Completion must preserve:

```text
stock part depletion
maintenance expense
supplier payable where applicable
asset/room history
audit
```

---

# 68. Reports Center recovery

The old Reports Center has valuable report composition but sample data.

Recover:

```text
metric header
date filters
trend chart
service SLA cards
menu/product matrix
drill-down table
CSV export
```

Do not recover static metrics.

Create report definitions backed by real queries.

## Restaurant/F&B reports recovered from preview

```text
Sales per cover
Average spend per cover
Table dwell time
Kitchen ticket time
Bar drink preparation time
Overdue tickets
Menu engineering
Product popularity vs margin
```

## Existing rebuild reports remain required

```text
Sales
Inventory
Procurement
Finance
Accounting
Hospitality
Assets
Controls
System health
```

---

# 69. Shift Reconciliation recovery

Recover the preview `TenderReconciliationView` as:

```text
Shift Reconciliation
```

Current Finance/Financial Controls provide pieces, but the single expected-vs-actual reconciliation workspace is missing.

## Required view

```text
Tender        Expected       Counted/Confirmed       Difference

Cash
M-Pesa
Card
Customer Credit
Room Charge
Other configured tender
```

The system must distinguish:

```text
ServOS recorded amount
operator-confirmed external evidence
provider-confirmed amount if an integration exists
```

No UI interaction equals provider confirmation.

## Close workflow

```text
Resolve open orders
↓
Review tenders
↓
Count cash
↓
Review M-Pesa
↓
Review card references
↓
Review discrepancies
↓
Enter reason / approval if required
↓
Close till
↓
Generate close-day report
```

---

# 70. Tips and service charge

The preview combines tender settlement and tip-pool concepts.

Do not automatically assume a tip distribution policy.

Create configurable policy support only after business rules exist.

Potential future domain:

```text
tipPool
tipAllocation
tipAdjustment
tipSettlement
```

Until implemented, show recorded tips but do not fabricate distribution or payroll effects.

---

# 71. Prep & Production - Batch Production recovery

`BatchProductionView.tsx` currently exists only in the preview.

The accepted workflow specification already defines:

```text
production.create
production.post
production.reverse
```

Target screen:

```text
Prep & Production
```

Examples:

```text
cocktail premix
sauce
marinade
dough/base
pre-portioned ingredient
```

## Production flow

```text
Choose recipe
↓
batch quantity
↓
review ingredient requirement
↓
choose source location
↓
record actual output
↓
record waste/yield variance
↓
Post Production
```

Posting atomically creates:

```text
input consumption
output stock
waste
actual yield
cost snapshot
production record
audit
journals where configured
```

Reverse by linked reversing movement, never deletion.

---

# 72. Products, recipes and pricing UX recovery

Current Catalog should absorb useful structures from `CatalogStudioView`.

Target sections:

```text
Products
Portions
Recipes
Pricing
Availability
```

## Product editor

Use ordinary language:

```text
Product name
SKU
Barcode
Selling price
Tax
Category
Preparation area
Stock item
Available at
```

## Portion editor

Examples:

```text
Single
Double
Glass
Bottle
Half
```

Show estimated yield where relevant.

## Recipe editor

```text
Ingredient
Quantity
Unit
Cost contribution
```

Show:

```text
estimated cost
selling price
estimated gross margin
```

These are informational calculations based on current cost snapshots, not immutable sale history.

## Pricing rules

Recover the price-book-rule UX concept.

Persist real rules:

```text
time window
product/category
outlet/service area
customer tier if implemented
fixed price
percentage adjustment
priority
effective dates
```

Every completed sale snapshots the applied rule.

---

# 73. Inventory & Yield recovery

Current Inventory should gain the strongest preview subviews.

## 73.1 Stock overview

```text
On hand
Available
Reorder threshold
Average cost
Value
Storage place
```

## 73.2 Low-stock forecasting

The repository already includes `src/utils/predictiveStock.ts`.

Move prediction to a tested domain/query layer before presenting it as authoritative.

Operational wording:

```text
Low-stock forecast
Estimated days remaining
Suggested reorder quantity
```

not:

```text
AI predictive algorithm
```

unless an actual model is introduced and documented.

## 73.3 Expected vs counted / yield

Recover the preview AvT concept as:

```text
Expected vs Counted
```

Show:

```text
opening
received
transfers in
transfers out
sales consumption
waste
adjustments
expected
counted
difference
estimated value impact
```

## 73.4 Stock movement history

Recover the preview ledger table.

Every row links to its source record.

## 73.5 Store requisition

Preview has `StockRequisitionModal`.

If implemented, separate:

```text
request
approval
dispatch
receipt
```

from direct manager transfers.

Do not simulate requisition workflow with a direct transfer command.

---

# 74. Procurement UX recovery

Current Web Procurement has stronger underlying controls than the preview.

Extract the preview presentation patterns:

```text
PO register
supplier summary
goods receipt
3-way match
invoice exception
AP aging buckets
supplier outstanding balance
```

Add clear drill downs:

```text
PO -> receipts -> supplier invoice -> payments
```

The UI should visually distinguish:

```text
STOCK
EXPENSE
ASSET
```

purchase lines.

---

# 75. Accounting workspace recovery

The preview `AccountingView.tsx` shows the desired information hierarchy but contains prototype fiscal claims.

Build a real Accounting workspace around actual posted journal data.

Sections:

```text
Overview
Chart of Accounts
Journal
General Ledger
Profit & Loss
Balance Sheet
Cash Flow
Accounts Receivable
Accounts Payable
Reconciliation
Periods
```

## Invariant banner

A useful preview pattern is the balanced/unbalanced status.

Recover as a real integrity check:

```text
Posted journal integrity
Balanced
```

with drill-down if a test/audit detects a problem.

## Tax/eTIMS wording

Do not copy:

```text
Certified KRA OSCU/VSCU Fiscalizer
VERIFIED
```

unless an actual configured integration confirms those statuses.

Use:

```text
Tax records
eTIMS integration status
Manual / Not configured / Confirmed by integration
```

---

# 76. Controls & Audit recovery

Recover `ControlEngineView` as:

```text
Controls & Audit
```

Sections:

```text
Exceptions
Approvals
Audit trail
Transaction trace
```

## 76.1 Exceptions

Real sources:

```text
cash variance
stock variance
M-Pesa discrepancy
customer credit discrepancy
supplier invoice mismatch
sync conflict
device/security issue
```

## 76.2 Approvals

Use existing scoped manager approvals.

Display:

```text
Requested action
Requested by
Target
Reason
Requested at
Approval expiry
Approve
Reject
```

The server remains authoritative.

## 76.3 Transaction trace

Recover the lifecycle-trace idea from preview.

Given:

```text
order
receipt
payment
stock movement
folio
PO
supplier invoice
journal
```

show linked evidence.

This is one of the strongest UX concepts in the preview and should become a real support/audit tool.

---

# 77. Customers - CRM 360 recovery

Current customer records and customer credit are not yet a complete Customer workspace.

Recover the useful structure from `CRM360View`.

Rename:

```text
Guest 360 & CRM Engine
```

to:

```text
Customers
```

Customer profile:

```text
Contact
Tags
Preferences
Notes
Recent visits
Orders
Stays
Reservations
Credit account
Current balance
Payment history
Lifetime spend
```

## Loyalty

The accepted workflow target includes:

```text
loyaltyRule.save
loyalty.earn
loyalty.redeem
loyalty.reverse
```

Add Loyalty only when these commands exist and are tested.

Do not use sample points.

Refunds must reverse source-linked rewards according to policy.

---

# 78. Events recovery

`EventsNightlifeView.tsx` is absent from the current web runtime.

The accepted workflow specification defines:

```text
event.save
event.publish
event.cancel
ticket.sell
ticket.refund
ticket.admit
promoter.save
commission.accrue
commission.pay
commission.reverse
```

Target modules:

```text
Events
Tickets & Door
Promoters
Commissions
```

## Event dashboard

```text
capacity
tickets sold
admitted
remaining
door sales
VIP/table allocation if configured
```

## Door mode

Scanner-first interface:

```text
scan ticket
↓
validate identity/status
↓
admit once
```

Offline admission is only available against assigned ticket rights.

## Promoters

Commission must derive from eligible settled sales.

A payout screen records manual payout evidence unless a real payment integration exists.

Never label clicking a button as "M-Pesa disbursed" without provider evidence.

---

# 79. Staff Operations recovery

The current Staff web module is mainly staff/security/device administration.

The preview contains a separate operational HR product that is missing.

Split:

```text
Staff Operations
```

from:

```text
Access & Devices
```

## Staff Operations sections

```text
Directory
Shifts
Attendance
Leave
Advances
Payroll
Tips if implemented
```

The accepted workflow specification defines:

```text
employee.save/deactivate
shift.save
shift.clockIn
shift.clockOut
leave.request
leave.approve
leave.reject
leave.cancel
advance.request
advance.approve
advance.pay
payroll.generate
payroll.approve
payroll.pay
payroll.reverse
```

## Payroll rule

Do not copy sample statutory numbers from the preview.

Payroll uses configured effective rules.

Approved payroll becomes immutable.

Payments require actual manual evidence/reference unless an integration exists.

---

# 80. Settings Center recovery

The preview Settings Center demonstrates a useful multi-section configuration structure.

Recover that structure into current Administration/Settings.

Target sections:

```text
Business
Outlets & service areas
Payments
Taxes
Receipts
Till
Rooms
Stock
Pricing
Accounting
Staff access
Devices
Offline & Sync
Backup & Recovery
Integrations
```

Do not expose internal storage names such as raw collection IDs.

Use normal terms:

```text
Storage Places
Payment Accounts
Service Areas
Room Stay Settings
```

---

# 81. Header and shell component recovery

The old preview Header and Sidebar contain valuable application-shell ideas.

## 81.1 Extract

```text
collapsible desktop navigation
business/outlet context
global search trigger
task/alert count
online/offline state
current staff identity
device state
mobile bottom navigation
```

## 81.2 Remove preview-only behavior

Do not copy:

```text
Admin / Manager / Server role switcher
```

Production uses the actual authenticated staff member.

Changing staff requires a real session/lock flow.

## 81.3 Mobile navigation

Do not render every module as a horizontally scrolling tab list.

Use:

```text
Home
Sell
Stock
Rooms
More
```

for operator-oriented access, with permission-aware `More`.

Managers can receive a different set.

---

# 82. Activity & Sync recovery

Current Activity should absorb the strongest parts of `OfflineQueueModal`.

Statuses:

```text
Saved locally
Waiting to send
Sending
Synchronized
Conflict
Rejected
Draft
```

Filter by:

```text
status
workspace
date
staff
```

Primary labels should describe the business action:

```text
Stock count - Main Store
Sale - Table 8
Reservation - Jane Wanjiku
```

not raw protocol names.

Raw command IDs remain under:

```text
Technical details
```

---

# 83. Reusable UI component extraction catalogue

The rebuild should not copy whole legacy files into the new application.

Extract patterns into a reusable system.

## Shell

```text
AppSidebar
MobileNav
PageHeader
BusinessContext
StaffMenu
ConnectivityStatus
SyncStatus
GlobalSearch
TaskInboxButton
```

## Data presentation

```text
MetricCard
MetricGrid
StatusBadge
OperationalCard
SummaryBar
DataTable
DataGrid
FilterBar
SearchField
EmptyState
ExceptionCard
Timeline
AuditTrail
RelationshipTrail
```

## Workspaces

```text
SplitPaneWorkspace
QueueDetailWorkspace
Board
TapeChart
FloorCanvas
TicketBoard
InspectorPanel
Wizard
StepReview
ReconciliationGrid
LedgerView
ReportCanvas
```

## Forms

```text
FormSection
FieldGrid
EntityCombobox
MoneyInput
QuantityInput
ReasonInput
ApprovalField
EvidenceField
DateRangePicker
```

## Overlays

```text
ActionDialog
RecordDrawer
ConfirmDialog
ApprovalDialog
QuickAdd
CommandPalette
ContextHelpDrawer
```

Each extracted component receives:

```text
loading
disabled
error
empty
mobile
keyboard
accessibility
permission
offline
```

states as appropriate.

---

# 84. Operational-language translation table

The preview's visual ambition is useful. Some terminology is not.

| Preview term | Production operational language |
|---|---|
| Command Centre | Home / Operations Overview |
| Executive Operations Center | Today's Operations |
| Critical Bottlenecks | Needs Attention |
| Universal Action Inbox | Tasks & Approvals |
| Executive Analytics | Reports / Performance |
| Control Engine | Controls & Audit |
| Guest 360 & CRM Engine | Customers |
| Host Stand & Floor Command | Reservations & Seating |
| Hotel PMS | Front Desk / Rooms / Guest Accounts |
| Facilities & Engineering | Maintenance |
| Catalog Studio | Products & Pricing |
| Batch Prep Studio | Prep & Production |
| Inventory & Yield Engine | Stock / Inventory |
| Tender Settlement | Shift Reconciliation |
| Accounting & eTIMS Engine | Accounting / Tax Records |
| Staff & HR Hub | Staff |
| Edge Peripherals | Devices |
| Predictive Stockout Algorithm | Low-stock forecast |
| Actual-vs-Theoretical | Expected vs Counted / Yield |
| North Star Traceability | Transaction Trace |
| AI Task Orchestrator | Tasks & Approvals |

These names should be validated in usability testing.

---

# 85. Preview concepts that must NOT be copied as business truth

## 85.1 Sample records

Do not migrate:

```text
sample guests
sample rooms
sample suppliers
sample employees
sample balances
sample tickets
sample dashboard numbers
```

## 85.2 Simulated role switching

Do not retain preview role toggles.

## 85.3 Fake integration status

Never claim:

```text
eTIMS verified
printer success
RFID key paired
M-Pesa disbursed
SMS sent
card settled
```

unless a real configured provider returns evidence.

## 85.4 Hard-coded financial/statutory policy

Do not retain preview tax or payroll defaults as production truth.

Policies must be configured and effective-dated.

## 85.5 UI-only mutations

No preview button is production merely because it updates React state or shows a toast.

Every mutation maps to:

```text
command
permission
validation
atomic effects
audit
offline policy
test
```

---

# 86. Expanded target route architecture

The route registry should now cover the full recovered product.

```text
START
  Home
  Tasks & Approvals
  Help

SELL & SERVE
  POS
  Reservations & Seating
  KDS

STOCK & PRODUCTION
  Products & Pricing
  Inventory
  Prep & Production
  Purchasing

HOSPITALITY
  Front Desk
  Room Plan
  Guest Accounts
  Housekeeping
  Rooms & Rates
  Maintenance

CUSTOMERS & EVENTS
  Customers
  Events

MONEY
  Finance
  Shift Reconciliation
  Expenses
  Accounting
  Reports
  Financial Controls

PEOPLE
  Staff Operations
  Access & Devices

BUSINESS
  Assets
  Master Data
  Administration

SYSTEM
  Activity & Sync
  Settings
```

Permission-filtering can hide whole groups.

This route list must be generated from the canonical route registry, never duplicated manually.

---

# 87. Expanded domain implementation coverage

The rebuild plan must explicitly include these previously underrepresented accepted workflow families.

## Restaurant reservations / waitlist

```text
reservation.create/update/cancel/seat
waitlist.add/update/contact/seat
```

## Production / prep batches

```text
production.create/post/reverse
```

## CRM / loyalty

```text
customer.save/archive
loyaltyRule.save
loyalty.earn/redeem/reverse
```

## Events

```text
event.save/publish/cancel
ticket.sell/refund/admit
promoter.save
commission.accrue/pay/reverse
```

## HR / payroll

```text
employee.save/deactivate
shift.save/clockIn/clockOut
leave.request/approve/reject/cancel
advance.request/approve/pay
payroll.generate/approve/pay/reverse
```

## Accounting

```text
account.save/archive
journal.saveDraft/post/reverse
expense.record/reverse
```

## Controls

```text
alert.acknowledge/resolve
approval.request/decide
```

These are existing accepted product families from the repository specifications, not speculative additions.

---

# 88. UI recovery implementation method

For every old preview component:

## Step 1 - classify

One of:

```text
EXTRACT_COMPONENT
EXTRACT_LAYOUT
EXTRACT_WORKFLOW
REFERENCE_ONLY
DELETE_FROM_NEW_APP
```

## Step 2 - remove fake state

Strip:

```text
INITIAL_*
sample constants
hardcoded balances
fake integration responses
toast-only mutations
```

## Step 3 - map to domain

Document:

```text
read model
commands
permissions
offline policy
approval
audit
```

## Step 4 - translate copy

Convert prototype/enterprise jargon to operational language.

## Step 5 - rebuild using shared primitives

No direct Tailwind-clone migration.

## Step 6 - test

Add:

```text
component
browser
domain
offline/concurrency where relevant
```

## Step 7 - retire old preview component

Only after feature parity is proven.

---

# 89. Preview Recovery Ledger

Create:

```text
docs/generated/PREVIEW_RECOVERY_LEDGER.json
```

Fields:

```json
{
  "previewFile": "src/components/host/HostStandView.tsx",
  "targetRoute": "reservations",
  "classification": "EXTRACT_WORKFLOW",
  "status": "PLANNED",
  "domainCommands": [],
  "querySources": [],
  "componentsRecovered": [],
  "tests": [],
  "notes": ""
}
```

Generate a human-readable Markdown version in CI.

This prevents useful preview workflows from disappearing during cleanup.

---

# 90. Expanded implementation sequence

The rebuild phases are amended as follows.

## Phase A - Freeze and inventory

Existing plan unchanged, plus:

- inventory every `src/components/*` preview screen;
- generate Preview Recovery Ledger;
- map each preview control to real, planned or reference-only status.

## Phase B - Clean clone

Preserve preview code in:

```text
legacy-preview-reference/
```

or a Git tag/branch.

Do not keep it in the production bundle.

## Phase C - Design system and extracted primitives

Build shared primitives and extract proven visual patterns.

## Phase D - Shell

Deliver:

```text
canonical route registry
sidebar
mobile nav
header
global search
Tasks & Approvals entry
business context
staff context
status indicators
```

## Phase E - Platform

Existing auth/sync/storage/lifecycle/guidance extraction.

## Phase F - Offline transaction engine

Existing plan unchanged.

## Phase G - Core operational migration

```text
POS
KDS
Products
Inventory
Procurement
Rooms
Front Desk
Guest Accounts
Housekeeping
Finance
Financial Controls
```

## Phase H - Preview recovery, operational tier 1

Build the highest-value missing preview workflows:

```text
Operations Overview
Tasks & Approvals
Global Search
Reservations & Seating
Floor Plan
Room Plan / Tape Chart
Maintenance
Shift Reconciliation
Prep & Production
Reports
Controls & Audit
Accounting shell
```

## Phase I - Inventory Admin / Import / Export

Existing plan, incorporating stock requisition and yield views.

## Phase J - Expenses + Accounting completion

Complete ledger/report integration.

## Phase K - Business growth recovery

```text
Customers / CRM
Loyalty
Events / Tickets / Promoters
Staff Operations
Payroll / Leave / Attendance / Advances
```

## Phase L - Guidance

Create guidance for every recovered route.

## Phase M - Hardware bridge

Existing plan.

## Phase N - Multi-device acceptance

Existing plan.

## Phase O - migration rehearsal

Existing plan.

## Phase P - production cutover

Existing plan.

Guest QR remains outside core release unless separately accepted.

---

# 91. Expanded first release milestone

`SERVOS WEB CORE RC1` should now include more of the preview's strongest cross-application UX.

Required:

```text
new shell
canonical route registry
design system
Global Search
Tasks & Approvals shell
Operations Overview shell
Activity & Sync
Context Help
guidance engine
BusinessStore/sync extraction
PWA update/install path
```

The dashboard and task inbox may initially expose only domains with real query sources.

Do not populate unimplemented categories with sample data.

---

# 92. Expanded second vertical slice

After Inventory proves the platform foundation, the next recommended vertical slice is:

```text
RESTAURANT SERVICE
```

Scope:

```text
Reservations & Seating
Waitlist
Floor Plan
POS table/order integration
KDS
Shift Reconciliation
Reports
Tasks & Approvals
Help
```

This reclaims one of the preview's largest missing operational areas while exercising shared reservations, tables, orders and manager controls.

---

# 93. Expanded third vertical slice

```text
HOSPITALITY OPERATIONS
```

Scope:

```text
Front Desk
Room Plan / Tape Chart
Check-In Wizard
Guest Accounts
Room Charge
Housekeeping Board
Maintenance
Rooms & Rates
Reports
Tasks & Approvals
Help
```

The current domain foundation makes this mostly a UX/read-model consolidation task rather than a fresh PMS rewrite.

---

# 94. Expanded fourth vertical slice

```text
FINANCE & CONTROL
```

Scope:

```text
Finance Home
Shift Reconciliation
M-Pesa Reconciliation
Customer Credit
Expenses
Accounting
Accounts Payable
Controls & Audit
Transaction Trace
Reports
```

This slice should make every financially important number traceable to source transactions.

---

# 95. Expanded fifth vertical slice

```text
BUSINESS RELATIONSHIPS & PEOPLE
```

Scope:

```text
Customers
Loyalty
Events
Tickets
Promoters
Staff Operations
Attendance
Leave
Advances
Payroll
```

Do not begin this slice until underlying command families and accounting/report impacts are designed.

---

# 96. Expanded acceptance requirement for recovered preview screens

A recovered preview screen is complete only when:

1. no sample business data is required;
2. every displayed live metric has a real source;
3. every action uses a real command or clearly says it is unavailable;
4. permission denial is enforced by the backend;
5. all financial/stock effects are atomic;
6. no fake provider confirmation exists;
7. offline behavior is explicitly classified;
8. reload/restart behavior is tested;
9. second-user visibility is tested where shared;
10. search/filter/loading/empty/error states exist;
11. mobile layout is accepted;
12. Help content exists;
13. guide anchors are present where useful;
14. report/export impact is documented;
15. preview recovery ledger is updated;
16. legacy preview code for that feature is removed from the production bundle.

---

# 97. Final product direction after preview recovery

The rebuilt ServOS should keep the current staged web-v2 transaction discipline **and** recover the old preview's product richness.

The target is not:

```text
a collection of CRUD tabs
```

and it is not:

```text
a beautiful simulated hospitality dashboard
```

It is:

```text
A task-first operational system
with deep hospitality workflows,
real financial and stock controls,
strong dashboard/search/task ergonomics,
offline resilience,
traceable accounting,
and a consistent reusable UI system.
```

The preview supplies many of the UX shapes.

The current v2 runtime supplies much of the transactional spine.

The rebuild joins those two halves into one production product.
