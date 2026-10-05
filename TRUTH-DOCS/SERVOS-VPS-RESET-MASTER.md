# SERVOS VPS RESET — MASTER DOCUMENT

Generated from the documentation set in this package.


---

# 00 — ServOS Executive Reset

## 1. Why this reset exists

ServOS has accumulated enough functionality to look broad and mature while still behaving inconsistently at the boundaries that matter most: mutation authority, synchronization, permissions, recovery and operator flow.

The reset therefore does **not** begin by adding features. It begins by reducing the number of architectural truths and making the product understandable.

### Existing strengths to preserve

- Mature local Terminal concepts: POS, tills, printer/scanner integration, SQLite durability and recovery.
- Strong inventory ideas: physical packaging, portioned drinks, recipes, counts, receiving and immutable movements.
- Strong hospitality direction: rooms, reservations, Front Desk, housekeeping and folios.
- Web/PWA reach and management surfaces.
- Existing V2 ideas around command IDs, versions, audit, idempotency and cutover evidence.
- Receipt immutability and reprint history.
- Guided help and role-based workspaces.

### Existing failure patterns to eliminate

- Legacy upload and V2 authority coexisting.
- Terminal and Web using different operation names for the same business action.
- SQL migration chains acting as a growing application dispatcher.
- Direct client coupling to hosted-database RPCs.
- Generic JSON record updates capable of clobbering unrelated fields.
- Web screens presenting actions whose backend semantics are missing or different.
- Offline Web messaging implying synchronization that is not actually guaranteed.
- Large monolithic screens accumulating local UI primitives and special cases.
- Feature-first navigation exposing irrelevant modules to ordinary staff.
- Separate QR raster logic despite a working receipt-logo image pipeline.

## 2. The reset decisions

### Decision A — One product trunk

`davemusau00/SERVEOS-WEB` becomes the canonical repository. Historical repositories become read-only references.

### Decision B — One network authority

The new API at:

`https://serveosapi.davemusau.co.ke`

is the only production network mutation authority.

No production browser code calls PostgreSQL directly.
No production Terminal code uploads arbitrary table/record snapshots.
No alternate cloud writer exists beside the API.

### Decision C — Web and Terminal remain first-class

The Web UI at:

`https://serveos.davemusau.co.ke`

is not a replacement for Terminal.

Terminal continues to own:

- printer/scanner hardware;
- local SQLite durability;
- full-screen counter operation;
- controlled offline capability;
- local recovery.

Web continues to own:

- remote reach;
- additional workstations;
- owner/manager use;
- administration;
- cloud-first workflows.

### Decision D — SQLite becomes a projection, not a second cloud

After cutover, the terminal database contains a locally queryable projection of cloud truth plus terminal-only device state, queued commands and offline grant state.

When online, commands are committed by the API.
When offline, only explicitly authorized command categories can be locally finalized.

### Decision E — No snapshot synchronization

Synchronization consists of:

1. explicit commands going up;
2. ordered change records coming down;
3. a bootstrap snapshot only when initializing/recovering a client.

There is no recurring whole-database upload.

### Decision F — Business logic moves out of the SQL dispatcher chain

PostgreSQL remains responsible for:

- transactions;
- constraints;
- uniqueness;
- foreign keys;
- indexes;
- immutable/audit protections;
- atomic data persistence.

The API/domain layer becomes responsible for:

- permission decisions;
- command routing;
- domain validation;
- orchestration;
- lifecycle rules;
- package conversion;
- hospitality state machines;
- application errors;
- API contracts.

### Decision G — Modular monolith before microservices

The first VPS backend is one deployable API and one worker using one PostgreSQL database.

Modules are separated in code, not by network boundaries.

This avoids replacing one form of complexity with another.

## 3. Product reset principle

> **The operator sees the business. ServOS sees the machinery.**

Examples:

- Operator says "5 crates of Coke arrived." ServOS calculates canonical units and cost.
- Receptionist says "Check John into Room 6 for one night." ServOS creates the internal stay/folio structure.
- Cashier says "M-Pesa, KES 2,450." ServOS creates payment, audit and receipt evidence.
- Manager says "Correct this count to 39 cans." ServOS records an immutable correction movement.

## 4. Business profiles

A single engine supports multiple business shapes through capabilities:

- Restaurant / Cafe
- Bar / Lounge / Club
- Hotel / Guest House
- Resort
- Restaurant + Hotel
- Retail / Counter Sales
- Custom

Profiles configure navigation, default settings, terminology and readiness requirements. They do not create incompatible codebases.

## 5. Product maturity gate

ServOS 1.0 is not defined by module count. It is defined by complete business journeys.

A release must prove at minimum:

- open till → sell → pay → print → refund where authorized → close till;
- create item → receive stock → count → transfer/waste → reconcile;
- create PO → approve → partial/full receive → invoice/pay supplier;
- quick room check-in → optional payment → stay → checkout;
- advanced reservation/deposit/folio path where enabled;
- network loss → Terminal continuity inside policy;
- response loss → original command status recovery;
- printer failure → transaction survives and receipt reprints;
- restart → no transaction duplication;
- Web and Terminal converge after reconnect;
- backup → restore → client re-bootstrap.

## 6. The specific anti-goals

The reset must not turn into:

- a rewrite of everything at once;
- a microservice project;
- a new generic ERP framework;
- a migration that enables old and new writers simultaneously;
- a cosmetic redesign over unchanged protocol problems;
- a requirement that every browser work offline;
- business logic hidden in ever-growing SQL stored procedures;
- more dashboards while critical workflows still have recovery gaps.

## 7. Release strategy

The new backend is built beside current production capability in an isolated environment.

The sequence is:

```text
stabilize current main
      ↓
create shared contracts
      ↓
stand up VPS staging backend
      ↓
implement domain modules
      ↓
connect Web
      ↓
connect Terminal online
      ↓
implement bounded Terminal offline
      ↓
migration rehearsal
      ↓
full business acceptance
      ↓
production cutover
      ↓
old stack read-only
```

No live data is moved until the new stack passes the migration, reconciliation and failure suites.

## 8. ServOS 1.0 product promise

A useful target statement for every design review:

> A business should be able to operate ServOS without understanding how ServOS is built.

And a useful engineering test:

> If the same business action has different semantics in Web, Terminal and API, the feature is not finished.

---

# 01 — Target Architecture

## 1. Production topology

```text
                           PUBLIC INTERNET
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
       serveos.davemusau.co.ke      serveosapi.davemusau.co.ke
                    │                           │
             ServOS Web/PWA                 Caddy/Nginx
                    │                           │
                    └──────── HTTPS ────────────┤
                                                │
                                         ServOS Core API
                                                │
                                ┌───────────────┼───────────────┐
                                │               │               │
                           PostgreSQL       API worker      SSE/change feed
                                │
                      authoritative business state

               Business location / property
               ┌─────────────────────────────────────────┐
               │ ServOS Terminal                         │
               │ Tauri + React                           │
               │ SQLite projection                       │
               │ printer / scanner                       │
               │ durable command outbox                  │
               │ offline grant cache                     │
               └───────────────────┬─────────────────────┘
                                   │ HTTPS
                                   └──── serveosapi.davemusau.co.ke
```

