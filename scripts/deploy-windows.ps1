[CmdletBinding()]
param(
    [ValidateSet('Check', 'Package', 'Install')]
    [string]$Mode = 'Package',
    [string]$Repo = "",
    [switch]$SkipTests,
    [switch]$Msi
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Repo)) { $Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
Set-Location -LiteralPath $Repo

function Write-Section {
    param([string]$Message)
    Write-Host ''
    Write-Host $Message -ForegroundColor Cyan
}

function Get-VsWhere {
    $path = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $path) { return $path }
    return $null
}

function Get-VsInstallPath {
    $vswhere = Get-VsWhere
    if (-not $vswhere) { return $null }
    $path = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($LASTEXITCODE -ne 0 -or -not $path) { return $null }
    return [string]$path
}

function Get-WebView2Path {
    $roots = @(
        (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft\EdgeWebView\Application'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\EdgeWebView\Application')
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $runtime = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
            Sort-Object { [version]$_.Name } -Descending |
            Select-Object -First 1
        if ($runtime -and (Test-Path (Join-Path $runtime.FullName 'msedgewebview2.exe'))) { return $runtime.FullName }
    }
    return $null
}

function Get-NodeVersion {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { return $null }
    $raw = (& $node.Source --version 2>$null | Select-Object -First 1)
    if ($raw -notmatch '^v?(\d+)\.(\d+)\.(\d+)') { return $null }
    return [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
}

function Import-VsDeveloperEnvironment {
    $installPath = Get-VsInstallPath
    if (-not $installPath) { throw 'Visual Studio C++ Build Tools are missing. Run scripts/bootstrap-windows-pos.ps1 -Install as Administrator.' }
    $vcvars = Join-Path $installPath 'VC\Auxiliary\Build\vcvars64.bat'
    if (-not (Test-Path $vcvars)) { throw 'The Visual Studio x64 developer environment script is missing. Install the Desktop development with C++ workload.' }
    $dumpPath = Join-Path $env:TEMP ('servos-vcenv-' + [guid]::NewGuid().ToString('N') + '.cmd')
    @(
        '@echo off'
        ('call "' + $vcvars + '" >nul')
        'if errorlevel 1 exit /b %errorlevel%'
        'set'
    ) | Set-Content -LiteralPath $dumpPath -Encoding Ascii
    try {
        $output = & $env:ComSpec /d /c ('"{0}"' -f $dumpPath)
        if ($LASTEXITCODE -ne 0) { throw 'Could not load the Visual Studio x64 developer environment.' }
        foreach ($line in $output) {
            $separator = $line.IndexOf('=')
            if ($separator -gt 0) {
                $name = $line.Substring(0, $separator)
                $value = $line.Substring($separator + 1)
                Set-Item -Path ('Env:' + $name) -Value $value
            }
        }
    } finally {
        Remove-Item -LiteralPath $dumpPath -Force -ErrorAction SilentlyContinue
    }
    if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) { throw 'MSVC compiler cl.exe was not found after loading the Visual Studio environment.' }
}

function Get-PrinterQueues {
    if (-not (Get-Command Get-Printer -ErrorAction SilentlyContinue)) { return @() }
    return @(Get-Printer -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '(?i)XP.?80|POS.?80|Xprinter' -or $_.DriverName -match '(?i)XP.?80|Xprinter' })
}

