# ServOS Remaining Work — Master Execution Brief for AI Coding Agent

**Repository:** `C:\Users\Admin\Downloads\servos`  
**Product:** ServOS hospitality ERP/POS  
**Primary operating model today:** one business, one premises, one authoritative installed terminal  
**Target architecture:** one business/property, multiple trusted desktop/browser devices using PostgreSQL shared authority  
**Production safety principle:** there must never be two authoritative writers at the same time.

---

# 1. Your Mission

You are the implementation agent responsible for taking the current ServOS repository from the completed staged Catalog / Inventory / Procurement / POS foundations to a production-ready, documented, rehearsed and safely cut-over multi-device system.

Do not merely add screens. Finish the system as an operational business platform.

You must:

1. establish repository truth before changing code;
2. document the system and setup procedure before continuing feature development;
3. finish validation and source-control cleanup for the current 11C/11D work;
4. fix all known unresolved defects;
5. implement the remaining v2 transactional domains;
6. preserve the current native terminal while v2 remains staged;
7. prove every financial, inventory and room invariant with automated tests;
8. build a rehearsable migration and rollback path;
9. complete physical terminal acceptance;
10. produce operator/developer documentation detailed enough that a new competent engineer can install, test, troubleshoot and hand over ServOS without oral explanation.

Do not consider the task complete because the UI renders. The system is complete only when the domain invariants, persistence, permissions, migration, deployment, recovery, documentation and validation gates all pass.

---

# 2. Architecture You Must Preserve

## 2.1 Current production authority

The current production design is:

```text
React / Tauri UI
        ↓
typed native invoke
        ↓
Rust business/domain validation
        ↓
SQLite authoritative local transaction
        ├── business records
        ├── immutable audit
        └── ordered outbox
        ↓
authenticated ordered Supabase upload
        ↓
remote manager read replica / constrained requests
```

A successful local SQLite commit is currently the authoritative local success boundary. It is not the same thing as a cloud acknowledgement or an external payment-provider acknowledgement.

Do not weaken this behavior while v2 is staged.

## 2.2 Target v2 authority

Target:

```text
Trusted Tauri client ─┐
                      ├── versioned commands
Trusted web client ───┤
                      ↓
              PostgreSQL authority
                      ↓
           immutable / versioned records
```

Browser clients must never perform unrestricted direct table CRUD for operational transactions.

The browser must submit versioned business commands through the existing v2 command/executor path.

## 2.3 Offline target

Future offline finalization is allowed only for cryptographically signed, device-reserved resources.

Until the signed allocation/grant work is complete:

- web can cache reads;
- web can hold drafts;
- web must not invent authoritative offline sales, payments, rooms, inventory or accounting mutations.

## 2.4 Dual-writer prohibition

Never enable both of these as authoritative writers simultaneously:

```text
legacy SQLite snapshot/uploader
v2 PostgreSQL command authority
```

The cutover must explicitly freeze one before enabling the other.

This rule is non-negotiable.

---

# 3. Current Known State

Treat the local repository as the source to inspect. Do not assume GitHub remote is current.

The latest remote previously observed was still at the 11B Catalog/Inventory checkpoint. Local 11C and 11D work may not yet have been pushed.

## Verified staged work

### 11A — Web v2 production safety gate

Implemented:

- `VITE_ENABLE_WEB_V2=false` default
- browser probes `servos_v2_session` only when the frontend gate is enabled
- transactional web requires both frontend gate and server-side `servos_v2.control.enabled=true`
- staging/cutover documentation

### 11B — Catalog + Inventory

Implemented:

- products
- stock items
- stock locations
- stock count
- transfer
- waste
- immutable stock movements
- negative-stock protection
- version conflicts
- barcode/scanner support
- web Catalog/Inventory workspace
- disposable PostgreSQL acceptance

### 11C — Procurement + Room Rate contract fix

Implemented locally and validated:

- Room Rate UI strips the UI-only `price` field before `ratePlan.save`
- suppliers
- mixed `STOCK / EXPENSE / ASSET` POs
- GRNs
- weighted-average stock costing
- supplier payables
- exact invoice matching
- manually confirmed supplier settlement
- asset acquisition queue
- asset commissioning
- balanced journal effects
- web Procurement workspace
- PostgreSQL procurement acceptance

### 11D — POS / Orders / Tabs / Tables / Recipes

Current decisive validation is green:

