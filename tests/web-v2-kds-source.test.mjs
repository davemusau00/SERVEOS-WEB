import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('web KDS mirrors the staged order.kds contract and native station model',()=>{
  const ui=readFileSync('src/runtime/web/WebKDSView.tsx','utf8');
  const app=readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  const sql=readFileSync('supabase/expansion/013_pos.sql','utf8');
  for(const station of ['BAR','KITCHEN','SERVICE'])assert.match(ui,new RegExp(station));
  for(const state of ['FIRED','PREPARING','READY','SERVED'])assert.match(ui,new RegExp(state));
  for(const marker of ['stockFired','productSnapshot','courseStatus','order.kds','itemId'])assert.match(ui,new RegExp(marker.replace('.','\\.')),marker);
  assert.match(ui,/kds\.update/);
  assert.match(app,/WebKDSView/);
  assert.match(app,/['"]KDS['"]/);
  assert.match(sql,/op='order\.kds'/);
  assert.match(sql,/kds\.update/);
});

test('operation manifest records KDS web parity and native-only boundaries',()=>{
  const manifest=readFileSync('src/runtime/operationManifest.ts','utf8');
  assert.match(manifest,/operation: 'order\.kds'/);
  assert.match(manifest,/web: 'implemented'/);
  assert.match(manifest,/runtime\.print_receipt/);
  assert.match(manifest,/web: 'blocked'/);
});