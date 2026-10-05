# 03 — New VPS Backend Specification

## 1. Objective

Build a backend that is easier to reason about than the existing direct-Supabase/V2 arrangement and that can be deployed reproducibly to the VPS behind:

`https://serveosapi.davemusau.co.ke`

The backend should be boring in the best sense: one API, one database, explicit commands, predictable transactions and visible operational health.

## 2. Recommended application stack

### Runtime

TypeScript on a current supported Node.js LTS release, pinned in the repository and Docker image.

### HTTP framework

Fastify or an equivalently small framework with:

- schema-based validation;
- structured logging;
- request IDs;
- graceful shutdown;
- OpenAPI support;
- mature plugin ecosystem.

### Validation/contracts

Use shared Zod/JSON-schema definitions from `packages/contracts`.

One schema should drive:

- server input validation;
- generated TypeScript types;
- API documentation;
- client validation where useful.

### Database

PostgreSQL.

Use a typed query layer such as Kysely or Drizzle. Pick one during implementation and avoid wrapping it in a home-grown ORM.

### Jobs

Use a PostgreSQL-backed job queue initially.

Use cases:

- report generation;
- scheduled backup metadata checks;
- email invitations/password reset delivery;
- deferred exports;
- cleanup of expired sessions/grants;
- reconciliation jobs;
- webhook retry.

Do not add Redis until measured load or queue semantics require it.

### Live updates

Server-Sent Events plus cursor polling.

SSE is notification transport, not transaction transport.

## 3. API process boundaries

Recommended modules:

```text
src/
  server.ts
  config/
  auth/
  commands/
  sync/
  audit/
  modules/
    business/
    catalog/
    inventory/
    pos/
    payments/
    procurement/
    hospitality/
    credit/
    staff/
    assets/
    reports/
    imports/
  db/
  errors/
  observability/
```

## 4. Route model

Use two API styles intentionally.

### Query endpoints

Human/client-friendly resource reads:

```text
GET /v1/session
GET /v1/catalog/items
GET /v1/inventory/locations
GET /v1/inventory/stock
GET /v1/pos/open-till
GET /v1/hospitality/rooms
GET /v1/hospitality/front-desk
GET /v1/procurement/purchase-orders
GET /v1/reports/daily
```

### Command endpoint

All business mutations:

```text
POST /v1/commands
GET  /v1/commands/:commandId
```

This keeps mutation behavior uniform without making every read a generic document query.

## 5. Command registry

The API imports one registry containing entries such as:

```ts
{
  name: 'stay.quickCheckIn',
  schema: QuickCheckInCommand,
  permission: 'hospitality.check_in',
  offlinePolicy: 'GRANTED_ONLY',
  handler: quickCheckIn,
}
```

CI verifies:

- every emitted PWA command exists;
- every registry command has a handler;
- every handler has a permission;
- every command has tests;
- deprecated aliases are not emitted by current clients.

## 6. Error model

Do not leak raw database errors.

Canonical API problem envelope:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This room changed on another device.",
    "retryable": false,
    "commandId": "...",
    "details": {
      "entity": "room",
      "id": "6",
      "currentVersion": 12
    }
  }
}
```

Stable codes include:

- `VALIDATION_FAILED`
- `AUTH_REQUIRED`
- `PERMISSION_DENIED`
- `VERSION_CONFLICT`
- `RESOURCE_CONFLICT`
- `DUPLICATE_REFERENCE`
- `OFFLINE_GRANT_REQUIRED`
- `OFFLINE_GRANT_EXPIRED`
- `INSUFFICIENT_STOCK`
- `TILL_NOT_OPEN`
- `PAYMENT_MISMATCH`
- `ROOM_UNAVAILABLE`
- `COMMAND_UNKNOWN`
- `COMMAND_REJECTED`
- `CLIENT_UPDATE_REQUIRED`

The UI maps these to operator language.

## 7. Transaction boundary

One command executes inside one database transaction whenever its business effects must be atomic.

Example `purchaseOrder.receive`:

```text
BEGIN
  lock PO/version
  validate outstanding quantities
  create goods receipt
  create receipt lines
  update PO received totals/status
  update stock balances
  create stock movements
  update weighted cost
  create AP evidence if applicable
  create audit event
  create change feed rows
  mark command confirmed
