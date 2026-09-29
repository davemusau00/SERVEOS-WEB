param(
    [string]$OutputPath = "",
    [switch]$ExistingInstallation,
    [string]$LocalAuditPath = ""
)

$ErrorActionPreference = "Stop"

function Try-Value([scriptblock]$Block) {
    try { & $Block } catch { $null }
}

$os = Try-Value { Get-CimInstance Win32_OperatingSystem }
$computer = Try-Value { Get-CimInstance Win32_ComputerSystem }
$systemDrive = Try-Value { Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'" }
$timezone = Try-Value { Get-TimeZone }
$printers = Try-Value { Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus }
$adapters = Try-Value { Get-NetAdapter | Where-Object Status -eq "Up" | Select-Object Name, InterfaceDescription, LinkSpeed, MacAddress }
$power = Try-Value { (powercfg /GETACTIVESCHEME 2>$null | Out-String).Trim() }

$ramGb = if ($computer) { [math]::Round($computer.TotalPhysicalMemory / 1GB, 2) } else { $null }
$freeGb = if ($systemDrive) { [math]::Round($systemDrive.FreeSpace / 1GB, 2) } else { $null }
$utcOffset = [TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalHours

$checks = [ordered]@{
    Is64BitOS = [Environment]::Is64BitOperatingSystem
    RamAtLeast4GB = if ($ramGb -ne $null) { $ramGb -ge 4 } else { $null }
    FreeDiskAtLeast5GB = if ($freeGb -ne $null) { $freeGb -ge 5 } else { $null }
    NairobiUtcOffset = ($utcOffset -eq 3)
    PrintSpoolerRunning = ((Try-Value { (Get-Service Spooler).Status.ToString() }) -eq "Running")
}
$appDataPath = Join-Path $env:APPDATA 'ke.servos.business'
$databasePath = Join-Path $appDataPath 'servos.sqlite'
$installation = [ordered]@{
    WindowsUser = [Environment]::UserName
    Identifier = 'ke.servos.business'
    ApplicationDataPath = $appDataPath
    DatabasePresent = (Test-Path -LiteralPath $databasePath -PathType Leaf)
    ServOSRunning = [bool](Get-Process -Name servos -ErrorAction SilentlyContinue)
    DatabaseRead = $false
    Audit = $null
}
if ($ExistingInstallation) {
    $checks.ExistingDatabasePresent = $installation.DatabasePresent
    $checks.LocalAuditProvided = -not [string]::IsNullOrWhiteSpace($LocalAuditPath)
}
if ($LocalAuditPath) {
    $audit = Get-Content -LiteralPath $LocalAuditPath -Raw | ConvertFrom-Json
    if ($audit.mode -ne 'READ_ONLY_LOCAL_AUDIT') { throw 'Expected an exported ServOS read-only local audit.' }
    # Only an explicit safe subset is copied into the hardware report.
    $installation.Audit = [ordered]@{
        GeneratedAt = $audit.generatedAt
        AppVersion = $audit.appVersion
        SchemaVersion = $audit.database.schemaVersion
        QuickCheck = $audit.database.quickCheck
        TerminalId = $audit.installation.terminalId
        Stage = $audit.installation.stage
        ProjectHostname = $audit.installation.projectHostname
        LastSync = $audit.installation.lastSync
        PendingOutbox = $audit.operations.outboxPending
        LastOutboxSequence = $audit.operations.lastOutboxSequence
    }
    $checks.AuditHasTerminalIdentity = -not [string]::IsNullOrWhiteSpace($audit.installation.terminalId)
    $checks.AuditDatabaseHealthy = $audit.database.quickCheck -eq 'ok'
    $checks.AuditIsLive = $audit.installation.stage -eq 'LIVE'
    $checks.AuditRecent = ((Get-Date).ToUniversalTime() - [datetime]$audit.generatedAt).TotalHours -le 24
}

$report = [ordered]@{
    GeneratedAt = (Get-Date).ToString("o")
    Mode = "READ_ONLY_TERMINAL_DOCTOR"
    ComputerName = $env:COMPUTERNAME
    OS = if ($os) { "$($os.Caption) $($os.Version)" } else { $null }
    Architecture = $env:PROCESSOR_ARCHITECTURE
    RamGB = $ramGb
    SystemDriveFreeGB = $freeGb
    TimeZone = if ($timezone) { $timezone.Id } else { $null }
    UtcOffsetHours = $utcOffset
    ActivePowerScheme = $power
    Printers = @($printers)
    ActiveNetworkAdapters = @($adapters)
    Checks = $checks
    ExistingInstallation = $installation
    OverallPass = -not ($checks.Values -contains $false) -and -not ($checks.Values -contains $null)
    Note = "Read-only diagnostic. It changes no Windows, ServOS, printer, network or power settings."
}

$json = $report | ConvertTo-Json -Depth 8
if ($OutputPath) {
    $resolved = [IO.Path]::GetFullPath($OutputPath)
    [IO.File]::WriteAllText($resolved, $json, [Text.UTF8Encoding]::new($false))
    Write-Host "ServOS terminal doctor report: $resolved"
}
$json