```text
npm run lint                                  PASS
npm test                                      68 / 68 PASS
supabase/expansion/001 ... 013                PASS
tests/supabase/inventory.sql                  PASS
tests/supabase/procurement.sql                PASS
tests/supabase/pos.sql                        PASS
real two-connection room booking race         PASS
```

11D includes:

- outlets
- tables
- quick/named/table tabs
- product sale configuration
- portions
- modifiers
- recipes
- barcode/SKU sales
- price/tax/product snapshots
- pre-fire line editing
- atomic stock consumption on `order.fire`
- immutable `SALE_CONSUMPTION`
- KDS item states
- repeat round
- explicit fired-stock void disposition
- exact `RETURN_SEALED` restoration
- table `CLEANING -> AVAILABLE`
- table race/version conflict protection
- replay safety
- staged Web POS

Payments are intentionally deferred to 11E.

## Important: 11D is not yet fully accepted

Before new feature code, run the complete gate:

```powershell
cd C:\Users\Admin\Downloads\servos

git diff --check
npm run test:native
npm run test:desktop
npm run build
npm run test:browser
npm run audit:ui
npm run docs:check
git status --short
```

If anything fails, repair it before beginning 11E.

---

# 4. First Action: Establish Repository Truth

Do this before editing documentation or code.

Run:

```powershell
cd C:\Users\Admin\Downloads\servos

git status --short
git branch --show-current
git log --oneline --decorate -15
git remote -v
git fetch origin
git log --oneline --decorate origin/main -10
git diff --stat
git diff --check
```

Then classify all working-tree files into:

1. intended 11C product files;
2. intended 11D product files;
3. generated documentation/index artifacts;
4. temporary patch payloads/applicators/manifests;
5. unrelated pre-existing user work.

Never delete category 5.

Do not delete any backup directory merely because its name resembles `.servos-patch-*`. Determine whether it is tracked and whether it contains unique user work.

Temporary untracked patch payloads can be removed only after verifying that the canonical installed copy is identical.

## Source-control checkpoint

Prefer logical commits if history can still be separated safely:

```text
feat: add staged web procurement and fix room rate payload
feat: add staged shared POS orders tables and recipes
```

If the overlapping files make a truthful split impractical, create one verified checkpoint commit instead of manufacturing fake history.

Example combined message:

```text
feat: stage procurement and shared POS web domains
```

After commit:

```powershell
git status --short
git push
git status --short
```

Verify the pushed remote SHA before proceeding.

---

# 5. Documentation Must Come Before Remaining Feature Development

After repository reconciliation and the current full validation gate, create or comprehensively update the following documentation.

Do not write vague overview pages. These documents must contain exact commands, prerequisites, expected outputs, failure modes and recovery steps.

## 5.1 Required documentation set

Create/update:

```text
README.md

docs/
  ARCHITECTURE.md
  AUTHORITY_AND_SYNC_MODEL.md
  DEVELOPMENT_SETUP.md
  WINDOWS_TERMINAL_SETUP.md
  WEB_STAGING_SETUP.md
  SUPABASE_SETUP.md
  VERCEL_SETUP.md
  ENVIRONMENT_VARIABLES.md
  DATABASE_AND_MIGRATIONS.md
  TESTING_AND_VALIDATION.md
  DEPLOYMENT_RUNBOOK.md
  CUTOVER_RUNBOOK.md
  ROLLBACK_RUNBOOK.md
  BACKUP_AND_RESTORE.md
  OPERATIONS_AND_RECOVERY.md
  SECURITY_AND_PERMISSIONS.md
  HARDWARE_SETUP.md
  BARCODE_SCANNER_SETUP.md
  THERMAL_PRINTER_SETUP.md
  CASH_DRAWER_SETUP.md
  MPESA_MANUAL_RECONCILIATION.md
  ROOMS_AND_FRONT_DESK.md
  INVENTORY_AND_PROCUREMENT.md
  POS_AND_KDS.md
  FINANCE_AND_CLOSE_DAY.md
  WEB_V2_STAGING_RUNBOOK.md
  RELEASE_CHECKLIST.md
  TROUBLESHOOTING.md
```

If equivalent canonical documents already exist, improve them instead of creating duplicates.

Maintain the repository's existing docs index/help-index system and regenerate it deterministically.

## 5.2 README requirements

README must answer, in order:

