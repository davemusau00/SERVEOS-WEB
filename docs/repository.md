# Repository map

| Path | Responsibility |
| --- | --- |
| `src/` | PWA entry, web workspaces, design system, IndexedDB store, offline grants and browser printing client |
| `apps/api/src/` | Node API, command handlers, authentication, projections, worker and migration runner |
| `apps/api/migrations/` | Ordered PostgreSQL schema and domain migrations |
| `apps/api/tests/` | API unit tests and PostgreSQL integration tests |
| `apps/print-bridge/` | Local print service and its authenticated job handling |
| `crates/servos-printer-transport/` | ESC/POS and platform printer transport |
| `contracts/` | Canonical permissions, assignable staff permissions and role templates |
| `tools/migration/` | Tenant specific, one time migration boundary; separate from the product |
| `tests/browser/` | Browser acceptance suites |
| `scripts/` | Build, docs, UI audit, PWA packaging and production operations helpers |
| `docs/` | Current architecture and operating documentation |

The root package builds and tests the PWA. `apps/api/package.json` owns the API database dependency. Legacy Print Bridge sources remain outside the ServOS V2 operator print path; their Cargo manifests are used only for maintenance checks.
