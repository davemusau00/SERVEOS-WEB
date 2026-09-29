# ServOS Web Rebuild Master Plan
## Local-First PWA + Cloud Transaction Authority + Unified Business Operations

**Target repository:** `davemusau00/servos-`  
**Strategy:** Clone the current repository into a clean rebuild branch/repository, preserve proven domain logic and tests, replace duplicated presentation/runtime glue with reusable web-first foundations, migrate safely, and only retire the installed-terminal architecture after parity and recovery acceptance.

---

# 1. Executive direction

ServOS should become a **fully web-based, installable local-first PWA** backed by Supabase/PostgreSQL, while remaining capable of operating through internet outages, browser restarts and sudden power loss.

The rebuild is **not a rewrite from zero**.

The current repository already contains valuable, tested business logic and operational concepts that should be extracted and reused:

- POS, tabs, tables, KDS and payments.
- Catalog, barcodes, product/stock relationships and pricing.
- Inventory counts, receipts, transfers, waste and movement ledgers.
- Procurement, PO/GRN/AP matching and supplier payments.
- Customer credit / Accounts Receivable.
- Manual M-Pesa reconciliation.
- Till open/close, cash movements and close-day snapshots.
- Rooms, reservations, stays, housekeeping and folios.
- Assets and maintenance.
- RBAC, staff, devices and approvals.
- Controlled imports and CSV templates.
- Business setup / intake.
- Offline queue concepts, command IDs, version checks and change-feed work.
- Help documentation and the existing guidance/tour model.
- Existing tests and acceptance documentation.

The rebuild should therefore follow this rule:

> **Preserve business rules, command contracts, migrations, tests and documentation where they are sound. Rebuild the shell, design system, web runtime, offline architecture and cross-module consistency around them.**

The end-state should feel like one coherent product, not a collection of screens built at different times.

---

# 2. Product goals

The rebuilt ServOS must satisfy all of the following.

## 2.1 Web-first

Primary deployment:

```text
https://app.servos...
        ↓
Installable PWA
        ↓
React application
        ↓
IndexedDB local business store
        ↓
Supabase/PostgreSQL authority
```

Tauri becomes optional rather than architectural.

Possible native helpers remain acceptable for hardware that browsers cannot reliably control:

- RAW ESC/POS printing.
- Cash drawer.
- Serial devices.
- Weighing scales.
- Specialized USB peripherals.

## 2.2 Local-first resilience

A business must be able to continue critical work during:

- internet outage;
- router failure;
- Supabase temporary outage;
- browser refresh;
- application update;
- unexpected browser close;
- sudden computer shutdown;
- brief power loss.

No successful financial transaction may exist only in React state.

## 2.3 One coherent business operating system

The product must integrate:

```text
Sales
Inventory
Procurement
Expenses
Accounting
Customers
Credit
Rooms
Folios
Assets
Staff
Reports
Imports
Exports
Help
Audit
System health
```

Records should not live as disconnected islands.

## 2.4 Production simplicity

A normal operator should not need to understand:

- database schemas;
- sync mechanics;
- command IDs;
- Supabase;
- journals;
- outboxes;
- migration versions.

The application should explain operational consequences in ordinary business language.

---

# 3. Rebuild strategy

Create a fresh branch or repository rather than incrementally repainting every current screen.

Suggested name:

```text
servos-web
```

or:

```text
servos-next
```

The current production-capable repository remains the reference implementation until cutover.

## 3.1 What to copy immediately

Copy or extract:

- TypeScript domain types.
- PostgreSQL v2 migrations and command handlers that pass acceptance tests.
- Stable SQL constraints.
- Permission strings and RBAC rules.
- Import templates.
- CSV parsing/mapping logic.
- Barcode validation rules.
- Receipt schemas and immutable receipt principles.
- Accounting/journal domain rules.
- Room/folio/asset command handlers.
- Test fixtures.
- Browser tests that express correct behavior.
- Native tests that define business invariants.
- Documentation articles.
- Guidance guide definitions after normalization.
- Existing reporting formulas that are already verified.

## 3.2 What should not be copied blindly

Do not preserve accidental structure merely because it works.

Refactor or replace:

- repeated Tailwind class constants in every view;
- duplicated modal implementations;
- repeated table/card layouts;
- raw/native selects scattered across screens;
- ad-hoc form validation;
- page-specific notification systems;
- modules directly reading arbitrary record arrays;
- broad `Record<string, unknown>` payload handling at UI boundaries;
- duplicate native/web presentation components;
- legacy snapshot upload code in the new authority path;
- desktop-only assumptions;
- direct browser-to-table writes;
- hard-coded business labels that should be configurable.

---

# 4. Proposed repository structure

