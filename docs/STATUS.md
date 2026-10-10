# Current status

## Product boundary

ServOS is a web-based hospitality ERP/POS delivered as a PWA against a Node API and PostgreSQL, with an optional local Print Bridge for receipts and kitchen printing. Operator CSV imports go through the API controlled importer.

## Current task scope

- Deployment work is deferred, including `SERVEOS-V2.md` section 4, PR 02 packaging, release/install artifacts, and section 13.1 deployment-package support. This task made no deployment changes.
- Deployment details below record earlier environment state and are historical; no deployed environment was accessed or changed during this task.

## Cleanup delivered

- The production web entry uses the API session flow and `WebBusinessApp`.
- Browser business writes use the API command kernel; IndexedDB is the PWA projection and offline queue.
- API command permissions and staff role templates share the checked contracts.
- Tauri business runtime, browser direct database access, Supabase runtime, legacy native UI, duplicate import flow, and obsolete architecture release gates have been removed from the working tree. The prior source history is retained at `pre-web-only-cleanup-2026-10`.
- CI now covers the PWA, API/PostgreSQL, production browser checks, and Print Bridge on Linux and Windows.
- Current documentation and the static UI interaction inventory are generated and checked from the web-first source tree.

## Local verification

- `npm run verify:fast` passed: TypeScript, API contracts, architecture checks, production build and all 23 root tests.
- `npm run docs:check` passed across 22 current documents and 22 offline help guides.
- `npm run test:api` passed all 37 tests with a loopback-only disposable PostgreSQL 16 database, including all eight PostgreSQL integration suites. API tests now run serially to avoid PostgreSQL shared lock-memory exhaustion seen with parallel schema migration and cleanup.
- `npm run test:browser:api` passed both real PostgreSQL/API browser acceptances against that disposable database. From a fresh schema, the setup wizard resumed after refresh, saved the business defaults, created a product, opened a till, fired a counter sale, and recorded cash; PostgreSQL confirmed the completed order, payment, and one drawer sale entry. Catalog/inventory synchronization also passed. The first-admin endpoint itself is covered by the PostgreSQL API suite; its browser form has separate validation/storage-safety browser checks. `npm run test:browser:production` passed all 26 desktop and mobile checks, including setup resume, guide click-through, System health and offline-shell recovery. Mocked readiness checks remain distinct from the real API acceptance.
- Print Bridge and transport formatting, Clippy, tests, release builds, and the Windows service feature checks passed. The Print Bridge app currently has no unit tests; the transport crate has 12 passing tests.
- `npm run audit:ui:gate` passed: 1,647 interactions inventoried and no browser prompt/confirm findings. It recorded 255 review signals; they are unreviewed source-level prompts, not confirmed defects or accepted workflow evidence.
- Settings includes a System health panel for API/database readiness, app version, saved-work counts, browser printing, local Print Bridge selection, and backup status. The backup status is explicitly “Not reported”; no backup or restore result is inferred.
- Workspace screens and recovery panels are lazy-loaded. The latest build's main JavaScript chunk is 243 kB, down from 597 kB, with no chunk-size warning. The receipt and application logo assets remain large at 786 kB and 1.86 MB.
- Thrown web-screen errors pass through the shared operator-safe error mapper, including authentication, catalog, inventory, finance, printing, settings, and activity flows. Review of every operator workflow, keyboard path, responsive screen, permissions state, and recovery path remains open.

## Open release and migration gates

- The local disposable PostgreSQL and real API browser gates passed on 2026-10-10. Repeat the same gates in clean CI and preserve the resulting reports.
- PWA release `8fa46716fc97` is deployed at `/var/www/serveos-prod/current`. Its 58-file archive passed manifest/hash checks; direct web and API TLS route checks passed before and after the atomic symlink switch, and the served HTML asset references matched the release. The public-origin browser smoke still times out before `domcontentloaded`, as it did before deployment.
- At the time of the earlier deployment snapshot, the production API image was `serveos-api:b2a3c35ab527b1709e6ae0c86db173afea69e12d`, and subsequent API source changes were not deployed. No deployed environment was accessed or changed for this task. Current local PostgreSQL and real API browser acceptance passed as recorded above; staging/API acceptance, schema high-water review, PostgreSQL backup/restore rehearsal, live multi-device acceptance, and physical printer acceptance remain open.
- The worker process currently registers zero job handlers.
- A standalone Countryside SQLite-to-current-PostgreSQL migration executor is not present. The older cutover source in the pre-cleanup tag targets an older protocol and is not safe to run against the current API schema. A dedicated, rehearsed migration utility remains a separate gate; it must not run as part of deployment or operator CSV import.
