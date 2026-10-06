# 32 — Web-First Reset Implementation Status

## Baseline captured for this checkout

- Branch: `reset/vps-platform`
- Starting commit: `750ee33d27c235614b2fc272e8c1b961dd8dbc8e`
- Baseline tag `pre-vps-reset-2026-10-06` exists.
- Working tree was clean before implementation.
- Generated build outputs include `docs/generated/OPERATION_PARITY_LEDGER.json`, `docs/generated/OPERATION_PARITY_LEDGER.md`, and `src/generated/help-index.json`; they must be classified as committed or reproducibly generated artifacts before broad refactoring.
- The repository still has one root Vite/Tauri package and Supabase dependencies. The new API kernel is isolated under `apps/api`; no production client path has been switched.

## Implemented slice

- Added an isolated Node API command kernel with envelope validation, permission enforcement, offline-grant enforcement, payload hashing, idempotent command replay, expected transaction boundary, audit event, and ordered change cursor.
- Added PostgreSQL schema for command outcomes, audit, ordered changes, and bounded offline grants.
- Added health/readiness, command submission, and command-status routes. Authentication is injected at the server boundary; deployment is blocked until a production session/device authenticator replaces the local header adapter.
- Commands have no business handlers by default. Unregistered commands return an error; no business success is fabricated.
- Added focused tests for envelope validation, transactional write intent, idempotent replay, payload mismatch, permission denial, and grant requirement.

## Still pending

- Reproducible baseline build/test execution and generated-file policy decision.
- Production authentication/device enrollment and expected-version enforcement in domain handlers.
- Shared API/client contract generation, bootstrap/change-feed/SSE, and PWA IndexedDB outbox migration.
- API image/build, isolated staging deployment, actual off-VPS encrypted backup and restore verification.
- Business domain migrations, document spooler/Print Bridge, one-time data migration, pilot, production cutover, and Tauri retirement.

Production use is not enabled by this slice. See roadmap phases 0–17 and gate production activation on their evidence.
