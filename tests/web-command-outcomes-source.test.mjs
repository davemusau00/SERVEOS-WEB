import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(file,'utf8');

test('remaining Web command surfaces preserve typed outcomes and confirmation-only state changes',()=>{
  const app=read('src/runtime/web/WebBusinessApp.tsx');
  const kds=read('src/runtime/web/WebKDSView.tsx');
  const master=read('src/runtime/web/WebMasterDataView.tsx');
  const staff=read('src/runtime/web/WebStaffAdminView.tsx');
  assert.match(kds,/Promise<CommandOutcome>/);
  assert.match(kds,/setOutcome\(await command\('order\.kds'/);
  assert.match(kds,/onRefresh\(\)/);
  assert.doesNotMatch(kds,/Ticket list refreshed from the authorized snapshot/);
  assert.match(kds,/OUTCOME_UNKNOWN/);
  assert.match(app,/tab==='KDS'.*command=\{submit\}/);
  assert.match(master,/Promise<CommandOutcome>/);
  assert.match(master,/if\(isCommandConfirmed\(result\)\)setEditing\(null\)/);
  assert.match(master,/setOutcome\(await command\('record\.archive'/);
  assert.match(app,/tab==='Master Data'.*command=\{submit\}/);
  assert.match(staff,/Promise<CommandOutcome>/);
  assert.match(staff,/isCommandConfirmed\(await run\('staff\.create'/);
  assert.match(staff,/run\('device\.revoke'.*'deviceEvents'/);
  assert.match(staff,/OUTCOME_UNKNOWN/);
  assert.match(app,/tab==='Staff'.*command=\{submit\}/);
});
