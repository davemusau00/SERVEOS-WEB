# ServOS VPS Deployment Guide

**Repository:** https://github.com/davemusau00/SERVEOS-WEB  
**Branch:** `reset/vps-platform`  
**Server:** `93.127.131.55`  
**SSH username:** `administrator`  
**Authentication:** existing **local SSH private key** (never copy the private key to the VPS or GitHub)  
**Target:** Nginx-hosted ServOS Web/PWA + private Docker PostgreSQL + ServOS Node API and worker  
**Deployment mode:** Fresh isolated production business, with live activation gated on release and operational acceptance. No Countryside import.

> **Status and source basis (8 October 2026):** The procedures below are staging-oriented examples, not production authorization. Current server and release evidence is recorded in [PRODUCTION-LAUNCH-READINESS.md](PRODUCTION-LAUNCH-READINESS.md). Candidate `25010b707a581d50b0c82823ae926d751775d43a` includes the final append-only ledger migration correction; run [37814669605](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37814669605) is still awaiting the desktop-shell job. TLS validates for both production names, and an additive exact-hostname Nginx site still routes to the previous `127.0.0.1:3001` backend. **Do not run staging copy/paste blocks against production.** Build and pin both artifacts from the accepted SHA, and promote only after its full matrix and the remaining recovery and operational gates pass.

---

## 0. Intended topology, assumptions, and decisions

```text
Users / staff browsers (HTTPS)
     |
     +--> serveos.davemusau.co.ke --> Host Nginx --> /var/www/serveos/current (PWA)
     |
     +--> serveosapi.davemusau.co.ke --> Host Nginx --> 127.0.0.1:3101
                                                           |
                                                        ServOS API
                                                           |
                                    private Docker network + PostgreSQL 16
                                                           |
                                                       ServOS worker

Windows receipt printing (later): PWA --> paired local Print Bridge --> thermal printer.
```

Production domain names above reflect the repository examples. For staging, **substitute both** of these consistently with `serveos-staging.davemusau.co.ke` and `serveosapi-staging.davemusau.co.ke`. Staging must use a separate database, separate credentials and separate browser origin from production. Do not use the live Countryside database or overwrite existing sites.

The historical VPS inspection indicated Ubuntu 24.04-family Linux, running Nginx/Docker and other apps on ports `3000`/`3001`. **Recheck all of this**. This guide reserves `127.0.0.1:3101` and does not change existing Nginx sites, Docker volumes or other services. `postgres:16-alpine` is the conservative deployment pin used here because the inspected GitHub CI integration environment used PostgreSQL 16; the repository's older example specifies 17. Test any version change and do not upgrade a persisted PostgreSQL volume by changing the image tag alone.

### Deployment boundaries

- **Do not** deploy legacy Vercel/Supabase code paths as concurrent transactional authorities.
- **Do not** open PostgreSQL port `5432` on the public interface.
- **Do not** issue `docker system prune`, delete existing Docker volumes, change default Nginx sites, or overwrite unrelated applications.
- **Do not** enable offline finalization, live transactions, data cutover or raw receipt printing solely because infrastructure health checks pass.
- **Do** preserve the exact deployed Git SHA, API image identity, PWA release manifest, migration names, and acceptance evidence.
- Commands marked **PowerShell** run on your Windows PC; commands marked **VPS shell** run after SSH login as `administrator` and use `sudo` only where required.

---

## 1. SSH from Windows with your existing local key

Open **PowerShell**:

```powershell
$Server = '93.127.131.55'
$SshUser = 'administrator'
$SshKey = Join-Path $env:USERPROFILE '.ssh\id_ed25519'

# Change this path if you use a named key, e.g. C:\Users\Admin\.ssh\serveos_vps
Test-Path $SshKey
Get-ChildItem "$env:USERPROFILE\.ssh" -File | Select-Object Name

ssh -i "$SshKey" -o IdentitiesOnly=yes "${SshUser}@${Server}"
```

If `Test-Path` returns `False`, fix the key path first; do not generate a replacement key if the existing public key is already installed on the VPS. On first connection, compare the SSH host-key fingerprint with a trusted provider/server record before approving it.

To shorten future commands, optionally place this on your **PC** in `$env:USERPROFILE\.ssh\config`:

