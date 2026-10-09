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
powershell.exe -NoProfile -File scripts/Deploy-ServOSProductionFeatures.ps1 `
  -Mode Pwa `
  -ReleaseId $release
```

The deploy mode uploads the archive over SSH, checks its paths and SHA-256 entries, confirms the existing web and API routes respond, installs an immutable release, then atomically switches `current`. It checks the served HTML asset references and API readiness after activation and restores the previous symlink if those checks fail. Keep the emitted previous release path for any later rollback.

The API is packaged by `apps/api/Dockerfile`; PostgreSQL is external. Apply migrations only through the reviewed API migration process. Do not couple PWA publication to schema changes, CSV imports, or data migration. A local build or browser pass is not staging or production acceptance.
