import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production web v2 is disabled by default',()=>{
  const env=readFileSync('.env.example','utf8');
  assert.match(env,/^VITE_ENABLE_WEB_V2=false$/m);
});

test('the server authority is an explicit mode, not a single boolean',()=>{
  const sql=readFileSync('supabase/migrations/20261001045_authority_modes.sql','utf8');
  // The three explicit values the cutover runbook depends on.
  assert.match(sql,/add column if not exists authority_mode text not null default 'LEGACY_LOCAL'/);
  assert.match(sql,/check\(authority_mode in \('LEGACY_LOCAL','CUTOVER_PREP','SHARED_V2'\)\)/);
  // The legacy boolean survives only as a derived compatibility flag.
  assert.match(sql,/set authority_mode=case when enabled then 'SHARED_V2' else 'LEGACY_LOCAL' end/);
  assert.match(sql,/set authority_mode=to_mode,enabled=\(to_mode='SHARED_V2'\)/);
  // CUTOVER_PREP is the maintenance window a single boolean could not express.
  assert.match(sql,/create or replace function servos_v2\.authority\(\)/);
  assert.match(sql,/create or replace function servos_v2\.shared_v2_active\(\)/);
  assert.match(sql,/servos_upload_before_authority_mode/);
  assert.match(sql,/authority_mode='LEGACY_LOCAL' for share/);
  assert.match(sql,/legacy writer frozen during cutover preparation/);
  assert.match(sql,/servos_v2_execute_before_authority_mode/);
  assert.match(sql,/v2 business writes require SHARED_V2 authority/);
  // Snapshot must NOT be re-gated, or the terminal could never install its
  // baseline during the cutover window.
  assert.ok(!/servos_v2_snapshot[\s\S]{0,400}authority_mode/.test(sql),
    'snapshot must not be gated on the authority mode');
  // Admin-only, forward-only, audited, with no client-controlled actor.
  assert.match(sql,/create or replace function public\.servos_v2_set_authority_mode\(next_mode text, reason text\)/);
  assert.match(sql,/role='Admin'/);
  assert.match(sql,/must move forward LEGACY_LOCAL -> CUTOVER_PREP -> SHARED_V2/);
  assert.match(sql,/a verified v2 cutover is required before SHARED_V2/);
  assert.match(sql,/insert into servos_v2\.authority_transitions/);
  assert.ok(!/actor_id\s+uuid\s*:=/.test(sql),'the actor must come from auth.uid(), never a parameter');
  // Identity responses must carry the mode so a terminal never infers it.
  assert.match(sql,/'authorityMode',servos_v2\.authority\(\)/);
  assert.match(sql,/'sharedV2',servos_v2\.shared_v2_active\(\)/);
});

test('the generated ledger enforces Native -> Cloud parity as a build gate',()=>{
  const ledgerScript=readFileSync('scripts/build-operation-ledger.ts','utf8');
  const manifest=readFileSync('src/runtime/operationManifest.ts','utf8');
  // The gate must fail the build, not merely print a warning.
  assert.match(ledgerScript,/Native -> Cloud parity gate FAILED/);
  assert.match(ledgerScript,/process\.exit\(1\)/);
  assert.match(ledgerScript,/item\.native === 'implemented' && item\.v2Routing === 'shared'/);
  assert.match(ledgerScript,/item\.backend !== 'implemented'/);
  // Device-local operations must be excluded explicitly and by name, so an
  // unclassified operation is never silently skipped.
  assert.match(manifest,/LOCAL_ONLY_OPERATIONS = new Set<string>\(\[\s*'runtime\.print_receipt',\s*'runtime\.backup',?\s*\]\)/);
  assert.match(manifest,/v2Routing: LOCAL_ONLY_OPERATIONS\.has\(item\.operation\) \? 'local-only' : 'shared'/);
  // The canonicalization the sprint required: one credit path, two distinct comps.
  assert.match(manifest,/operation: 'customerCredit\.charge'[^}]*backend: 'implemented'/);
  assert.match(manifest,/operation: 'credit\.charge'[^}]*native: 'implemented'[^}]*backend: 'implemented'/);
  assert.match(manifest,/operation: 'order\.comp'[^}]*native: 'implemented'[^}]*backend: 'implemented'/);
  assert.match(manifest,/operation: 'order\.compItem'[^}]*native: 'implemented'[^}]*backend: 'implemented'/);
  // The build must run the gate, not only regenerate documentation.
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  assert.match(pkg.scripts.build,/parity:build/);
  assert.match(pkg.scripts['docs:check'],/parity:build/);
});

