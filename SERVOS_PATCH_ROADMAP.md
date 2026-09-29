# ServOS production completion patch roadmap

Baseline repository: `davemusau00/servos-`
Baseline HEAD reviewed: `dbefee308edb6beca307a7553d8f6656a5460e83`

## Safety rule

The existing deployed terminal is treated as an already-live business system. Its SQLite database, installation identity, audit log, commands, outbox, receipts, staff identities and business records must be preserved. No patch may reset Intake, re-enroll the terminal, create a replacement business shell, rewrite financial history, or silently prefer cloud data over local data.

## Patch 01 - Production Data Preservation & Health Audit

Goal: establish a read-only local source-of-truth report before any migration.

Changes:
- native read-only `runtime_health_audit` command;
- SQLite quick integrity check;
- local installation/schema/terminal summary;
- active/archived collection counts;
- record version manifest for future cloud comparison;
- audit, command and outbox sequence summary;
- cloud configured / last sync / last backup indicators without exposing secrets;
- open-till warning;
- Business Admin production-data health panel;
- explicit checkpoint-backup action using the existing safe SQLite backup path;
- native test proving the health audit does not mutate business records and does not leak stored cloud/device secrets.

Acceptance:
- existing trading commands behave unchanged;
- health audit works while LIVE;
- audit contains no `cloud_key` or `device_token` values;
- running audit does not change records, audit, commands or outbox;
- native tests pass.

## Patch 02 - Local vs Supabase Reconciliation & Migration Checkpoints

Goal: prove what exists on the deployed terminal versus the current Supabase replica.

Changes:
- server-side read-only reconciliation RPC returning collection/id/version/archived manifest and sequence state;
- local comparison engine: MATCHED, LOCAL_AHEAD, CLOUD_MISSING, CLOUD_AHEAD, DIVERGED;
- financial/stock control totals for additional confidence;
- migration checkpoint record containing local backup path/hash, local sequence, cloud sequence, counts and reconciliation result;
- hard block on v2 migration when unexplained CLOUD_AHEAD/DIVERGED state exists.

Acceptance:
- no business mutation during comparison;
- known unsynchronized local changes report LOCAL_AHEAD;
- identical stores report MATCHED;
- deliberately altered rehearsal cloud record reports DIVERGED;
- checkpoint is reproducible and auditable.

## Patch 03 - Business Import Center Foundation

Goal: turn the existing catalog CSV support into a safe business-wide import system.

Changes:
- import batches, row staging and external ID mapping;
- upload -> parse -> normalize -> validate -> match -> diff -> dry run -> confirm -> apply pipeline;
- permissions `imports.view`, `imports.execute`, `imports.override`;
- resumable batches and immutable import evidence;
- archive/reactivate aware matching;
- no direct financial/stock balance writes.

## Patch 04 - CSV Intake & LIVE-safe Master Imports

Goal: support business setup from CSV and controlled import into an already-LIVE business.

CSV families:
- business identity;
- outlets/service areas;
- stock locations;
- suppliers;
- customers;
- employees;
- products/catalog;
- inventory quantities through business commands;
- room types, rooms and rate plans;
- hotel services;
- asset categories and assets.

New-install rule: CSV may populate Intake/Setup but never passwords, PINs, tokens or secrets.

LIVE rule: master records may be created/updated prospectively; stock quantities use audited inventory commands; money/history cannot be rewritten by CSV.

## Patch 05 - Native Rooms Domain Core

Goal: bring the currently staged PostgreSQL Rooms invariants into the installed Rust/SQLite runtime.

Includes:
- room types, rooms, rate plans;
- reservation lifecycle;
- turnaround-aware overlap checks;
- room blocks;
- housekeeping state machine;
- stay check-in/move/extend/check-out;
- room, stay and reservation optimistic versions;
- native permissions and tests matching PostgreSQL behavior.

## Patch 06 - Front Desk, Tape Chart & Housekeeping UI

Goal: replace preview/sample hotel behavior with operational native UI.

