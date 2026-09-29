# Deployment and recovery runbook

## ServOS 0.2.0 existing-terminal deployment

For an already-enrolled business, deployment is an **upgrade**, not a fresh install.

1. Complete `EXISTING_TERMINAL_UPGRADE.md`.
2. Build only from a clean committed tree.
3. Run `scripts/build-terminal-installer.ps1` without `-SkipTests`.
4. Prefer the default NSIS package for the first accepted 0.2.0 release.
5. Rehearse schema-12 migration on an isolated copy of existing application data.
6. Install under the same Windows user and preserve `ke.servos.business` data.
7. Do not repeat Intake.
8. Complete `RELEASE_0.2_ACCEPTANCE.md` on the real scanner/printer terminal.
9. Do not activate staged PostgreSQL/web-v2 authority during this release.

The release manifest must continue to report physical acceptance as pending until target-device acceptance is actually completed.

## Configuration

Create `.env.local` from `.env.example` with the dedicated business Supabase project URL and publishable key. Never put a privileged service key in the client.

Apply the checked-in Supabase migrations in filename order to an isolated rehearsal project before production. Provision the owner's Auth identity and `servos_private.managers` owner membership using the actual Auth UUID.

## Build a Windows installer

Run this on a 64-bit Windows build computer with administrator access. Node, Rust and Visual Studio are build tools; do not install that full toolchain on the cashier terminal just to run ServOS.