1. What ServOS is.
2. What architecture is live today.
3. What v2 is and whether it is enabled.
4. Supported operating systems.
5. Developer prerequisites.
6. Exact first-time local setup.
7. Exact native/Tauri run commands.
8. Exact browser run commands.
9. Exact test commands.
10. How the disposable PostgreSQL harness works.
11. How to build the Windows installer.
12. How to configure a terminal.
13. How to configure Supabase.
14. How to configure a Vercel Preview/staging deployment.
15. What must never be done against production.
16. Links to all deeper runbooks.

The first page of the repository should make it impossible for a new engineer to confuse legacy authority with staged v2 authority.

---

# 6. Development Setup Documentation

Document a clean-machine setup for Windows PowerShell.

First inspect the real repository and `package.json`, Cargo manifests and scripts. Do not invent versions that are not enforced by the repo.

At minimum document:

## Prerequisites

- Git
- Node.js / npm
- Rust toolchain / Cargo
- Tauri Windows prerequisites
- Microsoft WebView2 Runtime
- PostgreSQL tooling required by the disposable Supabase harness
- Docker if the harness actually depends on it
- PowerShell execution policy considerations
- thermal printer driver
- keyboard-wedge barcode scanner configuration

## Clone/install flow

Example structure:

```powershell
git clone <actual repo URL>
cd servos
npm install
```

Then document any Rust dependency/setup step actually required.

## Environment setup

Document `.env.example` field by field.

Critical rule:

```text
VITE_ENABLE_WEB_V2=false
```

must remain the production default until controlled cutover.

Never place:

- Supabase service-role keys
- database admin passwords
- private signing keys
- terminal secrets

in Vite/public frontend environment variables.

## Development commands

Verify and document real commands such as:

```powershell
npm run dev
npm run lint
npm test
npm run test:native
npm run test:desktop
npm run test:browser
npm run build
npm run audit:ui
npm run docs:check
node scripts/test-supabase.mjs --expansion
```

Document what each command proves and what it does not prove.

---

# 7. Production Terminal Setup Documentation

Document installation on a clean Windows POS machine.

The guide must include:

- supported architecture;
- minimum recommended RAM/storage;
- WebView2 requirement;
- printer installation;
- default printer verification;
- 80 mm thermal paper assumptions;
- scanner keyboard-wedge setup;
- scanner suffix configuration;
- cash drawer manual behavior;
- local database location;
- backup location;
- first launch;
- intake/enrollment;
- Admin creation;
- business setup;
- outlet setup;
- stock-location setup;
- tax setup;
- receipt setup;
- Go Live prerequisites;
- backup rehearsal;
- restart recovery challenge;
- offline probe;
- cloud re-sync;
- final acceptance evidence.

Reference and integrate existing:

```text
scripts/servos-terminal-doctor.ps1
build-terminal-installer.ps1
run-terminal-tests.ps1
```

if still present.

Do not claim physical acceptance merely because automated tests pass.

---

# 8. Staging Infrastructure Setup

Before v2 cutover, create a truly separate staging topology.

Recommended topology:

```text
Vercel Preview / Staging
        +
separate non-production Supabase project
        +
test business data only
```

Never rehearse destructive v2 migration work against the live business database.

Document:

- creating staging Supabase;
- applying legacy migrations if required by test topology;
- applying expansion SQL in order;
- creating test auth users;
- registering devices;
- enabling `servos_v2.control.enabled` only in staging;
- setting `VITE_ENABLE_WEB_V2=true` only for staging;
- seeding test data;
- running end-to-end browser transactional tests;
- resetting/recreating staging safely.

---

# 9. Fix the Known Controlled Room Import UPDATE Defect

This is still open and must be repaired before final production claims.

Known behavior:

- room CSV CREATE accepts `initialStatus`;
- room UPDATE planner also carries `initialStatus`;
- the backend rejects `initialStatus` on an existing room.

Required repair:

1. locate the controlled-import planning/execution path;
2. after the current room version and CREATE-vs-UPDATE decision are known, clone the staged payload into the actual command payload;
3. for room UPDATE only, remove `initialStatus`;
4. do not mutate the original staged/import representation in a way that makes audit output misleading;
5. preserve existing housekeeping/maintenance state on update.

Required regression test:

```text
create room from CSV with:
  external_id
  room number/type
  floor
  initial_status

then re-stage same external_id with:
  changed floor
  initial_status present

planner resolves UPDATE
apply succeeds
floor changes
existing housekeeping state remains unchanged
existing maintenance state remains unchanged
initialStatus is not sent to the UPDATE command
```

Do not mark this fixed without a real automated test through the controlled-import route.

---

