# SERVOS WEB-FIRST VPS RESET — MASTER DOCUMENT

**Revision:** 2026-10-06

This master is generated from the modular documentation set. ADR-010/011/012 and documents 26–31 lock the Web-First revision.


---

# 00 — ServOS Executive Reset

## 1. Product decision

ServOS will be rebuilt as **one web-first hospitality/business operating system** delivered as an installable PWA from:

`https://serveos.davemusau.co.ke`

Its authoritative backend is:

`https://serveosapi.davemusau.co.ke`

Both are hosted on the same VPS behind Nginx. PostgreSQL is private to the API/worker network. The browser never talks directly to PostgreSQL or legacy Supabase RPCs.

The PWA is not merely an owner dashboard. It is the counter terminal, reception terminal, stock workstation, kitchen/bar screen, manager console and owner interface. It changes its shell according to device enrollment, role, business capabilities and screen size.

## 2. Why the reset exists

The merged codebase is broad and comparatively well tested, but previous development accumulated too many competing boundaries:

- Native and Web UI parity;
- SQLite and cloud authority modes;
- legacy upload and V2 command/cutover paths;
- direct database/RPC coupling;
- receipt-specific hardware assumptions;
- module-first operator journeys;
- complex setup paths for ordinary physical business tasks.

The reset does not discard domain knowledge. It reduces the number of architectural truths.

## 3. What the baseline proves

The merged reset branch builds and its captured baseline passes:

- 216 JavaScript/source tests;
- 106 native Rust/domain tests;
- production Vite build;
- command-parity generation;
- inventory, procurement, hospitality, receipts, audit, outbox and recovery tests.

This is valuable behavioral evidence. The refactor should port and preserve invariants rather than starting from a blank product.

## 4. Non-negotiable architecture decisions

### A. One product trunk

Canonical repository: `davemusau00/SERVEOS-WEB`.

Working reset branch: `reset/vps-platform`.

Historical repositories are references, not parallel products.

### B. One shared network authority

Only `serveosapi.davemusau.co.ke` can authoritatively commit shared business mutations.

No direct browser database writes.
No whole-state upload.
No dual-writer cutover mode in final production.

### C. One primary client

The PWA at `serveos.davemusau.co.ke` is the application.

Tauri becomes a migration/reference implementation and is retired after web-first acceptance.

### D. Offline is command authority, not database merging

The browser stores local projections and commands in IndexedDB. Offline-authorized actions are commands issued under bounded server grants. On reconnect, the same command IDs are confirmed or rejected by the API.

### E. Hardware is a capability, not the app architecture

Barcode scanners work as normal keyboard-wedge devices where possible.

Printing has three supported levels:

1. browser print;
2. controlled kiosk/default-printer deployment;
3. optional ServOS Print Bridge for guaranteed silent raw ESC/POS.

The Print Bridge contains no ServOS business database or sync engine.

### F. Same VPS, separate boundaries

The frontend is served as static PWA assets from Nginx. The API runs in Docker bound to loopback. PostgreSQL and worker stay on a private Docker network.

### G. Backups leave the VPS

The application, API and database may share one VPS initially. At least one encrypted backup copy must be off-VPS.

## 5. Product reset principles

### Operators see tasks

Not tables, modules or canonical units.

Primary vocabulary:

- Sell;
- Add Item;
- Order Stock;
- Receive Delivery;
- Count Stock;
- Transfer;
- Waste;
- Check In;
- Take Payment;
- Check Out;
- Close Till.

### ServOS stores technical truth behind physical language

A storekeeper enters crates/bottles/kilograms. A receptionist enters guest/stay facts. A cashier enters payment facts. ServOS derives canonical units, folio records, journals and audit evidence.

### Simple by default, advanced when needed

A hotel walk-in does not require a CRM account or deposit unless property policy requires one. A menu item does not require a recipe unless ingredient tracking is enabled. A purchase order does not require accounting classification unless the user chooses an advanced line type.

## 6. Target navigation

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
  Purchase Orders

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

Everything is role/capability filtered.

## 7. Critical workflows for ServOS 1.0

- open/close till;
- POS cash/M-Pesa/card/split payment;
- tabs/tables;
- menu/item creation;
- physical inventory receiving/counting/transfers/waste;
- purchase orders and GRNs;
- supplier invoices/payments;
- simple walk-in room check-in/pay/checkout;
- advanced reservation/deposit/folio when enabled;
- housekeeping and room readiness;
- customer credit;
- receipt/PO/GRN/count/cash-up printing;
- offline survival and reconnect;
- backup/restore;
- audited corrections.

## 8. Receipt/QR rule

Business logo prints at the top.

Payment QR is always an uploaded PNG and is processed using the same generic image/raster implementation as the business logo.

Exact caption:

**Scan to Pay via One app**

No QR module detection/reconstruction exists in the new implementation.

## 9. Release definition

ServOS 1.0 is ready when ordinary employees can complete a full operating day without developer intervention and the system survives:

- internet failure;
- browser restart;
- machine restart;
- lost API response;
- printer failure;
- stale-version conflict;
- backup/restore;
- device replacement.

The final product rule remains:

> **The operator sees the business. ServOS sees the machinery.**


---

# 01 — Target Architecture

## 1. Production topology

```text
                           PUBLIC INTERNET
                                  │
                               NGINX
                    ┌─────────────┴─────────────┐
                    │                           │
       serveos.davemusau.co.ke      serveosapi.davemusau.co.ke
                    │                           │
           static ServOS PWA              API : loopback
                    │                           │
     Service Worker + IndexedDB         ServOS Core API
                    │                           │
                    └──────── HTTPS ────────────┤
                                                │
                                ┌───────────────┼───────────────┐
                                │               │               │
                           PostgreSQL       API worker      change feed/SSE
                                │
                      authoritative business state
```

At the business location:

```text
Installed ServOS PWA
  Edge / Chrome / compatible browser
        │
        ├── IndexedDB projection
        ├── durable command outbox
        ├── offline grant
        ├── Service Worker shell
        ├── local backups
        └── optional ServOS Print Bridge
                  │
                  ├── Windows RAW printer
                  └── LAN ESC/POS printer
```

## 2. Authority model

### PostgreSQL

Authoritative shared state for business configuration, catalog, inventory, orders, payments, procurement, rooms/stays, credit, staff, audit, documents, devices and sync cursors.

### API

Only shared mutation gateway. It owns authentication context, permission checks, schema validation, command idempotency, optimistic version checks, domain transactions, audit, document issuance and change-feed creation.

### Browser IndexedDB

A durable local projection and command store, not a second cloud server.

It contains enough data to continue bounded offline operation and recover unresolved commands.

### Optional Print Bridge

Local hardware adapter only. It never mutates shared business records and never becomes a synchronization authority.

## 3. Online read path

```text
PWA
 ↓
local projection for responsive UI
 ↓                         ↘
background change feed      API queries when required
```

The application can render immediately from its projection while keeping authoritative versions/cursors visible internally.

## 4. Online write path

```text
UI action
  ↓
command UUID
  ↓
persist command in IndexedDB
  ↓
POST /v1/commands
  ↓
auth + permission + schema
  ↓
idempotency lookup
  ↓
expected-version checks
  ↓
BEGIN PostgreSQL transaction
  ↓
domain handler
  ↓
records + audit + documents + changes
  ↓
CONFIRMED command
  ↓
COMMIT
  ↓
return result + cursor
  ↓
update IndexedDB projection
```

## 5. Offline write path

```text
UI action
  ↓
validate offline grant
  ↓
persist command + local evidence
  ↓
update local pending projection
  ↓
continue operation
  ↓
network returns
  ↓
replay SAME command UUID
  ↓
server confirms/rejects
  ↓
apply authoritative projection
```

## 6. Response loss

A timeout after send never means "create another payment".

```text
SENDING → OUTCOME_UNKNOWN
```

Resolve the same UUID with `GET /v1/commands/{id}`.

## 7. Change distribution

Every commit creates ordered change records with a business cursor.

Clients pull:

`GET /v1/sync/changes?after=<cursor>`

SSE may notify that changes exist, but correctness depends on cursor pull, not an always-open socket.

## 8. Same-VPS deployment shape

The existing VPS already uses host Nginx. Keep it.

Recommended runtime:

```text
host Nginx
  ├── static /var/www/serveos/current
  └── reverse proxy 127.0.0.1:3101

Docker compose
  ├── serveos-api
  ├── serveos-worker
  ├── serveos-postgres
  └── serveos-backup
```

Redis is optional, not a day-one requirement.

## 9. Domain boundaries

Backend modular monolith:

- Identity & Access
- Business Setup
- Catalog
- Inventory
- POS / Orders
- Payments & Tills
- Procurement / AP
- Hospitality
- Customer Credit
- Receipts / Business Documents
- Assets / Maintenance
- Guidance / Help
- Device / Offline Grants
- Sync / Change Feed

These are modules, not separately deployed microservices.

## 10. Client package boundaries

```text
apps/web
apps/api
apps/worker
apps/print-bridge   optional

packages/contracts
packages/domain
packages/permissions
packages/offline
packages/sync
packages/documents
packages/printing
packages/inventory
packages/hospitality
packages/finance
packages/design-system
```

## 11. Multi-device offline rule

Do not let several disconnected devices independently spend the same scarce resource in phase one.

Use one offline-authorized device per operational scope or explicit leases/allocations for:

- rooms;
- tills;
- receipt number blocks;
- selected stock authority.

Expand only after measured need.

## 12. Security boundary

- frontend never receives DB credentials;
- database is not publicly exposed;
- API CORS allows explicit production/staging origins;
- HTTPS everywhere;
- device key generated/stored through WebCrypto where supported;
- Print Bridge loopback only and paired to approved origin/device;
- secrets never stored in documentation or committed `.env`.

## 13. Architecture success test

A replacement POS machine should require only:

```text
open site → install PWA → enroll → bootstrap → configure printer → trade
```

No copying a historical local business database into production authority.


---

# 02 — Repository Refactor and Codebase Cleanup

## 1. Goal

Turn `SERVEOS-WEB` from an accumulated convergence repository into one understandable monorepo with strict boundaries.

## 2. Proposed tree

```text
serveos/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   └── public/
│   ├── terminal/
│   │   ├── src/
│   │   └── src-tauri/
│   ├── api/
│   │   └── src/
│   └── worker/
│       └── src/
│
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── database/
│   ├── sync/
│   ├── permissions/
│   ├── receipts/
│   ├── inventory-math/
│   ├── design-system/
│   ├── guidance/
│   ├── observability/
│   └── test-fixtures/
│
├── migrations/
├── infra/
│   ├── docker/
│   ├── caddy/
│   └── scripts/
│
├── tests/
│   ├── contract/
│   ├── api/
│   ├── domain/
│   ├── web/
│   ├── terminal/
│   ├── migration/
│   ├── hardware/
│   └── end-to-end/
│
└── docs/
```

## 3. Package responsibilities

### `packages/contracts`

The most important package.

Contains:

- command names;
- request/response schemas;
- API DTO schemas;
- error codes;
- role/permission identifiers;
- change-feed schema;
- receipt document schema;
- domain enum values;
- protocol version.

No React.
No database imports.
No Tauri imports.

### `packages/domain`

Pure domain/application logic where practical:

- invariant checks;
- price/package calculations;
- stay transition rules;
- stock conversion rules;
- permission-independent calculations;
- command semantic helpers.

### `packages/database`

- database client;
- typed table definitions;
- transaction helpers;
- migrations integration;
- repository implementations.

No HTTP route components.

### `packages/sync`

Shared client protocol models:

- command envelope;
- outbox state machine;
- cursor/change types;
- bootstrap manifest;
- offline grant schema;
- retry rules.

Terminal-specific SQLite persistence stays under Terminal, but the protocol itself is shared.

### `packages/permissions`

One role/permission matrix for API, Web and Terminal presentation.

The API remains the final enforcement point.

### `packages/receipts`

- receipt document schema;
- receipt formatter;
- print layout calculations;
- branding/QR raster helpers that can be shared with Terminal where practical;
- immutable snapshot rules.

### `packages/design-system`

One source for:

- dialogs;
- drawers;
- form fields;
- money/quantity inputs;
- select/combobox;
- action menus;
- empty/loading/error states;
- command recovery UI;
- approval dialog;
- responsive tokens.

## 4. What moves out of current files

Large feature components should be decomposed into workflow components.

For example:

```text
WebHospitalityViews.tsx
    ↓
features/hospitality/
  FrontDeskPage.tsx
  RoomBoard.tsx
  QuickCheckInDialog.tsx
  AdvancedReservationDialog.tsx
  GuestBillDrawer.tsx
  HousekeepingBoard.tsx
  RoomSetupPage.tsx
```

Likewise Procurement:

```text
ProcurementPage
  PurchaseOrderList
  PurchaseOrderEditor
  ReceiveDeliveryDialog
  SupplierQuickCreate
  InvoiceMatchDialog
  SupplierPaymentDialog
```

Avoid files that know every workflow in a domain.

## 5. Archive/remove categories

### Archive only

- one-time SQLite/Supabase import utilities;
- legacy schema readers required for migration;
- old receipt parsers needed to view historic documents;
- historical acceptance evidence.

Put these under:

`legacy/` or `tools/migration-legacy/`

and exclude them from normal application bundles.

### Remove after cutover

- legacy Remote Manager runtime;
- old snapshot upload path;
- Supabase direct client mutation calls;
- `servos_v2_execute` client coupling;
- SQL command dispatcher wrappers;
- production code for the obsolete authority-mode switch;
- duplicated role matrices;
- duplicate operation aliases after one compatibility release;
- abandoned `.bak` source files;
- generated multi-megabyte audit JSON committed to Git;
- dead demo applications.

## 6. No more generated evidence in the main tree

CI-generated reports belong in CI artifacts, not ordinary source control, unless they are small stable specifications.

Keep in Git:

- current protocol manifest;
- concise generated OpenAPI;
- small generated permission/operation reference if reviewed.

Move out of Git:

- screenshots;
- huge interaction inventories;
- browser traces;
- large generated JSON audits;
- temporary migration dumps.

## 7. Dependency rules

Enforce with ESLint/import boundaries or a monorepo boundary tool.

Allowed:

```text
apps/web      → contracts, permissions, design-system, receipts
apps/terminal → contracts, permissions, design-system, receipts, sync
apps/api      → contracts, domain, database, permissions, receipts
apps/worker   → domain, database, observability
```

Disallowed:

```text
web → database
web → api internals
terminal React → database server code
api → web components
contracts → database
contracts → React
```

## 8. Operation aliases

During migration, legacy operation names may be accepted at an adapter boundary.

Example:

```text
customerCredit.charge
    ↓ alias adapter
credit.charge
```

The canonical command log stores only `credit.charge`.

Aliases have a removal date and tests proving no new code emits them.

## 9. Configuration cleanup

Use typed configuration modules.

Never access `process.env` throughout application code.

Example:

```text
config.ts
  databaseUrl
  publicWebOrigin
  jwtIssuer
  logLevel
  smtp...
```

The process should fail at startup if required configuration is missing.

## 10. Migration organization

Use one ordered migration directory:

```text
migrations/
  0001_core.sql
  0002_identity.sql
  0003_catalog.sql
  0004_inventory.sql
  ...
```

Do not create multiple canonical migration paths.

Rules:

- migrations are immutable after release;
- schema changes use expand/contract where needed;
- destructive migrations require explicit backup and release note;
- no migration becomes a hidden application router.

## 11. Test organization

Every command should have:

- schema validation tests;
- permission tests;
- happy path domain test;
- conflict/version test;
- idempotent replay test;
- audit assertion;
- change-feed assertion;
- Web/Terminal UX acceptance when exposed there.

The old parity ledger becomes generated from the canonical command registry rather than manually curated prose.

## 12. Completion criteria

Repository refactor is complete when:

- all production apps build from one repository;
- there is one contracts package;
- there is one permission matrix;
- there is one migration chain;
- no client can import database server code;
- no production code can call old snapshot upload;
- no production client depends on Supabase browser SDK for business mutation;
- large legacy code is quarantined outside runtime bundles;
- CI enforces package boundaries.

## Web-first revision

The final active client target is now `apps/web`, not parallel Web and Tauri business applications. Preserve native code during migration as a test/reference source, then extract only hardware transport needed by `apps/print-bridge`. New feature work must target Web/API shared contracts.

Target top-level layout:

```text
apps/web
apps/api
apps/worker
apps/print-bridge   # optional
packages/contracts
packages/domain
packages/offline
packages/sync
packages/documents
packages/printing
packages/design-system
infra/vps
```


---

# 03 — New VPS Backend Specification

## 1. Objective

Build a backend that is easier to reason about than the existing direct-Supabase/V2 arrangement and that can be deployed reproducibly to the VPS behind:

`https://serveosapi.davemusau.co.ke`

The backend should be boring in the best sense: one API, one database, explicit commands, predictable transactions and visible operational health.

## 2. Recommended application stack

### Runtime

TypeScript on a current supported Node.js LTS release, pinned in the repository and Docker image.

### HTTP framework

Fastify or an equivalently small framework with:

- schema-based validation;
- structured logging;
- request IDs;
- graceful shutdown;
- OpenAPI support;
- mature plugin ecosystem.

### Validation/contracts

Use shared Zod/JSON-schema definitions from `packages/contracts`.

One schema should drive:

- server input validation;
- generated TypeScript types;
- API documentation;
- client validation where useful.

### Database

PostgreSQL.

Use a typed query layer such as Kysely or Drizzle. Pick one during implementation and avoid wrapping it in a home-grown ORM.

### Jobs

Use a PostgreSQL-backed job queue initially.

Use cases:

- report generation;
- scheduled backup metadata checks;
- email invitations/password reset delivery;
- deferred exports;
- cleanup of expired sessions/grants;
- reconciliation jobs;
- webhook retry.

Do not add Redis until measured load or queue semantics require it.

### Live updates

Server-Sent Events plus cursor polling.

SSE is notification transport, not transaction transport.

## 3. API process boundaries

Recommended modules:

```text
src/
  server.ts
  config/
  auth/
  commands/
  sync/
  audit/
  modules/
    business/
    catalog/
    inventory/
    pos/
    payments/
    procurement/
    hospitality/
    credit/
    staff/
    assets/
    reports/
    imports/
  db/
  errors/
  observability/
```

## 4. Route model

Use two API styles intentionally.

### Query endpoints

Human/client-friendly resource reads:

```text
GET /v1/session
GET /v1/catalog/items
GET /v1/inventory/locations
GET /v1/inventory/stock
GET /v1/pos/open-till
GET /v1/hospitality/rooms
GET /v1/hospitality/front-desk
GET /v1/procurement/purchase-orders
GET /v1/reports/daily
```

### Command endpoint

All business mutations:

```text
POST /v1/commands
GET  /v1/commands/:commandId
```

This keeps mutation behavior uniform without making every read a generic document query.

## 5. Command registry

The API imports one registry containing entries such as:

```ts
{
  name: 'stay.quickCheckIn',
  schema: QuickCheckInCommand,
  permission: 'hospitality.check_in',
  offlinePolicy: 'GRANTED_ONLY',
  handler: quickCheckIn,
}
```

CI verifies:

- every emitted PWA command exists;
- every registry command has a handler;
- every handler has a permission;
- every command has tests;
- deprecated aliases are not emitted by current clients.

## 6. Error model

Do not leak raw database errors.

Canonical API problem envelope:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This room changed on another device.",
    "retryable": false,
    "commandId": "...",
    "details": {
      "entity": "room",
      "id": "6",
      "currentVersion": 12
    }
  }
}
```

Stable codes include:

- `VALIDATION_FAILED`
- `AUTH_REQUIRED`
- `PERMISSION_DENIED`
- `VERSION_CONFLICT`
- `RESOURCE_CONFLICT`
- `DUPLICATE_REFERENCE`
- `OFFLINE_GRANT_REQUIRED`
- `OFFLINE_GRANT_EXPIRED`
- `INSUFFICIENT_STOCK`
- `TILL_NOT_OPEN`
- `PAYMENT_MISMATCH`
- `ROOM_UNAVAILABLE`
- `COMMAND_UNKNOWN`
- `COMMAND_REJECTED`
- `CLIENT_UPDATE_REQUIRED`

The UI maps these to operator language.

## 7. Transaction boundary

One command executes inside one database transaction whenever its business effects must be atomic.

Example `purchaseOrder.receive`:

```text
BEGIN
  lock PO/version
  validate outstanding quantities
  create goods receipt
  create receipt lines
  update PO received totals/status
  update stock balances
  create stock movements
  update weighted cost
  create AP evidence if applicable
  create audit event
  create change feed rows
  mark command confirmed
COMMIT
```

If any invariant fails, nothing posts.

## 8. Command log

Recommended fields:

```text
commands
  id UUID PK
  business_id UUID
  device_id UUID nullable
  actor_id UUID
  type TEXT
  payload JSONB
  expected_versions JSONB
  client_created_at timestamptz
  received_at timestamptz
  committed_at timestamptz nullable
  status enum
  result JSONB nullable
  error_code TEXT nullable
  error_details JSONB nullable
  offline_grant_id UUID nullable
  client_sequence BIGINT nullable
```

Unique command ID provides idempotency.

## 9. Change log

Recommended fields:

```text
changes
  cursor BIGSERIAL PK
  business_id UUID
  command_id UUID
  entity_type TEXT
  entity_id TEXT
  entity_version BIGINT
  action TEXT
  projection JSONB
  created_at timestamptz
```

`projection` contains enough current data for clients to apply the change without issuing a second read for every row. Sensitive fields are filtered before the change is exposed to a client.

## 10. Audit model

Audit is not the same as sync change feed.

Audit rows answer:

- who did it;
- from which device;
- which command;
- which permission/approval;
- why;
- before/after summary;
- money/stock consequences;
- timestamp;
- offline grant if any.

Audit tables should be append-only for ordinary application roles.

## 11. Approvals

Manager approval becomes a first-class backend primitive.

A protected command may include:

```text
approvalId
```

Approval records are:

- single-use;
- business scoped;
- initiator scoped;
- action scoped;
- target scoped;
- time limited;
- auditable.

No UUID/token should be manually copied by staff.

## 12. Files and branding assets

For initial ServOS 1.0, small receipt branding files can be stored in PostgreSQL with:

- MIME type;
- byte length;
- SHA-256;
- original PNG bytes;
- prepared thermal raster;
- created by/at;
- active version.

This is sufficient for logos and payment QR assets and keeps backup semantics simple.

A separate S3-compatible object store can be introduced for larger documents/photos later.

## 13. Receipt creation

Receipt documents are created at transaction commit, not dynamically from current settings on every reprint.

A receipt snapshot stores:

- business identity;
- logo/raster;
- payment QR/raster if enabled;
- exact transaction lines;
- tax totals;
- tender details;
- footer;
- layout version;
- printer profile metadata.

Reprint reads the immutable receipt document.

## 14. Authentication boundary

The API owns session issuance and validation.

Web and PWA device do not authenticate directly with PostgreSQL.

See `11-AUTH-SECURITY-RBAC.md` for details.

## 15. Graceful deployment

The API must support:

- `/health/live` — process is alive;
- `/health/ready` — DB/migrations/critical dependencies are usable;
- graceful SIGTERM;
- request draining;
- migration version check at startup;
- refusal to start against an unsupported schema.

## 16. Performance targets

Initial targets, validated under realistic load:

- typical read p95 under 300 ms from Nairobi/target business network;
- ordinary online command p95 under 500 ms excluding external integrations;
- local POS interaction remains instant because cart/UI and PWA device reads do not block on rendering round trips;
- sync batch supports hundreds/thousands of changes without full snapshot transfer;
- database queries for POS/catalog/front desk have explicit indexes and explain-plan review.

These are engineering targets, not contractual SLAs until measured.

## 17. API completion gate

The new backend is not considered ready until:

- all Tier-A command handlers have integration tests against real PostgreSQL;
- idempotent replay is tested;
- response-loss command lookup is tested;
- version conflicts are tested with concurrent connections;
- permission denial is tested for every sensitive domain;
- change feed reproduces committed state;
- migration restore from clean database passes;
- backup/restore passes;
- Web and PWA device contract tests use the same generated command definitions.


---

# 04 — Database and Domain Model

## 1. Philosophy

The new backend should move from a generic record/document database toward relational business entities with explicit invariants.

The current system's generic record approach helped accelerate development, but it also made partial-record replacement, command routing and cross-domain validation harder to reason about.

The new database should make invalid states difficult to store.

## 2. Common columns

Most mutable business tables include:

```text
id UUID
business_id UUID
version BIGINT NOT NULL DEFAULT 1
created_at timestamptz
updated_at timestamptz
archived_at timestamptz nullable
created_by UUID
updated_by UUID
```

Version increments on every committed change.

Financial/history tables are normally append-only rather than version-updated.

## 3. Core business tables

```text
businesses
business_settings
outlets
service_areas
storage_locations
business_capabilities
number_sequences
```

Business capabilities might include:

```text
POS
KITCHEN
INVENTORY
PROCUREMENT
ROOMS
HOUSEKEEPING
CUSTOMER_CREDIT
ASSETS
```

## 4. Identity and access

```text
users
staff
roles
permissions
role_permissions
staff_roles
devices
device_enrollments
sessions
refresh_tokens
manager_approvals
offline_grants
```

A login identity and a staff record are related but distinct.

This allows:

- staff who do not need remote login;
- one user potentially serving multiple business memberships later;
- device enrollment independent of staff record lifecycle.

## 5. Catalog

```text
item_families
items
item_barcodes
stock_items
item_stock_links
purchase_packages
selling_options
recipes
recipe_lines
batch_recipes
```

### Item vs stock item

Internally the distinction remains valuable.

Operator UX hides it.

Examples:

- Menu dish may be sellable but not independently stocked.
- Beef may be stocked but not sold directly.
- Jameson can have one stock basis with several selling options.

## 6. Inventory

```text
stock_balances
stock_movements
stock_count_sessions
stock_count_lines
stock_transfer_headers
stock_transfer_lines
inventory_adjustments
sealed_open_balances
```

### Stock balance invariant

`stock_balances` is a current projection.

Every quantity-changing command also writes immutable `stock_movements`.

Never directly edit a stock balance without a corresponding movement.

### Sealed/open drinks

For tracked volume items:

```text
sealed_open_balances
  stock_item_id
  storage_location_id
  sealed_container_count
  open_quantity_canonical
  container_quantity_canonical
