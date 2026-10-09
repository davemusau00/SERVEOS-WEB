# Architecture

ServOS is a web based hospitality ERP/POS delivered as a PWA. The Node API is the business command authority and PostgreSQL stores the durable business records. Browsers keep an IndexedDB projection and queued work for supported offline operations. A separate Print Bridge handles local printer transport.

```text
Browser / PWA ── HTTPS ── Node API ── PostgreSQL
      │
      └── localhost ── Print Bridge ── receipt or kitchen printer
```

The API command kernel validates identity, permissions, expected record versions, idempotency and offline grants. Domain command handlers and database transactions produce audit records and the ordered change feed. The browser sync layer sends queued commands and applies authorized changes to its projection.

The Print Bridge accepts only signed print work and reports transport outcomes. It does not own products, stock, payments, rooms or staff. The worker process is present for leased asynchronous jobs; no job handlers are currently registered.

The one time Countryside migration is separate from regular operator imports and deployment. Its current status is recorded in [the migration-tool boundary](../tools/migration/README.md).
