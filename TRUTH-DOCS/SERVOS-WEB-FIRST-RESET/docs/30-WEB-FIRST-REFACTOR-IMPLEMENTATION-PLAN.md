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
