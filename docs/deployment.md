# Deployment

The PWA is a Vite build published from the root repository. `vercel.json` defines the Vite build and SPA rewrites. The API is packaged by `apps/api/Dockerfile`; PostgreSQL is an external service. Set `VITE_API_URL` and the public offline grant verification key at PWA build time. Set database credentials, signing private keys and `WEB_ORIGIN` on the API host.

Apply `apps/api/migrations/` with the API migration runner as part of a reviewed deployment. Deploy the PWA and API from the same reviewed source revision, then run the health check and browser smoke tests against staging.

The repository does not include a complete staging deployment rehearsal or production rollback automation. Do not infer hosted readiness from a local build or CI pass. The PWA and API cleanup changes in this branch have not been deployed.
