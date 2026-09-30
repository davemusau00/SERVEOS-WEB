import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('native ActionDialog forwards the shared footer and blocks dismissal while busy',()=>{
  const source=readFileSync('src/native/ActionDialog.tsx','utf8');
  assert.match(source,/footer\?:React\.ReactNode/);
  assert.match(source,/busy=false/);
  assert.match(source,/const dismiss=\(\)=>\{if\(!busy\)onClose\(\)\}/);
  assert.match(source,/<Dialog title=\{title\} onClose=\{dismiss\} footer=\{footer\}>/);
});