```sshconfig
Host serveos-vps
    HostName 93.127.131.55
    User administrator
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

Test with `ssh serveos-vps`. The examples below use explicit username/key variables so they work without this alias.

### Permission troubleshooting

- `Permission denied (publickey)`: check username `administrator`, path to private key, and the authorized public key installed for that **same Linux user**. If the key has a passphrase, enter it locally.
- `REMOTE HOST IDENTIFICATION HAS CHANGED`: stop and verify whether the server was rebuilt; do **not** automatically clear `known_hosts` on a production server.
- `sudo: a password is required`: enter the Linux `administrator` account password, or arrange authorized passwordless commands through the VPS administrator. Do not change sudoers casually.
- Check identity on login with `whoami` and `id`.

---

## 2. Non-destructive VPS preflight

Run on the **VPS shell**:

```bash
whoami                           # must print administrator
hostnamectl
cat /etc/os-release
nproc
free -h
df -h
df -i

docker --version || true
docker compose version || true
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
sudo docker system df

sudo nginx -t || true
sudo ss -tulpn
sudo ufw status verbose || true
systemctl --no-pager --full status nginx || true
```

**Stop on collisions:** confirm TCP `3101` is unused and the requested DNS names do not have existing virtual hosts or live tenants. Make a record of existing `docker ps`, `/etc/nginx/sites-enabled`, current DNS and firewall settings. Do not disturb ports `3000`, `3001`, `80` or `443` already serving other applications. Ensure RAM, disk, inodes and swap are adequate for database + API + build artifacts.

Install missing ordinary packages only; **do not reinstall working Docker or Nginx**:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates jq openssl nginx certbot python3-certbot-nginx
```

You must already have a working Docker Engine and Docker Compose plugin before continuing. For a production build server, Node 22 is required only for **building the PWA locally/CI**; the API's Docker image installs Node 22 within the container.

---

## 3. Decide staging versus production URLs before generating files

| Variable | Production | Recommended staging |
|---|---|---|
| `WEB_HOST` | `serveos.davemusau.co.ke` | `serveos-staging.davemusau.co.ke` |
| `API_HOST` | `serveosapi.davemusau.co.ke` | `serveosapi-staging.davemusau.co.ke` |
| `NODE_ENV` | `production` | `staging` |
| Docker project / DB | `serveos-prod` / separate DB | `serveos-stage` / separate DB |

**This runbook's copy/paste blocks default to STAGING**. At production promotion, substitute the production pair everywhere and use different Compose project, filesystem, secrets, ports and data volumes if both environments run on the same VPS. Otherwise staging can collide with production. The illustrative `/opt/serveos`, `/var/www/serveos` layout below is for **one isolated environment**. For simultaneous stage + production, use `/opt/serveos-staging`, `/var/www/serveos-staging`, and a distinct loopback port, e.g. `3102`, for staging, with adjusted Nginx/Compose paths and names.

On the DNS provider, add these staging records (for the default path):

```text
serveos-staging      A    93.127.131.55
serveosapi-staging   A    93.127.131.55
```

Check on the VPS:

```bash
getent ahostsv4 serveos-staging.davemusau.co.ke
getent ahostsv4 serveosapi-staging.davemusau.co.ke
```

Both should resolve to `93.127.131.55` before requesting certificates. Do not point the PWA at bare HTTP/IP for business use: the API browser client expects HTTPS except localhost.

---

## 4. Clone the precise branch as `administrator`

On the VPS:

```bash
sudo mkdir -p /opt/serveos /var/www/serveos/releases
sudo chown administrator:administrator /opt/serveos
sudo chown -R administrator:administrator /var/www/serveos
sudo mkdir -p /opt/serveos/env
sudo chmod 700 /opt/serveos/env

cd /opt/serveos
# Only if /opt/serveos/src does not exist:
git clone --branch reset/vps-platform --single-branch \
  https://github.com/davemusau00/SERVEOS-WEB.git src

cd /opt/serveos/src
git fetch origin reset/vps-platform
git checkout --detach 35803cbbcb5e67b656707ea626e64e2d76719f42
git rev-parse HEAD
git status --short
```

Expected SHA:

```text
35803cbbcb5e67b656707ea626e64e2d76719f42
```

