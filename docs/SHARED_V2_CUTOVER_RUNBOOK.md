# Existing Windows 10 terminal: shared-v2 commissioning

`FINAL-SPRINT-FIXES.MD` and the owner's 3 October 2026 existing-installation decision govern this upgrade. Preserve operational data, staff credentials, receipts, enrollment, terminal ID and the Windows user's `ke.servos.business` application data. Preparation is not production migration or authority-activation approval.

## Release and rehearsal prerequisites

1. Use a clean committed x64 NSIS release built without skipped checks. Verify the installer SHA-256 and manifest version, identifier, schema 15, migration inventory/hash and signing status.
2. On the actual Windows 10 terminal, export Production Health diagnostics and inventory installed version/schema, disk space, printer queue/driver, XP-80T connection/profile, scanner and OS edition/build/servicing entitlement. Run the packaged terminal doctor. Keep servicing status pending until the actual device and entitlement are verified.
3. Stop the installed app and create its checkpoint backup with the existing backup mechanism. Verify integrity, record counts, terminal/business IDs, financial control totals and restore into an isolated copy. Keep backup and credentials outside the release bundle.
4. Isolate the rehearsal at the network boundary: it must not reach the live Supabase project, legacy upload endpoint or peripheral queues. Use a disposable project and separately paired rehearsal identity. Do not copy a live device secret into a network-enabled clone. Never repeat Intake or enrollment on the installed terminal.
5. Rehearse schema upgrade, interrupted import/resume, exact manifest/page hashes, archived identities, credit/M-Pesa indexes, financial totals, baseline installation, logout/restart, command replay, convergence and coordinated recovery. Synthetic local fixtures do not satisfy actual-data rehearsal.

## Authorized maintenance window

The existing APIs remain the commissioning interfaces. There is no automated production cutover button. Use an authenticated Admin deployment client; do not paste service-role credentials into the app or browser. Record every response in the commissioning evidence folder.

1. Stop all legacy business writes and verify all existing terminal installations are accounted for. Close/reconcile active trading and outstanding allocations. Preserve unresolved queued commands in the checkpoint; do not delete them or assume they uploaded.
2. Enter native `CUTOVER_PREP` through `runtime_set_authority_mode(token, mode, cutoverId, reason)`. Enter server preparation through `servos_v2_set_authority_mode(next_mode, reason)`. Both legacy mutation/upload and v2 transactions must now refuse writes. A failed server preparation must leave the native terminal frozen.
3. Read `runtime_v2_cutover_manifest()` and `runtime_v2_cutover_page(collection, afterId, pageSize)` from frozen SQLite. Preserve one manifest and every deterministic page. Resolve any `unsupportedCollections` before proceeding; never omit them. Credentials and device-local enrollment stay in the protected checkpoint.
4. Call `servos_v2_begin_cutover(manifest)`, retain its cutover UUID, then submit each collection/page with stable page indexes to `servos_v2_import_cutover_page`. Retry the same page unchanged after a dropped response. A changed replay, unmanifested record, credential field or conflicting source must fail atomically.
5. Run `servos_v2_verify_cutover(cutover_id)`. Require `verified=true`, complete manifest membership, matching IDs/versions/archive flags, source hash, totals and rebuilt resource/financial indexes. Review stock quantities, cash/tills, tender totals, credit balances, payables, journal balance and receipt history against the checkpoint. Read-only configuration/history must remain source-faithful; do not replay financial commands to recreate it.
6. Only after real server READY evidence, call `runtime_resolve_legacy_outbox(token, cutoverId, serverReady=true)`. The native boundary independently fetches authenticated server evidence and binds the source manifest; its rows/envelope hashes remain preserved as superseded history. The compatibility boolean is not proof.
7. Install the authorized paged server snapshot through `runtime_v2_install_snapshot()`. An interrupted snapshot must never become complete. Run `runtime_v2_verify_baseline()`: SQLite computes the content digest and the server checks business/device/policy/cursor/count/content plus zero unresolved legacy work, recording immutable `NATIVE_BASELINE_VERIFIED` evidence.
8. Commit through `servos_v2_commit_cutover(cutover_id, backup_confirmed=true)` only with verified checkpoint evidence. Activate server `SHARED_V2`; it requires COMMITTED and a current matching native baseline. Activate native `SHARED_V2` last; it independently requires authenticated COMMITTED/shared evidence and its verified local baseline. If either step fails, keep transactions frozen and repair forward.
9. Enable transactional Web only after the terminal/server gate passes. Verify matching Terminal/Web stock, payments, receipt documents, journals and audit outcomes using stable command IDs, including response loss and rejected/stale commands. Confirm logout, expired Auth, restart and failed synchronization never permit legacy fallback.

## Recovery and physical acceptance

Before shared writes, any rollback requires coordinated review of the frozen checkpoint and server import state. Aborting a server import preserves its evidence; it does not automatically reactivate the terminal.

After shared writes, independently restoring a legacy backup or reinstalling an old writer is prohibited. Freeze all writers; perform coordinated server/terminal restore and verified replay, or forward repair. Keep accepted receipts, commands, acknowledgements, feed cursors and financial/audit history consistent.

Complete `RELEASE_0.2_ACCEPTANCE.md` on the real device: customer/business XP-80T copies, exact money, logo, official physically scanned QR, feed/cutter, scanner, full shift, close day, restart and replacement-terminal restore. Paper appearance and QR scanning cannot be certified from byte-stream or browser tests.
