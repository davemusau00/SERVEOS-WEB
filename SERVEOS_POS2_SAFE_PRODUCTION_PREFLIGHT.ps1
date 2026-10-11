# ServOS POS 2.0 - read-only production inventory. DOES NOT DEPLOY OR CHANGE ANYTHING.
# Run in Windows PowerShell: powershell -NoProfile -ExecutionPolicy Bypass -File .\SERVEOS_POS2_SAFE_PRODUCTION_PREFLIGHT.ps1
param(
    [string]$Server = 'administrator@93.127.131.55',
    [string]$Key = "$env:USERPROFILE\.ssh\id_ed25519"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Key -PathType Leaf)) {
    throw "SSH key missing: $Key"
}

function Check([string]$Name, [string]$RemoteCommand) {
    Write-Host "`n========== $Name ==========" -ForegroundColor Cyan
    & ssh.exe -T -o BatchMode=yes -o ConnectTimeout=10 -i $Key $Server $RemoteCommand
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw "$Name failed (SSH exit code $code). No changes were made." }
}

Write-Host 'ServOS 2.0 production preflight. READ ONLY. No changes to VPS.' -ForegroundColor Yellow
Check 'DATE AND SYSTEM' 'date -u; uptime; free -h; df -h /'
Check 'ALL DOCKER CONTAINERS' 'sudo -n docker ps -a'
Check 'ALL COMPOSE PROJECTS' 'sudo -n docker compose ls --all'
Check 'VOLUMES' 'sudo -n docker volume ls'
Check 'NEW PRODUCTION API HEALTH' 'curl -fsS --max-time 10 http://127.0.0.1:3102/health/ready'
Check 'NEW API CONTAINER DIGEST AND HEALTH' "sudo -n docker inspect serveos-next-api-1 --format '{{.Image}} | {{.State.Status}} | {{.State.Health.Status}} | restarts={{.RestartCount}}'"
Check 'NEW PWA ACTIVE RELEASE' 'readlink -f /var/www/serveos-next/current'
Check 'NGINX VALIDATION' 'sudo -n nginx -t'
Check 'SERVOS ROUTES ONLY' "sudo -n grep -E 'root /var/www/serveos|proxy_pass http://127.0.0.1:31' /etc/nginx/sites-enabled/serveos-production"
Check 'NEW CONTAINERS ONLY' 'sudo -n docker ps --filter label=com.docker.compose.project=serveos-next'
Check 'SMS PLATFORM' 'sudo -n docker ps --filter label=com.docker.compose.project=sms-platform'
Check 'SMS AFRICA' 'sudo -n docker ps --filter label=com.docker.compose.project=sms-platform-africa'
foreach ($hostname in @('detailskilonzo.com','sms.detailskilonzo.com','africa.detailskilonzo.com','serveos.davemusau.co.ke','serveosapi.davemusau.co.ke')) {
    $path = if ($hostname -eq 'serveosapi.davemusau.co.ke') { '/health/ready' } else { '/' }
    $remote = "curl --silent --show-error --output /dev/null --write-out 'HTTP=%{http_code} TLS=%{ssl_verify_result}' --resolve '${hostname}:443:127.0.0.1' 'https://${hostname}${path}'"
    # Deliberately do not follow redirects; 307 on the SMS login sites can be normal.
    Check "HTTPS $hostname" $remote
}
Write-Host "`nPREFLIGHT_FINISHED=YES (READ ONLY)" -ForegroundColor Green
Write-Host 'Do not proceed with deployment if the active source, balances, pending commands or backup status are unknown.'