```

Conservation invariant:

```text
total canonical quantity
=
sealed_container_count × container_quantity
+ open_quantity
```

## 7. POS and orders

```text
orders
order_lines
order_line_modifiers
order_events
payments
payment_allocations
refunds
receipt_documents
printer_jobs   // Terminal-local may be separate
```

Recommended order state machine:

```text
DRAFT
OPEN
FIRED
PARTIALLY_PAID
PAID
CANCELLED
REFUNDED/PARTIALLY_REFUNDED via separate refund records
```

Avoid rewriting historical order lines after payment. Corrections happen through explicit reversal/refund operations.

## 8. Tills and money

```text
tills
till_sessions
till_cash_movements
cash_counts
mpesa_transactions
mpesa_reconciliations
card_references
```

Opening/closing a till is explicit.

Cash expected is derived from committed movements, never stored as manually editable truth.

## 9. Customer credit

```text
customers
credit_accounts
credit_entries
credit_settlements
credit_writeoffs
```

Credit balance is derived from immutable entries or maintained as a transactionally consistent projection.

## 10. Procurement and AP

```text
suppliers
purchase_orders
purchase_order_lines
goods_receipts
goods_receipt_lines
supplier_invoices
supplier_invoice_lines
payables
supplier_payments
```

PO lines record the package selected at order time so later package changes do not rewrite historic intent.

A receipt line records:

- ordered package;
- received package quantity;
- accepted quantity;
- rejected quantity;
- conversion to canonical inventory;
- unit/package cost;
- reason/evidence for exceptions.

## 11. Hospitality

```text
room_types
rooms
rate_plans
room_blocks
reservations
stays
stay_guests
guest_profiles
folios
folio_entries
housekeeping_tasks
room_condition_events
```

### Critical design: guest profile optional

`stays` must support an immutable/retained inline guest snapshot:

```text
guest_name
phone nullable
identification nullable
notes nullable
guest_profile_id nullable
```

Therefore a walk-in can:

```text
check in
pay
stay
check out
```

without creating a persistent CRM/customer account.

### Folio internal, not mandatory UI

Every stay may use an internal folio/bill for financial correctness.

The simple receptionist flow does not need to expose the word "folio".

## 12. Assets

```text
assets
asset_assignments
asset_events
maintenance_cases
maintenance_events
```

Procurement-to-asset acquisition must be explicit so the same purchase line does not accidentally become both consumable stock and an asset.

## 13. Commands, audit and sync

```text
commands
changes
audit_events
client_cursors
sync_bootstraps
offline_grants
offline_grant_consumption
```

These are infrastructure-domain tables and should be carefully indexed.

## 14. Imports

```text
import_jobs
import_files
import_mappings
import_rows
import_errors
import_apply_runs
```

Raw CSV text should not be copied indefinitely into immutable command history.

Store the import as a controlled object/job with retention rules and audit the applied result separately.

## 15. Monetary representation

Use integer minor units wherever practical:

```text
KES 2,450.50 → 245050 cents
```

If current product requirements only use whole Kenyan shillings, the API may display whole values, but the storage model should avoid floating-point money.

Never use JavaScript floating point as authoritative accounting arithmetic.

## 16. Quantity representation

Canonical quantities should use an exact numeric representation appropriate to domain scale.

Examples:

- COUNT: integer pieces where possible;
- WEIGHT: canonical grams;
- VOLUME: canonical millilitres;
- decimal quantity where partial canonical units are unavoidable.

Package conversion belongs in domain services and is stored in historic transaction lines when needed for evidence.

## 17. Time and timezone

Store timestamps in UTC.

Store business timezone in business settings, for example `Africa/Nairobi`.

Business-day calculations, nightly checkout cutoffs and reports use business-local time through a shared time library.

Never store ambiguous local timestamps without timezone interpretation.

## 18. Database constraints to enforce

Examples:

- unique barcode within business;
- unique active room number/name within property/outlet scope;
- non-negative stock where policy requires it;
- accepted + rejected cannot exceed physically received quantity;
- payment allocations cannot exceed payment amount;
- room cannot have overlapping active stays/reservations where prohibited;
- duplicate supplier invoice references rejected according to supplier/business policy;
- one active till session per till where configured;
- command ID unique globally;
- change cursor monotonically increasing;
- offline grant consumption cannot exceed grant limits.

## 19. What not to encode only in the database

Avoid giant trigger/procedure systems for:

- entire command dispatch;
- user-facing error wording;
- workflow branching;
- role navigation;
- API payload parsing;
- package wizard logic.

The database protects truth. The application explains and orchestrates it.


---

# 05 — API, Command and Synchronization Protocol

## 1. Purpose

This protocol is the replacement for legacy snapshot upload, direct Supabase RPC coupling and divergent Native/Web mutation semantics.

## 2. Command envelope

Every mutation is submitted using one envelope.

Example:

```json
{
  "id": "8cbd4d5a-...",
  "type": "inventory.receive",
  "protocolVersion": 1,
  "businessId": "...",
  "deviceId": "...",
  "clientSequence": 1044,
  "createdAt": "2026-10-05T20:15:00Z",
  "expectedVersions": {
    "purchaseOrder:...": 8,
    "stockItem:...": 21
  },
  "payload": {},
  "approvalId": null,
  "offlineGrantId": null
}
```

Actor identity comes from the authenticated session, not trusted payload data.

## 3. POST `/v1/commands`

Possible HTTP-level outcomes:

### 200/201 — known command result

```json
{
  "commandId": "...",
  "status": "CONFIRMED",
  "cursor": 18811,
  "result": {},
  "changes": []
}
```

### 409 — domain/version conflict

Command becomes `CONFLICT`/`REJECTED` with stable evidence.

### 401/403 — authentication/permission issue

Command not committed.

### timeout/network loss

Client sets local state `OUTCOME_UNKNOWN` and queries command status later.

## 4. Command status

`GET /v1/commands/:id`

Returns one of:

```text
RECEIVED
PROCESSING
CONFIRMED
REJECTED
CONFLICT
```

If the API truly has no record:

```text
NOT_FOUND
```

The client may resend the **same command ID** if it cannot establish whether the first request reached the server. It never manufactures a new ID for the same user action.

## 5. Idempotency

`commands.id` is unique.

When an existing ID is received:

- same canonical request hash → return stored result;
- materially different request body → reject as `IDEMPOTENCY_MISMATCH`.

This protects against:

- double-clicks;
- proxy retries;
- connection resets;
- PWA reconnect/replay;
- application restart.

## 6. Expected versions

A command includes versions for the resources it actually depends on, not the entire business snapshot.

Example `stay.checkIn` might depend on:

```text
room:room-6 = 12
reservation:abc = 3
ratePlan:standard = 5
```

Do not send versions for hundreds of unrelated records.

## 7. Change feed

Endpoint:

`GET /v1/sync/changes?after=18811&limit=500`

Response:

```json
{
  "protocolVersion": 1,
  "fromCursor": 18811,
  "toCursor": 19002,
  "hasMore": false,
  "changes": [
    {
      "cursor": 18812,
      "commandId": "...",
      "entityType": "stockBalance",
      "entityId": "...",
      "version": 22,
      "action": "UPSERT",
      "projection": {}
    }
  ]
}
```

Deletion/archive uses an explicit action/tombstone.

## 8. Cursor rules

- Cursor is server-generated and monotonic within the deployment.
- Client applies changes in cursor order.
- Cursor advances only after local application succeeds.
- Client stores its last durable cursor.
- Missing/gapped batches are fetched again.
- A client may safely request an already applied range; entity versions prevent regression.

## 9. Server-Sent Events

Endpoint:

`GET /v1/sync/stream`

Example event:

```text
event: changes-available
data: {"latestCursor":19002}
```

Client then calls the ordinary change-feed endpoint.

This keeps SSE disposable and correctness in the pull protocol.

## 10. Bootstrap

For a new/recovered PWA device:

```text
POST /v1/devices/:id/bootstrap
```

or an equivalent authenticated flow returns a manifest and paginated datasets.

Manifest includes:

```text
businessId
protocolVersion
schemaVersion
snapshotCursor
collection/entity counts
content hash
createdAt
```

Client:

1. downloads into temporary IndexedDB staging stores;
2. verifies page hashes/counts;
3. verifies manifest hash;
4. installs atomically;
5. records `snapshotCursor`;
6. starts pulling newer changes.

Never partially replace the live local projection.

## 11. PWA push/pull loop

Online cycle:

```text
1. verify session/device
2. send oldest PENDING command
3. resolve UNKNOWN commands by ID
4. pull change feed from stored cursor
5. apply changes transactionally
6. persist cursor
7. repeat until caught up
```

Do not upload local tables as reconciliation.

## 12. Online PWA behavior

Web sends commands directly and refreshes/invalidate query caches from returned changes/SSE.

If offline:

- save explicitly labeled drafts where useful;
- do not claim they will automatically become transactions;
- on reconnect, revalidate and ask the operator to submit where the action is sensitive.

## 13. Offline PWA device commands

Offline commands use the same command schema with:

```text
offlineGrantId
clientSequence
localCommittedAt
```

The PWA device locally applies only command types allowed by the grant.

On reconnect, they are replayed exactly once and the server verifies grant scope/limits.

See `06-TERMINAL-OFFLINE.md`.

## 14. Conflict classes

### Version conflict

A referenced entity version changed.

### Resource conflict

Example: room already occupied by another confirmed stay.

### Policy conflict

Policy changed while client was offline.

### Offline grant conflict

Grant expired/limit consumed/identity mismatch.

### Duplicate external reference

Supplier invoice, M-Pesa reference or other constrained reference already exists.

Each class has a deterministic UI recovery.

## 15. Command lifecycle in clients

```text
DRAFT
  ↓ submit
PENDING
  ↓ request sent
SENT
  ├── response confirmed → CONFIRMED
  ├── rejected → REJECTED
  ├── conflict → CONFLICT
  └── response lost → OUTCOME_UNKNOWN
                          ↓ lookup same ID
                       confirmed/rejected/conflict
```

Do not clear form state until `CONFIRMED` unless the workflow intentionally transitions into a recovery view.

## 16. Command recovery UI

Every command-driven dialog can render a shared state:

```text
We don't yet know whether this change reached ServOS.

[ Check status ]   [ Open Activity ]

Do not submit this action again.
```

The same component applies to:

- payment;
- room check-in;
- PO receive;
- stock count;
- refund;
- maintenance;
- settings save.

## 17. External integrations

External actions such as Daraja or email must not break local transaction idempotency.

Pattern:

```text
commit internal intent/state
   ↓
enqueue integration job with unique key
   ↓
worker calls provider
   ↓
store provider result
   ↓
command/change update
```

If a provider API supports its own idempotency key, use the ServOS operation/integration ID.

## 18. API compatibility

Version routes only when breaking semantics require it.

Prefer:

```text
/v1/commands
```

with contract versioning and backward-compatible fields over proliferating `/v2`, `/v3` endpoints.

When breaking changes occur:

- server advertises minimum supported client protocol;
- clients refuse unsafe mutation;
- compatibility tests cover supported versions.

## 19. Protocol test suite

Required automated tests:

- same command replay;
- same ID/different payload rejection;
- response-loss recovery;
- stale expected version;
- simultaneous room booking;
- simultaneous stock receipt/count conflict;
- change cursor ordering;
- tombstone application;
- bootstrap hash mismatch;
- bootstrap interruption/retry;
- client behind minimum protocol;
- offline grant valid/expired/exhausted;
- exact-once audit/change generation for replay.


---

# 06 — Web/PWA Offline Terminal Model

> **Revision:** The former Tauri/SQLite Terminal model is superseded by the web-first PWA architecture. This filename is retained so existing documentation links do not break.

## 1. Principle

The installed browser/PWA must survive connectivity failure without becoming a second authoritative server.

IndexedDB replaces SQLite as the browser-side operational projection and durable outbox.

## 2. Local layers

### Projection

Server-confirmed entities required for the device's assigned role/scope.

### Pending overlay

Local effects of unconfirmed commands are explicitly marked pending and cannot masquerade as confirmed server versions.

### Durable outbox

Commands persisted before transmission.

### Offline grant

Signed/verified authority defining what the device may finalize while disconnected.

### Print/document cache

Immutable document snapshots and local print jobs.

## 3. Command table

Suggested record:

```text
id
commandType
payload
expectedVersions
status
clientSequence
createdAt
sentAt?
confirmedAt?
serverCursor?
lastErrorCode?
offlineGrantId?
payloadHash
```

## 4. Statuses

```text
PENDING
SENDING
OUTCOME_UNKNOWN
CONFIRMED
REJECTED
CONFLICT
SUPERSEDED
```

## 5. Reconnect algorithm

```text
verify session/device
  ↓
verify protocol + offline grant
  ↓
resolve OUTCOME_UNKNOWN
  ↓
send PENDING in sequence
  ↓
apply confirmed command results
  ↓
pull change feed after cursor
  ↓
apply projection changes transactionally
  ↓
surface conflicts requiring review
  ↓
renew grant
```

## 6. Offline scope

Start small and safe. POS cash/manual-evidence payments, local KOT/receipts and selected simple stay/count workflows are suitable first targets. High-risk finance, permission changes and global configuration remain online initially.

## 7. Browser shutdown/restart

Closing the PWA must not lose pending commands. On next launch:

- open IndexedDB;
- verify schema/migrations;
- restore device state;
- show pending/unknown status;
- resume sync when network exists.

## 8. Storage eviction protection

Request persistent storage. Warn administrators if unavailable. Provide local recovery export and block destructive device reset while unresolved commands exist unless an admin exports/acknowledges the risk.

## 9. Receipt/document numbering

Use server-issued number blocks or device-prefixed sequences for offline issuance so two devices cannot generate the same human document number.

Command UUID remains the true idempotency identity.

## 10. Room authority

Initially one reception device can hold offline room authority for a defined scope. Do not let several disconnected devices independently sell the same room.

## 11. Recovery

A fresh device bootstraps from server. A recovery bundle is used only to rescue unresolved local commands/documents, never to overwrite server state wholesale.

See `27-BROWSER-OFFLINE-SYNC-BACKUP.md` for the full design.


---

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


---

# 08 — Hospitality and Rooms Reset

## 1. Objective

Support both:

1. a small property where a walk-in guest simply checks in, pays and checks out; and
2. a mature hotel operation using reservations, deposits, customer profiles, folios, extensions and room moves.

The advanced engine remains. The simple workflow stops forcing the operator through it.

## 2. Primary Front Desk model

Room board:

```text
AVAILABLE
Room 1   KES 3,000   [ Check in ]
Room 2   KES 3,000   [ Check in ]

OCCUPIED
Room 3   John   Checkout today   Paid
Room 4   Mary   Balance 3,000

NEEDS CLEANING
Room 6

OUT OF ORDER
Room 8
```

Room cards are the central navigation element.

## 3. Quick check-in

Example:

```text
CHECK IN ROOM 6

Guest name
[ John ]

Guests
[ 1 ]

Stay
[ 1 night ]

Checkout
Tomorrow · 10:00

Rate
KES [ 3,000 ]

Payment
● Pay now
○ Pay later

[ Check in ]
```

No required customer account.
No required reservation wizard.
No required deposit.
No manual folio opening.

## 4. Domain command

Use an atomic high-level command:

`stay.quickCheckIn`

It performs, in one transaction:

```text
validate room/rate/policy
capture guest snapshot
create stay
create internal guest bill/folio
post accommodation charge
record optional payment
mark room occupied
create audit/change records
```

## 5. Guest snapshot

A stay records the guest details supplied at check-in even when no reusable profile exists.

Recommended fields:

```text
guestName required
guestPhone optional
guestIdentification optional
guestNotes optional
guestProfileId optional
```

Business policy controls which fields are required.

Example policies:

- Walk-in minimal: name only.
- Standard: name + phone.
- Registration: name + phone + identification.

## 6. Link/create guest profile later

From an active stay:

`Save guest for future visits`

creates or links a profile without changing historic snapshot evidence.

## 7. Deposits

Business setting:

```text
Never required
Optional
Required for reservations
Required for all stays
```

Simple hotels can choose Never/Optional.

Advanced hotels retain deposit accounting.

## 8. Checkout

Paid stay:

```text
ROOM 6
John
Balance: KES 0

[ Check out ]
```

Unpaid:

```text
ROOM 6
John
Amount due: KES 3,000

[ Pay & Check Out ]
```

Payment methods appear inline.

## 9. Stay state machine

Recommended core states:

```text
RESERVED
READY
CHECKED_IN
CHECKED_OUT
CANCELLED
NO_SHOW
```

Room availability/condition remains separate from stay state.

## 10. Advanced workflows

Keep:

- future reservation;
- customer/guest profile;
- deposit;
- room charges;
- POS-to-room transfer;
- folio payment;
- folio reversal;
- room move;
- extend stay;
- late checkout;
- corporate/customer account;
- cancellation;
- no-show;
- block/out of order;
- housekeeping inspection.

These live under appropriate advanced/task views instead of obstructing quick check-in.

## 11. Room setup

Simple setup:

```text
Default nightly rate
KES 3,000

Default checkout
10:00 AM

Number of rooms
10

Room numbers
1–10

[ Create Rooms ]
```

Internally ServOS may create a default room type/rate plan.

Advanced setup can later introduce multiple room types/rates.

## 12. Room readiness

Statuses:

```text
READY
OCCUPIED
DIRTY
CLEANING
INSPECTION
BLOCKED
OUT_OF_ORDER
```

Front Desk should translate them into clear actions.

## 13. Housekeeping

Housekeeper view focuses on:

- rooms to clean;
- clean complete;
- inspection needed;
- maintenance/problem report;
- room blocked/unblocked by authorized role.

No pricing/folio/guest financial UI unless permission demands it.

## 14. Concurrency

Check-in/reservation must lock/check the room interval in PostgreSQL transactionally.

Two clients attempting Room 6 for overlapping intervals must result in one success and one deterministic `ROOM_UNAVAILABLE` conflict.

Client-side availability is advisory only.

## 15. Rates

Historic stay charge captures the actual applied rate.

Changing the default rate tomorrow must not rewrite yesterday's folio.

## 16. Folio terminology

Backend/internal documentation may use `folio`.

Simple UI should normally say:

- Guest bill
- Balance
- Charges
- Payments

Advanced hotel/accounting UI can expose Folio where appropriate.

## 17. Acceptance scenarios

Mandatory:

1. Walk-in, name only, 1 night, pay now, checkout.
2. Walk-in, pay at checkout.
3. Guest profile linked optionally.
4. Reservation → check-in → extra service → pay → checkout.
5. Deposit → check-in → apply deposit → checkout.
6. Extend stay.
7. Move room while maintaining financial history.
8. Concurrent attempt to book same room.
9. Dirty room prevents check-in when policy requires Ready.
10. Housekeeper cleans → room returns to available.
11. Network response loss during check-in resolves by command ID without duplicate stay.


---

# 09 — Catalog, Inventory and Procurement Reset

## 1. Principle

> ServOS stores technical units. People enter physical reality.

Operators should not manually calculate canonical quantities, package conversions or average unit cost.

## 2. Universal Add Item

Primary action:

`+ Add Item`

Choose:

- Beer / Soda / Bottled Drink
- Spirit / Liquor
- Wine
- Ingredient by weight
- Ingredient by piece
- Menu Dish
- Batch/Prepared Food
- Retail Item
- Service

The wizard determines which internal entities are needed.

## 3. Simple menu dish

```text
ADD MENU ITEM

Name
Beef Stew

Selling price
KES 550

Send to
Kitchen

[ Save ]
```

Recipe is optional.

Advanced:

`Track ingredients → Add recipe`

## 4. Packaged item

```text
Coca-Cola 330ml

How do you buy it?
Crate

Bottles per crate
24

Crate cost
KES 2,400

Sell one bottle for
KES 150

Opening stock
4 crates + 6 loose bottles
```

ServOS calculates:

- canonical pieces;
- cost per bottle;
- opening value;
- stock linkage;
- purchase package.

## 5. Spirit/Wine

```text
Jameson
Bottle: 750 ml
Bottle cost: 1,800

Sell as:
30 ml shot      200
60 ml double    350
750 ml bottle   4,500
```

Track:

- sealed bottles;
- open ml.

A whole-bottle sale requires sealed inventory.
A shot can consume open liquid and automatically open a sealed bottle when needed.

## 6. Ingredients

```text
Beef
Buy as: 5 kg pack
Pack cost: 3,500
```

ServOS stores canonical grams and derives cost per gram.

## 7. Recipes

Support:

### Per serving

```text
Beef 200g
Tomato 80g
Oil 20ml
```

### Batch

```text
Rice 2kg
Oil 200ml
Salt 30g
Produces 20 portions
```

ServOS derives per-serving consumption.

## 8. Stock screen

Task-first:

```text
[ Receive Delivery ]
[ Count Stock ]
[ Transfer ]
[ Waste ]

Low stock
Recent activity
Problems
```

"Stock Masters" is an advanced/admin concept, not daily navigation.

## 9. Physical count

Examples:

```text
Coke
Full crates: 3
Loose bottles: 5
ServOS count: 77 bottles
```

```text
Jameson
Sealed bottles: 8
Open liquid: 420 ml
```

```text
Beef
Full 5kg packs: 2
Loose: 1.2kg
ServOS count: 11.2kg
```

A reviewed count creates immutable variance movements.

## 10. Stock correction

Admin UI may say "Correct quantity", but backend records:

`ADMIN_CORRECTION`

with:

- before;
- after;
- delta;
- reason;
- note;
- actor;
- command;
- timestamp.

Never overwrite movement history.

## 11. Purchase order simple flow

```text
PURCHASE ORDER

Supplier
[ Choose / Quick add ]

+ Add item
```

Line:

```text
Coca-Cola 330ml
Buy as: Crate of 24
Quantity: 5 crates
Price: KES 2,400 per crate

ServOS calculated:
120 bottles
KES 12,000
```

Summary then:

`Save Draft` / `Approve Order`

## 12. Supplier quick create

Minimum:

- Name
- Phone optional

Advanced:

- PIN
- email
- payment terms
- contact person
- address
- notes.

Do not block drafting just because full supplier master data is incomplete.

## 13. Advanced line types

Default PO line is Item.

Advanced menu:

- Expense
- Asset

Do not make ordinary storekeepers classify accounting concepts for every stock purchase.

## 14. Receiving

`Receive Delivery`

Pre-fill outstanding quantity.

```text
Coke
Ordered 5 crates
Outstanding 5 crates

What arrived?
5 crates
Rejected/damaged: 0

ServOS will add 120 bottles

[ Receive everything ]
```

"Something is different" reveals exception controls.

## 15. Exceptions

Support:

- partial delivery;
- second partial delivery;
- rejected goods + reason;
- over-receipt + manager approval;
- wrong package;
- price mismatch;
- duplicate GRN/reference;
- response loss;
- invoice mismatch.

Invalid lines must block explicitly; never silently omit them.

## 16. Procurement backend transaction

Receipt command atomically:

- checks PO version;
- records goods receipt;
- converts packages;
- updates stock;
- records movements;
- updates average cost;
- updates PO received totals/status;
- creates audit/change feed.

## 17. Barcode design

A stock item may have multiple barcode aliases:

- individual bottle;
- pack;
- crate.

Each alias knows its quantity conversion.

Unknown scan:

```text
This barcode is not in ServOS.
[ Add this item ]
```

or during count:

- assign to existing item;
- create item;
- remove scan.

Count cannot finalize with unresolved unknown scans.

## 18. Average cost

Average unit cost is a calculated accounting result, not a routine data-entry field.

Operator supplies:

- what arrived;
- packaging;
- what supplier charged.

Backend calculates weighted cost.

## 19. POS relationship

Selling options consume the correct underlying stock.

Example Jameson tile → Shot/Double/Bottle, all mapped to one stock basis.

Avoid unrelated pseudo-products that require manual stock synchronization.

## 20. Acceptance

Prove:

- packaged drink create + opening stock;
- spirit sealed/open lifecycle;
- weighted receiving cost;
- recipe sale consumption;
- batch production;
- durable whole-location count;
- barcode package scan;
- transfer/waste physical units;
- admin correction audit;
- simple PO and advanced PO;
- partial receive + AP match;
- Web/Terminal results converge through same API commands.

---

# Reset Addendum — Procurement Lifecycle, Requisitions and Corrections

The repository audit after the first VPS-reset draft adds several non-optional workflow requirements.

## 21. PO lifecycle must become explicit

Current production code implements `purchaseOrder.create` and immediately describes the Native result as created/approved. The new backend must support a configurable purchasing policy:

```text
SIMPLE
Create → Issue

