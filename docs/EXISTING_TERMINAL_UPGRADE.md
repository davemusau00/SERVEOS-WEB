# ServOS 0.2.0 Existing-Terminal Upgrade

This runbook upgrades an already-enrolled ServOS terminal to **0.2.0 / SQLite schema 15**. It is not a fresh-install procedure.

## Safety boundary

Preserve the same Windows user, application identifier `ke.servos.business`, ServOS application-data directory, terminal ID, device token, LIVE enrollment, staff credentials, business/audit/outbox history, and scanner-count drafts.

**Do not repeat Intake or enrollment.**

The schema-15 migration is additive and forward-only. Never reopen an upgraded schema-15 database with an older ServOS binary.

## Before the live upgrade

1. Confirm the release folder contains the installer, SHA-256 sidecar, `servos-terminal-release.json`, terminal scripts, this runbook and `RELEASE_0.2_ACCEPTANCE.md`.
2. Run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run-terminal-tests.ps1 -DeploymentFolder .
   ```
3. In the currently installed ServOS open **Business administration → Production Health**.
4. Run the read-only audit, create a checkpoint backup and export the audit.
5. Record terminal ID, installation stage, SQLite schema, quick_check, record counts, pending outbox, last sync and backup evidence.
6. Close ServOS normally and allow pending local work to flush.

Do not proceed if the pre-upgrade audit is unhealthy or the checkpoint backup cannot be verified.

## Rehearsal

Before the first production upgrade, rehearse with an isolated copy of the existing application data. Prove that terminal identity, LIVE state, business records, staff, outbox and scanner drafts survive migration to schema 15.

A cloned terminal identity must not synchronize concurrently with the live terminal.

## Install

Use the same Windows user that currently operates ServOS:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\install-windows-pos.ps1 `
  -InstallerPath ".\<ServOS-0.2.0-setup.exe>"
```

Do not delete application data first. Do not change `ke.servos.business`.

## Immediate post-upgrade checks

Verify version 0.2.0, schema 15, healthy SQLite quick_check, unchanged terminal/device identity, LIVE stage, existing staff/products/inventory/rooms/assets/history, preserved outbox/guidance/scanner drafts, and no Intake screen. Export a new Production Health audit.

## Physical acceptance

Complete `RELEASE_0.2_ACCEPTANCE.md` on the actual terminal before production acceptance.

## Rollback

Before any shared-v2 writes, stop ServOS, preserve the failed-upgrade database/logs, and restore the verified pre-upgrade checkpoint only under the coordinated commissioning procedure. Reinstall the previously accepted version and verify identity, enrollment, LIVE state and record counts before permitting legacy synchronization. Do not downgrade schema 15 in place.

After shared writes begin, an old backup and legacy writer cannot be re-enabled independently. Freeze all writers and use coordinated terminal/server restore with verified replay, or forward repair. Preserve command acknowledgements, feed cursors and receipt/audit history; reconcile both authorities before resuming shared transactions.

The old binary must never be pointed at the already-upgraded schema-15 database.

## Customer credit migration checks

The schema-15 migration chain retains customer-credit financial history introduced in schema 13. After upgrade verify that existing customers, tabs, payments, M-Pesa receipts, folios, journals, receipt documents and scanner-count drafts remain intact. Preserve any existing customer-credit records. Never downgrade a schema-15 database to an older ServOS binary.
