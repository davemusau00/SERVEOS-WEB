# 32 — Web-First Reset Implementation Status

## Baseline captured for this checkout

- Branch: `reset/vps-platform`
- Starting commit: `750ee33d27c235614b2fc272e8c1b961dd8dbc8e`
- Baseline tag `pre-vps-reset-2026-10-06` exists.
- Working tree was clean before implementation.
- Generated build outputs include `docs/generated/OPERATION_PARITY_LEDGER.json`, `docs/generated/OPERATION_PARITY_LEDGER.md`, and `src/generated/help-index.json`; they must be classified as committed or reproducibly generated artifacts before broad refactoring.
- The repository still has one root Vite/Tauri package and Supabase dependencies. The new API lives under `apps/api`; the production client path has not been switched.

## Implemented slice

- Added an authenticated catalog bootstrap projection endpoint and API client call for products, recipes, stock/package masters, locations, and outlets. This is a scoped first projection only; ordered change-feed rebuild and current snapshot sync replacement remain pending.
- Added relational products, stock masters, package units, recipe ingredients, locations, location balances, and movement schema. Added online-only `product.save`, `stockItem.save`, and `catalog.createWithOpeningStock` handlers with expected-version checks, same-business reference validation, duplicate code/barcode checks, and atomic product/recipe/package/opening movement writes. This is API groundwork only; the browser UI remains on its Supabase adapter until login, projections, and migration are ready.
- Added an isolated Node API command kernel with envelope validation, permission enforcement, offline-grant enforcement, canonical payload hashing, idempotent command replay, expected-version checks, audit event, and ordered change cursor.
- Added PostgreSQL schema and migration runner for sessions, enrolled devices, permissions, expected versions, command outcomes, audit, ordered changes, offline grants, relational catalog, and asynchronous jobs.
- Added health/readiness, command submission/status, ordered change polling, catalog listing, and catalog item creation routes. Bearer tokens are hashed and resolved to live session, enrolled device, and permissions from PostgreSQL; callers cannot assert identity or permissions with headers.
- Added expected-version validation under PostgreSQL row locks. Missing rows have version zero; mismatches return a stable conflict with current/expected version details.
- Added the first relational business handler, online-only `catalog.item.create`, with version-0 creation guard, normalized input, duplicate-SKU protection, and command/audit/change evidence.
- Added PostgreSQL job claiming with leases and retry backoff. No job handlers are registered, so the worker cannot claim or fabricate business work.
- Replaced the backup compose placeholder with a manually run container that streams custom-format `pg_dump` output through age encryption to an rclone remote, then verifies a non-empty remote object. Added an environment template and restore-rehearsal instructions; no remote has been configured or exercised.
- Added a deterministic-input PWA release packager that emits immutable Git-SHA directories with per-file SHA-256 manifests, plus a VPS activation/rollback script that validates hashes and atomically switches the Nginx `current` symlink. No VPS release was activated.
- PWA device IDs now migrate from localStorage into IndexedDB alongside a non-exportable WebCrypto P-256 key. The new enrollment helper exists, but current app startup still invokes Supabase registration because the existing Supabase session is not an API staff session.
- Added a one-use, five-minute API device-enrollment challenge signed by the PWA key and a client enrollment helper; issuance and completion both require device-management permission and challenge issuance is rate-limited.
- Added PWA IndexedDB stores for verified offline grants, immutable hashed BusinessDocument snapshots, and durable print-job state; added local-storage diagnostics and sync status broadcasts across tabs.
- Added ECDSA grant-signature verification, an authenticated SSE change-invalidation endpoint, API runtime configuration validation, and worker lease renewal/expiry fencing.
- Added a typed PWA API client for in-memory bearer access, device-scoped requests, command/status/change/catalog calls, enrollment calls, and command-status recovery after response loss. The API login now opens the main PWA business workspace with an API-only IndexedDB projection and API CloudTransport. That workspace exposes Home, Catalog, Activity, and Help; command submission is enabled only for `product.save`, `stockItem.save`, and `stockLocation.save`, and all other command names are blocked before enqueue.
- Added durable API command lifecycle states (`RECEIVED`, `PROCESSING`, `CONFIRMED`, `REJECTED`, `CONFLICT`), terminal error storage, failure audit events, and command-status recovery before an outcome-unknown PWA command is resubmitted. The durable row retains command identity and payload hash without duplicating sensitive request bodies. Legacy committed rows migrate as `CONFIRMED`.
- Converged API bootstrap and change polling on the PWA `records[]` projection shape. Catalog bootstrap reads its records and high-water cursor in one repeatable-read transaction; change pages are adapted into the shared PWA `ChangePage` shape. API reconnect refresh rebuilds the catalog projection from a consistent bootstrap and preserves unresolved local commands rather than overwriting their outcomes.
- Added signed, short-lived, bounded API offline grants for explicitly grant-capable catalog edits, server-side grant quota/replay accounting, atomic local quota reservation with API-authority PWA command enqueue, offline queue admission, and API status polling on reconnect. This is limited to `product.save`, `stockItem.save`, and `stockLocation.save`; POS, payment, inventory movement, procurement, and hospitality workflows remain online or draft-only until their API handlers exist.
- Added relational stock-location code/type storage and its API save command so the catalog workspace's three record types are represented by durable API-owned fields.
- Added an API-native login/password-change/device-enrollment coordinator and connected it to the main PWA sign-in/workspace path. Supabase remains available for the separately selected Remote Manager mode and other not-yet-migrated operations.
- Fixed the API staff-login migration's invalid expression-based table-level UNIQUE constraint; a unique expression index now enforces active case-insensitive login names.
- Fixed API command kernel test adapters for the durable lifecycle and added durable rejection/conflict replay coverage.
- Added a PostgreSQL integration test for fresh migrations, product/stock/location writes, API command status, terminal conflict replay, repeatable catalog bootstrap, and ordered change-feed entries. Added a CI PostgreSQL 16 service job.
- Updated GitHub Actions to run on `reset/vps-platform` pushes and manual dispatch, fixed evidence-summary environment indentation, and included API/PostgreSQL results in release evidence. Release-candidate generation remains restricted to `main`.

