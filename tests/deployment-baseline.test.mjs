import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const source=readFileSync('scripts/Deploy-ServOSProductionFeatures.ps1','utf8');
const validator='def validate_virtual_hosts'+source.split('def validate_virtual_hosts')[1].split("validate_virtual_hosts(text,c['apiPort'])")[0];
const web='server { server_name serveos.davemusau.co.ke; root /var/www/serveos-next/current; }';
const api='server { server_name serveosapi.davemusau.co.ke; location / { proxy_pass http://127.0.0.1:3102; } location /v1/sync/stream { proxy_pass http://127.0.0.1:3102; } }';
const check=configuration=>spawnSync(process.platform==='win32'?'python':'python3',['-c',`import re,json,sys\n${validator}\nvalidate_virtual_hosts(json.load(sys.stdin),3102)`],{input:JSON.stringify(configuration),encoding:'utf8'});

test('release baseline accepts the exact owned web and API virtual hosts',()=>{
  const result=check(web+api);assert.equal(result.status,0,result.stderr);
});
test('release baseline rejects misplaced proxies, an old root and a changed target port',()=>{
  for(const configuration of [web+api.replace('serveosapi.davemusau.co.ke','sms.detailskilonzo.com'),web.replace('serveos-next','serveos-prod')+api,web+api.replaceAll('3102','3101')])assert.notEqual(check(configuration).status,0);
});
