# 01 — Target Architecture

## 1. Production topology

```text
                           PUBLIC INTERNET
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
       serveos.davemusau.co.ke      serveosapi.davemusau.co.ke
                    │                           │
             ServOS Web/PWA                 Caddy/Nginx
                    │                           │
                    └──────── HTTPS ────────────┤
                                                │
                                         ServOS Core API
                                                │
                                ┌───────────────┼───────────────┐
                                │               │               │
                           PostgreSQL       API worker      SSE/change feed
                                │
                      authoritative business state

               Business location / property
               ┌─────────────────────────────────────────┐
               │ ServOS Terminal                         │
               │ Tauri + React                           │
               │ SQLite projection                       │
               │ printer / scanner                       │
               │ durable command outbox                  │
               │ offline grant cache                     │
               └───────────────────┬─────────────────────┘
                                   │ HTTPS
                                   └──── serveosapi.davemusau.co.ke
```

## 2. Authority model

### PostgreSQL

Final network authority for:

- business configuration;
- catalog;
- inventory;
- orders;
- payments;
- procurement;
- hospitality;
- customer credit;
- staff/roles;
- audit;
- document sequences;
- device registration;
- synchronization cursors.

### API

Only public mutation gateway.

It owns:

- authentication context;
- authorization;
- input validation;
- command idempotency;
- expected-version checks;
- domain orchestration;
- transaction boundaries;
- audit generation;
- change-feed generation;
- operator-facing errors.

### Terminal SQLite

Not a second server.

Contains:

- projection of entities required by Terminal;
- hardware/device preferences;
- local session state;
- durable pending commands;
- immutable locally created offline receipts until server acknowledgement;
- offline grants;
- sync cursor;
- count/session drafts;
- local logs/recovery metadata.

### Web browser

Does not maintain a competing database.

It may persist:

- cached query data;
- unsent form drafts;
- user UI preferences;
- PWA shell resources.

Offline Web drafts are never described as committed transactions.

## 3. Read path

Online Web:

```text
React Query/UI
   ↓
GET serveosapi.../v1/...
   ↓
API query service
   ↓
PostgreSQL
```

Online Terminal:

```text
UI
 ↓
SQLite local projection for fast reads
 ↓                     ↘
background sync          API query fallback where needed
```

The Terminal normally reads locally so selling stays fast. The sync engine keeps that local projection current.

## 4. Write path

### Online

```text
Web or Terminal
      ↓
create command UUID
      ↓
POST /v1/commands
      ↓
auth + permission + schema validation
      ↓
check existing command UUID
      ↓
check expected versions
      ↓
BEGIN PostgreSQL transaction
      ↓
execute domain handler
      ↓
write domain rows
      ↓
write audit rows
      ↓
write change-feed entries
      ↓
mark command CONFIRMED
      ↓
COMMIT
      ↓
return result + cursor
```

### Response loss

```text
client sends command ABC
      ↓
server commits ABC
      ↓
network response is lost
      ↓
client keeps ABC in UNKNOWN
      ↓
GET /v1/commands/ABC
      ↓
CONFIRMED
```

The client never creates ABC2 just because ABC timed out.

## 5. Change distribution

Every committed mutation produces one or more ordered change records with a monotonically increasing cursor.

Clients request:

`GET /v1/sync/changes?after=<cursor>`

The API returns:

- `fromCursor`;
- `toCursor`;
- ordered changes;
- `hasMore`;
- current protocol/schema versions.

SSE can notify online clients that newer changes exist, but cursor pulling remains the source of truth. If SSE drops, correctness is unaffected.

## 6. Why SSE rather than making WebSocket correctness-critical

ServOS primarily needs server-to-client invalidation and change notification.

SSE is sufficient for:

- new order status;
- stock changes;
- room changes;
- command outcome updates;
- till changes;
- activity notifications.

Commands remain ordinary HTTPS requests.

Benefits:

- easier reverse proxy configuration;
- easier recovery;
- simpler observability;
- fewer persistent bidirectional session assumptions.

A future WebSocket service can be introduced if a measured feature requires it, but it is not part of transaction correctness.

## 7. Backend deployment shape

Recommended Docker services:

```text
caddy                 public 80/443
serveos-web            internal static/web container
serveos-api            internal HTTP
serveos-worker         internal background worker
postgres               private network only
backup                  scheduled/offsite backup process
```

Optional later:

```text
prometheus
grafana
loki
minio
```

Do not introduce Redis on day one unless workload evidence requires it. A PostgreSQL-backed job queue is adequate for initial email, report, cleanup and reconciliation jobs.

## 8. Domain boundaries

The backend is a modular monolith containing:

- Identity & Access
- Business Setup
- Catalog
- Inventory
- POS / Orders
- Payments & Tills
- Procurement / AP
- Hospitality
- Customer Credit
- Receipts / Documents
- Assets & Maintenance
- Reporting
- Audit
- Devices & Sync
- Imports

A module may not directly mutate another module's tables from route code. Cross-module behavior goes through application/domain services inside one database transaction.

## 9. Database philosophy

Use normalized relational tables for operational truth.

Use JSONB only where it is genuinely flexible:

- command payload snapshots;
- audit before/after summaries;
- receipt documents;
- import staging;
- non-query-critical metadata.

Do not rebuild a generic `records(collection,id,data)` table as the main business database.

## 10. Protocol versioning

Every client identifies:

```text
clientVersion
protocolVersion
schemaCompatibilityVersion
deviceId
```

Server replies include minimum supported client/protocol versions.

A client that is unsafe must fail clearly before sending mutations.

Example operator message:

> This ServOS Terminal needs an update before it can transact with the server. Your local data is safe.

Not:

> PROTOCOL_VERSION_MISMATCH

## 11. High availability expectations

One VPS is still one physical failure domain.

The design therefore requires:

- offsite backups;
- tested restore;
- a rebuildable Docker deployment;
- DNS documented for failover;
- Terminal offline capability for supported operations;
- immutable migration history;
- reproducible container images.

A second VPS/database replica can be added later without changing the client protocol.

## 12. Architecture invariant checklist

The following statements should stay true for the life of ServOS 1.x:

- There is one network mutation API.
- Database ports are not publicly exposed.
- Clients cannot issue raw SQL.
- Clients cannot call hidden database RPC functions directly.
- Every mutation has an idempotency identity.
- Every domain row mutation belongs to a transaction.
- Every committed command produces audit evidence.
- Every projection can be rebuilt from authoritative server state plus immutable history where required.
- Terminal offline authority is explicit and bounded.
- Web offline content is draft-only unless a future grant specification says otherwise.