## 2. Authority model

### PostgreSQL

Final network authority for:

- business configuration;
- catalog;
- inventory;
- orders;
- payments;
- procurement;
- hospitality;
- customer credit;
- staff/roles;
- audit;
- document sequences;
- device registration;
- synchronization cursors.

### API

Only public mutation gateway.

It owns:

- authentication context;
- authorization;
- input validation;
- command idempotency;
- expected-version checks;
- domain orchestration;
- transaction boundaries;
- audit generation;
- change-feed generation;
- operator-facing errors.

### Terminal SQLite

Not a second server.

Contains:

- projection of entities required by Terminal;
- hardware/device preferences;
- local session state;
- durable pending commands;
- immutable locally created offline receipts until server acknowledgement;
- offline grants;
- sync cursor;
- count/session drafts;
- local logs/recovery metadata.

### Web browser

Does not maintain a competing database.

It may persist:

- cached query data;
- unsent form drafts;
- user UI preferences;
- PWA shell resources.

Offline Web drafts are never described as committed transactions.

## 3. Read path

Online Web:

```text
React Query/UI
   ↓
GET serveosapi.../v1/...
   ↓
API query service
   ↓
PostgreSQL
```

Online Terminal:

```text
UI
 ↓
SQLite local projection for fast reads
 ↓                     ↘
background sync          API query fallback where needed
```

The Terminal normally reads locally so selling stays fast. The sync engine keeps that local projection current.

## 4. Write path

### Online

```text
Web or Terminal
      ↓
create command UUID
      ↓
POST /v1/commands
      ↓
auth + permission + schema validation
      ↓
check existing command UUID
      ↓
check expected versions
      ↓
BEGIN PostgreSQL transaction
      ↓
execute domain handler
      ↓
write domain rows
      ↓
write audit rows
      ↓
write change-feed entries
      ↓
mark command CONFIRMED
      ↓
COMMIT
      ↓
return result + cursor
```

### Response loss

```text
client sends command ABC
      ↓
server commits ABC
      ↓
network response is lost
      ↓
client keeps ABC in UNKNOWN
      ↓
GET /v1/commands/ABC
      ↓
CONFIRMED
```

The client never creates ABC2 just because ABC timed out.

## 5. Change distribution

Every committed mutation produces one or more ordered change records with a monotonically increasing cursor.

Clients request:

`GET /v1/sync/changes?after=<cursor>`

The API returns:

- `fromCursor`;
- `toCursor`;
- ordered changes;
- `hasMore`;
- current protocol/schema versions.

SSE can notify online clients that newer changes exist, but cursor pulling remains the source of truth. If SSE drops, correctness is unaffected.

## 6. Why SSE rather than making WebSocket correctness-critical

ServOS primarily needs server-to-client invalidation and change notification.

SSE is sufficient for:

- new order status;
- stock changes;
- room changes;
- command outcome updates;
- till changes;
- activity notifications.

Commands remain ordinary HTTPS requests.

Benefits:

- easier reverse proxy configuration;
- easier recovery;
- simpler observability;
- fewer persistent bidirectional session assumptions.

A future WebSocket service can be introduced if a measured feature requires it, but it is not part of transaction correctness.

## 7. Backend deployment shape

Recommended Docker services:

```text
caddy                 public 80/443
serveos-web            internal static/web container
serveos-api            internal HTTP
serveos-worker         internal background worker
postgres               private network only
backup                  scheduled/offsite backup process
```

Optional later:

```text
prometheus
grafana
loki
minio
```

Do not introduce Redis on day one unless workload evidence requires it. A PostgreSQL-backed job queue is adequate for initial email, report, cleanup and reconciliation jobs.

## 8. Domain boundaries

The backend is a modular monolith containing:

- Identity & Access
- Business Setup
- Catalog
- Inventory
- POS / Orders
- Payments & Tills
- Procurement / AP
- Hospitality
- Customer Credit
- Receipts / Documents
- Assets & Maintenance
- Reporting
- Audit
- Devices & Sync
- Imports

A module may not directly mutate another module's tables from route code. Cross-module behavior goes through application/domain services inside one database transaction.

## 9. Database philosophy

Use normalized relational tables for operational truth.

Use JSONB only where it is genuinely flexible:

- command payload snapshots;
- audit before/after summaries;
- receipt documents;
- import staging;
- non-query-critical metadata.

Do not rebuild a generic `records(collection,id,data)` table as the main business database.

## 10. Protocol versioning

Every client identifies:

```text
clientVersion
protocolVersion
schemaCompatibilityVersion
deviceId
```

Server replies include minimum supported client/protocol versions.

A client that is unsafe must fail clearly before sending mutations.

Example operator message:

> This ServOS Terminal needs an update before it can transact with the server. Your local data is safe.

Not:

> PROTOCOL_VERSION_MISMATCH

## 11. High availability expectations

One VPS is still one physical failure domain.

The design therefore requires:

- offsite backups;
- tested restore;
- a rebuildable Docker deployment;
- DNS documented for failover;
- Terminal offline capability for supported operations;
- immutable migration history;
- reproducible container images.

A second VPS/database replica can be added later without changing the client protocol.

## 12. Architecture invariant checklist

The following statements should stay true for the life of ServOS 1.x:

- There is one network mutation API.
- Database ports are not publicly exposed.
- Clients cannot issue raw SQL.
- Clients cannot call hidden database RPC functions directly.
- Every mutation has an idempotency identity.
- Every domain row mutation belongs to a transaction.
- Every committed command produces audit evidence.
- Every projection can be rebuilt from authoritative server state plus immutable history where required.
- Terminal offline authority is explicit and bounded.
- Web offline content is draft-only unless a future grant specification says otherwise.

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

- every emitted Web/Terminal command exists;
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

Web and Terminal do not authenticate directly with PostgreSQL.

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
- local POS interaction remains instant because cart/UI and Terminal reads do not block on rendering round trips;
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
- Web and Terminal contract tests use the same generated command definitions.

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

This protocol is the replacement for legacy snapshot upload, direct Supabase RPC coupling and divergent Web/Terminal mutation semantics.

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
- Terminal reconnect/replay;
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

For a new/recovered Terminal:

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

1. downloads into a temporary SQLite database or staging tables;
2. verifies page hashes/counts;
3. verifies manifest hash;
4. installs atomically;
5. records `snapshotCursor`;
6. starts pulling newer changes.

Never partially replace the live local projection.

## 11. Terminal push/pull loop

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

## 12. Web behavior

Web sends commands directly and refreshes/invalidate query caches from returned changes/SSE.

If offline:

- save explicitly labeled drafts where useful;
- do not claim they will automatically become transactions;
- on reconnect, revalidate and ask the operator to submit where the action is sensitive.

## 13. Offline Terminal commands

Offline commands use the same command schema with:

```text
offlineGrantId
clientSequence
localCommittedAt
```

The Terminal locally applies only command types allowed by the grant.

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