# 10. Patch 11E — Payments / M-Pesa / Receipts / Finance / Close Day

This is the next major implementation phase.

Before coding, inspect the existing native Rust implementations for:

```text
payment.record
payment.split
payment.refund
payment.reverse
mpesa.reconcile
mpesa.discrepancy
mpesa.discrepancy.resolve
pos.roomCharge
till.open
till.cashMovement
till.close
closeDay.generate
```

Mirror established native semantics wherever they are valid.

Do not invent a competing financial model.

## 10.1 Payment principles

A payment command must be:

- atomic;
- replay-safe;
- version checked;
- immutable after posting except via explicit reversal/refund commands;
- tied to an order/folio/source;
- journaled exactly once;
- externally referenced where appropriate;
- unable to overpay unless an explicit supported business rule permits it.

## 10.2 Supported tender behavior

Initially support the currently intended operational methods:

```text
CASH
MPESA
CARD
ROOM_CHARGE where applicable
split tender
```

Do not add Daraja/provider execution yet.

The current intended M-Pesa model is manual reconciliation via transaction code.

The UI must clearly distinguish:

```text
recorded / manually confirmed payment
```

from:

```text
payment initiated by ServOS
```

ServOS must never claim to have moved money when it only recorded an external payment.

## 10.3 M-Pesa requirements

Manual M-Pesa entry should require appropriate fields such as:

- transaction code;
- receiving account;
- amount;
- observed/received timestamp;
- confirmation flag.

Server/domain must enforce normalized unique transaction references.

Duplicate M-Pesa codes must reject atomically.

If discrepancy workflows exist natively, mirror them with explicit statuses rather than hiding mismatches.

## 10.4 Payment completion

When the final valid payment settles an order:

- outstanding reaches exactly zero;
- order transitions to `COMPLETED`;
- completion timestamp is set;
- table order releases table to `CLEANING`;
- a receipt document is produced;
- journal entries are balanced;
- stock must NOT be consumed again because firing already owns stock consumption.

Payment must never be the stock-depletion trigger in v2.

## 10.5 Split tender

Split tender must be one atomic command.

If any tender leg is invalid, none of the legs post.

Test:

```text
KES 5,000 order
KES 2,000 cash
KES 3,000 M-Pesa
```

and verify:

- two tender legs;
- one total settlement;
- one completion transition;
- no duplicate stock movement;
- balanced journal;
- response-loss replay returns the original result.

## 10.6 Refunds and reversals

Model refunds/reversals as new immutable business events.

Do not edit or delete the original payment.

Require:

- permission;
- reason;
- original payment/source;
- amount constraints;
- unique external reference if applicable;
- audit identity;
- balanced accounting effect.

Test partial refund, full refund, over-refund rejection and replay.

## 10.7 Receipts

Receipt documents must be immutable snapshots.

They should preserve, where relevant:

- business identity;
- receipt number;
- order number;
- date/time;
- cashier/server;
- item names;
- quantities;
- portion/modifier snapshots;
- price snapshot;
- net/tax/levy;
- discounts/comps if implemented;
- tender summary;
- M-Pesa/card references with safe display;
- amount received/change;
- room charge reference where applicable.

A later catalog rename or price change must not mutate an old receipt.

## 10.8 Till operations

If till operations remain part of scope, support:

- till open;
- opening float;
- cash-in;
- cash-out;
- reason;
- cash sale accumulation;
- expected cash;
- counted cash;
- variance;
- till close.

All cash movements need audit identity and immutable history.

## 10.9 Close Day

`closeDay.generate` should produce a reproducible closing snapshot.

Include:

- gross sales;
- net sales;
- tax;
- levy;
- discounts/comps;
- tender totals;
- refunds;
- room charges;
- cash expected;
- till variance;
- M-Pesa totals;
- card totals;
- voids;
- stock exceptions if available;
- open tabs/orders;
- unresolved discrepancies;
- sync/health status.

Do not close the day silently when required blocking conditions exist.

## 10.10 Required 11E web surfaces

Extend Web POS with:

- payment modal;
- split tender;
- manual M-Pesa transaction code;
- cash tender/change;
- card external reference;
- room charge;
- receipt view;
- receipt history;
- refund/reversal workflow based on permissions.

Add Finance/Close Day workspace as appropriate.

## 10.11 Required 11E tests

At minimum:

