# ServOS Terminal Build & Test Tools

Copy these two scripts into the repository `scripts` directory:

- `build-terminal-installer.ps1`
- `run-terminal-tests.ps1`

They are designed for the current ServOS Windows/Tauri build.

## 1. Build a release installer

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\build-terminal-installer.ps1
```

The script:

1. requires a clean Git checkpoint by default;
2. verifies `package.json` and `tauri.conf.json` versions match;
3. calls the existing `scripts/deploy-windows.ps1 -Mode Package`;
4. therefore runs the existing frontend/browser/native/desktop/docs/UI validation gate unless `-SkipTests` is explicitly supplied;
5. builds a Tauri NSIS setup executable by default;
6. verifies the generated SHA-256 sidecar;
7. creates `release\ServOS-Terminal-v<version>-<commit>-nsis`;
8. copies the installer, hash, install helper, terminal doctor and terminal test script;
9. creates `servos-terminal-release.json` and `INSTALL.txt`;
10. never copies `.env.local`, SQLite databases, backups, PINs or Supabase credentials.

Optional MSI build:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\build-terminal-installer.ps1 `
  -Msi
```

Do not use `-SkipTests` for a release candidate.

## 2. Test a terminal

### From the repository on the actual terminal

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\run-terminal-tests.ps1 `
  -Repo C:\Users\Admin\Downloads\servos
```

This runs:

- Windows x64 / WebView2 / Print Spooler checks;
- the Patch 10 terminal doctor;
- installed ServOS executable discovery;
- clean source checkpoint check;
- TypeScript lint;
- Node source tests;
- native Rust tests;
- desktop Rust tests;
- production frontend build;
- Playwright browser acceptance;
- UI audit;
- docs check.

It does **not** kill an existing process on port 3000. It reports the owner and fails that check.

### From the deployment folder, without source

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\run-terminal-tests.ps1 `
  -DeploymentFolder . `
  -SkipSourceTests
```

This verifies the host, terminal doctor, deployment manifest/hash and installed executable.

## Manual acceptance remains mandatory

The PowerShell test runner deliberately does not fake or mutate the live ServOS acceptance state.

After automated tests pass, use the native app:

`Business Admin → Physical terminal acceptance`

and complete backup/restore rehearsal, physical printer paper, scanner, optional drawer, true process restart, offline SQLite operation, reconnect/cloud resync and Admin final acceptance.