COMMIT
```

If any invariant fails, nothing posts.

## 8. Command log

Recommended fields:

```text
commands
  id UUID PK
  business_id UUID
  device_id UUID nullable
  actor_id UUID
  type TEXT
  payload JSONB
  expected_versions JSONB
  client_created_at timestamptz
  received_at timestamptz
  committed_at timestamptz nullable
  status enum
  result JSONB nullable
  error_code TEXT nullable
  error_details JSONB nullable
  offline_grant_id UUID nullable
  client_sequence BIGINT nullable
```

Unique command ID provides idempotency.

## 9. Change log

Recommended fields:

```text
changes
  cursor BIGSERIAL PK
  business_id UUID
  command_id UUID
  entity_type TEXT
  entity_id TEXT
  entity_version BIGINT
  action TEXT
  projection JSONB
  created_at timestamptz
```

`projection` contains enough current data for clients to apply the change without issuing a second read for every row. Sensitive fields are filtered before the change is exposed to a client.

## 10. Audit model

Audit is not the same as sync change feed.

Audit rows answer:

- who did it;
- from which device;
- which command;
- which permission/approval;
- why;
- before/after summary;
- money/stock consequences;
- timestamp;
- offline grant if any.

Audit tables should be append-only for ordinary application roles.

## 11. Approvals

Manager approval becomes a first-class backend primitive.

A protected command may include:

```text
approvalId
```

Approval records are:

- single-use;
- business scoped;
- initiator scoped;
- action scoped;
- target scoped;
- time limited;
- auditable.

No UUID/token should be manually copied by staff.

## 12. Files and branding assets

For initial ServOS 1.0, small receipt branding files can be stored in PostgreSQL with:

- MIME type;
- byte length;
- SHA-256;
- original PNG bytes;
- prepared thermal raster;
- created by/at;
- active version.

This is sufficient for logos and payment QR assets and keeps backup semantics simple.

A separate S3-compatible object store can be introduced for larger documents/photos later.

## 13. Receipt creation

Receipt documents are created at transaction commit, not dynamically from current settings on every reprint.

A receipt snapshot stores:

- business identity;
- logo/raster;
- payment QR/raster if enabled;
- exact transaction lines;
- tax totals;
- tender details;
- footer;
- layout version;
- printer profile metadata.

Reprint reads the immutable receipt document.

## 14. Authentication boundary

The API owns session issuance and validation.

Web and PWA device do not authenticate directly with PostgreSQL.

See `11-AUTH-SECURITY-RBAC.md` for details.

## 15. Graceful deployment

The API must support:

- `/health/live` — process is alive;
- `/health/ready` — DB/migrations/critical dependencies are usable;
- graceful SIGTERM;
- request draining;
- migration version check at startup;
- refusal to start against an unsupported schema.

## 16. Performance targets

Initial targets, validated under realistic load:

- typical read p95 under 300 ms from Nairobi/target business network;
- ordinary online command p95 under 500 ms excluding external integrations;
- local POS interaction remains instant because cart/UI and PWA device reads do not block on rendering round trips;
- sync batch supports hundreds/thousands of changes without full snapshot transfer;
- database queries for POS/catalog/front desk have explicit indexes and explain-plan review.

These are engineering targets, not contractual SLAs until measured.

## 17. API completion gate

The new backend is not considered ready until:

- all Tier-A command handlers have integration tests against real PostgreSQL;
- idempotent replay is tested;
- response-loss command lookup is tested;
- version conflicts are tested with concurrent connections;
- permission denial is tested for every sensitive domain;
- change feed reproduces committed state;
- migration restore from clean database passes;
- backup/restore passes;
- Web and PWA device contract tests use the same generated command definitions.