# 06 — Terminal, SQLite and Offline Operation

## 1. Goal

Keep the Terminal resilient without recreating the old architectural mistake where local and cloud state can both mutate independently and later attempt to reconcile arbitrary snapshots.

## 2. Terminal database roles

The local SQLite database contains four distinct categories of data.

### A. Server projection

Examples:

- items;
- stock balances;
- rooms;
- rate plans;
- current staff permissions;
- suppliers;
- open orders/stays needed locally;
- current receipt metadata.

These rows are updated by ordered server changes and have server versions.

### B. Local terminal state

Examples:

- printer configuration;
- scanner configuration;
- UI/device preferences;
- local diagnostic history;
- locally cached branding raster.

These are not synchronized as business records unless explicitly represented by a command.

### C. Durable command outbox

Contains commands not yet confirmed by server.

### D. Offline authority state

Contains signed offline grants, their limits and locally consumed resources.

## 3. Never upload tables

The Terminal must not have a function conceptually equivalent to:

```text
upload all business records
replace cloud copy
```

Nor should recovery compare two databases and choose rows based on timestamps.

Only commands cross upward.
Only ordered projections/change records cross downward.

## 4. Local command table

Suggested structure:

```text
local_commands
  id UUID PK
  type TEXT
  payload_json TEXT
  expected_versions_json TEXT
  status TEXT
  client_sequence INTEGER
  created_at TEXT
  local_committed_at TEXT nullable
  sent_at TEXT nullable
  confirmed_at TEXT nullable
  server_cursor INTEGER nullable
  last_error_code TEXT nullable
  offline_grant_id TEXT nullable
```

Statuses:

```text
PENDING
SENT
OUTCOME_UNKNOWN
CONFIRMED
REJECTED
CONFLICT
```

## 5. Online transaction behavior

Preferred online mode:

1. UI creates command with UUID.
2. Persist command locally before network send.
3. Send command to API.
4. On confirmed response, apply returned changes and mark confirmed in one SQLite transaction.
5. Pull any subsequent changes.

For transaction speed, UI may optimistically render safe local state, but authoritative durable projection must reconcile to server changes.

## 6. Why persist before send

If power disappears after a cashier presses Pay but before the application records the request, the action can vanish.

Persisting first gives the Terminal evidence of intent and command identity.

The server's command ID provides idempotency.

## 7. Response loss

If request transport fails after send:

```text
SENT → OUTCOME_UNKNOWN
```

The Terminal does not automatically reverse local UI or create another payment.

It requests:

`GET /v1/commands/<same-id>`

and resolves the existing outcome.

## 8. Offline philosophy

Offline is not "pretend the cloud does not exist."

Offline means:

> The server previously gave this enrolled Terminal bounded authority to perform specific business actions for a limited period/resource scope.

## 9. Offline grant

A signed grant can contain:

```text
grantId
businessId
deviceId
operator/role constraints
issuedAt
expiresAt
policyVersion
allowedCommands
outlet/serviceArea scope
stock resource ceilings or allocations
till identity/limits
room leases where applicable
receipt/document sequence block
maximum discount/refund authority
signature/key version
```

The exact resource model can start small and expand.

## 10. Phase-1 offline scope

Do not try to support every ServOS operation offline immediately.

Recommended first supported offline commands:

- open already-assigned till if policy allows;
- create/open POS order;
- add/remove ordinary order items;
- fire kitchen order locally;
- cash payment;
- manually confirmed M-Pesa/card tender with clearly offline evidence rules;
- print immutable receipt;
- ordinary inventory consumption caused by POS;
- close local order.

Potentially blocked offline initially:

- supplier payments;
- major stock corrections;
- imports;
- staff/role edits;
- credit-limit overrides;
- room moves involving shared uncertain availability;
- refunds above threshold;
- advanced procurement approval;
- configuration changes.

## 11. Stock allocation strategy

For true multi-device offline selling, the server must prevent two devices from selling the same last unit.

Options:

### Single offline-authorized Terminal per outlet

Simplest first release.

That Terminal owns offline local stock authority for its assigned outlet while disconnected.

### Resource allocation

Later, server grants stock ceilings/reservations to individual devices.

Do not implement free-form multi-device offline writes without allocation.

## 12. Receipt numbering offline

Avoid global sequence collision.

Use server-issued number blocks or device-prefixed numbers.

Example:

```text
C01-20261005-000231
```

or allocated blocks:

```text
Terminal C01 may issue 250001–251000
```

The human receipt number and immutable command UUID are separate concepts.

## 13. Reconnect

Reconnect algorithm:

```text
verify server/session
    ↓
verify protocol and grant status
    ↓
resolve OUTCOME_UNKNOWN commands
    ↓
replay PENDING offline commands in local sequence order
    ↓
server validates grant/resource use
    ↓
apply server results
    ↓
pull change feed
    ↓
resolve any conflicts requiring manager attention
    ↓
renew grant
```

## 14. Server rejection of an offline command

This is possible if:

- grant signature is invalid;
- grant expired before local command time;
- resource budget exceeded;
- command type was not granted;
- command payload violates invariant.

The Terminal must never silently drop it.

It becomes a reconciliation case with clear evidence and manager workflow.

## 15. Projection application

Each server change has `entityType`, `entityId`, `version` and projection/tombstone.

SQLite applies it only when:

```text
incoming version > current server version
```

or when installing an atomic bootstrap.

Client-local pending overlay data is kept separate from server-version columns so pending state cannot masquerade as confirmed cloud truth.

## 16. Bootstrap/recovery

A corrupted/replaced Terminal is restored by:

1. install ServOS;
2. enroll device;
3. authenticate administrator;
4. request bootstrap;
5. download verified manifest/pages;
6. create fresh SQLite projection;
7. configure printer/scanner;
8. reconcile any separately retained unconfirmed local command evidence if this is a recovery from damaged media;
9. resume.

Do not restore an ancient SQLite file and allow it to overwrite server state.

## 17. Local backup

Local backup is still valuable for:

- offline evidence;
- unconfirmed command recovery;
- printer/job history;
- device configuration;
- diagnostics.

But cloud/PostgreSQL backup is the authoritative business disaster-recovery source after cutover.

## 18. Offline UX

Persistent status indicator:

```text
ONLINE
SYNCING
OFFLINE — LOCAL TRADING ACTIVE
OFFLINE — LIMITED ACTIONS
SYNC ATTENTION REQUIRED
```

When offline, every blocked action says why.

Example:

> Supplier payments need the server. You can continue selling and receiving cash, then try this again when connected.

## 19. Sync diagnostics

Admin-only diagnostics should show:

- current API reachability;
- device ID;
- protocol version;
- local cursor;
- server latest cursor;
- pending commands;
- unknown commands;
- last successful sync;
- active grant expiry;
- unresolved reconciliation items;
- local DB health.

Do not expose this machinery to ordinary cashiers unless action is needed.

## 20. Acceptance

Terminal sync/offline is accepted only after physical tests prove:

