# ServOS

ServOS is a single-business hospitality POS and operations system. **The installed Tauri terminal and its SQLite database remain the live operational authority.** Supabase receives ordered terminal uploads and serves constrained manager reads and requests. Staged PostgreSQL v2 commands and the Vercel client are disabled by default; they are not a second production writer. The browser preview is not for trading.

This repository is source under active implementation, not a release declaration. Check [current release state](docs/CURRENT_RELEASE_STATE.md), [test evidence](docs/TEST_EVIDENCE.md), and the [expansion handoff](docs/EXPANSION_HANDOFF.md) before making operational claims.

## Supported targets

The installed app uses Tauri and has Windows, Linux, and Android build paths. Windows is the currently rehearsed packaging target; fresh-device, Linux, and Android acceptance is tracked separately. The web client is staged for Vercel Preview and is not enabled for business transactions.

## Developer setup

Prerequisites: Git, Node.js/npm, Rust/Cargo for native work, and the platform-specific Tauri build prerequisites. Windows packaging also uses Visual Studio C++ Build Tools, WebView2, Bash for the repository packaging script, and NSIS. Android builds additionally require Android SDK/NDK. Docker is needed for the disposable PostgreSQL/Supabase harness. See [deployment and recovery](docs/DEPLOYMENT_RUNBOOK.md), [setup guide](docs/ONBOARDING_AND_SETUP.md), and [database/migration notes](docs/PRODUCTION_UPGRADE_PATCH_PLAN.md).

```powershell
npm ci
Copy-Item .env.example .env.local
npm run lint
npm run build
npm test
```

Configure only the public Supabase URL and publishable key in `.env.local`. Keep `VITE_ENABLE_WEB_V2=false`; never put service-role keys, database passwords, terminal secrets, or signing keys in Vite variables. The example also keeps demo/offline switches disabled. See [.env.example](.env.example) and [web staging runbook](docs/WEB_V2_STAGING_RUNBOOK.md).

## Run and validate

```powershell
npm run dev                 # browser preview; not a trading terminal
npm run native:dev          # Tauri terminal
npm run test:browser        # Playwright desktop/mobile checks
npm run test:native         # Rust domain tests
npm run test:desktop        # Tauri Rust library tests
npm run test:cloud          # disposable PostgreSQL protocol tests
npm run audit:ui            # static control inventory, not acceptance
npm run docs:check
npm run verify              # source, browser, native-container, UI and docs gates
```

The cloud test harness creates a disposable local PostgreSQL environment; it does not migrate or verify the configured Supabase business project. A passing source or browser suite does not establish live sync, packaged-device operation, or physical printer output. Details and recovery steps are in [test evidence](docs/TEST_EVIDENCE.md).

## Windows terminal and staging

Build the Windows installer on a Windows build host with `bash scripts/deploy-windows-pos.sh --package`. Follow the [Windows installer and recovery runbook](docs/DEPLOYMENT_RUNBOOK.md#build-a-windows-installer) and [physical acceptance checklist](docs/BAR_PRODUCTION_ACCEPTANCE.md). Install the XP-80T driver/queue separately and verify actual paper output; packaging does not enroll or configure a business terminal.

Use a separate non-production Supabase project and Vercel Preview configuration for v2 rehearsal. Apply staged migrations only to disposable/staging infrastructure. Never activate browser business writes while the legacy snapshot uploader can also write. The cutover and rollback boundaries are in [web v2 staging](docs/WEB_V2_STAGING_RUNBOOK.md) and [deployment runbook](docs/DEPLOYMENT_RUNBOOK.md).

## Operations and design references

Start at the [documentation index](docs/README.md). See [architecture](docs/SYSTEM_ARCHITECTURE.md), [permissions](docs/RBAC_AND_PERMISSIONS.md), [business workflows](docs/MODULE_WORKFLOWS.md), [receipt specification](docs/RECEIPT_SPEC.md), [room and folio contracts](docs/EXPANSION_WORKFLOWS.md), and [expansion acceptance](docs/EXPANSION_ACCEPTANCE.md). M-Pesa is cashier-confirmed and reconciled from evidence; this app does not claim provider settlement, fiscal submission, bank disbursement, or messaging unless an actual configured integration reports it.
