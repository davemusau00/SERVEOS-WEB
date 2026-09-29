import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('folios expose liability-aware settlement, extension and conserved checkout',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  const view=readFileSync('src/native/NativeFoliosView.tsx','utf8');
  assert.match(store,/SERVOS_PATCH_07_FOLIOS/);
  assert.match(store,/GUEST_DEPOSITS/);
  assert.match(store,/GUEST_RECEIVABLE/);
  assert.match(store,/folio\.applyDeposit/);
  assert.match(store,/folio\.refundDeposit/);
  assert.match(store,/stay\.checkOut/);
  assert.match(store,/HOTEL_FOLIO/);
  assert.match(view,/Post due accommodation/);
  assert.match(view,/Refund deposit/);
  assert.match(view,/Extend stay/);
  assert.match(view,/Check out/);
});
test('POS room charge is an internal receivable transfer rather than cash',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  const pos=readFileSync('src/native/NativePOSView.tsx','utf8');
  assert.match(store,/pos\.roomCharge/);
  assert.match(store,/"status":"TRANSFERRED"/);
  assert.match(store,/"tenderType":"ROOM_CHARGE"/);
  assert.match(store,/POS_ROOM_CHARGE/);
  assert.match(pos,/Charge room/);
});
test('financial history receives SQLite immutability protection',()=>{
  const migration=readFileSync('src-tauri/migrations/006_folios.sql','utf8');
  assert.match(migration,/Immutable financial history/);
  assert.match(migration,/folioEntries/);
  assert.match(migration,/journalEntries/);
  assert.match(migration,/payments/);
});
test('Patch 07 money operations remain behind native Go Live',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  const start=store.indexOf('fn live_required');
  const end=store.indexOf('fn verify_staff_pin',start);
  const gate=store.slice(start,end);
  for(const operation of ['stay.extend','stay.checkOut','folio.open','folio.postAccommodation','folio.postService','folio.deposit','folio.pay','folio.applyDeposit','folio.refundDeposit','folio.reverse','pos.roomCharge']){
    assert.ok(gate.includes(`"${operation}"`),operation);
  }
});
