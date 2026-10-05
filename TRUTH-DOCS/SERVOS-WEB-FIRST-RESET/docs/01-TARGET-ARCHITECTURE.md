# 01 — Target Architecture

## 1. Production topology

```text
                           PUBLIC INTERNET
                                  │
                               NGINX
                    ┌─────────────┴─────────────┐
                    │                           │
       serveos.davemusau.co.ke      serveosapi.davemusau.co.ke
                    │                           │
           static ServOS PWA              API : loopback
                    │                           │
     Service Worker + IndexedDB         ServOS Core API
                    │                           │
                    └──────── HTTPS ────────────┤
                                                │
                                ┌───────────────┼───────────────┐
                                │               │               │
                           PostgreSQL       API worker      change feed/SSE
                                │
                      authoritative business state
```

At the business location:

```text
Installed ServOS PWA
  Edge / Chrome / compatible browser
        │
        ├── IndexedDB projection
        ├── durable command outbox
        ├── offline grant
        ├── Service Worker shell
        ├── local backups
        └── optional ServOS Print Bridge
                  │
                  ├── Windows RAW printer
                  └── LAN ESC/POS printer
```

## 2. Authority model

### PostgreSQL

Authoritative shared state for business configuration, catalog, inventory, orders, payments, procurement, rooms/stays, credit, staff, audit, documents, devices and sync cursors.

### API

Only shared mutation gateway. It owns authentication context, permission checks, schema validation, command idempotency, optimistic version checks, domain transactions, audit, document issuance and change-feed creation.

### Browser IndexedDB

A durable local projection and command store, not a second cloud server.

It contains enough data to continue bounded offline operation and recover unresolved commands.

### Optional Print Bridge

Local hardware adapter only. It never mutates shared business records and never becomes a synchronization authority.

## 3. Online read path

```text
PWA
 ↓
local projection for responsive UI
 ↓                         ↘
background change feed      API queries when required
```

The application can render immediately from its projection while keeping authoritative versions/cursors visible internally.

## 4. Online write path

```text
UI action
  ↓
command UUID
  ↓
persist command in IndexedDB
  ↓
POST /v1/commands
  ↓
auth + permission + schema
  ↓
idempotency lookup
  ↓
expected-version checks
  ↓
BEGIN PostgreSQL transaction
  ↓
domain handler
  ↓
records + audit + documents + changes
  ↓
CONFIRMED command
  ↓
COMMIT
  ↓
return result + cursor
  ↓
update IndexedDB projection
```

## 5. Offline write path

```text
UI action
  ↓
validate offline grant
  ↓
persist command + local evidence
  ↓
update local pending projection
  ↓
continue operation
  ↓
network returns
  ↓
replay SAME command UUID
  ↓
server confirms/rejects
  ↓
apply authoritative projection
```

## 6. Response loss

A timeout after send never means "create another payment".

```text
SENDING → OUTCOME_UNKNOWN
```

Resolve the same UUID with `GET /v1/commands/{id}`.

## 7. Change distribution

Every commit creates ordered change records with a business cursor.

Clients pull:

`GET /v1/sync/changes?after=<cursor>`

SSE may notify that changes exist, but correctness depends on cursor pull, not an always-open socket.

## 8. Same-VPS deployment shape

The existing VPS already uses host Nginx. Keep it.

Recommended runtime:

```text
host Nginx
  ├── static /var/www/serveos/current
  └── reverse proxy 127.0.0.1:3101

Docker compose
  ├── serveos-api
  ├── serveos-worker
  ├── serveos-postgres
  └── serveos-backup
```

Redis is optional, not a day-one requirement.

## 9. Domain boundaries

Backend modular monolith:

- Identity & Access
- Business Setup
- Catalog
- Inventory
- POS / Orders
- Payments & Tills
- Procurement / AP
- Hospitality
- Customer Credit
- Receipts / Business Documents
- Assets / Maintenance
- Guidance / Help
- Device / Offline Grants
- Sync / Change Feed

These are modules, not separately deployed microservices.

## 10. Client package boundaries

```text
apps/web
apps/api
apps/worker
apps/print-bridge   optional

packages/contracts
packages/domain
packages/permissions
packages/offline
packages/sync
packages/documents
packages/printing
packages/inventory
packages/hospitality
packages/finance
packages/design-system
```

## 11. Multi-device offline rule

Do not let several disconnected devices independently spend the same scarce resource in phase one.

Use one offline-authorized device per operational scope or explicit leases/allocations for:

- rooms;
- tills;
- receipt number blocks;
- selected stock authority.

Expand only after measured need.

## 12. Security boundary

- frontend never receives DB credentials;
- database is not publicly exposed;
- API CORS allows explicit production/staging origins;
- HTTPS everywhere;
- device key generated/stored through WebCrypto where supported;
- Print Bridge loopback only and paired to approved origin/device;
- secrets never stored in documentation or committed `.env`.

## 13. Architecture success test

A replacement POS machine should require only:

```text
open site → install PWA → enroll → bootstrap → configure printer → trade
```

No copying a historical local business database into production authority.
