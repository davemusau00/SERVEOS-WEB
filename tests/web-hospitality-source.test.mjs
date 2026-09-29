import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(file,'utf8');

test('web hospitality splits Front Desk, Guest Accounts, Housekeeping, and Room Setup',()=>{
  const app=read('src/runtime/web/WebBusinessApp.tsx');
  const view=read('src/runtime/web/WebHospitalityViews.tsx');
  assert.match(app,/WebFrontDeskView/);
  assert.match(app,/WebGuestAccountsView/);
  assert.match(app,/WebHousekeepingView/);
  for(const tab of ['Front Desk','Guest Accounts','Housekeeping','Rooms'])assert.match(app,new RegExp(`['"]${tab}['"]`));
  assert.match(app,/tabs=\(\['Home','POS'.*'Front Desk'.*'Guest Accounts'.*'Housekeeping'.*'Rooms'/s);
  assert.match(view,/data-guide-anchor="web.front-desk"/);
  assert.match(view,/data-guide-anchor="web.guest-accounts"/);
  assert.match(view,/data-guide-anchor="web.housekeeping"/);
});

test('web hospitality uses queued authoritative stay, folio, and housekeeping commands',()=>{
  const view=read('src/runtime/web/WebHospitalityViews.tsx');
  for(const operation of ['stay.checkIn','stay.checkOut','stay.move','folio.deposit','folio.pay','folio.postAccommodation','folio.applyDeposit','folio.postService','room.housekeeping','room.condition','room.unblock'])assert.ok(view.includes(operation),operation);
  assert.match(view,/Checkout conservation/);
  assert.match(view,/Room readiness is separate from occupancy/);
  assert.doesNotMatch(view,/business_records|supabase\.from/);
});

test('hosted hospitality backend preserves conservation and permission contracts',()=>{
  const stays=read('supabase/expansion/009_stays.sql');
  const folios=read('supabase/expansion/008_folios.sql');
  const rooms=read('supabase/expansion/007_rooms.sql');
  assert.match(stays,/require_permission\('rooms\.operate'\)/);
  assert.match(stays,/SETTLEMENT_REQUIRED: post all booked accommodation periods before checkout/);
  assert.match(stays,/SETTLEMENT_REQUIRED: settle balance and apply\/refund remaining deposit/);
  assert.match(folios,/require_permission\('folio\.manage'\)/);
  assert.match(folios,/folio\.postAccommodation/);
  assert.match(rooms,/room\.housekeeping/);
  assert.match(rooms,/room\.unblock/);
});