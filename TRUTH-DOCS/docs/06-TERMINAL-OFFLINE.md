# 06 — Terminal, SQLite and Offline Operation

## 1. Goal

Keep the Terminal resilient without recreating the old architectural mistake where local and cloud state can both mutate independently and later attempt to reconcile arbitrary snapshots.

## 2. Terminal database roles

The local SQLite database contains four distinct categories of data.

### A. Server projection

Examples:

- items;
- stock balances;
- rooms;
- rate plans;
- current staff permissions;
- suppliers;
- open orders/stays needed locally;
- current receipt metadata.

These rows are updated by ordered server changes and have server versions.

### B. Local terminal state

Examples:

- printer configuration;
- scanner configuration;
- UI/device preferences;
- local diagnostic history;
- locally cached branding raster.

These are not synchronized as business records unless explicitly represented by a command.

### C. Durable command outbox

Contains commands not yet confirmed by server.

### D. Offline authority state

Contains signed offline grants, their limits and locally consumed resources.

## 3. Never upload tables

The Terminal must not have a function conceptually equivalent to:

```text
upload all business records
replace cloud copy
```

Nor should recovery compare two databases and choose rows based on timestamps.

Only commands cross upward.
Only ordered projections/change records cross downward.

## 4. Local command table

Suggested structure:

```text
local_commands
  id UUID PK
  type TEXT
  payload_json TEXT
  expected_versions_json TEXT
  status TEXT
  client_sequence INTEGER
  created_at TEXT
  local_committed_at TEXT nullable
  sent_at TEXT nullable
  confirmed_at TEXT nullable
  server_cursor INTEGER nullable
  last_error_code TEXT nullable
  offline_grant_id TEXT nullable
```

Statuses:

```text
PENDING
SENT
OUTCOME_UNKNOWN
CONFIRMED
REJECTED
CONFLICT
```

## 5. Online transaction behavior

Preferred online mode:

1. UI creates command with UUID.
2. Persist command locally before network send.
3. Send command to API.
4. On confirmed response, apply returned changes and mark confirmed in one SQLite transaction.
5. Pull any subsequent changes.

For transaction speed, UI may optimistically render safe local state, but authoritative durable projection must reconcile to server changes.

## 6. Why persist before send

If power disappears after a cashier presses Pay but before the application records the request, the action can vanish.

Persisting first gives the Terminal evidence of intent and command identity.

The server's command ID provides idempotency.

## 7. Response loss

If request transport fails after send:

```text
SENT → OUTCOME_UNKNOWN
```

The Terminal does not automatically reverse local UI or create another payment.

It requests:

`GET /v1/commands/<same-id>`

and resolves the existing outcome.

## 8. Offline philosophy

Offline is not "pretend the cloud does not exist."

Offline means:

> The server previously gave this enrolled Terminal bounded authority to perform specific business actions for a limited period/resource scope.

## 9. Offline grant

A signed grant can contain:

```text
grantId
businessId
deviceId
operator/role constraints
issuedAt
expiresAt
policyVersion
allowedCommands
outlet/serviceArea scope
stock resource ceilings or allocations
till identity/limits
room leases where applicable
receipt/document sequence block
maximum discount/refund authority
signature/key version
```

The exact resource model can start small and expand.

## 10. Phase-1 offline scope

Do not try to support every ServOS operation offline immediately.

Recommended first supported offline commands:

- open already-assigned till if policy allows;
- create/open POS order;
- add/remove ordinary order items;
- fire kitchen order locally;
- cash payment;
- manually confirmed M-Pesa/card tender with clearly offline evidence rules;
- print immutable receipt;
- ordinary inventory consumption caused by POS;
- close local order.

Potentially blocked offline initially:

- supplier payments;
- major stock corrections;
- imports;
- staff/role edits;
- credit-limit overrides;
- room moves involving shared uncertain availability;
- refunds above threshold;
- advanced procurement approval;
- configuration changes.

## 11. Stock allocation strategy

For true multi-device offline selling, the server must prevent two devices from selling the same last unit.

Options:

### Single offline-authorized Terminal per outlet

Simplest first release.

That Terminal owns offline local stock authority for its assigned outlet while disconnected.

### Resource allocation

Later, server grants stock ceilings/reservations to individual devices.

Do not implement free-form multi-device offline writes without allocation.

## 12. Receipt numbering offline

Avoid global sequence collision.

Use server-issued number blocks or device-prefixed numbers.

Example:

```text
C01-20261005-000231
```

or allocated blocks:

```text
Terminal C01 may issue 250001–251000
```

The human receipt number and immutable command UUID are separate concepts.

## 13. Reconnect

Reconnect algorithm:

```text
verify server/session
    ↓
verify protocol and grant status
    ↓
resolve OUTCOME_UNKNOWN commands
    ↓
replay PENDING offline commands in local sequence order
    ↓
server validates grant/resource use
    ↓
apply server results
    ↓
pull change feed
    ↓
resolve any conflicts requiring manager attention
    ↓
renew grant
```

## 14. Server rejection of an offline command

This is possible if:

- grant signature is invalid;
- grant expired before local command time;
- resource budget exceeded;
- command type was not granted;
- command payload violates invariant.

The Terminal must never silently drop it.

It becomes a reconciliation case with clear evidence and manager workflow.

## 15. Projection application

Each server change has `entityType`, `entityId`, `version` and projection/tombstone.

SQLite applies it only when:

```text
incoming version > current server version
```

or when installing an atomic bootstrap.

Client-local pending overlay data is kept separate from server-version columns so pending state cannot masquerade as confirmed cloud truth.

## 16. Bootstrap/recovery

A corrupted/replaced Terminal is restored by:

1. install ServOS;
2. enroll device;
3. authenticate administrator;
4. request bootstrap;
5. download verified manifest/pages;
6. create fresh SQLite projection;
7. configure printer/scanner;
8. reconcile any separately retained unconfirmed local command evidence if this is a recovery from damaged media;
9. resume.

Do not restore an ancient SQLite file and allow it to overwrite server state.

## 17. Local backup

Local backup is still valuable for:

- offline evidence;
- unconfirmed command recovery;
- printer/job history;
- device configuration;
- diagnostics.

But cloud/PostgreSQL backup is the authoritative business disaster-recovery source after cutover.

## 18. Offline UX

Persistent status indicator:

```text
ONLINE
SYNCING
OFFLINE — LOCAL TRADING ACTIVE
OFFLINE — LIMITED ACTIONS
SYNC ATTENTION REQUIRED
```

When offline, every blocked action says why.

Example:

> Supplier payments need the server. You can continue selling and receiving cash, then try this again when connected.

## 19. Sync diagnostics

Admin-only diagnostics should show:

- current API reachability;
- device ID;
- protocol version;
- local cursor;
- server latest cursor;
- pending commands;
- unknown commands;
- last successful sync;
- active grant expiry;
- unresolved reconciliation items;
- local DB health.

Do not expose this machinery to ordinary cashiers unless action is needed.

## 20. Acceptance

Terminal sync/offline is accepted only after physical tests prove:

- command sent twice commits once;
- response loss recovers;
- app killed after Pay does not duplicate/lose sale;
- internet loss during shift works within grant;
- reconnect replays in correct order;
- server changes arrive locally;
- stale versions conflict;
- grant expiry blocks new protected offline work;
- printer failure does not alter transaction state;
- new Terminal can bootstrap cleanly;
- old Terminal can be revoked/fenced.
