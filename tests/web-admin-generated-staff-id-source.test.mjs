import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../src/runtime/web/WebStaffAdminView.tsx',import.meta.url),'utf8');

test('staff binding generates and reuses a stable UUID staff key',()=>{
  assert.match(source,/useState\(\(\)=>crypto\.randomUUID\(\)\)/);
  assert.match(source,/readOnly[^>]*value=\{staffId\}/);
  assert.match(source,/staff\.create',stableStaffId/);
  assert.match(source,/staffId:stableStaffId/);
  assert.match(source,/setStaffId\(crypto\.randomUUID\(\)\)/);
  assert.match(source,/not a password or device credential/);
});
