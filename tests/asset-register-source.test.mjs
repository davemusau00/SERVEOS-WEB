import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('asset register exposes scan-to-open, custody, maintenance and commissioning surfaces',()=>{
  const view=readFileSync('src/native/NativeAssetsView.tsx','utf8');
  for(const token of ['Add Property','useBarcodeScanner','asset.assign','asset.return','asset.transfer','asset.inspect','maintenance.report','maintenance.complete','asset.commission','Pending capital assets']){
    assert.ok(view.includes(token),token);
  }
});
test('classified procurement supports STOCK EXPENSE ASSET without turning assets into stock',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  const dialog=readFileSync('src/native/ClassifiedPurchaseOrderDialog.tsx','utf8');
  assert.match(store,/"treatment":"STOCK"/);
  assert.match(store,/"treatment":"EXPENSE"/);
  assert.match(store,/"treatment":"ASSET"/);
  assert.match(store,/ASSET_CLEARING/);
  assert.match(store,/PENDING_COMMISSION/);
  assert.match(dialog,/STOCK/);assert.match(dialog,/EXPENSE/);assert.match(dialog,/ASSET/);
});
test('asset commissioning posts fixed assets against clearing and preserves stock separation',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  assert.match(store,/"asset\.commission"/);
  assert.match(store,/FIXED_ASSETS/);
  assert.match(store,/ASSET_CLEARING/);
  const section=store.slice(store.indexOf('"asset.commission"=>'),store.indexOf('"asset.save"=>'));
  assert.equal(section.includes('stock_delta_with_cost'),false);
});
test('mixed invoice matching uses stable purchase line IDs',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  assert.match(store,/billed_line_id/);
  assert.match(store,/GRN line can appear only once/);
  assert.match(store,/purchaseLineId/);
});
test('asset commissioning stays behind native Go Live',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  const start=store.indexOf('fn live_required');const end=store.indexOf('fn verify_staff_pin',start);
  assert.ok(store.slice(start,end).includes('"asset.commission"'));
});