CONTROLLED
Draft → Submit → Approve → Issue
```

Then:

```text
Issue → Partial receive / Receive → Invoice match → Partial pay / Pay → Close
```

Add typed commands/endpoints for:

- create draft;
- submit;
- approve/reject;
- issue;
- amend/revise before receipt;
- cancel remaining quantity;
- close;
- duplicate/repeat.

Do not let clients assign arbitrary status strings.

## 22. Purchase-order and GRN printing

PO and GRN printing are now ServOS 1.0 requirements.

The procurement module produces typed Business Documents and submits them to the generic Terminal print spooler described in `23-BUSINESS-DOCUMENT-PRINTING.md`.

After PO issue:

```text
[ Print 80mm ] [ Preview ]
```

After receiving:

```text
Goods received.
[ Print GRN ] [ View PO ]
```

The procurement UI must not build ESC/POS bytes itself.

## 23. Physical supplier returns

A supplier return is not a receipt reversal.

Add a dedicated workflow for goods physically leaving the business and eventual supplier credit-note matching.

The V2 `procurement.reverseUnusedReceipt` idea is retained only for exact duplicate/recording corrections where the physical delivery did not happen twice.

## 24. Internal stock requisitions

Keep direct `inventory.transfer` for small operations.

Add optional controlled flow for central-store businesses:

```text
Request → Approve → Pick → Dispatch → Receive
```

This becomes first-class for resorts, multi-bar hotels, restaurants with central stores and larger venues.

## 25. Selected/spot counts

Port the V2 `inventory.countSelected` concept as a distinct command from full `inventory.countLocation`.

Use it for cycle counting and targeted checks. A selected count must never satisfy a full-location count requirement.

## 26. Correction taxonomy

Keep these distinct:

- current physical balance correction;
- exact recording/movement reversal;
- unused duplicate receipt reversal;
- supplier return;
- supplier credit-note/accounting correction.

Each has different physical, inventory and ledger effects.

## 27. Archive/reactivation

Port the V2 guard that prevents archiving stock still referenced by outstanding PO quantities.

Expose blockers in business language and provide direct links to affected orders.

Typed reactivation restores an archived item without rewriting historical documents.


---

# 10 — Receipts, Printing, Branding and Payment QR

## 1. Objective

Make printing web-first, immutable and hardware-tolerant while removing the fragile QR-specific raster path.

## 2. Document ownership

The API/domain layer issues immutable BusinessDocument snapshots for authoritative documents. The PWA caches documents required for reprint/offline operation. Physical printing is a capability of the current device.

Printing modes:

1. Browser print;
2. dedicated kiosk/default-printer mode after hardware acceptance;
3. optional ServOS Print Bridge for guaranteed silent raw ESC/POS.

## 3. Business logo placement

Business logo prints at the **top**.

Customer receipt:

```text
[ BUSINESS LOGO ]
Business name / contact / outlet

CUSTOMER COPY
Receipt / date / cashier

Items
Subtotal / tax / discount
TOTAL
Payment / change / balance

Thank-you

Scan to Pay via One app
[ PAYMENT QR PNG ]

Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440

feed / cut where supported
```

## 4. QR contract

Exact caption:

**Scan to Pay via One app**

QR is uploaded as PNG only.

ServOS does not decode/reconstruct QR modules.

## 5. One image pipeline

Both logo and QR use:

```text
PNG/image asset
   ↓
decode
   ↓
composite transparency onto white
   ↓
resize to printer profile
   ↓
monochrome 1-bit raster when ESC/POS required
   ↓
append_image()
```

Retire:

- QR grid detection;
- module pitch inference;
- quiet-zone reconstruction;
- QR-specific raster packing;
- square/module validation intended to rebuild the code.

Validate only that the PNG is bounded, decodable and printable.

## 6. Immutable snapshots

A receipt/document stores the branding/payment-QR representation or asset version used when issued. Changing business branding later must not silently rewrite historical output.

## 7. Browser print renderer

Each printable document has an HTML/CSS renderer with 80mm print stylesheet:

- explicit width;
- no browser headers/footers where deployment permits;
- predictable margins;
- page-break rules;
- high-contrast monochrome assets;
- large enough text for real thermal output.

Browser print is the universal fallback.

## 8. Raw ESC/POS renderer

When Print Bridge is paired, the PWA sends a typed/signed document job. The bridge produces ESC/POS bytes and uses Windows RAW or LAN TCP transport.

The browser never sends arbitrary raw ESC/POS bytes.

## 9. Print status language

Use accurate states:

```text
QUEUED
SENDING
SENT_TO_SPOOLER
DELIVERY_UNCERTAIN
FAILED
CANCELLED
```

Do not claim physical paper success when the protocol cannot prove it.

## 10. Reprints

Reprints use the immutable document snapshot, not current mutable transaction state.

Where appropriate mark:

`REPRINT`

and retain reprint audit metadata.

## 11. Business document family

The same printing architecture handles:

- receipt/refund;
- PO;
- GRN;
- supplier return;
- requisition/transfer;
- stock count/variance;
- cash-up/till close;
- customer credit statement;
- folio statement;
- reservation confirmation;
- housekeeping list;
- maintenance work order;
- KOT/BOT.

## 12. Acceptance

No printing release is accepted from unit tests alone. Physically verify on target printers and paper, including QR scan success, cutter margins, long documents, repeated jobs and disconnect/retry uncertainty.

See `28-SILENT-PRINTING-PRINT-BRIDGE.md` and `23-BUSINESS-DOCUMENT-PRINTING.md`.


---

# 11 — Authentication, Security, RBAC and Device Trust

## 1. Security model

The API is the enforcement boundary.

Hiding a button is usability, not authorization.

Every mutation verifies:

- authenticated principal;
- active staff membership;
- business scope;
- permission;
- device trust where required;
- manager approval where required;
- command/version/offline policy.

## 2. Identities

Separate concepts:

```text
User identity
Staff record
Business membership
Role(s)
Device
Session
```

This avoids forcing every local staff member to have a cloud login while still supporting secure remote access.

## 3. Web authentication

Recommended pattern:

- username/email/phone identity as product policy determines;
- password hashed with a modern memory-hard password hash;
- short-lived access token;
- rotating refresh token in Secure, HttpOnly cookie;
- access token kept in memory where practical;
- exact-origin CORS;
- CSRF defense for cookie-authenticated mutation paths;
- session/device listing and revoke.

Do not store long-lived refresh tokens in `localStorage`.

## 4. Terminal authentication

Online:

- enrolled device identity;
- operator signs in;
- refresh credential stored in OS keyring/credential store;
- API access token short lived.

Offline:

- local PIN may unlock a previously provisioned staff identity;
- local PIN does not manufacture server authority;
- command capability remains constrained by active offline grant and cached permission policy.

## 5. Device enrollment

Suggested flow:

```text
Admin logs in online
   ↓
Settings → Devices → Enroll Terminal
   ↓
server creates one-time enrollment challenge
   ↓
Terminal exchanges challenge
   ↓
device keypair/secret registered
   ↓
server returns device identity
   ↓
challenge expires permanently
```

Device can later be:

- renamed;
- scoped to outlet;
- suspended;
- revoked;
- replaced.

## 6. Roles

Canonical roles:

- Admin
- Manager
- Cashier
- Server/Waiter
- Chef/Kitchen
- Storekeeper
- Receptionist
- Housekeeper
- Accountant
- Custom

Role names are convenience presets over permissions.

## 7. Permissions

Examples:

```text
pos.sell
pos.discount
pos.comp
pos.refund
payment.record
payment.reconcile
inventory.view
inventory.receive
inventory.count
inventory.transfer
inventory.waste
inventory.correct_quantity
procurement.create
procurement.approve
procurement.receive
procurement.pay_supplier
hospitality.view
hospitality.check_in
hospitality.check_out
hospitality.move
hospitality.manage_rates
housekeeping.update
credit.charge
credit.settle
staff.manage
settings.manage
backup.request
reports.view
```

One permission string everywhere.

## 8. Workspace visibility

Navigation uses primary-purpose permissions.

Do not use generic `records.view` or `business.view` to admit users into operational workspaces.

Examples:

```text
POS → pos.sell
Stock → inventory.view/receive/count based on screen
Administration → settings.manage/staff.manage/import permission
```

## 9. Manager approvals

Sensitive action can request approval in-app.

Manager authenticates/approves within the dialog.

Approval is bound to:

- initiator;
- action;
- target;
- amount/threshold where applicable;
- expiry;
- single use.

No manual token copy/paste.

## 10. Secrets

Never commit:

- DB passwords;
- JWT secrets;
- SMTP passwords;
- device secrets;
- production test credentials;
- service-role keys.

Production secrets live in server secret environment/files readable only by root/deployment service.

Repository contains `.env.example` placeholders only.

## 11. TLS and network

Public ports:

```text
22   SSH, preferably restricted
80   redirect/ACME only
443  HTTPS
```

PostgreSQL is not exposed publicly.

Internal Docker network carries database traffic.

Admin database tools should be reached through SSH tunnel/VPN, not open Internet ports.

## 12. SSH hardening

- key authentication;
- disable password SSH where operationally possible;
- disable direct root login after bootstrap;
- named sudo deployment/admin user;
- firewall allow list where practical;
- automatic security updates or a documented patch cadence;
- fail2ban/rate controls as appropriate.

## 13. API hardening

- request body size limits;
- rate limiting on login/recovery/enrollment;
- structured validation;
- no stack traces in production responses;
- parameterized SQL only;
- security headers;
- exact CORS origin list;
- upload MIME/signature checks;
- CSV formula-injection neutralization on exports;
- log redaction.

## 14. Business isolation

Every domain query is business-scoped.

Tests deliberately attempt cross-business IDs and require `NOT_FOUND` or `PERMISSION_DENIED` without disclosing data.

Do not trust `businessId` from command payload without checking it against session membership.

## 15. Audit

Sensitive actions record:

- actor;
- effective role/permission;
- device;
- IP/session metadata where appropriate;
- approval;
- reason;
- target;
- before/after summary;
- command ID.

## 16. Password and account recovery

Recovery tokens:

- random/high entropy;
- one time;
- short lived;
- hashed at rest if stored;
- invalidate prior recovery tokens on use;
- audit recovery.

## 17. Security release gate

Before production:

- dependency audit;
- secret scan;
- authorization tests;
- cross-business isolation tests;
- login rate-limit test;
- session revoke test;
- device revoke test;
- offline grant signature/expiry tests;
- upload validation test;
- backup encryption/access review;
- no database public exposure;
- TLS grade/manual verification.


---

# 12 — VPS Production Deployment Runbook

## 1. Public endpoints

Frontend/PWA:

`https://serveos.davemusau.co.ke`

API:

`https://serveosapi.davemusau.co.ke`

Both resolve to the same VPS for the initial production deployment.

## 2. Observed server baseline

The pre-reset audit found a Ubuntu 24.04-class VPS with 4 vCPU, ~7.8 GiB RAM and ~142 GB root storage, Docker active, Nginx active and existing workloads already using localhost ports 3000/3001.

Treat this as planning evidence only. Recheck current state before deployment.

## 3. Coexistence rule

ServOS must not disturb existing services.

Use:

```text
/opt/serveos
/var/www/serveos
serveos-* container names
serveos internal Docker network
127.0.0.1:3101 API binding (example)
```

Do not reuse unrelated PostgreSQL/Redis containers.

## 4. Frontend deployment

Build PWA in CI or a controlled build environment.

Deploy immutable static artifact:

```text
/var/www/serveos/releases/<git-sha>/
/var/www/serveos/current -> releases/<git-sha>
```

Nginx directly serves `current`.

Versioned assets get long immutable cache headers. `index.html`, service worker and release metadata must use update-safe cache rules.

## 5. Backend containers

Initial Compose services:

```text
api
worker
postgres
backup
```

API binds to loopback only. PostgreSQL has no public host port.

## 6. Nginx

Host Nginx remains public ingress because it already owns 80/443.

Create two dedicated site configs only. Test with `nginx -t` before reload.

API proxy must support long-lived SSE/change-feed notification endpoints without accidental buffering/timeouts.

## 7. DNS and TLS

Point both subdomains at the VPS.

Use existing Certbot/Nginx ACME operational pattern. Require HTTPS.

Do not enable HSTS until both hostnames and certificate renewal are proven stable.

## 8. Production secrets

Server-only secret store/environment includes:

```text
DATABASE_URL
SESSION/JWT signing secrets
password pepper if used
PUBLIC_WEB_ORIGIN=https://serveos.davemusau.co.ke
PUBLIC_API_URL=https://serveosapi.davemusau.co.ke
SMTP credentials
backup destination credentials
telemetry/logging config
```

Never bake secrets into PWA assets.

## 9. First deployment

1. schedule/perform any required host reboot from OS maintenance and verify existing services;
2. create `/opt/serveos` and `/var/www/serveos`;
3. create Docker network/volumes;
4. start PostgreSQL;
5. run migrations from release image;
6. run database verification;
7. start API/worker;
8. verify `/health/live` and `/health/ready`;
9. publish frontend release;
10. enable Nginx sites/TLS;
11. run browser/PWA smoke tests;
12. prove backup and isolated restore.

## 10. Release process

```text
Git SHA
 ↓
CI tests
 ↓
build API/worker image + frontend artifact
 ↓
push immutable image digest
 ↓
server pulls exact digest
 ↓
pre-deploy backup/checkpoint when warranted
 ↓
expand-safe migration
 ↓
start/replace API
 ↓
ready check
 ↓
publish frontend SHA
 ↓
smoke/PWA tests
 ↓
record deployed release
```

Never rely on mutable `latest` without recording exact digest/SHA.

## 11. Rollback

Frontend: switch `current` symlink to prior release.

API: redeploy prior image if database schema remains backward compatible.

Prefer expand/contract migrations so application rollback is possible.

## 12. Backup

Run database backup process on VPS but send encrypted copies to an independent destination. Same-VPS-only backups do not satisfy disaster recovery.

## 13. Firewall

Public:

- 80/443;
- SSH according to administrative policy.

Private:

- PostgreSQL;
- worker internals;
- metrics endpoints unless protected.

## 14. Staging

Preferred:

```text
serveos-staging.davemusau.co.ke
serveosapi-staging.davemusau.co.ke
```

Use separate database, secrets, IndexedDB origin and device enrollments. Never point staging at production DB.

## 15. Production preflight

Before every major deployment verify:

```text
free -h
df -h
docker ps
docker system df
ss -tulpn
nginx -t
```

Do not blindly prune Docker on this shared VPS.

See `29-SAME-VPS-PRODUCTION-TOPOLOGY.md`.


---

# 13 — CI/CD, Observability, Backup and Disaster Recovery

## 1. Pull-request gates

Required:

```text
lockfile install
lint/format/typecheck
unit/domain tests
API contract generation/check
DB migration from zero
API integration tests
PWA browser tests
IndexedDB migration tests
offline command tests
printing contract tests
security/secret scan
documentation/link checks
```

During migration retain native Rust tests as behavioral evidence until equivalent new tests exist.

## 2. Main/release gates

Additionally:

- production PWA build;
- API/worker container builds;
- service-worker/offline-shell tests;
- browser restart/pending-command tests;
- prior-schema migration upgrade;
- command registry parity;
- OpenAPI diff review;
- Compose config validation;
- container/security scan where available;
- backup + restore proof;
- PWA install/update smoke test.

## 3. Release manifest

Record:

```text
Git SHA
frontend artifact hash
API image digest
worker image digest
DB migration version
protocol version
PWA cache version
Print Bridge minimum/compatible version
browser support baseline
acceptance evidence IDs
known limitations
```

## 4. Logs

Structured server logs include:

- request/correlation ID;
- command ID;
- business/device/actor IDs where safe;
- operation;
- duration;
- result code;
- conflict/rejection category;
- cursor range;
- no secrets/full payment credentials.

## 5. Browser telemetry

Collect privacy-conscious operational diagnostics such as:

- PWA release;
- last sync cursor/time;
- pending/unknown counts;
- IndexedDB schema version;
- offline grant expiry;
- storage persistence state;
- Print Bridge version/state when installed;
- client errors with bounded/sanitized context.

Do not upload raw local business databases for diagnostics.

## 6. Health endpoints

API:

```text
/health/live
/health/ready
/version
```

Readiness checks database/migration/protocol dependencies without exposing secrets.

## 7. Backup layers

### PostgreSQL authoritative backup

Automated scheduled backups plus PITR/WAL where feasible.

### Offsite copy

Mandatory independent failure domain.

### Browser recovery backup

Export unresolved commands, projection and immutable local documents without reusable auth credentials.

### Document retention

Issued receipts/POs/GRNs/statements are immutable snapshots and follow configured retention policy.

## 8. Restore rehearsal

At least before launch and periodically thereafter:

- restore DB to isolated container;
- boot matching API release;
- verify migrations;
- run domain sanity checks;
- verify command/audit/document continuity;
- record restore duration.

## 9. Alerts

Initial practical alerts:

- disk > threshold;
- memory pressure/swap growth;
- DB backup overdue/failure;
- restore verification overdue;
- API readiness failure;
- repeated 5xx;
- command UNKNOWN backlog;
- worker backlog age;
- database connection exhaustion;
- change-feed lag.

## 10. PWA release safety

A new Service Worker must not activate mid-transaction. Test update-ready and safe-boundary activation explicitly.

## 11. Print Bridge releases

Print Bridge has independent semantic versioning because it is optional local hardware software. The API/PWA advertises compatible versions and degrades to browser printing if bridge is absent/incompatible.


---

# 14 — Migration and Production Cutover

## 1. Goal

Move existing ServOS installations/data to the new VPS backend without reintroducing two competing writers.

## 2. Non-negotiable rule

There must never be a production period where:

```text
old cloud writer = ON
and
new API writer = ON
```

for the same business truth.

## 3. Determine the source of truth per business

Before migration, classify each installation:

### Case A — Terminal/local state authoritative

Use SQLite export as migration source.

### Case B — Current V2 cloud authoritative

Use V2/PostgreSQL export as source.

### Case C — both contain real transactions

Do not "merge automatically" by updated timestamp.

Run reconciliation and explicitly resolve differences before cutover.

## 4. Migration tool

Build a dedicated CLI/tool, not ad hoc SQL copy/paste.

Example:

```text
serveos-migrate inspect
serveos-migrate export
serveos-migrate dry-run
serveos-migrate import
serveos-migrate verify
```

Legacy readers live outside production API runtime.

## 5. Migration manifest

Export includes:

```text
source type/version
business identity
export timestamp
source terminal/project IDs
entity counts
content hashes
sequence/document counters
control totals
records/pages
unsupported/unmapped data list
```

Credential fields are excluded.

## 6. Data domains to reconcile

At minimum:

- business/settings;
- staff/roles;
- outlets/service areas;
- stock/storage locations;
- items/stock links/packages/barcodes;
- current stock by location;
- movement history if retained;
- recipes;
- suppliers;
- open/closed POs as retention policy requires;
- tills/open sessions;
- orders/payments/receipts;
- customer credit;
- rooms/types/rates;
- reservations/stays/folios;
- assets/maintenance;
- document numbering.

## 7. Control totals

The verifier compares business-level totals such as:

```text
active item count
stock quantity by item/location
stock value
open till expected cash
paid sales totals by day
M-Pesa totals
unsettled credit
supplier payable balances
active reservations/stays
open folio balances
room count/status
receipt/document max sequence
```

No cutover if unexplained differences remain.

## 8. Dry run

Migration is first executed against an isolated staging database.

Output:

- imported counts;
- rejected records;
- transformed records;
- warnings;
- control-total differences;
- unsupported legacy features.

The dry run produces no production mutation.

## 9. Cutover window

Recommended sequence:

```text
1. Announce maintenance/cutover window
2. Stop business mutations or close shift
3. Force old outbox/sync to known state where relevant
4. Take local SQLite backup
5. Take old cloud backup
6. Export final migration manifest
7. Hash/freeze source
8. Import to new PostgreSQL
9. Verify entity counts/hashes
10. Verify business control totals
11. Create/enroll production devices/users
12. Bootstrap Terminal from new API into fresh/new projection
13. Run read-only comparison
14. Fence old cloud mutation paths
15. Enable new API production mutation
16. Run smoke transaction suite
17. Reconcile first live sale/payment/stock/room operation
18. Reopen full trading
```

## 10. Terminal migration

Do not simply point the existing legacy SQLite database at the new API.

Preferred approach:

- preserve old SQLite as evidence/rollback artifact;
- build a clean new projection from API bootstrap;
- migrate terminal-only hardware preferences selectively;
- verify printer/scanner;
- retain legacy DB read-only for defined rollback period.

This ensures the new sync state begins with a clean cursor and known schema.

## 11. Old Supabase/V2

After successful cutover:

- disable/fence mutation RPCs;
- remove client credentials from active apps;
- preserve DB read-only for agreed retention/rollback window;
- export/archive required evidence;
- decommission later.

Do not maintain permanent dual synchronization.

## 12. Rollback decision point

Before new live transactions accumulate, rollback is straightforward: return clients to old release/source.

After meaningful new transactions occur on the new API, rollback must not simply reactivate the old writer because it lacks those transactions.

At that point recovery is:

- repair new platform; or
- migrate new transactions back through an explicit reverse procedure.

Define the rollback cutoff in the cutover runbook.

## 13. Cutover smoke suite

Immediately prove:

- login/session;
- item lookup;
- till open;
- sale/payment;
- receipt print;
- stock decrement;
- room quick check-in if enabled;
- Web sees Terminal change;
- Web command reaches Terminal projection;
- restart Terminal;
- command ID replay does not duplicate.

## 14. Post-cutover monitoring

For initial period watch closely:

- API errors;
- sync cursor lag;
- unknown commands;
- DB locks/slow queries;
- stock/financial control totals;
- printer queue issues;
- authentication/session failures.

## 15. Migration completion evidence

Archive:

- source backups;
- source manifest hash;
- target schema version;
- target control totals;
- migration tool version/SHA;
- verifier output;
- accepted differences with signed reason;
- cutover timestamp;
- deployed release SHA;
- first-live-transaction evidence.


---

# 15 — Test and Acceptance Master Matrix

## 1. Philosophy

ServOS passes when real business journeys survive realistic failure. A green unit suite is necessary but not sufficient.

The web-first product must prove application behavior, browser persistence, API authority, business invariants, offline recovery, physical printing and backup restoration.

## 2. Test layers

- **Unit:** calculations and state transitions.
- **Domain integration:** real PostgreSQL transactions.
- **Contract:** command schemas, permissions, documents, protocol versions.
- **API:** auth, idempotency, concurrency, change feed.
- **PWA:** browser UI, service worker, IndexedDB, offline/reconnect.
- **Hardware:** scanner and XP-80T class printers.
- **Print Bridge:** localhost pairing, RAW/TCP transport, uncertainty handling.
- **Migration:** legacy SQLite/Supabase/V2 import/reconciliation.
- **Chaos:** network loss, API restart, DB restart, browser kill, power/reboot simulation.
- **Restore:** server and local recovery evidence.

During refactor retain the existing Native/Rust suite until equivalent tests exist in the new stack.

## 3. Baseline gate

The known merged reset baseline passes 216 JavaScript/source tests and 106 native Rust/domain tests. New work must not casually weaken invariants those tests represent.

## 4. PWA installation/startup

Prove:

- first online load;
- install to Windows desktop/start menu;
- standalone display mode;
- reload;
- browser/machine restart;
- cached offline launch;
- safe service-worker update;
- no forced update during payment/count/check-in;
- storage-persistence status shown to admin;
- corrupted/old IndexedDB migration fails safely and recoverably.

## 5. POS Tier A

- open assigned till;
- barcode/search;
- add/remove quantity/modifier/portion;
- table/tab;
- cash;
- manual M-Pesa evidence;
- card;
- split tender;
- discount approval;
- comp vs void;
- refund;
- immutable receipt;
- reprint;
- close till;
- variance workflow.

## 6. Offline POS

Scenario:

```text
online bootstrap
→ disable internet
→ sell
→ cash payment
→ document created locally
→ close PWA
→ reopen still offline
→ sale remains
→ print/reprint
→ reconnect
→ same command ID confirmed once
→ server and local projection converge
```

Also test grant expiry, disallowed command, lost response, browser crash during sync, duplicate click and two tabs.

## 7. Inventory

- simple packaged item;
- spirit sealed/open;
- opening stock;
- receive packages;
- weighted cost;
- selected count/full-location count;
- barcode scan;
- transfer;
- waste;
- corrections;
- reversal rules;
- recipe/batch consumption;
- no negative stock creation;
- archive dependencies;
- offline count draft/recovery.

## 8. Procurement

