# ServOS Production Deployment and Launch Status

**Reviewed:** 9 October 2026 (Africa/Nairobi)
**Repository:** `davemusau00/SERVEOS-WEB`, branch `reset/vps-platform`  
**State:** ServOS is deployed on the production hostnames as an isolated pilot/rehearsal service. Real business trading has not been approved.
**Business:** Fresh `Country Side resort` tenant; no Countryside data import.

## Deployment record

| Area | Deployed state |
|---|---|
| Release | Source SHA `25010b707a581d50b0c82823ae926d751775d43a`; required CI run [37814669605](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37814669605) completed successfully, including API/PostgreSQL, browser production, desktop-shell, and evidence-summary jobs. |
| Rollout record | Secret-free, root-owned mode-600 record: `/opt/serveos-prod/release/feature-rollout-20261009.txt`. |
| API image | Local image ID `sha256:87b539a1ecc8681566a3ffbac0498043b84cd637626fb5220b5e1798854b9a40`. The release record is on the VPS at `/opt/serveos-prod/release/`. |
| Database | PostgreSQL 16 pinned to `postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d`; separate Compose project `serveos-prod`, private network `serveos_prod_private`, volume `serveos_prod_data`; no host port binding. Migrations: 70, high-water `070_customer_credit_till_attribution.sql`. |
| PWA | Rebuilt from the same SHA with Web V2 and signed offline shell enabled. The bounded offline cash-sale workflow is present; the current tenant has not completed setup for it. Active release directory: `/var/www/serveos-prod/releases/25010b707a581d50b0c82823ae926d751775d43a-webv2-offline-20261009`. Manifest SHA-256: `40427757a7acdd323ac0a5369400d021b58a17aaebccf8a640e8796cd16b2de8`; ZIP SHA-256: `817a3aad44ef72801aceb5a26cca8f468b6a546e273afcdafcd69ad388ef5851`. Previous PWA release remains intact for rollback. |
| Offline / Print Bridge signing | Separate P-256 key pairs were generated. Private JWKs are DPAPI-protected on the deploy workstation and root-only in `/opt/serveos-prod/env/production.env`; API/worker were recreated and API health is green. Key versions: `offline-2026-10-r1`, `bridge-2026-10-r1`. Bounded one-sale offline cash grants are supported; they require a configured outlet/default stock location, cash account, eligible counter product, open device till, and synchronized stock projection. |
| Windows print bundle | Source SHA matches the API/PWA. Windows x64 service and worker binaries built and packaged for Windows 10; bundle ZIP SHA-256: `3837e05df4cd773f37228f57c6b5ed39ad2fe91e39f3027edbc9b9eb19274c46`. No target terminal, printer, scanner, pairing configuration, or trusted local TLS identity was available here, so installation and physical printing remain unverified. |
| Print provisioning template | `approved-config.production-template.json` in the local release folder is prefilled with the fresh business ID, a new bridge ID, production API origin, and the active API public key. It has no approved devices and retains a placeholder for the Windows XP80 queue name; it is not active pairing approval. |
| Environment | Root-owned, mode 600, at `/opt/serveos-prod/env/production.env`, outside Git and web roots. The one-time setup secret was removed and API/worker were recreated after Admin creation. |
| API exposure | API binds only to `127.0.0.1:3101`. PostgreSQL is reachable only on the private Docker network. |
| Origins and TLS | `https://serveos.davemusau.co.ke` serves the PWA; `https://serveosapi.davemusau.co.ke` serves the API. TLS validates, Nginx config test and reload passed, and Certbot staging renewal dry-run passed after adding the HTTP-01 challenge exception. |
| Existing services | Both existing Docker Compose projects remain running on their original ports and volumes. The existing named sites returned the same smoke statuses after activation: `detailskilonzo.com` 200; `africa.detailskilonzo.com` 307; `sms.detailskilonzo.com` 307. Only the dedicated ServOS host vhost was changed. |
| Health and logs | The two-minute systemd timer now runs `/usr/local/sbin/serveos-production-monitor.py`; last run passed. Nginx access logs exclude query strings and headers. External SMTP delivery is not configured pending rotation of the credential disclosed in chat and secure local entry. |
| Rollback | Route-only rollback helper is `/opt/serveos-prod/bin/rollback-host-route.sh`; the route file before this rollout is preserved at `/opt/serveos-prod/release/serveos-production.feature-rollout-20261009-2`. The rollback rehearsal temporarily restored the previous vhost and restored the ServOS vhost, without restarting other apps. Direct local TLS checks after restoration returned PWA 200 and API readiness 200. Prior release directories remain in place. |
| Named owner | Kasina (`kasina@davemusau.co.ke`) is the cutover and incident owner. |

## Database checkpoints

Two VPS-local, mode-600 custom-format PostgreSQL dumps were created and verified with `pg_restore --list`:

