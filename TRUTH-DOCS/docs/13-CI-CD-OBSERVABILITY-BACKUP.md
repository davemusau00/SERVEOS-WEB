# 13 — CI/CD, Observability, Backup and Disaster Recovery

## 1. Principle

A green build is not a production release. ServOS carries money, stock, rooms and receipts; release evidence must match those risks.

## 2. Pull-request gates

Required:

```text
install with lockfile
lint
format check
typecheck
unit tests
contract generation/check
database migration from zero
API integration tests
Terminal domain tests
Web browser tests
security/secret scan
docs links/checks
```

## 3. Main-branch gates

Additionally:

- production Web build;
- API container build;
- Terminal compile/package checks;
- migration upgrade test from prior supported schema;
- command parity check;
- OpenAPI generated diff check;
- Docker Compose config validation;
- SBOM/container vulnerability scan where available.

## 4. Release candidate

A release candidate is an immutable Git SHA and image digest.

Release manifest records:

- Git SHA;
- API image digest;
- Web image digest;
- Terminal installer hash/version;
- migration version;
- protocol version;
- test run IDs;
- known limitations.

## 5. Contract parity automation

Generate from source:

```text
command registry
   + Web command usage
   + Terminal command usage
   + permission registry
   + API handlers
        ↓
parity matrix
```

Fail CI when:

- client emits unknown command;
- handler has no permission;
- canonical command has no tests;
- alias is emitted from new code;
- protocol schema generated output is stale.

## 6. Logs

Structured JSON logs include:

```text
timestamp
level
requestId
commandId when applicable
businessId
actorId redacted/ID only
deviceId
route
latency
status/error code
```

Never log:

- passwords;
- refresh tokens;
- full authorization headers;
- device secrets;
- unnecessary customer sensitive data.

## 7. Metrics

At minimum:

- API request count/latency/error rate;
- DB connection pool usage;
- slow query count;
- command outcome counts;
- commands stuck processing;
- sync cursor lag by active device;
- pending/outcome-unknown Terminal counts when reported;
- worker queue depth/failures;
- database size/disk free;
- backup age;
- SSE connections;
- authentication failures/rate-limit events.

## 8. Alerts

Alert on:

- API health unavailable;
- database unavailable;
- disk low;
- backup stale/failed;
- migration mismatch;
- high 5xx rate;
- worker dead;
- rapid auth failure spike;
- command backlog abnormal;
- database connections exhausted.

Do not alert on every individual operator validation error.

## 9. Error tracking

Capture application exceptions with:

- release SHA;
- route/component;
- request ID/command ID;
- sanitized stack;
- browser/Terminal version.

Avoid uploading customer-sensitive receipt/guest payloads into third-party telemetry by default.

## 10. Backup strategy

Production requires offsite backup outside the VPS failure domain.

Recommended layers:

### PostgreSQL

- regular full/base backup;
- frequent incremental/WAL or equivalent point-in-time strategy if operationally feasible;
- encrypted transfer;
- retention policy;
- backup integrity verification.

### Configuration

- encrypted copy of production deployment configuration/secrets according to secure operational process;
- Caddy/Compose config in Git without secrets.

### Branding/files

If stored in PostgreSQL, covered by DB backup.
If later object storage is introduced, separate versioned backup policy.

## 11. Backup frequency target

Choose explicit RPO/RTO.

Suggested initial target for a live hospitality system:

- RPO: materially less than one trading day; preferably minutes through WAL/PITR capability;
- RTO: documented restore onto replacement VPS within a few hours or better.

Do not claim these targets until timed rehearsal proves them.

## 12. Restore rehearsal

At least periodically:

1. create clean isolated PostgreSQL;
2. restore selected backup;
3. run schema/version verification;
4. run control totals;
5. start API against restored copy;
6. run smoke tenant checks;
7. record duration/result.

A backup never restored is only a hopeful file.

## 13. Disaster scenarios

### VPS lost

- provision replacement VPS;
- DNS/firewall;
- Docker install;
- pull release images;
- restore DB;
- start API/Web;
- change DNS if IP differs;
- Terminal reconnect/pull.

### Database corruption

- stop mutations;
- preserve evidence;
- restore last valid point;
- reconcile Terminal offline commands after restored point;
- replay only commands whose server status is known/absent under documented recovery.

### Terminal PC lost

- revoke old device;
- install new Terminal;
- enroll;
- bootstrap from API;
- configure printer/scanner.

### Internet outage at property

- Terminal continues within offline grant;
- Web unavailable for mutation;
- reconnect and replay.

## 14. Retention

Define separately:

- application logs;
- audit history;
- command history;
- receipt documents;
- backups;
- import raw files;
- browser/Terminal diagnostics.

Financial/audit data should not be discarded on the same short schedule as debug logs.

## 15. Production dashboard

One operations dashboard should answer:

- Is API up?
- Is DB healthy?
- Is disk safe?
- Are backups current?
- What release is deployed?
- Are worker jobs failing?
- Are devices significantly behind?
- Are there unresolved server errors?

Avoid a giant observability project before these basics exist.