Includes:
- tape chart;
- arrivals/departures;
- create/edit/cancel/no-show reservation flows;
- safe check-in and in-house room move;
- extension and checkout affordances remain gated until Patch 07 folio/payment conservation is active;
- DIRTY -> CLEANING -> INSPECTION -> CLEAN workflow;
- maintenance/out-of-order room blocks;
- empty/loading/error/conflict states.

## Patch 07 - Folios, POS Room Charge & Hotel Receipts

Goal: complete the money side of Rooms.

Includes:
- folio open and immutable entries;
- accommodation catch-up without double billing;
- service charges;
- deposits and deposit application;
- manual settlement;
- payment refund/deposit refund;
- credit transfer;
- POS -> folio receivable transfer without duplicate revenue;
- immutable hotel receipt documents;
- checkout conservation tests.

## Patch 08 - Native Assets & Maintenance Domain

Goal: bring staged Assets invariants into Rust/SQLite.

Includes:
- asset categories and unique permanent tags;
- save/archive/reactivate;
- assign/return/transfer/inspect/lose/retire/dispose;
- immutable asset events;
- maintenance REPORTED -> ASSIGNED -> IN_PROGRESS -> COMPLETED/CANCELLED;
- stock parts + journal + supplier payable atomicity;
- room/asset maintenance linkage.

## Patch 09 - Asset Register UI + Procurement-to-Asset Commissioning

Goal: make Assets operational and prevent double recognition.

Includes:
- searchable Asset Register;
- scan-to-open asset tag flow;
- custody/location history;
- inspection/warranty/condition views;
- procurement line classification STOCK / EXPENSE / ASSET;
- accepted asset procurement creates commissioning shells, not inventory stock;
- multi-quantity acquisition requires unique asset tags/serials.

Implementation note: Patch 09 uses Asset Clearing for accepted ASSET lines and only creates the permanent asset during explicit commissioning. The legacy stock-only PO path remains backward compatible and is stored as STOCK treatment.

## Patch 10 - Physical Terminal Acceptance & Recovery Hardening

Goal: finish ServOS 0.1 deployment evidence on the real terminal.

Includes:
- packaged XP-80T customer/business pair, cut, retry, restart and reprint acceptance;
- physical scanner POS/count/GRN tests;
- complete shift rehearsal;
- internet outage/restart/reconnect test;
- duplicate command replay;
- replacement-terminal restore and old-terminal fencing;
- encrypted/rotated backup policy implementation.

Implementation note: Patch 10A implements the local physical-acceptance harness, restored-copy command replay, hardware evidence, restart/offline/cloud recovery checks and final terminal certification. Patch 10B remains the terminal-only disaster-recovery authority exercise: encrypted backup-key management, replacement-terminal enrollment, cloud credential rotation and old-terminal fencing. Those operations must be rehearsed against the actual enrolled deployment, not simulated by a source patch.

## Patch 11 - Shared v2 Runtime Adapters & Cutover Tooling

Goal: let desktop and web use the same command model without enabling two authorities at once.

Includes:
- `BusinessRuntime` abstraction;
- legacy native, v2 desktop and v2 web adapters;
- shared conformance fixtures between SQLite and PostgreSQL;
- migration import/reconciliation tooling;
- explicit legacy-writer fencing;
- cutover checklist enforced in code.

## Patch 12 - Device Grants, Multi-device Acceptance & Vercel Activation

Goal: safely activate distributed ServOS.

Includes:
- registered devices/operators;
- signed offline grants;
- stock/room/order/folio/credit/ticket/asset reservations;
- handover, expiry, quarantine and replacement recovery;
- real two-device failure testing;
- Vercel production auth/storage/security acceptance;
- final legacy uploader shutdown and v2 activation.

## Deployment milestones

### ServOS 0.1
Single-business installed-terminal authority, fully accepted hardware, offline local trading, remote read/requests, verified recovery.

### ServOS 0.2 / v2
Single-business distributed operations, cloud transaction authority, registered desktop/browser devices and bounded offline finalization.
