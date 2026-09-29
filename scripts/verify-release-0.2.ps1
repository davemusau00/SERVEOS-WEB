[CmdletBinding()]
param(
    [string]$Repo = "",
    [switch]$AllowDirty,
    [switch]$SkipSupabase
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($Repo)) {
    $Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
$Repo = [IO.Path]::GetFullPath($Repo)
Set-Location -LiteralPath $Repo

function Section([string]$Text) {
    Write-Host ""
    Write-Host "== $Text ==" -ForegroundColor Cyan
}
function Run([string]$File, [string[]]$ArgumentList) {
    Write-Host ("> {0} {1}" -f $File, ($ArgumentList -join ' ')) -ForegroundColor DarkCyan
    & $File @ArgumentList
    if ($LASTEXITCODE -ne 0) { throw "$File exited with code $LASTEXITCODE" }
}

Section 'ServOS 0.2.0 release identity'
$package = Get-Content -LiteralPath '.\package.json' -Raw | ConvertFrom-Json
$tauri = Get-Content -LiteralPath '.\src-tauri\tauri.conf.json' -Raw | ConvertFrom-Json
$cargo = Get-Content -LiteralPath '.\src-tauri\Cargo.toml' -Raw
$cargoVersion = [regex]::Match($cargo, '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value
$migration13 = Get-Content -LiteralPath '.\src-tauri\migrations\013_customer_credit.sql' -Raw

if ($package.version -ne '0.2.0') { throw "package.json must be 0.2.0, found $($package.version)" }
if ($tauri.version -ne '0.2.0') { throw "tauri.conf.json must be 0.2.0, found $($tauri.version)" }
if ($cargoVersion -ne '0.2.0') { throw "Cargo.toml must be 0.2.0, found $cargoVersion" }
if ($tauri.identifier -ne 'ke.servos.business') { throw "Application identifier changed: $($tauri.identifier)" }
if ($migration13 -notmatch 'PRAGMA\s+user_version\s*=\s*13') { throw 'Schema-13 migration does not set PRAGMA user_version=13.' }

foreach ($required in @(
    '.\docs\EXISTING_TERMINAL_UPGRADE.md',
    '.\docs\RELEASE_0.2_ACCEPTANCE.md',
    '.\scripts\build-terminal-installer.ps1',
    '.\scripts\run-terminal-tests.ps1'
)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing release file: $required" }
}

$dirty = @(& git.exe status --porcelain)
if ($dirty.Count -gt 0 -and -not $AllowDirty) {
    $dirty | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    throw 'Release verification requires a clean working tree. Use -AllowDirty only while validating an uncommitted release-candidate patch.'
}
if ($dirty.Count -gt 0) {
    Write-Warning 'Validating a dirty working tree because -AllowDirty was supplied. Do not package production from this state.'
}

Write-Host "Version:    0.2.0"
Write-Host "Identifier: ke.servos.business"
Write-Host "Schema:     13"

Section 'Whitespace integrity'
Run 'git.exe' @('diff','--check')

Section 'Full source/browser/native-container verification'
Run 'npm.cmd' @('run','verify')

Section 'Windows native domain verification'
Run 'npm.cmd' @('run','test:native')

Section 'Tauri desktop library verification'
Run 'npm.cmd' @('run','test:desktop')

if (-not $SkipSupabase) {
    Section 'Disposable staged PostgreSQL verification'
    Run 'node.exe' @('scripts/test-supabase.mjs','--expansion')
} else {
    Write-Warning 'Supabase expansion verification skipped. This is not a complete release gate.'
}

Section 'Release-candidate verification complete'
Write-Host 'Source gates are green. Package/physical acceptance is still required.' -ForegroundColor Green
