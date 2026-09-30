import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('native rooms engine owns room masters and reservation overlap rules',()=>{
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  assert.match(store,/SERVOS_PATCH_05_ROOMS_ENGINE/);
  assert.match(store,/roomReservation\.create/);
  assert.match(store,/ROOM_UNAVAILABLE: reservation overlap/);
  assert.match(store,/turnaroundMinutes/);
  assert.match(store,/rateSnapshot/);
  assert.match(store,/Stay lifecycle gate|PROTOCOL_UNSUPPORTED/);
});
test('rooms route is permission gated and hotel services are owned by Patch 07 folios',()=>{
  const shell=readFileSync('src/native/NativeBarShell.tsx','utf8');
  const store=readFileSync('src-tauri/src/store.rs','utf8');
  assert.match(shell,/permission:'rooms\.view'/);
  assert.match(store,/hotelService\.save/);
  assert.match(store,/SERVOS_PATCH_07_FOLIOS/);
});
test('staged room stays use the property timezone and require an explicit stay type',()=>{
  const sql=readFileSync('supabase/expansion/021_room_stay_policy.sql','utf8');
  assert.match(sql,/property_timezone text/);
  assert.match(sql,/property_timezone:=coalesce\(nullif\(property->>'timezone'/);
  assert.match(sql,/unsupported property timezone/);
  assert.match(sql,/stay_type:=nullif\(p->>'stayType',''\)/);
  assert.match(sql,/stay type is required/);
  assert.doesNotMatch(sql,/at time zone 'Africa\/Nairobi'/);
});
