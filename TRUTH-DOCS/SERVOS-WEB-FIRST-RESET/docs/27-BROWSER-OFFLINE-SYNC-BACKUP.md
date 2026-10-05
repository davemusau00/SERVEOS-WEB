# 27 — Browser Offline Sync, Recovery and Backup Specification

## 1. Objective

Make an installed ServOS PWA dependable during internet failure without creating a second competing business database.

The model is command synchronization, not database synchronization.

## 2. Local command lifecycle

Canonical states:

```text
DRAFT
PENDING
SENDING
OUTCOME_UNKNOWN
CONFIRMED
REJECTED
CONFLICT
SUPERSEDED
```

Critical rule: persist command identity locally before network transmission.

Online path:

```text
operator confirms action
    ↓
generate command UUID
    ↓
write command to IndexedDB
    ↓
optionally update optimistic/local projection
    ↓
send same command UUID
    ↓
API commits atomically
    ↓
API returns result + change cursor
    ↓
apply projection changes
    ↓
mark CONFIRMED
```

## 3. Response loss

If a request may have reached the server but the response is lost:

```text
SENDING → OUTCOME_UNKNOWN
```

Never generate another payment/sale command as a retry.

Resolve with:

`GET /v1/commands/{commandId}`

Possible outcomes:

- confirmed;
- rejected;
- still processing;
- genuinely unknown/not received.

Only a genuinely absent command may be replayed using the **same ID**.

## 4. Change feed

Every authoritative commit increments a business-scoped cursor.

Example:

```json
{
  "cursor": 918441,
  "changes": [
    {
      "entityType": "order",
      "entityId": "...",
      "version": 12,
      "projection": {}
    }
  ]
}
```

Browser stores the highest fully applied cursor transactionally with projection updates.

Reconnect:

```text
resolve OUTCOME_UNKNOWN
    ↓
send PENDING in client sequence
    ↓
apply command responses
    ↓
GET changes after local cursor
    ↓
apply ordered changes
    ↓
renew offline grant
```

## 5. Offline grants

Offline capability is explicit authority issued before disconnection.

Grant fields can include:

```text
grantId
businessId
deviceId
outletId
issuedAt
expiresAt
policyVersion
allowedCommands
maximumDiscount
maximumRefund
assignedTillId
receiptNumberBlock
roomLeaseScope
stockAuthorityScope
signature/keyVersion
```

The first release should prefer **one offline-authorized terminal per business/outlet operational scope** rather than free-form disconnected multi-device writes.

## 6. Phase-one offline commands

Recommended:

- POS order create/update;
- ordinary item sale;
- cash payment;
- manual M-Pesa/card evidence where business policy permits;
- tab/table updates within device authority;
- KOT/BOT document creation;
- receipt/document printing;
- POS-caused inventory consumption;
- simple walk-in stay where room lease permits;
- simple checkout where local stay is in scope;
- stock count draft and reviewed submission;
- local print queue operations.

Initially online-only or tightly restricted:

- staff/role/security changes;
- supplier payment;
- high-value refund;
- major balance correction;
- destructive reversal;
- global price imports;
- business settings;
- multi-device room move outside lease;
- credit limit overrides;
- migration/import apply.

## 7. Conflict philosophy

A conflict is a business event requiring a decision, not an invitation to overwrite the server.

UI example:

```text
This order changed on another device.

Server total: KES 4,200
This device:  KES 4,700

[ Review Changes ]
```

Never expose raw HTTP 409 payloads to ordinary operators.

## 8. Local projection structure

Suggested stores:

```text
meta
business
outlets
staff_projection
catalog
stock_projection
rooms_projection
orders_projection
folios_projection
tills_projection
local_commands
command_results
change_cursor
offline_grants
print_documents
print_jobs
backup_metadata
```

Pending local overlays must be distinguishable from server-confirmed versions.

## 9. Browser cache invalidation

Business data is not kept in Service Worker HTTP response caches as the authoritative local store.

Service Worker:

- static app shell;
- versioned JS/CSS/assets;
- selected immutable help content.

IndexedDB:

- business state;
- commands;
- operational documents;
- offline state.

## 10. Local backup bundle

Export format:

`*.serveosbackup`

Suggested contents:

```text
manifest.json
projection.json or structured export
commands.json
command-results.json
print-documents/
branding/
settings.json
checksums.json
```

The bundle should contain **no reusable authentication password/token**.

Where appropriate encrypt it with an administrator-provided recovery secret or a business recovery key managed independently of the browser session.

## 11. Backup levels

### Server backup

Authoritative PostgreSQL backups run automatically on the VPS.

### Offsite backup

At least one encrypted backup copy must leave the VPS failure domain. Hosting the application, API and database on one VPS is acceptable for the initial product; storing the only backups on the same VPS is not.

Use an external S3-compatible object store, second server or equivalent remote target.

### Terminal recovery backup

Manager can export a local recovery bundle containing unresolved offline evidence and cached projections.

### Optional automatic folder backup

On supported Chromium environments, the File System Access API may be used after explicit operator permission to save rotating local backups to a chosen folder/USB location.

This is an enhancement, not the only recovery mechanism.

## 12. Backup retention

Suggested initial policy:

- PostgreSQL daily full/logical checkpoint: 14 daily;
- weekly: 8 weekly;
- monthly: 6 monthly;
- WAL/incremental/PITR window where configured: at least 7 days;
- browser recovery exports: retain latest 7 or business policy;
- immutable receipt/business documents retained according to financial/legal policy.

Validate against actual storage costs before finalizing production retention.

## 13. Restore tests

A backup that has never been restored is only a theory.

Automate/record:

- database restore into isolated container;
- migration/version verification;
- row/domain sanity checks;
- command/audit counts;
- receipt/document snapshot availability;
- restore timestamp and duration.

Run a full restore rehearsal before production launch and on a recurring schedule.

## 14. Device replacement

New device:

```text
open/install PWA
    ↓
enroll new device
    ↓
authenticate administrator
    ↓
download bootstrap manifest/pages
    ↓
rebuild IndexedDB projection
    ↓
configure printer/scanner
    ↓
resume
```

If old device has unresolved commands, import its recovery bundle and resolve command IDs against the server before allowing replay.

## 15. Browser data loss

Cleared site data must never erase server-authoritative business history.

It can erase unresolved offline evidence if the operator did not back it up. Therefore:

- make persistence status visible to admins;
- warn when unresolved commands exist before logout/device reset;
- block destructive local reset unless pending commands are resolved/exported;
- encourage automated local backup on dedicated terminals.

## 16. Sync observability

Admin diagnostics should show:

```text
Device
Last server cursor
Last successful sync
Pending command count
Oldest pending age
Unknown outcome count
Conflict count
Offline grant expiry
Local storage use
Last recovery backup
```

Ordinary operator UI should show only concise operational state.
