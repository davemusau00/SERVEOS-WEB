import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const runtime = read('../src-tauri/src/lib.rs');
const nativeStore = read('../src-tauri/src/store.rs');
const nativeV2Migration = read('../src-tauri/migrations/014_native_v2_outbox.sql');
const authorityMigration = read('../src-tauri/migrations/015_v2_cutover_state.sql');
const nativeTests = read('../src-tauri/src/tests.rs');
const provider = read('../src/runtime/RuntimeProvider.tsx');
const unlock = read('../src/native/UnlockView.tsx');
const identityMigration = read('../supabase/expansion/028_terminal_operator_identity.sql');
const snapshotMigration = read('../supabase/expansion/029_native_readonly_snapshot.sql');
const identityPolicyMigration = read('../supabase/expansion/030_terminal_identity_policy_version.sql');
const snapshotAcceptance = read('../tests/supabase/web-session.sql');
const runtimeProvider = read('../src/runtime/RuntimeProvider.tsx');
const reconciliationPanel = read('../src/native/NativeDataReconciliationPanel.tsx');
const setupGuide = read('../docs/TERMINAL_OPERATOR_AUTH_SETUP.md');

test('native operator online identity binds Auth, stable staff, and the paired terminal', () => {
  assert.match(runtime, /auth\/v1\/token\?grant_type=password/);
  assert.match(runtime, /servos_v2_terminal_identity/);
  assert.match(runtime, /identity\["staffId"\]\.as_str\(\)!=Some\(staff_id\.as_str\(\)\)/);
  assert.match(runtime, /identity\["deviceId"\]\.as_str\(\)!=Some\(terminal\.as_str\(\)\)/);
  assert.match(runtime, /store::login_authenticated\(&db,&staff_id\)/);
  assert.match(runtime, /if email\.trim\(\)\.is_empty\(\) && password\.is_empty\(\)[\s\S]*?store::login\(&db,&staff_id,&pin\)/);
  assert.match(nativeStore, /pub fn login_authenticated\(db: &Connection, staff_id: &str\)/);
  assert.match(identityPolicyMigration,/policyVersion/);
  assert.match(identityPolicyMigration,/order by 1/);
  assert.match(identityMigration, /staff_profiles s where s\.auth_user_id=who and s\.active/);
  assert.match(identityMigration, /where d\.id=\$1 and d\.active/);
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
  assert.match(setupGuide, /does not enable Web v2 business writes/);
});

test('one terminal can be reused by active operators without transferring registration ownership', () => {
  assert.match(identityMigration,/servos_v2\.require_permission\('devices\.register'\)/);
  assert.match(identityMigration, /on conflict\(id\) do nothing/);
  assert.match(identityMigration, /not existing\.active or existing\.kind<>\$3/);
  assert.match(identityMigration, /owner_id=original_owner/);
  assert.match(setupGuide,/On a fresh terminal, commission its staged v2 pairing by signing in online as an active Admin authorized for `devices\.register`/);
  assert.match(setupGuide,/Do not use an ordinary cashier\/Server account for first pairing/);
});

test('authenticated identity initializes staged protocol state and isolates v2 feed reconciliation', () => {
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
  assert.match(reconciliationPanel, /Install or refresh v2 shadow snapshot/);
  assert.match(nativeV2Migration, /WHERE state='PENDING'/);
  assert.match(runtime, /seed_native_v2_state\(&db,&identity\)/);
  assert.match(nativeV2Migration, /PRAGMA user_version=14/);
});

