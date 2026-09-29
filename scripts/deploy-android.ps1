param([string]$Repo=(Get-Location).Path,[switch]$Initialize)
$ErrorActionPreference='Stop'; Set-Location $Repo
if(-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT){throw 'ANDROID_HOME or ANDROID_SDK_ROOT is required'}
foreach($cmd in @('node','npm','rustc','cargo')){if(-not(Get-Command $cmd -ErrorAction SilentlyContinue)){throw "$cmd is required"}}
if(-not(Test-Path '.env.local')){throw '.env.local is required'}
npm ci; npm run lint; npm test; npm run docs:check; npm run build
if($Initialize){npm run tauri -- android init}
npm run tauri -- android build
Write-Host 'Android package complete. Inspect src-tauri\gen\android\app\build\outputs.' -ForegroundColor Green
