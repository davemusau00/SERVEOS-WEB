# 12 — VPS Production Deployment Runbook

## 1. Target endpoints

Web:

`https://serveos.davemusau.co.ke`

API:

`https://serveosapi.davemusau.co.ke`

## 2. Recommended server baseline

Linux VPS with:

- supported Ubuntu/Debian-class distribution;
- at least 4 vCPU / 8 GB RAM for comfortable initial Web/API/PostgreSQL colocation, adjusted after measurement;
- NVMe/SSD;
- adequate disk growth headroom;
- static public IP;
- offsite backup destination.

The exact size depends on businesses, retention and concurrent clients. Measure before promising capacity.

## 3. DNS

Create A/AAAA records:

```text
serveos.davemusau.co.ke     → VPS IP
serveosapi.davemusau.co.ke  → VPS IP
```

Keep TTL modest during first cutover, then raise after stability.

## 4. OS bootstrap

High-level:

1. patch OS;
2. create named sudo user;
3. install SSH keys;
4. harden SSH;
5. configure firewall;
6. install Docker Engine + Compose plugin;
7. create `/opt/serveos`;
8. create persistent volume directories if bind mounts are chosen;
9. configure log rotation;
10. configure time synchronization;
11. install backup credentials securely.

## 5. Filesystem

Example:

```text
/opt/serveos/
  compose.yml
  .env
  caddy/
  backups/
  scripts/
  releases/
```

Do not store Git checkout as the only production release mechanism.

Prefer immutable container images built by CI.

## 6. Containers

Production Compose:

- `caddy`
- `web`
- `api`
- `worker`
- `postgres`
- `backup`

Database and internal services have no host-public ports.

## 7. Reverse proxy

Caddy/Nginx routes:

```text
serveos.davemusau.co.ke
  → web:80

serveosapi.davemusau.co.ke
  → api:3000
```

API streaming endpoint must disable buffering where necessary for SSE.

## 8. TLS

Automatic ACME certificates or centrally managed certificates.

Require HTTPS.

Enable HSTS after confirming domains are stable and certificate renewal works.

## 9. Environment secrets

Production `.env` is created on server/deployment secret store, never committed.

Minimum categories:

```text
DATABASE_URL
PUBLIC_WEB_ORIGIN
PUBLIC_API_URL
SESSION/JWT secrets
password pepper if used
SMTP settings
backup credentials
logging/telemetry settings
```

## 10. Database initialization

On first deploy:

1. start PostgreSQL only;
2. verify version/storage;
3. run schema migrations using release image;
4. run migration verification;
5. create initial admin/business only through controlled bootstrap command/tool;
6. start API;
7. verify readiness;
8. start worker/web.

## 11. Release deploy process

Recommended:

```text
CI builds image tagged by Git SHA
        ↓
push to GHCR/private registry
        ↓
server pulls exact SHA
        ↓
backup/checkpoint if schema change warrants
        ↓
run expand-safe migrations
        ↓
start new API container
        ↓
/health/ready
        ↓
switch/reload proxy if blue-green used
        ↓
run smoke tests
        ↓
start/update worker + web
        ↓
record deployed SHA
```

Never deploy `latest` without recording immutable SHA/digest.

## 12. Zero/minimal downtime

For initial scale, the simplest safe model is:

- backward-compatible DB migration;
- start replacement API;
- health check;
- route traffic;
- stop old API.

Breaking migrations require an explicit maintenance window.

## 13. Schema migration rule

Prefer expand/contract:

Release A:

- add new columns/table;
- code can read old/new.

Release B:

- data backfill;
- code writes new.

Release C:

- remove old structure after all clients are compatible.

## 14. Firewall

Example policy:

- allow established;
- allow SSH from trusted source where practical;
- allow 80/443;
- deny PostgreSQL public access;
- default deny inbound.

## 15. Database maintenance

Document:

- automated vacuum settings;
- index maintenance strategy;
- connection pool limit;
- slow query threshold;
- storage growth alerts;
- migration lock behavior.

## 16. Email

Do not run a full mail server on the ServOS VPS unless there is a specific operational reason.

Use a reputable SMTP/provider for:

- invitations;
- password recovery;
- system notifications.

## 17. Staging

Strongly recommended:

```text
serveos-staging.davemusau.co.ke
serveosapi-staging.davemusau.co.ke
```

with a separate staging database and separate secrets.

If the same VPS hosts staging, use separate Compose project/network/volumes and resource limits.

Never point staging at the production database.

## 18. Rollback

Application-only rollback:

- redeploy prior image digest if DB schema is backward compatible.

Database rollback:

- avoid down migrations as primary recovery;
- restore from checkpoint/backup when a destructive migration corrupted state;
- document forward repair when feasible.

## 19. Production smoke test

After every deployment:

- web loads;
- API ready;
- login works;
- session returns correct business;
- read catalog;
- create harmless test command in staging or designated production smoke fixture;
- SSE connects;
- worker heartbeat;
- DB backup freshness;
- no elevated error rate.

For production business data, avoid synthetic financial mutations unless dedicated smoke tenant exists.

## 20. Emergency mode

If API is unavailable:

- do not point clients at PostgreSQL directly;
- Terminal falls back only to its granted offline mode;
- Web displays service unavailable/read cached data as explicitly stale if useful;
- repair API or restore VPS;
- clients reconnect through normal protocol.
