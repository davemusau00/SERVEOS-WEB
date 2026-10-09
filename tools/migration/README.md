# One time tenant migration boundary

This directory is reserved for the Countryside one time migration utility. It is separate from the PWA, API, Print Bridge, normal deployment and operator CSV import.

No standalone SQLite-to-current-PostgreSQL migration executor is present in this checkout. The earlier cutover source is preserved in Git tag `pre-web-only-cleanup-2026-10`, but it targets an older cutover protocol and has not been adapted to the current API schema. Do not treat that source as an executable migration for the current production database.

Before a tenant migration is run, the dedicated tool must support an immutable source snapshot, deterministic record export, dependency mapping, idempotent API/PostgreSQL import, exact reconciliation, dry-run reporting, and a rehearsed rollback/restore. The tool must never run during a normal deploy or from the operator Import Center. Keep credentials and source business data out of source control.
