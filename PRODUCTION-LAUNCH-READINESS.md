# ServOS Production Launch Readiness

**Reviewed:** 8 October 2026 (Africa/Nairobi)  
**Repository:** `davemusau00/SERVEOS-WEB`, branch `reset/vps-platform`  
**Launch intent:** Fresh isolated production business, using `serveos.davemusau.co.ke` and `serveosapi.davemusau.co.ke`; no Countryside data import.  
**Protection rule:** Existing server deployments, Nginx sites, DNS, containers, volumes, and services are protected. The only server changes so far are an additive Let's Encrypt certificate and a new exact-hostname Nginx site for the two ServOS names. The new site still proxies to the same pre-existing `127.0.0.1:3001` upstream those names previously reached. No existing vhost, certificate, DNS record, container, volume, database, or application data was replaced or changed.

## Current decision

**NO-GO for ServOS production deployment or live transactions.** Candidate `25010b707a581d50b0c82823ae926d751775d43a` includes the append-only ledger migration correction and is undergoing its required hosted matrix in run [37814669605](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37814669605). TLS validates for both selected names, but they still serve the previous upstream. Do not switch that upstream to ServOS, start ServOS containers, run production migrations, or initialize an Admin until the full release matrix and the recovery, operational, and cutover gates below pass.

The production domains resolve to `93.127.131.55`. A new ECDSA Let's Encrypt certificate named `serveos-production` covers both names and is valid through 6 January 2027; Certbot renewal dry-run passed. A new exact-hostname Nginx site is enabled and `nginx -t` plus reload passed. HTTPS checks validate, while the PWA hostname still redirects to `/dashboard` and the API health route still returns 404 from the pre-existing upstream. This preserves the previous behavior until ServOS passes its gates. Confirm the currently served application's safe cutover with its owner before changing the upstream.

## Verified read-only facts

| Area | Finding | Deployment consequence |
|---|---|---|
| Candidate source | `25010b707a581d50b0c82823ae926d751775d43a` is the current code candidate; the worktree is clean. Earlier SHA `59b0d20` passed its matrix but predates the final migration immutability correction. | Keep `25010b7` unaccepted until its full required hosted run completes green. |
| Hosted CI | Run [37814669605](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37814669605) tests candidate `25010b707a581d50b0c82823ae926d751775d43a` and is still in progress. API/PostgreSQL, frontend, cloud, native, production and preview browser, and Print Bridge jobs have passed. `desktop-shell` is still in its Linux dependency installation step; Windows printer-shell has passed. | Candidate remains blocked until all required jobs and evidence summary complete green on this SHA. |
| API/PostgreSQL failures resolved | The setup-secret assertion was caused by `initialSetupComplete()` resolving `public.api_staff_profiles` instead of the active isolated schema; it now uses `to_regclass('api_staff_profiles')`. Run `37811416603` exposed a second failure: close-day SQL referenced nonexistent `pos_orders.till_session_id`. New customer-credit charges now store their till attribution, and the close-day report uses it. Migration `070_customer_credit_till_attribution.sql` preserves existing append-only ledger rows. | Legacy credit charges with no verified till attribution deliberately block close-day reporting for manual reconciliation rather than being changed or omitted. |
| Duplicate receipt-key log | The PostgreSQL log also emitted a duplicate `inventory_receipts_business_id_source_key_key` error. `inventory-lifecycle.integration.test.mjs` deliberately submits the same source reference a second time and asserts a durable `DUPLICATE_REFERENCE` conflict; the integration test passes. | This log line is expected conflict coverage, not test-state contamination. |
| Local API suite | Full API/PostgreSQL suite passed serially against a newly created, disposable PostgreSQL database: 28/28, including auth, inventory, POS, revenue, and close-day integration tests. The disposable database was dropped afterward. | Hosted required matrix is the release evidence; local suite is a reproducibility check. |
| VPS identity | SSH read-only access succeeded as `administrator`; host is Ubuntu 24.04.5, hostname `mail.detailskilonzo.com`. | Host is shared with other deployments; use strict isolation and preserve all existing state. |
| Capacity | 4 vCPU, 7.8 GiB RAM, 115 GiB free on `/`, 2 GiB swap. | No resource blocker observed in this snapshot; recheck immediately before deployment. |
| Existing services | Nginx and Docker are active. Existing apps bind localhost ports 3000 and 3001. Nginx has existing enabled sites. | Do not use ports 3000/3001, alter existing site files, restart Docker, or reuse any volume/network/database. Port 3101 appeared free during this read-only check; recheck at deployment time. |
| Firewall | UFW reported inactive. | Before exposing or changing anything, review provider firewall and host nftables/iptables policy with the VPS owner. Do not modify global firewall policy as part of ServOS setup. |
| Domain routing and TLS | Both names resolve to this VPS. HTTPS validates against the new `serveos-production` certificate. The new exact-hostname vhost proxies to the same prior `127.0.0.1:3001` backend; API health is not yet ServOS. Renewal dry-run passed. | TLS is ready. Keep the current upstream until the release and owner cutover gates pass; verify again immediately before application activation. |
| Nginx | The additive site `/etc/nginx/sites-available/serveos-production` is enabled. `nginx -t`, reload, unrelated-host smoke checks, and Certbot renewal dry-run passed. Existing enabled site files were preserved. | Before cutover, review and back up only the new vhost and prepare its rollback to the existing upstream. |
| Backups | Off-VPS destination, credentials, encryption identity custody, scheduled job, and restore evidence have not been supplied or verified. | No production migrations or real transactions before verified off-host backup and isolated restore rehearsal. |

