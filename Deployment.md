# SERVEOS V2: isolated fresh VPS redeployment

> **Codex execution runbook | 12 October 2026 | Status: READY FOR CONTROLLED PREPARATION, NOT AUTHORIZED FOR LIVE CUTOVER**
>
> **Mission:** Replace the SERVEOS API, PWA and (if appropriate) PostgreSQL runtime on the existing shared VPS with a freshly built, independently staged stack. **Do not disturb any non-SERVEOS deployment.** Preserve existing SERVEOS business data and unresolved offline evidence unless the operator explicitly approves an empty-business reset. Do not infer production readiness from unit tests alone.

## 0. Direct instructions to Codex

You are the implementation and deployment agent for SERVEOS. Read this document first and maintain a deployment evidence log, e.g. `docs/deployment-evidence/2026-10-12.md` (omit secrets). Follow the gates in order; do not improvise around a failed check. You may inspect, prepare artifacts, run disposable local tests, create **new** isolated SERVEOS resources, and rehearse restoration. **Stop for explicit operator approval immediately before changing live SERVEOS routes, stopping any production writer, discarding production data or removing old resources.** Never claim a stage has passed until the command result proves it.

- **Local authoritative checkout:** `C:\Users\Admin\Downloads\SERVEOS-RESET`, branch `feat/pos2-cashier-tickets-offline`. The local working tree contains/has contained the A–F implementation patch and two browser-test corrections. **Never deploy `git clone` of a remote branch in place of the validated local changes.** Inspect the current branch, `git status --short`, diff, untracked files, and effective source first.
- **Known server:** `administrator@93.127.131.55`, machine name observed `mail.detailskilonzo.com`. Confirm SSH host identity and that it remains the intended target. Use existing SSH keys/privileged access; do not request or print secrets.
- **Isolated deployment root:** `/opt/serveos-replacement` (new Compose project `serveos-replacement`). Candidate API host bind `127.0.0.1:3104:3000`, **only after fresh port inspection**. Candidate immutable PWA releases `/var/www/serveos-replacement/releases/<release-id>` and symlink `/var/www/serveos-replacement/current`.
- **Live SERVEOS routes only:** `serveos.davemusau.co.ke` (PWA), `serveosapi.davemusau.co.ke` (API). The site file was `/etc/nginx/sites-available/serveos-production` with enabled symlink `/etc/nginx/sites-enabled/serveos-production`. Confirm again before editing.
- **Non-SERVEOS protected applications:** `detailskilonzo.com`, `sms.detailskilonzo.com`, `africa.detailskilonzo.com`, all related Docker Compose projects, PostgreSQL/Redis volumes, Nginx sites, TLS certificates and mail/services on the shared VPS.
- **Deployment type:** new, isolated infrastructure. **Default data policy is preserve and migrate live SERVEOS records**, not erase them. If the user wants a completely empty business, treat that as a separate irreversible business-data decision; stop for an explicit choice and record it. Never silently import old records, silently discard them, or fabricate migration success.

### Absolute prohibitions

Do **not** run `docker system prune --volumes`, `docker volume prune`, `docker compose down -v`, global `docker stop`, broad `docker rm`, `docker network prune`, `rm -rf /var/www`, `rm -rf /etc/nginx`, shared certificate operations, global firewall changes, or host-wide Docker/Nginx/PostgreSQL resets. Do not touch Compose files or volumes owned by `sms-platform`, `sms-platform-africa`, Details Kilonzo or mail. Do not clear terminal IndexedDB, service-worker caches, offline cash queues or print evidence to make tests pass. Do not edit already-applied SQL migration contents or disable checksum verification, permission checks, CORS checks, replay/idempotency checks or offline-grant signature verification. Never put passwords, DATABASE_URL values, private signing JWKs, SSH keys or full production `.env` files in chat, commits, traces or reports.

## 1. Known VPS baseline (observed 2026-10-12; **not** a substitute for fresh preflight)

