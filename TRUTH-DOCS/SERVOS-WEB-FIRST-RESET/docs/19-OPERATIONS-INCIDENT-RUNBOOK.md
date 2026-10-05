# 19 — Production Operations and Incident Runbook

## 1. First question during an incident

Determine whether the problem is:

- Web only;
- API;
- database;
- one Terminal;
- one business/network;
- printer/scanner hardware;
- deployment regression;
- authentication;
- synchronization lag.

Do not immediately mutate databases while diagnosis is incomplete.

## 2. API unavailable

Check:

1. DNS resolves;
2. VPS reachable;
3. reverse proxy healthy;
4. API container state/logs;
5. `/health/live`;
6. `/health/ready`;
7. DB connectivity;
8. disk/memory;
9. migration mismatch.

Response:

- restore API service;
- Terminal remains within offline capability;
- Web does not bypass API.

## 3. Database unavailable

- stop/restart dependent API safely;
- inspect disk/connection exhaustion/PostgreSQL logs;
- do not repeatedly restart if corruption suspected;
- preserve logs/evidence;
- restore from tested backup if required.

## 4. Disk nearly full

Priority:

- protect PostgreSQL;
- identify log/backups/container layers;
- rotate/archive safely;
- expand storage if necessary.

Never delete PostgreSQL files manually.

## 5. Terminal not synchronizing

Admin diagnostics:

```text
API reachability
session status
device revoked?
local cursor
server cursor
pending commands
unknown commands
grant status
last error
```

Do not solve by uploading the local database.

## 6. Unknown command outcomes

For each command:

- query server by command ID;
- if confirmed, apply changes;
- if rejected/conflict, surface recovery;
- if server has no command and request definitively never arrived, resend same ID;
- never generate a replacement payment/sale command casually.

## 7. Printer down

- sale/payment remains confirmed;
- printer queue marks failed;
- fix printer/queue;
- reprint immutable document.

Never reverse the sale because the printer jammed.

## 8. Wrong stock count/correction

Use authorized correction command.

Never edit `stock_balances` directly in production to "fix the number" unless executing a documented emergency database repair with audit and subsequent reconciliation.

## 9. Accidental duplicate external payment reference

System should prevent duplicate references by policy.

If genuine provider duplicate/exception occurs:

- preserve both provider evidence records;
- do not overwrite first payment;
- use reconciliation/discrepancy workflow.

## 10. Bad deployment

If schema backward-compatible:

- redeploy previous image digest;
- verify readiness;
- smoke test.

If migration broke state:

- enter maintenance;
- assess forward repair vs restore;
- restore only using documented backup point;
- reconcile Terminal commands after recovery point.

## 11. Lost/stolen Terminal

- revoke device;
- invalidate sessions/refresh credentials;
- assess offline grant validity window;
- flag grant revoked server-side;
- provision replacement;
- bootstrap new device.

## 12. Security incident

- rotate affected secrets;
- revoke suspicious sessions/devices;
- preserve logs;
- determine exposed business/customer scope;
- restore clean images if host compromise suspected;
- review audit and access logs;
- document incident timeline/remediation.

## 13. Database manual access policy

Production SQL write access is emergency-only.

Any manual correction records:

- operator;
- timestamp;
- reason;
- ticket/incident;
- exact SQL;
- before/after evidence;
- follow-up domain reconciliation.

Prefer application-level admin commands/tools even for repair.

## 14. Maintenance mode

API supports controlled maintenance response for unsafe mutation windows.

Web shows:

> ServOS is undergoing maintenance. Your data is safe. Try again shortly.

Terminal may continue only within explicitly valid offline grant.

## 15. Daily/weekly operational checks

Daily automated:

- backup success/freshness;
- disk capacity;
- API error rate;
- worker alive.

Weekly human review:

- restore sample/backup verification signal;
- security updates;
- unusual auth failures;
- unresolved reconciliation cases;
- devices significantly behind.

## 16. Change management

Every production deploy records:

- who deployed;
- release SHA/digest;
- migration version;
- start/end time;
- smoke outcome;
- rollback availability.
