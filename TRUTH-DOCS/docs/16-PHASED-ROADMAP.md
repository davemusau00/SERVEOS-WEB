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