test('business authority is persisted terminal state, not a property of the login session',()=>{
  // Persisted mode with the three explicit values the cutover runbook uses.
  assert.match(authorityMigration,/CREATE TABLE IF NOT EXISTS authority_state/);
  assert.match(authorityMigration,/CHECK\(mode IN \('LEGACY_LOCAL','CUTOVER_PREP','SHARED_V2'\)\)/);
  assert.match(authorityMigration,/VALUES\(1,'LEGACY_LOCAL'/);
  // Immutable transition evidence plus the legacy outbox resolution states.
  assert.match(authorityMigration,/CREATE TABLE IF NOT EXISTS authority_transitions/);
  assert.match(authorityMigration,/Authority transitions cannot be updated/);
  assert.match(authorityMigration,/CREATE TABLE IF NOT EXISTS legacy_outbox_resolution/);
  assert.match(authorityMigration,/SUPERSEDED_BY_V2_CUTOVER/);
  assert.match(authorityMigration,/CLOUD_ACKNOWLEDGED/);
  // The outbox rows themselves are never deleted, only evidenced.
  assert.ok(!/DELETE FROM outbox/i.test(authorityMigration),'migration must never delete outbox rows');
  assert.match(authorityMigration,/PRAGMA user_version=15/);
  assert.match(nativeStore,/pub enum AuthorityMode/);
  assert.match(nativeStore,/pub fn authority_mode/);
  assert.match(nativeStore,/pub fn set_authority_mode/);
  // Forward-only transitions keep a stale replica from undoing a cutover.
  assert.match(nativeStore,/Authority cannot move directly from/);
  assert.match(nativeStore,/pub fn reject_legacy_business_write/);
  assert.match(nativeStore,/pub fn supersede_legacy_outbox/);
  assert.match(nativeStore,/The server cutover must be READY/);
  // The fence lives in the store itself, not only in Tauri callers.
  const executeFn=nativeStore.slice(nativeStore.indexOf('pub fn execute('),nativeStore.indexOf('fn simple_setup_execute('));
  assert.match(executeFn,/reject_legacy_business_write\(db,/,'store::execute must enforce the persisted authority');
  // The legacy operational view is closed under shared authority.
  const legacySnapshot=nativeStore.slice(nativeStore.indexOf('pub fn snapshot('),nativeStore.indexOf('pub fn snapshot(')+2000);
  assert.match(legacySnapshot,/AuthorityMode::SharedV2/,'legacy snapshot must fail closed under SHARED_V2');
  // The behaviours that caused the STOP-SHIP bug must be covered.
  assert.match(nativeTests,/shared_v2_refuses_legacy_business_writes_even_for_a_valid_local_pin/);
  assert.match(nativeTests,/business_authority_mode_is_persistent_forward_only_and_audited/);
  assert.match(nativeTests,/legacy_outbox_can_be_formally_superseded_only_after_a_ready_cutover/);
  // The unresolved-outbox guard replaces the acknowledged_at IS NULL test.
  assert.match(nativeStore,/pub fn reject_unresolved_legacy_outbox/);
  assert.match(nativeStore,/neither acknowledged by the cloud nor resolved by a v2 cutover/);
});

test('runtime routing follows the persisted authority and never falls back to a legacy write',()=>{
  // The old session-dependent guard is gone.
  assert.match(runtime,/fn reject_legacy_business_write_when_v2_active\(state:&Runtime,workflow:&str\)/);
  // runtime_command must be driven by the persisted mode and must NOT contain
  // the __legacyFallback escape hatch that silently created a second writer.
  const commandFn=runtime.slice(runtime.indexOf('async fn runtime_command('),runtime.indexOf('fn runtime_manager_approve('));
  assert.match(commandFn,/store::authority_mode\(&db\)\?/);
  assert.match(commandFn,/mode==store::AuthorityMode::SharedV2/);
  assert.match(commandFn,/local PIN access cannot write business records/);
  assert.ok(!commandFn.includes('__legacyFallback'),'the legacy write fallback must be removed');
  // runtime_sync must not reach the legacy uploader under shared authority.
  const syncFn=runtime.slice(runtime.indexOf('async fn runtime_sync('),runtime.indexOf('async fn sync_inner('));
  assert.match(syncFn,/store::authority_mode\(&db\)\?/);
  assert.match(syncFn,/mode==store::AuthorityMode::SharedV2\|\|v2_active/);
  assert.match(syncFn,/the legacy upload path is closed/);
  // runtime_snapshot must fail closed rather than expose legacy truth.
  const snapshotFn=runtime.slice(runtime.indexOf('async fn runtime_snapshot('),runtime.indexOf('fn runtime_login_offline('));
  assert.match(snapshotFn,/store::authority_mode\(&db\)\?/);
  assert.match(snapshotFn,/The shared v2 baseline is not installed/);
  // Offline local PIN must not create a write-capable session under shared v2.
  const offlineFn=runtime.slice(runtime.indexOf('fn runtime_login_offline('),runtime.indexOf('fn runtime_guidance_progress('));
  assert.match(offlineFn,/AuthorityMode::SharedV2/);
  assert.match(offlineFn,/local PIN unlock cannot create a business write session/);
  // Operator-visible status must report the persisted authority.
  assert.match(runtime,/"authorityMode":mode\.as_str\(\)/);
  assert.match(runtime,/"legacyWritesFenced":mode\.legacy_writes_fenced\(\)/);
  assert.match(runtime,/runtime_set_authority_mode,/);
  assert.match(runtime,/runtime_resolve_legacy_outbox,/);
});

test('native v2 command routing persists intent before authenticated dispatch and never falls back on transport failure', () => {
  assert.match(nativeStore,/pub fn queue_native_v2_command/);
  assert.match(nativeStore,/pub fn acknowledge_native_v2_command/);
  assert.match(nativeStore,/legacy outbox is drained and reconciled/);
  assert.match(runtime,/"servos_v2_execute"/);
  assert.match(runtime,/flush_native_v2_pending/);
  assert.match(runtime,/identity\["enabled"\]==true/);
  assert.match(runtimeProvider,/resolveOperationDependencies\(operation/);
  assert.match(runtimeProvider,/expectedVersions\s*\}\)/);
  assert.match(runtimeProvider,/runtime_v2_sync_replica/);
  assert.match(runtime,/store::native_v2_snapshot/);
  assert.match(runtime,/native_v2_snapshot\(&db,&token,&device,server_permissions\)/);
  assert.match(nativeStore,/server_permissions\.as_array\(\)\.is_some_and/);
  assert.match(nativeStore,/permission=="\*"\|\|permission=="folio\.room_charge"/);
  assert.match(runtime,/snapshot\["actor"\]\["permissions"\]=identity\["permissions"\]/);
  assert.match(runtime,/saved_policy\.as_deref\(\)!=current_policy/);
  assert.match(runtime,/Operator permissions changed since this v2 snapshot was installed/);
  assert.match(runtime,/async fn runtime_snapshot[\s\S]*?refresh_operator_auth_inner\(&state,true\)\.await\?/);
  assert.match(runtime,/reject_legacy_business_write_when_v2_active/);
});
