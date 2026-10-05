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

