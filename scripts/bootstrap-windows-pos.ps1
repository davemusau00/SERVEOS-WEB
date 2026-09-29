[CmdletBinding()]
param([switch]$Install)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-VsWherePath {
    $installerPath = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $installerPath) { return $installerPath }
    return $null
}

function Get-VsInstallPath {
    $vswhere = Get-VsWherePath
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

function Get-GitBashPath {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'),
        (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Git\bin\bash.exe')
    )
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($git) {
        $gitRoot = Split-Path -Parent (Split-Path -Parent $git.Source)
        $candidates += Join-Path $gitRoot 'bin\bash.exe'
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

function Get-NodeStatus {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { return @{ Path = $null; Version = $null; Ready = $false } }
    $rawVersion = (& $node.Source --version 2>$null | Select-Object -First 1)
    if ($rawVersion -notmatch '^v?(\d+)\.(\d+)\.(\d+)') {
        return @{ Path = $node.Source; Version = [string]$rawVersion; Ready = $false }
    }
    $version = [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
    $ready = (($version -ge [version]'20.19.0') -and ($version -lt [version]'21.0.0')) -or ($version -ge [version]'22.12.0')
    return @{ Path = $node.Source; Version = $version.ToString(); Ready = $ready }
}

function Get-RustStatus {
    $rustup = Get-Command rustup.exe -ErrorAction SilentlyContinue
    $cargo = Get-Command cargo.exe -ErrorAction SilentlyContinue
    if (-not $rustup -or -not $cargo) { return @{ Ready = $false; Toolchain = 'not installed' } }
    $toolchain = (& $rustup.Source show active-toolchain 2>$null | Select-Object -First 1)
    return @{ Ready = ($toolchain -match 'x86_64-pc-windows-msvc'); Toolchain = [string]$toolchain }
}

function Show-PrerequisiteStatus {
    $node = Get-NodeStatus
    $rust = Get-RustStatus
    $vsPath = Get-VsInstallPath
    $bashPath = Get-GitBashPath
    $webViewPath = Get-WebView2Path
    Write-Host ''
    Write-Host 'ServOS Windows terminal build prerequisites' -ForegroundColor Cyan
    Write-Host ('  Git Bash:        {0}' -f $(if ($bashPath) { $bashPath } else { 'missing' }))
    Write-Host ('  Node.js:         {0}' -f $(if ($node.Path) { $node.Version } else { 'missing' }))
    Write-Host ('  Rust MSVC:       {0}' -f $(if ($rust.Toolchain -and $rust.Toolchain -ne 'not installed') { $rust.Toolchain } else { 'missing' }))
    Write-Host ('  C++ Build Tools: {0}' -f $(if ($vsPath) { $vsPath } else { 'missing' }))
    Write-Host ('  WebView2:        {0}' -f $(if ($webViewPath) { $webViewPath } else { 'missing' }))

    $missing = [System.Collections.Generic.List[string]]::new()
    if (-not $bashPath) { $missing.Add('Git for Windows (Git Bash)') }
    if (-not $node.Ready) { $missing.Add('Node.js LTS (package requires Node 20.19+ or 22.12+)') }
    if (-not $rust.Ready) { $missing.Add('Rust stable x86_64-pc-windows-msvc') }
    if (-not $vsPath) { $missing.Add('Visual Studio C++ Build Tools with Desktop development with C++') }
    if (-not $webViewPath) { $missing.Add('Microsoft Edge WebView2 Runtime') }
    return $missing
}

function Assert-AuthenticodeSignature {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Publisher)
    $signature = Get-AuthenticodeSignature -FilePath $Path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch $Publisher) {
        throw "Installer signature check failed for $([IO.Path]::GetFileName($Path)); expected a valid $Publisher signature."
    }
}

function Invoke-Download {
    param([Parameter(Mandatory)][string]$Uri, [Parameter(Mandatory)][string]$Path)
    Invoke-WebRequest -Uri $Uri -OutFile $Path -UseBasicParsing
    if (-not (Test-Path $Path) -or (Get-Item $Path).Length -lt 1024) { throw "Download failed or was incomplete: $Uri" }
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = @($machinePath, $userPath) -join ';'
}

function Install-GitForWindows {
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -Headers @{ 'User-Agent' = 'ServOS-Windows-Bootstrap' }
    $asset = $release.assets | Where-Object { $_.name -match '^Git-.*-64-bit\.exe$' } | Select-Object -First 1
    if (-not $asset) { throw 'Git for Windows release did not contain the x64 installer.' }
    $path = Join-Path $script:tempRoot $asset.name
    Invoke-Download -Uri $asset.browser_download_url -Path $path
    Assert-AuthenticodeSignature -Path $path -Publisher 'Git for Windows|Open Source Developer'
    if ($asset.digest -match '^sha256:(.+)$') {
        $actual = (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLowerInvariant()
        if ($actual -ne $Matches[1].ToLowerInvariant()) { throw 'Git for Windows installer checksum mismatch.' }
    }
    $process = Start-Process -FilePath $path -ArgumentList @('/VERYSILENT', '/NORESTART', '/SP-') -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "Git for Windows installer exited with code $($process.ExitCode)." }
    Refresh-ProcessPath
}

function Install-NodeLts {
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $release = $releases | Where-Object { $_.lts -and $_.files -contains 'win-x64-msi' } | Select-Object -First 1
    if (-not $release) { throw 'Could not find a Node.js LTS Windows x64 MSI.' }
    $fileName = "node-$($release.version)-x64.msi"
    $baseUri = "https://nodejs.org/dist/$($release.version)"
    $msiPath = Join-Path $script:tempRoot $fileName
    Invoke-Download -Uri "$baseUri/$fileName" -Path $msiPath
    $checksumText = (Invoke-WebRequest -Uri "$baseUri/SHASUMS256.txt" -UseBasicParsing).Content
    $checksumLine = $checksumText -split '\r?\n' | Where-Object { $_ -match "\s\*?$([regex]::Escape($fileName))$" } | Select-Object -First 1
    if (-not $checksumLine) { throw 'Node.js release checksum list did not include its MSI.' }
    $expected = ($checksumLine -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -Path $msiPath).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw 'Node.js MSI checksum mismatch.' }
    Assert-AuthenticodeSignature -Path $msiPath -Publisher 'OpenJS|Node.js'
    $quotedMsiPath = '"{0}"' -f $msiPath
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', $quotedMsiPath, '/qn', '/norestart') -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "Node.js installer exited with code $($process.ExitCode)." }
    Refresh-ProcessPath
}

function Install-RustMsvc {
    $path = Join-Path $script:tempRoot 'rustup-init.exe'
    $uri = 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
    Invoke-Download -Uri $uri -Path $path
    $checksumText = (Invoke-WebRequest -Uri "$uri.sha256" -UseBasicParsing).Content
    $expected = [regex]::Match($checksumText, '(?i)\b[0-9a-f]{64}\b').Value.ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLowerInvariant()
    if (-not $expected -or $actual -ne $expected) { throw 'rustup-init.exe checksum verification failed.' }
    $process = Start-Process -FilePath $path -ArgumentList @('-y', '--default-host', 'x86_64-pc-windows-msvc', '--default-toolchain', 'stable', '--profile', 'minimal') -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "Rustup installer exited with code $($process.ExitCode)." }
    Refresh-ProcessPath
    $rustup = Get-Command rustup.exe -ErrorAction SilentlyContinue
    if ($rustup) {
        & $rustup.Source default stable-x86_64-pc-windows-msvc
        if ($LASTEXITCODE -ne 0) { throw 'Could not select stable Windows MSVC Rust.' }
    }
}

