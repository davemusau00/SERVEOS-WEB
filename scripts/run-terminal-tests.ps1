[CmdletBinding()]
param(
    [string]$Repo = "",
    [string]$DeploymentFolder = "",
    [string]$OutputPath = "",
    [switch]$SkipSourceTests,
    [switch]$SkipBrowser,
    [switch]$AllowDirtySource
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Section([string]$Message) {
    Write-Host ''
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

$results = [System.Collections.Generic.List[object]]::new()

function Add-Result {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Detail,
        [double]$Seconds = 0
    )
    $results.Add([pscustomobject]@{
        Name = $Name
        Passed = $Passed
        Detail = $Detail
        Seconds = [math]::Round($Seconds, 2)
    })
    if ($Passed) {
        Write-Host ("PASS  {0}  {1}" -f $Name, $Detail) -ForegroundColor Green
    } else {
        Write-Host ("FAIL  {0}  {1}" -f $Name, $Detail) -ForegroundColor Red
    }
}

function Invoke-TestProcess {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [string]$WorkingDirectory = ""
    )
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $params = @{
            FilePath = $FilePath
            ArgumentList = $ArgumentList
            Wait = $true
            PassThru = $true
            NoNewWindow = $true
        }
        if ($WorkingDirectory) { $params.WorkingDirectory = $WorkingDirectory }
        $process = Start-Process @params
        $sw.Stop()
        Add-Result -Name $Name -Passed ($process.ExitCode -eq 0) -Detail "exit $($process.ExitCode)" -Seconds $sw.Elapsed.TotalSeconds
        return ($process.ExitCode -eq 0)
    } catch {
        $sw.Stop()
        Add-Result -Name $Name -Passed $false -Detail $_.Exception.Message -Seconds $sw.Elapsed.TotalSeconds
        return $false
    }
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
        if ($runtime -and (Test-Path (Join-Path $runtime.FullName 'msedgewebview2.exe'))) {
            return $runtime.FullName
        }
    }
    return $null
}

function Get-ServOSInstall {
    $uninstallRoots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($root in $uninstallRoots) {
        foreach ($entry in @(Get-ItemProperty $root -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'ServOS' })) {
            $candidate = $null
            if ($entry.DisplayIcon) {
                $candidate = ([string]$entry.DisplayIcon).Trim('"').Split(',')[0]
                if ($candidate -and (Test-Path $candidate)) {
                    return [pscustomobject]@{ Entry = $entry; Executable = $candidate }
                }
            }
            if ($entry.InstallLocation) {
                foreach ($name in @('ServOS.exe','servos.exe')) {
                    $candidate = Join-Path $entry.InstallLocation $name
                    if (Test-Path $candidate) {
                        return [pscustomobject]@{ Entry = $entry; Executable = $candidate }
                    }
                }
            }
        }
    }

    foreach ($candidate in @(
        (Join-Path $env:LOCALAPPDATA 'ServOS\ServOS.exe'),
        (Join-Path $env:LOCALAPPDATA 'ServOS\servos.exe'),
        (Join-Path $env:ProgramFiles 'ServOS\ServOS.exe'),
        (Join-Path $env:ProgramFiles 'ServOS\servos.exe')
    )) {
        if ($candidate -and (Test-Path $candidate)) {
            return [pscustomobject]@{ Entry = $null; Executable = $candidate }
        }
    }
    return $null
}

if ([string]::IsNullOrWhiteSpace($DeploymentFolder)) {
    $DeploymentFolder = $PSScriptRoot
}
$DeploymentFolder = [IO.Path]::GetFullPath($DeploymentFolder)