| Item | Observed state |
|---|---|
| VPS capacity | 7.8 GiB RAM, 5.9 GiB available; 142 GB filesystem, 111 GB free |
| Live POS2 API | `serveos-pos2-canary-api`, host loopback `3103`, image `serveos-pos2-api:ce59c2b2caeb-canonical` |
| Retained ServeOS API | Compose `serveos-next`, `serveos-next-api-1`, `3102`, own PostgreSQL |
| Legacy ServeOS | Compose `serveos-prod`, API `3101`, worker, own PostgreSQL |
| Existing ServeOS stage | Compose `serveos-stage-pos2`, API `3202`, web `3203`, own PostgreSQL |
| Active PWA | `/var/www/serveos-next/current` -> `/var/www/serveos-next/releases/ce59c2b2caeb` |
| SERVEOS Nginx | `serveos-production`, SHA-256 then `7d2d20b2adc5cccd4cef31cb40bb404601d88718e9bcd4170874b5480fb85446`; API upstream `3103` |
| Suggested new ports | `3104` and `3105` had no listeners at inspection |
| Unrelated Compose projects | `sms-platform`, `sms-platform-africa`; existing service health preserved |
| HTTPS preflight | Details 200, SMS 307, Africa SMS 307, SERVEOS PWA 200, API readiness 200; TLS verification result 0 |

The old POS2 deployment record is `docs/releases/pos2-20261012-update.md`. **It documents offline cash and asymmetric rollback risk:** the older API on `3102` may not decode V2 offline cash. Do not assume that reverting upstream to `3102` is safe after V2 sales or after new-database writes. Find the actual **database backing the live `3103` API** from restricted runtime configuration without logging its credentials. Do not guess it is any particular PostgreSQL container.

## 2. Evidence gates: local source, tests and release identity

Run in Windows PowerShell at `C:\Users\Admin\Downloads\SERVEOS-RESET`:

```powershell
cd 'C:\Users\Admin\Downloads\SERVEOS-RESET'
git branch --show-current
git status --short
git diff --check
git rev-parse HEAD
$env:TEST_DATABASE_URL = 'postgres://serveos:serveos_ci@127.0.0.1:55432/serveos_api_test'  # disposable local Docker PostgreSQL ONLY
npm run verify:release
if ($LASTEXITCODE -ne 0) { throw 'Release gate failed: do not stage this candidate.' }
```

**Available evidence so far:** 51/51 root tests, 44/44 PostgreSQL API tests, 3/3 desktop real-API tests and 3/3 mobile real-API tests have passed in separate runs. **`npm run verify:release` has not yet been shown as a complete success** after those browser corrections; require its full successful exit, including production-browser acceptance, UI audit and docs. Fail/skip must be reported, never suppressed. Also run/check API image/contract verification and the Print Bridge gates if that deliverable is in scope; the Rust/Windows physical thermal-printer proof is **not** implied by browser tests.

The release includes work such as `apps/api/migrations/090_period_coverage_snapshots.sql` and `apps/api/src/completion-reports.mjs`. Verify they are actually in the exact release source, along with imports/routes and UI. Migration `090` is **diagnostic coverage evidence only**, not certified profit-and-loss or financial close.

`npm run release:pwa:package` requires a **clean committed worktree** and uses a Git commit SHA release ID. Do not bypass it by assigning a misleading SHA to a dirty tree. Before packaging, show the operator the full intended diff (including untracked patch files and test changes), exclude secrets/logs/generated transient artifacts, and make a reviewable release commit/branch once approved. If an agent lacks permission to commit, stop and present the files needing inclusion. Capture release commit, file manifest and hashes in the evidence log.

**Canonical SQL-byte requirement:** earlier production deployment observed CRLF differences on Windows that caused migration-checksum failure. Produce the API build context from the exact committed Git blob bytes, e.g. `git -c core.autocrlf=false archive --format=tar HEAD` extracted without newline transformations, rather than an uncontrolled Windows working tree. Validate that image migration hashes match the repository manifest; never “fix” a mismatch by changing applied SQL or database hashes.

## 3. Fresh read-only shared-VPS survey

The previous kit is at `C:\Users\Admin\Downloads\SERVEOS_REDEPLOY_WORK\SERVEOS_SAFE_REDEPLOY`; alternatively use the corrected package `SERVEOS_SAFE_REDEPLOY_STARTER_FIXED_v2.zip`. Run `00-Windows-preflight.ps1` after confirming the SSH target. It normalizes CRLF for Linux and produces an inventory log. On the VPS, independently check:

```bash
hostname; date -u; uptime; free -h; df -h / /var/lib/docker
sudo -n docker compose ls --all
sudo -n docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}'
sudo -n docker volume ls
sudo -n ss -ltnp | grep -E ':(80|443|3000|3001|3101|3102|3103|3104|3105|3202|3203)\b' || true
sudo -n nginx -t
readlink -f /var/www/serveos-next/current
sudo -n sha256sum /etc/nginx/sites-available/serveos-production
```

Do not dump full `docker inspect` environment/config or Nginx TLS key contents into logs. Confirm port `3104` is free and the existing Nginx `server_name`, `root` and `proxy_pass` blocks point where expected. Capture baseline hashes, current image digests, Compose project names, owned volumes, image migration head/readiness, POS terminal status and protected-host status. Use **local Nginx TLS resolution**, not unverified public DNS:

```bash
for pair in 'detailskilonzo.com /' 'sms.detailskilonzo.com /' 'africa.detailskilonzo.com /' 'serveos.davemusau.co.ke /' 'serveosapi.davemusau.co.ke /health/ready'; do
  set -- $pair
  curl --silent --show-error --output /dev/null --write-out "$1 $2 HTTP=%{http_code} TLS=%{ssl_verify_result}\n" --resolve "$1:443:127.0.0.1" "https://$1$2" || exit 1
done
```

HTTP 307 for SMS sign-in is an acceptable *baseline response*, not proof of end-to-end SMS operations. Treat any pre-existing failure, unexpected Nginx change, unavailable capacity, port collision or unrecognized container/data mount as a **STOP**. Do not reuse `3101`, `3102`, `3103`, `3202` or other app ports.

## 4. Production data, live writes and offline POS protection

1. Map `3103` -> actual live API container -> network -> **actual production database and volume**, based on verified inspect/config metadata. Also map legacy ServeOS workers, because a background writer may still operate even when it is not the public API. Do not expose environment variables or credentials in console/logs.
2. Inspect authorized business state: orders/payments/refunds, journals, active shifts, reservations/stays/folios, item and bottle stock, inventory movements, API pending/unknown commands, offline signed capabilities, queued print jobs and customer credit. Record counts and financially meaningful totals/fingerprints without personal or secret data. Document precisely which stores/terminals have been reconciled. There were previously live business records; do not erase them by calling this “fresh.”
3. Preserve every terminal's original command IDs and browser IndexedDB/PWA evidence. Resolve `PENDING_SYNC`, `OUTCOME_UNKNOWN`, unconfirmed receipt/print outcomes, offline cash and close-shift issues **before** the final data freeze. Do not clear old service-worker caches while unknown offline money exists.
4. Generate a restricted, dated, custom-format **pg_dump** from the positively identified live SERVEOS database. Include globals/roles/permissions/settings as required for recovery, plus restricted deployment secrets, public/private offline signing key relationships, VAPID material, webhook/payment integrations and existing authorization configuration. **Never** place credentials inside the runbook or evidence log. Store private backups mode `0600` in a directory mode `0700` and export an encrypted off-VPS copy; prove decrypt and SHA-256 round-trip under authorized identity.
5. **Restore** the backup into a different, disposable PostgreSQL database/volume and verify schema migration names/checksums and actual counts, financial totals, cash/till balances, inventory quantities, sealed/open bottle state, hotel folios and pending command status against the source. `apps/backup/rehearse-local.sh` is a limited local verification aid; its totals alone are insufficient for business-wide parity.
6. Create a **final short write-freeze/maintenance window** for SERVEOS specifically, after notifying operators. Finish all terminals and recheck no active/offline/unknown command is stranded. Take the final consistent snapshot. No current and new database may accept concurrent business writes after this point. This may involve brief SERVEOS-only downtime; **do not promise zero downtime**. If a writer cannot be stopped safely, no live database switch.

**Required explicit decision:** Either (A) **retain existing business records** by final backup/restore into the freshly provisioned production database (default), or (B) **start a genuinely empty new business** after explicit written authorization and verified retention of every old record. Option B necessarily loses records from the live operator view and needs fresh admin onboarding, payment/tax configuration, stock master and product import. Codex must not choose B for convenience.

