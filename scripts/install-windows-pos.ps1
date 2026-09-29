[CmdletBinding()]
param(
    [string]$InstallerPath,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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

function Install-WebView2 {
    $tempRoot = Join-Path $env:TEMP ('servos-webview2-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    $bootstrapper = Join-Path $tempRoot 'MicrosoftEdgeWebView2Setup.exe'
    try {
        Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper -UseBasicParsing
        $signature = Get-AuthenticodeSignature -FilePath $bootstrapper
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
            throw 'WebView2 installer signature is not valid for Microsoft.'
        }
        $process = Start-Process -FilePath $bootstrapper -ArgumentList @('/silent', '/install') -Wait -PassThru
        if ($process.ExitCode -notin @(0, 3010)) { throw "WebView2 installer exited with code $($process.ExitCode)." }
    } finally {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$os = Get-CimInstance Win32_OperatingSystem
if ($os.OSArchitecture -notmatch '64') { throw 'This ServOS release targets 64-bit Windows.' }
Write-Host ("Detected {0} ({1}, build {2})." -f $os.Caption, $os.OSArchitecture, $os.BuildNumber) -ForegroundColor Cyan
if ($os.Caption -match 'Windows 10') {
    Write-Warning 'Standard Windows 10 support ended on 2025-10-14. Confirm applicable ESU/LTSC coverage before live use.'
}

$installer = $null
if (-not $CheckOnly -and -not [string]::IsNullOrWhiteSpace($InstallerPath)) {
    $installer = Get-Item -LiteralPath $InstallerPath -ErrorAction Stop
    if ($installer.Extension -ne '.exe') { throw 'Pass the NSIS Windows setup executable (.exe), not a source archive or MSI.' }
    $checksumPath = $installer.FullName + '.sha256'
    if (Test-Path $checksumPath) {
        $hashLine = (Get-Content -LiteralPath $checksumPath -Raw).Trim()
        $expectedHash = ($hashLine -split '\s+')[0]
        if ($expectedHash -notmatch '^[0-9a-fA-F]{64}$') { throw 'Installer checksum sidecar has an invalid SHA-256 value.' }
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer.FullName).Hash
        if ($actualHash -ne $expectedHash) { throw 'Installer SHA-256 does not match its sidecar; do not run it.' }
        Write-Host 'Installer SHA-256: verified'
    } else {
        Write-Warning 'No .sha256 sidecar found. Transfer the hash file generated beside the installer for an integrity check.'
    }
}

if (-not (Get-WebView2Path)) {
    Write-Host 'WebView2 Runtime is missing; installing the Microsoft Evergreen Runtime.'
    Install-WebView2
}
if (-not (Get-WebView2Path)) { throw 'WebView2 Runtime is still unavailable after its installer completed.' }
Write-Host 'WebView2 Runtime: available'

$printerQueues = @()
if (Get-Command Get-Printer -ErrorAction SilentlyContinue) {
    $printerQueues = @(Get-Printer -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '(?i)XP.?80|POS.?80|Xprinter' -or $_.DriverName -match '(?i)XP.?80|Xprinter' })
}
if ($printerQueues.Count -eq 0) {
    Write-Warning 'No XP-80 printer queue is visible. For USB, install the XP-80 driver and run configure-xprinter-usb.ps1 as Administrator.'
} else {
    Write-Host 'Detected XP-80 printer queues:'
    $printerQueues | ForEach-Object { Write-Host ("  {0} | {1} | {2}" -f $_.Name, $_.DriverName, $_.PortName) }
}

if ($CheckOnly) {
    Write-Host 'Windows runtime preflight passed. This check does not verify printed paper.' -ForegroundColor Green
    return
}
if (-not $installer) {
    Write-Host 'Copy the NSIS setup executable and its .sha256 sidecar here, then rerun with -InstallerPath.'
    return
}

$confirmation = Read-Host ("Install ServOS from {0}? Type Y to continue" -f $installer.Name)
if ($confirmation -notmatch '^(?i)y$') {
    Write-Host 'Installation cancelled.'
    return
}
$process = Start-Process -FilePath $installer.FullName -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "ServOS installer exited with code $($process.ExitCode)." }
Write-Host 'ServOS installer finished. Launch the app and complete actual owner enrollment and Business Setup.'
