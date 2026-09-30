import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('room-stay settings cannot submit a rate from another room type',()=>{
  const web=readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  const native=readFileSync('src/native/NativeSettingsPanel.tsx','utf8');
  assert.match(web,/allNightlyRates\.find\(record=>record\.id===ratePlanId/);
  assert.match(web,/String\(rate\.data\.roomTypeId\|\|''\)!==roomTypeId/);
  assert.match(web,/nightlyRates=allNightlyRates\.filter\(record=>!roomStay\.roomTypeId/);
  assert.match(native,/candidate\.mode==='NIGHTLY'&&candidate\.roomTypeId===form\.roomTypeId/);
  assert.match(native,/rate\.mode==='NIGHTLY'&&rate\.roomTypeId===roomTypeId/);
});
