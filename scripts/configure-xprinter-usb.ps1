[CmdletBinding()]
param(
    [string]$QueueName = 'XP-80T USB',
    [string]$DriverName = 'XP-80C',
    [string]$PortName = 'USB001'
)

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from PowerShell as Administrator so Windows can create the local printer queue.'
}

Import-Module PrintManagement -ErrorAction Stop

$port = Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue
if (-not $port) {
    $usbPorts = Get-PrinterPort -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^USB\d+$' } |
        Select-Object -ExpandProperty Name
    $portText = if ($usbPorts) { $usbPorts -join ', ' } else { 'none found' }
    throw "Windows printer port '$PortName' is not registered. USB ports found: $portText. Reconnect the powered printer and check Windows Printers & scanners."
}

$existing = Get-Printer -Name $QueueName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.PortName -ne $PortName -or $existing.DriverName -notmatch '(?i)XP.?80|Xprinter|POS.?80') {
        throw "Queue '$QueueName' already exists, but it is not an XP-80 series queue on '$PortName'. Inspect it in Windows Printers & scanners before changing it."
    }
    Write-Host ("Existing XP-80 queue is ready: {0} | {1} | {2}" -f $existing.Name, $existing.DriverName, $existing.PortName) -ForegroundColor Green
    return
}

$existing = Get-Printer -ErrorAction SilentlyContinue |
    Where-Object { $_.PortName -eq $PortName -and ($_.Name -match '(?i)XP.?80|POS.?80|Xprinter' -or $_.DriverName -match '(?i)XP.?80|Xprinter') } |
    Select-Object -First 1
if ($existing) {
    Write-Host ("Using existing queue on the requested USB port: {0} | {1} | {2}" -f $existing.Name, $existing.DriverName, $existing.PortName) -ForegroundColor Green
    Write-Host 'Enter this exact queue name in ServOS Till Setup. No duplicate queue was created.'
    return
}

$driver = Get-PrinterDriver -Name $DriverName -ErrorAction SilentlyContinue
if (-not $driver) {
    $installed = Get-PrinterDriver -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '(?i)XP.?80|Xprinter|POS.?80' } |
        Select-Object -ExpandProperty Name
    $installedText = if ($installed) { $installed -join ', ' } else { 'none found' }
    throw "Printer driver '$DriverName' is not registered. XP-80 series drivers found: $installedText. Install the XP-80 series driver first, or pass its exact name with -DriverName."
}

Add-Printer -Name $QueueName -DriverName $DriverName -PortName $PortName
$created = Get-Printer -Name $QueueName -ErrorAction Stop
if ($created.DriverName -ne $DriverName -or $created.PortName -ne $PortName) {
    throw "Windows created '$QueueName' with an unexpected driver or port. Inspect the queue before use."
}

Write-Host ("XP-80T USB queue created: {0} | {1} | {2}" -f $created.Name, $created.DriverName, $created.PortName) -ForegroundColor Green
Write-Host 'This confirms Windows queue registration only. Open ServOS Till Setup, select XP-80T direct USB, and inspect a test slip plus both receipt copies on paper.'
