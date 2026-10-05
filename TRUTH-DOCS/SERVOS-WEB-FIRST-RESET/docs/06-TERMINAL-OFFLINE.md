# 06 — Web/PWA Offline Terminal Model

> **Revision:** The former Tauri/SQLite Terminal model is superseded by the web-first PWA architecture. This filename is retained so existing documentation links do not break.

## 1. Principle

The installed browser/PWA must survive connectivity failure without becoming a second authoritative server.

IndexedDB replaces SQLite as the browser-side operational projection and durable outbox.

## 2. Local layers

### Projection

Server-confirmed entities required for the device's assigned role/scope.

### Pending overlay

Local effects of unconfirmed commands are explicitly marked pending and cannot masquerade as confirmed server versions.

### Durable outbox

Commands persisted before transmission.

### Offline grant

Signed/verified authority defining what the device may finalize while disconnected.

### Print/document cache

Immutable document snapshots and local print jobs.

## 3. Command table

Suggested record:

```text
id
commandType
payload
expectedVersions
status
clientSequence
createdAt
sentAt?
confirmedAt?
serverCursor?
lastErrorCode?
offlineGrantId?
payloadHash
```

## 4. Statuses

```text
PENDING
SENDING
OUTCOME_UNKNOWN
CONFIRMED
REJECTED
CONFLICT
SUPERSEDED
```

## 5. Reconnect algorithm

```text
verify session/device
  ↓
verify protocol + offline grant
  ↓
resolve OUTCOME_UNKNOWN
  ↓
send PENDING in sequence
  ↓
apply confirmed command results
  ↓
pull change feed after cursor
  ↓
apply projection changes transactionally
  ↓
surface conflicts requiring review
  ↓
renew grant
```

## 6. Offline scope

Start small and safe. POS cash/manual-evidence payments, local KOT/receipts and selected simple stay/count workflows are suitable first targets. High-risk finance, permission changes and global configuration remain online initially.

## 7. Browser shutdown/restart

Closing the PWA must not lose pending commands. On next launch:

- open IndexedDB;
- verify schema/migrations;
- restore device state;
- show pending/unknown status;
- resume sync when network exists.

## 8. Storage eviction protection

Request persistent storage. Warn administrators if unavailable. Provide local recovery export and block destructive device reset while unresolved commands exist unless an admin exports/acknowledges the risk.

## 9. Receipt/document numbering

Use server-issued number blocks or device-prefixed sequences for offline issuance so two devices cannot generate the same human document number.

Command UUID remains the true idempotency identity.

## 10. Room authority

Initially one reception device can hold offline room authority for a defined scope. Do not let several disconnected devices independently sell the same room.

## 11. Recovery

A fresh device bootstraps from server. A recovery bundle is used only to rescue unresolved local commands/documents, never to overwrite server state wholesale.

See `27-BROWSER-OFFLINE-SYNC-BACKUP.md` for the full design.