- command sent twice commits once;
- response loss recovers;
- app killed after Pay does not duplicate/lose sale;
- internet loss during shift works within grant;
- reconnect replays in correct order;
- server changes arrive locally;
- stale versions conflict;
- grant expiry blocks new protected offline work;
- printer failure does not alter transaction state;
- new Terminal can bootstrap cleanly;
- old Terminal can be revoked/fenced.

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

Make receipts reliable, immutable and visually conventional while removing the fragile QR-specific image-analysis pipeline.

## 2. Canonical receipt ownership

The backend creates the immutable receipt document when a transaction is confirmed.

Terminal owns physical ESC/POS printing and printer queue behavior.

Web can display/download receipt documents but does not claim native printer success unless a supported local printing bridge exists.

## 3. Business logo placement

The business logo moves to the **top** of the receipt.

Customer copy order:

```text
BUSINESS LOGO
Business name
Address / phone / email / outlet

CUSTOMER COPY
Receipt no / date / cashier

items...
subtotal / tax / discount
TOTAL
payment / change / balance

thank-you message

Scan to Pay via One app
[ PAYMENT QR ]

Built By KINGSFORGE
info@kingsforge.co.ke
info@davemusau.co.ke
0746157440

feed
cut
```

## 4. QR requirement

Exact caption:

**Scan to Pay via One app**

The QR is always uploaded as a PNG.

ServOS does not decode, reconstruct or reinterpret it.

## 5. Delete the special QR algorithm

Retire concepts such as:

- QR grid detection;
- module pitch inference;
- dark bounding box discovery;
- quiet-zone reconstruction;
- QR-specific raster packing;
- module-density validation intended to rebuild a code.

The business owns correctness of the supplied QR content.

ServOS owns faithful printing of the PNG.

## 6. Shared receipt-image pipeline

Use one primitive:

`prepareReceiptImage()`

for:

- logo;
- payment QR;
- future small receipt image assets.

Steps:

1. validate MIME/header;
2. decode PNG/image;
3. composite alpha onto white;
4. resize within configured printer width;
5. generate preview image;
6. threshold/dither into printer-compatible 1-bit raster;
7. persist dimensions/hash/raster;
8. render centered.

QR uses the same pipeline as logo.

The only QR-specific rules are product rules:

- PNG only;
- sensible maximum dimensions/file size;
- recommended square image;
- preview before save.

Do not inspect encoded QR modules.

## 7. Image storage

Brand asset version:

```text
id
kind LOGO | PAYMENT_QR
mime image/png
sha256
original bytes
prepared raster width/height/data
createdAt
createdBy
```

Business setting references an active asset version.

## 8. Receipt snapshot

At sale/payment commit, copy the actual raster/version into or reference an immutable version guaranteed to be retained.

Historic reprint must not change because the owner uploaded a new logo or QR tomorrow.

## 9. Layout version

New receipts use a new `layoutVersion`.

Historic layouts remain renderable.

Do not rewrite old documents just to match new branding placement.

## 10. Customer vs business copy

Customer copy:

- business logo top;
- customer transaction detail;
- payment QR near bottom when enabled;
- KingsForge footer.

Business copy:

- business logo top;
- business record detail;
- no payment QR unless a future explicit requirement says otherwise;
- no unnecessary customer-sensitive detail;
- KingsForge footer.

## 11. Printer queue

Transaction completion and printing are separate states.

```text
sale CONFIRMED
receipt CREATED
printer job QUEUED
printer job PRINTING
printer job PRINTED / FAILED
```

A printer failure never changes a paid sale back to unpaid.

Retry/reprint uses the immutable receipt.

## 12. Native raster API

Rust printer layer should know only:

```text
printCenteredRaster(raster)
printText(...)
feed(...)
cut()
```

It should not contain two unrelated implementations for logo and QR.

## 13. Printer profiles

Store profile:

- 80mm width/dots;
- columns;
- logo max width;
- QR max width;
- feed lines;
- cut mode;
- code page/UTF-8 strategy;
- interface/queue identifier.

## 14. Preview

Settings → Branding & Receipts should preview approximately:

- logo size;
- business header;
- sample total;
- QR caption;
- QR placement;
- footer;
- paper width.

Preview is advisory. Physical printer acceptance remains mandatory.

## 15. QR acceptance

Using a real business QR PNG and XP-80T:

- upload PNG;
- save;
- restart app;
- make sale;
- print customer copy;
- logo appears at top;
- exact caption appears;
- QR appears below caption;
- printed QR scans from a phone;
- footer not cut off;
- business copy correct;
- five consecutive receipts correct;
- long receipt correct;
- reprint identical;
- replacing QR affects only new receipts;
- disabling QR removes it only from new receipts.

## 16. Print data security

Receipt printer jobs/logs should not retain more card/payment secret data than the receipt itself requires.

Never print API secrets, full auth tokens or device credentials.

---

# Reset Addendum — General Business Document Printing

Receipt printing becomes one specialization of a broader Business Document spooler.

## 17. Generalize the current receipt queue

The current Native queue is receipt-specific. Replace/generalize:

```text
receipt_print_jobs
```

with:

```text
print_jobs
```

while migrating unresolved historical receipt jobs safely.

The generic queue must retain the strong existing ideas:

- durable local queue;
- one claimant per send;
- `DELIVERY_UNCERTAIN` state;
- explicit duplicate/retry confirmation;
- audited admin cancellation;
- printer profile snapshot.

## 18. Supported document families

ServOS 1.0 should use the same spooler for:

- sale/refund/hotel receipts;
- Purchase Orders;
- Goods Receipt Notes;
- supplier return notes;
- stock requisitions/transfers;
- count sheets/variance reports;
- till cash vouchers and close summaries;
- customer credit statements;
- folio statements;
- housekeeping lists;
- maintenance work orders;
- KOT/BOT tickets;
- item/barcode labels.

See `23-BUSINESS-DOCUMENT-PRINTING.md` for the full contract.

## 19. Printer roles

Add role routing:

```text
RECEIPT
KITCHEN
BAR
OFFICE
LABEL
```

A single physical XP-80T may serve several roles in a small business; larger businesses can map them to separate queues/IPs.

## 20. Current source mismatch to reset requirement

The currently reviewed `printer.rs` still:

- renders receipt-specific customer/business copies;
- treats payment QR with a dedicated QR path;
- appends the logo at the end of the customer copy.

Those are source facts, not the desired reset architecture.

The reset still requires:

- business logo at the top;
- payment QR PNG treated through the same bounded raster primitive as logo;
- exact caption `Scan to Pay via One app`;
- business documents rendered by typed document renderers rather than receipt hacks.

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

## 1. Target endpoints

Web:

`https://serveos.davemusau.co.ke`

API:

`https://serveosapi.davemusau.co.ke`

## 2. Recommended server baseline

Linux VPS with:

- supported Ubuntu/Debian-class distribution;
- at least 4 vCPU / 8 GB RAM for comfortable initial Web/API/PostgreSQL colocation, adjusted after measurement;
- NVMe/SSD;
- adequate disk growth headroom;
- static public IP;
- offsite backup destination.

The exact size depends on businesses, retention and concurrent clients. Measure before promising capacity.

