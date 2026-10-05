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
