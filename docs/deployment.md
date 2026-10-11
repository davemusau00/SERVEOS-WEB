# Web release

The production PWA is served from immutable releases under `/var/www/serveos-prod/releases/`. The `current` symlink selects the active bundle. `vercel.json` remains a separate Vercel build configuration; it does not publish the VPS production release.

Build the web shell with the production API origin and public offline-grant verification key. The matching private signing keys stay on the API host:

```powershell
$env:VITE_API_URL = 'https://serveosapi.davemusau.co.ke'
$env:VITE_ENABLE_WEB_OFFLINE = 'true'
$env:VITE_API_OFFLINE_GRANT_PUBLIC_JWK = (Get-Content "$env:LOCALAPPDATA\ServOS\credentials\public\offline-grant-public-20261009.json" -Raw).Trim()
npm run build
npm run release:pwa:package
```

Package only from a clean, committed worktree. The package manifest binds every file to the selected Git SHA. Deploy the package to the production host with:

```powershell
$release = (git rev-parse --short=12 HEAD).Trim()
# Supply these variables from the approved fresh baseline; do not infer them.
powershell.exe -NoProfile -File scripts/Deploy-ServOSProductionFeatures.ps1 `
  -Mode Pwa -TargetEnvironment ServeosNext `
  -ExpectedCurrentRelease $expectedCurrentRelease `
  -ExpectedNginxSha256 $siteSha256 -ExpectedApiPort $apiPort `
  -ReleaseId $release -PlanOnly
```

The deploy mode uploads the archive over SSH, checks its paths and SHA-256 entries, confirms the existing web and API routes respond, installs an immutable release, then atomically switches `current`. It checks the served HTML asset references and API readiness after activation and restores the previous symlink if those checks fail. Keep the emitted previous release path for any later rollback.

The API is packaged by `apps/api/Dockerfile`; PostgreSQL is external. Apply migrations only through the reviewed API migration process. Do not couple PWA publication to schema changes, CSV imports, or data migration. A local build or browser pass is not staging or production acceptance.

Build the API from the repository root with `docker build --file apps/api/Dockerfile --tag serveos-api:packaging-check .`. The image preserves `/app/apps/api/src` and `/app/contracts`; adding contracts beneath a relocated `/app/src` does not repair its relative imports. `apps/api/Dockerfile.dockerignore` limits this build context to API sources, manifests, migrations and contracts. Run `node scripts/verify-api-image.mjs` to build and import every API module with no network or database, and verify readable contracts as the non-root runtime user. For isolated staging Compose, set `build.context` to the source repository root and `build.dockerfile` to `apps/api/Dockerfile`; retain every other approved environment, network, volume and port setting.

The candidate currently includes additive migrations 073–076. Readiness checks the candidate's migration filenames and SHA-256 values, not a fixed count. A production database last verified at migration 072 must pass the restore, compatibility and migration approval gates before this candidate can serve production traffic. No local image test authorizes live migrations or cutover.


The target-aware script defaults to no execution. `-PlanOnly` produces a local review plan without SSH or uploads. After separately authorized release gates pass, `-ExecuteApprovedSwitch` is required to execute the reviewed PWA switch. The script verifies the exact current release, owned virtual hosts, Nginx site checksum and loopback API baseline before uploading; it rechecks before activation and compares protected HTTPS origins afterward. It never changes an API route or Nginx configuration. Previously hardcoded key/monitor/route modes fail before contacting the server and are retained only as historical source.

This development task ran only the PowerShell parser and a synthetic local plan. No remote preflight, upload, switch, staging restore or rollback was executed. Isolated rehearsal and explicit deployment approval remain mandatory.
