# 13 — CI/CD, Observability, Backup and Disaster Recovery

## 1. Pull-request gates

Required:

```text
lockfile install
lint/format/typecheck
unit/domain tests
API contract generation/check
DB migration from zero
API integration tests
PWA browser tests
IndexedDB migration tests
offline command tests
printing contract tests
security/secret scan
documentation/link checks
```

During migration retain native Rust tests as behavioral evidence until equivalent new tests exist.

## 2. Main/release gates

Additionally:

- production PWA build;
- API/worker container builds;
- service-worker/offline-shell tests;
- browser restart/pending-command tests;
- prior-schema migration upgrade;
- command registry parity;
- OpenAPI diff review;
- Compose config validation;
- container/security scan where available;
- backup + restore proof;
- PWA install/update smoke test.

## 3. Release manifest

Record:

```text
Git SHA
frontend artifact hash
API image digest
worker image digest
DB migration version
protocol version
PWA cache version
Print Bridge minimum/compatible version
browser support baseline
acceptance evidence IDs
known limitations
```

## 4. Logs

Structured server logs include:

- request/correlation ID;
- command ID;
- business/device/actor IDs where safe;
- operation;
- duration;
- result code;
- conflict/rejection category;
- cursor range;
- no secrets/full payment credentials.

## 5. Browser telemetry

Collect privacy-conscious operational diagnostics such as:

- PWA release;
- last sync cursor/time;
- pending/unknown counts;
- IndexedDB schema version;
- offline grant expiry;
- storage persistence state;
- Print Bridge version/state when installed;
- client errors with bounded/sanitized context.

Do not upload raw local business databases for diagnostics.

## 6. Health endpoints

API:

```text
/health/live
/health/ready
/version
```

Readiness checks database/migration/protocol dependencies without exposing secrets.

## 7. Backup layers

### PostgreSQL authoritative backup

Automated scheduled backups plus PITR/WAL where feasible.

### Offsite copy

Mandatory independent failure domain.

### Browser recovery backup

Export unresolved commands, projection and immutable local documents without reusable auth credentials.

### Document retention

Issued receipts/POs/GRNs/statements are immutable snapshots and follow configured retention policy.

## 8. Restore rehearsal

At least before launch and periodically thereafter:

- restore DB to isolated container;
- boot matching API release;
- verify migrations;
- run domain sanity checks;
- verify command/audit/document continuity;
- record restore duration.

## 9. Alerts

Initial practical alerts:

- disk > threshold;
- memory pressure/swap growth;
- DB backup overdue/failure;
- restore verification overdue;
- API readiness failure;
- repeated 5xx;
- command UNKNOWN backlog;
- worker backlog age;
- database connection exhaustion;
- change-feed lag.

## 10. PWA release safety

A new Service Worker must not activate mid-transaction. Test update-ready and safe-boundary activation explicitly.

## 11. Print Bridge releases

Print Bridge has independent semantic versioning because it is optional local hardware software. The API/PWA advertises compatible versions and degrades to browser printing if bridge is absent/incompatible.