if ([string]::IsNullOrWhiteSpace($Repo)) {
    $candidate = Split-Path -Parent $PSScriptRoot
    if (Test-Path (Join-Path $candidate 'package.json')) {
        $Repo = $candidate
    }
}
if ($Repo) { $Repo = [IO.Path]::GetFullPath($Repo) }

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $DeploymentFolder ("servos-terminal-test-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)

Write-Section 'Host and deployment checks'

$os = Get-CimInstance Win32_OperatingSystem
Add-Result 'Windows x64' ($os.OSArchitecture -match '64') "$($os.Caption) $($os.OSArchitecture) build $($os.BuildNumber)"

$webView = Get-WebView2Path
Add-Result 'WebView2 runtime' ([bool]$webView) $(if ($webView) { $webView } else { 'not found' })

$spooler = Get-Service Spooler -ErrorAction SilentlyContinue
Add-Result 'Print Spooler' ($spooler -and $spooler.Status -eq 'Running') $(if ($spooler) { $spooler.Status.ToString() } else { 'service not found' })

$doctor = Join-Path $DeploymentFolder 'servos-terminal-doctor.ps1'
if (-not (Test-Path $doctor) -and $Repo) {
    $doctor = Join-Path $Repo 'scripts\servos-terminal-doctor.ps1'
}
if (Test-Path $doctor) {
    try {
        $doctorRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $doctor 2>$null
        $doctorText = ($doctorRaw -join [Environment]::NewLine).Trim()
        $doctorJsonStart = $doctorText.IndexOf('{')
        if ($doctorJsonStart -ge 0) {
            $doctorReport = $doctorText.Substring($doctorJsonStart) | ConvertFrom-Json
            Add-Result 'Terminal doctor' ([bool]$doctorReport.OverallPass) "RAM $($doctorReport.RamGB) GB; free disk $($doctorReport.SystemDriveFreeGB) GB; timezone $($doctorReport.TimeZone)"
        } else {
            Add-Result 'Terminal doctor' $false 'doctor did not return JSON'
        }
    } catch {
        Add-Result 'Terminal doctor' $false $_.Exception.Message
    }
} else {
    Add-Result 'Terminal doctor' $false 'servos-terminal-doctor.ps1 not found'
}

$manifestPath = Join-Path $DeploymentFolder 'servos-terminal-release.json'
$manifest = $null
if (Test-Path $manifestPath) {
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $installerPath = Join-Path $DeploymentFolder $manifest.Installer
        $sidecarPath = $installerPath + '.sha256'
        if ((Test-Path $installerPath) -and (Test-Path $sidecarPath)) {
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
            $expected = [string]$manifest.InstallerSha256
            Add-Result 'Deployment installer SHA-256' ($actual -eq $expected.ToLowerInvariant()) $actual
        } else {
            Add-Result 'Deployment installer SHA-256' $false 'installer or sidecar missing'
        }
    } catch {
        Add-Result 'Deployment manifest' $false $_.Exception.Message
    }
} else {
    Add-Result 'Deployment manifest' $true 'not supplied; source-terminal mode'
}

$installed = Get-ServOSInstall
if ($installed) {
    $exeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installed.Executable).Hash.ToLowerInvariant()
    $versionInfo = (Get-Item $installed.Executable).VersionInfo
    Add-Result 'ServOS installed executable' $true "$($installed.Executable); version $($versionInfo.FileVersion); sha256 $exeHash"
} else {
    Add-Result 'ServOS installed executable' $false 'ServOS was not found in uninstall registry/common install paths'
}

Write-Section 'Source acceptance suite'

