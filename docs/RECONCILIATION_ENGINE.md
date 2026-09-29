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