- cash sale completion;
- M-Pesa payment completion;
- duplicate transaction code;
- split tender;
- stale order version;
- response-loss replay;
- partial payment;
- editing partially paid order rejection;
- overpayment rejection;
- room-charge conservation;
- refund;
- over-refund rejection;
- reversal;
- immutable payment;
- immutable receipt;
- table release;
- journal balance;
- no second stock consumption;
- close-day totals.

---

# 11. Credential / Recovery Hardening — Patch 10B

Do not leave authentication recovery as a hand-waved operational process.

Inspect current auth implementation and complete the missing production behaviors.

Cover:

- first Admin credential creation;
- invite flow;
- password reset;
- session expiry;
- credential rotation;
- lost-device recovery;
- revoked-device handling;
- browser auth;
- account recovery boundaries;
- privileged action re-authentication where appropriate.

Never:

- put credentials in CSV imports;
- log passwords/PINs;
- expose Supabase service-role credentials to browser code;
- implement a universal recovery password;
- silently reset credentials from an unauthenticated client.

Document exact recovery procedures.

---

# 12. Patch 11F — Staff / Permissions / Admin / Reports / Devices

Build the remaining administration layer after 11E.

## Staff

Support:

- staff record;
- active/inactive;
- role;
- outlet/service-area assignment if applicable;
- permissions;
- secure invitation/credential setup;
- archive/deactivation;
- audit history.

## Permission model

Use server enforcement as authority.

UI hiding is not security.

Review all permissions currently used by native/domain code, including:

```text
pos.sell
pos.open_tab
pos.manage_table
order.fire
order.void
order.transfer
order.merge
order.discount
order.comp
payment.record
payment.split
payment.refund
payment.reverse
mpesa.record
procurement.*
inventory.*
assets.*
maintenance.*
rooms.*
folio.*
accounting.*
business.configure
staff.*
backup.restore
system.configure
```

Use the repository's actual canonical permission names.

Do not create near-duplicate permission strings.

## Manager approval

Port manager-approval semantics where operationally required.

Approval must be:

- scoped to action/target;
- attributable;
- short-lived;
- single-use;
- rejected when expired;
- rejected when used by the wrong initiator/target.

## Device administration

Implement/read:

- device ID;
- device name;
- class (`DESKTOP`, `WEB`, etc.);
- owner;
- active/revoked;
- last sequence;
- last seen;
- protocol version;
- allocation/grant state later.

Revocation must prevent future commands.

## Reports

Reports should read authoritative records and never recalculate history from mutable current catalog values.

Prioritize:

- sales;
- tender;
- tax;
- inventory movement;
- stock valuation;
- procurement;
- supplier balances;
- room occupancy;
- folio;
- assets;
- audit;
- close day.

---

# 13. Patch 12A — Desktop v2 Adapter + Migration Rehearsal

Do not change production authority yet.

Build the adapter allowing the desktop/Tauri application to participate in the v2 protocol under an explicit feature/cutover state.

## Requirements

- same command schema as web;
- same expected-version contract;
- same device sequence model;
- same replay semantics;
- clear command status handling:
  - `DRAFT`
  - `COMMITTED_LOCAL`
  - `PENDING_SYNC`
  - `SYNCHRONIZED`
  - `CONFLICT`
  - `REJECTED`
- no hidden fallback that writes both legacy and v2.

## Migration rehearsal

Create a deterministic migration/export/import procedure from the legacy SQLite authority to PostgreSQL v2.

It must:

1. require a fresh verified local backup;
2. require outbox reconciliation or explicitly documented exception;
3. freeze transactional writes for the rehearsal snapshot;
4. export canonical business data;
5. transform legacy structures to v2 structures;
6. import transactionally;
7. produce a migration manifest;
8. compare counts;
9. compare money totals;
10. compare inventory quantities;
11. compare room reservations/stays/folios;
12. compare audit identity where meaningful;
13. verify latest command/outbox state;
14. run PostgreSQL integrity queries;
15. run application smoke tests.

Produce machine-readable evidence.

Recommended artifact:

```text
migration-manifest.json
```

with:

- source terminal ID;
- source schema version;
- source backup path/hash;
- export timestamp;
- collection counts;
- destination counts;
- financial control totals;
- stock control totals;
- warnings;
- pass/fail;
- migration tool version/commit SHA.

---

# 14. Patch 12B — Controlled Production Cutover

Cutover must be a rehearsed procedure, not an improvised deploy.

## Pre-cutover requirements

All must be green:

- complete automated validation suite;
- physical terminal acceptance;
- current local backup;
- backup restore rehearsal;
- cloud sync/outbox reconciliation;
- staged web E2E tests;
- migration rehearsal;
- rollback rehearsal;
- operator sign-off;
- staging Supabase separate from production;
- no unresolved severe data-integrity issue.

## Cutover sequence

Document and automate as much as possible.

Conceptual order:

```text
1. announce maintenance window
2. stop new business transactions
3. verify terminal/outbox/sync state
4. create final local backup
5. verify restore
6. disable/freeze legacy authoritative uploader/writer path
7. export final legacy snapshot
8. migrate to PostgreSQL v2
9. validate control totals
10. register/verify trusted devices
11. enable server v2 control
12. enable production web v2 flag
13. enable desktop v2 adapter
14. perform controlled smoke transaction
15. verify stock/payment/order/audit
16. reopen operations
```

Never invert steps 6 and 11.

No dual writers.

## Rollback

Define an explicit cutoff beyond which rollback requires forward repair rather than restoring an old snapshot.

During initial cutover smoke window, rollback may mean:

- disable v2 clients;
- keep business closed;
- restore legacy mode;
- restore verified pre-cutover backup if no accepted v2 production transactions need preservation.

Once real v2 business transactions have been accepted, do not simply restore an old SQLite backup and erase them.

---

# 15. Patch 12C — Signed Offline Grants / Allocations

Only implement after online v2 is stable.

Offline finalization must use server-issued, device-bound, expiring allocations.

Examples:

- receipt-number range;
- order-number range;
- permitted outlet;
- stock reservation/allocation;
- monetary limit;
- validity period;
- device ID;
- protocol version;
- signature.

Server must reject:

```text
GRANT_EXPIRED
ALLOCATION_REQUIRED
ALLOCATION_EXHAUSTED
RESOURCE_OWNED
DEVICE_REVOKED
```

where applicable.

Do not permit generic offline mutation of arbitrary server state.

---

# 16. Outstanding Cloud Reconciliation Evidence

Earlier reconciliation work is structurally implemented, but final production cloud evidence has not been conclusively recorded.

Before final handover, prove:

- local outbox pending count;
- upload;
- remote operation count;
- remote latest sequence;
- acknowledgement;
- local pending drains to zero;
- reconnect/restart does not duplicate upload;
- remote replica matches intended local state.

Do not say cloud reconciliation is complete merely because local tests pass.

---

# 17. Physical Terminal Acceptance

Complete the real hardware acceptance workflow on the intended terminal.

Capture evidence for:

- `BACKUP_RESTORE_REHEARSAL`
- `PRINTER_PAPER_OBSERVED`
- `SCANNER_INPUT`
- `CASH_DRAWER_MANUAL`
- `RESTART_RECOVERY`
- `OFFLINE_LOCAL_PROBE`
- `CLOUD_RESYNC`
- `FINAL_ACCEPTANCE`

The final acceptance record must remain blocked if prerequisite evidence is missing.

For scanner evidence, never persist the raw scanned secret/value merely to prove a scanner works.

---

# 18. UI / UX Completion Rule

For every visible action, prove all layers exist:

```text
visible control
    ↓
event handler
    ↓
validated command
    ↓
authoritative backend transaction
    ↓
persisted result
    ↓
audit/history
    ↓
loading / success / error / conflict UX
```

No decorative dead controls.

Every CRUD surface must handle:

- create;
- edit;
- archive/deactivate where valid;
- reactivate where valid;
- empty states;
- loading;
- permission denied;
- validation error;
- stale version/conflict;
- offline state;
- retry where safe;
- immutable-history explanation where editing is forbidden.

Financial/ledger history is not CRUD. Do not add edit/delete buttons to immutable facts.

---

# 19. Error Contract

Preserve and consistently surface canonical v2 codes:

```text
AUTH_REQUIRED
PERMISSION_DENIED
DEVICE_REVOKED
GRANT_EXPIRED
VERSION_CONFLICT
ALLOCATION_REQUIRED
ALLOCATION_EXHAUSTED
RESOURCE_OWNED
VALIDATION_FAILED
DUPLICATE_REFERENCE
PROTOCOL_UNSUPPORTED
```

Do not make the UI parse arbitrary English strings when a stable code exists.

User-facing UI should translate codes into understandable messages while preserving technical diagnostics for support logs.

---

# 20. Financial and Inventory Conservation Rules

Treat these as assertions, not suggestions.

## Inventory