```text
src/
  app/
    AppShell.tsx
    routes.tsx
    providers.tsx

  design-system/
    tokens/
    components/
      Button/
      IconButton/
      Input/
      Textarea/
      Select/
      Combobox/
      Checkbox/
      Radio/
      Switch/
      DatePicker/
      MoneyInput/
      QuantityInput/
      FormField/
      Card/
      Panel/
      Metric/
      Badge/
      Table/
      DataGrid/
      EmptyState/
      Skeleton/
      Alert/
      Toast/
      Dialog/
      Drawer/
      Sheet/
      Popover/
      DropdownMenu/
      Tabs/
      Breadcrumbs/
      Pagination/
      CommandPalette/
      SearchInput/
      FilterBar/
      PageHeader/
      Toolbar/
      ConfirmDialog/
      DestructiveActionDialog/
      PermissionGate/
      SyncBadge/
      OfflineBanner/

  domain/
    catalog/
    inventory/
    procurement/
    sales/
    payments/
    customers/
    credit/
    expenses/
    accounting/
    reports/
    rooms/
    folios/
    housekeeping/
    assets/
    staff/
    approvals/
    business/
    imports/
    exports/
    audit/

  data/
    commands/
    queries/
    repositories/
    schemas/
    sync/
    offline/
    cache/

  guidance/
    engine/
    definitions/
    anchors/
    help/
    persistence/

  hardware/
    scanner/
    printer/
    bridge/

  features/
    dashboard/
    pos/
    kds/
    catalog/
    inventory/
    procurement/
    expenses/
    accounting/
    reports/
    rooms/
    guests/
    assets/
    staff/
    administration/
    help/
    settings/

  lib/
    money/
    dates/
    csv/
    permissions/
    validation/
    telemetry/
```

Supabase:

```text
supabase/
  migrations/
  functions/
  tests/
  seeds/
```

The critical architectural rule:

```text
UI
 ↓
typed domain service
 ↓
command/query layer
 ↓
local transaction + outbox
 ↓
cloud command authority
```

A React component should never construct an arbitrary database mutation.

---

# 5. Design system and UI/UX normalization

This is Phase 1, not polish.

## 5.1 Establish tokens

Define one spacing scale.

Example:

```text
4  8  12  16  20  24  32  40  48
```

Define:

- page maximum widths;
- sidebar width;
- mobile gutter;
- card radius;
- modal radius;
- control height;
- typography scale;
- icon sizes;
- border colors;
- focus-ring treatment;
- disabled opacity;
- success/warning/error/info states;
- shadows;
- elevation rules.

No module invents its own spacing.

## 5.2 Replace strange dropdowns

Current native `<select>` controls should be normalized.

Use a shared accessible Select/Combobox implementation.

Recommended approach:

- Radix UI primitives or equivalent accessible headless primitives.
- Custom ServOS styling.
- Portal-based menu rendering.
- Keyboard navigation.
- Proper viewport collision handling.
- Searchable Combobox for long lists.
- Mobile drawer/sheet alternative for large selection lists.

Standard behaviors:

```text
Short enum list
→ Select

Customers/products/suppliers/rooms
→ searchable Combobox

Action menu
→ DropdownMenu

Multi-selection
→ searchable MultiSelect
```

No browser-default select styling should appear in important workflows.

## 5.3 Normalize forms

Every field uses:

```text
label
optional/required indicator
input
description
validation message
```

Standardize:

- currency fields;
- quantities;
- percentages;
- dates;
- date-time;
- phone;
- email;
- barcode;
- SKU;
- transaction reference;
- tax code.

Money must be displayed in major units while stored in minor units.

## 5.4 Normalize page anatomy

Every workspace:

```text
Page header
 ├ title
 ├ description
 ├ primary action
 └ secondary actions

Optional metrics

Filter/search toolbar

Main content

Pagination / summary

Contextual help
```

## 5.5 Normalize cards and tables

Tables must share:

- row heights;
- header styles;
- hover states;
- empty states;
- loading states;
- column alignment;
- money alignment;
- action menus;
- mobile fallback.

Numeric columns right-align.

Record identity stays left-aligned.

## 5.6 Responsive rules

Three intentional modes:

```text
Desktop manager
Tablet operator
Small-screen supervisor
```

POS can have a dedicated terminal layout.

Management screens should not simply squeeze desktop tables onto phones.

## 5.7 Accessibility

Required:

- visible keyboard focus;
- escape closes modal;
- focus returns to invoking control;
- dialogs trap focus;
- proper labels;
- reduced-motion support;
- no color-only meaning;
- minimum touch target;
- semantic headings;
- screen reader status for sync/error/success.

---

# 6. Application shell

Create a single web shell.

## Desktop

```text
Sidebar
Top context bar
Main workspace
Global command/search
Sync/offline status
Help
User/account menu
```

## Mobile

```text
Top bar
Workspace content
Bottom primary navigation
More sheet
```

## Global status bar