## 5. Build artifacts locally from exactly one validated source

Use the approved release commit from step 2. On a clean branch, build the PWA with environment variables set **at build time**:

```powershell
$env:VITE_API_URL = 'https://serveosapi.davemusau.co.ke'
$env:VITE_APP_ENV = 'production'
# Set VITE_API_OFFLINE_GRANT_PUBLIC_JWK to the verified PUBLIC counterpart
# of the protected API signing key, without emitting the private key.
# Preserve the intentional production setting for VITE_ENABLE_WEB_OFFLINE.
npm ci
npm run build
if ($LASTEXITCODE -ne 0) { throw 'PWA build failed' }
npm run release:pwa:package
if ($LASTEXITCODE -ne 0) { throw 'PWA packaging failed' }
```

Build the API using `apps/api/Dockerfile`, Node 22, `--platform linux/amd64`, from the **canonical committed Git archive**. Use a unique SHA-labelled tag such as `serveos-replacement-api:<release-sha>`. The image must contain the same `apps/api/src`, `apps/api/migrations` and `contracts` as the validated source. Run `node scripts/verify-api-image.mjs` where applicable and record image ID/digest, full migration-manifest/checksum evidence, packaged PWA release manifest and SHA-256. Never label a built image with a Git hash if its source differs. If building on Windows and the VPS lacks BuildKit, `docker save` locally, hash, transfer with `scp`, verify hashes on the VPS, then `docker load`. Do not build from a newer/unreviewed GitHub branch.

Private API environment requires, at minimum, validated `DATABASE_URL`, `NODE_ENV=production`, `WEB_ORIGIN=https://serveos.davemusau.co.ke`, `PORT=3000`, and any retained/approved offline signing/push/payment settings. API signing **private** JWK must match the PWA embedded **public** JWK. `WEB_ORIGIN` must be the exact production PWA origin, not `*`. Never compile secrets into `VITE_*` variables. Do not casually rotate keys across offline devices.

## 6. Create **only new isolated** Docker/PostgreSQL resources

Use the already supplied and separately reviewed `02-isolated-compose.example.yaml` as a **template**, not as an automatically executable production spec. Prepare `/opt/serveos-replacement/compose.yaml`, a restrictive `.env` holding Compose substitutions and a restrictive `api.env` used only by the API. Do not place passwords in shell history. Before any `docker compose up`, run `docker compose -p serveos-replacement -f compose.yaml config --quiet` and verify no published DB port and no shared/external volume name. Record the Compose config **without printing environment secrets**.

Required structure:

- Project: `serveos-replacement` only. New named PostgreSQL 16 volume and new Compose-private network; independent from `serveos-next`, `serveos-prod`, both SMS projects and staging.
- PostgreSQL reachable only inside its network, **no** `5432` host binding. Strong randomly generated database password. Existing production DB untouched.
- New API container uses the validated image, nonroot runtime, `127.0.0.1:3104:3000` loopback bind, correct `WEB_ORIGIN`, health checks and explicit restart policy.
- Resource and disk headroom: ensure combined old+candidate PostgreSQL/API fits actual shared VPS and backups; do not starve other containers. Prefer limits over speculative host tuning.
- Secrets outside source control, owned/permission-restricted. `sudo` only for owned paths. No automatic auto-creation of a public new admin account.

Example **stage-only** actions on the VPS, only after confirming Compose file and image are correct:

```bash
cd /opt/serveos-replacement
sudo docker compose -p serveos-replacement -f compose.yaml up -d db
sudo docker compose -p serveos-replacement -f compose.yaml ps
# The migration must run exactly once against the NEW intended database,
# after restore if existing business data is to be preserved.
sudo docker compose -p serveos-replacement -f compose.yaml run --rm --no-deps api node src/migrate.mjs
sudo docker compose -p serveos-replacement -f compose.yaml up -d api
curl --fail --silent --show-error http://127.0.0.1:3104/health/ready
```

