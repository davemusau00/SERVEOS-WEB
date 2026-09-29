import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production web v2 is disabled by default',()=>{
  const env=readFileSync('.env.example','utf8');
  assert.match(env,/^VITE_ENABLE_WEB_V2=false$/m);
});

test('remote manager requires the explicit frontend gate before probing v2',()=>{
  const source=readFileSync('src/runtime/RemoteManagerApp.tsx','utf8');
  assert.match(source,/VITE_ENABLE_WEB_V2/);
  assert.match(source,/if\(webV2Enabled\)\{/);
  assert.match(source,/rpc\/servos_v2_session/);
  assert.match(source,/rpc\/servos_is_manager/);
  assert.match(source,/if\(cloudSession\?\.enabled\)return <WebBusinessApp/);
});

test('staging runbook prohibits dual writers',()=>{
  const source=readFileSync('docs/WEB_V2_STAGING_RUNBOOK.md','utf8');
  assert.match(source,/Never operate legacy and v2 business writers concurrently/);
  assert.match(source,/isolated non-production Supabase project/);
});