Always make operational state understandable:

```text
ONLINE · Synced

OFFLINE · 7 changes saved locally

SYNCING · 3 of 7

ATTENTION · 1 conflict requires manager review
```

Never use frightening developer language for normal offline operation.

---

# 7. PWA and offline foundation

## 7.1 Service Worker

Cache:

- application shell;
- fonts;
- icons;
- static assets;
- generated help index;
- essential reference metadata.

Support controlled application updates.

Do not activate a new application version while a payment dialog or critical transaction is mid-flight.

## 7.2 IndexedDB business store

Persist:

- authorized record snapshot;
- record versions;
- command outbox;
- acknowledgements;
- drafts;
- current device;
- current actor;
- policy version;
- change-feed cursor;
- guidance progress;
- pending print jobs;
- last known system health state;
- offline grants;
- reconciliation metadata.

## 7.3 Atomic local transaction rule

Critical operations:

```text
construct command
↓
validate
↓
persist command + local projection atomically
↓
commit
↓
show success
```

Never show "Sale complete" before durable local persistence succeeds.

## 7.4 Idempotency

Every command receives:

- command ID;
- actor ID;
- device ID;
- business ID;
- client sequence;
- created-at timestamp;
- baselines/version expectations.

Server execution must be idempotent.

Retrying the same sale must never create two sales.

## 7.5 Change feed

The browser pulls ordered changes.

Requirements:

- monotonically increasing sequence;
- gap detection;
- cursor persistence;
- version monotonicity;
- replay safety.

## 7.6 Conflicts

Do not silently last-write-win money, stock, rooms or permissions.

Conflict classes:

```text
STALE_VERSION
RESOURCE_EXHAUSTED
ALLOCATION_EXPIRED
ALREADY_CONSUMED
PERMISSION_CHANGED
DEVICE_REVOKED
BUSINESS_POLICY_CHANGED
```

Provide plain-language resolution UI.

---

# 8. Offline grants

Disconnected multi-device trading requires controlled authority.

Possible allocations:

- stock quantity;
- till/cash session;
- room set;
- order/table ownership;
- document number range;
- limited discount/refund ceiling.

Grant fields:

```text
grantId
businessId
deviceId
actorId
resourceType
resourceId
limit
consumed
issuedAt
expiresAt
signature
policyVersion
```

The client may only finalize offline transactions inside valid grants.

When a grant is exhausted, ServOS blocks only that affected action rather than pretending the shared resource still exists.

---

# 9. Core business dashboard

The Home screen should become a true operating dashboard.

## Today's business

- gross sales;
- net sales;
- transactions;
- average ticket;
- cash;
- M-Pesa;
- card;
- outstanding customer credit;
- refunds;
- discounts;
- expenses;
- gross profit estimate.

## Operations

- open orders/tabs;
- low stock;
- stockouts;
- deliveries expected;
- unpaid supplier invoices;
- unreconciled M-Pesa;
- open rooms;
- arrivals;
- departures;
- rooms needing cleaning;
- maintenance issues.

## System

- online/offline;
- pending sync;
- last successful sync;
- failed commands;
- backup health;
- device state;
- printer state when detectable.

Dashboard cards should deep-link to filtered workspaces.

---

# 10. POS

Preserve existing stable domain rules.

Rebuild presentation around:

- product search;
- barcode scan;
- category shortcuts;
- favorites;
- modifier/portion selection;
- order/ticket panel;
- tab/table/customer/room destination;
- discounts/comps;
- hold/fire;
- tender;
- mixed tender;
- customer credit;
- room folio charge;
- receipt;
- reprint.

Offline:

- cash;
- allocated stock;
- existing customer/account snapshot;
- local receipt;
- queued cloud reconciliation.

Non-cash flows clearly distinguish:

```text
Recorded
Manually confirmed
Provider reconciled
```

---

# 11. Inventory

Inventory becomes a first-class management workspace.

## Views

- Current stock.
- By stock location.
- Product/stock-item relationship.
- Movement history.
- Stock count.
- Receive stock.
- Transfers.
- Waste.
- Adjustments.
- Reorder.
- Barcode management.
- Valuation.

## Admin direct inventory modification

Provide direct management in the UI, but **never update quantity fields directly in the database**.

Admin action:

```text
Adjust inventory
```

opens:

```text
Item
Location
Current quantity
New quantity OR adjustment quantity
Reason
Reason category
Reference
Notes
Evidence attachment optional
```

Server records:

```text
inventory adjustment transaction
movement ledger
before quantity
delta
after quantity
cost impact
journal impact if applicable
actor
device
timestamp
reason
approval where required
```

Recommended permissions:

```text
inventory.view
inventory.count
inventory.receive
inventory.transfer
inventory.waste
inventory.adjust
inventory.adjust.large
```

Large or negative adjustments can require manager approval.