**Ordering matters:** first load the intended data (clean schema for empty mode, or isolated restore for preservation mode), then apply additive migrations and start the API. If the API needs credentials/signing keys/roles from old runtime, configure them securely before enabling writes. `health/ready` must show **zero missing and zero mismatched migration checksums**; compare exact candidate migration manifest, not a hardcoded “090 means complete.” If the restored data has already been migrated beyond the image, **STOP** instead of downgrading. Do not point the `3103` container at the new DB or the new API at the old production DB to “simplify” testing.

## 7. Stage PWA and demonstrate real operator acceptance

Stage immutable PWA release files in `/var/www/serveos-replacement/releases/<release-id>`, validate `release-manifest.json` file paths, bytes and SHA-256, and create a dedicated `current` symlink. Keep old PWA root/symlinks intact. Set the correct index fallback, static asset cache behavior and no-cache policy for `/index.html` and `/sw.js`; preserve relevant headers and TLS. **Never** make new candidate PWA publicly active before release acceptance.

The API requires an exact permitted PWA Origin. For authenticated pre-cutover browser acceptance, Codex must first set up a **controlled staging origin with valid HTTPS** and matching staging API `WEB_ORIGIN`, or an equivalent isolated browser proxy configuration that preserves the intended Origin without weakening CORS. Do not assume an arbitrary `http://127.0.0.1:3105` page can authenticate against a production-Origin-only API. If a safe staging origin is not available, explain the blocker and keep the production route unchanged. Do not open initial-admin setup to the public Internet for testing.

Required staging evidence on the **candidate database**:

- API readiness, migration checksums, least-privilege authentication, onboarding or restored staff sign-in, refresh/session expiry, exact Origin/CORS rejection, device enrollment and permissions.
- POS order -> payment -> original issued receipt -> stock debit -> refund/void -> audit and till close. Reject duplicate/replayed payment; no invented confirmed status.
- Full and selected inventory stock counts, bottle sealed/open and ml conservation, import dry-run, archive/reversal behavior, unit precision.
- Hotel room/type/rate management, reservation conflicts, walk-in/check-in, service/folio charges, settlement and checkout, historical occupancy denominator truthfulness.
- Operational reporting and accounting coverage snapshots (diagnostic only); verify no fabricated historical valuation or period-close authorization.
- Offline V2 device/PIN/grant replay, same-command-ID reconciliation, no duplicate cash/payment/stock consumption, PWA refresh and service-worker safe update boundaries.
- Print queue and 80 mm receipt formatting; actual physical printer/driver/QR proof must be recorded as **not verified** until performed on the actual terminal.
- New API logging/worker behavior and all backup/restore procedures, with authorized sanitization and no leaking PII/secrets.
- Recheck the protected non-SERVEOS sites before and after each risky infrastructure change.

Run `npm run test:browser:api`, `npm run test:browser:production`, `npm run verify:release` against appropriately isolated **disposable local** infrastructure as the full automation gates; hosted candidate smoke tests are **additional** and not interchangeable with those local Playwright tests. Never use real production data for a destructive regression test.

## 8. Guarded SERVEOS-only cutover (**STOP for approval first**)

Cutover may proceed only after: successful local release gate; exact artifacts/hashes; off-VPS backup + restore rehearsal; all affected terminals reconciled; candidate schema/parity/auth acceptance; new API `3104` healthy; candidate PWA verified; no unrelated app regression; named operator approves a maintenance window and data-mode decision.