```text
opening
+ receipts
+ transfer in
- transfer out
- sale consumption
- waste
± count adjustments
+ valid void returns
= current quantity
```

A replay must not alter this equation twice.

## Order

An order line must preserve immutable snapshots of the data used to price and prepare that line.

Later changes to:

- product name;
- price;
- tax;
- recipe;
- portion;
- modifier;

must not rewrite the historical order line.

## Accounts

Every journal posting must balance:

```text
total debit == total credit
```

## Supplier receipt

Accepted receipt value:

```text
inventory
+ expense
+ asset clearing
= accounts payable
```

## Asset commissioning

```text
Dr Fixed Assets
Cr Asset Clearing
```

## POS sale

Do not post stock twice.

`order.fire` owns ingredient/stock consumption.

Payment owns settlement and accounting, not recipe consumption.

---

# 21. Concurrency and Replay Tests

Every new transactional domain must include both kinds of test.

## Replay

Execute the exact same command ID twice.

Expected:

- second call returns original result;
- no duplicate mutation;
- no duplicate money;
- no duplicate stock movement;
- no duplicate receipt;
- no duplicate journal.

## Conflict

Use two devices/sessions from the same version baseline.

First succeeds.

Second must return the correct conflict/resource error and leave no partial mutation.

Do this especially for:

- table seating;
- order editing;
- order payment;
- inventory receipt;
- room booking;
- folio settlement;
- asset commissioning;
- close day.

---

# 22. Complete Validation Gate

After every patch, run:

```powershell
git diff --check

npm run lint
npm test

node scripts/test-supabase.mjs --expansion

npm run test:native
npm run test:desktop

npm run build
npm run test:browser

npm run audit:ui
npm run docs:check

git status --short
```

Treat these separately:

- PowerShell may display stderr warnings as `NativeCommandError` even when the underlying process succeeds.
- `LF will be replaced by CRLF` is normally a Windows line-ending warning.
- Cargo warnings about unused assignments are warnings unless compilation/test status fails.
- Vite's >500 KB bundle notice is currently an optimization warning, not by itself a release failure.

Judge by actual exit status and test summary.

Never hide a failed acceptance test behind a later successful build.

---

# 23. Browser E2E Expansion

Current browser tests intentionally skip transactional PostgreSQL cases when the required test database environment is unavailable.

Before v2 cutover, establish a controlled CI/staging environment where browser transactional tests actually run.

Add E2E coverage for:

```text
login
v2 session
catalog
inventory
procurement
POS
payment
rooms
folios
staff/admin
device revocation
version conflict
```

The final release gate must not rely permanently on skipped core transactional tests.

---

# 24. CI / Release Automation

Inspect existing GitHub Actions before adding anything.

If CI is incomplete, create a pipeline that runs appropriate non-secret gates on pull requests.

Separate:

- fast TypeScript/source tests;
- Rust/native tests;
- production build;
- docs checks;
- UI audit;
- disposable PostgreSQL integration suite.

Do not place live Supabase credentials in CI for ordinary tests.

Use disposable infrastructure.

Build artifacts should include commit SHA and version metadata.

---

# 25. Performance / Bundle Cleanup

The production Vite bundle has crossed the ~500 KB warning threshold.

Do not block correctness work for this, but before final release:

- inspect bundle composition;
- lazy-load heavy administrative workspaces where reasonable;
- separate POS-critical path from low-frequency reporting/admin screens;
- ensure code splitting does not break offline/cache assumptions;
- test first-load performance on the actual Celeron-class target terminal.

Optimize based on measurements, not aesthetic refactoring.

---

# 26. Security Review Before Cutover

Review:

- RLS;
- public RPC exposure;
- function `SECURITY DEFINER`;
- `search_path`;
- grants/revokes;
- service-role usage;
- frontend environment;
- device ownership;
- replay semantics;
- audit immutability;
- payment reference uniqueness;
- auth recovery;
- permission enforcement.

Use server-side enforcement for every privileged operation.

The browser cannot be trusted to enforce permission rules by hiding controls.

---

# 27. Documentation Quality Gate

Documentation is a release artifact.

`npm run docs:check` must remain green.

Every setup instruction must be tested on a clean or simulated-clean environment where practical.

Every command shown in docs must exist.

Every relative document link must resolve.

Every screenshot or environment-specific instruction must be labeled if it can become stale.

Do not put secrets in documentation examples.

---

# 28. Definition of Done

ServOS is not finished until all of the following are true.

## Repository

