# 29 — Same-VPS Frontend + API Production Topology

## 1. Decision

Both public ServOS endpoints are hosted on the same VPS:

- `https://serveos.davemusau.co.ke` — PWA frontend;
- `https://serveosapi.davemusau.co.ke` — API.

PostgreSQL and workers are private services on the same VPS for the initial production architecture.

This is intentionally simpler than splitting frontend hosting, database hosting and API hosting across several vendors.

## 2. Existing VPS facts from the pre-reset audit

Observed server baseline:

- Ubuntu 24.04 LTS family;
- 4 vCPU;
- approximately 7.8 GiB RAM;
- approximately 142 GB root storage with substantial free capacity at audit time;
- Docker already installed and in use;
- Nginx already owns public ports 80/443;
- existing applications are bound to localhost 3000/3001;
- existing PostgreSQL/Redis containers belong to other applications and must not be reused by ServOS;
- host-level Node/npm is not required because ServOS will deploy through static assets and containers.

Before production deployment rerun a short resource/port preflight because these values can change.

## 3. Recommended production topology

```text
                         VPS
                          │
                       NGINX
              ┌───────────┴───────────┐
              │                       │
serveos.davemusau.co.ke     serveosapi.davemusau.co.ke
              │                       │
    /var/www/serveos/current     127.0.0.1:3101
       static PWA build                │
                                      API
                                       │
                         private Docker network
                           ┌───────────┴──────────┐
                           │                      │
                       PostgreSQL              Worker
```

## 4. Why serve the frontend directly from Nginx

The production frontend is static after build.

There is no need to keep a Node process alive just to serve Vite output.

Recommended release path:

```text
/var/www/serveos/
  releases/
    <git-sha>/
  current -> releases/<git-sha>
```

Deploy:

1. CI builds frontend;
2. artifact is copied/unpacked to new release directory;
3. verify hashes/manifest;
4. atomically switch `current` symlink;
5. reload Nginx only when config changes.

Rollback is another symlink switch.

## 5. API deployment

API runs in Docker and binds only to loopback, for example:

```text
127.0.0.1:3101 -> api:3000
```

Nginx is the only public ingress.

Do not use ports 3000/3001 on the host because they are already occupied in the audited server.

## 6. PostgreSQL

ServOS gets its own PostgreSQL container/volume/database credentials.

No public `5432` host binding.

Only API/worker/migration containers access it over the private `serveos` Docker network.

Do not share the database instance/container used by unrelated SMS systems merely because it already exists.

## 7. Worker

Worker handles non-interactive jobs such as:

- report generation;
- scheduled backup verification;
- notification jobs;
- cleanup/retention;
- external integration retry where safe;
- future eTIMS/Daraja asynchronous workflows.

Do not put transactional command authority in a queue if the operator requires immediate authoritative confirmation. The API transaction commits first; background jobs follow.

## 8. Redis

Not mandatory for first release.

Prefer PostgreSQL-backed job/advisory-lock mechanisms initially if adequate. Introduce a dedicated ServOS Redis only when measured requirements justify it.

Never borrow an unrelated application's Redis container.

## 9. Nginx sites

Conceptual configuration:

```nginx
server {
  server_name serveos.davemusau.co.ke;
  root /var/www/serveos/current;
  index index.html;

  location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
  }
}

server {
  server_name serveosapi.davemusau.co.ke;

  location / {
    proxy_pass http://127.0.0.1:3101;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Actual production config must include TLS, timeouts, request size policies, SSE buffering rules and security headers.

## 10. TLS

Use Certbot with the existing Nginx deployment model or another centrally managed ACME path already compatible with the server.

Require HTTPS for both origins because:

- PWA installation/service workers require secure context;
- WebCrypto/device identity relies on secure context;
- offline APIs and modern browser storage features are designed around HTTPS;
- local Print Bridge pairing must trust the public origin.

## 11. CORS

API allowlist production origin explicitly:

`https://serveos.davemusau.co.ke`

Do not use wildcard CORS with credentials.

Staging origin is separately allowlisted.

## 12. CSP

Set a restrictive Content Security Policy.

At minimum constrain:

- scripts to same-origin generated assets;
- API connections to `serveosapi.davemusau.co.ke`;
- local print bridge endpoint when enabled;
- image/data/blob sources required for receipt branding carefully;
- no arbitrary remote script/CDN execution in production.

## 13. Production Compose boundary

Suggested containers:

```text
serveos-api
serveos-worker
serveos-postgres
serveos-backup
```

Optional later:

```text
serveos-redis
serveos-observability
```

Frontend is static Nginx content, not necessarily a container.

## 14. Server coexistence rules

The VPS already hosts other workloads. ServOS deployment must:

- use unique container/network/volume names;
- use its own `/opt/serveos` directory;
- avoid existing host ports;
- never run broad `docker system prune -a` during normal deployment;
- never alter unrelated Nginx site files;
- never restart Docker casually during trading/production hours;
- monitor RAM/disk across the whole VPS, not only ServOS containers.

## 15. Disk hygiene

The audit showed significant reclaimable container images/build cache. Cleanup must be selective.

Use image retention scripts based on known unused digests rather than destructive blanket pruning.

Set alerts before root filesystem exhaustion.

## 16. Required preflight before first ServOS deploy

Check:

```text
uname -a
uptime
free -h
df -h
docker ps
docker system df
ss -tulpn
nginx -t
systemctl status nginx docker
```

Also verify any pending kernel/system restart from prior maintenance has been safely completed and unrelated services return healthy after reboot.

## 17. Backup failure domain

Application, API and database may share this VPS initially.

The **only backup copy must not**.

At least one encrypted PostgreSQL backup stream/archive goes to independent storage.

## 18. Scaling path

When measurements justify it, separate in this order:

1. external/offsite backup already exists;
2. database to dedicated VPS/managed PostgreSQL if DB pressure demands it;
3. worker jobs to separate compute if noisy;
4. frontend CDN only if useful;
5. horizontal API replicas behind Nginx/load balancer.

Do not pre-emptively create microservices for a problem the first VPS does not have.
