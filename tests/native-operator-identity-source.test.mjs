import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const runtime = read('../src-tauri/src/lib.rs');
const nativeStore = read('../src-tauri/src/store.rs');
const nativeV2Migration = read('../src-tauri/migrations/014_native_v2_outbox.sql');
const provider = read('../src/runtime/RuntimeProvider.tsx');
const unlock = read('../src/native/UnlockView.tsx');
const identityMigration = read('../supabase/expansion/028_terminal_operator_identity.sql');
const snapshotMigration = read('../supabase/expansion/029_native_readonly_snapshot.sql');
const snapshotAcceptance = read('../tests/supabase/web-session.sql');
const runtimeProvider = read('../src/runtime/RuntimeProvider.tsx');
const reconciliationPanel = read('../src/native/NativeDataReconciliationPanel.tsx');
const setupGuide = read('../docs/TERMINAL_OPERATOR_AUTH_SETUP.md');

test('native operator online identity binds Auth, stable staff, and the paired terminal', () => {
  assert.match(runtime, /auth\/v1\/token\?grant_type=password/);
  assert.match(runtime, /servos_v2_terminal_identity/);
  assert.match(runtime, /identity\["staffId"\]\.as_str\(\)!=Some\(local\.staff_id\.as_str\(\)\)/);
  assert.match(runtime, /identity\["deviceId"\]\.as_str\(\)!=Some\(terminal\.as_str\(\)\)/);
  assert.match(identityMigration, /staff_profiles s where s\.auth_user_id=who and s\.active/);
  assert.match(identityMigration, /where id=\$1 and d\.active/);
});

test('refresh credentials use OS storage and rotate without entering SQLite metadata', () => {
  assert.match(runtime, /keyring::Entry::new\("ServOS"/);
  assert.match(runtime, /entry\.set_password\(&refresh\)/);
  assert.match(runtime, /grant_type=refresh_token/);
  assert.match(runtime, /runtime_refresh_operator_auth/);
  assert.match(runtime, /entry\.delete_credential\(\)/);
  assert.doesNotMatch(runtime, /set_meta\([^\n]*refresh_token/i);
  assert.match(provider, /renewAuth\(true\)/);
});

test('local offline unlock remains separate and sign-out clears local state', () => {
  assert.match(provider, /runtime_login_offline/);
  assert.match(provider, /setSession\(null\); setSnapshot\(null\)/);
  assert.match(unlock, /Continue with local PIN/);
  assert.match(setupGuide, /v2 business writes remain disabled/);
});

test('one terminal can be reused by active operators without transferring registration ownership', () => {
  assert.match(identityMigration, /on conflict\(id\) do nothing/);
  assert.match(identityMigration, /not existing\.active or existing\.kind<>\$3/);
  assert.match(identityMigration, /owner_id=original_owner/);
});

test('authenticated identity seeds monotonic staged protocol state without dispatching v2 commands', () => {
  assert.match(nativeStore, /pub fn seed_native_v2_state/);
  assert.match(nativeStore, /pub fn apply_native_v2_page/);
  assert.match(nativeStore, /pub fn install_native_v2_snapshot/);
  assert.match(nativeStore, /while commands await acknowledgement/);
  assert.match(nativeStore, /V2 change-feed sequence gap/);
  assert.match(nativeStore, /native_v2_records\(collection,record_id,version,data,archived,feed_sequence\)/);
  assert.match(nativeStore, /ON CONFLICT\(device_id\) DO NOTHING/);
  assert.match(nativeStore, /Later identity refreshes must not advance cursors/);
  assert.match(nativeStore, /different business/);
  assert.match(nativeV2Migration, /CREATE TABLE IF NOT EXISTS native_v2_outbox/);
  assert.match(nativeV2Migration, /CREATE TABLE IF NOT EXISTS native_v2_records/);
  assert.match(snapshotMigration, /require_permission\('records\.view'\)/);
  assert.doesNotMatch(snapshotMigration, /if not state\.enabled/i);
  assert.match(snapshotAcceptance, /set enabled=false;[\s\S]*?public\.servos_v2_snapshot\(\)/);
  assert.match(runtimeProvider, /runtime_v2_install_snapshot/);
  assert.match(runtimeProvider, /runtime_v2_sync_replica/);
  assert.match(runtime, /"servos_v2_pull"/);
  assert.match(reconciliationPanel, /Install v2 shadow snapshot/);
  assert.match(nativeV2Migration, /WHERE state='PENDING'/);
  assert.match(runtime, /seed_native_v2_state\(&db,&identity\)/);
  assert.match(nativeV2Migration, /PRAGMA user_version=14/);
});