---

# 12. Catalog and product administration

Product admin must support:

- product families;
- variants;
- SKU;
- barcode(s);
- selling unit;
- stock unit;
- scan-unit quantity;
- category;
- route/station;
- prices;
- tax class;
- cost;
- recipe/component usage;
- active/inactive;
- image optional;
- reorder level;
- preferred supplier;
- modifiers;
- portions;
- service availability.

Bulk edit:

- category;
- price;
- tax;
- route;
- active state;
- supplier;
- reorder threshold.

---

# 13. Import Center

Preserve the existing controlled staging idea and improve the UX.

## Import sources

- CSV upload.
- TSV.
- Excel copy/paste.
- Future XLSX parser.
- Template download.

## Templates

At minimum:

- business;
- products;
- inventory;
- customers;
- suppliers;
- employees;
- outlets/service areas;
- stock locations;
- room types;
- rooms;
- rate plans;
- asset categories;
- assets;
- hotel services.

## Flow

```text
Choose import
↓
Upload / paste
↓
Detect columns
↓
Map fields
↓
Validate
↓
Preview
↓
Duplicate analysis
↓
Dry run
↓
Impact summary
↓
Authorization
↓
Apply
↓
Completion report
```

## Duplicate strategies

Per import type:

```text
Create only
Update by SKU
Update by barcode
Update by external ID
Skip duplicates
Fail on duplicates
```

Never guess silently.

## Import result

Show:

- rows read;
- created;
- updated;
- skipped;
- rejected;
- warnings;
- downloadable error CSV.

---

# 14. Export Center

ServOS must allow a business to retrieve its own data.

## Record exports

CSV:

- products;
- stock;
- movements;
- customers;
- suppliers;
- orders;
- payments;
- receipts;
- expenses;
- purchase orders;
- goods receipts;
- supplier invoices;
- customer credit;
- rooms;
- bookings;
- folios;
- assets;
- staff activity;
- audit records where permitted.

Filters:

- date range;
- status;
- location;
- user;
- category;
- tender;
- supplier/customer.

## Full business archive

Admin action:

```text
Export Business Archive
```

Produces a versioned archive manifest with:

- business configuration;
- master data;
- operational records;
- accounting records;
- receipt documents;
- audit metadata;
- export timestamp;
- schema version;
- checksums.

This is not necessarily a restoration format on day one, but should become one.

## Report exports

Reports support:

- CSV;
- printer-friendly HTML;
- PDF later;
- scheduled email later.

---

# 15. Business expenses

Create a proper Expenses module rather than treating paid-out till movements as the entire expense system.

## Expense record

```text
expenseId
date
expenseCategory
vendor/payee
description
subtotal
tax
total
paymentAccount
paymentMethod
reference
receipt/evidence
businessPurpose
linkedAssetId?
linkedPurchaseOrderId?
linkedSupplierInvoiceId?
linkedRoom?
linkedDepartment/serviceArea?
status
createdBy
approvedBy
```

## Expense categories

Configurable hierarchy.

Examples:

- utilities;
- rent;
- wages;
- transport;
- repairs;
- maintenance;
- marketing;
- cleaning;
- subscriptions;
- licenses;
- professional services;
- petty cash;
- staff meals;
- miscellaneous.

## Expense lifecycle

```text
Draft
Submitted
Approved
Paid
Voided
```

Small businesses can configure a simplified mode:

```text
Record & Pay
```

while still producing proper accounting effects.

## Recurring expenses

Support templates:

- rent;
- internet;
- subscriptions;
- security;
- recurring service contracts.

Create reminders/expected expense entries without automatically asserting payment.

## Evidence

Attach:

- photo;
- PDF;
- receipt number;
- supplier invoice;
- note.

---

# 16. Accounting foundation

ServOS should use a lightweight but real double-entry core.

## Core records

- chart of accounts;
- journal entries;
- journal lines;
- fiscal periods;
- payment accounts;
- Accounts Receivable;
- Accounts Payable;
- expense categories mapped to accounts;
- inventory asset;
- COGS;
- tax liability;
- cash;
- M-Pesa clearing;
- card clearing;
- sales revenue;
- discounts;
- refunds;
- customer deposits;
- supplier liabilities.

## Automatic journals

Business workflows create journals automatically.

Example cash sale:

```text
Dr Cash
Cr Sales
Cr Tax payable
```

Inventory cost:

```text
Dr Cost of Goods Sold
Cr Inventory
```

Supplier GRN/invoice:

```text
Dr Inventory / Expense / Asset
Cr Accounts Payable
```

Supplier payment:

```text
Dr Accounts Payable
Cr Cash/Bank/M-Pesa
```

Expense:

```text
Dr Expense account
Cr Cash/Bank/M-Pesa/AP
```

Customer credit sale:

```text
Dr Accounts Receivable
Cr Sales
Cr Tax payable
```

Settlement:

```text
Dr Cash/M-Pesa/Card
Cr Accounts Receivable
```

## Journal safety

Posted journals:

- immutable;
- corrected through reversal/adjustment;
- linked to source transaction;
- balanced by server constraint.

No UI "edit journal amount" button after posting.

---

# 17. Accounting workspace

Sections:

```text
Overview
Expenses
Accounts Receivable
Accounts Payable
Payment Accounts
Reconciliation
Journal
Chart of Accounts
Periods
```

## Accounting overview

Cards:

- cash position;
- M-Pesa balance / unreconciled;
- card clearing;
- receivables;
- payables;
- expenses this month;
- revenue;
- gross profit;
- estimated operating profit.

Provide drill-down, not decorative analytics.

---

# 18. Reports Center

Build reports from stable server-side/report-domain queries rather than ad-hoc component calculations where correctness matters.

## Sales

- sales summary;
- hourly sales;
- daily sales;
- product sales;
- category sales;
- staff sales;
- average ticket;
- top/low sellers;
- discounts/comps;
- voids;
- refunds;
- tax;
- tender mix.

## Inventory

- current stock;
- valuation;
- low stock;
- stockout;
- movement;
- count variance;
- waste;
- transfer;
- receiving;
- inventory adjustments;
- slow moving;
- estimated days of stock.

## Procurement

- purchase orders;
- goods received;
- rejected goods;
- supplier invoices;
- AP aging;
- supplier payments;
- supplier spend;
- purchase price variance.

## Expenses/accounting

- expense report;
- expense by category;
- expense by vendor;
- petty cash;
- P&L;
- trial balance;
- balance sheet;
- cash flow;
- general ledger;
- journal report;
- AR aging;
- AP aging;
- payment account reconciliation.

## POS/till

- shift report;
- close-day report;
- cash variance;
- paid in/out;
- tender reconciliation;
- receipt history.

## Rooms

- occupancy;
- arrivals;
- departures;
- room revenue;
- average daily rate;
- length of stay;
- room status history;
- housekeeping;
- folio balances.

## Assets

- asset register;
- acquisitions;
- assignments;
- maintenance;
- downtime;
- disposals;
- asset spending.

## Staff/audit

- staff activity;
- approvals;
- sensitive actions;
- login/device activity;
- inventory adjustments;
- refunds;
- voids;
- permission changes.

## System health

- sync history;
- pending queue;
- conflicts;
- device status;
- backup evidence;
- failed print jobs.

## Report UX

Every report should have:

```text
Date range
Filters
Saved view
Summary cards
Table/chart where useful
Drill-down
Export
Print
```

Avoid dashboards that only show pretty numbers with no traceability.

---

# 19. Business records management

Create a unified Admin Data workspace.

Admins can manage master records without hunting across unrelated modules.

Possible sections:

- business profile;
- tax;
- payment methods/accounts;
- outlets/service areas;
- stock locations;
- products;
- customers;
- suppliers;
- rooms;
- room types;
- rates;
- assets;
- categories;
- employees;
- expense categories.

Every record page supports:

```text
View
Create
Edit
Archive
Restore
History
```

Deletion should be rare.

Use archival for records referenced by transactions.

---

# 20. Audit and record history

Every important record should expose:

```text
History
```

Show:

- created;
- changed;
- archived;
- restored;
- approval;
- source import;
- actor;
- device;
- timestamp.

Financial and operational ledger history must be immutable.

---

# 21. Help and guidance architecture

Preserve the existing documentation-driven concept and rebuild it into a first-class subsystem.

## Core rule

```text
guidance engine
≠
guide definitions
≠
help articles
```

The engine is reusable.

Definitions describe ServOS workflows.

Articles remain Markdown source.

---

# 22. New Help Center design

Home:

```text
HELP & TRAINING

Search: "How can we help?"

Continue training
Recommended for your role
Quick fixes
Popular tasks
Browse by module
Recent help
System status

POS
Inventory
Procurement
Rooms
Accounting
Reports
Admin
Hardware
Troubleshooting
```

## Search

Search:

- article title;
- summary;
- body;
- keywords;
- module;
- feature;
- common problem synonyms.

Examples:

```text
"mpesa missing"
"stock wrong"
"printer"
"refund"
"room dirty"
"cash variance"
```

## Article view

Show:

- title;
- short answer;
- step-by-step;
- warnings;
- related actions;
- related guide;
- open workspace button;
- troubleshooting links.

Avoid walls of raw Markdown text.

---

# 23. Contextual help

Every major screen gets:

```text
?
```

opening a Help Drawer.

Example in Inventory:

```text
Inventory Help

• Count stock
• Receive stock
• Transfer stock
• Record waste
• Correct stock quantity
• Understand valuation

Guided walkthroughs
[ Run your first count ]

Troubleshooting
[ Barcode not found ]
[ Stock is wrong ]
```

