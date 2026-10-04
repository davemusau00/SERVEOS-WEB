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
$schemaJson = & node.exe '.\scripts\terminal-release-schema.mjs'
if ($LASTEXITCODE -ne 0) { throw 'Could not verify native schema and canonical migration inventory.' }
$schemaEvidence = $schemaJson | ConvertFrom-Json

if ($package.version -ne '0.2.0') { throw "package.json must be 0.2.0, found $($package.version)" }
if ($tauri.version -ne '0.2.0') { throw "tauri.conf.json must be 0.2.0, found $($tauri.version)" }
if ($cargoVersion -ne '0.2.0') { throw "Cargo.toml must be 0.2.0, found $cargoVersion" }
if ($tauri.identifier -ne 'ke.servos.business') { throw "Application identifier changed: $($tauri.identifier)" }
if ($schemaEvidence.sqliteSchema -ne 15) { throw 'Existing-terminal cutover requires schema 15.' }

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
Write-Host "Schema:     $($schemaEvidence.sqliteSchema)"

Section 'Whitespace integrity'
Run 'git.exe' @('diff','--check')

Section 'Full source/browser/native-container verification'
if ($SkipSupabase) { throw 'A complete release gate cannot skip disposable Supabase verification.' }
Run 'npm.cmd' @('run','verify:release')
Run 'npm.cmd' @('run','test:browser')

Section 'Release-candidate verification complete'
Write-Host 'Source gates are green. Package/physical acceptance is still required.' -ForegroundColor Green
