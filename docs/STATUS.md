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

- `npm run lint`, `npm run contracts:check`, and `npm run architecture:check` passed.
- `npm run build`, `npm test` (23 passed), and `npm run docs:check` passed.
- API unit tests passed (23 passed). Seven PostgreSQL integration suites were skipped because `TEST_DATABASE_URL` is unset; the Docker service is stopped and no local PostgreSQL service is installed.
- Production browser checks passed at desktop and mobile viewports (10 tests each). The API catalog workflow now visits every workspace exposed to the signed-in session and checks navigation state and horizontal document overflow at both sizes. The wider suite covers PWA bootstrap, API login/catalog sync, IndexedDB recovery and offline shell behavior; it does not establish full operator workflow acceptance.
- Print Bridge and transport formatting, Clippy, tests, release builds, and the Windows service feature checks passed. The Print Bridge app currently has no unit tests; the transport crate has 12 passing tests.
- Workspace screens and recovery panels are lazy-loaded. The latest build's main JavaScript chunk is 234 kB, down from 597 kB, with no chunk-size warning. The receipt and application logo assets remain large at 786 kB and 1.86 MB.
- Thrown web-screen errors now pass through the shared operator-safe error mapper, including authentication, catalog, inventory, finance, printing, settings, and activity flows. The static UI audit inventories 1,551 interactions and produces 241 review signals. They are unreviewed source-level prompts, not confirmed defects or accepted workflow evidence. Review of every operator workflow, keyboard path, responsive screen, permissions state, and recovery path remains open.

## Open release and migration gates

- PostgreSQL integration and browser/API E2E tests must run against a disposable PostgreSQL database.
- The cleanup branch has not been redeployed. Staging smoke, schema high-water review, PostgreSQL backup/restore rehearsal, live multi-device acceptance, and physical printer acceptance remain open.
- The production `current` symlink still points at pre-cleanup commit `2dba83ab`. The external public-origin browser smoke previously timed out before `domcontentloaded`, while direct web and API TLS route checks from the VPS returned HTTP 200. The PWA deploy mode now accepts a release ID and verified archive, checks both routes, activates atomically, and restores the prior symlink if immediate post-activation checks fail. Staging and public-origin smoke remain open.
- The worker process currently registers zero job handlers.
- A standalone Countryside SQLite-to-current-PostgreSQL migration executor is not present. The older cutover source in the pre-cleanup tag targets an older protocol and is not safe to run against the current API schema. A dedicated, rehearsed migration utility remains a separate gate; it must not run as part of deployment or operator CSV import.