- quick supplier;
- draft PO;
- submit/approve/issue policy;
- package quantities;
- full/partial receive;
- rejected goods;
- outstanding remainder;
- over-receipt policy;
- GRN;
- supplier return;
- invoice match;
- duplicate invoice reference;
- supplier payment;
- duplicate payment idempotency;
- cancel remaining PO;
- duplicate/repeat PO.

## 9. Hospitality

Simple flow:

```text
available room
→ Check In
→ inline guest snapshot
→ pay now or later
→ stay
→ Pay & Check Out / Check Out
```

No persistent customer account or deposit required unless policy requires it.

Advanced tests:

- reservation;
- customer profile link;
- deposit;
- folio charges;
- extension;
- room move;
- housekeeping transition;
- maintenance block;
- no-show/cancel;
- double-book prevention.

Offline test initially uses a single reception device holding room authority lease.

## 10. API protocol

- valid command;
- validation failure;
- permission denial;
- stale version;
- same ID/same payload replay;
- same ID/different payload mismatch;
- response lost after commit;
- status lookup;
- concurrent conflicting commands;
- ordered change cursor;
- repeated change batch;
- bootstrap verification;
- unsupported protocol/client update requirement.

## 11. Browser synchronization

- one sync leader across tabs;
- pending commands persist after reload;
- `OUTCOME_UNKNOWN` resolution;
- projection update and cursor commit are atomic;
- conflict does not advance local state falsely;
- revoked device blocks future authority;
- cleared session does not silently erase unresolved command evidence;
- local reset blocked or explicitly confirmed when pending work exists.

## 12. Receipt / QR

- logo top;
- QR PNG only;
- same image pipeline for logo and QR;
- exact text `Scan to Pay via One app`;
- QR prints below text;
- printed QR scans;
- no cutoff;
- historical receipt unchanged after settings update;
- browser print version;
- bridge ESC/POS version;
- 5 consecutive receipts;
- long receipt;
- short receipt.

## 13. Business-document printing

Physical XP-80T tests:

- PO 1 line / 20+ lines;
- PO long names;
- revision/reprint marking;
- GRN partial/rejected;
- supplier return;
- stock count sheet;
- variance report;
- cash-up/till close;
- customer credit statement;
- guest folio statement;
- housekeeping/work order;
- KOT/BOT;
- separate printer roles;
- USB and LAN where supported.

## 14. Print Bridge failure tests

- bridge absent → browser print fallback;
- bridge version incompatible;
- bridge restart;
- Windows restart;
- printer offline;
- cable disconnect during write;
- `DELIVERY_UNCERTAIN` requires explicit duplicate-risk retry;
- same job ID not printed twice automatically;
- malicious/oversized payload rejected;
- request from wrong origin rejected;
- offline signed local job accepted on paired device.

## 15. Responsive viewports

Every Tier-A operator flow at:

- 1024×600;
- 1280×720;
- 1280×800;
- 1366×768;
- 1920×1080;
- 800×1280;
- 390×844.

Assert primary action visibility, internal modal scrolling, no accidental horizontal page scroll, touch targets, keyboard efficiency, scanner safety and soft-keyboard survival.

## 16. Performance

Measure on modest POS hardware:

- PWA cold/warm launch;
- initial bootstrap;
- POS search latency;
- item add/cart update;
- IndexedDB transaction latency;
- change-feed catch-up;
- large stock count;
- front desk board;
- API p50/p95;
- database slow queries;
- service-worker update download size.

The current >1 MB main JS chunk is a known optimization target.

## 17. Security

- cross-business isolation;
- explicit CORS origin;
- CSP;
- revoked/expired session/device;
- one-use approvals;
- rate limits;
- malicious file/CSV input;
- no secrets in logs/PWA bundle;
- DB not public;
- Print Bridge loopback/origin/signature enforcement;
- device private key non-exportability where supported.

## 18. Migration

- config-only business;
- full history;
- stock/value controls;
- open till/tab/folio;
- outstanding credit/AP;
- document numbering;
- unsupported source data blocks visibly;
- repeat import is idempotent;
- old writers fenced after cutover.

## 19. Disaster recovery

- restore PostgreSQL to isolated environment;
- boot matching API;
- recover frontend release;
- enroll replacement PWA device;
- bootstrap projection;
- import local recovery bundle containing unresolved commands;
- resolve each command ID;
- resume without duplicate financial effects.

## 20. Pilot-day release gate

A real business completes a full operating day including at least one controlled network outage and one printer interruption with **no developer database intervention**.

Only then can ServOS 1.0 be called deployable.


---

# 16 — Phased Development Roadmap

## Phase 0 — Freeze, evidence and hygiene

- keep `reset/vps-platform` as reset branch;
- preserve `pre-vps-reset-2026-10-06` tag;
- capture passing baseline evidence;
- decide generated-file policy;
- commit/reset documentation intentionally;
- remove probe/debug/credential debris;
- rotate any exposed secrets;
- freeze new Tauri business features.

**Exit:** clean reproducible baseline.

## Phase 1 — Repository/package boundaries

Create incremental monorepo structure for Web, API, worker and optional Print Bridge plus shared contracts/domain packages.

**Exit:** existing build/tests still pass and new code cannot invent commands/permissions outside registries.

## Phase 2 — Same-VPS foundation

- production/staging directory layout;
- host Nginx strategy;
- API Docker skeleton;
- PostgreSQL;
- worker;
- migrations;
- health/readiness;
- log structure;
- offsite backup target;
- restore proof.

**Exit:** blank backend deploys/restores without affecting existing VPS workloads.

## Phase 3 — Identity/device/command kernel

- sessions;
- roles/permissions;
- PWA device enrollment;
- WebCrypto key registration;
- command table/idempotency;
- expected versions;
- audit;
- change cursor;
- command status;
- bootstrap;
- SSE notification.

**Exit:** synthetic client can replay safely and rebuild projection.

## Phase 4 — PWA offline kernel

- IndexedDB schema/migrations;
- projection stores;
- durable outbox;
- sync leader/multi-tab coordination;
- persistent-storage request;
- offline grant store;
- backup export/import;
- safe Service Worker update boundary.

**Exit:** pending command survives browser restart and reconciles once.

## Phase 5 — Catalog/inventory and business setup

Move business profiles, locations, item creation, physical packaging, bottles, barcodes, stock movements, selected/full counts, transfers/waste/corrections, recipes/batches to new API/PWA.

**Exit:** critical inventory scenarios no longer depend on legacy cloud RPC.

## Phase 6 — POS/payments/tills/documents

- POS/order model;
- payments;
- till sessions;
- refund/void/comp;
- BusinessDocument core;
- receipt snapshot;
- new logo/QR shared image pipeline;
- browser print.

**Exit:** full online sale through new API only.

## Phase 7 — Offline POS

Implement bounded device grant, local sale/payment projection, number allocation and reconnect reconciliation.

**Exit:** full controlled offline sale/restart/reconnect acceptance passes.

## Phase 8 — Print Bridge

Extract tested Rust printer transport into optional service. Implement pairing/security, generic document rendering, printer roles and durable local spool.

**Exit:** browser fallback and silent ESC/POS path both pass real hardware tests.

## Phase 9 — Procurement/AP

Refined PO/GRN/return/invoice/payment flow plus thermal printing and repeat-order workflow.

**Exit:** storekeeper can order/receive/print without canonical-unit/accounting ceremony.

## Phase 10 — Hospitality

Simple walk-in guest snapshot + advanced reservation/folio/deposit model. Add room board/housekeeping. Add offline room lease only after online flow is stable.

**Exit:** simple and advanced property scenarios pass.

## Phase 11 — Finance/credit/maintenance/assets/imports

Port remaining critical domains with command/audit/document consistency. Keep high-risk operations online unless explicit offline authority exists.

## Phase 12 — UX consolidation

- eliminate duplicated Native/Web views from active product;
- task-first navigation;
- capability-based business setup;
- responsive acceptance;
- settings cleanup;
- guided help;
- human error/recovery states;
- route/domain code splitting.

## Phase 13 — Migration tooling

Build one-time exports/imports from legacy SQLite/Supabase/V2. Validate control totals and forbid bidirectional old/new sync.

## Phase 14 — Staging torture

Run concurrent clients, offline/reconnect, lost response, API/DB restarts, PWA update, printer/bridge failure and backup restore.

## Phase 15 — Pilot

One real hospitality business completes a full day on Web Terminal mode.

## Phase 16 — Cutover

Fence old writers, deploy production PWA/API, migrate selected data, monitor, maintain rollback evidence.

## Phase 17 — Tauri retirement

After pilot/cutover evidence:

- remove Tauri app from supported production product;
- retain archived test/reference code as needed;
- keep optional Print Bridge as independent hardware component;
- delete old Supabase/V2 authority/cutover machinery after migration window.

## Features deliberately postponed

Until core maturity:

- speculative AI;
- additional payment providers;
- predictive dashboards;
- complex loyalty;
- multiple new industry verticals;
- premature microservices;
- unsupported multi-device offline authority.


---

# 17 — Code Quality, Enhancement and Cleanup Standard

## 1. Purpose

The reset must improve maintainability, not simply relocate existing complexity from Supabase SQL to Node.js.

## 2. Maximum responsibility rule

A file/component/service should have one understandable reason to change.

Large pages are composed from workflows; route handlers are thin; domain services own decisions.

## 3. Route handlers

A route should mostly:

```text
parse auth/request
validate schema
call application service
map result/error
return response
```

Do not put 300 lines of business mutation logic inside HTTP routes.

## 4. Domain services

Name by action:

```text
checkInGuest()
receivePurchaseOrder()
recordPayment()
closeTill()
countStockLocation()
```

Inputs are typed.
Outputs are typed.
Transaction context is explicit.

## 5. Avoid boolean soup

Replace calls like:

```text
saveItem(true,false,true,false)
```

with explicit objects/enums.

## 6. No silent catch

Exceptions/errors must be:

- handled into a known domain result;
- logged with request/command context;
- or propagated to the API error boundary.

Never `catch {}` a transactional failure.

## 7. No browser primitives for serious workflows

Do not use:

- `window.prompt`;
- `window.confirm`;
- `alert()`

for approvals, money, stock, refunds or other real workflows.

Use shared components.

## 8. Data mutations

No direct mutation from React component to database.

No feature-specific hidden fetch contract.

Every business mutation calls the shared command client.

## 9. Transactional invariants

Use database transaction + row/version locks where required.

Do not simulate transaction safety with multiple sequential API calls from the UI.

## 10. Money and quantity helpers

One shared exact arithmetic library/API.

Ban ad hoc:

```text
parseFloat(price) * quantity
```

for authoritative money calculations.

## 11. Time

One business-time package.

No scattered `new Date(string)` assumptions for room checkout/business-day logic.

## 12. Error codes

Stable enum/registry.

No components parsing raw database error strings.

## 13. Feature flags

Use explicit typed feature flags/capabilities.

Do not create hidden environment branches across many files.

## 14. Dead code policy

After replacement passes acceptance:

- remove old implementation;
- do not leave two "just in case" production paths;
- retain historical code through Git tags/archives.

## 15. TODO policy

TODOs affecting correctness must link to tracked issue/work item and must not be buried inside released critical paths without documented acceptance limitation.

## 16. Code review checklist

Every business mutation review asks:

- What command is this?
- What permission protects it?
- What exact rows/resources does it depend on?
- Is it idempotent?
- What happens on response loss?
- What happens on concurrent edit?
- What audit is created?
- What change feed is created?
- Is it allowed offline?
- What does the operator see on rejection?

## 17. UI review checklist

- Is this the simplest path?
- Is Advanced hiding technical complexity appropriately?
- Does it fit 1024×600?
- Does it work with touch and keyboard?
- Does failure preserve input?
- Is permission/disabled reason understandable?
- Does role need to see this workspace?

## 18. Database review checklist

- correct FK/unique/check constraints;
- index for query pattern;
- money exact;
- timezone clear;
- mutation transaction atomic;
- audit/history retained;
- deletion/archive semantics defined;
- migration forward compatible.

## 19. Test review checklist

Every bug fix gets a regression test at the lowest useful layer and, for critical workflow bugs, an end-to-end acceptance scenario.

## 20. Definition of clean

The codebase is considered substantially cleaned when:

- current architecture can be explained without legacy exceptions;
- one command vocabulary exists;
- one permission matrix exists;
- one migration chain exists;
- one receipt pipeline exists;
- one sync protocol exists;
- old writers are impossible to invoke in production;
- critical files are decomposed into testable workflows;
- CI automatically catches protocol drift.

## Web-first cleanup additions

- Delete duplicate Native/Web feature implementations only after PWA/API replacement has equivalent acceptance coverage.
- Do not add new Tauri business-domain operations.
- No production PWA code imports Supabase clients or direct database RPC helpers.
- IndexedDB access goes through typed repositories; no business workflow stores durable truth in `localStorage`.
- Service Worker caches application assets, not mutable business truth.
- Print Bridge is a hardware adapter with an explicit dependency boundary; it cannot import inventory/hospitality/finance domain modules.
- Route/domain code splitting is required to reduce the current oversized startup bundle.
- Browser multi-tab sync leadership must be deterministic and testable.


---

# 18 — API Endpoint Catalog

This is the proposed external HTTP surface for ServOS 1.0. Exact response fields are generated from `packages/contracts`; this file defines intent and ownership.

## 1. Health

```text
GET /health/live
GET /health/ready
```

`live` proves the process responds.
`ready` proves required database/schema dependencies are usable.

## 2. Session/Auth

```text
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
POST /v1/auth/password/forgot
POST /v1/auth/password/reset
GET  /v1/session
GET  /v1/sessions
DELETE /v1/sessions/:id
```

## 3. Device enrollment

```text
POST /v1/devices/enrollment-challenges
POST /v1/devices/enroll
GET  /v1/devices
PATCH /v1/devices/:id
POST /v1/devices/:id/revoke
POST /v1/devices/:id/bootstrap
```

## 4. Commands

```text
POST /v1/commands
GET  /v1/commands/:id
```

All transactional business mutations flow through this interface.

## 5. Sync

```text
GET /v1/sync/changes?after=<cursor>&limit=<n>
GET /v1/sync/stream
GET /v1/sync/status
```

Possible admin/device diagnostics:

```text
GET /v1/devices/:id/sync-status
```

## 6. Offline grants

```text
POST /v1/offline-grants/issue
POST /v1/offline-grants/renew
POST /v1/offline-grants/:id/revoke
GET  /v1/offline-grants/current
```

Issuance is restricted and policy-driven.

## 7. Business/settings reads

```text
GET /v1/business
GET /v1/business/capabilities
GET /v1/settings
GET /v1/locations
GET /v1/service-areas
```

Mutations remain commands such as `business.updateIdentity`, `settings.updateReceipt`, etc.

## 8. Catalog queries

```text
GET /v1/catalog/items
GET /v1/catalog/items/:id
GET /v1/catalog/families
GET /v1/catalog/barcodes/:barcode
GET /v1/catalog/categories
```

Suggested filters:

- search;
- category;
- active;
- sellable;
- stocked;
- outlet/service area.

## 9. Inventory queries

```text
GET /v1/inventory/stock
GET /v1/inventory/stock/:stockItemId
GET /v1/inventory/locations/:locationId/stock
GET /v1/inventory/movements
GET /v1/inventory/count-sessions/:id
GET /v1/inventory/alerts
```

## 10. POS queries

```text
GET /v1/pos/menu
GET /v1/orders
GET /v1/orders/:id
GET /v1/tills
GET /v1/tills/current
GET /v1/receipts
GET /v1/receipts/:id
```

## 11. Payments/finance reads

```text
GET /v1/payments
GET /v1/mpesa/transactions
GET /v1/mpesa/reconciliation
GET /v1/credit/accounts
GET /v1/credit/accounts/:id/statement
```

## 12. Procurement

```text
GET /v1/suppliers
GET /v1/suppliers/:id
GET /v1/procurement/purchase-orders
GET /v1/procurement/purchase-orders/:id
GET /v1/procurement/goods-receipts
GET /v1/procurement/invoices
GET /v1/procurement/payables
```

## 13. Hospitality

```text
GET /v1/hospitality/front-desk
GET /v1/hospitality/rooms
GET /v1/hospitality/rooms/:id
GET /v1/hospitality/availability
GET /v1/hospitality/reservations
GET /v1/hospitality/stays
GET /v1/hospitality/stays/:id
GET /v1/hospitality/stays/:id/bill
GET /v1/hospitality/housekeeping
```

## 14. Staff/RBAC

```text
GET /v1/staff
GET /v1/staff/:id
GET /v1/roles
GET /v1/permissions
GET /v1/approvals
```

## 15. Reports

```text
GET /v1/reports/daily-sales
GET /v1/reports/till-close
GET /v1/reports/stock
GET /v1/reports/procurement
GET /v1/reports/occupancy
GET /v1/reports/credit
```

Long-running exports may return a job ID.

## 16. Activity/audit

```text
GET /v1/activity
GET /v1/audit
GET /v1/audit/:id
```

Ordinary roles receive a limited operational activity feed; audit detail requires permission.

## 17. Imports

```text
POST /v1/imports
GET  /v1/imports/:id
GET  /v1/imports/:id/errors
```

Mapping/dry-run/apply can be modeled with dedicated commands tied to import ID so mutation stays auditable.

## 18. Branding assets

```text
POST /v1/branding/logo
POST /v1/branding/payment-qr
GET  /v1/branding
GET  /v1/branding/assets/:id
```

Uploads validate bytes server-side. Payment QR accepts PNG according to product contract.

## 19. OpenAPI

Generate an OpenAPI document in CI.

Production API docs should either:

- require admin/developer authorization; or
- be disabled publicly while the JSON artifact remains downloadable from release artifacts.

## 20. Pagination

Cursor/keyset pagination preferred for large operational tables.

Avoid expensive `OFFSET` pagination for movement/audit histories at scale.

## 21. Filtering

Every filter is explicitly allow-listed and typed.

Do not expose generic arbitrary SQL-like filtering from the browser.

## 22. Request metadata

Clients send:

```text
X-ServOS-Client-Version
X-ServOS-Protocol-Version
X-ServOS-Device-ID where applicable
X-Request-ID optional
```

Server returns request ID for support correlation.


---

# 19 — Production Operations and Incident Runbook

## 1. First question during an incident

Determine whether the problem is:

- Web only;
- API;
- database;
- one Terminal;
- one business/network;
- printer/scanner hardware;
- deployment regression;
- authentication;
- synchronization lag.

Do not immediately mutate databases while diagnosis is incomplete.

## 2. API unavailable

Check:

1. DNS resolves;
2. VPS reachable;
3. reverse proxy healthy;
4. API container state/logs;
5. `/health/live`;
6. `/health/ready`;
7. DB connectivity;
8. disk/memory;
9. migration mismatch.

Response:

- restore API service;
- Terminal remains within offline capability;
- Web does not bypass API.

## 3. Database unavailable

- stop/restart dependent API safely;
- inspect disk/connection exhaustion/PostgreSQL logs;
- do not repeatedly restart if corruption suspected;
- preserve logs/evidence;
- restore from tested backup if required.

## 4. Disk nearly full

Priority:

- protect PostgreSQL;
- identify log/backups/container layers;
- rotate/archive safely;
- expand storage if necessary.

Never delete PostgreSQL files manually.

## 5. Terminal not synchronizing

Admin diagnostics:

```text
API reachability
session status
device revoked?
local cursor
server cursor
pending commands
unknown commands
grant status
last error
```

Do not solve by uploading the local database.

## 6. Unknown command outcomes

For each command:

- query server by command ID;
- if confirmed, apply changes;
- if rejected/conflict, surface recovery;
- if server has no command and request definitively never arrived, resend same ID;
- never generate a replacement payment/sale command casually.

## 7. Printer down

- sale/payment remains confirmed;
- printer queue marks failed;
- fix printer/queue;
- reprint immutable document.

Never reverse the sale because the printer jammed.

## 8. Wrong stock count/correction

Use authorized correction command.

Never edit `stock_balances` directly in production to "fix the number" unless executing a documented emergency database repair with audit and subsequent reconciliation.

## 9. Accidental duplicate external payment reference

System should prevent duplicate references by policy.

If genuine provider duplicate/exception occurs:

- preserve both provider evidence records;
- do not overwrite first payment;
- use reconciliation/discrepancy workflow.

## 10. Bad deployment

If schema backward-compatible:

- redeploy previous image digest;
- verify readiness;
- smoke test.

If migration broke state:

- enter maintenance;
- assess forward repair vs restore;
- restore only using documented backup point;
- reconcile Terminal commands after recovery point.

## 11. Lost/stolen Terminal

- revoke device;
- invalidate sessions/refresh credentials;
- assess offline grant validity window;
- flag grant revoked server-side;
- provision replacement;
- bootstrap new device.

## 12. Security incident

- rotate affected secrets;
- revoke suspicious sessions/devices;
- preserve logs;
- determine exposed business/customer scope;
- restore clean images if host compromise suspected;
- review audit and access logs;
- document incident timeline/remediation.

## 13. Database manual access policy

Production SQL write access is emergency-only.

Any manual correction records:

- operator;
- timestamp;
- reason;
- ticket/incident;
- exact SQL;
- before/after evidence;
- follow-up domain reconciliation.

Prefer application-level admin commands/tools even for repair.

## 14. Maintenance mode

API supports controlled maintenance response for unsafe mutation windows.

Web shows:

> ServOS is undergoing maintenance. Your data is safe. Try again shortly.

Terminal may continue only within explicitly valid offline grant.

## 15. Daily/weekly operational checks

Daily automated:

- backup success/freshness;
- disk capacity;
- API error rate;
- worker alive.

Weekly human review:

- restore sample/backup verification signal;
- security updates;
- unusual auth failures;
- unresolved reconciliation cases;
- devices significantly behind.

## 16. Change management

Every production deploy records:

- who deployed;
- release SHA/digest;
- migration version;
- start/end time;
- smoke outcome;
- rollback availability.


---

# 20 — Configuration and Environment Strategy

## 1. Environments

At minimum:

- local development;
- CI ephemeral;
- staging;
- production.

Each has an independent PostgreSQL database and independent secrets.

## 2. Production URLs

```text
WEB_ORIGIN=https://serveos.davemusau.co.ke
API_ORIGIN=https://serveosapi.davemusau.co.ke
```

## 3. Staging URLs

Recommended:

```text
https://serveos-staging.davemusau.co.ke
https://serveosapi-staging.davemusau.co.ke
```

or another clearly separate pair.

## 4. Configuration categories

### API

```text
NODE_ENV
PORT
DATABASE_URL
WEB_ORIGIN
API_ORIGIN
LOG_LEVEL
```

### Auth

```text
ACCESS_TOKEN_PRIVATE_KEY / signing key material
REFRESH_TOKEN_SECRET/pepper as architecture selects
SESSION_TTL
REFRESH_TTL
```

### SMTP

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
```

### Backup

```text
BACKUP_DESTINATION
BACKUP_ACCESS_KEY
BACKUP_SECRET
BACKUP_RETENTION
```

### Observability

```text
ERROR_TRACKING_DSN optional
METRICS_ENABLED
```

## 5. Client configuration

Web gets only public configuration:

```text
VITE_API_URL=https://serveosapi.davemusau.co.ke
VITE_APP_ENV=production
VITE_PROTOCOL_VERSION=...
```

Never ship server/database secrets in Vite variables.

Terminal gets:

- API base URL;
- protocol/client version;
- public verification keys if offline grants are signed asymmetrically.

Device secrets are created/enrolled and stored in OS credential storage, not compiled into installer.

## 6. Startup validation

API config is parsed by a schema at startup.

Missing/invalid required configuration fails fast with a clear operator log.

## 7. Feature flags

Flags are centralized, typed and audited where business-affecting.

Avoid environment-only flags for per-business capabilities.

Business capability/config belongs in database.

Environment flags are for rollout/infrastructure behavior such as:

```text
ENABLE_NEW_SYNC_PROTOCOL
ENABLE_EXPERIMENTAL_REPORT
```

and should be removed after rollout.

## 8. Secret rotation

Document rotation for:

- DB password;
- auth signing keys;
- SMTP;
- backup credentials;
- device trust keys.

Key rotation should permit an overlap window for verifying tokens/grants signed by the previous key when necessary.

## Web-first production origins

Production:

```text
WEB_ORIGIN=https://serveos.davemusau.co.ke
API_ORIGIN=https://serveosapi.davemusau.co.ke
```

Both origins are hosted on the same VPS but remain separate browser security origins. API CORS must explicitly allow the Web origin. PWA build-time values contain only public configuration. Database/session/SMTP/backup secrets remain server-only.

The optional local Print Bridge endpoint is device-local and paired; its address/port is not a cloud authority and must not be exposed publicly.


---

# 21 — Current Repository Findings and Salvage Plan

## 1. Baseline reviewed

Current canonical repository reviewed:

`davemusau00/SERVEOS-WEB`

Current `main` baseline observed during this reset review:

`dc1af9248d161ca6a874d6f32b8119cd1b7fece0`

That commit merges the V2 branch into `main`, which is useful: the first repository-level cleanup step is no longer "somehow combine two permanent branches." The task is now to stabilize one mainline and remove the architectural duplication *inside* it.

## 2. Current strengths worth preserving

The current release-state documentation reports a strong source/test baseline around the merged tree, including broad Node/native/desktop/browser checks and cross-runtime cutover fixtures. Even though physical production acceptance still matters, this means the reset should preserve working domain behavior rather than rewrite blindly.

Important assets to salvage:

### Terminal/Tauri

- mature SQLite business logic;
- printer/scanner hardware integration;
- durable local state;
- native test suite;
- current print queue improvements;
- local receipt/reprint behavior;
- current cutover/export helpers where useful as migration readers.

### V2 work

- stable command identifiers/idempotency ideas;
- command outcome handling;
- durable native V2 outbox ideas;
- expected-version/concurrency model;
- change-feed/cursor thinking;
- authenticated device identity;
- source manifest hashing;
- cutover evidence/verification;
- baseline attestation;
- migration reconciliation tests.

### Product/domain work

- Smart Item direction;
- purchase package conversion;
- sealed/open spirit/wine inventory;
- durable counts;
- stock corrections as immutable movement;
- batch production;
- procurement exception handling;
- hospitality room policy work;
- role/workspace registry direction;
- responsive browser testing.

## 3. Current pieces to replace

### Direct database RPC client architecture

Any production client logic that conceptually does:

```text
browser/terminal
   ↓
