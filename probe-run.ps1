$ErrorActionPreference = 'Continue'
Set-Location 'c:\Users\Admin\Downloads\SERVEOS-V2'

$container = 'servos-probe-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$container | Set-Content .pc.txt

docker run --rm -d --name $container -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18.6-bookworm | Out-Null
for ($i = 0; $i -lt 60; $i++) {
  $r = docker exec $container psql -U postgres -Atqc 'select 1' 2>$null
  if ($r -eq '1') { break }
  Start-Sleep -Seconds 2
}
Write-Output 'CONTAINER_READY'

$listFile = '.probe_chain.txt'
node -e "import('./scripts/canonical-migrations.mjs').then(m=>{const f=['tests/supabase/bootstrap.sql',...m.baseMigrations().map(m.migrationPath),'tests/supabase/protocol.sql',...m.v2Migrations().map(m.migrationPath)];require('fs').writeFileSync('.probe_chain.txt',f.join('\n')+'\n')})"

foreach ($f in (Get-Content $listFile)) {
  if (-not $f.Trim()) { continue }
  Get-Content $f -Raw | docker exec -i $container psql -U postgres -q -o NUL -v ON_ERROR_STOP=1 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Output ("CHAIN_FAIL " + $f) }
}
Write-Output 'CHAIN_APPLIED'

Write-Output '--- PROBE: maintenance parts with fractional cost rate ---'
Get-Content 'tests/supabase/_probe_maintenance_cost.sql' -Raw | docker exec -i $container psql -U postgres -q -o NUL -v ON_ERROR_STOP=1 2>&1 | Select-Object -Last 8
Write-Output '--- END PROBE ---'
