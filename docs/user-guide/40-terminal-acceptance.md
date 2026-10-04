# Physical terminal acceptance and recovery

Section: Business Admin
Roles: Admin for final acceptance; Manager/Admin can perform most checks
Permission: system.configure, backup.create, backup.restore
Screen: Business Admin → Physical terminal acceptance

## Overview

Patch 11 is the final installed-terminal rehearsal. It does not certify a theoretical build or a browser preview. Evidence belongs to the specific native terminal, database schema and local installation.

The acceptance panel records local immutable evidence in `terminal_acceptance_evidence`. These rows are not business records, are not added to the transactional outbox, and cannot be edited or deleted.

Final acceptance requires:

- SQLite schema v11 and `PRAGMA quick_check = ok`;
- `LIVE` installation stage;
- terminal identity present;
- cloud synchronization configured;
- zero pending outbox operations;
- no open till;
- no queued or delivery-uncertain printer jobs;
- current-schema backup/restore rehearsal;
- native process restart recovery;
- offline local-database rehearsal;
- reconnect/cloud synchronization evidence;
- physical printer/scanner/drawer evidence when those devices were declared during Intake.

## Before starting

Close active service and settle/close the till. Do not perform final acceptance during live customer trading.

If hardware was declared incorrectly during Intake, correct the deployment plan rather than recording false evidence.

## Procedure

Complete the acceptance checks below on the actual installed native terminal. Work through the terminal doctor, backup/restore rehearsal, declared hardware checks, restart recovery, offline rehearsal, reconnect/cloud recovery, then Admin-only final acceptance. A check is complete only when ServOS records the corresponding immutable evidence and the current blocker list is clear.

## Terminal doctor

On the Windows terminal, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\servos-terminal-doctor.ps1
```

Optionally persist the read-only report:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\servos-terminal-doctor.ps1 -OutputPath .\terminal-doctor.json
```

The doctor does not change Windows settings. It reports OS/architecture, RAM, free system-drive space, timezone/UTC offset, print-spooler state, installed printers, active network adapters and the active power scheme.

The baseline checks are:

- 64-bit OS;
- at least 4 GB RAM;
- at least 5 GB free system-drive space;
- UTC+03:00 local offset for Nairobi/Kenya;
- Windows Print Spooler running.

A stronger production terminal can exceed these minimums.

## Backup and restore rehearsal

Choose **Run backup rehearsal**.

ServOS:

1. creates a real SQLite online backup;
2. copies that backup to a temporary rehearsal-restore file;
3. opens the rehearsal copy read-only;
4. runs `PRAGMA quick_check`;
5. compares schema version;
6. compares terminal identity;
7. compares records, commands, audit and outbox row counts;
8. opens the temporary restore as a writable ServOS database;
9. commits one temporary customer command twice with the same command ID and verifies exact idempotent replay;
10. reruns SQLite quick-check on the writable restored copy;
11. removes the temporary rehearsal copy;
12. keeps the real backup;
13. records immutable acceptance evidence only when every comparison succeeds.

The live business database is never replaced by the rehearsal copy.

## Receipt printer

Choose **Send test slip**.

Transport success alone is not physical proof. LAN TCP and the Windows spooler cannot tell ServOS whether paper actually emerged.

Inspect the printer. Only choose **Paper observed** when the ServOS XP-80T test slip physically exists.

A `DELIVERY_UNCERTAIN` transport can still pass this check if the operator can physically see the printed slip. A queued job cannot.

Final acceptance also requires zero unresolved printer jobs.

## Barcode scanner

Choose **Arm scanner test**, then scan a test barcode/tag with the configured keyboard-wedge scanner.

The normal scanner hook must identify the wedge scan. Acceptance stores only:

- keyboard-wedge capture type;
- captured character count;
- `rawValueStored = false`.

The scanned content itself is not retained.

## Cash drawer

ServOS currently has no direct native cash-drawer adapter.

If Intake declares a cash drawer, physically test the drawer and normal cashier workflow manually. The acceptance panel makes this limitation explicit and records a manual observation only after operator confirmation.