servos_v2_execute / direct hosted database RPC
```

should be replaced by:

```text
client
   ↓ HTTPS
serveosapi.davemusau.co.ke
   ↓
application/domain service
   ↓
PostgreSQL
```

The command semantics can survive. The transport/ownership boundary changes.

### SQL dispatcher chain

The expansion migration sequence has become an application router spread across SQL migrations/wrappers.

Do not port that pattern to the VPS backend.

Port domain semantics into typed application handlers and use SQL for persistence/invariants.

### Legacy snapshot upload

Remove from production after cutover.

Keep only migration readers/evidence tools.

### Authority-mode complexity

The old need to switch among legacy, cutover-prep and shared V2 authority arose because old/new systems coexisted in one hosted database architecture.

The new platform should have a much simpler production invariant:

```text
NEW_API
```

is the network authority.

Migration/cutover status belongs to deployment tooling, not a permanent business-runtime mode selector.

### Generic record store as primary domain

The current V2 `records` abstraction was useful for staged parity but made partial-update and domain consistency harder.

The new backend should use relational operational tables.

### Supabase browser SDK as business runtime dependency

After migration:

- no browser business mutation through Supabase;
- no terminal business mutation through Supabase;
- no client service-role/publishable keys controlling business truth.

If Supabase remains temporarily for migration/reference, it is not part of the new production client contract.

## 4. Code to adapt rather than copy verbatim

### Command outcome model

Preserve the semantic states:

- confirmed;
- rejected;
- conflict;
- unknown/pending.

Re-implement them against the new HTTP command service.

### Cutover hashing

The existing manifest/hash work is valuable. Adapt it into the new migration CLI so imports prove source content and target control totals.

### Native durable outbox

Preserve durable command identity/order, but change the sender from V2 RPC to the new HTTP API.

### Receipt assets

Preserve the working logo-image raster path, generalize it, and remove the special QR parser/rebuilder.

### Product inventory math

Extract current conversion logic into a framework-neutral shared package and make both API and UIs consume the same rules.

## 5. Code not to carry into new backend

Do not transplant:

- `servos_upload` style snapshot mutation;
- `servos_v2_execute` SQL-dispatch dependency;
- chained SQL dispatch wrapper functions;
- generic organization-record replacement settings logic;
- separate Native/Web permission dictionaries;
- large manually maintained operation parity prose;
- browser UI assumptions that database RPC presence determines product mode.

## 6. Transition adapters

During development, it is acceptable to create temporary adapters:

```text
LegacyOperationAdapter
LegacyDataReader
SupabaseMigrationReader
```

Rules:

- live only in migration/compatibility packages;
- cannot be called by new UI feature code;
- telemetry reports remaining use;
- have explicit deletion milestone.

## 7. Test reuse

Existing tests should be classified:

### Keep unchanged or nearly unchanged

Pure domain calculations and business acceptance that describe correct behavior.

### Port to new API

Cloud/V2 tests whose intent is command permission/idempotency/concurrency.

### Retire

Tests whose only purpose is validating an architecture being removed, such as legacy uploader behavior after final cutover.

### Rewrite

Source-string tests that assert implementation shape instead of behavior.

Prefer executable behavior tests over brittle source text matching.

## 8. Refactor rule

Do not begin with a blank repository.

The reset should be an incremental strangler/refactor inside the canonical repo:

```text
extract contracts
      ↓
add new API/database modules
      ↓
port domain behavior with tests
      ↓
connect Web
      ↓
connect Terminal
      ↓
migrate data
      ↓
remove old runtime paths
```

This preserves hard-won business logic while replacing the unstable boundaries.

---

# Audit Addendum — October 5 V2/Workflow Review

## 9. `SERVEOS-WEB/V2` is still materially divergent

A direct GitHub comparison after the previous V2 merge shows:

```text
main reviewed: dc1af9248d161ca6a874d6f32b8119cd1b7fece0
V2 reviewed:   48d37769f1d049aa1c776fe8030fc9df8fa836d0

V2 ahead of main: 7 commits
V2 behind main:    2 commits
status: diverged
```

Therefore V2 remains an active source of business rules until reconciled.

See `24-V2-BRANCH-RECONCILIATION.md`.

## 10. V2 operation additions

Main operation registry: 90 IDs.

V2 operation registry: 94 IDs.

V2-only additions:

```text
inventory.countSelected
procurement.reverseUnusedReceipt
record.reactivate
inventory.reverseMovement
```

These are useful product concepts, but their current storage/transport implementation is not automatically the reset implementation.

## 11. V2 correction/bottle work worth salvaging

Preserve:

- sealed/open physical conservation;
- selected count semantics;
- expected-version/reviewed-dependency checks;
- exact command identity before correction dispatch;
- PO archive guard while outstanding quantities exist;
- full reversal only when later activity has not invalidated exact restoration.

Rewrite against the new backend/domain packages.

## 12. V2 work not to port verbatim

Do not move:

- raw Web count persistence in `localStorage`;
- raw correction outcome markers in `localStorage`;
- Supabase SQL dispatcher implementation;
- `.pc.txt`;
- `.probe_chain.txt`;
- `probe-run.ps1`;
- ad-hoc probe SQL as production migration logic.

## 13. Procurement printing gap is confirmed in source

Both reviewed procurement UIs implement business commands for:

```text
purchaseOrder.create
purchaseOrder.receive
supplierPayable.matchInvoice
supplierPayable.pay
```

Neither Native nor Web procurement view contains a print path.

Current native printer code is receipt-specific.

This is now a formal ServOS 1.0 gap, addressed by `23-BUSINESS-DOCUMENT-PRINTING.md`.

## 14. Close-day and credit print gaps

Native currently:

- creates immutable/persisted close-day reports for closed tills;
- displays customer credit statements/reconciliation.

Those views do not expose general print actions.

Add them through the generic Business Document subsystem rather than custom module printing.

## 15. Useful concepts in the `ServOs` prototype repository

Do not merge the prototype wholesale, but preserve these product ideas for selective redesign:

- Stock Requisition / internal transfer request;
- Hotel Tape Chart;
- `Print Folio Statement` concept;
- Staff/Cash handover concepts;
- Tender reconciliation dashboard;
- Guest/CRM 360 later;
- QR guest ordering later.

These are concepts, not trusted production domain implementations; several prototype screens contain hard-coded/demo state.

## 16. Current printer architecture salvage

Current native printing already contains useful production-grade ideas:

- validated local LAN address;
- Windows RAW queue mode;
- durable queue lifecycle;
- single-job claim;
- `DELIVERY_UNCERTAIN` state;
- audited obsolete-job cancellation.

Keep those transport/recovery semantics while replacing receipt-specific renderer/queue naming with a generic Business Document spooler.

## 2026-10-06 merged reset baseline update

The reset branch successfully merged `main + V2`, installs with `npm ci`, builds successfully, passes 216 JS/source tests and 106 native Rust/domain tests. This makes the current repository a strong behavioral baseline rather than a blank rewrite candidate.

Web-first implications discovered in the baseline:

- PWA shell/update infrastructure already exists and should be retained.
- Existing tests currently expect Web V2 to fail closed offline; the reset replaces this with a durable IndexedDB command/outbox model.
- Existing tests enforce a separate Till QR preparation algorithm; those tests must be rewritten because the new requirement intentionally routes logo and QR through one generic image path.
- `runtime.print_receipt` is currently device-local and excluded from cloud parity. Rather than pushing raw printing into the API, extract its tested transport behavior into the optional Print Bridge.
- Native tests remain valuable invariant evidence until equivalent API/PWA tests exist.
- The current production bundle emits a main JS chunk over 1 MB before gzip; route/domain code splitting is now a P1 web-terminal performance task.


---

# 22 — Operator Workflow Refinement Master Plan

## 1. Purpose

ServOS 1.0 must be evaluated by the jobs ordinary staff complete during a real shift, not by the number of modules, operations or database records it contains.

The reset therefore adds a second product gate alongside backend correctness:

> **Every routine workflow must have a short, obvious happy path and a clearly separated exception path.**

The backend may remain strict, audited and transactional. The operator surface should expose only the information required to make the current decision.

This document extends the existing task-first shell, simple-stay, Smart Item and procurement plans with workflows that are currently missing, fragmented, or too technical across `SERVEOS-WEB`, its `V2` branch, `servos-`, and the `ServOs` concept repository.

---

## 2. Cross-workflow interaction rules

Every Tier-A workflow must follow the same interaction contract.

### 2.1 One clear primary action

Examples:

- `Sell`;
- `Check in`;
- `Receive delivery`;
- `Create purchase order`;
- `Count stock`;
- `Close till`;
- `Print`.

Do not make the operator choose between several technically similar buttons before the business intent is known.

### 2.2 Progressive disclosure

Default view shows the routine fields.

`More options` exposes:

- accounting classification;
- internal codes;
- advanced rate/deposit rules;
- detailed approval configuration;
- tax overrides;
- exceptional stock treatment.

### 2.3 Draft → Review → Commit for destructive/financial actions

Use:

```text
enter
  ↓
review
  ↓
confirm
  ↓
command ID allocated/persisted
  ↓
commit
```

Never clear entered data until the command outcome is `CONFIRMED`.

### 2.4 Response loss is a state, not an error toast

For `PENDING` / `OUTCOME_UNKNOWN`:

```text
We are checking whether this was saved.
Do not submit it again.

[ Check status ] [ Open Activity ]
```

### 2.5 Reprints and duplicates are explicit

A reprint must never look like an original print.

For documents where duplicate paper could cause operational confusion, print:

```text
REPRINT
Original document: PO-2026-000123
Reprinted: 05 Oct 2026 23:10
By: Manager Name
```

The business record remains the same document/version; the print attempt is a separate audited event.

---

# 3. Procurement workflow reset

The current production repository already supports PO creation, receipt, invoice matching and supplier payment. It does **not** currently provide a procurement print path, and the ordinary PO flow still jumps too quickly from create to approved.

## 3.1 Configurable procurement policy

A business chooses one policy:

### Simple purchasing

Best for small restaurants, bars and owner-operated businesses.

```text
Create PO
  ↓
Issue immediately
```

The creator must already hold `procurement.approve` or business policy permits auto-approval below the configured threshold.

### Controlled purchasing

```text
Draft
  ↓
Submit for approval
  ↓
Approve / reject
  ↓
Issue to supplier
  ↓
Receive
  ↓
Match invoice
  ↓
Pay
```

Required states:

```text
DRAFT
PENDING_APPROVAL
APPROVED
ISSUED
PARTIALLY_RECEIVED
RECEIVED
INVOICED
PARTIALLY_PAID
PAID
CANCELLED
CLOSED
```

The backend should derive state from authoritative events where possible rather than let clients set arbitrary status strings.

## 3.2 Quick PO creation

Default:

```text
PURCHASE ORDER

Supplier
[ Choose supplier ]  [ + Quick supplier ]

+ Add item
```

Line:

```text
Coca-Cola 330ml
Buy as: Crate of 24
Qty: 5 crates
Price: KES 2,400 / crate

ServOS calculates:
120 bottles
KES 12,000
```

Advanced `Expense` / `Asset` lines remain behind `Add non-stock line`.

## 3.3 Repeat / usual order

Add:

- `Duplicate PO`;
- `Repeat last order from this supplier`;
- `Order usual stock`.

The duplicate is a new draft with a new command/document identity and current prices left editable.

## 3.4 PO issue and print

On approval/issue:

```text
[ Print 80mm ]
[ Preview ]
[ Share / PDF ]   ← Web/A4 capability may follow after thermal acceptance
```

Thermal printing is specified in `23-BUSINESS-DOCUMENT-PRINTING.md`.

## 3.5 PO change/cancellation

Before any receipt:

- amend quantities/prices;
- add/remove lines;
- cancel with reason;
- issue a revised version.

After receipt has started:

- do not mutate history;
- remaining unreceived quantity may be cancelled/closed;
- received quantities remain immutable business evidence.

A revised issued PO gets a new document version:

```text
PO-2026-000123 · REV 2
```

## 3.6 Receiving

Default to outstanding quantities.

```text
[ Receive everything ]
[ Something is different ]
```

Exception view exposes:

- delivered quantity;
- rejected quantity;
- rejection reason;
- partial receipt;
- over-receipt approval;
- wrong package;
- delivery note;
- supplier invoice reference.

After commit offer:

```text
Goods received.
[ Print GRN ] [ Receive another ] [ View PO ]
```

## 3.7 Supplier return

This is a distinct physical workflow and must not be modelled as "undo receive".

```text
Supplier Return
  ↓
select receipt/PO and items
  ↓
quantity physically leaving business
  ↓
reason
  ↓
approval if required
  ↓
stock transfer out / supplier-return movement
  ↓
supplier debit/credit-note expectation
  ↓
print Supplier Return Note
```

Canonical operations should include a dedicated return domain, for example:

```text
supplierReturn.create
supplierReturn.approve
supplierReturn.dispatch
supplierReturn.matchCreditNote
supplierReturn.cancel
```

Do **not** overload `procurement.reverseUnusedReceipt`. That V2 operation is intentionally a correction for an unused duplicate recording where goods never physically moved.

## 3.8 Receipt/cost correction

Three distinct concepts must remain separate:

```text
RECORDING CORRECTION
wrong duplicate record; physical world did not change

SUPPLIER RETURN
physical goods leave the business

ACCOUNTING ADJUSTMENT
price/invoice/credit-note correction after later activity
```

The V2 branch provides a useful guarded `procurement.reverseUnusedReceipt` prototype. Preserve its evidence/version concepts, but the new VPS backend must provide complete accounting correction semantics rather than leaving wrong-price/paid-invoice cases stranded.

---

# 4. Internal stock requisition and controlled transfer

The `ServOs` concept repository contains a useful `StockRequisitionModal`, but the canonical production operation set currently jumps directly to `inventory.transfer`.

That is insufficient for businesses with a central store and several bars/kitchens/outlets.

## 4.1 Simple direct transfer

For small businesses with permission:

```text
Bar Store
→ Main Bar
2 crates + 3 loose bottles
[ Transfer ]
```

## 4.2 Controlled requisition

For larger businesses:

```text
Outlet requests stock
      ↓
Store reviews
      ↓
Approve / adjust / reject
      ↓
Dispatch
      ↓
Receiving outlet confirms
      ↓
Transfer closes
```

Suggested states:

```text
DRAFT
REQUESTED
APPROVED
PICKING
DISPATCHED
RECEIVED
REJECTED
CANCELLED
```

Required documents:

- Stock Requisition;
- Stock Transfer / Dispatch Note;
- Receiving confirmation;
- discrepancy record.

The system must not decrement destination/source twice merely because dispatch and receipt are separate operator steps. Domain ownership of stock-in-transit must be explicit.

---

# 5. Stock count workflow refinement

## 5.1 Full count

Existing whole-location semantics remain the authoritative close/count workflow.

## 5.2 Selected / spot count

The V2 branch adds `inventory.countSelected`. Preserve the business idea.

Use it for:

- checking five high-risk spirits;
- verifying one shelf;
- correcting a suspicious balance after investigation;
- cycle counting without closing the whole store.

Do not silently make a selected count equivalent to the full location count.

## 5.3 Printed blind count sheet

A real business needs a paper fallback.

Offer:

```text
[ Print count sheet ]

Mode:
● Blind count     ← expected quantities hidden
○ Assisted count  ← expected quantities shown
```

Thermal sheet may contain:

```text
BAR STORE STOCK COUNT
05 OCT 2026 22:00
Counter: __________________

Tusker 500ml
Full crates: ______
Loose bottles: ______

Jameson 750ml
Sealed bottles: ______
Open ml: ______
```

After digital count completion:

```text
[ Print variance report ]
```

with before/count/delta/reason/actor.

## 5.4 Count persistence

Browser physical-count drafts must live in IndexedDB through the shared Web local store, not raw `localStorage`.

The V2 branch currently demonstrates the selected-count UI but its Web wrapper persists reviewed physical counts via `localStorage`; do not carry that implementation into the reset.

---

# 6. Inventory archive/reactivation

The V2 branch adds two useful ideas:

- block stock-item archive when unresolved PO quantities still reference it;
- `record.reactivate` for restoring intentionally archived records.

The reset should formalize lifecycle rules:

```text
ACTIVE
ARCHIVED
```

Archive blockers must explain exactly what is unresolved:

> 3 open purchase-order lines still reference this item.

Actions:

```text
[ View open orders ]
[ Cancel remaining quantities ]
[ Keep item active ]
```

Reactivation restores the record but never rewrites history.

---

# 7. Barcode and label printing

Add a stock-label workflow separate from transaction receipt printing.

Use cases:

- shelf labels;
- kitchen quick-scan cards;
- dish/barcode cards;
- stock-master labels;
- asset tags later.

A label document should support:

- item name;
- selling/purchase package;
- human-readable code;
- Code 128 / EAN barcode when valid;
- optional price;
- generated timestamp/version.

Do not generate fake EAN/UPC values without checksum/namespace rules. Internal Code 128 values are safer when ServOS owns the identifier.

---

# 8. POS and service workflows needing refinement

## 8.1 Kitchen/bar ticket fallback

KDS exists in the production codebase, but there is no generalized thermal KOT/BOT print subsystem.

Add configurable service routing:

```text
Kitchen item
  → KDS
  → optional Kitchen Printer

Bar item
  → Bar KDS
  → optional Bar Printer
```

A ticket includes:

- order/table/tab;
- server;
- fired time;
- item quantity;
- modifiers/notes;
- course/route;
- `REPRINT` marker where applicable.

Printer failure must not unfire the order.

## 8.2 Hold/fire/course clarity

Operational UI should distinguish:

```text
Ordered
Held
Sent/Fired
Preparing
Ready
Served
Voided
```

Do not let KDS terminology leak differently between Terminal and Web.

## 8.3 Repeat round

Repeat round must preserve:

- exact portion;
- modifiers;
- quantity;
- route;

while rechecking current item availability/policy.

---

# 9. Shift/till workflow refinement

The native repo already supports till count/close and close-day generation, but reports are screen-only and the shift-handover workflow is thin.

## 9.1 Opening

After opening till offer an optional opening slip:

```text
TILL OPENED
Terminal
Staff
Opening float
Timestamp
```

## 9.2 Paid in/out

Every cash movement should be printable as a small voucher when required.

```text
CASH PAID OUT
KES 2,000
Reason: market vegetables
Staff: ...
Approval: ...
```

## 9.3 Handover

Add explicit shift handover where businesses use rotating cashiers:

```text
Outgoing operator
      ↓
count / unresolved tabs / printer queue / pending sync
      ↓
Incoming operator review
      ↓
handover confirmation
```

Do not make handover a hidden side effect of locking the terminal.

## 9.4 Till close / close-day print

After confirmed close:

```text
[ Print cash-up summary ]
[ Generate full report ]
```

The production repo already persists `closeDayReports` but has no native print action in that reporting view.

---

# 10. Customer credit workflow refinement

The current native credit screen contains a useful on-screen statement, reconciliation and write-off workflow but no print path.

Add:

- Print customer statement;
- Print payment acknowledgment;
- Print/write-off approval evidence where business policy requires;
- statement date range;
- opening balance / charges / settlements / adjustments / closing balance;
- optional due-date summary.

A statement is not a fiscal receipt and must have its own document type.

---

# 11. Supplier account workflow refinement

Add a Supplier 360 detail page showing:

- open POs;
- goods receipts;
- unmatched receipts;
- invoices;
- current payable;
- payment history;
- returns/credit notes;
- contact/payment terms.

Print/share outputs:

- PO;
- GRN;
- return note;
- remittance/payment advice;
- supplier activity statement.

---

# 12. Hospitality/front-desk workflow refinement

The Simple Stay reset remains the default. Additional routine workflows should become equally direct.

## 12.1 Walk-in

```text
Available room
→ Check in
→ guest name
→ nights / rate
→ pay now or later
→ done
```

No persistent customer account required.

## 12.2 Reservation confirmation

After reservation:

```text
[ Print confirmation ]
[ Share confirmation ]
```

## 12.3 Guest registration card

Optional by property policy:

- guest snapshot;
- room;
- arrival/departure;
- ID/reference fields;
- signature space;
- terms acknowledgement.

## 12.4 Folio statement

The concept `ServOs` PMS contains a browser `Print Folio Statement` action. The production repo currently prints immutable hotel checkout receipts but does not expose an equivalent full folio-statement print workflow.

Add:

```text
[ Print guest bill ]
```

at any point without closing the folio.

## 12.5 Checkout

Simple checkout:

```text
Balance 0
[ Check out ]
```

or:

```text
KES 3,000 due
[ Pay & Check Out ]
```

Advanced deposit/application/refund remains available only where configured.

## 12.6 Housekeeping handoff

Add optional thermal print:

```text
HOUSEKEEPING LIST
Morning shift

101  DIRTY      Checkout
102  STAYOVER   Service requested
103  CLEAN      Inspection pending
```

Digital board remains primary; print is a resilient field artifact.

## 12.7 Maintenance work order

Maintenance should be printable with:

- room/asset;
- fault;
- priority;
- reported by/time;
- assignee;
- safety/out-of-order status;
- completion/sign-off area.

---

# 13. Assets and maintenance refinement

The current production repo contains deep Native asset workflows, while Web depth remains uneven.

Add task-first actions:

```text
Report problem
Assign
Start work
Complete
Return to service
```

Procurement-to-asset commissioning must preserve one acquisition truth:

- receiving an asset line creates an acquisition candidate;
- commissioning creates the asset;
- it must never simultaneously become normal consumable stock unless the line is explicitly split.

Print Asset Handover / Maintenance Work Order where useful.

---

# 14. Refund / void / correction operator language

Keep verbs separate:

```text
VOID
cancel an order/item before normal financial completion or according to policy

COMP
business absorbs price intentionally

REFUND
money is returned after payment

CORRECTION
recorded business fact was wrong; immutable compensating evidence is created

SUPPLIER RETURN
physical purchased goods leave the business
```

Every UI must explain stock and money effects before confirmation.

---

# 15. Imports and setup workflow refinement

Import Center should end in a usable business, not merely imported rows.

After import show:

```text
Imported
42 items
5 suppliers
10 rooms

Needs attention
3 products missing selling price
1 duplicate barcode
2 rooms missing rate

[ Fix issues ]
```

CSV templates should use business language and example rows.

---

# 16. Daily operator home

`Today` should be role-specific and exception-first.

Examples:

### Storekeeper

- deliveries expected;
- low stock;
- open requisitions;
- counts due;
- unresolved barcode scans.

### Receptionist

- arrivals;
- departures;
- rooms dirty/out of order;
- guest balances;
- reservation conflicts.

### Manager

- open tills;
- large variances;
- approval requests;
- failed printer jobs;
- unmatched M-Pesa;
- overdue supplier/customer balances.

Do not turn Today into a decorative analytics dashboard.

---

# 17. Workflow acceptance rule

A workflow is accepted only when it proves:

1. first-time user can identify the next action;
2. routine path does not expose advanced internals;
3. all required backend invariants still run;
4. failed/unknown outcome preserves the operator's work;
5. duplicate submission cannot duplicate the business effect;
6. Terminal and Web use the same command contract;
7. offline behavior is explicit;
8. print artifacts, when applicable, come from an immutable/versioned document snapshot;
9. responsive acceptance passes at required POS/tablet/mobile sizes;
10. audit trail explains who did what and why.


---

# 23 — Business Document and Thermal Printing Architecture

> **Web-first revision (2026-10-06):** Business documents are now rendered by the PWA. Standard browser printing is the universal fallback. Dedicated Windows terminals may optionally pair with the ServOS Print Bridge for deterministic silent ESC/POS. The bridge contains only hardware transport/spooling and does not become a business authority. See `28-SILENT-PRINTING-PRINT-BRIDGE.md`.


## 1. Why this needs its own subsystem

The current current native printer implementation is receipt-centric:

- `encode_receipt(...)` builds customer/business receipt copies;
- `receipt_print_jobs` is the local durable queue;
- procurement views do not call any print function;
- close-day reports, customer statements, housekeeping and maintenance do not have a common native print route.

ServOS now needs printing for operational documents beyond fiscal/transaction receipts.

Do **not** solve this by making every module invent ESC/POS commands.

Instead create one typed Business Document service and one document print subsystem.

---

## 2. Design rule

```text
Domain record(s)
    ↓