1. Check out the repository on the build computer.
2. Open **PowerShell as Administrator** in the repository and run:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\scripts\bootstrap-windows-pos.ps1 -Install
   ```

   This installs Git for Windows/Git Bash, Node.js LTS, Rust's 64-bit MSVC toolchain and Visual Studio C++ Build Tools. It installs WebView2 only if it is missing. Restart the terminal after installation.
3. Open **Git Bash** in the repository and run:

   ```bash
   bash scripts/deploy-windows-pos.sh --check
   ```

4. Configure `.env.local` from `.env.example` with the production business Supabase project URL and publishable key. These values are bundled into the frontend at build time, so changing `.env.local` later requires a rebuild. Never use a service-role or secret key in the client. Apply/rehearse the checked-in migrations and provision the real owner identity before enrolling the production terminal.
5. Build and verify the installer:

   ```bash
   bash scripts/deploy-windows-pos.sh --package
   ```

   The output path and a SHA-256 sidecar are printed. Copy both files to the POS terminal. `--skip-tests` is for local packaging iterations only, not release evidence. `--msi` builds an MSI instead of the default NSIS setup executable; Tauri requires Windows' optional **VBScript** feature for MSI. Use `--install` only when you want to install the package on this build computer.

## Install on a fresh Windows POS terminal

The target machine does not need Bash, Node, Rust or C++ Build Tools. Copy the generated setup executable, its `.sha256` file and `scripts/install-windows-pos.ps1` to it. For USB setup, also copy `scripts/configure-xprinter-usb.ps1` and `scripts/test-xprinter-usb.ps1`. The installer script checks 64-bit Windows, installs WebView2 only when missing, verifies the sidecar when provided, and then offers to launch the setup executable.

The current NSIS setup executable is unsigned. The `.sha256` sidecar detects file changes but does not identify a publisher, so Windows may show an unknown-publisher or reputation warning. A trusted code-signing certificate is needed for a publisher-identified installer.

For USB printing, install the XP-80T vendor driver, connect and power on the printer, then run elevated PowerShell:

```powershell
.\scripts\configure-xprinter-usb.ps1
```

The helper reuses a compatible XP-80 queue already assigned to the requested USB port, avoiding duplicate queues. Otherwise it creates queue `XP-80T USB` from driver `XP-80C` on port `USB001`. If Windows assigned different names, pass `-QueueName`, `-DriverName` or `-PortName` explicitly. To send a short non-sale RAW test slip and inspect paper output, run:

```powershell
.\scripts\test-xprinter-usb.ps1 -QueueName '<queue name printed above>' -Send
```

Use the exact queue name printed by the setup helper. The test slip sends no cash-drawer signal. A successful spooler response alone does not prove paper output; confirm the slip physically printed.

Install ServOS:

```powershell
.\scripts\install-windows-pos.ps1 -InstallerPath .\ServOS_0.2.0_x64-setup.exe
```

Use the exact installer filename produced by the build. Complete Intake → owner enrollment → Business Setup → Go Live with real business data. In Till Setup choose the exact USB queue or configure the XP-80T LAN address, then print and inspect the test slip and customer/business receipt pair. This terminal will not use a cash drawer. Follow [BAR_PRODUCTION_ACCEPTANCE.md](BAR_PRODUCTION_ACCEPTANCE.md) before live trading and the [XP-80T guide](user-guide/31-xprinter-xp-80t.md) for hardware checks.

Standard Windows 10 Home/Pro/Enterprise reached end of support on 2025-10-14. Before live sales, confirm the exact edition is covered by applicable ESU or an in-support LTSC lifecycle, or move to a supported Windows release. The install script warns but does not block installation.

## Build on other platforms

Windows PowerShell alternative:

```powershell
.\scripts\deploy-windows.ps1
```

Linux:

```bash
./scripts/deploy-linux.sh
```

Android:

```powershell
.\scripts\deploy-android.ps1 -Initialize
```

The scripts require Node/npm, Rust/Cargo and platform Tauri prerequisites. Android additionally requires SDK/NDK configuration.

## Vercel expansion preparation (planned, not deployed)

Production browser builds must set `VITE_ENABLE_WEB_V2=false` until coordinated v2 cutover acceptance. Transactional web mode requires both this frontend feature flag and the server-side `servos_v2.control.enabled` state. Use `VITE_ENABLE_WEB_V2=true` only on an isolated Vercel preview/staging deployment connected to an isolated non-production Supabase project. See [WEB_V2_STAGING_RUNBOOK.md](WEB_V2_STAGING_RUNBOOK.md).

Source now includes `vercel.json`. Production browser builds open authenticated Remote Manager; `VITE_ENABLE_DEMO=true` explicitly enables sample UI (browser tests set it only for their own build). `VITE_ENABLE_WEB_OFFLINE=true` opts into shell caching, not offline business finalization. Default is false. Never publish the browser-test demo build as production.

Staged protocol SQL is under `supabase/expansion`, deliberately excluded from normal legacy migrations. `npm run test:cloud -- --expansion` applies the legacy baseline and v2 expansion only to a disposable Docker PostgreSQL instance; it does not connect to Supabase. The v2 web workspaces/domain handlers are staging implementations, not production multi-device acceptance. The native desktop v2 adapter, signed offline grants, hosted migration acceptance, and cutover/recovery rehearsal remain open. Follow [the staging runbook](WEB_V2_STAGING_RUNBOOK.md); do not run these staged files against the business project as a deployment shortcut.

Host the Vite frontend on Vercel: install `npm ci`, build `npm run build`, output `dist`. Keep preview and production projects/environment values separate; preview must use disposable non-production Supabase data. Only `VITE_SUPABASE_URL` and publishable frontend keys are public. Never place service-role keys, database credentials or device secrets in VITE variables.

Before release: configure Supabase Auth site/redirect URLs for the exact HTTPS app domain; verify login/logout/session expiry, security headers, deep links, shell-cache version and unsupported-client behavior. Production must open authenticated operations; samples require explicit demo configuration. Browser printing uses OS/PDF; direct RAW USB/LAN printing stays desktop or explicitly assigned registered agent.

Do not enable web operational writes against current `servos_upload`. First implement/rehearse v2 command APIs and grants, back up both stores, drain legacy outbox, checkpoint/import stable history and balances, register devices, issue allocations, disable legacy upload and then enable compatible writers. Reconcile counts/balances/audit before trading. After v2 writes, rollback cannot re-enable an old snapshot-upload client; use forward repair or coordinated restore/replay.

Service-worker and IndexedDB upgrades must preserve pending commands. Lost browser storage requires outstanding-allocation quarantine and manager reconciliation. A disconnected or replaced device cannot silently have its resources reassigned. Actual Vercel publication and live migration are separate release actions; documentation/configuration is not deployment evidence.

## Release gate

Run `npm run verify`, then complete [BAR_PRODUCTION_ACCEPTANCE.md](BAR_PRODUCTION_ACCEPTANCE.md) on each supported packaged target. A browser preview or successful frontend build is not native acceptance.

## Backup/recovery

Current source creates a consistent local SQLite backup including pending outbox state and local credentials. Target policy remains daily-close and pre-upgrade copies, seven daily + four weekly retained, encrypted remote copies, and verified replacement-terminal restore with the old terminal fenced before synchronization.

## Receipt printer

Till Setup now offers direct XP-80T LAN ESC/POS (TCP 9100), direct Windows USB RAW queue, OS print dialog, and manual-copy profiles. The native path formats 48-column text by default and can cut between customer and business copies. Failed sends are saved locally for retry; an interrupted send is marked uncertain to avoid silent duplicate receipts. Use the setup test slip to check the connection.

On the connected Windows 11 host, Windows exposes the XP-80T as `Printer POS-80` on `USB001`. The existing queue is `Xprinter XP-80`, using driver `Xprinter XP-80`; the vendor `XP-80C` driver is also registered. `scripts/test-xprinter-usb.ps1` sent a short non-sale RAW slip through that USB queue. It physically printed after paper was loaded, as confirmed by the operator. This verifies one USB RAW test slip on this Windows 11 host. ServOS packaged-app printing, the customer/business receipt pair, cutter behavior and the fresh Windows 10 installation still need acceptance. LAN printing is unverified. This site does not use a cash drawer.
