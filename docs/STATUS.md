# Current status

## Product boundary

ServOS is a web-based hospitality ERP/POS delivered as a PWA against a Node API and PostgreSQL, with an optional local Print Bridge for receipts and kitchen printing. Operator CSV imports go through the API controlled importer.

## Cleanup delivered

- The production web entry uses the API session flow and `WebBusinessApp`.
- Browser business writes use the API command kernel; IndexedDB is the PWA projection and offline queue.
- API command permissions and staff role templates share the checked contracts.
- Tauri business runtime, browser direct database access, Supabase runtime, legacy native UI, duplicate import flow, and obsolete architecture release gates have been removed from the working tree. The prior source history is retained at `pre-web-only-cleanup-2026-10`.
- CI now covers the PWA, API/PostgreSQL, production browser checks, and Print Bridge on Linux and Windows.
- Current documentation and the static UI interaction inventory are generated and checked from the web-first source tree.

## Local verification

- `npm run verify:fast` passed: lint, API contracts, architecture checks, build and the 23 root tests.
- `npm run docs:check` passed across 22 current documents and 21 offline help guides.
- API unit tests passed (28 passed). Eight PostgreSQL integration suites, including first-run business setup, were skipped because `TEST_DATABASE_URL` is unset. Docker is installed but its local daemon is unavailable; `psql` is unavailable.
- Production browser checks passed (26 tests across desktop and mobile). They cover PWA bootstrap, API login/catalog sync, first-run setup and resume, IndexedDB recovery and the offline shell. The first-run browser scenario uses a mocked API and does not establish PostgreSQL acceptance.
- Print Bridge and transport formatting, Clippy, tests, release builds, and the Windows service feature checks passed. The Print Bridge app currently has no unit tests; the transport crate has 12 passing tests.
- Workspace screens and recovery panels are lazy-loaded. The latest build's main JavaScript chunk is 234 kB, down from 597 kB, with no chunk-size warning. The receipt and application logo assets remain large at 786 kB and 1.86 MB.
- Thrown web-screen errors now pass through the shared operator-safe error mapper, including authentication, catalog, inventory, finance, printing, settings, and activity flows. The static UI audit inventories 1,551 interactions and produces 241 review signals. They are unreviewed source-level prompts, not confirmed defects or accepted workflow evidence. Review of every operator workflow, keyboard path, responsive screen, permissions state, and recovery path remains open.

## Open release and migration gates

- PostgreSQL integration and browser/API E2E tests must run against a disposable PostgreSQL database.
- PWA release `8fa46716fc97` is deployed at `/var/www/serveos-prod/current`. Its 58-file archive passed manifest/hash checks; direct web and API TLS route checks passed before and after the atomic symlink switch, and the served HTML asset references matched the release. The public-origin browser smoke still times out before `domcontentloaded`, as it did before deployment.
- The production API image remains `serveos-api:b2a3c35ab527b1709e6ae0c86db173afea69e12d`. API source changes, including the stock-item CSV importer fix, are not deployed. Seven PostgreSQL suites were skipped locally because no test database is configured. Staging/API acceptance, schema high-water review, PostgreSQL backup/restore rehearsal, live multi-device acceptance, and physical printer acceptance remain open.
- The worker process currently registers zero job handlers.
- A standalone Countryside SQLite-to-current-PostgreSQL migration executor is not present. The older cutover source in the pre-cleanup tag targets an older protocol and is not safe to run against the current API schema. A dedicated, rehearsed migration utility remains a separate gate; it must not run as part of deployment or operator CSV import.