BusinessDocument snapshot
    ↓
layout renderer
    ↓
PrintJob
    ↓
device print subsystem
    ↓
ESC/POS / Windows RAW / LAN
```

Domain modules know **what the document means**.

The renderer knows **how it looks**.

The printer driver knows **how bytes reach paper**.

---

## 3. BusinessDocument model

Suggested central schema:

```ts
BusinessDocument {
  id: string
  businessId: string
  type: BusinessDocumentType
  number: string
  revision: number
  status: 'DRAFT' | 'ISSUED' | 'VOIDED' | 'SUPERSEDED'
  sourceType: string
  sourceId: string
  sourceVersion: number
  issuedAt?: string
  issuedBy?: string
  title: string
  snapshot: JsonObject
  snapshotHash: string
  layoutVersion: number
  createdAt: string
}
```

Once `ISSUED`, the snapshot is immutable.

If the business record changes later, issue a new revision rather than silently changing what an old printed document would contain.

---

## 4. Document types for ServOS 1.0

### Sales / POS

- `SALE_RECEIPT`;
- `REFUND_RECEIPT`;
- `KITCHEN_TICKET`;
- `BAR_TICKET`.

### Procurement

- `PURCHASE_ORDER`;
- `GOODS_RECEIPT_NOTE`;
- `SUPPLIER_RETURN_NOTE`;
- `SUPPLIER_PAYMENT_ADVICE`.

### Inventory

- `STOCK_REQUISITION`;
- `STOCK_TRANSFER_NOTE`;
- `STOCK_COUNT_SHEET`;
- `STOCK_VARIANCE_REPORT`;
- `ITEM_BARCODE_LABEL`.

### Cash / finance

- `TILL_OPEN_SLIP`;
- `CASH_MOVEMENT_VOUCHER`;
- `TILL_CLOSE_SUMMARY`;
- `CLOSE_DAY_REPORT`;
- `CUSTOMER_CREDIT_STATEMENT`.

### Hospitality

- `RESERVATION_CONFIRMATION`;
- `GUEST_REGISTRATION_CARD`;
- `GUEST_FOLIO_STATEMENT`;
- `HOTEL_CHECKOUT_RECEIPT`;
- `HOUSEKEEPING_LIST`;
- `MAINTENANCE_WORK_ORDER`.

More can be added without modifying printer transport code.

---

## 5. PrintJob model

Generalize the current receipt-specific queue.

Suggested local PWA/Print Bridge model:

```ts
PrintJob {
  id: string
  documentId: string
  documentType: string
  documentRevision: number
  printerRole: 'RECEIPT' | 'KITCHEN' | 'BAR' | 'OFFICE' | 'LABEL'
  profileSnapshot: JsonObject
  documentSnapshot: JsonObject
  renderedHash: string
  state:
    | 'QUEUED'
    | 'SENDING'
    | 'SENT'
    | 'DELIVERY_UNCERTAIN'
    | 'FAILED'
    | 'CANCELLED'
  attemptCount: number
  message?: string
  createdAt: string
  updatedAt: string
}
```

Recommended SQLite migration:

```text
receipt_print_jobs
      ↓ migrate/generalize
print_jobs
```

Do not lose unresolved historical receipt jobs during migration.

---

## 6. Print states and duplicate safety

Printing is not the business transaction.

```text
PO issued
   ✓

print job
QUEUED → SENDING → SENT
                  ↘ DELIVERY_UNCERTAIN
```

A printer failure must never un-issue a PO, un-receive stock, reopen a closed till or change a guest balance.

For uncertain delivery:

> The printer connection opened but ServOS cannot know whether paper came out.

Require:

```text
[ I checked the printer; retry ]
```

before another send where duplicate paper could cause confusion.

---

# 7. Thermal Purchase Order specification

## 7.1 Why 80mm PO printing matters

For many small suppliers, bars, hotels and rural/SME operations, the quickest usable artifact is the same thermal printer already sitting at the counter.

A PO should therefore be printable immediately from PWA/Print Bridge without needing Word, PDF or a full-size office printer.

## 7.2 Layout

Recommended 80mm layout:

```text
           [ BUSINESS LOGO ]

        BUSINESS TRADING NAME
        Phone / Email
        Address / PIN if configured

          PURCHASE ORDER
          PO-2026-000123
          REV 1 · ISSUED
--------------------------------
Date: 05 Oct 2026 22:14
Supplier: ABC DISTRIBUTORS
Phone: 07xx xxx xxx
Deliver to: Main Store
Created by: Davies
Approved by: Manager
--------------------------------
ITEMS

Coca-Cola 330ml
5 crates × KES 2,400
120 bottles       KES 12,000

Tusker 500ml
3 crates × KES 3,200
60 bottles         KES 9,600
--------------------------------
TOTAL             KES 21,600
--------------------------------
Notes:
Deliver before 12:00.

This is a purchase order.
It is not proof of payment.

Supplier acknowledgement:
Name: ______________________
Sign: ______________________
Date: ______________________

ServOS reference:
PO-2026-000123
```

Logo placement uses the same top-image pipeline as receipt branding.

The M-Pesa payment QR is **not** printed on a purchase order unless a future explicit business-document design requires it. The receipt QR requirement remains customer-payment specific.

## 7.3 Package language

Always print how the operator/supplier thinks:

```text
5 crates × 24 bottles
```

not merely:

```text
120 canonical units
```

Canonical quantity may be shown as supporting text where useful.

## 7.4 Prices

Configurable business policy:

```text
PO print prices:
● Show prices
○ Hide prices
```

Default: show prices.

## 7.5 Signature/approval

Where the business uses approval:

- Created by;
- Approved by;
- approval timestamp;
- optional supplier acknowledgment.

Do not print secret approval tokens.

---

# 8. Goods Receipt Note (GRN)

After `purchaseOrder.receive` confirms, offer `Print GRN`.

Layout includes:

```text
GOODS RECEIPT NOTE
GRN-2026-000456
PO: PO-2026-000123
Supplier
Delivery note
Supplier invoice ref
Storage location
Received by / time

Item
Ordered
Previously received
Delivered today
Rejected
Accepted
Outstanding

Rejection reasons
```

The GRN is evidence of what the business accepted, not proof the supplier invoice has been approved for payment.

---

# 9. Supplier Return Note

Must clearly say goods physically left the business.

Include:

- return number;
- supplier;
- related PO/GRN where known;
- item/package quantities;
- reason;
- condition;
- expected credit-note reference;
- dispatched by;
- approved by;
- supplier/driver acknowledgment.

Never represent a supplier return using `RECEIPT_REVERSAL` language on the printed artifact.

---

# 10. Stock requisition / transfer

## Requisition

```text
Requested by: Main Bar
From: Central Store

Tusker     2 crates
Jameson    3 bottles
```

## Dispatch / transfer

```text
Issued by
Received by
Quantity requested
Quantity dispatched
Quantity received
Discrepancy
```

For controlled transfers, the destination receipt closes the workflow.

---

# 11. Stock count sheets

Support:

- blind sheet;
- assisted sheet;
- selected/spot count;
- full-location count.

Blind sheets must not include current expected stock.

Use physical entry vocabulary and blank writing space.

---

# 12. Cash/till documents

Thermal printer is useful for:

### Paid in/out voucher

Evidence for petty operational cash movement.

### Till close summary

Include:

- opening float;
- cash sales;
- cash collections;
- paid in/out;
- expected drawer;
- actual count;
- variance;
- variance reason;
- cashier;
- manager approval if applicable.

### Close-day summary

The full report can remain available digitally, with a concise thermal management copy.

---

# 13. Credit/customer documents

Customer statement includes:

```text
opening balance
charges
payments
write-offs/adjustments clearly labelled
closing balance
due dates
```

Payment acknowledgment is separate from the full statement.

---

# 14. Hospitality documents

## Guest folio statement

Can be printed while the stay remains open.

Do not require checkout merely to hand a guest their current bill.

## Registration card

Optional property-policy artifact.

## Reservation confirmation

Printable/sharable without creating a financial receipt.

## Housekeeping list

Resilient offline paper worklist for room attendants.

## Maintenance work order

Printable job card for engineering/maintenance staff.

---

# 15. KOT/BOT printer routing

Add printer roles:

```text
RECEIPT
KITCHEN
BAR
OFFICE
LABEL
```

Route configuration may be outlet/service-area aware.

Example:

```text
Food → Kitchen Printer
Cocktails → Bar Printer
Receipts → Front Counter
```

KDS and thermal tickets may run together.

A printer failure must create a visible operational alert but must not alter the order state.

---

# 16. Renderer architecture

Replace receipt-specific hardcoding with shared primitives:

```rust
DocumentRenderer
  .text(...)
  .rule()
  .pair(left,right)
  .center(...)
  .bold(...)
  .raster(...)
  .barcode(...)
  .feed(...)
  .cut()
```

Higher-level renderers:

```text
render_sale_receipt
render_purchase_order
render_grn
render_stock_count_sheet
render_till_close
render_folio_statement
```

All output is bounded by a validated `PrinterProfile`.

---

# 17. Image pipeline

Business logo and payment QR use one safe raster primitive.

The reset still requires:

- business logo at top of receipt;
- uploaded payment QR must be PNG;
- payment QR processed as an ordinary bounded raster image;
- caption exactly `Scan to Pay via One app`;
- no special QR module/grid parser.

Business documents can reuse the logo raster. They do not automatically inherit the payment QR.

---

# 18. Web printing

Web cannot claim native printer success.

Web options:

1. browser print-friendly 80mm layout;
2. A4 document/PDF layout;
3. `Print on PWA/Print Bridge` command/request when a paired PWA/Print Bridge is online, implemented only after device-command safety is proven.

For 1.0, direct reliable ESC/POS ownership remains PWA/Print Bridge-side.

---

# 19. Print preview

Before print, show:

- document type/number;
- revision;
- printer role/profile;
- approximate 80mm preview;
- copy count;
- reprint warning if applicable.

Routine receipt auto-print can remain policy-driven without preview.

---

# 20. Document numbering

Separate sequences:

```text
RCPT-
PO-
GRN-
RET-
REQ-
TRF-
CSH-
FOL-
MWO-
```

Numbers are business-scoped and centrally allocated online.

For authorized offline PWA/Print Bridge documents, the offline grant must contain reserved numbering ranges so duplicates cannot occur after reconnect.

---

# 21. Reprint audit

Record:

```text
printJobId
documentId
documentRevision
printer/device
actor
reason when policy requires
first print / reprint
attempt
transport result
timestamps
```

Reprint never mutates the original business document.

---

# 22. Migration from receipt_print_jobs

1. preserve current unresolved receipt jobs;
2. add/generalize `print_jobs` table;
3. map receipt jobs to `documentType=SALE_RECEIPT/HOTEL_CHECKOUT_RECEIPT`;
4. keep existing outcome/uncertain-delivery semantics;
5. switch receipt UI to generic spooler;
6. add PO/GRN/etc;
7. remove receipt-only queue code once historical jobs are resolved/migrated.

---

# 23. Hardware acceptance

At minimum test on XP-80T:

- sale receipt;
- PO with 1 line;
- PO with 20+ lines;
- long wrapped supplier/item names;
- GRN with rejected quantities;
- blind stock sheet;
- till close;
- customer statement;
- folio statement;
- kitchen ticket;
- logo rendering;
- payment QR receipt rendering;
- cutter on/off;
- USB queue;
- LAN 9100;
- paper out/failure;
- delivery uncertain/retry;
- five sequential documents of mixed types.

Physical paper acceptance is required. Byte-stream tests alone are insufficient.


---

# 24 — `SERVEOS-WEB/V2` Branch Reconciliation and Salvage Plan

## 1. Baseline

At the October 5, 2026 audit point:

```text
Repository: davemusau00/SERVEOS-WEB
main: dc1af9248d161ca6a874d6f32b8119cd1b7fece0
V2 branch: 48d37769f1d049aa1c776fe8030fc9df8fa836d0
```

GitHub comparison reports:

```text
V2 is 7 commits ahead of main
V2 is 2 commits behind main
status: diverged
```

Therefore `V2` must not be deleted merely because a V2 pull request was previously merged into `main`.

It contains additional work produced after the merge.

---

## 2. V2-only commits reviewed

The branch contains the following post-merge work themes:

1. bottle-inventory tests and SQL acceptance;
2. archive protection when open PO quantities exist;
3. selected/physical count refinements;
4. reviewed command identity handling;
5. maintenance-cost probe scripts;
6. light/dark theme and semantic token work;
7. dialog/drawer styling/accessibility refinement.

---

## 3. New operation identities in V2

`contracts/operations.json` on `main` has 90 transitional operation IDs.

`V2` has 94.

V2 adds:

```text
inventory.countSelected
procurement.reverseUnusedReceipt
record.reactivate
inventory.reverseMovement
```

These should be explicitly classified during the new API contract design.

### 3.1 `inventory.countSelected`

**Keep concept. Rewrite implementation against new backend.**

Business value:

- spot counts;
- cycle counts;
- selected high-risk items;
- physical correction review.

It must remain semantically distinct from `inventory.countLocation`, which represents a whole-location reviewed count.

### 3.2 `procurement.reverseUnusedReceipt`

**Keep concept as guarded correction. Do not confuse with supplier return.**

Useful V2 behavior:

- requires exact reviewed versions;
- only permits an unused duplicate/recording mistake;
- preserves original records;
- creates linked reversing evidence;
- blocks reversal after later PO/stock/payable activity.

New backend must still add the missing real-world cases:

- physical supplier return;
- wrong received price after later movement;
- supplier credit note;
- matched/paid invoice correction.

### 3.3 `record.reactivate`

**Keep concept, restrict domain use.**

Do not expose one magical generic record operation across every entity.

Preferred API:

```text
catalog.item.reactivate
supplier.reactivate
room.reactivate
```

or a typed domain command mapped internally to a shared lifecycle helper.

### 3.4 `inventory.reverseMovement`

**Keep only as a narrowly defined recording correction.**

The V2 UI correctly warns that consumed stock, real-world physical movement and later cost activity may prevent exact reversal.

The new backend should model:

- recording correction;
- current-balance correction;
- real transfer/return;

as separate concepts.

---

# 4. V2 bottle-state logic

V2 has meaningful improvements around sealed/open inventory:

- explicit `sealedContainerSize`;
- sealed container + open quantity conservation;
- physical transfer disposition;
- whole-bottle-only guards;
- reviewed physical counts;
- source/destination state checks;
- later-activity conflict protection.

## Decision

**Preserve business invariants and tests.**

Move them into shared framework-neutral domain tests and the new VPS inventory service.

Do not preserve dependence on SQLite record JSON shapes or Supabase migration handlers.

---

# 5. PO archive guard

V2 adds a useful rule:

> A stock item cannot be archived while unresolved purchase-order quantities still reference it.

Keep this.

Improve UX so the operator sees the blocker and direct recovery action:

```text
Cannot archive Jameson 750ml.

Open purchasing:
PO-2026-00112 · 3 bottles outstanding
PO-2026-00118 · 1 case outstanding

[ View purchase orders ]
```

---

# 6. Web physical-count implementation warning

V2 adds `WebPhysicalCountDialog`, but its browser persistence currently uses `localStorage` keys such as:

```text
servos-web-physical-count:...
```

This is useful proof of UI behavior but is **not** the final reset architecture.

New implementation:

```text
IndexedDB BusinessStore
    ↓
CountDraft repository
    ↓
review command persisted
    ↓
new API command
```

Requirements:

- business/operator scoping;
- schema/version migration;
- logout privacy clearing/partitioning;
- atomic persistence of baseline + counts + unknown scans + review command;
- no unbounded JSON values in localStorage.

---

# 7. Web linked correction warning

V2's `WebLinkedCorrectionDialog` demonstrates an important idea:

- persist the exact correction command ID before dispatch;
- retry the same ID;
- do not silently create another reversal.

Keep that rule.

Replace raw `localStorage` status strings with the new Web command/outbox repository and backend `/commands/{id}` status endpoint.

---

# 8. Design system/theme work

V2 adds semantic token/theme improvements and dialog/drawer accessibility refinements.

**Salvage selectively.**

Before porting:

- confirm contrast in both themes;
- test 1024×600;
- test touch targets;
- test focus trap/escape;
- ensure terminal dark/light preference cannot reduce high-speed POS legibility;
- retain semantic tokens instead of feature-local color literals.

Theme switching is polish. It must not delay core workflow convergence.

---

# 9. Do not merge these V2 artifacts

Exclude from production refactor:

```text
.pc.txt
.probe_chain.txt
probe-run.ps1
ad-hoc maintenance probe SQL
```

Probe tooling belongs in controlled test scripts with no credentials/secrets committed.

Rotate/remove any secrets if those artifacts ever contained live credentials.

---

# 10. SQL migrations

V2 adds large bottle/cost migrations.

Do not port them wholesale to the new VPS schema.

Instead extract:

- invariants;
- input validation;
- concurrency expectations;
- conservation equations;
- correction rules;
- test fixtures.

Reimplement those in the new relational domain model and backend transaction service.

---

# 11. Branch reconciliation sequence

Before deleting V2:

```text
1. tag main baseline
2. tag V2 baseline
3. create V2 salvage checklist
4. port pure tests/invariants first
5. port operation concepts to new contracts
6. port design-system improvements selectively
7. explicitly reject probe/debug artifacts
8. record replacement commit for every accepted V2 change
9. run old + new acceptance suites
10. archive V2 branch read-only/tag
11. delete long-lived active branch only after evidence is complete
```

Do not perform a blanket merge into the new architecture.

---

# 12. Required salvage checklist

| V2 item | Decision | Destination |
|---|---|---|
| bottleInventory math/tests | KEEP/PORT | `packages/domain-inventory` |
| selected count concept | KEEP | canonical inventory API |
| receipt/movement correction command identity | KEEP/REDESIGN | correction domain |
| PO archive blocker | KEEP | catalog/procurement invariant |
| reviewed exact command ID | KEEP | shared command client |
| theme semantic tokens | KEEP SELECTIVELY | design system |
| dialog/drawer accessibility | KEEP SELECTIVELY | design system |
| localStorage count persistence | REPLACE | IndexedDB store |
| localStorage correction status | REPLACE | command/outbox repository |
| Supabase bottle SQL dispatcher | REIMPLEMENT | VPS backend/domain |
| probe files/scripts | DISCARD/CLEAN | controlled diagnostics only |
| `.pc.txt` / `.probe_chain.txt` | DISCARD | none |

---

# 13. Exit condition

`V2` is reconciled only when every V2-only file is accounted for as:

```text
PORTED
REIMPLEMENTED
INTENTIONALLY DISCARDED
ARCHIVED AS HISTORICAL EVIDENCE
```

No unclassified branch-only business rule may disappear.


---

# 25 — Repository Gap Register and Reset Addendum

## 1. Purpose

This register records workflow/product gaps found while comparing:

- `davemusau00/SERVEOS-WEB/main`;
- `davemusau00/SERVEOS-WEB/V2`;
- legacy `davemusau00/servos-`;
- concept/prototype `davemusau00/ServOs`.

A missing feature in this register does not automatically mean "build immediately". It means the reset must deliberately decide whether the workflow belongs in ServOS 1.0 and, if so, define one authoritative implementation.

---

## 2. P0 architecture/coherence gaps

### GAP-A01 — One network authority

**Status:** reset requirement.

Current generation contains legacy/V2 authority complexity. New VPS API must be sole network mutation authority.

### GAP-A02 — Terminal SQLite role

SQLite becomes:

- local projection;
- durable command outbox;
- offline authorized execution store;
- printer/hardware survival store.

It is not a competing cloud source of truth.

### GAP-A03 — exact command recovery

Every financial/destructive workflow persists command ID before dispatch and checks that ID after response loss.

V2 correction work validates this direction and should inform the shared command client.

### GAP-A04 — V2 branch divergence

V2 remains 7 ahead / 2 behind the reviewed `main` and contains unmerged business invariants. Resolve per `24-V2-BRANCH-RECONCILIATION.md`.

---

# 3. P0/P1 printing gaps

### GAP-P01 — Purchase-order printing

**Repo evidence:** Native and Web Procurement contain no print call/path while create/receive/match/pay are implemented.

**Required:** immutable/versioned PO document + 80mm thermal print.

### GAP-P02 — General business document spooler

Current queue is `receipt_print_jobs` and native renderer is receipt-specific.

**Required:** general `print_jobs` + typed document renderer.

### GAP-P03 — GRN print

After receiving, operator needs printable Goods Receipt Note.

### GAP-P04 — Stock requisition / transfer paper

No canonical requisition domain in production branch.

`ServOs` prototype contains a useful Stock Requisition UX concept.

### GAP-P05 — Count sheet / variance print

Required for physical/fallback stocktaking.

### GAP-P06 — Close-day / cash-up print

Production Native persists close-day reports but reporting view has no print action.

### GAP-P07 — customer credit statement print

Native displays the statement but does not print it.

### GAP-P08 — folio statement print

Production prints checkout receipt but lacks a full open-folio statement print workflow.

The `ServOs` concept PMS contains a `Print Folio Statement` concept worth adapting.

### GAP-P09 — maintenance/housekeeping/KOT print

No shared operational document printing path exists.

---

# 4. Procurement gaps

### GAP-PR01 — PO state machine

Current ordinary Native creation message says the PO is "created and approved locally".

Need configurable simple vs controlled purchasing policy with draft/approval/issue/cancel/revision states.

### GAP-PR02 — PO edit/cancel/revision

Canonical operation registry has create/receive but no explicit PO approve/cancel/amend/issue commands.

### GAP-PR03 — physical supplier returns

No canonical supplier-return workflow.

V2 `procurement.reverseUnusedReceipt` is only an exact correction of an unused duplicate, not a physical return.

### GAP-PR04 — full receipt/accounting correction

V2 explicitly leaves consumed stock, wrong prices, supplier returns and paid/matched invoices to a future accounting design.

New backend must close this intentionally.

### GAP-PR05 — supplier remittance/statement

No unified Supplier 360 + printable remittance/statement flow.

### GAP-PR06 — purchasing approval thresholds

Need policy such as:

```text
≤ KES 10,000 manager may approve
> KES 10,000 admin/owner required
```

without hardcoding amounts in UI.

---

# 5. Inventory gaps

### GAP-I01 — selected/spot count

V2 adds `inventory.countSelected`; preserve it as separate from full count.

### GAP-I02 — durable Web count state

V2 physical-count wrapper uses `localStorage` rather than IndexedDB BusinessStore.

Replace.

### GAP-I03 — internal requisition

Production has direct transfer but no request/approve/dispatch/receive stock-requisition lifecycle.

### GAP-I04 — supplier return stock movement

Needs explicit outbound supplier-return movement and credit-note linkage.

### GAP-I05 — label/barcode printing

No general label printer document path.

### GAP-I06 — archive blockers/reactivation

V2 improves archive protection and adds reactivation concept. Port as typed lifecycle semantics.

### GAP-I07 — corrections after later activity

Current V2 exact reversal intentionally blocks when later stock/cost activity makes restoration unsafe.

Need guided current-balance/accounting correction path rather than leaving the operator with a dead end.

---

# 6. Hospitality gaps

### GAP-H01 — simple walk-in stay

Current historical reservation model requires customer-linked reservation semantics. Reset requires optional inline guest snapshot and atomic `stay.quickCheckIn`-style backend orchestration.

### GAP-H02 — deposits optional by policy

Deposit/folio machinery remains, but no-deposit walk-in must be first-class.

### GAP-H03 — folio statement document

Separate from checkout receipt.

### GAP-H04 — reservation confirmation / registration card

Operational documents absent from production print system.

### GAP-H05 — tape-chart experience

Production has room/front-desk workspaces; `ServOs` concept repository has a useful Hotel Tape Chart concept.

Consider adapting the visualization after the state machine/API is stable, not before.

### GAP-H06 — housekeeping handoff

Need Today/shift queue and optional paper list.

### GAP-H07 — maintenance work-order integration

Need one path from room/asset problem → maintenance task → out-of-order state → completion → return-to-service.

---

# 7. POS/KDS gaps

### GAP-S01 — KOT/BOT thermal fallback

Production has KDS but no generic thermal service-ticket printing.

### GAP-S02 — printer routing by service area

Need Kitchen/Bar/Receipt printer roles.

### GAP-S03 — reprint semantics

Operational tickets and documents need visible `REPRINT` marking and audit.

### GAP-S04 — repeat-round exact configuration

Ensure portions/modifiers/notes are reconstructed exactly, then current availability is revalidated.

### GAP-S05 — exception vocabulary

Void, comp, refund and correction contracts must remain distinct across API/Web/Terminal.

---

# 8. Finance/shift gaps

### GAP-F01 — shift handover

Native has till close/backup/sync but no explicit two-operator handover workflow.

The `ServOs` Staff/Cash concept contains handover ideas worth product analysis, but not direct code migration.

### GAP-F02 — printed cash voucher

Paid in/out needs optional evidence print.

### GAP-F03 — close-day report distribution

Persisted report exists; add thermal summary and later A4 export.

### GAP-F04 — tender exception inbox

M-Pesa reconciliation exists. Today/Manager should show unresolved mismatches rather than requiring navigation hunting.

---

# 9. Staff/RBAC gaps

### GAP-R01 — role contract convergence

One canonical role/permission matrix across API, Web and Terminal.

### GAP-R02 — workspace visibility

Navigation permission should represent task eligibility, not generic record-read permissions.

### GAP-R03 — step-up approval UX

No UUID/token shuffling. Use a reusable manager approval dialog/device-local step-up.

### GAP-R04 — shift/station assignment

Later operational improvement: assign cashier/server/storekeeper to outlet/station/till so Today and permissions are context-aware.

---

# 10. Web/responsive gaps

### GAP-W01 — IndexedDB for durable workflow drafts

No sensitive or significant workflow should rely on raw localStorage state.

### GAP-W02 — modal recovery

Unknown outcomes need recovery controls inside the modal/sheet.

### GAP-W03 — mobile/tablet task layouts

Tables must become cards/sheets on narrow layouts for operational work.

### GAP-W04 — offline language

Web draft must say `Saved as local draft`, not promise automatic transaction sync until that path is truly implemented.

---

# 11. Setup/import gaps

### GAP-C01 — business profiles

Restaurant/bar/hotel/resort/retail capability bundles should configure shell and defaults without forking the database.

### GAP-C02 — post-import readiness

Import result must lead directly to unresolved setup issues.

### GAP-C03 — hardware commissioning

Printer/scanner acceptance should be a named Go-Live checkpoint.

---

# 12. Security/cleanup gaps

### GAP-X01 — V2 probe artifacts

Do not merge `.pc.txt`, `.probe_chain.txt`, `probe-run.ps1` or ad-hoc probe SQL into production reset.

### GAP-X02 — source tree debris

Legacy `servos-` still contains `.bak` source files. Treat as archive-only evidence, not code to move.

### GAP-X03 — generic record writes

Do not recreate `record.save` as the normal mutation vocabulary in the new backend. Critical domains receive typed endpoints/commands.

### GAP-X04 — direct DB access

No browser or Terminal production code receives PostgreSQL credentials or direct mutation RPC access.

---

# 13. Recommended implementation packages added to roadmap

## Package WF-01 — Business Document Core

- document table/model;
- numbering;
- immutable issued snapshots;
- layout versioning;
- reprint audit.

## Package WF-02 — Generic Terminal Print Queue

- migrate receipt queue;
- typed renderer;
- printer roles;
- LAN/USB transport;
- uncertain delivery handling.

## Package WF-03 — Procurement Lifecycle

- draft/approval/issue/revision/cancel;
- PO print;
- GRN print;
- supplier return;
- correction paths.

## Package WF-04 — Stock Requisition

- request/approval/dispatch/receive;
- transfer in transit;
- print docs.

## Package WF-05 — Operational Print Pack

- count sheet;
- variance report;
- till close;
- customer statement;
- folio statement;
- maintenance/housekeeping.

## Package WF-06 — KOT/BOT Routing

- printer roles;
- service-area routes;
- queue/reprint.

## Package WF-07 — Shift Handover

- outgoing/incoming acknowledgement;
- unresolved-work summary;
- cash/printer/sync blockers.

## Package WF-08 — V2 Salvage

Execute `24-V2-BRANCH-RECONCILIATION.md` before branch retirement.

---

# 14. Priority

### Before pilot

Must have:

- generic print queue foundation;
- PO/GRN thermal print;
- selected/full count correctness;
- simple hotel walk-in;
- reliable receipt printing;
- till close/cash-up;
- response-loss recovery;
- V2 business-rule salvage.

### Before broad hospitality rollout

Add:

- folio statements;
- housekeeping/maintenance documents;
- supplier returns;
- controlled requisitions;
- KOT/BOT routing.

### Later

- CRM/loyalty concepts;
- payroll/staff HR depth from prototype;
- eTIMS;
- guest self-ordering QR menu;
- advanced multi-property SaaS console.

---

# 15. Definition of closure

A gap is closed only when:

```text
contract
+ backend transaction
+ permissions
+ audit
+ Web UX
+ Terminal UX where applicable
+ offline rule
+ document/print rule where applicable
+ responsive tests
+ failure/retry tests
+ operator acceptance
```

all agree.

## Web-first gaps added to the register

### P0

- Production Web currently lacks true durable offline command authority.
- Browser projection/outbox schema and IndexedDB migrations are not yet canonical.
- Multi-tab sync leadership is not yet a defined production contract.
- Direct legacy/Supabase authority paths must be eliminated from final production.
- Printing is still receipt/native-centric and must become BusinessDocument + browser/bridge capable.

### P1

- PWA persistent-storage diagnostics/recovery export.
- Offline grant issuance/verification.
- Device enrollment using WebCrypto-backed identity.
- PWA route/domain code splitting.
- Same-VPS Nginx static frontend release mechanism.
- Optional Print Bridge pairing/installer/health UI.
- Browser backup and offsite server restore evidence.


---

# 26 — Web-First PWA Terminal Architecture

## Status

**Decision:** Adopted for the ServOS reset.

ServOS becomes one primary web application delivered from:

`https://serveos.davemusau.co.ke`