## Still pending

- Generated-file policy decision.
- Continue domain migration in the production Web workspace. The API-authoritative PWA entry currently supports catalog master writes only; no POS or financial command is enabled.
- Domain handlers must update `business_entity_versions` in the same business transaction; version increments now cover catalog products and stock masters, while complete cross-aggregate version semantics and existing-record updates still need review.
- Shared API/client contract generation and broad authenticated bootstrap/change-feed/SSE coverage. The API transport is active in the API-authoritative PWA workspace; the older Supabase mode still uses its existing transport.
- Complete operation payload parity and tests for product/stock commands, including bottle/package units, batch yields, and opening movements; connect projections to the PWA once API staff login and migration are ready.
- API image validation and isolated staging deployment. No hosted/staging database or live deployment was changed.
- Actual off-VPS encrypted backup and restore verification.
- Business domain migrations, document spooler/Print Bridge, one-time data migration, pilot, production cutover, and Tauri retirement.

## Current continuation notes

- The documentation bundle at `docs/docs.zip` was restored to the tracked `docs/` paths it contains so the existing help build, production build, and repository source tests can operate from this checkout.
- Before the latest edits, the production build succeeded, the existing JavaScript suite passed 216/216, the native Rust/domain suite passed 106/106, and the API suite passed 13/13. Those results do not cover later edits.
- The latest user explicitly requested real PostgreSQL API tests and reload/reconnect/change-feed proof. API unit tests and the PostgreSQL integration test passed locally against a disposable PostgreSQL 16 Docker container; no hosted/staging database was used.
- `npm run lint` passed after API workspace wiring. A production build was started but its wrapper returned without final output, so the build result is unverified for this continuation.
- A focused Playwright API-workspace scenario was added, but the local Playwright runner hung in its Windows test-server process and produced no result artifacts. Browser login/reload/reconnect behavior is therefore not yet proven; retry with a stable Playwright process before continuing to POS.
- GitHub Actions was configured in source but no workflow dispatch or remote push was performed; hosted CI status is not yet verified.
- Local disposable PostgreSQL and API processes were stopped; the disposable Docker database container remains available for another run and contains test-only records.

Production use is not enabled by this slice. See roadmap phases 0–17 and gate production activation on their evidence.