if ($SkipSourceTests) {
    Add-Result 'Source tests' $true 'skipped explicitly'
} elseif (-not $Repo -or -not (Test-Path (Join-Path $Repo 'package.json'))) {
    Add-Result 'Source tests' $false 'repository not found; pass -Repo or use -SkipSourceTests for installed-only checks'
} else {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        Add-Result 'npm availability' $false 'npm.cmd not found'
    } else {
        $gitCommit = ''
        if (Get-Command git.exe -ErrorAction SilentlyContinue) {
            $gitCommit = (& git.exe -C $Repo rev-parse HEAD 2>$null).Trim()
            $dirty = @(& git.exe -C $Repo status --porcelain 2>$null)
            if ($dirty.Count -gt 0 -and -not $AllowDirtySource) {
                Add-Result 'Clean source checkpoint' $false "$($dirty.Count) working-tree change(s); source tests not release-traceable"
            } else {
                Add-Result 'Clean source checkpoint' $true $(if ($dirty.Count) { 'dirty allowed explicitly' } else { "commit $gitCommit" })
            }
        }

        if ($manifest -and $gitCommit) {
            Add-Result 'Source matches release manifest' ($gitCommit -eq [string]$manifest.GitCommit) "source $gitCommit; release $($manifest.GitCommit)"
        }

        $tests = @(
            @{ Name='TypeScript lint'; Args=@('run','lint') },
            @{ Name='Node source tests'; Args=@('test') },
            @{ Name='Native domain tests'; Args=@('run','test:native') },
            @{ Name='Desktop Rust tests'; Args=@('run','test:desktop') },
            @{ Name='Production frontend build'; Args=@('run','build') }
        )
        foreach ($test in $tests) {
            [void](Invoke-TestProcess -Name $test.Name -FilePath 'npm.cmd' -ArgumentList $test.Args -WorkingDirectory $Repo)
        }

        if ($SkipBrowser) {
            Add-Result 'Browser acceptance' $true 'skipped explicitly'
        } else {
            $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($listener) {
                $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
                Add-Result 'Browser acceptance' $false "port 3000 already in use by PID $($listener.OwningProcess) $($owner.ProcessName); process was not killed"
            } else {
                [void](Invoke-TestProcess -Name 'Browser acceptance' -FilePath 'npm.cmd' -ArgumentList @('run','test:browser') -WorkingDirectory $Repo)
            }
        }

        [void](Invoke-TestProcess -Name 'UI inventory audit' -FilePath 'npm.cmd' -ArgumentList @('run','audit:ui') -WorkingDirectory $Repo)
        [void](Invoke-TestProcess -Name 'Documentation checks' -FilePath 'npm.cmd' -ArgumentList @('run','docs:check') -WorkingDirectory $Repo)
    }
}

Write-Section 'Manual native acceptance still required'
$manual = @(
    'Business Admin > Physical terminal acceptance > Backup / restore rehearsal',
    'Send printer test slip and physically confirm paper',
    'Arm barcode scanner test and scan a real code',
    'Cash drawer physical/manual observation if Intake expects a drawer',
    'Begin restart challenge, fully close/relaunch ServOS, sign in, then confirm restart recovery',
    'Disconnect networking and run offline SQLite probe',
    'Reconnect, run Sync and verify recovery, require outbox = 0',
    'Admin final acceptance with till closed and print queue clean'
)
$manual | ForEach-Object { Write-Host "  [MANUAL] $_" -ForegroundColor Yellow }

$failed = @($results | Where-Object { -not $_.Passed })
$report = [ordered]@{
    GeneratedAt = (Get-Date).ToString('o')
    ComputerName = $env:COMPUTERNAME
    Mode = if ($Repo) { 'TERMINAL_PLUS_SOURCE_TESTS' } else { 'INSTALLED_TERMINAL_TESTS' }
    Repo = $Repo
    DeploymentFolder = $DeploymentFolder
    Results = @($results)
    AutomatedPass = ($failed.Count -eq 0)
    ManualAcceptanceRequired = $manual
    Note = 'This script never edits the ServOS business SQLite database, never fabricates hardware evidence, and never kills a process occupying port 3000.'
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

Write-Host ''
Write-Host "Report: $OutputPath"
if ($failed.Count -gt 0) {
    Write-Host "$($failed.Count) automated check(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host 'All automated terminal checks passed. Complete the native Business Admin acceptance sequence before Go Live.' -ForegroundColor Green
exit 0