The same application serves counter terminals, reception, kitchen/bar screens, stock/store operations, managers, owners and administrators. Device enrollment, role, business capabilities and viewport determine the workspace that appears.

The API remains separately addressable at:

`https://serveosapi.davemusau.co.ke`

Both are deployed to the same VPS, but remain separate origins and separate security boundaries.

## 1. Why this replaces the Native/Web split

The current codebase has proven that maintaining Native and Web as separate first-class application surfaces creates recurring parity work. Business operations, permissions, dialogs, recovery behavior and terminology can drift even when the backend intent is the same.

The reset therefore changes the client model from:

```text
Native Terminal + Web client
```

to:

```text
One ServOS PWA
    ├── Terminal Mode
    ├── Reception Mode
    ├── Kitchen/Bar Mode
    ├── Store Mode
    ├── Manager Mode
    └── Owner/Admin Mode
```

This does not make the product less capable. It moves resilience from the Tauri/SQLite application boundary into a deliberate browser runtime consisting of a Service Worker, IndexedDB, WebCrypto device identity, a durable command outbox, local projections and recovery exports.

## 2. Runtime topology

```text
                         INTERNET
                            │
                 ┌──────────┴──────────┐
                 │                     │
   serveos.davemusau.co.ke   serveosapi.davemusau.co.ke
                 │                     │
              NGINX                 NGINX
                 │                     │
        static PWA release         API container
                 │                     │
                 │              PostgreSQL authority
                 │                     │
                 └──── HTTPS commands ┘
                        + change feed
```

Installed terminal:

```text
Edge / Chrome installed PWA
        │
        ├── cached application shell
        ├── IndexedDB projections
        ├── durable local commands
        ├── offline grants
        ├── print/document queue
        ├── backup snapshots
        └── optional localhost Print Bridge
```

## 3. Authority rule

The VPS API is the only shared mutation authority.

The PWA is allowed to finalize specific operations offline only where the server previously issued a bounded offline grant. An offline command is not a second database write. It is a durable command waiting for authoritative reconciliation.

Never implement:

- browser table upload;
- whole-state snapshot replacement;
- newest timestamp wins;
- client-side conflict resolution by arbitrary overwrite;
- direct PostgreSQL access from the browser;
- direct Supabase table/RPC mutation from production clients.

## 4. Browser persistence layers

### IndexedDB

Primary local persistence for:

- current business projection;
- products/categories/prices;
- rooms and current room state;
- open orders/tabs;
- tills assigned to the device;
- local command outbox;
- confirmed command results needed for recovery;
- change-feed cursor;
- cached business settings required while offline;
- cached branding/document assets;
- print jobs and document snapshots;
- offline grants;
- device capability records;
- guided-help progress local cache.

### Cache Storage

Service Worker caches immutable/versioned application assets and the minimal application shell required to launch ServOS with no network.

### OPFS / local file support

Use only when it materially helps large local artifacts such as:

- backup bundles;
- diagnostic packages;
- large controlled import staging;
- local document archives.

Do not create a second relational database in OPFS unless browser support and performance measurements prove IndexedDB insufficient.

## 5. Persistent storage request

The PWA should call `navigator.storage.persist()` where supported after enrollment and explain the result.

Expose a device-health indicator:

```text
LOCAL STORAGE
Persistent       Yes
Offline data      182 MB
Pending commands  0
Last backup       Today 15:20
```

If durable persistence is not granted, show an actionable warning to administrators. Do not frighten ordinary cashiers with browser terminology.

## 6. Multi-tab and duplicate-worker protection

One browser profile can open multiple tabs. That must not create two sync engines sending the same command concurrently.

Use:

- Web Locks API where supported;
- BroadcastChannel for tab coordination;
- a single elected sync leader;
- command-level server idempotency regardless of client locking.

Server idempotency remains mandatory because browser locks are optimization, not authority.

## 7. Device enrollment

Each installed PWA is enrolled as a ServOS device.

Suggested device identity:

```text
deviceId
businessId
outletId
workstationType
name
publicKey
createdAt
revokedAt?
lastSeenAt
capabilities
```

On enrollment, use WebCrypto to create a non-exportable device private key where browser support allows it. Register the public key with the API.

If browser site data is deleted, treat that as a lost device credential and require re-enrollment. Do not put reusable device secrets in localStorage.

## 8. Terminal Mode

A device enrolled as a counter terminal gets a deliberately narrow shell.

```text
TODAY | SELL | TABS | ORDERS | STOCK | CLOSE SHIFT
```

Manager/admin screens remain permission gated and can be hidden entirely on the counter device.

## 9. Reception Mode

```text
TODAY | FRONT DESK | ROOMS | GUESTS | HOUSEKEEPING | PAYMENTS
```

Quick walk-in remains a first-class path:

```text
Available Room
  → Check In
  → Guest name
  → nights / checkout
  → pay now or later
  → complete
```

A persistent CRM customer account, deposit or manually opened folio is optional unless property policy requires it.

## 10. Store Mode

```text
TODAY | RECEIVE | COUNT | TRANSFER | WASTE | ITEMS | PURCHASE ORDERS
```

Operators work in physical language. Crates, bottles, packs, kilograms and millilitres are converted to canonical units internally.

## 11. Kitchen / Bar Mode

A PWA on a wall tablet or counter screen receives relevant service-area orders through the API change feed when online and can use local device messaging/queued documents where a configured offline topology permits it.

For first offline release, avoid pretending several disconnected devices can independently coordinate one order queue. Choose an explicit offline authority topology per property.

## 12. App update policy

The Service Worker must never activate a new application version halfway through a payment, count, check-in or other critical workflow.

Use:

```text
new build discovered
    ↓
download in background
    ↓
mark UPDATE_READY
    ↓
wait until safe boundary
    ↓
operator/automatic controlled reload
```

A safe boundary means no critical modal, no unsent active command transition and no locally unresolved payment outcome.

## 13. Bundle-size requirement

The merged baseline builds successfully but reports a main JS chunk above 1 MB before gzip. The web-first reset should reduce cold-start cost through route/domain code splitting.

Targets:

- shell available rapidly on modest business hardware;
- POS route preloaded for Terminal Mode;
- hospitality/procurement/admin chunks loaded on demand;
- large logos and decorative assets optimized before shipping;
- no 1.8 MB app logo in the critical startup path.

## 14. Tauri retirement strategy

Do not delete the Native implementation on day one.

Use it as:

- behavior/reference implementation;
- domain invariant oracle;
- migration source;
- printer code source;
- test evidence.

Retirement sequence:

1. freeze new business features in Tauri;
2. implement new VPS API/domain kernel;
3. implement PWA offline store/outbox;
4. move business operations to API contracts;
5. port acceptance tests;
6. pilot PWA Terminal Mode;
7. extract printer transport into optional Print Bridge;
8. prove offline/recovery/hardware acceptance;
9. retire Tauri business runtime.

## 15. Definition of done

Web-first Terminal is complete only when a business can:

- install the PWA;
- enroll it;
- load after internet loss;
- make an offline-authorized sale;
- close and reopen the PWA without losing that sale;
- reconnect and confirm the same command once;
- print/reprint appropriately;
- export a local recovery backup;
- recover a replacement machine from server bootstrap;
- operate all critical workflows at 1024×600 without clipped controls.


---

# 27 — Browser Offline Sync, Recovery and Backup Specification

## 1. Objective

Make an installed ServOS PWA dependable during internet failure without creating a second competing business database.

The model is command synchronization, not database synchronization.

## 2. Local command lifecycle

Canonical states:

```text
DRAFT
PENDING
SENDING
OUTCOME_UNKNOWN
CONFIRMED
REJECTED
CONFLICT
SUPERSEDED
```

Critical rule: persist command identity locally before network transmission.

Online path:

```text
operator confirms action
    ↓
generate command UUID
    ↓
write command to IndexedDB
    ↓
optionally update optimistic/local projection
    ↓
send same command UUID
    ↓
API commits atomically
    ↓
API returns result + change cursor
    ↓
apply projection changes
    ↓
mark CONFIRMED
```

## 3. Response loss

If a request may have reached the server but the response is lost:

```text
SENDING → OUTCOME_UNKNOWN
```

Never generate another payment/sale command as a retry.

Resolve with:

`GET /v1/commands/{commandId}`

Possible outcomes:

- confirmed;
- rejected;
- still processing;
- genuinely unknown/not received.

Only a genuinely absent command may be replayed using the **same ID**.

## 4. Change feed

Every authoritative commit increments a business-scoped cursor.

Example:

```json
{
  "cursor": 918441,
  "changes": [
    {
      "entityType": "order",
      "entityId": "...",
      "version": 12,
      "projection": {}
    }
  ]
}
```

Browser stores the highest fully applied cursor transactionally with projection updates.

Reconnect:

```text
resolve OUTCOME_UNKNOWN
    ↓
send PENDING in client sequence
    ↓
apply command responses
    ↓
GET changes after local cursor
    ↓
apply ordered changes
    ↓
renew offline grant
```

## 5. Offline grants

Offline capability is explicit authority issued before disconnection.

Grant fields can include:

```text
grantId
businessId
deviceId
outletId
issuedAt
expiresAt
policyVersion
allowedCommands
maximumDiscount
maximumRefund
assignedTillId
receiptNumberBlock
roomLeaseScope
stockAuthorityScope
signature/keyVersion
```

The first release should prefer **one offline-authorized terminal per business/outlet operational scope** rather than free-form disconnected multi-device writes.

## 6. Phase-one offline commands

Recommended:

- POS order create/update;
- ordinary item sale;
- cash payment;
- manual M-Pesa/card evidence where business policy permits;
- tab/table updates within device authority;
- KOT/BOT document creation;
- receipt/document printing;
- POS-caused inventory consumption;
- simple walk-in stay where room lease permits;
- simple checkout where local stay is in scope;
- stock count draft and reviewed submission;
- local print queue operations.

Initially online-only or tightly restricted:

- staff/role/security changes;
- supplier payment;
- high-value refund;
- major balance correction;
- destructive reversal;
- global price imports;
- business settings;
- multi-device room move outside lease;
- credit limit overrides;
- migration/import apply.

## 7. Conflict philosophy

A conflict is a business event requiring a decision, not an invitation to overwrite the server.

UI example:

```text
This order changed on another device.

Server total: KES 4,200
This device:  KES 4,700

[ Review Changes ]
```

Never expose raw HTTP 409 payloads to ordinary operators.

## 8. Local projection structure

Suggested stores:

```text
meta
business
outlets
staff_projection
catalog
stock_projection
rooms_projection
orders_projection
folios_projection
tills_projection
local_commands
command_results
change_cursor
offline_grants
print_documents
print_jobs
backup_metadata
```

Pending local overlays must be distinguishable from server-confirmed versions.

## 9. Browser cache invalidation

Business data is not kept in Service Worker HTTP response caches as the authoritative local store.

Service Worker:

- static app shell;
- versioned JS/CSS/assets;
- selected immutable help content.

IndexedDB:

- business state;
- commands;
- operational documents;
- offline state.

## 10. Local backup bundle

Export format:

`*.serveosbackup`

Suggested contents:

```text
manifest.json
projection.json or structured export
commands.json
command-results.json
print-documents/
branding/
settings.json
checksums.json
```

The bundle should contain **no reusable authentication password/token**.

Where appropriate encrypt it with an administrator-provided recovery secret or a business recovery key managed independently of the browser session.

## 11. Backup levels

### Server backup

Authoritative PostgreSQL backups run automatically on the VPS.

### Offsite backup

At least one encrypted backup copy must leave the VPS failure domain. Hosting the application, API and database on one VPS is acceptable for the initial product; storing the only backups on the same VPS is not.

Use an external S3-compatible object store, second server or equivalent remote target.

### Terminal recovery backup

Manager can export a local recovery bundle containing unresolved offline evidence and cached projections.

### Optional automatic folder backup

On supported Chromium environments, the File System Access API may be used after explicit operator permission to save rotating local backups to a chosen folder/USB location.

This is an enhancement, not the only recovery mechanism.

## 12. Backup retention

Suggested initial policy:

- PostgreSQL daily full/logical checkpoint: 14 daily;
- weekly: 8 weekly;
- monthly: 6 monthly;
- WAL/incremental/PITR window where configured: at least 7 days;
- browser recovery exports: retain latest 7 or business policy;
- immutable receipt/business documents retained according to financial/legal policy.

Validate against actual storage costs before finalizing production retention.

## 13. Restore tests

A backup that has never been restored is only a theory.

Automate/record:

- database restore into isolated container;
- migration/version verification;
- row/domain sanity checks;
- command/audit counts;
- receipt/document snapshot availability;
- restore timestamp and duration.

Run a full restore rehearsal before production launch and on a recurring schedule.

## 14. Device replacement

New device:

```text
open/install PWA
    ↓
enroll new device
    ↓
authenticate administrator
    ↓
download bootstrap manifest/pages
    ↓
rebuild IndexedDB projection
    ↓
configure printer/scanner
    ↓
resume
```

If old device has unresolved commands, import its recovery bundle and resolve command IDs against the server before allowing replay.

## 15. Browser data loss

Cleared site data must never erase server-authoritative business history.

It can erase unresolved offline evidence if the operator did not back it up. Therefore:

- make persistence status visible to admins;
- warn when unresolved commands exist before logout/device reset;
- block destructive local reset unless pending commands are resolved/exported;
- encourage automated local backup on dedicated terminals.

## 16. Sync observability

Admin diagnostics should show:

```text
Device
Last server cursor
Last successful sync
Pending command count
Oldest pending age
Unknown outcome count
Conflict count
Offline grant expiry
Local storage use
Last recovery backup
```

Ordinary operator UI should show only concise operational state.


---

# 28 — Silent ESC/POS Printing Fixes and ServOS Print Bridge

## 1. Problem statement

A browser can create excellent 80mm print layouts but standard browser security intentionally prevents arbitrary raw access to Windows printer queues and TCP printers. Therefore a pure PWA cannot universally promise silent raw ESC/POS output across all hardware.

This is a hardware-boundary problem, not a reason to keep the entire ServOS business application native.

## 2. Printing capability levels

ServOS supports three deliberate printing levels.

### Level A — Standard browser printing

Use dedicated 80mm CSS and `window.print()`.

Good for:

- laptops;
- office workstations;
- management devices;
- occasional POs/statements;
- Android/tablets using OS print services.

Advantages:

- no local software;
- works with ordinary installed printers;
- same web application everywhere.

Limitations:

- print dialog may appear;
- browser/driver may alter margins/scaling;
- cannot guarantee raw cutter/drawer/raster commands.

### Level B — Dedicated kiosk printing

On controlled counter PCs run the Chromium/Edge app in a dedicated POS launch profile with kiosk-printing behavior and a known default printer.

Good for:

- simple silent browser receipts;
- businesses where Windows driver output is visually verified and cutter behavior is adequate.

Limitations:

- depends on browser/OS/driver configuration;
- less deterministic than raw ESC/POS;
- printer routing and peripheral commands remain limited.

### Level C — ServOS Print Bridge

Recommended for **guaranteed silent raw ESC/POS**.

A tiny optional local service is installed only on hardware terminals that need it.

It is not ServOS business logic and is not another application authority.

```text
ServOS PWA
   │
   │ signed local print job
   ▼
ServOS Print Bridge
   │
   ├── Windows RAW queue
   └── LAN TCP 9100
          │
       XP-80T
```

## 3. What the Print Bridge contains

Only:

- device pairing identity;
- secure localhost endpoint;
- print job validation;
- small durable print spool;
- ESC/POS renderer/transport;
- printer discovery/health diagnostics;
- local print audit metadata;
- no business-domain mutation engine.

It does **not** contain:

- catalog;
- inventory database;
- rooms;
- customers;
- finance ledger;
- cloud sync;
- business command authority;
- pricing logic.

## 4. Reuse existing tested code

The current Rust printer implementation already contains valuable tested transport behavior for:

- Windows RAW printing;
- LAN TCP printing;
- bounded printer profiles;
- durable uncertainty states;
- cutter/feed control;
- receipt raster handling.

Extract this code from Tauri into a standalone small service/library instead of rewriting it from scratch.

Generalize receipt-only functions into:

```text
BusinessDocument
    ↓
DocumentRenderer
    ↓
EscPosDocument
    ↓
PrinterTransport
```

## 5. Generic print job

Suggested contract:

```json
{
  "jobId": "uuid",
  "deviceId": "uuid",
  "documentId": "uuid",
  "documentType": "PURCHASE_ORDER",
  "documentHash": "sha256...",
  "layoutVersion": 3,
  "printerRole": "OFFICE",
  "copies": 1,
  "createdAt": "...",
  "payload": {},
  "signature": "..."
}
```

Bridge verifies:

- origin/pairing;
- device identity;
- signature;
- payload bounds;
- document hash;
- duplicate job ID;
- printer profile.

## 6. Local security

Do not run a permissive HTTP server accepting arbitrary print bytes.

Recommended controls:

- listen only on loopback;
- use HTTPS/WSS localhost endpoint with installer-managed trust;
- CORS/origin allowlist only `https://serveos.davemusau.co.ke` plus explicit staging origin;
- pair PWA device with bridge once;
- signed requests using enrolled device key;
- maximum payload sizes;
- typed document schemas;
- never accept arbitrary ESC/POS bytes from browser JavaScript;
- bridge generates raw control bytes itself.

This prevents a compromised web payload from becoming unrestricted printer command injection.

## 7. Offline printing

Printing must work while the internet is down.

The PWA already has:

- local document snapshot;
- local business branding assets;
- device key;
- local print queue.

Therefore it can sign and submit a local print job without the VPS being reachable.

The bridge returns one of:

```text
QUEUED
SENDING
SENT_TO_SPOOLER
DELIVERY_UNCERTAIN
FAILED
CANCELLED
```

Do not claim `PRINTED` when neither Windows spooler nor TCP printer provides physical paper acknowledgement.

## 8. Delivery uncertainty

If connection opens and fails during write, do not silently retry.

Display:

> The printer may have received part or all of this document. Check the paper before retrying.

A retry after uncertainty should require explicit operator confirmation and create an audit note such as `POSSIBLE_DUPLICATE_REPRINT`.

## 9. Printer roles

Support logical roles:

```text
RECEIPT
KITCHEN
BAR
OFFICE
LABEL
```

Small business can map every role to one printer.

Larger business can map:

- customer receipt → counter printer;
- KOT → kitchen printer;
- BOT → bar printer;
- PO/GRN/report → office/store printer.

## 10. Business document rendering

The print bridge must not read live business tables. It receives an immutable BusinessDocument snapshot.

Document types include:

- sale receipt;
- refund receipt;
- purchase order;
- goods receipt note;
- supplier return;
- stock requisition;
- stock transfer;
- blind count sheet;
- variance report;
- till opening/close/cash-up;
- customer credit statement;
- guest folio statement;
- reservation confirmation;
- housekeeping list;
- maintenance work order;
- KOT/BOT.

## 11. Logo and payment QR fix

Both business logo and uploaded payment QR use **one generic thermal-image path**.

The QR is a PNG asset. ServOS does not parse QR modules.

```text
PNG
  ↓
decode
  ↓
white background composite
  ↓
resize to printer profile
  ↓
monochrome raster
  ↓
append_image()
```

Same algorithm for logo and QR.

Receipt order:

```text
[BUSINESS LOGO]
Business identity
...
TOTAL / PAYMENT
Thank-you

Scan to Pay via One app
[PAYMENT QR PNG]

Fixed footer
feed/cut
```

The business logo moves to the top.

## 12. Browser fallback for the same document

Every BusinessDocument renderer should have:

```text
HTML/CSS renderer
ESC/POS renderer
plain-text/download renderer where useful
```

If Print Bridge unavailable:

```text
[ Print ]
```

uses browser print.

If Bridge healthy:

```text
[ Print ]
```

can silently queue to configured printer.

Settings can expose:

```text
Printing mode
○ Browser print
○ Kiosk/default printer
● ServOS Print Bridge
```

## 13. Bridge discovery UX

Settings → Devices → Printing:

```text
ServOS Print Bridge
Status: Connected
Version: 1.0.0
Device: Counter 01

Receipt Printer   XP-80T USB
Kitchen Printer   192.168.1.80
Office Printer    XP-80T USB

[Test Receipt]
[Test PO]
[Test Logo + Payment QR]
```

If absent:

> Direct printing is unavailable on this device. You can still use browser printing.

## 14. Windows launch mode

Dedicated POS workstation can use a startup shortcut that launches the installed PWA in application/fullscreen mode. Kiosk print flags may be used only after physical acceptance on the target Chrome/Edge version and printer driver.

Treat browser flags as deployment configuration, not product guarantees.

## 15. Android

Android PWA remains supported for operational use.

Printing levels may differ:

- OS/browser print service;
- network printer support through a future Android bridge;
- vendor print service where appropriate.

Do not promise silent raw ESC/POS on arbitrary Android hardware until separately accepted.

## 16. Test matrix

Required physical tests on XP-80T class hardware:

- USB raw receipt;
- LAN raw receipt;
- logo at top;
- uploaded PNG payment QR;
- printed QR scans successfully;
- long receipt;
- short receipt;
- purchase order;
- GRN;
- count sheet;
- KOT/BOT;
- two printer roles;
- printer unavailable;
- cable disconnect during send;
- duplicate retry confirmation;
- browser offline;
- browser restart;
- bridge restart;
- Windows restart;
- cutter margin;
- five consecutive jobs;
- 50-job stress queue.

## 17. Recommendation

For ServOS 1.0:

- PWA is the product;
- browser print is universal fallback;
- kiosk printing is supported deployment mode after local validation;
- ServOS Print Bridge is the recommended optional component for dedicated Windows POS machines needing deterministic silent ESC/POS.

This removes the need for Tauri to own the entire POS while preserving the best part of the native investment: reliable printer transport.


---

# 29 — Same-VPS Frontend + API Production Topology

## 1. Decision

Both public ServOS endpoints are hosted on the same VPS:

- `https://serveos.davemusau.co.ke` — PWA frontend;
- `https://serveosapi.davemusau.co.ke` — API.

PostgreSQL and workers are private services on the same VPS for the initial production architecture.

This is intentionally simpler than splitting frontend hosting, database hosting and API hosting across several vendors.

## 2. Existing VPS facts from the pre-reset audit

Observed server baseline:

- Ubuntu 24.04 LTS family;
- 4 vCPU;
- approximately 7.8 GiB RAM;
- approximately 142 GB root storage with substantial free capacity at audit time;
- Docker already installed and in use;
- Nginx already owns public ports 80/443;
- existing applications are bound to localhost 3000/3001;
- existing PostgreSQL/Redis containers belong to other applications and must not be reused by ServOS;
- host-level Node/npm is not required because ServOS will deploy through static assets and containers.

Before production deployment rerun a short resource/port preflight because these values can change.

## 3. Recommended production topology

```text
                         VPS
                          │
                       NGINX
              ┌───────────┴───────────┐
              │                       │
serveos.davemusau.co.ke     serveosapi.davemusau.co.ke
              │                       │
    /var/www/serveos/current     127.0.0.1:3101
       static PWA build                │
                                      API
                                       │
                         private Docker network
                           ┌───────────┴──────────┐
                           │                      │
                       PostgreSQL              Worker
```

## 4. Why serve the frontend directly from Nginx

The production frontend is static after build.

There is no need to keep a Node process alive just to serve Vite output.

Recommended release path:

```text
/var/www/serveos/
  releases/
    <git-sha>/
  current -> releases/<git-sha>
```

Deploy:

1. CI builds frontend;
2. artifact is copied/unpacked to new release directory;
3. verify hashes/manifest;
4. atomically switch `current` symlink;
5. reload Nginx only when config changes.

Rollback is another symlink switch.

## 5. API deployment

API runs in Docker and binds only to loopback, for example:

```text
127.0.0.1:3101 -> api:3000
```

Nginx is the only public ingress.

Do not use ports 3000/3001 on the host because they are already occupied in the audited server.

## 6. PostgreSQL

ServOS gets its own PostgreSQL container/volume/database credentials.

No public `5432` host binding.

Only API/worker/migration containers access it over the private `serveos` Docker network.

Do not share the database instance/container used by unrelated SMS systems merely because it already exists.

## 7. Worker

Worker handles non-interactive jobs such as:

- report generation;
- scheduled backup verification;
- notification jobs;
- cleanup/retention;
- external integration retry where safe;
- future eTIMS/Daraja asynchronous workflows.

Do not put transactional command authority in a queue if the operator requires immediate authoritative confirmation. The API transaction commits first; background jobs follow.

## 8. Redis

Not mandatory for first release.

Prefer PostgreSQL-backed job/advisory-lock mechanisms initially if adequate. Introduce a dedicated ServOS Redis only when measured requirements justify it.

Never borrow an unrelated application's Redis container.

## 9. Nginx sites

Conceptual configuration:

```nginx
server {
  server_name serveos.davemusau.co.ke;
  root /var/www/serveos/current;
  index index.html;

  location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
  }
}

server {
  server_name serveosapi.davemusau.co.ke;

  location / {
    proxy_pass http://127.0.0.1:3101;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Actual production config must include TLS, timeouts, request size policies, SSE buffering rules and security headers.

## 10. TLS

Use Certbot with the existing Nginx deployment model or another centrally managed ACME path already compatible with the server.

Require HTTPS for both origins because:

- PWA installation/service workers require secure context;
- WebCrypto/device identity relies on secure context;
- offline APIs and modern browser storage features are designed around HTTPS;
- local Print Bridge pairing must trust the public origin.

## 11. CORS

API allowlist production origin explicitly:

`https://serveos.davemusau.co.ke`

Do not use wildcard CORS with credentials.

Staging origin is separately allowlisted.

## 12. CSP

Set a restrictive Content Security Policy.

At minimum constrain:

- scripts to same-origin generated assets;
- API connections to `serveosapi.davemusau.co.ke`;
- local print bridge endpoint when enabled;
- image/data/blob sources required for receipt branding carefully;
- no arbitrary remote script/CDN execution in production.

## 13. Production Compose boundary

Suggested containers:

```text
serveos-api
serveos-worker
serveos-postgres
serveos-backup
```

Optional later:

```text
serveos-redis
serveos-observability
```

Frontend is static Nginx content, not necessarily a container.

## 14. Server coexistence rules

The VPS already hosts other workloads. ServOS deployment must:

- use unique container/network/volume names;
- use its own `/opt/serveos` directory;
- avoid existing host ports;
- never run broad `docker system prune -a` during normal deployment;
- never alter unrelated Nginx site files;
- never restart Docker casually during trading/production hours;
- monitor RAM/disk across the whole VPS, not only ServOS containers.

## 15. Disk hygiene

The audit showed significant reclaimable container images/build cache. Cleanup must be selective.

Use image retention scripts based on known unused digests rather than destructive blanket pruning.

Set alerts before root filesystem exhaustion.

## 16. Required preflight before first ServOS deploy

Check:

```text
uname -a
uptime
free -h
df -h
docker ps
docker system df
ss -tulpn
nginx -t
systemctl status nginx docker
```

Also verify any pending kernel/system restart from prior maintenance has been safely completed and unrelated services return healthy after reboot.

## 17. Backup failure domain

Application, API and database may share this VPS initially.

The **only backup copy must not**.

At least one encrypted PostgreSQL backup stream/archive goes to independent storage.

## 18. Scaling path

When measurements justify it, separate in this order:

1. external/offsite backup already exists;
2. database to dedicated VPS/managed PostgreSQL if DB pressure demands it;
3. worker jobs to separate compute if noisy;
4. frontend CDN only if useful;
5. horizontal API replicas behind Nginx/load balancer.

Do not pre-emptively create microservices for a problem the first VPS does not have.


---

# 30 — Web-First Refactor Implementation Plan

## Goal

Transform the merged `reset/vps-platform` baseline into a single web/PWA ServOS with a new VPS API while preserving proven domain rules and deliberately retiring duplicated runtimes.

## Baseline evidence

The pre-refactor merged branch has a strong test baseline:

- dependency install completes with zero reported npm vulnerabilities;
- production Vite build succeeds;
- 216 JavaScript/source-contract tests pass;
- 106 native Rust/domain tests pass;
- Native→Cloud parity generation currently reports 94 operations and 88 shared Native mutations with handlers;
- build reports a large main client chunk, which becomes a web-first performance cleanup target;
- existing Web V2 is disabled by default and currently fails closed offline;
- current QR tests intentionally enforce a separate QR image path, which must be rewritten to the new generic receipt-image rule.

This baseline should be tagged and preserved as evidence rather than treated as dead code.

## Phase 0 — Freeze and preserve evidence

- keep `pre-vps-reset-2026-10-06` tag;
- commit generated baseline docs intentionally or restore them before refactor;
- move/commit reset documentation in a deliberate location;
- capture current `npm test` and `npm run test:native` output in release evidence;
- mark Tauri business runtime feature-frozen;
- remove probe/debug debris from active product paths after preserving anything needed for analysis.

Exit: clean Git status and reproducible baseline.

## Phase 1 — Define new monorepo boundaries without breaking existing app

Target:

```text
apps/
  web/
  api/
  worker/
  print-bridge/        optional hardware component

packages/
  contracts/
  domain/
  permissions/
  offline/
  sync/
  documents/
  printing/
  inventory/
  hospitality/
  finance/
  design-system/
  test-fixtures/

infra/
  vps/
  nginx/
  backup/
```

Use incremental moves. Avoid a giant rename commit mixed with business changes.

Exit: builds/tests still pass; package boundaries enforce import directions.

## Phase 2 — New API command kernel

Implement:

- health/readiness;
- auth/session skeleton;
- business/device identity;
- canonical command registry;
- command idempotency table;
- expected-version checks;
- transaction wrapper;
- audit event;
- change cursor/event table;
- command status lookup;
- bootstrap endpoint.

Exit test:

1. submit command;
2. replay same command ID/same payload returns same outcome;
3. same ID/different payload fails;
4. response-loss simulation resolves through command lookup;
5. projection can rebuild from bootstrap + change feed.

## Phase 3 — PWA persistence kernel

Implement IndexedDB repositories for:

- metadata/version;
- projection stores;
- local commands;
- command outcomes;
- sync cursor;
- offline grants;
- documents/print jobs;
- recovery metadata.

Add:

- Web Locks sync leader;
- BroadcastChannel coordination;
- storage persistence request;
- storage health diagnostics;
- local database version migrations.

Exit: reload/reboot browser preserves local state and one pending synthetic command.

## Phase 4 — Online command migration

Move Web UI away from Supabase/RPC/legacy bridge to the new API operation by operation.

Recommended order:

1. business settings read;
2. catalog/item creation;
3. inventory reads;
4. POS order;
5. payment/receipt;
6. tills;
7. procurement;
8. stock counts/transfers/waste;
9. hospitality;
10. finance controls;
11. maintenance/assets;
12. staff/admin/imports.

No production route may have both old and new mutation paths after migration.

## Phase 5 — Offline POS

Implement bounded offline grant and local POS projection.

Acceptance:

- online bootstrap;
- disconnect network;
- create sale;
- cash payment;
- immutable local receipt/document;
- close browser;
- reopen offline;
- sale remains visible;
- reconnect;
- exactly one server sale/payment;
- projection converges.

## Phase 6 — Printing subsystem

Create shared BusinessDocument schemas and HTML/CSS renderer first.

Then extract Rust printer code to `apps/print-bridge`.

Refactor:

```text
encode_receipt
receipt_print_jobs
```

into generic concepts:

```text
render_business_document
print_jobs
printer_roles
```

Implement browser fallback, kiosk acceptance and bridge mode.

Fix QR by deleting QR-specific module reconstruction and routing PNG through generic image preparation.

## Phase 7 — Procurement/operator workflows

Implement refined:

- quick supplier;
- simple PO;
- issue/approve policy;
- repeat order;
- receive all / exceptions;
- GRN;
- supplier return;
- invoice match/payment;
- thermal PO/GRN;
- stock requisition chain where enabled.

## Phase 8 — Hospitality simple/advanced model

Implement `stay.quickCheckIn` and guest snapshot.

Default simple path requires no persistent account/deposit unless policy says otherwise.

Retain advanced reservations, guest profiles, deposits, folios, extensions and room moves.

Add offline room lease only after one-device authority is proven.

## Phase 9 — Remaining offline workflows

Add based on risk and evidence:

- stock count commit;
- controlled receiving;
- waste/transfer;
- room check-in/out;
- KOT/BOT queue;
- till close.

Keep security/config/high-risk finance online until explicit offline design exists.

## Phase 10 — VPS staging

Deploy both frontend and API to the same VPS using staging subdomains or isolated paths.

Do not disturb existing workloads.

Verify:

- Nginx/TLS;
- CORS/CSP;
- API loopback binding;
- Postgres private network;
- migration from zero;
- backup/restore;
- PWA install/update;
- change feed through reverse proxy.

## Phase 11 — Migration/cutover

Existing Supabase/SQLite become migration sources, not ongoing peers.

Perform:

```text
freeze source
export
validate totals/hashes
transform/import
reconcile
pilot read-only comparison
fence old writers
switch DNS/production clients
monitor
```

No continuous bidirectional old/new sync.

## Phase 12 — Pilot business

Use one real hospitality business and one controlled counter machine.

Prove full day:

- opening till;
- menu sales;
- M-Pesa/cash;
- receipts;
- network interruption;
- reconnect;
- stock receive/count;
- PO/GRN print;
- room walk-in/payment/checkout;
- close till/day;
- backup;
- device/browser restart.

No developer database intervention allowed during the acceptance day.

## Phase 13 — Native retirement

Only after PWA pilot gates pass:

- remove Tauri business runtime from release process;
- retain archived/native test vectors where useful;
- keep Print Bridge as optional independent package;
- delete obsolete cloud RPC/cutover machinery after migration support window.

## Cross-cutting rule

Every refactor PR must answer:

1. What old authority path is being removed?
2. What command/API owns this operation now?
3. What happens offline?
4. How does response loss recover?
5. What is printed/documented?
6. What tests prove it?
7. What operator sees on 1024×600?


---

# 31 — Reset Baseline Evidence — 2026-10-06

## Repository

Working repository:

`davemusau00/SERVEOS-WEB`

Working branch:

`reset/vps-platform`

Reset baseline tag:

`pre-vps-reset-2026-10-06`

The branch was created from `main` and merged with `origin/V2` before the refactor.

## Build baseline

`npm ci`

- completed successfully;
- 125 packages installed in captured run;
- npm audit reported 0 vulnerabilities.

`npm run build`

- help index generated 40 offline help articles;
- operation parity ledger generated 94 operations;
- parity gate reported 88 shared Native mutations with complete V2 handlers;
- Vite transformed 2384 modules;
- build completed successfully;
- main JS output remained above the bundler's 500 kB warning threshold and is a web-first performance target.

## JavaScript/source tests

`npm test`

```text
tests     216
pass      216
fail      0
```

Important existing behavior to preserve/replace deliberately includes:

- atomic audit/outbox behavior;
- payment idempotency;
- room/folio conservation;
- procurement classification;
- inventory counts/corrections;
- device identity;
- web command result states;
- PWA safe update boundary;
- current printer transport validation.

Important current behavior that the reset intentionally changes:

- production Web V2 disabled by default;
- Web offline commands currently fail closed;
- QR has its own specialized preparation path;
- device-local `runtime.print_receipt` remains excluded from cloud parity;
- duplicated Native/Web views remain.

## Native/Rust baseline

`npm run test:native`

```text
106 passed
0 failed
```

Compiler warnings existed but did not fail the suite.

The native tests become behavioral evidence during migration. Do not delete them until equivalent API/PWA/domain tests cover the same invariants.

## Working tree note

Running build/test regenerates:

- `docs/generated/OPERATION_PARITY_LEDGER.json`;
- `docs/generated/OPERATION_PARITY_LEDGER.md`;
- `src/generated/help-index.json`.

The reset documentation directory was also untracked in the captured local state.

Before architectural refactor commits, decide intentionally whether generated outputs are committed artifacts and make the build reproducible/clean accordingly.

## VPS baseline

Pre-reset VPS audit observed:

- Ubuntu 24.04 LTS family;
- 4 vCPU;
- ~7.8 GiB RAM;
- ~142 GB root filesystem with ~115 GB free at that observation;
- Docker and Nginx active;
- public 80/443 owned by Nginx;
- localhost 3000 and 3001 already used by existing applications;
- existing unrelated PostgreSQL/Redis containers;
- no requirement for host-level Node/npm;
- pending system/kernel restart appeared during maintenance and must be rechecked before deployment.

This is sufficient for an initial colocated ServOS PWA/API/PostgreSQL deployment if monitored, but production deployment must rerun current resource checks.


---

# Architecture Decision Records


# ADR-001 — Single Network Mutation Authority

**Status:** Accepted for reset; terminology updated by ADR-010

## Decision

`serveosapi.davemusau.co.ke` is the only production shared mutation authority.

The ServOS PWA does not mutate PostgreSQL directly and does not call database RPC dispatchers. Offline work is represented as bounded local commands that later reconcile through this same API.

## Reason

Previous architecture allowed legacy upload and V2/direct-database semantics to coexist, producing dual-authority and parity risk.

## Consequences

- all shared mutations are observable and idempotent;
- one permission/error/command model;
- backend availability is mitigated by bounded PWA offline grants;
- old direct-client mutation code is retired after cutover.


# ADR-002 — No Recurring Snapshot Synchronization

**Status:** Accepted for reset; terminology updated by ADR-010

## Decision

The ServOS PWA synchronizes explicit commands upward and ordered change records downward.

Whole-state snapshots are used only for bootstrap/recovery/migration, never recurring reconciliation.

## Reason

Snapshot upload makes conflict ownership ambiguous and obscures which business action produced state.

## Consequences

- every change has causal command/audit evidence;
- response loss is recoverable by command ID;
- IndexedDB projection can be rebuilt;
- migration tooling imports old data once rather than maintaining bidirectional peers.


# ADR-003 — Modular Monolith Backend

**Status:** Accepted for reset

## Decision

Deploy one API service, one worker and one PostgreSQL database with internal domain modules.

## Reason

Current problem is excess boundaries and drift, not insufficient services. Microservices would multiply contracts, deployments and failure modes.

## Consequences

- transactions across POS/inventory/finance are straightforward;
- deployment stays understandable;
- modules still have code boundaries;
- services may split later only with measured need.


# ADR-004 — Bounded Offline Device Authority

**Status:** Accepted; superseded in client terminology by ADR-010

## Decision

An enrolled ServOS PWA device may finalize selected operations offline only inside a server-issued and bounded grant.

## Reason

Businesses need local resilience, but unconstrained multi-writer offline state recreates synchronization ambiguity.

## Consequences

- installed web terminals remain useful during outages;
- offline feature set is deliberately scoped;
- grant issuance/reconciliation is a core protocol feature;
- some sensitive actions block offline;
- phase one prefers one offline-authorized device per scarce operational scope.


# ADR-005 — Relational Operational Domain Model

**Status:** Accepted for new backend

## Decision

Primary business truth uses explicit relational tables rather than a generic collection/id/JSON record store.

JSONB remains for flexible metadata, commands, audit and immutable document snapshots where appropriate.

## Reason

The generic record model made partial replacement and cross-domain invariants difficult to reason about.

## Consequences

- more explicit migrations;
- better constraints/indexing/query clarity;
- legacy data needs transformation during migration;
- domain code becomes easier to test.


# ADR-006 — One Receipt Image Pipeline

**Status:** Accepted

## Decision

Business logo and uploaded payment QR PNG use the same image normalization and thermal-raster preparation pipeline.

The receipt logo prints at the top. Customer payment QR prints near the bottom below the exact text `Scan to Pay via One app`.

## Reason

The separate QR module-detection/reconstruction pipeline is unnecessary and has failed in practice, while logo raster printing is proven.

## Consequences

- QR content is treated as a trusted uploaded print asset;
- no QR decoding/rebuilding;
- historic receipt snapshot remains immutable.


# ADR-007 — Simple Default, Advanced Available

**Status:** Accepted product principle

## Decision

ServOS keeps advanced domain capability but default workflows expose the minimum business steps.

Examples:

- quick hotel check-in without customer account/deposit;
- menu item without recipe;
- PO item without accounting classification;
- stock entry in physical packaging.

## Reason

Advanced capability had become mandatory ceremony and made a capable system feel immature.

## Consequences

- progressive disclosure is required;
- advanced workflows remain tested;
- UI labels use business language while backend retains detailed domain models.


# ADR-008 — One Business Document Model and One Device Print Subsystem

## Status

Accepted; printing transport updated by ADR-011.

## Context

Current native printing is receipt-specific while operators also need Purchase Orders, GRNs, count sheets, cash-up reports, statements, folios, KOT/BOT tickets and work orders on 80mm hardware.

Allowing each module to invent printer output would duplicate formatting, retry and audit logic.

## Decision

All printable operational artifacts are typed, versioned `BusinessDocument` snapshots.

The PWA provides the universal HTML/CSS print path. Dedicated terminals may use the optional ServOS Print Bridge for durable raw ESC/POS spooling and Windows RAW/LAN transport.

Domain modules produce document data. Renderers produce bounded output. Hardware transport never owns procurement/accounting semantics.

## Consequences

- current `receipt_print_jobs` behavior is generalized rather than duplicated;
- receipt behavior remains one document family;
- reprint/audit/uncertain-delivery semantics are shared;
- PO/GRN/KOT/count/statement printing can be added without new business-specific printer transports;
- physical printer acceptance remains mandatory.


# ADR-009 — Recording Corrections, Supplier Returns and Accounting Adjustments Are Distinct

## Status

Accepted for ServOS reset.

## Context

The V2 branch introduces guarded exact reversals for inventory movements and unused duplicate goods receipts. These are useful but intentionally reject cases where physical goods moved, stock was consumed, or later accounting activity exists.

A real supplier return is a physical event and must not be represented as an exact historical reversal.

## Decision

ServOS models separate business concepts:

1. **Recording correction** — the recorded event was erroneous and exact compensating restoration is still provably safe.
2. **Current balance correction** — physical truth differs from recorded balance; create immutable adjustment evidence.
3. **Supplier return** — goods physically leave the business and may create a supplier credit expectation.
4. **Accounting adjustment** — invoice price, credit note or settled payable requires ledger correction.

These concepts must use different command identities, permissions, audit language and printed documents.

## Consequences

- `procurement.reverseUnusedReceipt` may survive as a narrowly scoped correction concept.
- It may not be used for normal supplier returns.
- Operator UI explains physical and financial effects before confirmation.
- Reporting can distinguish errors from actual return activity.


# ADR-010 — Web-First PWA Is the Primary ServOS Client

## Status
Accepted — 2026-10-06

## Context
ServOS currently carries parallel Native/Tauri and Web surfaces. This creates command, permission, UX and deployment parity work. The merged baseline already contains a PWA shell, Web operational surfaces and strong domain tests.

## Decision
The installable PWA at `serveos.davemusau.co.ke` becomes the primary ServOS client for counter, reception, store, kitchen/bar, manager and owner use.

Tauri is frozen as a business-feature target and retained temporarily as migration/test/reference evidence.

Offline resilience moves to IndexedDB + Service Worker + durable command outbox + bounded offline grants.

## Consequences
Positive:
- one UI/runtime;
- one responsive design system;
- simpler Android/Windows deployment;
- fewer parity bugs;
- updates delivered centrally;
- easier support.

Costs:
- browser offline persistence must be engineered deliberately;
- silent raw hardware printing needs a separate solution;
- existing native behavior must be ported/tested before retirement.


# ADR-011 — Optional Local Print Bridge for Guaranteed ESC/POS

## Status
Accepted — 2026-10-06

## Context
Standard browsers cannot universally guarantee silent raw Windows queue/TCP ESC/POS access. Keeping the full Tauri application only for printer access would preserve unnecessary duplicate business runtimes.

## Decision
Provide three printing levels: browser print, validated kiosk/default-printer mode, and an optional ServOS Print Bridge for dedicated terminals requiring deterministic silent raw ESC/POS.

The bridge is loopback-only, paired/signed, and contains printer transport/spooling only. It has no business database and no shared mutation authority.

Existing tested Rust Windows RAW/LAN printer code should be extracted and generalized into this component.

## Consequences
The core product remains web-only while dedicated POS hardware can retain robust raw printing. Bridge versioning/security becomes an explicit operational responsibility.


# ADR-012 — Frontend and API Share the Initial Production VPS

## Status
Accepted — 2026-10-06

## Context
A separate VPS is available and already runs Docker + Nginx. Splitting frontend, API and database across multiple hosting vendors would add deployment/sync complexity without a demonstrated scaling requirement.

## Decision
Host `serveos.davemusau.co.ke` and `serveosapi.davemusau.co.ke` on the same VPS.

Host Nginx serves immutable static PWA releases directly and reverse proxies the API to a loopback-bound Docker container. PostgreSQL and worker remain private Docker services.

At least one encrypted backup copy must leave the VPS.

## Consequences
Deployment is simpler and cheaper, with one operational environment. Resource/noisy-neighbor risk is handled through monitoring and can later trigger separation of database/worker/frontend only when measured.