Context help should know the active screen.

---

# 24. Guided tours

Use semantic anchors:

```text
navigation.pos
pos.product-search
pos.cart
pos.pay
inventory.count
reports.date-filter
accounting.expense-new
```

Never bind tours to brittle CSS selectors.

## Guide types

- orientation;
- workflow;
- administration;
- hardware;
- troubleshooting;
- role onboarding.

## Interactive success

Guides advance on actual successful operations where appropriate.

Example:

```text
"Record an inventory count"
```

does not complete because the button was clicked.

It completes after:

```text
inventory.count
```

commits successfully.

## Per-staff progress

Persist:

- guide;
- version;
- state;
- current step;
- completed steps;
- timestamps.

States:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
DISMISSED
```

## Role recommendations

Examples:

Cashier:
- ServOS basics.
- First sale.
- M-Pesa.
- Refund policy.

Store operator:
- Count stock.
- Receive goods.
- Waste.
- Transfers.

Manager:
- Close day.
- Inventory adjustment.
- Reports.
- Approvals.
- Expenses.
- Staff.

Reception:
- Reservation.
- Check in.
- Folio.
- Checkout.
- Housekeeping.

Admin:
- Setup.
- Import.
- Staff/device.
- Accounting.
- Backup/recovery.

---

# 25. "Show me" interactions

Help articles should be able to launch:

```text
Open workspace
Highlight control
Explain control
Start guided workflow
```

Example:

Article:

```text
How to adjust stock
```

buttons:

```text
[ Open Inventory ]
[ Show me ]
```

"Show me" navigates to Inventory and highlights Adjust Stock.

---

# 26. Practice mode

Later phase:

Create a safe practice environment for onboarding.

Possible model:

```text
Demo business snapshot
isolated local store
commands never reach production authority
```

Useful for:

- first sale;
- refund;
- stock count;
- receiving;
- room check-in.

This prevents staff training from polluting real business data.

---

# 27. Settings redesign

Separate:

```text
Business Settings
Personal Settings
Device Settings
System Administration
```

Business:

- identity;
- tax;
- receipts;
- payments;
- rooms policy;
- inventory policy;
- accounting;
- numbering;
- expense policy.

Device:

- printer;
- scanner;
- display;
- offline storage;
- device identity.

Personal:

- theme;
- language later;
- compact mode;
- accessibility.

Administration:

- staff;
- permissions;
- devices;
- import/export;
- audit;
- backups;
- system health.

---

# 28. Permissions

Keep current capability-driven model.

Expand carefully.

Example permission families:

```text
pos.*
payment.*
inventory.*
procurement.*
expenses.*
accounting.*
reports.*
rooms.*
folio.*
assets.*
staff.*
devices.*
business.*
data.import.*
data.export.*
audit.*
backup.*
help.*
```

The client may hide unavailable actions, but the server remains authoritative.

---

# 29. Approval engine

Reuse and generalize existing manager approval concepts.

Actions potentially requiring approval:

- large discount;
- comp;
- void after firing;
- refund;
- large inventory adjustment;
- negative stock correction;
- credit write-off;
- expense above threshold;
- supplier over-receipt;
- reopen closed period;
- sensitive permission change.

Approval token is:

- actor-bound;
- action-bound;
- target-bound;
- short-lived;
- single-use;
- consumed in the same server transaction.

---

# 30. Printing

Keep browser printing for general compatibility.

Add optional local Print Bridge for production terminals.

```text
PWA
 ↓ localhost secure bridge
RAW ESC/POS
 ↓
