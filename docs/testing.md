# Testing

Use `npm run lint`, `npm run contracts:check`, `npm run architecture:check`, `npm run build` and `npm test` for the fast web checks. Root Node tests cover API command contracts, browser helpers, currency/quantity conversion and repository gates.

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database before `npm run test:api`; without it, PostgreSQL integration cases are skipped. `npm run test:browser:api` runs the PWA against the test API and PostgreSQL. `npm run test:browser:production` exercises the built PWA at desktop and mobile viewports.

Legacy Print Bridge CI runs Rust formatting, Clippy, tests and release builds on Linux and Windows. Windows CI additionally builds the service host; this is source maintenance coverage, not a supported ServOS V2 printing workflow. These checks do not prove hosted deployment, backup restore or physical printer acceptance.
