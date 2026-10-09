# ServOS

ServOS is a web-first hospitality operations system. The PWA is the operator interface, the Node API owns business commands, PostgreSQL stores business records, and the optional local Print Bridge handles printer delivery. Browser code does not connect directly to PostgreSQL or a second cloud backend.

## Repository layout

- `src/` — PWA screens, design system, IndexedDB queue and offline session support.
- `apps/api/` — authenticated API, command handlers, PostgreSQL migrations and tests.
- `apps/print-bridge/` and `crates/servos-printer-transport/` — optional local printing service.
- `contracts/` — canonical permissions and staff role templates.
- `tools/migration/` — separate boundary for the future one-time Countryside migration utility.
- `docs/` — current architecture, operations and user guides.

## Local development

Use Node.js 22 and npm. The API and PostgreSQL tests are in `apps/api`; Print Bridge development uses Rust/Cargo.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `VITE_API_URL` to the API environment you intend to use. Never put database credentials, API signing keys, or other server secrets in Vite variables. Offline access is opt-in and requires the API's signed grant configuration.

## Verification

```powershell
npm run lint
npm run contracts:check
npm run architecture:check
npm run build
npm test
npm run test:api
npm run docs:check
```

PostgreSQL integration tests require a disposable database in `TEST_DATABASE_URL`. API browser acceptance requires that database and starts a local API instance. Production-browser checks exercise the built PWA with a test API origin; they do not prove hosted API, migration, device, or printer acceptance.

See [current status](docs/STATUS.md), [architecture](docs/architecture.md), [local development and repository map](docs/repository.md), [deployment](docs/deployment.md), and the [documentation index](docs/README.md). The Countryside one-time migration executor is not yet implemented; its boundary and current status are documented in [`tools/migration/README.md`](tools/migration/README.md).
