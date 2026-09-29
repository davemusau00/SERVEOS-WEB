import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('native assets domain owns permanent tags, custody and maintenance lifecycle',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  for(const token of ['SERVOS_PATCH_08_ASSETS_MAINTENANCE','asset.save','asset.assign','asset.return','asset.transfer','asset.inspect','asset.lose','asset.retire','asset.dispose','maintenance.report','maintenance.assign','maintenance.start','maintenance.complete','maintenance.cancel']){
    assert.ok(store.includes(`"${token}"`)||store.includes(token),token);
  }
  assert.match(store,/DUPLICATE_REFERENCE: tag remains unique across history|DUPLICATE_REFERENCE: .*unique across history/);
  assert.match(store,/MAINTENANCE_EXPENSE/);
  assert.match(store,/MATCHED_UNPAID/);
});
test('asset and maintenance history is protected at SQLite level',()=>{
  const migration=readFileSync('src-tauri/migrations/007_assets_maintenance.sql','utf8');
  assert.match(migration,/asset_tag_unique_history/);
  assert.match(migration,/Immutable asset\/maintenance history/);
  assert.match(migration,/assetEvents/);
  assert.match(migration,/maintenanceEvents/);
});
test('room blocks can link to maintenance but cannot release unfinished work',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  assert.match(store,/maintenanceOrderId/);
  assert.match(store,/resolve maintenance before inspection\/release/);
  assert.equal(store.includes('Maintenance-linked room blocks are enabled with the Assets & Maintenance domain in Patch 08'),false);
});
test('asset CSVs apply through native asset commands rather than remaining staged',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  assert.match(store,/assetCategory\.save/);
  assert.match(store,/Some\("asset\.save"\)/);
  assert.equal(store.includes('This staged dataset is reserved for Patch 08 Assets'),false);
});
test('asset lifecycle and maintenance operations remain behind native Go Live',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  const start=store.indexOf('fn live_required');const end=store.indexOf('fn verify_staff_pin',start);const gate=store.slice(start,end);
  for(const op of ['asset.assign','asset.return','asset.transfer','asset.inspect','asset.lose','asset.retire','asset.dispose','maintenance.report','maintenance.assign','maintenance.start','maintenance.complete','maintenance.cancel']){
    assert.ok(gate.includes(`"${op}"`),op);
  }
});
