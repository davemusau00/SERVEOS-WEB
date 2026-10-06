# 32 — Web-First Reset Implementation Status

## Baseline captured for this checkout

- Branch: `reset/vps-platform`
- Starting commit: `750ee33d27c235614b2fc272e8c1b961dd8dbc8e`
- Baseline tag `pre-vps-reset-2026-10-06` exists.
- Working tree was clean before implementation.
- Generated build outputs include `docs/generated/OPERATION_PARITY_LEDGER.json`, `docs/generated/OPERATION_PARITY_LEDGER.md`, and `src/generated/help-index.json`; they must be classified as committed or reproducibly generated artifacts before broad refactoring.
- The repository still has one root Vite/Tauri package and Supabase dependencies. The new API lives under `apps/api`; the production client path has not been switched.

## Implemented slice

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
- Added a typed PWA API client for in-memory bearer access, device-scoped requests, command/status/change/catalog calls, enrollment calls, and unknown-outcome marking on lost command responses. The current workspace adapter is still Supabase-backed.

## Still pending

- Generated-file policy decision.
- API staff login/session issuance and its current UI integration; the challenge/device enrollment protocol exists but still requires an API-authenticated session that the current Supabase login does not issue.
- Domain handlers must update `business_entity_versions` in the same business transaction; the generic increment primitive exists but only catalog creation uses it.
- Shared API/client contract generation, authenticated bootstrap/change-feed/SSE, and PWA API transport migration. Current browser synchronization still uses Supabase and snapshot bootstrap.
- Complete operation payload parity and tests for product/stock commands, including bottle/package units, batch yields, and opening movements; map API catalog projections into the PWA.
- API image validation and isolated staging deployment. Docker/PostgreSQL are unavailable in this environment; no live DB migration was run.
- Actual off-VPS encrypted backup and restore verification.
- Business domain migrations, document spooler/Print Bridge, one-time data migration, pilot, production cutover, and Tauri retirement.

## Current continuation notes

- The documentation bundle at `docs/docs.zip` was restored to the tracked `docs/` paths it contains so the existing help build, production build, and repository source tests can operate from this checkout.
- Before the latest edits, the production build succeeded, the existing JavaScript suite passed 216/216, the native Rust/domain suite passed 106/106, and the API suite passed 13/13. Those results do not cover later edits.
- The user requested that further tests be deferred until the end of the development sprint. Continue implementation without running test commands; perform the full planned verification matrix at sprint end.
- Current development edits to migration 004 and its handlers are intentionally unverified because the sprint test gate is deferred. Do not treat this source slice as accepted or production-ready.
- Docker Desktop and `psql` are unavailable in this environment. PostgreSQL migrations, container startup, real transaction concurrency, and staging deployment remain unverified.

Production use is not enabled by this slice. See roadmap phases 0–17 and gate production activation on their evidence.
