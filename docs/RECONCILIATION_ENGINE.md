<!-- SERVOS_PATCH_02A_RECONCILIATION -->
# Patch 02A — Reconciliation Engine

Status: development-safe foundation. Production comparison remains pending until the deployed terminal is available.

## Purpose

Patch 02A compares the current authoritative SQLite state with the legacy Supabase replica without changing either side.

The classification contract is:

- `MATCHED`: version, archive state and JSON record data are equal.
- `LOCAL_AHEAD`: the local SQLite record has a greater version.
- `CLOUD_MISSING`: a local record has no cloud replica.
- `CLOUD_AHEAD`: the cloud version is greater, or a cloud record has no local counterpart.
- `DIVERGED`: both sides claim the same version but the archive state or JSON record data differs.

The report also emits exact control totals for record counts by collection and active/archive state, current stock quantity by item/location, movement-derived quantity by item/location, and selected financial fields (orders, purchase orders, receipts, payments, refunds, M-Pesa receipts, customer-credit entries, folio balances and deposits). Each side independently checks that current inventory quantities equal its immutable movement-derived quantities. Quantities are represented as millionths of a base unit and financial values in minor currency units. A control-total mismatch or inventory conservation failure is a cutover blocker alongside any record-level difference. These controls summarize the current legacy replica; they do not prove a v2 import or external accounting reconciliation.

`CLOUD_AHEAD` and `DIVERGED` are abnormal under the legacy single-authoritative-terminal architecture and must be investigated before v2 cutover.

## Safety properties

- The local comparison uses an authenticated `audit.view` session with no generic write command.
- Supabase exposes a device-authenticated, read-only, paginated manifest RPC.
- The RPC never updates `business_records`, `servos_private.terminal`, `servos_private.operations`, or remote requests.
- Cloud payload data is compared inside the native process. The returned UI report contains only identity, version, archive state, classification and reason.
- Device secret and cloud key are never returned by the reconciliation report.
- The comparison is bounded to 100,000 records and 200 pages as a defensive safety limit.
- A non-advancing cloud cursor is rejected.
- No automatic repair exists in this patch.

## Cutover gate

`cutoverReady` is true only when:

1. SQLite `quick_check` is `ok`.
2. There are no pending local outbox operations.
3. Every local/cloud record is `MATCHED`.
4. The cloud terminal sequence equals the local outbox sequence.

This is evidence only. Patch 02A does not perform v2 cutover.

## Native v2 feed-replica groundwork

SQLite schema 14 adds `native_v2_state`, `native_v2_outbox`, and `native_v2_records` as separate storage from the legacy records/outbox. Authenticated identity initializes device sequence/feed state once; later refreshes cannot advance the cursor past unapplied records. The native baseline install/refresh and paginated feed applier validate snapshot policy/cursor and ordered feed continuity, then atomically store data in `native_v2_records`; they do not update the operational legacy replica. Snapshot refresh refuses to proceed with pending v2 commands. This is not cutover reconciliation acceptance and must not be used to enable v2.

## Development verification

Run:

```powershell
npm run lint
npm test
npm run test:native
npm run test:desktop
npm run build
npm run test:browser
npm run test:cloud
npm run audit:ui
npm run docs:check
```

The disposable PostgreSQL test validates terminal authentication and proves the reconciliation RPC does not mutate `business_records`.

## Production follow-up

When the deployed terminal becomes available:

1. create a Patch 01 checkpoint backup;
2. run the local health audit;
3. sync normally;
4. apply the tested reconciliation migration to the correct Supabase project;
5. run Local ↔ Cloud Reconciliation;
6. preserve the report as migration evidence;
7. investigate every non-`MATCHED` record before any v2 writer is enabled.