function Show-TerminalStatus {
    $os = Get-CimInstance Win32_OperatingSystem
    Write-Host ("OS: {0} ({1}, build {2})" -f $os.Caption, $os.OSArchitecture, $os.BuildNumber)
    if ($os.Caption -match 'Windows 10') {
        Write-Warning 'Standard Windows 10 support ended on 2025-10-14. Confirm applicable ESU/LTSC coverage before live use.'
    }
    if ($os.OSArchitecture -notmatch '64') { throw 'ServOS Windows packaging currently targets 64-bit Windows only.' }

    $nodeVersion = Get-NodeVersion
    if (-not $nodeVersion) { throw 'Node.js is missing or could not report a version.' }
    $nodeReady = (($nodeVersion -ge [version]'20.19.0') -and ($nodeVersion -lt [version]'21.0.0')) -or ($nodeVersion -ge [version]'22.12.0')
    if (-not $nodeReady) { throw "Node.js $nodeVersion is unsupported. Install Node 20.19+ or 22.12+." }
    Write-Host ("Node.js: {0}" -f $nodeVersion)
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm.cmd is missing. Reinstall Node.js LTS and reopen this terminal.' }

    $rustup = Get-Command rustup.exe -ErrorAction SilentlyContinue
    $cargo = Get-Command cargo.exe -ErrorAction SilentlyContinue
    if (-not $rustup -or -not $cargo) { throw 'Rust/Cargo are missing. Run scripts/bootstrap-windows-pos.ps1 -Install as Administrator.' }
    $toolchain = (& $rustup.Source show active-toolchain 2>$null | Select-Object -First 1)
    if ($toolchain -notmatch 'x86_64-pc-windows-msvc') { throw "Rust MSVC toolchain is required; active toolchain is: $toolchain" }
    Write-Host ("Rust: {0}" -f $toolchain)

    if (-not (Get-VsInstallPath)) { throw 'Visual Studio C++ Build Tools are missing. Run scripts/bootstrap-windows-pos.ps1 -Install as Administrator.' }
    if (-not (Get-WebView2Path)) { throw 'Microsoft Edge WebView2 Runtime is missing. Run scripts/bootstrap-windows-pos.ps1 -Install as Administrator.' }
    Import-VsDeveloperEnvironment
    Write-Host 'MSVC compiler: available'
    Write-Host 'WebView2 Runtime: available'

    $queues = Get-PrinterQueues
    if ($queues.Count -eq 0) {
        Write-Warning 'No Xprinter/XP-80 printer queue is visible. USB receipt output will remain unverified until the driver-backed Windows queue is added.'
    } else {
        Write-Host 'Detected XP-80 printer queues:'
        $queues | ForEach-Object { Write-Host ("  {0} | {1} | {2}" -f $_.Name, $_.DriverName, $_.PortName) }
    }
}

function Ensure-CloudConfiguration {
    if (-not (Test-Path '.env.local')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
        throw 'Created .env.local from the template. Configure the dedicated business Supabase URL and publishable key, then rerun. Do not add a service-role/secret key.'
    }
    $content = Get-Content -LiteralPath '.env.local' -Raw
    $urlMatch = [regex]::Match($content, '(?m)^\s*VITE_SUPABASE_URL\s*=\s*([^\r\n#]+)')
    $keyMatch = [regex]::Match($content, '(?m)^\s*VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*([^\r\n#]+)')
    if (-not $urlMatch.Success -or -not $keyMatch.Success) {
        throw '.env.local must define VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    }
    $urlValue = $urlMatch.Groups[1].Value.Trim().Trim('"').Trim("'")
    $keyValue = $keyMatch.Groups[1].Value.Trim().Trim('"').Trim("'")
    $parsedUrl = $null
    if (-not [uri]::TryCreate($urlValue, [UriKind]::Absolute, [ref]$parsedUrl) -or
        $parsedUrl.Scheme -ne 'https' -or $parsedUrl.Host -notmatch '\.supabase\.co$') {
        throw 'VITE_SUPABASE_URL must be an HTTPS Supabase project URL. The value was not printed.'
    }
    if ([string]::IsNullOrWhiteSpace($keyValue) -or $keyValue -match '(?i)your-publishable-key|service[_-]?role|secret') {
        throw 'VITE_SUPABASE_PUBLISHABLE_KEY is missing, still a placeholder, or appears privileged. The value was not printed.'
    }
    Write-Host 'Supabase client configuration: present (values hidden)'
}

function Invoke-Checked {
    param([Parameter(Mandatory)][string]$Command, [Parameter(Mandatory)][string[]]$Arguments)
    Write-Host ''
    Write-Host ('> {0} {1}' -f $Command, ($Arguments -join ' ')) -ForegroundColor DarkCyan
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw ("Command failed: {0} (exit code {1})" -f $Command, $LASTEXITCODE) }
}

Write-Section ("ServOS Windows {0}: {1}" -f $Mode, (Resolve-Path -LiteralPath $Repo).Path)
Show-TerminalStatus
if ($Mode -eq 'Check') {
    Write-Host ''
    Write-Host 'Preflight passed. Printer queue visibility is informational; test paper output during hardware acceptance.' -ForegroundColor Green
    return
}

