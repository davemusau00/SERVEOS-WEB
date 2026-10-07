#requires -RunAsAdministrator
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$BundlePath,
    [string]$NodeDistributionPath,
    [string]$BridgeOrigin = 'https://localhost:9443',
    [string]$ApprovedConfigPath,
    [string]$TlsPrivateKeyPath,
    [string]$TlsCertificatePath
)

$ErrorActionPreference = 'Stop'
$serviceName = 'ServOSPrintBridge'
$serviceDisplayName = 'ServOS Print Bridge'
$installRoot = Join-Path $env:ProgramFiles 'ServOS\Print Bridge'
$dataRoot = Join-Path $env:ProgramData 'ServOS\PrintBridge'
$serviceExecutable = Join-Path $installRoot 'servos-print-bridge-service.exe'
$launchConfigurationPath = Join-Path $dataRoot 'service-launch.json'

function Invoke-Sc([string[]]$Arguments) {
    & "$env:SystemRoot\System32\sc.exe" @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Service Control Manager rejected the requested operation (code $LASTEXITCODE)." }
}

if ($Uninstall) {
    $existing = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
    if (-not $existing) { Write-Output 'ServOS Print Bridge service is not registered.'; exit 0 }
    $expectedPrefix = '"' + $serviceExecutable + '" "' + $launchConfigurationPath + '"'
    if (-not $existing.PathName.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The registered service path does not match the ServOS Print Bridge installation. No service was changed.'
    }
    if ($existing.State -ne 'Stopped') {
        Stop-Service -Name $serviceName -ErrorAction Stop
        $service = Get-Service -Name $serviceName
        $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(40))
    }
    Invoke-Sc @('delete', $serviceName)
    Write-Output 'Service registration removed. Binaries, approved pairing, TLS key and print journal were preserved for review.'
    exit 0
}

if ([string]::IsNullOrWhiteSpace($BundlePath) -or [string]::IsNullOrWhiteSpace($NodeDistributionPath)) {
    throw 'Install requires -BundlePath and -NodeDistributionPath. No files or service settings were changed.'
}
$bundle = (Resolve-Path -LiteralPath $BundlePath).Path
$nodeDistribution = (Resolve-Path -LiteralPath $NodeDistributionPath).Path
if (-not (Test-Path -LiteralPath $nodeDistribution -PathType Container)) { throw 'NodeDistributionPath must be the root directory of a Node.js distribution.' }
$existingService = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
if ($existingService) { throw 'ServOS Print Bridge is already registered. Review its path and use -Uninstall before replacing it.' }