- working tree clean;
- intended changes committed;
- remote synchronized;
- release commit/tag identified.

## Documentation

- developer setup complete;
- terminal setup complete;
- Supabase setup complete;
- Vercel staging setup complete;
- hardware guides complete;
- backup/restore complete;
- cutover complete;
- rollback complete;
- troubleshooting complete;
- help index valid.

## Native production

- all native tests pass;
- full physical terminal acceptance complete;
- backup restore proven;
- printer proven;
- scanner proven;
- restart proven;
- offline local operation proven;
- cloud re-sync proven.

## Web v2

- Catalog complete;
- Inventory complete;
- Procurement complete;
- POS complete;
- Payments complete;
- Finance/Close Day complete;
- Staff/Permissions/Admin complete;
- Rooms/Folios operational;
- device administration complete;
- server permissions enforced;
- transactional E2E tests run rather than remain skipped.

## Migration

- staging rehearsal complete;
- migration manifest produced;
- financial/stock/rooms control totals match;
- rollback rehearsed;
- no dual writers.

## Production cutover

- final backup;
- final sync;
- migration;
- verification;
- controlled enablement;
- smoke transaction;
- post-cutover monitoring;
- operator sign-off.

---

# 29. Required Agent Working Style

Work in small, verifiable patches.

For every phase:

1. inspect current code;
2. state the exact invariant being implemented;
3. implement the smallest coherent patch;
4. add regression/integration tests;
5. run focused tests;
6. run complete gate;
7. update docs;
8. show `git status`;
9. commit only intended files;
10. report exactly what is proven and what is still unproven.

Do not say:

```text
done
production ready
fully synchronized
accepted
```

unless the corresponding evidence has actually been produced.

Do not run staged expansion SQL against live Supabase unless the explicit controlled cutover phase has been reached and every cutover prerequisite is satisfied.

---

# 30. Immediate Execution Order

Start now in this exact order.

## Step A — Repository checkpoint

```powershell
cd C:\Users\Admin\Downloads\servos
git status --short
git log --oneline --decorate -15
git fetch origin
git log --oneline --decorate origin/main -10
git diff --stat
```

Identify whether 11C/11D are uncommitted/unpushed.

## Step B — Finish 11D full gate

```powershell
git diff --check
npm run test:native
npm run test:desktop
npm run build
npm run test:browser
npm run audit:ui
npm run docs:check
git status --short
```

Repair any failure.

## Step C — Commit/push current checkpoint

Commit the verified 11C/11D state truthfully.

Verify remote.

## Step D — Documentation-first pass

Create/update the documentation set described above.

Run:

```powershell
npm run docs:check
```

Commit:

```text
docs: document ServOS setup architecture operations and v2 rollout
```

## Step E — Fix room import UPDATE regression

Implement and test the known `initialStatus` UPDATE bug.

Run full gate.

## Step F — Build 11E

Payments / manual M-Pesa / receipts / refunds / finance / Close Day.

Run full gate.

## Step G — Finish 10B + 11F

Credential recovery, staff, permissions, manager approval, reports, devices.

Run full gate.

## Step H — Build 12A

Desktop v2 adapter + migration rehearsal.

Do not enable production.

## Step I — Stage and rehearse

Separate Supabase + Vercel Preview, transactional browser E2E, migration and rollback rehearsal.

## Step J — Complete physical acceptance and cloud reconciliation

Capture real evidence.

## Step K — 12B cutover

Only after all prerequisites pass.

## Step L — 12C signed offline grants

Only after online shared authority is stable.

---

# 31. Progress Report Format

After each work block, report:

```text
PHASE:
FILES CHANGED:
INVARIANT IMPLEMENTED:
TESTS ADDED:
FOCUSED TEST RESULT:
FULL GATE RESULT:
GIT STATUS:
COMMIT SHA:
REMOTE SHA:
PRODUCTION CHANGES:
KNOWN REMAINING RISKS:
NEXT STEP:
```

For `PRODUCTION CHANGES`, explicitly say one of:

```text
none
staging only
production configuration changed
production database changed
```

Never leave that ambiguous.

---

# Final Instruction

Preserve ServOS's strongest property: business truth must be explicit, versioned, auditable and conserved.

A hospitality system is allowed to be fast and pleasant. It is not allowed to invent stock, duplicate money, rewrite yesterday's receipt, double-book a room, silently steal table ownership from another device, or call a recorded external payment a payment it actually initiated.

Build the remaining system around that principle.
