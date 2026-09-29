import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('front desk exposes tape chart, arrivals, check-in, room moves and conserved checkout',()=>{
  const view=readFileSync('src/native/NativeFrontDeskView.tsx','utf8');
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  assert.match(view,/Tape chart/);
  assert.match(view,/Arrivals & overdue/);
  assert.match(view,/stay\.checkIn/);
  assert.match(view,/stay\.move/);
  assert.match(view,/stay\.checkOut/);
  assert.match(view,/Checkout conservation active/);
  assert.match(store,/"stay\.checkIn"/);
  assert.match(store,/"stay\.move"/);
  assert.match(store,/SETTLEMENT_REQUIRED/);
  assert.match(store,/folio\.postAccommodation/);
});
test('housekeeping board preserves ordered room readiness transitions',()=>{
  const view=readFileSync('src/native/NativeHousekeepingView.tsx','utf8');
  assert.match(view,/DIRTY:'CLEANING'/);
  assert.match(view,/CLEANING:'INSPECTION'/);
  assert.match(view,/INSPECTION:'CLEAN'/);
  assert.match(view,/Out of order/);
});