Ensure-CloudConfiguration
if ($Msi) {
    $optionalFeature = Get-Command Get-WindowsOptionalFeature -ErrorAction SilentlyContinue
    if ($optionalFeature) {
        $vbscript = Get-WindowsOptionalFeature -Online -FeatureName VBSCRIPT -ErrorAction SilentlyContinue
        if ($vbscript -and $vbscript.State -ne 'Enabled') {
            throw 'The Windows VBSCRIPT optional feature is disabled. Enable it in Settings > Apps > Optional features > More Windows features, then rerun --msi.'
        }
    } else {
        Write-Warning 'Could not inspect VBSCRIPT. Tauri MSI bundling requires the Windows VBSCRIPT optional feature.'
    }
}

Write-Section 'Install locked npm dependencies'
Invoke-Checked -Command 'npm.cmd' -Arguments @('ci')

if (-not $SkipTests) {
    Write-Section 'Run frontend, browser and native acceptance checks'
    Invoke-Checked -Command 'npx.cmd' -Arguments @('playwright', 'install', 'chromium')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'lint')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'contracts:check')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('test')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'test:browser')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'test:browser:production')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'test:cloud:base')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'test:cloud:v2')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'check:desktop')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'test:native')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'test:desktop')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'docs:check')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'audit:ui')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'protocol:check')
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'audit:ui:gate')
} else {
    Write-Warning 'Tests were skipped. This package run is not release verification.'
}

Write-Section 'Build Windows installer'
if (-not $SkipTests) {
    $sourceChanges = @(& git.exe status --porcelain)
    if ($LASTEXITCODE -ne 0 -or $sourceChanges.Count -gt 0) { throw 'Required checks changed the release source. Commit the reviewed generated files and rebuild from a clean checkout.' }
}
$env:VITE_ENABLE_DEMO = 'false'
$env:VITE_ENABLE_WEB_V2 = 'false'
$packageStarted = (Get-Date).ToUniversalTime()
$bundle = if ($Msi) { 'msi' } else { 'nsis' }
Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'native:build', '--', '--bundles', $bundle, '--', '--locked')

$cargoTargetDirectory = Join-Path $Repo 'src-tauri\target'
if (-not [string]::IsNullOrWhiteSpace($env:CARGO_TARGET_DIR)) {
    $cargoTargetDirectory = [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)
}
$bundleDirectory = Join-Path $cargoTargetDirectory 'release\bundle'
$installer = Get-ChildItem -LiteralPath $bundleDirectory -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
        if ($Msi) { $_.Extension -eq '.msi' }
        else { $_.Extension -eq '.exe' -and $_.Name -match '(?i)setup' }
    } |
    Where-Object { $_.LastWriteTimeUtc -ge $packageStarted } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $installer) { throw "Tauri build returned, but no $bundle installer was found under $bundleDirectory." }
$installerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer.FullName).Hash.ToLowerInvariant()
$checksumPath = $installer.FullName + '.sha256'
Set-Content -LiteralPath $checksumPath -Value ("{0}  {1}" -f $installerHash, $installer.Name) -Encoding Ascii
Write-Host ''
Write-Host ("Installer created: {0}" -f $installer.FullName) -ForegroundColor Green
Write-Host ("SHA-256 sidecar:   {0}" -f $checksumPath)

if ($Mode -eq 'Install') {
    $confirmation = Read-Host 'Run this installer now? Type Y to install ServOS'
    if ($confirmation -match '^(?i)y$') {
        if ($Msi) {
            $quotedInstaller = '"{0}"' -f $installer.FullName
            $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $quotedInstaller) -Wait -PassThru
        } else {
            $process = Start-Process -FilePath $installer.FullName -Wait -PassThru
        }
        if ($process.ExitCode -notin @(0, 3010)) { throw "ServOS installer exited with code $($process.ExitCode)." }
        if ($process.ExitCode -eq 3010) { Write-Warning 'Windows requested a restart to finish installing ServOS.' }
        Write-Host 'Installer finished. Launch ServOS from the Start menu and complete the real first-run setup.'
    } else {
        Write-Host 'Package is ready. Run it manually when the terminal is ready for installation.'
    }
}
