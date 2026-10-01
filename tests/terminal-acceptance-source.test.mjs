import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('v2 dispatch reads the pending command under a short explicit SQLite lock scope',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  // The dispatch read must not pass a MutexGuard straight into a &Connection parameter.
  assert.ok(!/next_native_v2_pending\(&state\.db\.lock\(\)/.test(lib),'passing &MutexGuard into next_native_v2_pending does not compile');
  // Both call sites take the connection, read, and drop the guard in one scoped block.
  const scoped=lib.match(/\{let db=state\.db\.lock\(\)\.map_err\(\|e\|e\.to_string\(\)\)\?;store::next_native_v2_pending\(&db,&terminal\)\?\}/g)||[];
  assert.equal(scoped.length,2,'both pending-command reads must use the short lock scope');
});
test('no SQLite mutex is held across an awaited network operation',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  const lines=lib.split(/\r?\n/);
  // Any statement that both takes the db lock and awaits must not exist on one line.
  for(const line of lines){
    assert.ok(!(/state\.db\.lock\(\)/.test(line)&&/\.await/.test(line)),`lock held across await: ${line.trim().slice(0,80)}`);
  }
  // Multi-line scopes must bind the guard to a named local before the RPC.
  assert.match(lib,/let pending=\{let db=state\.db\.lock/);
  assert.match(lib,/let queued=\{let db=state\.db\.lock/);
});
test('terminal acceptance evidence is immutable local evidence rather than business records',()=>{
  const migration=readFileSync('src-tauri/migrations/009_terminal_acceptance.sql','utf8');
  assert.match(migration,/terminal_acceptance_evidence/);
  assert.match(migration,/Immutable terminal acceptance evidence/);
  assert.match(migration,/PRAGMA user_version=9/);
});
test('backup rehearsal opens an independent read-only restore and compares live identity',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  assert.match(lib,/BACKUP_RESTORE_REHEARSAL/);
  assert.match(lib,/OpenFlags::SQLITE_OPEN_READ_ONLY/);
  assert.match(lib,/restored_counts!=live_counts/);
  assert.match(lib,/restored_terminal!=live_terminal/);
  assert.match(lib,/idempotentCommandReplay/);
  assert.match(lib,/first!=second/);
});
test('restart recovery requires a genuinely different native process nonce',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  assert.match(lib,/startup_nonce/);
  assert.match(lib,/acceptance_restart_nonce/);
  assert.match(lib,/prior==state\.startup_nonce/);
  assert.match(lib,/newProcessObserved/);
});
test('physical hardware acceptance stays explicit and scanner raw values are not persisted',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  const view=readFileSync('src/native/NativeTerminalAcceptancePanel.tsx','utf8');
  assert.match(lib,/PRINTER_PAPER_OBSERVED/);
  assert.match(lib,/physicalPaperObserved/);
  assert.match(lib,/rawValueStored":false/);
  assert.match(view,/useBarcodeScanner/);
  assert.match(view,/Paper observed/);
  assert.match(view,/Direct cash-drawer control is not implemented/);
});
test('offline and cloud recovery acceptance prove local offline state then clean outbox',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  const view=readFileSync('src/native/NativeTerminalAcceptancePanel.tsx','utf8');
  assert.match(lib,/OFFLINE_LOCAL_PROBE/);
  assert.match(lib,/navigatorOffline/);
  assert.match(lib,/CLOUD_RESYNC/);
  assert.match(lib,/pending!=0/);
  assert.match(view,/navigator\.onLine/);
  assert.match(view,/Disconnect network first/);
});
test('final terminal acceptance is Admin-only and blocks unsafe live state',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  assert.match(lib,/Final terminal acceptance requires the Admin account/);
  assert.match(lib,/Close the active till before final terminal acceptance/);
  assert.match(lib,/local operation\(s\) are awaiting cloud acknowledgement/);
  assert.match(lib,/printer job\(s\) are queued or delivery-uncertain/);
  assert.match(lib,/Installation stage is .* final acceptance requires LIVE/);
});
test('terminal doctor is read-only and checks hardware host basics without changing Windows',()=>{
  const script=readFileSync('scripts/servos-terminal-doctor.ps1','utf8');
  assert.match(script,/READ_ONLY_TERMINAL_DOCTOR/);
  assert.match(script,/RamAtLeast4GB/);
  assert.match(script,/FreeDiskAtLeast5GB/);
  assert.match(script,/NairobiUtcOffset/);
  assert.match(script,/PrintSpoolerRunning/);
  assert.doesNotMatch(script,/\bSet-(Service|NetAdapter|TimeZone|Printer)\b/);
  assert.doesNotMatch(script,/\bStop-(Service|Process)\b/);
});