If the clone already exists, use `git fetch` and `git checkout --detach <accepted-full-sha>`; **never** `rm -rf` an existing directory without first checking for local configuration/data. App secrets must live outside the Git working tree. The public repository can be cloned with HTTPS; your local SSH key is only for the VPS login, not necessary for GitHub fetching.

---

## 5. Create private environment configuration

The API reads `DATABASE_URL`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`, `DB_POOL_SIZE` and related settings. Use a single absolute env-file path in every Compose command. Compose substitution variables such as `POSTGRES_PASSWORD` and `SERVEOS_VERSION` must be available via `--env-file`, **in addition to** the `api`/`worker` `env_file` container environment.

On the VPS:

```bash
umask 077
openssl rand -hex 32   # Save result as the DB password in your password manager
openssl rand -hex 32   # Save a DIFFERENT result as temporary initial-admin setup secret
nano /opt/serveos/env/staging.env
```

Enter (replace BOTH placeholder secret occurrences consistently):

```dotenv
SERVEOS_VERSION=35803cbbcb5
API_HOST_PORT=3101
POSTGRES_DB=serveos
POSTGRES_USER=serveos
POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_DB_PASSWORD
DATABASE_URL=postgresql://serveos:REPLACE_WITH_RANDOM_DB_PASSWORD@postgres:5432/serveos

NODE_ENV=staging
PORT=3000
HOST=0.0.0.0
WEB_ORIGIN=https://serveos-staging.davemusau.co.ke
LOG_LEVEL=info
DB_POOL_SIZE=10
WORKER_DB_POOL_SIZE=5

# Remove this after first-admin setup and restart the API container.
INITIAL_ADMIN_SETUP_SECRET=REPLACE_WITH_DIFFERENT_RANDOM_SECRET

# Do not enable offline grants / printer bridge until verified signing keys exist.
OFFLINE_GRANT_KEY_VERSION=offline-2026-10
OFFLINE_GRANT_PRIVATE_JWK=
PRINT_BRIDGE_KEY_VERSION=
PRINT_BRIDGE_PRIVATE_JWK=
```

```bash
chmod 600 /opt/serveos/env/staging.env
```

Do not place this file under `/var/www/serveos`, `src/`, a publicly served path, or Git. `VITE_*` variables are **public build-time values**; never put DB passwords, offline private JWKs, service tokens or initial admin secrets in them.

**Credential safety:** The example DB password uses `openssl rand -hex` so the embedded PostgreSQL URL needs no special URL encoding. If you choose a password containing `@`, `/`, `#`, `?` or `%`, URL-encode it in `DATABASE_URL`.

---

## 6. Add isolated Docker Compose services

Create `/opt/serveos/docker-compose.yml`:

```yaml
name: serveos-stage
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks: [serveos_private]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 12

  api:
    image: serveos-api:${SERVEOS_VERSION}
    build:
      context: ./src/apps/api
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: ./env/staging.env
    ports:
      - "127.0.0.1:${API_HOST_PORT:-3101}:3000"
    depends_on:
      postgres:
        condition: service_healthy
    networks: [serveos_private]
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 12

  worker:
    image: serveos-api:${SERVEOS_VERSION}
    command: ["node", "src/worker.mjs"]
    restart: unless-stopped
    env_file: ./env/staging.env
    depends_on:
      api:
        condition: service_healthy
    networks: [serveos_private]

networks:
  serveos_private:
    internal: false

volumes:
  postgres_data:
```

The `worker` exists in source but its inspected job-handler map was still empty. Running the worker is safe for this rehearsal but does **not** prove async business-job functionality. A production Compose deployment should also pin the tested **image digest** rather than rely indefinitely on a mutable local tag.

Validate interpolation without printing secrets to shared logs/screens:

```bash
cd /opt/serveos
sudo docker compose --env-file env/staging.env config --quiet
```

Do not paste a full unredacted `docker compose config` output into tickets or chats because it may expand secrets.

---

## 7. Build API image, start database, apply migrations

On the VPS:

```bash
cd /opt/serveos

sudo docker compose --env-file env/staging.env build api
sudo docker compose --env-file env/staging.env up -d postgres
sudo docker compose --env-file env/staging.env ps
sudo docker compose --env-file env/staging.env logs --tail=80 postgres
```

