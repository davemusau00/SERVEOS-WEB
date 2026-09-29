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
