param(
  [ValidateSet('ApiKeys', 'VerifyKeys', 'TenantId', 'ReleaseRecord', 'Alerts', 'TestAlert', 'Monitor', 'Pwa', 'RouteRollback')]
  [string]$Mode = 'ApiKeys',
  [string]$ReleaseId = '',
  [string]$ArchivePath = ''
)

$ErrorActionPreference = 'Stop'
$ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'
$identity = Join-Path $env:USERPROFILE '.ssh\id_ed25519'
$destination = 'administrator@93.127.131.55'
$vaultPath = Join-Path $env:LOCALAPPDATA 'ServOS\credentials\production-signing-keys-20261009.dpapi'

function Invoke-SecureSshInput([string]$RemoteCommand, [string]$InputText) {
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $ssh
  $start.Arguments = "-i `"$identity`" -o BatchMode=yes $destination $RemoteCommand"
  $start.UseShellExecute = $false
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::Start($start)
  $process.StandardInput.Write($InputText)
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($stdout) { Write-Output $stdout.TrimEnd() }
  if ($process.ExitCode -ne 0) { throw "Secure SSH update failed (exit $($process.ExitCode)): $($stderr.Trim())" }
}

if ($Mode -eq 'ApiKeys') {
  $vault = Get-Content -LiteralPath $vaultPath -Raw
  $plain = [System.Net.NetworkCredential]::new('', (ConvertTo-SecureString $vault)).Password
  $record = ConvertFrom-Json $plain
  $payload = @{
    OFFLINE_GRANT_PRIVATE_JWK = $record.offlineGrant.privateJwk | ConvertTo-Json -Compress
    OFFLINE_GRANT_KEY_VERSION = $record.offlineGrant.keyId
    PRINT_BRIDGE_PRIVATE_JWK = $record.printBridge.privateJwk | ConvertTo-Json -Compress
    PRINT_BRIDGE_KEY_VERSION = $record.printBridge.keyId
  } | ConvertTo-Json -Compress
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
  $python = @"
import base64,json,os,pathlib,tempfile
d=json.loads(base64.b64decode("$encoded"))
p=pathlib.Path("/opt/serveos-prod/env/production.env")
old=p.read_text()
keys=set(d)
lines=[x for x in old.splitlines() if not any(x.startswith(k+"=") for k in keys)]
lines.extend(k+"="+json.dumps(v,separators=(",",":")) for k,v in d.items())
fd,t=tempfile.mkstemp(dir=str(p.parent),prefix=".production.")
os.fchmod(fd,0o600)
f=os.fdopen(fd,"w")
f.write("\n".join(lines)+"\n")
f.flush()
os.fsync(f.fileno())
f.close()
os.chown(t,0,0)
os.replace(t,p)
print("production-signing-keys-installed")
"@
  Invoke-SecureSshInput 'sudo python3 -' $python
}
elseif ($Mode -eq 'VerifyKeys') {
  $publicDir = Join-Path $env:LOCALAPPDATA 'ServOS\credentials\public'
  $expected = @{
    offline = Get-Content -LiteralPath (Join-Path $publicDir 'offline-grant-public-20261009.json') -Raw | ConvertFrom-Json
    bridge = Get-Content -LiteralPath (Join-Path $publicDir 'print-bridge-api-public-20261009.json') -Raw | ConvertFrom-Json
  } | ConvertTo-Json -Compress
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($expected))
  $javascript = @"
import crypto from 'node:crypto';
const expected=JSON.parse(Buffer.from('$encoded','base64').toString('utf8'));
for (const [name,privateName,versionName,expectedKey] of [
 ['offline','OFFLINE_GRANT_PRIVATE_JWK','OFFLINE_GRANT_KEY_VERSION',expected.offline],
 ['bridge','PRINT_BRIDGE_PRIVATE_JWK','PRINT_BRIDGE_KEY_VERSION',expected.bridge],
]) {
 const raw=process.env[privateName];
 if(!raw||!process.env[versionName]) throw new Error(name+' API signing key is unavailable');
 const key=crypto.createPrivateKey({key:JSON.parse(raw),format:'jwk'});
 const actual=key.export({format:'jwk'});
 if(actual.kty!==expectedKey.kty||actual.crv!==expectedKey.crv||actual.x!==expectedKey.x||actual.y!==expectedKey.y) throw new Error(name+' public/private key mismatch');
 console.log(name+' signing key verified; version='+process.env[versionName]);
}
"@
  Invoke-SecureSshInput 'sudo docker exec -i serveos-prod-api-1 node -' $javascript
}
elseif ($Mode -eq 'TenantId') {
  $python = @'
import json,subprocess
inspect=subprocess.run(["docker","inspect","serveos-prod-postgres-1"],capture_output=True,text=True,check=True)
items=json.loads(inspect.stdout)[0]["Config"]["Env"]
env=dict(item.split("=",1) for item in items if "=" in item)
query="SELECT id::text FROM businesses WHERE name='Country Side resort' ORDER BY created_at DESC LIMIT 2"
result=subprocess.run(["docker","exec","serveos-prod-postgres-1","psql","-U",env["POSTGRES_USER"],"-d",env["POSTGRES_DB"],"-Atc",query],capture_output=True,text=True,check=True)
ids=[line.strip() for line in result.stdout.splitlines() if line.strip()]
if len(ids)!=1: raise SystemExit("Expected exactly one fresh Country Side resort business")
print(ids[0])
'@
  Invoke-SecureSshInput 'sudo python3 -' $python
}
elseif ($Mode -eq 'ReleaseRecord') {
  $record = @'
recorded_at=2026-10-09 Africa/Nairobi
source_sha=3414e9f3890ef67af8dacc8d2ff73b785acaae73
ci_run=https://github.com/davemusau00/SERVEOS-WEB/actions/runs/37919916116
api_active_source_sha=25010b707a581d50b0c82823ae926d751775d43a
api_active_image_id=sha256:87b539a1ecc8681566a3ffbac0498043b84cd637626fb5220b5e1798854b9a40
api_candidate_built_image_id=sha256:d85f1ed0c647426cac879b2719a5f0e3dd7732951ef394d5c94bd6ec8830c893
api_candidate_activated=no_api_source_changes
postgres_image=postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d
compose_project=serveos-prod
web_release=/var/www/serveos-prod/releases/3414e9f3890ef67af8dacc8d2ff73b785acaae73-webv2-offline-20261009
pwa_manifest_sha256=1705ee908e6421daad6173dfa08da6ddcf7023180ea0bb8758b1b8572ccdcd30
pwa_archive_sha256=a87bd83d9c62c68899a996fb3316b268c9b574645382462d175107961bcc8541
service_worker_sha256=94d475bb61537313c305b312e0ed036a748a8580da980c3d6b2228dfff2cb989
feature_web_v2=enabled
feature_signed_offline_shell=enabled_shell_only_business_ops_pending_device_acceptance
offline_cash_sale=enabled_bounded_tenant_setup_incomplete
offline_pos_setup_navigation=enabled
offline_grant_key_version=offline-2026-10-r1
print_bridge_key_version=bridge-2026-10-r1
signing_keypair_check=passed_public_keys_match_loaded_api_private_keys
print_bridge_bundle_sha256=3837e05df4cd773f37228f57c6b5ed39ad2fe91e39f3027edbc9b9eb19274c46
print_bridge_physical_acceptance=pending_windows10_enrollment_xp80_print_scanner_and_local_tls
api_loopback=127.0.0.1:3101
postgres_host_port=none
migration_count=70
migration_highwater=070_customer_credit_till_attribution.sql
web_api_health=https_green_timer_active
service_worker_acceptance=release_3414e9f_activated_35_assets_cached_controlled_reload_offline_shell_reopen_passed
external_smtp=mail.davemusau.co.ke:587_starttls_credential_rotation_and_test_pending
cutover_incident_owner=Kasina_kasina@davemusau.co.ke
route_rollback_rehearsal=completed_servos_hostnames_only
pwa_release_rollback=passed_previous_release_restored_candidate_active
backup_restore_off_vps=skipped_by_user
business_shift_rehearsal=deferred_by_user
live_trade=NOT_APPROVED_actual_device_print_scanner_external_alert_and_owner_handoff_pending
'@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($record))
  $python = @"
import base64,os,pathlib,tempfile
data=base64.b64decode("$encoded")
directory=pathlib.Path("/opt/serveos-prod/release")
fd,path=tempfile.mkstemp(dir=str(directory),prefix=".feature-rollout.")
os.fchmod(fd,0o600)
with os.fdopen(fd,"wb") as stream: stream.write(data); stream.flush(); os.fsync(stream.fileno())
os.chown(path,0,0)
final=directory/"feature-rollout-20261009.txt"
os.replace(path,final)
os.chown(final,0,0)
os.chmod(final,0o600)
print("feature-rollout-release-record-written")
"@
  Invoke-SecureSshInput 'sudo python3 -' $python
}
elseif ($Mode -eq 'Alerts') {
  $secure = Read-Host 'Enter the rotated SMTP password (input is hidden)' -AsSecureString
  $password = [System.Net.NetworkCredential]::new('', $secure).Password
  $payload = @{
    SERVEOS_ALERT_SMTP_HOST = 'mail.davemusau.co.ke'
    SERVEOS_ALERT_SMTP_PORT = '587'
    SERVEOS_ALERT_SMTP_USERNAME = 'serveos@davemusau.co.ke'
    SERVEOS_ALERT_SMTP_PASSWORD = $password
    SERVEOS_ALERT_FROM = 'serveos@davemusau.co.ke'
    SERVEOS_ALERT_TO = 'kasina@davemusau.co.ke'
  } | ConvertTo-Json -Compress
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
  $python = @"
import base64,json,os,pathlib,tempfile
d=json.loads(base64.b64decode("$encoded"))
p=pathlib.Path("/opt/serveos-prod/env/alerts.env")
fd,t=tempfile.mkstemp(dir=str(p.parent),prefix=".alerts.")
os.fchmod(fd,0o600)
f=os.fdopen(fd,"w")
for k,v in d.items(): f.write(k+"="+json.dumps(v,separators=(",",":"))+"\n")
f.flush()
os.fsync(f.fileno())
f.close()
os.chown(t,0,0)
os.replace(t,p)
print("smtp-credentials-installed")
"@
  Invoke-SecureSshInput 'sudo python3 -' $python
  $password = $null
  $secure.Dispose()
}
elseif ($Mode -eq 'TestAlert') {
  ssh -i $identity -o BatchMode=yes $destination 'sudo systemd-run --quiet --wait --pipe --collect --service-type=oneshot --property=EnvironmentFile=/opt/serveos-prod/env/alerts.env /usr/bin/python3 /usr/local/sbin/serveos-production-monitor.py --test-alert'
}
elseif ($Mode -eq 'Monitor') {
  $source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'serveos-prod-monitor.py') -Raw
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($source))
  $python = @"
import base64,os,pathlib
source=base64.b64decode("$encoded")
p=pathlib.Path("/usr/local/sbin/serveos-production-monitor.py")
p.write_bytes(source)
os.chown(p,0,0)
os.chmod(p,0o755)
d=pathlib.Path("/etc/systemd/system/serveos-prod-healthcheck.service.d")
d.mkdir(mode=0o755,parents=True,exist_ok=True)
dropin=d/"10-external-alerts.conf"
dropin.write_text("[Service]\nEnvironmentFile=-/opt/serveos-prod/env/alerts.env\nExecStart=\nExecStart=/usr/bin/python3 /usr/local/sbin/serveos-production-monitor.py\nStandardOutput=journal\n")
os.chown(dropin,0,0)
os.chmod(dropin,0o644)
"@
  Invoke-SecureSshInput 'sudo python3 -' $python
  ssh -i $identity -o BatchMode=yes $destination 'sudo systemctl daemon-reload && sudo systemctl restart serveos-prod-healthcheck.timer && sudo systemctl start serveos-prod-healthcheck.service && sudo systemctl is-active serveos-prod-healthcheck.timer'
}
elseif ($Mode -eq 'Pwa') {
  if (-not $ReleaseId) { $ReleaseId = (& git rev-parse --short=12 HEAD).Trim() }
  if ($ReleaseId -notmatch '^[a-f0-9]{7,40}$') { throw 'ReleaseId must be a Git SHA from 7 to 40 hexadecimal characters.' }
  if (-not $ArchivePath) { $ArchivePath = Join-Path (Get-Location) "release\web\$ReleaseId.zip" }
  $ArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
  $remoteArchive = "/tmp/serveos-pwa-$ReleaseId-$([guid]::NewGuid().ToString('N')).zip"
  $scp = Join-Path (Split-Path -Parent $ssh) 'scp.exe'
  & $scp -i $identity -o BatchMode=yes $ArchivePath "$($destination):$remoteArchive"
  if ($LASTEXITCODE -ne 0) { throw "PWA archive upload failed with exit code $LASTEXITCODE." }
  $config = @{ releaseId = $ReleaseId; archivePath = $remoteArchive } | ConvertTo-Json -Compress
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($config))
  $python = @"
import base64,hashlib,json,os,pathlib,re,shutil,stat,subprocess,tempfile,uuid,zipfile
config=json.loads(base64.b64decode('$encoded'))
release=config['releaseId']
archive=pathlib.Path(config['archivePath'])
if not re.fullmatch(r'[a-f0-9]{7,40}',release): raise SystemExit('Invalid PWA release ID')
if archive.parent!=pathlib.Path('/tmp') or not archive.is_file(): raise SystemExit('Uploaded PWA archive is missing or outside the temporary release directory')
root=pathlib.Path('/var/www/serveos-prod')
releases=root/'releases'
destination=releases/release
current=root/'current'
if destination.exists(): raise SystemExit('Release already exists; refusing to overwrite it')
manifest_name='release-manifest.json'
entries={}
manifest_bytes=b''
with zipfile.ZipFile(archive) as bundle:
 infos=bundle.infolist()
 names=[info.filename.replace('\\','/') for info in infos]
 if len(names)!=len(set(names)): raise SystemExit('PWA archive contains duplicate paths')
 manifest=json.loads(bundle.read(manifest_name))
 if manifest.get('releaseId')!=release: raise SystemExit('PWA release SHA mismatch')
 file_entries=manifest.get('files')
 if not isinstance(file_entries,list) or not file_entries: raise SystemExit('PWA release manifest is empty')
 entries={entry.get('path'):entry for entry in file_entries if isinstance(entry,dict)}
 if len(entries)!=len(file_entries) or None in entries: raise SystemExit('PWA manifest has missing or duplicate file paths')
 actual_files=set()
 for info,name in zip(infos,names):
  rel=pathlib.PurePosixPath(name.rstrip('/'))
  if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name: raise SystemExit('Unsafe PWA archive path')
  if stat.S_ISLNK(info.external_attr >> 16): raise SystemExit('PWA archive contains a symlink')
  if info.is_dir(): continue
  actual_files.add(name)
 expected_files=set(entries)|{manifest_name}
 if actual_files!=expected_files: raise SystemExit('PWA archive contents do not match its release manifest')
 for name,entry in entries.items():
  rel=pathlib.PurePosixPath(name)
  if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name: raise SystemExit('Unsafe PWA manifest path')
  info=bundle.getinfo(name)
  data=bundle.read(name)
  if len(data)!=entry.get('bytes') or hashlib.sha256(data).hexdigest()!=entry.get('sha256'): raise SystemExit('PWA asset hash mismatch: '+name)
 manifest_bytes=bundle.read(manifest_name)
old=os.readlink(current) if current.is_symlink() else None
def check_route(host,path):
 result=subprocess.run(['curl','--noproxy','*','--silent','--show-error','--output','-','--write-out','\n%{http_code}','--max-time','15','--resolve',host+':443:127.0.0.1','https://'+host+path],capture_output=True,text=True)
 if result.returncode: raise RuntimeError(host+' route check failed: '+result.stderr.strip())
 body,status=result.stdout.rsplit('\n',1)
 if status!='200': raise RuntimeError(host+path+' returned HTTP '+status)
 return body
try:
 check_route('serveos.davemusau.co.ke','/')
 check_route('serveosapi.davemusau.co.ke','/health/ready')
except Exception:
 archive.unlink(missing_ok=True)
 raise
releases.mkdir(mode=0o755,parents=True,exist_ok=True)
staging=pathlib.Path(tempfile.mkdtemp(prefix='.'+release+'.tmp-',dir=releases))
try:
 with zipfile.ZipFile(archive) as bundle:
  for name in entries:
   target=staging.joinpath(*pathlib.PurePosixPath(name).parts)
   target.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
   target.write_bytes(bundle.read(name))
   os.chmod(target,0o644)
 (staging/manifest_name).write_bytes(manifest_bytes)
 os.chmod(staging/manifest_name,0o644)
 for path in [staging,*[p for p in staging.rglob('*') if p.is_dir()]]: os.chmod(path,0o755)
 os.replace(staging,destination)
except Exception:
 shutil.rmtree(staging,ignore_errors=True)
 archive.unlink(missing_ok=True)
 raise
next_link=root/('.current.next-'+uuid.uuid4().hex)
next_link.symlink_to(destination)
os.replace(next_link,current)
try:
 html=check_route('serveos.davemusau.co.ke','/')
 referenced=set(re.findall(r'/(?:assets|icons)/[^"\s<>]+',html))
 missing=[asset for asset in referenced if asset.lstrip('/') not in entries]
 if missing: raise RuntimeError('Activated page refers to assets absent from the release: '+', '.join(sorted(missing)))
 check_route('serveosapi.davemusau.co.ke','/health/ready')
except Exception:
 if old:
  rollback=root/('.current.rollback-'+uuid.uuid4().hex)
  rollback.symlink_to(old)
  os.replace(rollback,current)
 archive.unlink(missing_ok=True)
 raise
archive.unlink(missing_ok=True)
print('previous='+str(old)+'\\ncurrent='+str(destination)+'\\nrelease-files='+str(len(entries)))
"@
  Invoke-SecureSshInput 'sudo python3 -' $python
}
elseif ($Mode -eq 'RouteRollback') {
  $python = @'
import os,pathlib,shutil,stat,subprocess
site=pathlib.Path("/etc/nginx/sites-available/serveos-production")
checkpoint=pathlib.Path("/opt/serveos-prod/release/serveos-production.feature-rollout-20261009-2")
if checkpoint.exists(): raise SystemExit("Route rollback rehearsal checkpoint already exists")
shutil.copy2(site,checkpoint)
os.chmod(checkpoint,0o600)
os.chown(checkpoint,0,0)
def check_routes(label):
 for host,path in [("serveos.davemusau.co.ke","/"),("serveosapi.davemusau.co.ke","/health/ready")]:
  result=subprocess.run(["curl","--noproxy","*","--silent","--show-error","--output","/dev/null","--write-out","%{http_code}","--max-time","15","--resolve",host+":443:127.0.0.1","https://"+host+path],capture_output=True,text=True,check=True)
  if not result.stdout.isdigit() or int(result.stdout)>=500: raise RuntimeError(label+" route check returned "+result.stdout)
  print(label+" "+host+"="+result.stdout)
try:
 subprocess.run(["/opt/serveos-prod/bin/rollback-host-route.sh"],check=True,capture_output=True,text=True)
 check_routes("rollback")
 shutil.copy2(checkpoint,site)
 os.chmod(site,0o644)
 subprocess.run(["nginx","-t"],check=True,capture_output=True,text=True)
 subprocess.run(["systemctl","reload","nginx"],check=True,capture_output=True,text=True)
 check_routes("restored")
 print("ServOS-only route rollback and restoration verified; existing services were not restarted")
except Exception:
 shutil.copy2(checkpoint,site)
 os.chmod(site,0o644)
 subprocess.run(["nginx","-t"],check=True,capture_output=True,text=True)
 subprocess.run(["systemctl","reload","nginx"],check=True,capture_output=True,text=True)
 raise
'@
  Invoke-SecureSshInput 'sudo python3 -' $python
}