function Install-VisualStudioBuildTools {
    $path = Join-Path $script:tempRoot 'vs_BuildTools.exe'
    Invoke-Download -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -Path $path
    Assert-AuthenticodeSignature -Path $path -Publisher 'Microsoft Corporation'
    $arguments = @('--quiet', '--wait', '--norestart', '--nocache', '--add', 'Microsoft.VisualStudio.Workload.VCTools', '--includeRecommended')
    $process = Start-Process -FilePath $path -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "Visual Studio Build Tools installer exited with code $($process.ExitCode)." }
}

function Install-WebView2 {
    $path = Join-Path $script:tempRoot 'MicrosoftEdgeWebView2Setup.exe'
    Invoke-Download -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -Path $path
    Assert-AuthenticodeSignature -Path $path -Publisher 'Microsoft Corporation'
    $process = Start-Process -FilePath $path -ArgumentList @('/silent', '/install') -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "WebView2 installer exited with code $($process.ExitCode)." }
}

$os = Get-CimInstance Win32_OperatingSystem
if ($os.OSArchitecture -notmatch '64') { throw 'ServOS Windows packaging currently targets 64-bit Windows only.' }
Write-Host ("Detected {0} ({1}, build {2})." -f $os.Caption, $os.OSArchitecture, $os.BuildNumber) -ForegroundColor Cyan
if ($os.Caption -match 'Windows 10') { Write-Warning 'Standard Windows 10 support ended on 2025-10-14. Confirm applicable ESU/LTSC coverage before live use.' }

$missing = Show-PrerequisiteStatus
if (-not $Install) {
    if ($missing.Count -gt 0) {
        Write-Host ''
        Write-Host 'Missing or incompatible prerequisites:' -ForegroundColor Yellow
        $missing | ForEach-Object { Write-Host "  - $_" }
        Write-Host ''
        Write-Host 'Run this script again from an elevated PowerShell window with -Install.'
        throw 'Prerequisite check failed. Install the listed tools, then rerun the check.'
    } else { Write-Host 'Prerequisite check passed.' }
    return
}

if (-not (Test-Administrator)) { throw 'Prerequisite installation requires an elevated PowerShell window. Reopen PowerShell as Administrator and rerun with -Install.' }
if ($missing.Count -eq 0) {
    Write-Host 'All build prerequisites are already present; no installers need to run.' -ForegroundColor Green
    return
}
Write-Host ''
Write-Host 'The following installers will run from official project/vendor download endpoints:' -ForegroundColor Yellow
$missing | ForEach-Object { Write-Host "  - $_" }
$confirmation = Read-Host 'Continue? Type Y to install'
if ($confirmation -notmatch '^(?i)y$') {
    throw 'Installation cancelled. No prerequisites were changed.'
}

$script:tempRoot = Join-Path $env:TEMP ("servos-pos-bootstrap-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $script:tempRoot | Out-Null
try {
    if (-not (Get-GitBashPath)) { Install-GitForWindows }
    if (-not (Get-NodeStatus).Ready) { Install-NodeLts }
    if (-not (Get-RustStatus).Ready) { Install-RustMsvc }
    if (-not (Get-VsInstallPath)) { Install-VisualStudioBuildTools }
    if (-not (Get-WebView2Path)) { Install-WebView2 }
} finally {
    Remove-Item -LiteralPath $script:tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$remaining = Show-PrerequisiteStatus
if ($remaining.Count -gt 0) {
    Write-Host ''
    $remaining | ForEach-Object { Write-Host "Still missing: $_" -ForegroundColor Red }
    throw 'Prerequisite installation finished with missing items. Restart Windows if requested, then rerun the check.'
}
Write-Host ''
Write-Host 'Prerequisite installation completed. Close and reopen the terminal, then run:' -ForegroundColor Green
Write-Host '  ./scripts/deploy-windows-pos.sh --check'