Do not interpret this evidence as ServOS-generated drawer pulse control.

## Native restart recovery

Choose **Begin restart test**.

ServOS stores the current process nonce locally.

Then:

1. close the native ServOS application completely;
2. relaunch ServOS;
3. sign in again;
4. return to Business Admin;
5. choose **Confirm restart recovery**.

Confirmation is rejected inside the original process. It requires a different startup nonce, which proves that a new native process opened the existing database. Sessions are already cleared at native startup, so sign-in is also exercised.

## Offline rehearsal

Disconnect the terminal's network connection.

Do not merely close a browser tab or turn off cloud synchronization. The native webview must report `navigator.onLine = false`.

When **Run offline probe** becomes available, use it.

ServOS then verifies SQLite quick-check, reads the current local record set and commits a local acceptance-evidence row while networking is unavailable. This verifies that local database access does not depend on cloud reachability.

Reconnect networking afterward.

## Reconnect and cloud recovery

After reconnecting, choose **Sync and verify recovery**.

The panel:

1. runs normal ServOS synchronization;
2. requires configured cloud synchronization;
3. requires a successful `last_sync` within 15 minutes;
4. requires zero unacknowledged outbox rows;
5. records `CLOUD_RESYNC` evidence.

Cloud recovery evidence must be newer than the offline rehearsal evidence.

## Final acceptance

Final acceptance is Admin-only.

The button remains disabled until all current blockers are gone.

Final evidence snapshots:

- schema version;
- terminal identity;
- SQLite quick-check result;
- required acceptance evidence list;
- zero pending outbox state.

The final evidence is point-in-time deployment acceptance. Later application/schema upgrades should run the acceptance procedure again.

## Failure rules

Do not work around a failed acceptance item by editing SQLite, deleting evidence, changing tests or marking unavailable hardware as passed.

Fix the underlying condition and rerun the relevant check.

Typical blockers include:

- cloud not configured;
- pending outbox;
- open till;
- unresolved printer job;
- restart challenge not completed;
- backup rehearsal from an older schema;
- missing physical hardware evidence.

## Power interruption and printer ambiguity

A forced operating-system power cut is not automated by ServOS because deliberately corrupting or interrupting a production machine is unsafe.

The acceptance suite instead verifies native-process restart recovery plus SQLite integrity. Existing printer startup logic already changes a job left in `SENDING` to `DELIVERY_UNCERTAIN`, requiring the operator to check paper before retrying. This avoids duplicate receipts after interruption.

For site commissioning, an installer may additionally perform a controlled UPS/power-loss rehearsal on a disposable/pre-production database image, never on the only production copy.

## Obsolete print jobs (Admin)

In native POS, open **Clear obsolete print jobs…** in Receipt jobs needing attention. Review the order/test label, state, update time and transport error. Select one job or all displayed eligible jobs (at most 50), enter a reason of 1-500 characters, acknowledge possible prior paper output, then review and confirm cancellation. More jobs may require another refreshed batch.

Only `QUEUED` and `DELIVERY_UNCERTAIN` jobs can be cancelled. A changed job invalidates the entire batch: refresh, review and confirm again. `SENDING` jobs cannot be selected. Saving disables repeat submission; refresh failures are shown and require another successful refresh.

Cancellation stops further ServOS sends. It does not retract Windows spooler work or prove an uncertain receipt never printed. Customers still needing receipts should retain their job or receive a receipt-history reprint after the current printer configuration is corrected. Retry retains the original job's printer profile; receipt-history reprint creates a new job with the current configuration.

Cancelled rows and their original receipt association, payload, profile, error and creation time remain in SQLite. One immutable local audit entry records the Admin, reason, cancellation time and reviewed job states/timestamps. Sales, payments, stock, receipt documents and cloud outbox entries are unaffected. No SQLite migration is added.

After cancellation, open or refresh **Business Admin > Physical terminal acceptance** for fresh counts. Only unresolved jobs count, including jobs beyond the 50 displayed in POS. Cancellation supplies no physical acceptance evidence and does not close the active till; complete normal close-day and printer/scanner/recovery acceptance.