## Production topology and isolation requirements

- Serve static PWA files from a versioned release directory; activate with the repository's manifest-verifying atomic release script.
- Run API and worker in a dedicated Docker Compose project `serveos-prod`, on a uniquely named private network and volume. Keep PostgreSQL unbound from host ports; bind the API only to a verified free loopback port (3101 is a candidate, not a reservation).
- Pin PostgreSQL 16 only after the chosen candidate's integration matrix passes on PostgreSQL 16. Pin the built API by immutable image digest in the release record; retain the full source SHA as the image tag/label.
- Keep production environment configuration outside Git and all web roots with owner-only permissions. `WEB_ORIGIN=https://serveos.davemusau.co.ke`, `NODE_ENV=production`; frontend public build config uses `VITE_API_URL=https://serveosapi.davemusau.co.ke`, demo/offline toggles disabled. Keep setup secret only for first Admin creation; remove it and restart immediately afterward.
- Create new uniquely named Nginx site files only after explicit domain cutover authorization and conflict review. Do not edit, disable, or replace existing enabled site files. Validate a separate candidate config before activation; reload Nginx only after review and have the previous config/reload procedure ready.
- Do not run `docker compose down`, `down -v`, Docker prune, broad cleanup, global Docker/Nginx restart, or database image upgrades. Do not share existing database containers, volumes, networks, or credentials.
- Keep offline finalization and Print Bridge signing disabled until separate key custody and device acceptance are recorded.

## Ordered execution gates

1. **Release SHA:** In progress. Candidate `25010b707a581d50b0c82823ae926d751775d43a` has passed API/PostgreSQL, browser acceptance, and all completed jobs. Wait for desktop-shell and the complete evidence summary before accepting it; then build the production API and PWA from that exact SHA.
2. **Domain ownership and routing:** Confirm the currently served application can be safely moved/retired by its owner. The new certificate and vhost are additive and preserve its previous upstream; do not switch that upstream until an approved cutover plan exists.
3. **Preflight:** Recheck host identity, ports, Nginx enabled-site inventory, provider and host firewall, storage/inodes/RAM, Docker and Compose versions, and all running containers/volumes. Capture a timestamped inventory. Abort on any ambiguous collision.
4. **Independent recovery:** Configure the real off-VPS encrypted backup destination, prove one backup upload, retrieve and decrypt it with separately protected recovery material away from production, restore to an isolated PostgreSQL instance, and record schema plus representative row/count checks. Document the restore point and rollback owner.
5. **Isolated installation:** From the accepted SHA, create only new `/opt/serveos` production configuration and release paths, a uniquely named project/network/volume, and a loopback API binding on a rechecked free port. Start only the new PostgreSQL service, verify health, and apply migrations from the pinned image after a fresh verified checkpoint. Record migration names and high-water mark.
6. **Application and origins:** Start the new API and worker, verify readiness, then install separately reviewed Nginx site definitions and TLS only after the domain cutover is authorized. Verify certificate names, HTTPS origins, API live/ready, service-worker cache behavior, and no exposure of private files or DB/API ports.
7. **Fresh business and rehearsal:** Use the one-time setup endpoint to create the intended business and first Admin. Remove setup secret and restart. Rehearse authentication/device enrollment/session recovery, sale, inventory movement/count, void/refund, applicable room/folio flow, close-day, and reconciliation with no unexplained variance. Keep real trade locked during rehearsal.
8. **Promotion:** Require backup/restore, frontend rollback, API rollback compatibility, monitoring/alerting, named incident owner, and business sign-off. Enable real transactions only after these are evidenced. Otherwise label the instance pilot and keep the live-trade gate closed.

## Release and operational record

Before accepting production, record: full source SHA and branch; hosted CI run and job matrix; API image digest; PWA artifact manifest and SHA-256; PostgreSQL version; migration list/high-water; environment owner/path (never secret values); DNS/TLS evidence; Nginx site names; Compose project/network/volume names; backup object/time and independent restore evidence; tested rollback target; acceptance results; incident owner; and promotion timestamp.

Do not record passwords, setup tokens, private keys, database URLs, session cookies, or private signing JWKs in this document or release logs.

## Not yet evidenced

- Exact fully green release SHA and production API image digest/PWA manifest built from that SHA.
- Domain owner approval and safe reassignment of currently served hostnames.
- ServOS API/PWA activation behind the valid TLS hostnames; currently those hostnames still reach the prior upstream.
- Production backup provider configuration and isolated restore rehearsal.
- Production migrations, fresh business/Admin creation, real-origin browser acceptance, shift rehearsal, monitoring, or rollback rehearsal.
- Physical printer/scanner acceptance and offline signing-key acceptance.

No ServOS production application deployment, production migration, fresh business setup, or live transaction has been performed. The TLS certificate and preserving hostname vhost are active.