1. Capture new **immediate pre-switch** inventory: original SERVEOS upstream (`3103` as previously observed), old PWA `current` target, Nginx SHA-256 and backups, public host baseline, image digests, database row-count/financial snapshots, terminal queues. Reconfirm conditions and keep rollback artifacts.
2. Gate old SERVEOS writes only; reconcile pending/offline operations and take the final production-consistent dump under the write freeze. For data preservation, restore the final snapshot into the **designated new production DB** (not an unrelated SMS database), run any unapplied additive migrations, verify all required balances/fingerprints and existing identities. The earlier rehearsal clone is not a substitute for the final snapshot.
3. Keep the two SERVEOS origins in SERVEOS-only maintenance/controlled-traffic state. Do not advertise a successful write until both API and PWA point to a matching release/database. Preserve sessions and local offline evidence; coordinate signed offline grant transition.
4. Back up `/etc/nginx/sites-available/serveos-production` to a restricted, dated file. **Modify only its SERVEOS API upstream references** to `http://127.0.0.1:3104` and its SERVEOS PWA `root` to `/var/www/serveos-replacement/current`, retaining all other paths, security headers, SSL directives, redirects and locations. If any other virtual host is embedded in the file, stop for review. Make the edit surgically; do not regenerate `/etc/nginx/nginx.conf` or reload other Compose projects.
5. `sudo nginx -t` **must pass** before `sudo systemctl reload nginx`. Record Nginx config diff and before/after SHA-256. Reload, not restart. Verify `serveos.davemusau.co.ke` and `serveosapi.davemusau.co.ke/health/ready` over valid HTTPS, exact PWA artifact release and fresh authenticated operator flow, zero unexpected JavaScript errors and correct service-worker deployment.
6. Immediately verify `detailskilonzo.com` HTTP 200, `sms.detailskilonzo.com` HTTP 307 and `africa.detailskilonzo.com` HTTP 307 (or their updated **preflight** expected outcomes), valid TLS, all non-SERVEOS Compose project/container identities and health, SMS login routes, mail/Nginx service continuity and no unrelated changes. Any unrelated regression is a stop-and-recover event.
7. Monitor API errors, database connectivity/migrations, cash/revenue/stock parity, unknown API commands, print queues, offline reconciliation, worker jobs, old browser service workers and all protected hosts throughout the operator-approved observation window. Obtain operator acceptance before announcing the new stack as live.

### Rollback is **data-dependent**, not merely a port flip

- **Before new production writes:** restore the saved SERVEOS Nginx site and old PWA pointer (if modified), `nginx -t`, reload, validate live routes and protected apps. Keep new resources for investigation. Restore original access controls and maintenance status.
- **After any new DB write/offline cash or new signing grant:** **STOP.** Naively pointing traffic back to `3103`/`3102` or the older database can lose/split orders, payments, inventory, folios or V2 offline cash. Only a documented forward-reconciliation or compatibility plan, retaining the decoder and verified new writes, is eligible. Never restore a stale old database on top of new production writes.
- **If other hosted services show regression:** prioritize protecting/restoring the last known-good shared Nginx configuration without touching their databases/containers. Use verified backups, scoped edits and `nginx -t`; report exact impact.

**Do not retire the existing SERVEOS containers, images, volumes, web release trees or signing keys in this deployment.** Their later decommission is a separate project after reconciliation, retained backup verification and written approval.

## 9. Codex deliverables and final report

Produce a concise evidence-backed handover containing:

- Exact tested release commit SHA, branch, worktree state, list of included A–F files, hashes of source archive/API image/PWA manifest, and successful `npm run verify:release` totals (including any skips).
- Before/after Docker Compose project names, containers, ports, volumes, API readiness/migration checksum count, resource use, and **confirmation that protected non-SERVEOS resources were not changed**.
- Backup location/ownership/retention, encryption+off-VPS recovery proof, restore rehearsal comparison, final DB migration/data-mode choice, and operator approval reference. Redact all credentials.
- Before/after SERVEOS Nginx SHA, only-allowed config diff, API and PWA release, TLS and baseline results for five domains.
- Payment/order/stock/till/folio fingerprints and unresolved offline/print items; document any unverified thermal hardware and eTIMS compliance separately.
- Rollback branch for the actual data state, retained old SERVEOS resources, monitoring/incident owner, and any deferred acceptance.

### Codex completion states

Use **one truthful status**: `BLOCKED_PRECHECK`, `LOCAL_RELEASE_VERIFIED`, `STAGED_ISOLATED`, `READY_FOR_APPROVED_CUTOVER`, `CUTOVER_VERIFIED`, or `ROLLED_BACK_WITH_EVIDENCE`. Never say “deployed” based on a successful local test, `docker build`, or `curl /health/ready` alone.

**First action now:** confirm local `npm run verify:release` succeeds, inspect `git status --short` and current candidate migration manifest, then run the corrected read-only VPS preflight again. If those pass, prepare a reviewed exact-source artifact plan and a non-mutating VPS change manifest. Do not switch public routes until the backup/data/terminal and operator-approval gates pass.