Only once PostgreSQL is `healthy`:

```bash
sudo docker compose --env-file env/staging.env run --rm --no-deps api npm run migrate
```

`apps/api/src/migrate.mjs` executes numbered SQL migrations in order, under a transaction with an advisory lock, and records applied names in `api_schema_migrations`. The current working tree adds `070_customer_credit_till_attribution.sql` after `069_controlled_csv_import.sql`; production has not applied it. Do not edit old migration history on the deployed DB, and do not treat the health check as proof of every expected migration's effects.

Verify:

```bash
sudo docker compose --env-file env/staging.env exec postgres \
  psql -U serveos -d serveos \
  -c 'SELECT name, applied_at FROM api_schema_migrations ORDER BY name;'

sudo docker compose --env-file env/staging.env exec postgres \
  psql -U serveos -d serveos \
  -c 'SELECT count(*) AS applied_migrations FROM api_schema_migrations;'
```

If migration fails, stop. Preserve the error logs and inspect schema state before retrying; never use `down -v` as a quick fix on a database that might contain real data.

---

## 8. Start the API and worker; check their health

```bash
cd /opt/serveos
sudo docker compose --env-file env/staging.env up -d api worker
sudo docker compose --env-file env/staging.env ps
sudo docker compose --env-file env/staging.env logs --tail=120 api
sudo docker compose --env-file env/staging.env logs --tail=100 worker

curl -fsS http://127.0.0.1:3101/health/live
curl -fsS http://127.0.0.1:3101/health/ready
```

Expected responses:

```json
{"status":"ok"}
{"status":"ready"}
```

These endpoints distinguish **process alive** and **DB/migration readiness**. Neither proves user auth, command processing, stock correctness, offline grants, PWA updates or printer acceptance.

---

## 9. Configure host Nginx without touching existing websites

