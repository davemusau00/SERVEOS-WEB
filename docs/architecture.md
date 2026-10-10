# Architecture

ServOS is a web based hospitality ERP/POS delivered as a PWA. The Node API is the business command authority and PostgreSQL stores the durable business records. Browsers keep an IndexedDB projection and queued work for supported offline operations. Documents print through the browser/PWA and the workstation's operating-system print dialog.

```text
Browser / PWA ── HTTPS ── Node API ── PostgreSQL
      │
      └── localhost ── Print Bridge ── receipt or kitchen printer
```

The API command kernel validates identity, permissions, expected record versions, idempotency and offline grants. Domain command handlers and database transactions produce audit records and the ordered change feed. The browser sync layer sends queued commands and applies authorized changes to its projection.

The API authorizes document print attempts and records delivery evidence. A browser print dialog does not prove that paper emerged. ServOS does not install a local print service or promise unattended multi-printer delivery. The worker process is present for leased asynchronous jobs; no job handlers are currently registered.

The one time Countryside migration is separate from regular operator imports and deployment. Its current status is recorded in [the migration-tool boundary](../tools/migration/README.md).
