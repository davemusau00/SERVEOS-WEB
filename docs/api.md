# API

The API is an ES module Node service in `apps/api/`. `src/server.mjs` creates the HTTP server and `src/command-registry.mjs` assembles the command handlers. `src/command-kernel.mjs` validates command identity and records durable outcomes.

The API exposes authenticated staff/device sessions, business bootstrap snapshots, change-feed pages, commands, import batches and print authorization. Domain handlers own validation and PostgreSQL writes. Clients submit a stable command ID and the versions they reviewed; clients recover the recorded outcome after a lost response instead of creating a replacement command.

First-run business setup is stored in PostgreSQL and included in the authenticated catalog snapshot as the `businessSetup` record. The `business.setup.configure` and `business.setup.complete` commands require `business.configure` and are online-only. Setup state is scoped to the authenticated business and version-checked. The browser uses the existing settings, stock-location, outlet and payment-account commands to provision defaults; setup stays in progress until the API verifies those records.

Configuration is validated by `src/config.mjs`. Production requires `DATABASE_URL` and an exact HTTPS `WEB_ORIGIN`. The health readiness route reports whether the API migration table is available.

Run locally with `npm ci --prefix apps/api`, then `npm run migrate --prefix apps/api` and `npm start --prefix apps/api` after setting local PostgreSQL configuration.
