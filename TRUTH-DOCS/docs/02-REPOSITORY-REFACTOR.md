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
