[CmdletBinding()]
param(
    [string]$Repo = (Get-Location).Path,
    [switch]$DeepClean
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
    if (Test-Path "$env:USERPROFILE\.cargo\bin") {
        $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
    }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$File,
        [Parameter(ValueFromRemainingArguments=$true)][string[]]$Args
    )
    & $File @Args
    if ($LASTEXITCODE -ne 0) {
        throw "$File exited with code $LASTEXITCODE"
    }
}

$Repo = (Resolve-Path $Repo).Path
Set-Location $Repo

if (-not (Test-Path ".\src-tauri\Cargo.toml")) {
    throw "This does not look like the ServOS repository. src-tauri\Cargo.toml was not found in: $Repo"
}

Write-Host "ServOS Windows Rust/Tauri repair" -ForegroundColor Green
Write-Host "Repository: $Repo"

# ----------------------------------------------------------------------
# 1. Repair/check the prerequisites already defined by the ServOS repo.
# ----------------------------------------------------------------------

Write-Step "Checking ServOS Windows build prerequisites"

$bootstrap = Join-Path $Repo "scripts\bootstrap-windows-pos.ps1"
if (Test-Path $bootstrap) {
    try {
        & $bootstrap
    }
    catch {
        Write-Warning "The prerequisite check reported a missing or incompatible dependency."

        if (-not (Test-Admin)) {
            throw @"
Build prerequisites need repair.

Open PowerShell AS ADMINISTRATOR, return to:
$Repo

and run:

  Set-ExecutionPolicy -Scope Process Bypass
  .\repair-servos-rust.ps1

The script will then install/repair the required MSVC build stack.
"@
        }

        Write-Step "Installing/repairing ServOS Windows prerequisites"
        & $bootstrap -Install
    }
}
else {
    Write-Warning "ServOS bootstrap script is missing. Continuing with Rust repair only."
}

Refresh-Path

# ----------------------------------------------------------------------
# 2. Force the supported Windows Rust host/toolchain.
# ----------------------------------------------------------------------

Write-Step "Selecting the 64-bit Windows MSVC Rust toolchain"

if (-not (Get-Command rustup.exe -ErrorAction SilentlyContinue)) {
    throw "rustup.exe was not found after prerequisite repair."
}

Invoke-Native rustup.exe default stable-x86_64-pc-windows-msvc
Invoke-Native rustup.exe update stable-x86_64-pc-windows-msvc
Invoke-Native rustup.exe target add x86_64-pc-windows-msvc --toolchain stable-x86_64-pc-windows-msvc

# Keep this process on the intended toolchain even if another shell/profile
# previously selected GNU, nightly, or a cross-compilation target.
$env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-msvc"

Write-Host ""
rustup show
rustc -Vv
cargo -V

# ----------------------------------------------------------------------
# 3. Clear environment overrides that commonly break windows-sys/getrandom.
# ----------------------------------------------------------------------

Write-Step "Clearing conflicting Rust/Cargo environment overrides for this session"

$badOverrides = @(
    "CARGO_BUILD_TARGET",
    "CARGO_BUILD_BUILD_DIR",
    "RUSTFLAGS",
    "CARGO_ENCODED_RUSTFLAGS",
    "RUSTC_WRAPPER",
    "RUSTC_WORKSPACE_WRAPPER"
)

foreach ($name in $badOverrides) {
    if (Test-Path "Env:\$name") {
        Write-Host "Clearing $name=$([Environment]::GetEnvironmentVariable($name))"
        Remove-Item "Env:\$name" -ErrorAction SilentlyContinue
    }
}

# ----------------------------------------------------------------------
# 4. Remove failed cargo-install scratch builds.
# These are disposable and are NOT the ServOS project.
# ----------------------------------------------------------------------

Write-Step "Removing failed cargo-install temporary directories"

Get-ChildItem $env:TEMP -Directory -Filter "cargo-install*" -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-Host "Removing $($_.FullName)"
        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }

# ----------------------------------------------------------------------
# 5. Clean only ServOS Rust build artifacts first.
# ----------------------------------------------------------------------

Write-Step "Cleaning ServOS Rust build output"

Invoke-Native cargo.exe clean --manifest-path ".\src-tauri\Cargo.toml"

if ($DeepClean) {
    Write-Step "Deep-cleaning Cargo download/source cache"

    $cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE ".cargo" }

    foreach ($relative in @("registry\cache", "registry\src", "git\checkouts", "git\db")) {
        $p = Join-Path $cargoHome $relative
        if (Test-Path $p) {
            Write-Host "Removing $p"
            Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# ----------------------------------------------------------------------
# 6. Ensure JS dependencies correspond to package-lock.
# ----------------------------------------------------------------------

Write-Step "Installing exact ServOS Node dependencies"

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm was not found."
}

Invoke-Native npm.cmd ci

# ----------------------------------------------------------------------
# 7. Run the direct Rust check first and capture diagnostics.
# ----------------------------------------------------------------------

$logDir = Join-Path $Repo "artifacts\local-repair"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$checkLog = Join-Path $logDir "cargo-check-desktop.log"

Write-Step "Running direct desktop Cargo check"

& cargo.exe check --locked --manifest-path ".\src-tauri\Cargo.toml" 2>&1 |
    Tee-Object -FilePath $checkLog

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Cargo check still failed." -ForegroundColor Red
    Write-Host "Full log: $checkLog" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Useful error lines:" -ForegroundColor Yellow

    Select-String -Path $checkLog -Pattern `
        "error\[E[0-9]+\]", `
        "error:", `
        "linker", `
        "link.exe", `
        "LNK[0-9]+", `
        "windows-sys", `
        "getrandom", `
        "failed to run custom build command" `
        -Context 3,8 |
        Select-Object -First 12 |
        ForEach-Object { $_.ToString() }

    Write-Host ""
    Write-Host "Do NOT run 'cargo create-tauri-app'." -ForegroundColor Yellow
    Write-Host "ServOS already contains its Tauri application in src-tauri." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If the error now specifically mentions LINK.EXE, Windows SDK, rc.exe, or MSVC," -ForegroundColor Yellow
    Write-Host "restart Windows once, rerun this script as Administrator, then rerun without -DeepClean." -ForegroundColor Yellow
    exit $LASTEXITCODE
}

# ----------------------------------------------------------------------
# 8. Run the exact ServOS desktop/native gates.
# ----------------------------------------------------------------------

Write-Step "Running ServOS desktop source gate"
Invoke-Native npm.cmd run check:desktop

Write-Step "Running ServOS desktop tests"
Invoke-Native npm.cmd run test:desktop

Write-Step "Running ServOS native domain tests"
Invoke-Native npm.cmd run test:native

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " ServOS Rust / Windows desktop toolchain is healthy." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next:"
Write-Host "  npm run native:build"
Write-Host ""
Write-Host "Do not run cargo create-tauri-app; this repository is already a Tauri project."
