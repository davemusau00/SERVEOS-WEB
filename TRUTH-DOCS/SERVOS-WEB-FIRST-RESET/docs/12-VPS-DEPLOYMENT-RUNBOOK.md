# 12 — VPS Production Deployment Runbook

## 1. Public endpoints

Frontend/PWA:

`https://serveos.davemusau.co.ke`

API:

`https://serveosapi.davemusau.co.ke`

Both resolve to the same VPS for the initial production deployment.

## 2. Observed server baseline

The pre-reset audit found a Ubuntu 24.04-class VPS with 4 vCPU, ~7.8 GiB RAM and ~142 GB root storage, Docker active, Nginx active and existing workloads already using localhost ports 3000/3001.

Treat this as planning evidence only. Recheck current state before deployment.

## 3. Coexistence rule

ServOS must not disturb existing services.

Use:

```text
/opt/serveos
/var/www/serveos
serveos-* container names
serveos internal Docker network
127.0.0.1:3101 API binding (example)
```

Do not reuse unrelated PostgreSQL/Redis containers.

## 4. Frontend deployment

Build PWA in CI or a controlled build environment.

Deploy immutable static artifact:

```text
/var/www/serveos/releases/<git-sha>/
/var/www/serveos/current -> releases/<git-sha>
```

Nginx directly serves `current`.

Versioned assets get long immutable cache headers. `index.html`, service worker and release metadata must use update-safe cache rules.

## 5. Backend containers

Initial Compose services:

```text
api
worker
postgres
backup
```

API binds to loopback only. PostgreSQL has no public host port.

## 6. Nginx

Host Nginx remains public ingress because it already owns 80/443.

Create two dedicated site configs only. Test with `nginx -t` before reload.

API proxy must support long-lived SSE/change-feed notification endpoints without accidental buffering/timeouts.

## 7. DNS and TLS

Point both subdomains at the VPS.

Use existing Certbot/Nginx ACME operational pattern. Require HTTPS.

Do not enable HSTS until both hostnames and certificate renewal are proven stable.

## 8. Production secrets

Server-only secret store/environment includes:

```text
DATABASE_URL
SESSION/JWT signing secrets
password pepper if used
PUBLIC_WEB_ORIGIN=https://serveos.davemusau.co.ke
PUBLIC_API_URL=https://serveosapi.davemusau.co.ke
SMTP credentials
backup destination credentials
telemetry/logging config
```

Never bake secrets into PWA assets.

## 9. First deployment

1. schedule/perform any required host reboot from OS maintenance and verify existing services;
2. create `/opt/serveos` and `/var/www/serveos`;
3. create Docker network/volumes;
4. start PostgreSQL;
5. run migrations from release image;
6. run database verification;
7. start API/worker;
8. verify `/health/live` and `/health/ready`;
9. publish frontend release;
10. enable Nginx sites/TLS;
11. run browser/PWA smoke tests;
12. prove backup and isolated restore.

## 10. Release process

```text
Git SHA
 ↓
CI tests
 ↓
build API/worker image + frontend artifact
 ↓
push immutable image digest
 ↓
server pulls exact digest
 ↓
pre-deploy backup/checkpoint when warranted
 ↓
expand-safe migration
 ↓
start/replace API
 ↓
ready check
 ↓
publish frontend SHA
 ↓
smoke/PWA tests
 ↓
record deployed release
```

Never rely on mutable `latest` without recording exact digest/SHA.

## 11. Rollback

Frontend: switch `current` symlink to prior release.

API: redeploy prior image if database schema remains backward compatible.

Prefer expand/contract migrations so application rollback is possible.

## 12. Backup

Run database backup process on VPS but send encrypted copies to an independent destination. Same-VPS-only backups do not satisfy disaster recovery.

## 13. Firewall

Public:

- 80/443;
- SSH according to administrative policy.

Private:

- PostgreSQL;
- worker internals;
- metrics endpoints unless protected.

## 14. Staging

Preferred:

```text
serveos-staging.davemusau.co.ke
serveosapi-staging.davemusau.co.ke
```

Use separate database, secrets, IndexedDB origin and device enrollments. Never point staging at production DB.

## 15. Production preflight

Before every major deployment verify:

```text
free -h
df -h
docker ps
docker system df
ss -tulpn
nginx -t
```

Do not blindly prune Docker on this shared VPS.

See `29-SAME-VPS-PRODUCTION-TOPOLOGY.md`.
