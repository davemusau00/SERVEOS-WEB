# 05 — API, Command and Synchronization Protocol

## 1. Purpose

This protocol is the replacement for legacy snapshot upload, direct Supabase RPC coupling and divergent Native/Web mutation semantics.

## 2. Command envelope

Every mutation is submitted using one envelope.

Example:

```json
{
  "id": "8cbd4d5a-...",
  "type": "inventory.receive",
  "protocolVersion": 1,
  "businessId": "...",
  "deviceId": "...",
  "clientSequence": 1044,
  "createdAt": "2026-10-05T20:15:00Z",
  "expectedVersions": {
    "purchaseOrder:...": 8,
    "stockItem:...": 21
  },
  "payload": {},
  "approvalId": null,
  "offlineGrantId": null
}
```

Actor identity comes from the authenticated session, not trusted payload data.

## 3. POST `/v1/commands`

Possible HTTP-level outcomes:

### 200/201 — known command result

```json
{
  "commandId": "...",
  "status": "CONFIRMED",
  "cursor": 18811,
  "result": {},
  "changes": []
}
```

### 409 — domain/version conflict

Command becomes `CONFLICT`/`REJECTED` with stable evidence.

### 401/403 — authentication/permission issue

Command not committed.

### timeout/network loss

Client sets local state `OUTCOME_UNKNOWN` and queries command status later.

## 4. Command status

`GET /v1/commands/:id`

Returns one of:

```text
RECEIVED
PROCESSING
CONFIRMED
REJECTED
CONFLICT
```

If the API truly has no record:

```text
NOT_FOUND
```

The client may resend the **same command ID** if it cannot establish whether the first request reached the server. It never manufactures a new ID for the same user action.

## 5. Idempotency

`commands.id` is unique.

When an existing ID is received:

- same canonical request hash → return stored result;
- materially different request body → reject as `IDEMPOTENCY_MISMATCH`.

This protects against:

- double-clicks;
- proxy retries;
- connection resets;
- PWA reconnect/replay;
- application restart.

## 6. Expected versions

A command includes versions for the resources it actually depends on, not the entire business snapshot.

Example `stay.checkIn` might depend on:

```text
room:room-6 = 12
reservation:abc = 3
ratePlan:standard = 5
```

Do not send versions for hundreds of unrelated records.

## 7. Change feed

Endpoint:

`GET /v1/sync/changes?after=18811&limit=500`

Response:

```json
{
  "protocolVersion": 1,
  "fromCursor": 18811,
  "toCursor": 19002,
  "hasMore": false,
  "changes": [
    {
      "cursor": 18812,
      "commandId": "...",
      "entityType": "stockBalance",
      "entityId": "...",
      "version": 22,
      "action": "UPSERT",
      "projection": {}
    }
  ]
}
```

Deletion/archive uses an explicit action/tombstone.

## 8. Cursor rules

- Cursor is server-generated and monotonic within the deployment.
- Client applies changes in cursor order.
- Cursor advances only after local application succeeds.
- Client stores its last durable cursor.
- Missing/gapped batches are fetched again.
- A client may safely request an already applied range; entity versions prevent regression.

## 9. Server-Sent Events

Endpoint:

`GET /v1/sync/stream`

Example event:

```text
event: changes-available
data: {"latestCursor":19002}
```

Client then calls the ordinary change-feed endpoint.

This keeps SSE disposable and correctness in the pull protocol.

## 10. Bootstrap

For a new/recovered PWA device:

```text
POST /v1/devices/:id/bootstrap
```

or an equivalent authenticated flow returns a manifest and paginated datasets.

Manifest includes:

```text
businessId
protocolVersion
schemaVersion
snapshotCursor
collection/entity counts
content hash
createdAt
```

Client:

1. downloads into temporary IndexedDB staging stores;
2. verifies page hashes/counts;
3. verifies manifest hash;
4. installs atomically;
5. records `snapshotCursor`;
6. starts pulling newer changes.

Never partially replace the live local projection.

## 11. PWA push/pull loop

Online cycle:

```text
1. verify session/device
2. send oldest PENDING command
3. resolve UNKNOWN commands by ID
4. pull change feed from stored cursor
5. apply changes transactionally
6. persist cursor
7. repeat until caught up
```

Do not upload local tables as reconciliation.

## 12. Online PWA behavior

Web sends commands directly and refreshes/invalidate query caches from returned changes/SSE.

If offline:

- save explicitly labeled drafts where useful;
- do not claim they will automatically become transactions;
- on reconnect, revalidate and ask the operator to submit where the action is sensitive.

## 13. Offline PWA device commands

Offline commands use the same command schema with:

```text
offlineGrantId
clientSequence
localCommittedAt
```

The PWA device locally applies only command types allowed by the grant.

On reconnect, they are replayed exactly once and the server verifies grant scope/limits.

See `06-TERMINAL-OFFLINE.md`.

## 14. Conflict classes

### Version conflict

A referenced entity version changed.

### Resource conflict

Example: room already occupied by another confirmed stay.

### Policy conflict

Policy changed while client was offline.

### Offline grant conflict

Grant expired/limit consumed/identity mismatch.

### Duplicate external reference

Supplier invoice, M-Pesa reference or other constrained reference already exists.

Each class has a deterministic UI recovery.

## 15. Command lifecycle in clients

```text
DRAFT
  ↓ submit
PENDING
  ↓ request sent
SENT
  ├── response confirmed → CONFIRMED
  ├── rejected → REJECTED
  ├── conflict → CONFLICT
  └── response lost → OUTCOME_UNKNOWN
                          ↓ lookup same ID
                       confirmed/rejected/conflict
```

Do not clear form state until `CONFIRMED` unless the workflow intentionally transitions into a recovery view.

## 16. Command recovery UI

Every command-driven dialog can render a shared state:

```text
We don't yet know whether this change reached ServOS.

[ Check status ]   [ Open Activity ]

Do not submit this action again.
```

The same component applies to:

- payment;
- room check-in;
- PO receive;
- stock count;
- refund;
- maintenance;
- settings save.

## 17. External integrations

External actions such as Daraja or email must not break local transaction idempotency.

Pattern:

```text
commit internal intent/state
   ↓
enqueue integration job with unique key
   ↓
worker calls provider
   ↓
store provider result
   ↓
command/change update
```

If a provider API supports its own idempotency key, use the ServOS operation/integration ID.

## 18. API compatibility

Version routes only when breaking semantics require it.

Prefer:

```text
/v1/commands
```

with contract versioning and backward-compatible fields over proliferating `/v2`, `/v3` endpoints.

When breaking changes occur:

- server advertises minimum supported client protocol;
- clients refuse unsafe mutation;
- compatibility tests cover supported versions.

## 19. Protocol test suite

Required automated tests:

- same command replay;
- same ID/different payload rejection;
- response-loss recovery;
- stale expected version;
- simultaneous room booking;
- simultaneous stock receipt/count conflict;
- change cursor ordering;
- tombstone application;
- bootstrap hash mismatch;
- bootstrap interruption/retry;
- client behind minimum protocol;
- offline grant valid/expired/exhausted;
- exact-once audit/change generation for replay.