Verify DNS first. Create `/etc/nginx/sites-available/serveos-staging` as follows:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name serveos-staging.davemusau.co.ke;

    root /var/www/serveos/current;
    index index.html;

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }
    location = /index.html {
        add_header Cache-Control "no-cache" always;
    }
    location = /sw.js {
        add_header Cache-Control "no-cache" always;
    }
    location = /release-manifest.json {
        add_header Cache-Control "no-cache" always;
    }
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache" always;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name serveosapi-staging.davemusau.co.ke;
    client_max_body_size 2m;

    location /v1/sync/stream {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/serveos-staging \
  /etc/nginx/sites-enabled/serveos-staging
sudo nginx -t && sudo systemctl reload nginx
```

If the symlink already exists, inspect it rather than overwriting. Avoid broad catch-all vhosts and do not delete the default or unrelated Nginx site configs. The `/v1/sync/stream` path requires unbuffered long-lived connections for server-sent notifications; the browser's ordered change pulls remain the authoritative recovery channel.

Once both staging DNS records resolve, issue TLS certificates:

```bash
sudo certbot --nginx \
  -d serveos-staging.davemusau.co.ke \
  -d serveosapi-staging.davemusau.co.ke

sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
curl -fsS https://serveosapi-staging.davemusau.co.ke/health/ready
```

Keep HSTS off until certificates, names and renewal are proven. Firewall public inbound access should be restricted to approved SSH plus TCP 80/443; do not expose TCP 3101 or 5432.

---

## 10. Build the PWA on Windows from the exact same SHA

Open a **new PowerShell on your PC**, not the SSH session. Install/use supported Node.js 22 and Git locally. Clone into a **new directory** so you do not damage earlier work:

```powershell
$RepoRoot = 'C:\Users\Admin\Downloads\SERVEOS-VPS-DEPLOY'

git clone --branch reset/vps-platform --single-branch `
  https://github.com/davemusau00/SERVEOS-WEB.git `
  $RepoRoot

Set-Location $RepoRoot
git fetch origin reset/vps-platform
git checkout --detach 35803cbbcb5e67b656707ea626e64e2d76719f42

git rev-parse HEAD
git status --short
node --version
npm --version
npm ci
```

Create a **public-only** frontend config at `$RepoRoot\.env.production.local`:

```dotenv
VITE_ENABLE_DEMO=false
VITE_ENABLE_WEB_OFFLINE=false
VITE_ENABLE_WEB_V2=false
VITE_API_URL=https://serveosapi-staging.davemusau.co.ke
VITE_APP_ENV=staging
VITE_API_OFFLINE_GRANT_PUBLIC_JWK=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

The inspected source still contains the **legacy Remote Manager** login alongside the newer **ServOS API workspace**. With the settings above, the user must choose **ServOS API workspace** on the login surface. There is currently no guarantee that this source is a fully cleaned single-workspace production shell. The `VITE_ENABLE_WEB_OFFLINE=false` setting is a conservative staging default; signed offline-grant and physical hardware paths require their own acceptance.

Build and package:

```powershell
npm run lint
npm run build
$Version = (git rev-parse --short=12 HEAD).Trim()
$env:SERVEOS_VERSION = $Version
npm run release:pwa:package

Get-ChildItem ".\release\web\$Version"
Test-Path ".\release\web\$Version\index.html"
Test-Path ".\release\web\$Version\sw.js"
Test-Path ".\release\web\$Version\release-manifest.json"
```

`release:pwa:package` requires a clean tracked worktree and creates an immutable artifact plus SHA-256 manifest. A local ignored `.env.production.local` normally does not make the Git worktree dirty. **Never upload the source checkout to the public web root.** Only the release artifact goes into `/var/www/serveos/releases`.

---

## 11. Upload and activate the PWA using `administrator` + local SSH key

From the **Windows PowerShell inside your repo**:

```powershell
$Server = '93.127.131.55'
$SshUser = 'administrator'
$SshKey = Join-Path $env:USERPROFILE '.ssh\id_ed25519'
$Version = (git rev-parse --short=12 HEAD).Trim()

# Copies the packaged artifact directory to /tmp on the VPS.
scp -i "$SshKey" -o IdentitiesOnly=yes -r `
  ".\release\web\$Version" `
  "${SshUser}@${Server}:/tmp/serveos-web-$Version"

# Copies the repository's release verifier/atomic activator.
scp -i "$SshKey" -o IdentitiesOnly=yes `
  ".\TRUTH-DOCS\SERVOS-WEB-FIRST-RESET\infra\vps\activate-web-release.sh" `
  "${SshUser}@${Server}:/tmp/activate-web-release.sh"
```

The `administrator` account needs read access to the uploaded files and **sudo** rights to activate into `/var/www` if it does not own the target. Use an interactive SSH command for sudo; the example below uses `-t` to support a sudo password prompt:

```powershell
ssh -t -i "$SshKey" -o IdentitiesOnly=yes `
  "${SshUser}@${Server}" `
  "sudo sh /tmp/activate-web-release.sh '$Version' '/tmp/serveos-web-$Version'"
```

The repository script validates the release ID, manifest and hash of every file, refuses to overwrite an existing release, and atomically updates `/var/www/serveos/current` symlink. On the VPS:

```bash
readlink -f /var/www/serveos/current
ls -la /var/www/serveos/current
curl -I https://serveos-staging.davemusau.co.ke/
curl -I https://serveos-staging.davemusau.co.ke/sw.js
curl -I https://serveos-staging.davemusau.co.ke/release-manifest.json
```

Expected: successful HTTP response, service worker served without immutable caching, and `current` pointing to `/var/www/serveos/releases/<12-character-sha>`.

---

## 12. One-time initial Admin setup (securely)

The inspected API implements `POST /v1/setup/initial-admin`, which requires the server-only `INITIAL_ADMIN_SETUP_SECRET`, two UUIDs, business/staff names, login and a strong password. **Do not place setup credentials into a public source file or browser build.** First verify HTTPS and the readiness endpoint.

From **Windows PowerShell**:

```powershell
$BusinessId = [guid]::NewGuid().ToString()
$StaffId = [guid]::NewGuid().ToString()
$SetupSecret = Read-Host 'Initial Admin setup secret' -AsSecureString
$AdminPassword = Read-Host 'Initial Admin password' -AsSecureString

# Convert secrets only immediately before the HTTPS request, then clear variables.
$SecretPlain = [System.Net.NetworkCredential]::new('', $SetupSecret).Password
$PasswordPlain = [System.Net.NetworkCredential]::new('', $AdminPassword).Password

$Body = @{
    businessId = $BusinessId
    staffId = $StaffId
    businessName = 'ServOS Staging'
    displayName = 'Initial Administrator'
    loginName = 'admin'
    password = $PasswordPlain
} | ConvertTo-Json

try {
    Invoke-RestMethod -Method Post `
      -Uri 'https://serveosapi-staging.davemusau.co.ke/v1/setup/initial-admin' `
      -Headers @{ 'x-serveos-setup-secret' = $SecretPlain } `
      -ContentType 'application/json' `
      -Body $Body
}
finally {
    Remove-Variable SecretPlain, PasswordPlain, Body -ErrorAction SilentlyContinue
}
```

**Immediately remove** `INITIAL_ADMIN_SETUP_SECRET` from `/opt/serveos/env/staging.env`, restrict env-file permissions, and recreate the API/worker containers to ensure the removed variable is no longer in the container environment:

```bash
nano /opt/serveos/env/staging.env
# Remove INITIAL_ADMIN_SETUP_SECRET=... entirely; save the file.
cd /opt/serveos
sudo docker compose --env-file env/staging.env up -d --force-recreate api worker
curl -fsS https://serveosapi-staging.davemusau.co.ke/health/ready
```

The API also checks whether initial setup is already complete and retires its setup secret at startup. Removing it from the deployed configuration is still mandatory defense in depth. Record the generated business and staff UUIDs securely; do not post passwords or secrets in logs.

---

## 13. Browser / PWA / API acceptance after deployment

Open `https://serveos-staging.davemusau.co.ke` and choose **ServOS API workspace**. Confirm login, required password change, device enrollment/challenge, logout, and session recovery.

### Technical checklist

- [ ] Both DNS names resolve to `93.127.131.55`.
- [ ] Both names have valid HTTPS certificates and renewal dry-run succeeds.
- [ ] `GET /health/live` and `/health/ready` return 200 through Nginx.
- [ ] `docker compose ps` shows PostgreSQL, API and worker in expected states.
- [ ] All numbered migration files expected at this SHA are recorded in `api_schema_migrations`.
- [ ] Database is reachable only via private Docker networking; API only binds host loopback `127.0.0.1:3101`.
- [ ] No existing Nginx site/port/container was altered or broken.
- [ ] PWA `index.html`, `sw.js`, static assets and release manifest load; no broken lazy chunks on reload.
- [ ] Login, password-change, Admin session and device enrollment work with the new API.
- [ ] A harmless test operation is confirmed and appears through API change sync, without duplicate effects after replay.
- [ ] Unauthorized/expired sessions fail safely and refresh works on deployed HTTPS origins.
- [ ] Offline grants are **not** silently enabled or assumed; terminal/browser offline acceptance remains separate.
- [ ] At least one tested PostgreSQL dump exists **outside** the VPS and has passed isolated restore.
- [ ] No sensitive environment file, database credential or API secret is served by Nginx.

### Shell-based probes on the VPS

```bash
cd /opt/serveos
sudo docker compose --env-file env/staging.env ps
sudo docker compose --env-file env/staging.env logs --tail=100 api
sudo docker compose --env-file env/staging.env logs --tail=100 postgres

curl -fsS https://serveosapi-staging.davemusau.co.ke/health/live
curl -fsS https://serveosapi-staging.davemusau.co.ke/health/ready
curl -I https://serveos-staging.davemusau.co.ke/
curl -I https://serveos-staging.davemusau.co.ke/sw.js
sudo ss -tulpn | grep -E ':3101|:5432|:80 |:443 ' || true
sudo nginx -t
```

Do not claim physical XP-80T printing, scanner operation, business data import, signed offline finalization, live shift completion, durable backup/restore, or production cutover until separately evidenced. For a real hospitality installation, exercise complete sale-to-receipt, stock count, room stay/folio, void/refund, internet loss/restart/reconnect and close-day behavior.

---

## 14. Encrypted **off-VPS** backups and restore rehearsal

The repository provides `apps/backup/backup.sh` and a Dockerfile which pipe `pg_dump --format=custom` into `age` encryption, then upload using `rclone`. Its older Compose example defines a backup service behind a manual profile. **The minimal Compose file in this guide deliberately does not start that container until an off-VPS destination and encryption keys are configured.** Do not invent fake cloud credentials or store your only backup on the same VPS.

For production, incorporate the upstream backup service (adapt its `build.context` to `./src/apps/backup`) and configure:

```dotenv
AGE_RECIPIENT=age1...REAL_PUBLIC_RECIPIENT...
BACKUP_REMOTE=backup:serveos/database
BACKUP_RETENTION_DAYS=180
# Required RCLONE_CONFIG_<REMOTE>_* variables for your off-VPS provider.
```

Then execute the manual backup profile with your reviewed Compose definition:

```bash
sudo docker compose --env-file env/staging.env --profile manual-backup run --rm backup
```

**Required follow-up:** download one encrypted backup using separately protected `age` identity, decrypt it *away from production*, restore to an isolated PostgreSQL instance, and compare migration count plus representative business rows/totals. A successful upload is not a successful restore. Schedule encrypted backups and retention only after this test works. Never run destructive restore commands against the live DB to test recovery.

---

## 15. Updates and version discipline

1. Pick an exact **green** `reset/vps-platform` SHA from GitHub Actions.
2. In the VPS source checkout: `git fetch`, `git checkout --detach <full SHA>`.
3. Capture a DB checkpoint and migration list before schema changes.
4. Build the API image with a versioned tag and record its image ID/digest.
5. Apply **compatible** migrations. Stop on failure.
6. Recreate API/worker and verify readiness and business smoke tests.
7. Build the PWA from the **same SHA** on a controlled Windows/Linux build host with the matching public API origin.
8. Run `npm run release:pwa:package`, SCP the artifact as `administrator`, activate it using the SHA and verified manifest.
9. Exercise login, command lifecycle, SSE/pull resync and PWA refresh/update safety.
10. Record which SHA, migrations, DB backup and acceptance cases were deployed.

Example VPS source update (does **not** automatically deploy):

```bash
cd /opt/serveos/src
git fetch origin reset/vps-platform
git checkout --detach <FULL_ACCEPTED_GIT_SHA>
git rev-parse HEAD
```

Never use an unreviewed `git pull` directly in an active production checkout as the entire release process.

---

## 16. Rollback and incident recovery

### Frontend-only rollback

Find known, hash-verified releases on VPS:

```bash
ls -1 /var/www/serveos/releases
readlink -f /var/www/serveos/current
```

Activate an **already installed** older build:

```bash
sudo sh /tmp/activate-web-release.sh <PREVIOUS_RELEASE_SHA>
```

The `activate-web-release.sh` script refuses an invalid or incomplete manifest. If `/tmp/activate-web-release.sh` has been removed, copy it again from the **pinned repository** before rollback.

### API rollback

A prior API image may be restarted only if the PostgreSQL schema remains backward-compatible. With a previously built image tagged `serveos-api:<OLD_SHA>`, first edit `SERVEOS_VERSION` in the env file to that exact tag, then:

```bash
cd /opt/serveos
sudo docker compose --env-file env/staging.env up -d --no-build api worker
curl -fsS https://serveosapi-staging.davemusau.co.ke/health/ready
```

**Do not** assume a reverse migration exists. If the schema changed incompatibly, stop transactions, assess forward-fix versus coordinated database restore, and use a tested off-VPS backup with a documented recovery window.

### Evidence for diagnosis

```bash
cd /opt/serveos
sudo docker compose --env-file env/staging.env ps
sudo docker compose --env-file env/staging.env logs --since=30m --tail=200 api
sudo docker compose --env-file env/staging.env logs --since=30m --tail=200 postgres
sudo nginx -t
sudo journalctl -u nginx --since '30 minutes ago' --no-pager
free -h
df -h
```

Redact request tokens, cookies, password fields and business personal data before sharing logs.

---

## 17. Common faults and exact checks

| Symptom | Likely area | First check |
|---|---|---|
| SSH key denied | Wrong username/path/authorized key | `ssh -vv -i <key> administrator@93.127.131.55` (never share private key or debug token material) |
| `sudo` denied | VPS privilege policy | `id; sudo -l` |
| Docker bind port already allocated | Another app on 3101 | `sudo ss -tulpn \| grep 3101` |
| API exits on boot | Invalid `DATABASE_URL`, `WEB_ORIGIN`, migration | `docker compose logs api` |
| Migration fails | SQL mismatch or existing schema conflict | review migration error + `api_schema_migrations` |
| `/health/live` 200 but `/ready` fails | Database unreachable or schema not installed | database health + migration list |
| Nginx 502 | API not ready or wrong port | `curl http://127.0.0.1:3101/health/live` |
| Certbot fails | DNS/firewall/vhost conflict | `getent ahostsv4`, ports 80/443, `nginx -t` |
| Browser cannot authenticate | Wrong API origin, credentials, CORS, device enrollment | inspect browser network and `WEB_ORIGIN` |
| Old Remote Manager instead of API workspace | Legacy shell still coexists | choose **ServOS API workspace**; confirm build `VITE_API_URL` |
| PWA loads old chunks | Service worker/cache release transition | confirm `sw.js` and `index.html` no-cache; inspect release manifest |
| Blank PWA after deployment | Wrong built API URL or missing assets | `curl -I` for assets and browser console |
| Printer unavailable | Optional Print Bridge not installed/paired | follow separate Print Bridge installation and physical paper test |
| Backup job succeeds but restore fails | Missing age identity or incomplete remote object | isolated restore test before launch |

---

## 18. First-live-business production cutover checklist

**These are release gates, not automatically completed steps.** Before allowing real trading:

- [ ] Exact tested SHA has **all required CI jobs green**, including `api-postgres` and real PWA/API/PostgreSQL browser acceptance.
- [ ] Staging behavior matches approved operation and role contracts.
- [ ] Previous business authority (legacy SQLite/Supabase) has been checkpointed and frozen under a written, one-time verified migration plan, not synchronized concurrently into a second writer.
- [ ] Source/destination inventory counts, open bills, customer balances, folios, staff and opening balances reconcile with **zero unexplained differences**.
- [ ] Off-VPS encrypted backup and independent restore rehearsal passed.
- [ ] Production HTTPS, cookie, CORS, browser, PWA and service-worker behavior passed on real origins/devices.
- [ ] Printer bridge physically prints required 80mm documents, logo and M-Pesa QR when required, with correct margins, retry/reprint/recovery.
- [ ] Barcode scanner input, actual device dimensions, till/day closure and role restrictions passed on target equipment.
- [ ] Offline grant issuance/expiry, disconnected operations, browser restart, conflict/replay and reconciliation passed where offline is promised.
- [ ] A complete supervised business-shift rehearsal passed before unlocking live trade.
- [ ] Old writer is fenced before enabling the new sole transactional authority.
- [ ] Cutover is signed off and a clear incident contact/rollback owner is assigned.

Until all applicable gates close, label the installation **staging** or **pilot** rather than production-ready.

---

## 19. Repository links and technical references

- Branch: https://github.com/davemusau00/SERVEOS-WEB/tree/reset/vps-platform
- Exact reviewed commit: https://github.com/davemusau00/SERVEOS-WEB/commit/35803cbbcb5e67b656707ea626e64e2d76719f42
- Deployment runbook: `TRUTH-DOCS/SERVOS-WEB-FIRST-RESET/docs/12-VPS-DEPLOYMENT-RUNBOOK.md`
- Same-VPS topology: `TRUTH-DOCS/SERVOS-WEB-FIRST-RESET/docs/29-SAME-VPS-PRODUCTION-TOPOLOGY.md`
- Environment examples: `apps/api/.env.example`, `TRUTH-DOCS/SERVOS-WEB-FIRST-RESET/infra/.env.example`
- API migration tool: `apps/api/src/migrate.mjs`
- API server/health: `apps/api/src/server.mjs`
- API Dockerfile: `apps/api/Dockerfile`
- PWA packager: `scripts/package-pwa-release.mjs`
- Release activator: `TRUTH-DOCS/SERVOS-WEB-FIRST-RESET/infra/vps/activate-web-release.sh`
- Nginx example: `TRUTH-DOCS/SERVOS-WEB-FIRST-RESET/infra/nginx/serveos.conf.example`
- Print Bridge: `apps/print-bridge/README.md`
- Encrypted backup process: `apps/backup/backup.sh`
- CI: `.github/workflows/ci.yml`

**Owner note:** `administrator` is the correct VPS SSH user throughout this guide. The VPS was **not remotely accessed or modified** while this document was prepared.