## 3. DNS

Create A/AAAA records:

```text
serveos.davemusau.co.ke     → VPS IP
serveosapi.davemusau.co.ke  → VPS IP
```

Keep TTL modest during first cutover, then raise after stability.

## 4. OS bootstrap

High-level:

1. patch OS;
2. create named sudo user;
3. install SSH keys;
4. harden SSH;
5. configure firewall;
6. install Docker Engine + Compose plugin;
7. create `/opt/serveos`;
8. create persistent volume directories if bind mounts are chosen;
9. configure log rotation;
10. configure time synchronization;
11. install backup credentials securely.

## 5. Filesystem

Example:

```text
/opt/serveos/
  compose.yml
  .env
  caddy/
  backups/
  scripts/
  releases/
```

Do not store Git checkout as the only production release mechanism.

Prefer immutable container images built by CI.

## 6. Containers

Production Compose:

- `caddy`
- `web`
- `api`
- `worker`
- `postgres`
- `backup`

Database and internal services have no host-public ports.

## 7. Reverse proxy

Caddy/Nginx routes:

```text
serveos.davemusau.co.ke
  → web:80

serveosapi.davemusau.co.ke
  → api:3000
```

API streaming endpoint must disable buffering where necessary for SSE.

## 8. TLS

Automatic ACME certificates or centrally managed certificates.

Require HTTPS.

Enable HSTS after confirming domains are stable and certificate renewal works.

## 9. Environment secrets

Production `.env` is created on server/deployment secret store, never committed.

Minimum categories:

```text
DATABASE_URL
PUBLIC_WEB_ORIGIN
PUBLIC_API_URL
SESSION/JWT secrets
password pepper if used
SMTP settings
backup credentials
logging/telemetry settings
```

## 10. Database initialization

On first deploy:

1. start PostgreSQL only;
2. verify version/storage;
3. run schema migrations using release image;
4. run migration verification;
5. create initial admin/business only through controlled bootstrap command/tool;
6. start API;
7. verify readiness;
8. start worker/web.

## 11. Release deploy process

Recommended:

```text
CI builds image tagged by Git SHA
        ↓
push to GHCR/private registry
        ↓
server pulls exact SHA
        ↓
backup/checkpoint if schema change warrants
        ↓
run expand-safe migrations
        ↓
start new API container
        ↓
/health/ready
        ↓
switch/reload proxy if blue-green used
        ↓
run smoke tests
        ↓
start/update worker + web
        ↓
record deployed SHA
```

Never deploy `latest` without recording immutable SHA/digest.

## 12. Zero/minimal downtime

For initial scale, the simplest safe model is:

- backward-compatible DB migration;
- start replacement API;
- health check;
- route traffic;
- stop old API.

Breaking migrations require an explicit maintenance window.

## 13. Schema migration rule

Prefer expand/contract:

Release A:

- add new columns/table;
- code can read old/new.

Release B:

- data backfill;
- code writes new.

Release C:

- remove old structure after all clients are compatible.

## 14. Firewall

Example policy:

- allow established;
- allow SSH from trusted source where practical;
- allow 80/443;
- deny PostgreSQL public access;
- default deny inbound.

## 15. Database maintenance

Document:

- automated vacuum settings;
- index maintenance strategy;
- connection pool limit;
- slow query threshold;
- storage growth alerts;
- migration lock behavior.

## 16. Email

Do not run a full mail server on the ServOS VPS unless there is a specific operational reason.

Use a reputable SMTP/provider for:

- invitations;
- password recovery;
- system notifications.

## 17. Staging

Strongly recommended:

```text
serveos-staging.davemusau.co.ke
serveosapi-staging.davemusau.co.ke
```

with a separate staging database and separate secrets.

If the same VPS hosts staging, use separate Compose project/network/volumes and resource limits.

Never point staging at the production database.

## 18. Rollback

Application-only rollback:

- redeploy prior image digest if DB schema is backward compatible.

Database rollback:

- avoid down migrations as primary recovery;
- restore from checkpoint/backup when a destructive migration corrupted state;
- document forward repair when feasible.

## 19. Production smoke test

After every deployment:

- web loads;
- API ready;
- login works;
- session returns correct business;
- read catalog;
- create harmless test command in staging or designated production smoke fixture;
- SSE connects;
- worker heartbeat;
- DB backup freshness;
- no elevated error rate.

For production business data, avoid synthetic financial mutations unless dedicated smoke tenant exists.

## 20. Emergency mode

If API is unavailable:

- do not point clients at PostgreSQL directly;
- Terminal falls back only to its granted offline mode;
- Web displays service unavailable/read cached data as explicitly stale if useful;
- repair API or restore VPS;
- clients reconnect through normal protocol.

---

# 13 — CI/CD, Observability, Backup and Disaster Recovery

## 1. Principle

A green build is not a production release. ServOS carries money, stock, rooms and receipts; release evidence must match those risks.

## 2. Pull-request gates

Required:

```text
install with lockfile
lint
format check
typecheck
unit tests
contract generation/check
database migration from zero
API integration tests
Terminal domain tests
Web browser tests
security/secret scan
docs links/checks
```

## 3. Main-branch gates

Additionally:

- production Web build;
- API container build;
- Terminal compile/package checks;
- migration upgrade test from prior supported schema;
- command parity check;
- OpenAPI generated diff check;
- Docker Compose config validation;
- SBOM/container vulnerability scan where available.

## 4. Release candidate

A release candidate is an immutable Git SHA and image digest.

Release manifest records:

- Git SHA;
- API image digest;
- Web image digest;
- Terminal installer hash/version;
- migration version;
- protocol version;
- test run IDs;
- known limitations.

## 5. Contract parity automation

Generate from source:

```text
command registry
   + Web command usage
   + Terminal command usage
   + permission registry
   + API handlers
        ↓
parity matrix
```

Fail CI when:

- client emits unknown command;
- handler has no permission;
- canonical command has no tests;
- alias is emitted from new code;
- protocol schema generated output is stale.

## 6. Logs

Structured JSON logs include:

```text
timestamp
level
requestId
commandId when applicable
businessId
actorId redacted/ID only
deviceId
route
latency
status/error code
```

Never log:

- passwords;
- refresh tokens;
- full authorization headers;
- device secrets;
- unnecessary customer sensitive data.

## 7. Metrics

At minimum:

- API request count/latency/error rate;
- DB connection pool usage;
- slow query count;
- command outcome counts;
- commands stuck processing;
- sync cursor lag by active device;
- pending/outcome-unknown Terminal counts when reported;
- worker queue depth/failures;
- database size/disk free;
- backup age;
- SSE connections;
- authentication failures/rate-limit events.

## 8. Alerts

Alert on:

- API health unavailable;
- database unavailable;
- disk low;
- backup stale/failed;
- migration mismatch;
- high 5xx rate;
- worker dead;
- rapid auth failure spike;
- command backlog abnormal;
- database connections exhausted.

Do not alert on every individual operator validation error.

## 9. Error tracking

Capture application exceptions with:

- release SHA;
- route/component;
- request ID/command ID;
- sanitized stack;
- browser/Terminal version.

Avoid uploading customer-sensitive receipt/guest payloads into third-party telemetry by default.

## 10. Backup strategy

Production requires offsite backup outside the VPS failure domain.

Recommended layers:

### PostgreSQL

- regular full/base backup;
- frequent incremental/WAL or equivalent point-in-time strategy if operationally feasible;
- encrypted transfer;
- retention policy;
- backup integrity verification.

### Configuration

- encrypted copy of production deployment configuration/secrets according to secure operational process;
- Caddy/Compose config in Git without secrets.

### Branding/files

If stored in PostgreSQL, covered by DB backup.
If later object storage is introduced, separate versioned backup policy.

## 11. Backup frequency target

Choose explicit RPO/RTO.

Suggested initial target for a live hospitality system:

- RPO: materially less than one trading day; preferably minutes through WAL/PITR capability;
- RTO: documented restore onto replacement VPS within a few hours or better.

Do not claim these targets until timed rehearsal proves them.

## 12. Restore rehearsal

At least periodically:

1. create clean isolated PostgreSQL;
2. restore selected backup;
3. run schema/version verification;
4. run control totals;
5. start API against restored copy;
6. run smoke tenant checks;
7. record duration/result.

A backup never restored is only a hopeful file.

## 13. Disaster scenarios

### VPS lost

- provision replacement VPS;
- DNS/firewall;
- Docker install;
- pull release images;
- restore DB;
- start API/Web;
- change DNS if IP differs;
- Terminal reconnect/pull.

### Database corruption

- stop mutations;
- preserve evidence;
- restore last valid point;
- reconcile Terminal offline commands after restored point;
- replay only commands whose server status is known/absent under documented recovery.

### Terminal PC lost

- revoke old device;
- install new Terminal;
- enroll;
- bootstrap from API;
- configure printer/scanner.

### Internet outage at property

- Terminal continues within offline grant;
- Web unavailable for mutation;
- reconnect and replay.

## 14. Retention

Define separately:

- application logs;
- audit history;
- command history;
- receipt documents;
- backups;
- import raw files;
- browser/Terminal diagnostics.

Financial/audit data should not be discarded on the same short schedule as debug logs.

## 15. Production dashboard

One operations dashboard should answer:

- Is API up?
- Is DB healthy?
- Is disk safe?
- Are backups current?
- What release is deployed?
- Are worker jobs failing?
- Are devices significantly behind?
- Are there unresolved server errors?

Avoid a giant observability project before these basics exist.

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

ServOS passes when real business journeys survive realistic failure, not when only unit tests are green.

## 2. Test layers

### Unit

Pure calculations/state transitions.

### Domain integration

Real PostgreSQL transactions.

### Contract

Schemas, command registry, permissions and client/server compatibility.

### API

Authentication, queries, commands, errors, idempotency, concurrency.

### Web browser

Desktop/tablet/mobile viewports.

### Terminal

React + Tauri/Rust/SQLite.

### Hardware

XP-80T, barcode scanner, Windows target machine.

### Migration

Legacy export/import/reconciliation.

### Chaos/failure

Network loss, process kill, response loss, VPS/database outage.

## 3. Tier A — selling

Prove:

- open till;
- barcode/search item;
- add quantity/modifier/portion;
- table/tab;
- cash payment;
- M-Pesa manual payment;
- card;
- split tender;
- discount with policy;
- comp vs void semantics;
- refund;
- immutable receipt;
- printer retry/reprint;
- close till;
- cash variance policy.

## 4. Tier A — inventory

- create packaged item;
- create spirit/servings;
- opening stock;
- receive package;
- weighted cost;
- count location;
- unknown barcode;
- transfer;
- waste;
- admin correction;
- sealed/open conservation;
- recipe consumption;
- batch production.

## 5. Tier A — procurement

- quick supplier;
- draft PO;
- approval;
- package quantities;
- full receive;
- partial receive;
- rejected goods;
- second receipt;
- over-receipt approval;
- price mismatch;
- invoice match;
- duplicate invoice reference;
- supplier payment;
- duplicate payment replay.

## 6. Tier A — rooms

- create simple room setup;
- quick walk-in check-in without profile;
- pay now;
- pay later;
- checkout;
- optional guest-profile link;
- future reservation;
- deposit;
- extension;
- move;
- room service charge;
- housekeeping clean;
- block/out of order;
- concurrent double-book prevention.

## 7. API protocol

- valid command;
- invalid schema;
- permission denial;
- stale version;
- same ID replay;
- same ID different payload;
- response lost after commit;
- command lookup;
- concurrent commands;
- ordered changes;
- cursor retry;
- bootstrap verification;
- unsupported client protocol.

## 8. Terminal offline

- disconnect before shift;
- disconnect mid-shift;
- supported sale completes;
- unsupported action blocks with explanation;
- receipt prints offline;
- restart while offline;
- queued commands persist;
- reconnect/replay;
- grant expiry;
- server rejects over-budget command into reconciliation state;
- no duplicate transaction.

## 9. Web offline

- app shell may load cached where appropriate;
- transaction action clearly unavailable/draft-only;
- draft survives refresh if promised;
- reconnect requires/revalidates submission;
- UI never claims an offline draft is synced when it is not.

## 10. Receipt/QR

- business logo top;
- QR PNG shared raster pipeline;
- exact caption;
- printed QR scans;
- historic receipt unchanged after branding update;
- 5 consecutive prints;
- long receipt;
- cutter/feed;
- failed printer job retry.

## 11. Responsive

Every critical flow at:

- 1024×600;
- 1280×720;
- 1280×800;
- 1366×768;
- 1920×1080;
- 800×1280;
- 390×844.

Assert:

- primary actions visible;
- no accidental page horizontal scroll;
- dialogs scroll internally;
- sticky footer reachable;
- keyboard/touch work;
- scanner does not corrupt unrelated fields.

## 12. Security

- cross-business access blocked;
- expired token;
- revoked device;
- role change takes effect;
- manager approval one-use;
- brute-force/rate limit;
- malicious upload;
- CSV formula injection neutralized;
- secrets absent from logs;
- database not publicly reachable.

## 13. Migration

- clean business with configuration only;
- business with live history;
- quantities/control totals;
- open till;
- open folio;
- outstanding credit/AP;
- receipt numbers;
- unsupported legacy data produces blocker, not silent loss;
- repeat import does not duplicate.

## 14. Disaster recovery

- restore DB to clean VPS/environment;
- start API;
- re-enroll/bootstrap replacement Terminal;
- revoke lost Terminal;
- reconnect offline command evidence according to recovery procedure.

## 15. Performance

Load realistic dataset:

- thousands of items;
- months of orders/receipts;
- large movement history;
- room history;
- many audit rows.

Measure:

- POS search;
- Front Desk load;
- daily report;
- change-feed catch-up;
- API p95;
- DB slow queries.

## 16. Release sign-off

Release requires evidence from one exact SHA/image set.

No "tested roughly the same code last week" acceptance.

---

