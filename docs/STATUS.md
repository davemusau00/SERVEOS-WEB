# Current status

## Product boundary

The active product is the PWA, Node API, PostgreSQL schema and optional local Print Bridge. The active root sign in path opens the API session and the web workspace. The API CSV importer is the only operator import system.

## In this cleanup

- The web entry and staff administration use API sessions.
- The API registry is centralized and checked against the permission/role contracts.
- Tauri, browser direct database, and native UI paths have been removed from the working tree. The pre-cleanup tag `pre-web-only-cleanup-2026-10` preserves the earlier source history.
- The root CI definition is being narrowed to PWA, API/PostgreSQL, production browser and Print Bridge gates.

## Evidence and open gates

- The PWA build, TypeScript lint, API contract check and 22 API/root unit tests passed during this cleanup.
- PostgreSQL integration tests were skipped in that local run because no `TEST_DATABASE_URL` was set.
- The cleanup branch has not been redeployed. The existing production service state is not evidence for this cleanup.
- Staging smoke, schema high-water review, PostgreSQL backup/restore rehearsal, live multi-device acceptance and physical printer acceptance remain open.
- The worker process currently registers zero job handlers.
- A standalone Countryside SQLite-to-current-PostgreSQL migration executor is not present in this checkout. The older migration implementation is retained in the pre-cleanup Git tag; it has not been adapted or validated against the current API schema.
