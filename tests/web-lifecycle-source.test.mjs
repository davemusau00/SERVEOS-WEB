import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(file,'utf8');

test('hosted web lifecycle has an explicit server authority and gated route shell',()=>{
  const sql=read('supabase/expansion/017_web_lifecycle_guidance.sql');
  const app=read('src/runtime/web/WebBusinessApp.tsx');
  const lifecycle=read('src/runtime/web/WebLifecycleViews.tsx');
  const remote=read('src/runtime/RemoteManagerApp.tsx');
  assert.match(sql,/lifecycle_stage text not null default 'INTAKE'/);
  assert.match(sql,/servos_v2_web_lifecycle/);
  assert.match(sql,/INVALID_STATE: complete every setup check before Go Live/);
  assert.match(app,/WebLifecycleView/);
  assert.match(lifecycle,/Business details saved/);
  assert.match(lifecycle,/Native-only hardware acceptance remains terminal-specific/);
  assert.match(remote,/session\.enabled\|\|session\.lifecycleStage/);
});

test('hosted guidance progress is versioned and isolated by business and actor',()=>{
  const sql=read('supabase/expansion/017_web_lifecycle_guidance.sql');
  const session=read('src/runtime/web/session.ts');
  const guidance=read('src/runtime/web/WebGuidanceViews.tsx');
  assert.match(sql,/primary key\(business_id,actor_id,guide_id\)/);
  assert.match(sql,/where business_id=business and actor_id=who/);
  assert.match(sql,/guide_version integer not null/);
  assert.match(session,/WebGuidanceProgress/);
  assert.match(guidance,/Completed/);
  assert.match(guidance,/Restart tour/);
  assert.match(guidance,/Escape/);
});