# Acceptance Addendum — Operator Workflows and Business Documents

## 17. Procurement document printing

On a real XP-80T prove:

- one-line PO;
- 20+ line PO;
- long supplier/item names;
- package quantities and totals;
- approval fields;
- PO reprint clearly marked;
- GRN after partial receipt;
- GRN with rejection/reason;
- supplier return note;
- cutter/feed behavior;
- USB and LAN profiles where supported.

No procurement print is accepted from browser preview alone.

## 18. Generic print queue

Prove mixed queue ordering:

```text
receipt
→ PO
→ kitchen ticket
→ count sheet
→ receipt
```

Then test:

- printer offline;
- paper out where observable by operator;
- app restart;
- `DELIVERY_UNCERTAIN`;
- retry after physical check;
- stale/cancelled job;
- reprint audit.

A failed print must not roll back the originating business transaction.

## 19. Purchase-order lifecycle

Test simple and controlled policies:

- draft;
- submit;
- approve/reject;
- issue;
- revise before receipt;
- cancel before receipt;
- cancel remaining quantity after partial receipt;
- duplicate/repeat order;
- unauthorized approval;
- response loss on approval/issue.

## 20. Supplier returns/corrections

Prove separately:

- unused duplicate receipt reversal;
- physical supplier return;
- return after partial consumption must block/adjust appropriately;
- supplier credit-note match;
- wrong price/accounting correction;
- paid invoice correction requires authorized accounting path.

## 21. Requisition/transfer

- direct small-business transfer;
- request → approve → dispatch → receive;
- partial dispatch;
- destination discrepancy;
- network loss after dispatch;
- no double stock addition/removal.

## 22. Stock count print and selected count

- blind printed sheet contains no expected quantity;
- assisted sheet does;
- selected count affects selected scope only;
- full count still requires full location;
- browser draft survives refresh in IndexedDB;
- unresolved scan blocks finalization.

## 23. Shift and finance documents

Prove:

- paid-in/out voucher;
- till-close summary;
- close-day thermal summary;
- customer credit statement;
- customer payment acknowledgment.

## 24. Hospitality documents

Prove:

- reservation confirmation;
- optional guest registration card;
- open-folio statement without checkout;
- hotel checkout receipt;
- housekeeping list;
- maintenance work order.

## 25. KOT/BOT

- service-area route;
- KDS + printer coexistence;
- printer failure does not unfire order;
- reprint marked;
- modifier/note wrapping;
- ticket ordering under burst load.

## 26. V2 salvage acceptance

Before retiring V2 branch, every V2-only business rule must be mapped to:

- ported test;
- new backend implementation;
- intentional discard rationale; or
- archived historical evidence.

---

# 16 — Phased Development Roadmap

## Phase 0 — Freeze and inventory

### Work

- freeze speculative features;
- tag current production/reference state;
- inventory current business data sources;
- identify active legacy/V2 dependencies;
- rotate any exposed credentials;
- move V2 merged `main` to the sole trunk;
- create reset branch/program board.

### Exit

One agreed source tree and written migration source-of-truth classification.

---

## Phase 1 — Monorepo and contracts

### Work

- create `apps/*` and `packages/*` boundaries;
- extract command names/schemas;
- unify permissions/roles;
- extract inventory math/time/receipt schemas;
- generate command parity CI;
- add import-boundary lint rules.

### Exit

No new feature code can invent an unregistered command or permission.

---

## Phase 2 — VPS foundation

### Work

- provision staging VPS environment;
- DNS for staging;
- Docker/Caddy/PostgreSQL;
- secrets handling;
- API skeleton;
- worker skeleton;
- health/readiness;
- logging;
- migration runner;
- automated backup proof.

### Exit

Clean database can be built from migrations and restored from backup.

---

## Phase 3 — Identity, device and command kernel

### Work

- users/staff/roles/permissions;
- sessions/refresh;
- device enrollment/revoke;
- command log;
- idempotency;
- expected-version framework;
- audit;
- change feed;
- SSE;
- bootstrap manifest.

### Exit

A test client can enroll, authenticate, commit a test command, replay it safely and rebuild a local projection from bootstrap/change feed.

---

## Phase 4 — Business setup + catalog/inventory core

### Work

- business profiles/capabilities;
- locations/service areas/storage;
- Smart Item contracts;
- stock tables/movements;
- packages/barcodes;
- sealed/open model;
- count sessions;
- transfer/waste/correction;
- recipes/batches.

### Exit

Full inventory acceptance against API passes before Web/Terminal cosmetic work continues.

---

## Phase 5 — POS, payments, tills, receipts

### Work

- orders/lines/modifiers;
- stock consumption;
- tenders;
- split payment;
- till sessions;
- refund/void/comp semantics;
- receipt documents;
- logo/QR shared raster contract;
- print-job interface for Terminal.

### Exit

Online Web and online Terminal can execute same POS commands and produce identical business state/receipt documents.

---

## Phase 6 — Procurement/AP

### Work

- suppliers;
- easy PO flow;
- package-aware lines;
- approval;
- goods receiving;
- rejected/partial/over-receipt;
- invoice matching;
- supplier payments.

### Exit

Destructive/exception matrix passes.

---

## Phase 7 — Hospitality reset

### Work

- room types/rooms/rates;
- quick check-in guest snapshot;
- internal guest bill;
- simple pay-now/pay-later;
- checkout;
- reservations;
- deposits;
- room moves/extensions;
- housekeeping;
- concurrency locks.

### Exit

Both simple walk-in and advanced hotel journeys pass.

---

## Phase 8 — Web product reset

### Work

- task-first navigation;
- role visibility;
- responsive design system;
- standardized dialogs/forms;
- Today dashboard;
- simple item/PO/room flows;
- settings reorganization;
- command recovery states;
- help/guidance.

### Exit

Tier-A workflows pass every target viewport with no critical UX audit findings.

---

## Phase 9 — Terminal online adapter

### Work

- replace old cloud RPC/snapshot path with HTTP API client;
- new SQLite projection tables/migrations;
- command outbox states;
- status recovery;
- change cursor;
- bootstrap installer/recovery;
- printer/scanner retained.

### Exit

Terminal can run fully online against new backend and all state arrives through command/change protocol.

---

## Phase 10 — Terminal offline authority

### Work

- grant issuance/signing;
- grant storage/verification;
- offline command whitelist;
- document-number allocation;
- stock/till resource model;
- offline receipts;
- reconnect replay;
- reconciliation UI.

### Exit

A physical full-shift internet-loss test passes without duplicate/lost transactions.

---

## Phase 11 — Migration tooling

### Work

- legacy SQLite reader;
- Supabase/V2 reader where needed;
- canonical export manifest;
- importer;
- control totals;
- dry run;
- repeatability;
- unsupported-data blockers.

### Exit

Representative business copies migrate with zero unexplained control differences.

---

## Phase 12 — Staging torture test

### Work

Run:

- Web + Terminal concurrently;
- network loss;
- response loss;
- API restart;
- DB restart;
- printer failure;
- Terminal kill/restart;
- browser refresh;
- conflicting room/stock operations;
- backup/restore.