test('the SQLite -> v2 cutover is gated, replayable, allowlisted and provenance stamped',()=>{
  const sql=readFileSync('supabase/migrations/20261001046_v2_cutover_bootstrap.sql','utf8');
  // Cutover state and its explicit status set.
  assert.match(sql,/create table if not exists servos_v2\.cutovers\(/);
  assert.match(sql,/status in \('PREPARING','IMPORTING','VERIFYING','READY','COMMITTED','ABORTED'\)/);
  assert.match(sql,/source_manifest_hash text not null check\(length\(source_manifest_hash\)=64\)/);
  assert.match(sql,/create table if not exists servos_v2\.cutover_pages\(/);
  assert.match(sql,/create table if not exists servos_v2\.cutover_evidence\(/);
  // Import is only ever permitted in the maintenance window.
  assert.match(sql,/cutover import requires CUTOVER_PREP authority/);
  // Idempotent page replay with an immutable page hash.
  assert.match(sql,/REPLAY_MISMATCH: page % was already imported with different content/);
  assert.match(sql,/page_hash text not null check\(length\(page_hash\)=64\)/);
  // A bounded page size and a fixed collection allowlist.
  assert.match(sql,/jsonb_array_length\(page->'records'\)>500/);
  assert.match(sql,/function servos_v2\.cutover_collection_allowed/);
  assert.match(sql,/is not eligible for cutover import/);
  // No client-controlled actor and no client-controlled server cursor.
  assert.match(sql,/who uuid:=servos_v2\.cutover_precheck\(\)/);
  assert.match(sql,/Admin staff profile required/);
  // Immutable history keeps provenance and is never re-transacted.
  assert.match(sql,/function servos_v2\.cutover_collection_is_history/);
  assert.match(sql,/'source','LEGACY_SQLITE_CUTOVER','sourceCutoverId',p_cutover_id::text/);
  // Parameters are prefixed because bare names collide with same-named columns.
  assert.match(sql,/servos_v2_import_cutover_page\(p_cutover_id uuid,p_page_index integer/);
  // Duplicate/conflicting ids are refused, never silently overwritten.
  assert.match(sql,/DUPLICATE_CONFLICT/);
  // Credential fields may not enter shared business records.
  assert.match(sql,/credential field in imported record/);
  // Verification recomputes totals independently rather than echoing the client.
  assert.match(sql,/function servos_v2\.cutover_server_totals/);
  assert.match(sql,/paymentByTender/);
  assert.match(sql,/stockQuantity/);
  // Commit requires READY plus backup evidence.
  assert.match(sql,/a local backup must be confirmed before commit/);
  assert.match(sql,/an abort reason is required/);
  assert.match(sql,/Immutable cutover evidence/);
  // The allowlist must exclude the three legacy collections with no v2 read path.
  assert.match(sql,/function servos_v2\.cutover_collection_allowed[\s\S]*?end/);
  assert.ok(!/'property'\s*,/.test(sql.slice(sql.indexOf('cutover_collection_allowed'),sql.indexOf('cutover_collection_is_history'))),
    'property must not be in the cutover allowlist');
});

test('the disposable harness proves the cutover bootstrap boundary',()=>{
  const suite=readFileSync('tests/supabase/cutover.sql','utf8');
  for(const marker of [
    'cutover import must be refused outside CUTOVER_PREP',
    'a malformed manifest hash must be refused',
    'an invalid source terminal must be refused',
    'a refused manifest must not create a cutover',
    'the cutover allowlist must exclude unsupported collections',
    'CUTOVER_PREP must freeze the legacy writer',
    'CUTOVER_PREP must still refuse v2 business writes',
    'an ineligible collection must be refused',
    'identical page replay must be idempotent',
    'a conflicting page replay must be refused',
    'imported history must carry cutover provenance',
    'a credential field must be refused on import',
    'commit before verification must be refused',
    'page evidence must be immutable',
    'cutover evidence must not be deletable',
    'an abort reason must be required',
  ]) assert.ok(suite.includes(marker),marker);
  assert.match(suite,/\nrollback;\s*$/);
  assert.match(readFileSync('scripts/test-supabase.mjs','utf8'),/tests\/supabase\/cutover\.sql/);
});

test('the authority-mode wrapper is valid SQL and the identity exposes the mode',()=>{
  const sql=readFileSync('supabase/migrations/20261001045_authority_modes.sql','utf8');
  // A bare SELECT body declared as plpgsql is a syntax error: `select ...; end$$`.
  // This exact shape aborted the whole migration transaction when first executed.
  assert.ok(/create function public\.servos_v2_terminal_identity\(device_id uuid\)\s*\nreturns jsonb language sql security definer/.test(sql),
    'the identity wrapper must be language sql because its body is a bare SELECT');
  assert.ok(!/servos_v2_terminal_identity\(device_id uuid\)[\s\S]{0,200}language plpgsql[\s\S]{0,400}\nselect[\s\S]{0,200}end\$\$;/.test(sql),
    'a bare SELECT must never be wrapped in plpgsql');
  assert.match(sql,/select public\.servos_v2_terminal_identity_before_authority_mode/);
});

test('a malformed cutover source id yields an actionable validation failure',()=>{
  // The guard lives in the cutover bootstrap migration, not the authority-mode one.
  const sql=readFileSync('supabase/migrations/20261001046_v2_cutover_bootstrap.sql','utf8');
  assert.match(sql,/raise exception 'VALIDATION_FAILED: source terminal id must be a UUID'/);
  // Parameters must not collide with same-named columns inside plpgsql.
  assert.match(sql,/where p\.cutover_id=p_cutover_id and p\.page_index=p_page_index/);
  // paymentByTender is an object and must never be cast to numeric.
  assert.match(sql,/if coalesce\(client_totals->'paymentByTender','\{\}'::jsonb\)/);
});

test('the parity harness proves the two payload shapes charge identically',()=>{
  const suite=readFileSync('tests/supabase/native-parity.sql','utf8');
  assert.match(readFileSync('scripts/test-supabase.mjs','utf8'),/tests\/supabase\/native-parity\.sql/);
  assert.ok(suite.includes('the derived Native payload and the explicit Web payload must charge the same amount'));
  assert.ok(suite.includes('a refused under-charge must not create a credit entry'));
  assert.ok(suite.includes('a refused charge must leave the order open'));
  // The Native payload deliberately carries no customerId and no amountMinor.
  assert.match(suite,/pg_temp\.parity_command\('customerCredit\.charge','orders','parity-native',\s*\n\s*jsonb_build_object\('orderId','parity-native'\)\)/);
  const sql=readFileSync('supabase/migrations/20261001047_native_command_parity.sql','utf8');
  assert.match(sql,/command->>'operation' in \('credit\.charge','customerCredit\.charge'\)/);
  // order.assignCustomer was emitted by Native with no v2 handler and no ledger entry.
  assert.match(sql,/create or replace function servos_v2\.apply_order_assign_customer/);
  assert.match(sql,/command->>'operation'='order\.assignCustomer'/);
});

test('the disposable harness proves the authority mode matrix',()=>{
  const suite=readFileSync('tests/supabase/authority-modes.sql','utf8');
  for(const marker of [
    "servos_v2.authority()<>'LEGACY_LOCAL'",
    'v2 execute must be refused before SHARED_V2',
    'Authority must not skip CUTOVER_PREP',
    'An authority transition must require a reason',
    'SHARED_V2 must require a verified cutover',
    'CUTOVER_PREP must freeze the legacy writer',
    'Snapshot must remain available during CUTOVER_PREP',
    'CUTOVER_PREP must still refuse v2 business writes',
    'Identity must expose the authority mode',
    'Authority transition evidence must be immutable',
    'A non-Admin must not be able to move the authority',
  ]) assert.ok(suite.includes(marker),marker);
  // The suite must roll back: it never mutates a business project.
  assert.match(suite,/\nrollback;\s*$/);
  assert.match(readFileSync('scripts/test-supabase.mjs','utf8'),/tests\/supabase\/authority-modes\.sql/);
  // Every suite that enables v2 writes must set the explicit mode too,
  // otherwise the new execute gate silently breaks the established fixtures.
  for(const name of ['assets','controlled-import','expansion','financial-controls','floorplan','folios','inventory','pos','procurement','rooms','settings','smart-items','staff-devices','web-session']){
    for(const line of readFileSync(`tests/supabase/${name}.sql`,'utf8').split('\n').filter(l=>l.includes('control set enabled=true'))){
      assert.match(line,/authority_mode='SHARED_V2'/,`${name}: ${line.trim()}`);
    }
  }
});

test('remote manager requires the explicit frontend gate before probing v2',()=>{
  const source=readFileSync('src/runtime/RemoteManagerApp.tsx','utf8');
  assert.match(source,/VITE_ENABLE_WEB_V2/);
  assert.match(source,/if\(webV2Enabled\)\{/);
  assert.match(source,/rpc\/servos_v2_session/);
  assert.match(source,/rpc\/servos_is_manager/);
  assert.match(source,/if\(cloudSession\?\.enabled\)return <WebBusinessApp/);
});

test('staging runbook prohibits dual writers',()=>{
  const source=readFileSync('docs/WEB_V2_STAGING_RUNBOOK.md','utf8');
  assert.match(source,/Never operate legacy and v2 business writers concurrently/);
  assert.match(source,/isolated non-production Supabase project/);
});