80 mm printer
```

Capabilities:

- receipt;
- duplicate/reprint;
- customer/business copies;
- cut;
- retry queue;
- print test;
- printer health where possible.

Print failure must not reverse a successful sale.

Receipt remains durable and reprintable.

---

# 31. Scanner

Barcode scanner should remain keyboard-wedge first.

Global scanner service:

- detects rapid scan patterns;
- ignores normal typing contexts;
- routes scans to current workflow;
- prevents double firing;
- supports product lookup;
- stock count;
- GRN;
- barcode assignment;
- asset tags later.

Provide a Scanner Diagnostics page.

---

# 32. Recovery after sudden power loss

Startup recovery sequence:

```text
Load local metadata
↓
Open IndexedDB
↓
Validate schema
↓
Recover authenticated device/session state
↓
Recover pending commands
↓
Recover drafts
↓
Recover pending print jobs
↓
Render cached authorized data
↓
Attempt cloud sync
↓
Pull changes
↓
Resolve conflicts
```

Never discard the local outbox merely because the network returned an error.

---

# 33. Application updates

Service worker update strategy:

```text
download new version
↓
mark update ready
↓
activate at safe boundary
```

Safe boundary:

- no payment modal;
- no active commit;
- no database migration in progress;
- preferably shift-aware for POS terminals.

Display:

```text
ServOS update ready
[ Restart after current task ]
```

---

# 34. Database migration policy

All migrations:

- numbered;
- immutable after release;
- tested from fresh;
- tested from previous production version;
- tested with representative data.

No manual production schema tweaks.

New web rebuild uses a staging Supabase project first.

---

# 35. Cutover from existing ServOS

The current installed terminal remains authoritative during development.

Do not allow:

```text
legacy SQLite writer
+
new web cloud writer
```

at the same time.

Cutover rehearsal:

1. Freeze release candidate.
2. Backup terminal SQLite.
3. Backup Supabase.
4. Close trading.
5. Drain legacy outbox.
6. Reconcile records.
7. Reconcile inventory.
8. Reconcile till/cash.
9. Reconcile AR/AP.
10. Reconcile rooms/folios.
11. Install final v2 migrations.
12. Import authoritative history/state.
13. Register PWA terminal device.
14. Download initial authorized snapshot.
15. Verify opening state.
16. Fence legacy uploader.
17. Enable web command authority.
18. Run controlled first transactions.
19. Verify cloud + local projections.
20. Reopen business.

Rollback plan must be rehearsed before production cutover.

---

# 36. Development phases

## Phase 0 — Freeze and inventory

Deliver:

- exact reference commit;
- feature inventory;
- database inventory;
- command inventory;
- permission inventory;
- test inventory;
- reusable-code list;
- deprecated-code list.

No new features.

## Phase 1 — Design system

Build:

- tokens;
- buttons;
- inputs;
- selects;
- combobox;
- dialogs;
- sheets;
- cards;
- tables;
- forms;
- badges;
- alerts;
- toasts;
- page shell;
- responsive navigation.

Acceptance:

- no feature view defines its own `button`/`field` style constants;
- dropdowns consistent;
- spacing consistent;
- keyboard navigation passes.

## Phase 2 — Web runtime

Build:

- app shell;
- auth/session;
- device registration;
- BusinessStore v2;
- local schema;
- command queue;
- change feed;
- conflict model;
- PWA caching;
- update handling.

Acceptance:

- app starts offline after first successful provisioning;
- queued command survives refresh;
- queued command survives browser restart;
- duplicate sync cannot duplicate transaction.

## Phase 3 — Core master data

Migrate:

- business;
- service areas;
- stock locations;
- customers;
- suppliers;
- products;
- room types;
- rooms;
- categories.

Add reusable CRUD framework.

## Phase 4 — Catalog + inventory

Migrate and normalize:

- catalog;
- barcode;
- stock;
- count;
- transfer;
- waste;
- adjustment;
- movement history;
- valuation;
- import.

## Phase 5 — Procurement

Migrate:

- PO;
- GRN;
- 3-way matching;
- AP;
- supplier payments;
- approvals.

## Phase 6 — POS/KDS/payment

Migrate:

- tabs;
- tables;
- KDS;
- tenders;
- receipt;
- refunds;
- M-Pesa;
- split;
- credit;
- room folio charge.

## Phase 7 — Expenses + accounting

Build:

- expense categories;
- expense capture;
- recurring expenses;
- chart of accounts;
- journals;
- payment accounts;
- AR/AP;
- reconciliation.

## Phase 8 — Reporting

Build report query layer and Reports Center.

Do not calculate critical accounting reports only in React.

## Phase 9 — Hospitality

Migrate:

- rooms;
- reservations;
- stays;
- folios;
- front desk;
- housekeeping;
- service charges.

## Phase 10 — Assets

Migrate:

- asset register;
- acquisition;
- custody;
- maintenance;
- disposal;
- accounting links.

## Phase 11 — Administration

Build:

- staff;
- permissions;
- device management;
- approval rules;
- business settings;
- import/export;
- audit;
- backup health.

## Phase 12 — Help/guidance

Build:

- new Help Center;
- contextual Help Drawer;
- semantic anchor registry;
- tour engine;
- per-staff progress;
- role recommendations;
- workflow guides.

## Phase 13 — Hardware

Build:

- scanner service;
- printer UX;
- optional print bridge;
- diagnostics;
- retry/recovery.

## Phase 14 — Offline grants

Implement:

- issuance;
- renewal;
- expiry;
- allocation consumption;
- reconnect reconciliation;
- revoked-device handling;
- handover.

## Phase 15 — Torture testing

Test:

- two clients;
- same product;
- same room;
- same customer credit;
- same supplier;
- intermittent network;
- browser crashes;
- power loss;
- duplicate retries;
- stale versions;
- permission change while offline;
- device revocation;
- printer failure;
- scanner flood.

## Phase 16 — Migration rehearsal

Run production-like copy of existing business data.

Prove reports and balances before cutover.

## Phase 17 — Production cutover

Only after signed acceptance.

---

# 37. Testing strategy

## Unit

- money;
- taxes;
- quantities;
- CSV;
- command validation;
- report formulas.

## Domain

- inventory;
- PO/GRN/AP;
- payments;
- refunds;
- credit;
- expenses;
- journals;
- rooms;
- folios;
- assets.

## Database

- constraints;
- idempotency;
- concurrency;
- permissions;
- immutable records;
- balanced journals;
- grant consumption.

## Browser

- workflows;
- responsive;
- keyboard;
- offline;
- refresh;
- IndexedDB persistence.

## Visual/UI

Add screenshot tests for:

- dropdown;
- dialog;
- form;
- table;
- mobile navigation;
- POS;
- inventory;
- report filters.

This specifically prevents spacing/dropdown regressions.

## Physical acceptance

- real scanner;
- real XP-80T;
- real low-end POS;
- real browser install;
- internet disconnect;
- router restart;
- OS restart;
- sudden power interruption rehearsal.

---

# 38. Definition of done for every feature

A feature is not complete because a screen exists.

Every feature needs:

1. permission contract;
2. typed command/query;
3. server validation;
4. database transaction;
5. audit effect;
6. offline behavior defined;
7. conflict behavior defined;
8. UI loading state;
9. UI empty state;
10. UI validation;
11. UI error state;
12. responsive behavior;
13. contextual help;
14. guide anchor where relevant;
15. test coverage;
16. export/report behavior where applicable;
17. documentation.

---

# 39. Immediate first implementation milestone

Do not start with another business feature.

Build the platform ServOS has been missing.

## Milestone: `WEB FOUNDATION RC1`

Deliver:

```text
New repo/branch
Design system
New AppShell
PWA
IndexedDB BusinessStore
Sync status
Auth/session
Device registration
Command queue
Change feed
Conflict UI
Global CRUD patterns
Import framework
Export framework
Help shell
Guidance anchor system
```

Then migrate one vertical slice completely:

```text
Products
+
Inventory
+
Inventory Adjustment
+
Import
+
Export
+
Report
+
Help
+
Guided workflow
+
Offline queue
```

That vertical slice becomes the template for every later module.

If this slice is coherent, we have proven the architecture.

---

# 40. Recommended first vertical slice acceptance scenario

Manager installs ServOS PWA.

1. Sign in.
2. Application provisions device.
3. Existing product/inventory data downloads.
4. Manager searches inventory.
5. Manager imports 50 products from CSV.
6. Validation catches 3 duplicates.
7. Manager corrects and applies import.
8. Cashier scans a product.
9. Internet is disconnected.
10. Admin adjusts damaged stock with reason.
11. Adjustment persists locally.
12. Browser is closed.
13. Browser reopens offline.
14. Adjustment still exists.
15. Internet returns.
16. Command synchronizes once.
17. Inventory movement ledger shows the adjustment.
18. Accounting effect is correct.
19. Inventory report includes it.
20. Audit history identifies manager/device/reason.
21. Data can be exported.
22. Help article explains the process.
23. Guided tour can demonstrate the same task.
24. Layout is correct on POS monitor and phone.

That one scenario touches almost every critical foundation.

---

# 41. Preserve the current system until replacement proves itself

The current ServOS tree already represents substantial working effort.

Do not delete it.

Tag the pre-rebuild codebase.

Example:

```text
servos-terminal-0.2-reference
```

The reference build remains:

- migration source;
- behavior oracle;
- fallback;
- test oracle;
- documentation source.

The new web application earns replacement status only after it reproduces the business invariants and survives production acceptance.

---

# 42. Final target

The desired end-state is:

```text
                         SERVOS CLOUD
                    Supabase / PostgreSQL
                  transaction + query authority
                             │
                ┌────────────┴────────────┐
                │                         │
            command API               change feed
                │                         │
                └────────────┬────────────┘
                             │
                         SERVOS PWA
                             │
                 IndexedDB local authority
                 within delegated rights
                             │
      ┌──────────┬───────────┼───────────┬──────────┐
      │          │           │           │          │
     POS      Manager       KDS      Reception    Stock
      │
 optional
 hardware bridge
      │
 printer / drawer / specialist device
```

Business modules:

```text
POS
KDS
Catalog
Inventory
Procurement
Expenses
Accounting
Reports
Customers
Credit
Rooms
Folios
Housekeeping
Assets
Staff
Administration
Import / Export
Help / Training
Audit / Health
```

All sharing:

```text
one design system
one permission model
one command model
one local store
one sync engine
one help system
one audit model
one reporting language
```

That is the rebuild boundary.

ServOS stops being a desktop POS with web pieces attached and becomes a **web-native business operating system that happens to keep working when the web disappears.**
