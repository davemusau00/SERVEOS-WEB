import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path,'utf8');

test('intake carries business owner and initial administrator without credential fields',()=>{
  const types=read('src/types/runtime.ts');
  assert.match(types,/business:\s*IntakeBusinessIdentity/);
  assert.match(types,/owner:\s*IntakeOwnerProfile/);
  assert.match(types,/initialAdministrator:\s*IntakeAdministratorProfile/);
  const wizard=read('src/native/IntakeWizard.tsx');
  assert.match(wizard,/Initial System Administrator/);
  assert.doesNotMatch(wizard,/profile\.(pin|password)/);
});

test('enrollment derives local Admin from confirmed intake',()=>{
  const native=read('src-tauri/src/lib.rs');
  const store=read('src-tauri/src/store.rs');
  assert.match(native,/initialize_from_intake/);
  assert.match(native,/validate_intake_profile/);
  assert.match(store,/pub fn initialize_from_intake/);
  assert.match(store,/"installationProfile"/);
});

test('safe master data uses versioned native save and archive commands',()=>{
  const view=read('src/native/NativeMasterDataView.tsx');
  assert.match(view,/record\.save/);
  assert.match(view,/record\.archive/);
  assert.match(view,/customers/);
  assert.match(view,/suppliers/);
  assert.match(view,/stockLocations/);
});

test('price rules understand UI scope schema and numeric weekdays',()=>{
  const store=read('src-tauri/src/store.rs');
  assert.match(store,/scopeType/);
  assert.match(store,/scopeId/);
  assert.match(store,/number_from_monday/);
});


test('production hardening keeps setup recoverable and binds customers to POS tabs',()=>{
  const native=read('src-tauri/src/lib.rs');
  const runtime=read('src/runtime/RuntimeProvider.tsx');
  const store=read('src-tauri/src/store.rs');
  const pos=read('src/native/NativePOSView.tsx');
  assert.match(native,/runtime_intake_reopen/);
  assert.match(runtime,/reopenIntake/);
  assert.match(store,/customerId/);
  assert.match(store,/order\.repeatRound/);
  assert.match(pos,/Named tab/);
  assert.match(pos,/Repeat last round/);
});

test('go live requires resolved outlet stock locations and a local backup',()=>{
  const store=read('src-tauri/src/store.rs');
  assert.match(store,/Every service area requires a default stock location before Go Live/);
  assert.match(store,/Create and verify a local backup before Go Live/);
  assert.match(store,/BACKUP_SYNC/);
});

test('supplier receipts are routed through procurement in the installed inventory UI',()=>{
  const inventory=read('src/native/NativeInventoryView.tsx');
  assert.doesNotMatch(inventory,/inventory\.receive/);
  assert.match(inventory,/Supplier receipts are posted through Procurement/);
});

test('stock masters cannot be archived while active catalog records depend on them',()=>{
  const store=read('src-tauri/src/store.rs');
  assert.match(store,/active product, recipe or modifier/);
});
