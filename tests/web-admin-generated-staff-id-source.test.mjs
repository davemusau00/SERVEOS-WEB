import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../src/runtime/web/WebStaffAdminView.tsx',import.meta.url),'utf8');

test('staff binding accepts an existing terminal staff key and can generate a new one',()=>{
  assert.match(source,/useState\(\(\)=>crypto\.randomUUID\(\)\)/);
  assert.match(source,/value=\{staffId\} onChange=\{e=>setStaffId\(e\.target\.value\)\}/);
  assert.match(source,/staff\.create',stableStaffId/);
  assert.match(source,/staffId:stableStaffId/);
  assert.match(source,/setStaffId\(crypto\.randomUUID\(\)\)/);
  assert.match(source,/exact Staff ID/);
  assert.match(source,/not a password or device credential/);
});