### Exit

No silent loss, duplicate financial transaction or divergent truth.

---

## Phase 13 — Production cutover

### Work

- maintenance window;
- final backups;
- export/freeze;
- import/verify;
- bootstrap Terminal;
- fence legacy writers;
- enable new API;
- smoke test;
- reopen.

### Exit

First live shift reconciles successfully.

---

## Phase 14 — Cleanup after stability window

### Work

- remove Supabase direct client dependencies;
- remove old Remote Manager;
- remove SQL dispatcher chain from runtime support;
- archive old V2/legacy code;
- delete deprecated command aliases after compatibility period;
- simplify docs to new architecture only.

### Exit

There is no production code path capable of writing through the retired architecture.

---

## Phase 15 — Later expansion

Only after ServOS 1.0 is stable:

- multi-property SaaS console;
- deeper assets/accounting;
- Daraja automation;
- eTIMS;
- predictive/reorder features;
- selected Web offline grants;
- external integrations;
- second VPS/replica/high availability.

## Recommended execution discipline

At every phase:

```text
spec
→ contract
→ backend/domain tests
→ UI
→ cross-client acceptance
→ docs
→ merge
```

Do not build UI several phases ahead of the executable backend again.

---

# Roadmap Addendum — Operator Workflow and Printing Workstreams

The following work is now part of the reset rather than post-launch polish.

## Phase 0A — V2 salvage inventory

Run in parallel with repository freeze:

- tag current `main` and V2 heads;
- reconcile the 7-ahead/2-behind V2 branch;
- port bottle-state invariants/tests;
- retain selected-count and guarded correction concepts;
- reject probe/debug artifacts;
- record a disposition for every V2-only file.

Exit: no unclassified V2 business rule remains.

## Phase 4A — Business Document domain

Before procurement UI is declared final:

- BusinessDocument model;
- document numbering/revisions;
- immutable issued snapshots;
- generic layout contract;
- general `print_jobs` migration;
- receipt queue compatibility.

Exit: existing receipt printing works through the generic spooler.

## Phase 5A — Service printing

Alongside POS/receipts:

- KOT/BOT document renderer;
- printer roles/routes;
- reprint audit;
- kitchen/bar failure alerts.

## Phase 6A — Procurement workflow completion

Add to Phase 6:

- simple/controlled PO policy;
- draft/approve/issue/revise/cancel;
- 80mm PO;
- GRN;
- supplier return;
- supplier return note;
- complete procurement/accounting correction paths;
- Supplier 360/remittance.

Phase 6 does not exit while procurement can create a PO but cannot hand a usable document to the supplier.

## Phase 6B — Requisitions and counts

- direct transfer remains;
- stock requisition request/approve/dispatch/receive;
- selected count;
- blind count sheet;
- variance report;
- item/barcode label printing.

## Phase 7A — Hospitality documents

Add:

- reservation confirmation;
- guest registration card optional policy;
- open-folio statement;
- housekeeping list;
- maintenance work order.

## Phase 8A — Shift/finance documents

- paid-in/out voucher;
- till close summary;
- close-day summary;
- customer credit statement;
- explicit shift handover workflow.

## Pilot gate amendment

The first production pilot now requires at minimum:

```text
receipt print
PO print
GRN print
count sheet
cash-up summary
simple hotel walk-in
selected/full count
response-loss recovery
V2 salvage complete
```

where the relevant business modules are enabled.

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

## 1. Why this needs its own subsystem

The current native printer implementation is receipt-centric:

- `encode_receipt(...)` builds customer/business receipt copies;
- `receipt_print_jobs` is the local durable queue;
- procurement views do not call any print function;
- close-day reports, customer statements, housekeeping and maintenance do not have a common native print route.

ServOS now needs printing for operational documents beyond fiscal/transaction receipts.

Do **not** solve this by making every module invent ESC/POS commands.

Instead create one typed Business Document service and one printer spooler.

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
Terminal spooler
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

Suggested local Terminal model:

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

A PO should therefore be printable immediately from Terminal without needing Word, PDF or a full-size office printer.

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
3. `Print on Terminal` command/request when a paired Terminal is online, implemented only after device-command safety is proven.

For 1.0, direct reliable ESC/POS ownership remains Terminal-side.

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

For authorized offline Terminal documents, the offline grant must contain reserved numbering ranges so duplicates cannot occur after reconnect.

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

---

# Architecture Decision Records

---

# ADR-001 — Single Network Mutation Authority

**Status:** Accepted for reset

## Decision

`serveosapi.davemusau.co.ke` is the only production network mutation authority.

Web and Terminal do not mutate PostgreSQL directly and do not call database RPC dispatchers.

## Reason

Previous architecture allowed legacy upload and V2/direct-database semantics to coexist, producing dual-authority and parity risk.

## Consequences

- all mutations are observable and idempotent;
- one permission/error/command model;
- backend availability becomes important, mitigated by Terminal offline grants;
- old direct-client mutation code must be retired after cutover.

---

# ADR-002 — No Recurring Snapshot Synchronization

**Status:** Accepted for reset

## Decision

Terminal synchronizes using explicit commands upward and ordered change feed downward.

Whole-database snapshots are used only for bootstrap/recovery/migration, never recurring reconciliation.

## Reason

Snapshot upload makes conflict ownership ambiguous and obscures which business action produced state.

## Consequences

- every change has causal command/audit evidence;
- response loss is recoverable by command ID;
- local projection can be rebuilt;
- migration tooling must explicitly import old data once.

---

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

---

# ADR-004 — Bounded Terminal Offline Authority

**Status:** Accepted direction

## Decision

Terminal may finalize transactions offline only inside a server-issued, signed and bounded grant.

Web remains online-authoritative for ServOS 1.0.

## Reason

Businesses need local resilience, but unconstrained multi-writer offline state recreates synchronization ambiguity.

## Consequences

- Terminal remains useful during outages;
- offline feature set is deliberately scoped;
- grant issuance/reconciliation becomes a core protocol feature;
- some sensitive actions block offline.

---

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

---

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

---

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

---

# ADR-008 — One Business Document Model and One Terminal Print Spooler

## Status

Accepted for ServOS reset.

## Context

Current native printing is receipt-specific while operators also need Purchase Orders, GRNs, count sheets, cash-up reports, statements, folios, KOT/BOT tickets and work orders on the same 80mm hardware.

Allowing each module to emit printer bytes would duplicate formatting, retry and audit logic.

## Decision

All printable operational artifacts are represented as typed, versioned `BusinessDocument` snapshots and printed through one generic durable Terminal `PrintJob` queue.

Domain modules produce document data. Renderers produce bounded printer output. Transport sends the bytes.

The printer transport layer does not know procurement/accounting semantics.

## Consequences

- Current `receipt_print_jobs` is migrated/generalized rather than duplicated.
- Receipt behavior remains supported as one document family.
- Reprint/audit/uncertain-delivery semantics are common.
- PO/GRN/KOT/count/statement printing can be added without new printer transports.
- Physical printer acceptance remains mandatory per document family.

---

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
