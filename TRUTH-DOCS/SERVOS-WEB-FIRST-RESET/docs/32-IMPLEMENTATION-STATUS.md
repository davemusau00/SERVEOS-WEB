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
- Added a typed PWA API client for in-memory bearer access, device-scoped requests, command/status/change/catalog calls, enrollment calls, and command-status recovery after response loss. The existing Web sign-in screen now offers a separate API catalog pilot login that issues API staff sessions, rotates required initial passwords, enrolls the browser key, bootstraps catalog records, and uses an API-only IndexedDB database and transport. The broader production Web workspace remains Supabase-backed pending domain parity.
- Added durable API command lifecycle states (`RECEIVED`, `PROCESSING`, `CONFIRMED`, `REJECTED`, `CONFLICT`), terminal error storage, failure audit events, and command-status recovery before an outcome-unknown PWA command is resubmitted. The durable row retains command identity and payload hash without duplicating sensitive request bodies. Legacy committed rows migrate as `CONFIRMED`.
- Converged API bootstrap and change polling on the PWA `records[]` projection shape. Catalog bootstrap reads its records and high-water cursor in one repeatable-read transaction; change pages return the same event shape and cursor metadata.
- Added signed, short-lived, bounded API offline grants for explicitly grant-capable catalog edits, server-side grant quota/replay accounting, atomic local quota reservation with API-authority PWA command enqueue, offline queue admission, and API status polling on reconnect. This is limited to `product.save`, `stockItem.save`, and `stockLocation.save`; POS, payment, inventory movement, procurement, and hospitality workflows remain online or draft-only until their API handlers exist.
- Added relational stock-location code/type storage and its API save command so all three catalog record types shown in the API catalog pilot are represented by durable API-owned fields.
- Added an API-native login/password-change/device-enrollment coordinator and an API catalog bootstrap installer for the existing PWA IndexedDB stores. These are integration primitives; the production Web sign-in and workspace still use Supabase and do not yet call this coordinator or API transport.

## Still pending

- Generated-file policy decision.
- Expand the API pilot into the production Web workspace only as domain handlers and projections replace each Supabase workflow. The existing standard Web sign-in and business workspace still use Supabase; the new API entry is limited to catalog operations.
- Domain handlers must update `business_entity_versions` in the same business transaction; version increments now cover catalog products and stock masters, while complete cross-aggregate version semantics and existing-record updates still need review.
- Shared API/client contract generation, broad authenticated bootstrap/change-feed/SSE coverage, and PWA API transport activation. Current browser synchronization still uses Supabase and snapshot bootstrap.
- Complete operation payload parity and tests for product/stock commands, including bottle/package units, batch yields, and opening movements; connect projections to the PWA once API staff login and migration are ready.
- API image validation and isolated staging deployment. Docker/PostgreSQL are unavailable in this environment; no live DB migration was run.
- Actual off-VPS encrypted backup and restore verification.
- Business domain migrations, document spooler/Print Bridge, one-time data migration, pilot, production cutover, and Tauri retirement.

## Current continuation notes

- The documentation bundle at `docs/docs.zip` was restored to the tracked `docs/` paths it contains so the existing help build, production build, and repository source tests can operate from this checkout.
- Before the latest edits, the production build succeeded, the existing JavaScript suite passed 216/216, the native Rust/domain suite passed 106/106, and the API suite passed 13/13. Those results do not cover later edits.
- The user requested that further tests be deferred until the end of the development sprint. Continue implementation without running test commands; perform the full planned verification matrix at sprint end.
- Current development edits to migration 004 and its handlers are intentionally unverified because the sprint test gate is deferred. Do not treat this source slice as accepted or production-ready.
- The current architectural-blocker implementation edits are also intentionally unverified; no tests, build, typecheck, migration, or database command has been run after them. Revisit API signing-key provisioning and migration 007 in the deferred sprint-end verification.
- Docker Desktop and `psql` are unavailable in this environment. PostgreSQL migrations, container startup, real transaction concurrency, and staging deployment remain unverified.

Production use is not enabled by this slice. See roadmap phases 0–17 and gate production activation on their evidence.