$requiredBundleFiles = @(
    'servos-print-bridge-service.exe',
    'servos-print-bridge.exe',
    'https-host.mjs'
)
foreach ($name in $requiredBundleFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $bundle $name) -PathType Leaf)) { throw "Bridge release bundle is missing $name." }
}
$nodeExecutable = Join-Path $nodeDistribution 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) { throw 'Node distribution must contain node.exe at its root.' }
$nodeVersion = (& $nodeExecutable --version | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v22\.') { throw 'The bridge host requires the Node.js 22 runtime used by the ServOS frontend toolchain.' }
$origin = $null
if (-not [Uri]::TryCreate($BridgeOrigin, [UriKind]::Absolute, [ref]$origin) -or $origin.Scheme -ne 'https' -or
    $origin.AbsoluteUri.TrimEnd('/') -ne $BridgeOrigin.TrimEnd('/') -or $origin.Host -notin @('localhost', '127.0.0.1') -or
    $origin.Port -lt 1024 -or $origin.UserInfo -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment) {
    throw 'BridgeOrigin must be an exact HTTPS localhost or 127.0.0.1 origin on a dedicated port.'
}
$persistedPairing = Join-Path $dataRoot 'approved-config.json'
$persistedKey = Join-Path $dataRoot 'localhost.key'
$persistedCertificate = Join-Path $dataRoot 'localhost.crt'
$existingPersistentNames = @()
if (Test-Path -LiteralPath $dataRoot -PathType Container) {
    $existingPersistentNames = @(Get-ChildItem -LiteralPath $dataRoot -Force -File | Where-Object Name -In @('approved-config.json', 'localhost.key', 'localhost.crt') | Select-Object -ExpandProperty Name)
}
$reusePersistentData = $existingPersistentNames.Count -gt 0
$persistentSetComplete = (Test-Path -LiteralPath $persistedPairing -PathType Leaf) -and (Test-Path -LiteralPath $persistedKey -PathType Leaf) -and (Test-Path -LiteralPath $persistedCertificate -PathType Leaf)
if ($reusePersistentData -and -not $persistentSetComplete) {
    throw 'Existing bridge pairing/TLS data is incomplete. No persisted key or pairing was replaced.'
}
$sourcePairing = $persistedPairing
$sourceTlsKey = $persistedKey
$sourceTlsCertificate = $persistedCertificate
if (-not $reusePersistentData) {
    if ([string]::IsNullOrWhiteSpace($ApprovedConfigPath) -or [string]::IsNullOrWhiteSpace($TlsPrivateKeyPath) -or [string]::IsNullOrWhiteSpace($TlsCertificatePath)) {
        throw 'For first install, pass the locally approved config and TLS key/certificate paths separately from the release bundle.'
    }
    $sourcePairing = (Resolve-Path -LiteralPath $ApprovedConfigPath).Path
    $sourceTlsKey = (Resolve-Path -LiteralPath $TlsPrivateKeyPath).Path
    $sourceTlsCertificate = (Resolve-Path -LiteralPath $TlsCertificatePath).Path
    foreach ($sourceFile in @($sourcePairing, $sourceTlsKey, $sourceTlsCertificate)) {
        if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw 'Approved pairing and TLS inputs must be existing files.' }
    }
}
try { $approvedConfig = Get-Content -LiteralPath $sourcePairing -Raw | ConvertFrom-Json }
catch { throw 'The locally approved bridge configuration is not valid JSON.' }
if ($approvedConfig.schemaVersion -ne 1 -or [string]::IsNullOrWhiteSpace([string]$approvedConfig.bridgeId) -or
    [string]::IsNullOrWhiteSpace([string]$approvedConfig.businessId) -or [string]::IsNullOrWhiteSpace([string]$approvedConfig.apiOrigin)) {
    throw 'The bridge configuration must contain approved bridge, business and API identities.'
}

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$nodeInstallRoot = Join-Path $installRoot 'node'
New-Item -ItemType Directory -Path $nodeInstallRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $bundle 'servos-print-bridge-service.exe') -Destination $serviceExecutable
Copy-Item -LiteralPath (Join-Path $bundle 'servos-print-bridge.exe') -Destination (Join-Path $installRoot 'servos-print-bridge.exe')
Copy-Item -LiteralPath (Join-Path $bundle 'https-host.mjs') -Destination (Join-Path $installRoot 'https-host.mjs')
Get-ChildItem -LiteralPath $nodeDistribution -Force | Copy-Item -Destination $nodeInstallRoot -Recurse -Force
if (-not $reusePersistentData) {
    Copy-Item -LiteralPath $sourcePairing -Destination $persistedPairing
    Copy-Item -LiteralPath $sourceTlsKey -Destination $persistedKey
    Copy-Item -LiteralPath $sourceTlsCertificate -Destination $persistedCertificate
}

$localServiceSid = '*S-1-5-19'
$systemSid = '*S-1-5-18'
$administratorsSid = '*S-1-5-32-544'
& "$env:SystemRoot\System32\icacls.exe" $installRoot /grant "$localServiceSid`:(OI)(CI)RX" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant the bridge service read/execute access to its binaries.' }
& "$env:SystemRoot\System32\icacls.exe" $dataRoot /inheritance:r /grant:r "$systemSid`:(OI)(CI)F" "$administratorsSid`:(OI)(CI)F" "$localServiceSid`:(OI)(CI)M" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to bridge configuration, TLS keys and delivery evidence.' }

$nodeInstall = Join-Path $nodeInstallRoot 'node.exe'
$hostScript = Join-Path $installRoot 'https-host.mjs'
$worker = Join-Path $installRoot 'servos-print-bridge.exe'
$approvedConfigPathInData = $persistedPairing
$journal = Join-Path $dataRoot 'print-journal.sqlite'
$tlsKey = Join-Path $dataRoot 'localhost.key'
$tlsCertificate = Join-Path $dataRoot 'localhost.crt'
$httpsOrigin = $BridgeOrigin
$serviceLaunch = @{
    nodeExecutable = $nodeInstall
    hostScript = $hostScript
    workerExecutable = $worker
    approvedConfiguration = $approvedConfigPathInData
    journalPath = $journal
    tlsPrivateKey = $tlsKey
    tlsCertificate = $tlsCertificate
    httpsOrigin = $httpsOrigin
} | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($launchConfigurationPath, $serviceLaunch, [System.Text.UTF8Encoding]::new($false))

$binaryPath = '"{0}" "{1}"' -f $serviceExecutable, $launchConfigurationPath
Invoke-Sc @('create', $serviceName, 'type=', 'own', 'start=', 'demand', 'obj=', 'NT AUTHORITY\LocalService', 'depend=', 'Spooler', 'binPath=', $binaryPath, 'DisplayName=', $serviceDisplayName)
Invoke-Sc @('description', $serviceName, 'Loopback-only authenticated host for authorized ServOS Print Bridge jobs.')
Write-Output "Installed $serviceDisplayName as a manual-start LocalService process at $httpsOrigin. Start it after verifying localhost TLS trust, printer queue ACLs and the approved device configuration."
Write-Output "Local service data and recovery evidence are protected under $dataRoot and are preserved by -Uninstall."