- Pre-migration empty database: `/var/backups/serveos-prod/pre-migrations.dump`, SHA-256 `69ae2a2f83c858fa850516f78fb7dac53936d7bf29ad581973c5060906afbb0d`.
- Post-setup, pre-trade checkpoint: `/var/backups/serveos-prod/post-setup-pre-trade.dump`, SHA-256 `65c69ed77c75835502becd1b85539672da677554e339f5b84f72931be972dadb`.

These files are on the same VPS and do not satisfy the independent recovery gate.

## Acceptance completed

- The exact release SHA’s full required GitHub Actions matrix passed.
- Production PWA and API origins returned 200 over certificate-validated HTTPS; API live/ready checks passed.
- Production-origin Chromium check loaded the PWA over validated HTTPS with two login fields and no page errors. The service worker activated, cached all 35 declared shell assets, controlled a reload, and reopened the application shell while the browser network was offline. Business API responses are not cached by this service worker; offline business operation acceptance is separate.
- Initial Admin setup succeeded. API login at the production origin succeeded, returned the required first-password-change state, and the temporary test session was revoked.
- The current POS explains that offline sale setup is incomplete. The local source now adds actionable links to Settings, Catalog, and POS/Till; this UI improvement has built locally but has not been released or accepted by CI.
- The one-time setup secret was removed from the environment file and absent from the recreated API container.
- Docker/API/database isolation, PWA file hashes, migration count/high-water, local checkpoints, Nginx route rollback snapshot, named-site smoke checks, health timer, and TLS renewal dry-run were verified.
- Production origin smoke checks returned PWA 200 and API live/ready 200. Existing named-site status checks returned `detailskilonzo.com` 200, `africa.detailskilonzo.com` 307, and `sms.detailskilonzo.com` 307. The existing `sms-platform` and `sms-platform-africa` Compose projects remained running.
- Route rollback and restoration were rehearsed on the two ServOS hostnames only. Existing services were not stopped or reconfigured.
- Release-scoped browser production suite on the exact source SHA passed 104 tests with 4 skips; API suite passed 21 tests with 7 PostgreSQL skips. Print Bridge compiled on Windows, but hardware acceptance did not occur.

## Live-trade gate: NOT PASSED

The deployment is available for controlled pilot/rehearsal use. Real trading remains blocked until the remaining applicable technical and device gates pass and the cutover owner records approval. The user explicitly waived the independent off-VPS restore and deferred the supervised business shift; these are recorded as skipped/deferred, not passed.

- **Skipped by user:** encrypted backup destination off the VPS and isolated off-host restore rehearsal. VPS-local checkpoints exist; they are not independent disaster recovery.
- **Deferred by user:** supervised fresh-business shift through sale, inventory movement/count, void/refund, rooms/folio if used, and close-day reconciliation. These workflows remain unverified in live conditions.
- Enroll the actual Windows 10 operating device, verify its Admin password-change state, sign-in, device enrollment, and session recovery.
- Configure external email alerts using SMTP STARTTLS at `mail.davemusau.co.ke:587`, mailbox `serveos@davemusau.co.ke`, recipient `kasina@davemusau.co.ke`; first rotate the credential disclosed in chat, then enter its replacement using `scripts/Deploy-ServOSProductionFeatures.ps1 -Mode Alerts` from the local workstation and send a test with `-Mode TestAlert`.
- Install the packaged Print Bridge on the operating Windows 10 terminal, pair it to the enrolled device, trust its local TLS identity, configure the XP80, and verify a real receipt and scanner input. The bundle is currently source-built only on the deploy workstation.
- Complete the offline-sale business setup, synchronize it, and verify signed grant issuance, reconnect reconciliation, and stock/cash correctness on the actual enrolled device. Shell caching alone is not offline transaction acceptance.
- Complete technical cutover/incident handoff to Kasina. The owner is named; external alert delivery is still pending.
- Application and route rollback were rehearsed; record acceptance of the tested release and route targets in the cutover record.

Infrastructure health is not business-workflow acceptance. The API has no global read-only switch in this deployment. Until the remaining required technical/device gates pass, keep this deployment labeled pilot/rehearsal and do not claim full live-production readiness. The user-authorized backup skip and business rehearsal deferral must remain clearly disclosed.

## Protection boundary

The existing applications, their named Nginx sites, containers, databases, volumes, and ports were left running. The only public route changed is the dedicated `serveos.davemusau.co.ke` / `serveosapi.davemusau.co.ke` vhost, which previously fell through to the existing `127.0.0.1:3001` app. Restoring the saved vhost returns those two hostnames to that upstream. No Docker prune, global service restart, firewall change, or existing-data migration was performed.

Never store passwords, setup tokens, private keys, database URLs, session cookies, or private signing JWKs in this record.
