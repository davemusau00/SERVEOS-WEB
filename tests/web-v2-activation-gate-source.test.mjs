import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production web v2 is disabled by default',()=>{
  const env=readFileSync('.env.example','utf8');
  assert.match(env,/^VITE_ENABLE_WEB_V2=false$/m);
});

test('the server authority is an explicit mode, not a single boolean',()=>{
  const sql=readFileSync('supabase/migrations/20261001045_authority_modes.sql','utf8');
  // The three explicit values the cutover runbook depends on.
  assert.match(sql,/add column if not exists authority_mode text not null default 'LEGACY_LOCAL'/);
  assert.match(sql,/check\(authority_mode in \('LEGACY_LOCAL','CUTOVER_PREP','SHARED_V2'\)\)/);
  // The legacy boolean survives only as a derived compatibility flag.
  assert.match(sql,/set authority_mode=case when enabled then 'SHARED_V2' else 'LEGACY_LOCAL' end/);
  assert.match(sql,/set authority_mode=to_mode,enabled=\(to_mode='SHARED_V2'\)/);
  // CUTOVER_PREP is the maintenance window a single boolean could not express.
  assert.match(sql,/create or replace function servos_v2\.authority\(\)/);
  assert.match(sql,/create or replace function servos_v2\.shared_v2_active\(\)/);
  assert.match(sql,/servos_upload_before_authority_mode/);
  assert.match(sql,/authority_mode='LEGACY_LOCAL' for share/);
  assert.match(sql,/legacy writer frozen during cutover preparation/);
  assert.match(sql,/servos_v2_execute_before_authority_mode/);
  assert.match(sql,/v2 business writes require SHARED_V2 authority/);
  // Snapshot must NOT be re-gated, or the terminal could never install its
  // baseline during the cutover window.
  assert.ok(!/servos_v2_snapshot[\s\S]{0,400}authority_mode/.test(sql),
    'snapshot must not be gated on the authority mode');
  // Admin-only, forward-only, audited, with no client-controlled actor.
  assert.match(sql,/create or replace function public\.servos_v2_set_authority_mode\(next_mode text, reason text\)/);
  assert.match(sql,/role='Admin'/);
  assert.match(sql,/must move forward LEGACY_LOCAL -> CUTOVER_PREP -> SHARED_V2/);
  assert.match(sql,/a verified v2 cutover is required before SHARED_V2/);
  assert.match(sql,/insert into servos_v2\.authority_transitions/);
  assert.ok(!/actor_id\s+uuid\s*:=/.test(sql),'the actor must come from auth.uid(), never a parameter');
  // Identity responses must carry the mode so a terminal never infers it.
  assert.match(sql,/'authorityMode',servos_v2\.authority\(\)/);
  assert.match(sql,/'sharedV2',servos_v2\.shared_v2_active\(\)/);
});

test('the disposable harness proves the authority mode matrix',()=>{
  const suite=readFileSync('tests/supabase/authority-modes.sql','utf8');
  for(const marker of [
    "servos_v2.authority()<>'LEGACY_LOCAL'",
    'v2 execute must be refused before SHARED_V2',
    'Authority must not skip CUTOVER_PREP',
    'An authority transition must require a reason',
    'SHARED_V2 must require a verified cutover',
    'CUTOVER_PREP must freeze the legacy writer',
    'Snapshot must remain available during CUTOVER_PREP',
    'CUTOVER_PREP must still refuse v2 business writes',
    'Identity must expose the authority mode',
    'Authority transition evidence must be immutable',
    'A non-Admin must not be able to move the authority',
  ]) assert.ok(suite.includes(marker),marker);
  // The suite must roll back: it never mutates a business project.
  assert.match(suite,/\nrollback;\s*$/);
  assert.match(readFileSync('scripts/test-supabase.mjs','utf8'),/tests\/supabase\/authority-modes\.sql/);
  // Every suite that enables v2 writes must set the explicit mode too,
  // otherwise the new execute gate silently breaks the established fixtures.
  for(const name of ['assets','controlled-import','expansion','financial-controls','floorplan','folios','inventory','pos','procurement','rooms','settings','smart-items','staff-devices','web-session']){
    for(const line of readFileSync(`tests/supabase/${name}.sql`,'utf8').split('\n').filter(l=>l.includes('control set enabled=true'))){
      assert.match(line,/authority_mode='SHARED_V2'/,`${name}: ${line.trim()}`);
    }
  }
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
