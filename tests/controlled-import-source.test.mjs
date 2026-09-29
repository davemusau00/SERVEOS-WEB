import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('controlled imports use dry-run and normal ServOS command execution',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  assert.match(store,/pub fn import_plan\(/);
  assert.match(store,/pub fn import_apply\(/);
  assert.match(store,/execute_as\(db,&user,command\)/);
  assert.match(store,/Opening inventory cannot be imported after Go Live/);
});
test('products template links optional stock master external ids',()=>{
  const header=readFileSync('import-templates/products.csv','utf8').split(/\r?\n/,1)[0];
  assert.match(header,/stock_item_external_id/);
});
