# ServOS Production Launch Readiness

**Reviewed:** 8 October 2026 (Africa/Nairobi)  
**Repository:** `davemusau00/SERVEOS-WEB`, branch `reset/vps-platform`  
**Launch intent:** Fresh isolated production business, using `serveos.davemusau.co.ke` and `serveosapi.davemusau.co.ke`; no Countryside data import.  
**Protection rule:** Existing server deployments, Nginx sites, DNS, containers, volumes, and services are protected. Discovery below was read-only. No server-side files, services, DNS, certificates, or data were changed.

## Current decision

**NO-GO for production deployment or live transactions.** Do not point the selected domains at ServOS, replace their certificates, add Nginx sites, start ServOS containers, run migrations, or initialize an Admin until the domain ownership/routing conflict and release gates below are resolved.

The production domains resolve to `93.127.131.55`, but HTTPS certificate validation fails for both names from the deployment workstation. When certificate verification is bypassed for diagnosis only, the web hostname redirects to `/dashboard`, and the API health URLs return a Next.js 404 page. The VPS Nginx configuration contains no ServOS virtual host. This is evidence that the names currently route to another application or default site. Confirm domain ownership and the intended cutover with the owner of the currently served site before changing DNS or Nginx. Never replace its route or certificate as a deployment shortcut.

## Verified read-only facts

| Area | Finding | Deployment consequence |
|---|---|---|
| Current source | HEAD `ee7c8a255bac9920c7451f7c85c29493d142f082`; dirty `apps/api/tests/pos-lifecycle.integration.test.mjs` remains untouched. | Do not package from this dirty checkout. Pick a committed candidate and build PWA/API from the same full SHA. |
| Hosted CI | Run [37804629553](https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37804629553) is on current HEAD. `api-postgres` failed its API unit/PostgreSQL integration step; browser acceptance passed. Other reported jobs passed, while Windows printer shell was still running at inspection. | No accepted green release SHA. Diagnose and fix the API/PostgreSQL failure, then require a complete green run on one exact SHA. |
| VPS identity | SSH read-only access succeeded as `administrator`; host is Ubuntu 24.04.5, hostname `mail.detailskilonzo.com`. | Host is shared with other deployments; use strict isolation and preserve all existing state. |
| Capacity | 4 vCPU, 7.8 GiB RAM, 115 GiB free on `/`, 2 GiB swap. | No resource blocker observed in this snapshot; recheck immediately before deployment. |
| Existing services | Nginx and Docker are active. Existing apps bind localhost ports 3000 and 3001. Nginx has existing enabled sites. | Do not use ports 3000/3001, alter existing site files, restart Docker, or reuse any volume/network/database. Port 3101 appeared free during this read-only check; recheck at deployment time. |
| Firewall | UFW reported inactive. | Before exposing or changing anything, review provider firewall and host nftables/iptables policy with the VPS owner. Do not modify global firewall policy as part of ServOS setup. |
| Domain routing | Both names resolve to this VPS. Requests return another site's response; TLS hostname validation fails. | Domain ownership and any intentional reassignment must be resolved before configuring production virtual hosts or certificates. |
| Nginx | `nginx -t` passes. | This only validates current configuration; it is not permission to edit/reload it. |
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

1. **Release SHA:** Resolve the hosted `api-postgres` failure. The working tree's local test changes are user work and must not be discarded or silently included. Select a clean committed candidate; require every required CI job green on that exact SHA, including API/PostgreSQL, PWA/API/PostgreSQL browser acceptance, and Windows printer shell.
2. **Domain ownership and routing:** Confirm the two names are authorized for ServOS and that the currently served application can be safely moved/retired by its owner. Preserve its existing site and certificate until an approved cutover plan exists. Confirm a valid certificate can be issued/installed for both names without overwriting unrelated certificate material.
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

- Exact fully green release SHA.
- Domain owner approval and safe reassignment of currently served hostnames.
- Correct production TLS for both hostnames.
- Production backup provider configuration and isolated restore rehearsal.
- Production migrations, fresh business/Admin creation, real-origin browser acceptance, shift rehearsal, monitoring, or rollback rehearsal.
- Physical printer/scanner acceptance and offline signing-key acceptance.

No live production deployment has been performed by this review.
