import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_MIGRATIONS, canonicalMigrations, expansionChain, canonicalNameFor } from '../scripts/canonical-migrations.mjs';

test('every icon declared for bundling exists and is the expected format', () => {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const icons = config.bundle?.icon;
  // Declared explicitly: relying on Tauri's implicit defaults left the MSI
  // bundler failing with "Couldn't find a .ico icon" while NSIS still worked.
  assert.ok(Array.isArray(icons) && icons.length > 0, 'bundle.icon must be declared explicitly');
  for (const icon of icons) {
    const path = join('src-tauri', icon);
    assert.ok(existsSync(path), `declared bundle icon must exist: ${path}`);
  }
  // Windows bundles need a real multi-size ICO, not a renamed PNG.
  const ico = readFileSync(join('src-tauri', 'icons', 'icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved field must be zero');
  assert.equal(ico.readUInt16LE(2), 1, 'ICO type field must be 1 (icon)');
  assert.ok(ico.readUInt16LE(4) > 0, 'ICO must declare at least one image');
});

test('the canonical migration set is complete, ordered and free of duplicates', () => {
  const chain = expansionChain();
  assert.equal(chain.length, 47, 'the reviewed staged v2 chain must keep all 47 migrations');
  const canonical = canonicalMigrations();
  assert.equal(canonical.length, BASE_MIGRATIONS.length + chain.length);
  assert.equal(new Set(canonical).size, canonical.length, 'no migration may be applied twice');
  // Base migrations precede the staged v2 chain, which preserves the reviewed order.
  for (const base of BASE_MIGRATIONS) assert.ok(canonical.indexOf(base) < canonical.indexOf(canonicalNameFor('001_protocol.sql')));
});

test('every canonical migration exists on disk under supabase/migrations', () => {
  assert.ok(existsSync('supabase/config.toml'), 'supabase/config.toml is required for CLI deployments');
  for (const file of canonicalMigrations()) {
    assert.ok(existsSync(`supabase/migrations/${file}`), `missing canonical migration ${file}`);
  }
});

test('the test runner applies one canonical migration set and no longer reads supabase/expansion', () => {
  const runner = readFileSync('scripts/test-supabase.mjs', 'utf8');
  assert.ok(!/readdirSync\('supabase\/expansion'\)/.test(runner), 'the runner must not apply the historic expansion directory');
  assert.ok(!runner.includes("roots = ['supabase/migrations', 'supabase/expansion']"));
  assert.match(runner, /baseMigrations\(\)/);
  assert.match(runner, /v2Migrations\(\)/);
  // protocol.sql exercises the legacy writer, so it must run before migration 001 fences it.
  assert.ok(runner.indexOf('tests/supabase/protocol.sql') < runner.indexOf('v2Migrations().map(migrationPath)'));
});

test('release evidence hashes only the canonical migration set', () => {
  for (const file of ['scripts/write-ci-evidence.mjs', 'scripts/write-release-candidate.mjs', 'scripts/protocol-check.mjs']) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes("'supabase/expansion'"), `${file} must not hash the historic expansion root`);
  }
  const config = readFileSync('supabase/config.toml', 'utf8');
  assert.match(config, /supabase\/migrations/);
});

test('the historic expansion sources remain available for review', () => {
  for (const file of expansionChain()) {
    assert.ok(existsSync(`supabase/expansion/${file}`), `historic review source ${file} should be retained`);
  }
  assert.ok(readdirSync('supabase/migrations').length >= BASE_MIGRATIONS.length + expansionChain().length);
});


const read=file=>readFileSync(file,'utf8');

test('0.2.0 release identity and existing-terminal upgrade contract are pinned',()=>{
  const pkg=JSON.parse(read('package.json'));
  const tauri=JSON.parse(read('src-tauri/tauri.conf.json'));
  const cargo=read('src-tauri/Cargo.toml');
  const migration=read('src-tauri/migrations/013_customer_credit.sql');
  const builder=read('scripts/build-terminal-installer.ps1');
  const upgrade=read('docs/EXISTING_TERMINAL_UPGRADE.md');
  const acceptance=read('docs/RELEASE_0.2_ACCEPTANCE.md');

  assert.equal(pkg.version,'0.2.0');
  assert.equal(tauri.version,'0.2.0');
  assert.equal(tauri.identifier,'ke.servos.business');
  assert.match(cargo,/version\s*=\s*"0\.2\.0"/);
  assert.match(migration,/PRAGMA user_version=13/);
  assert.match(builder,/docs\\EXISTING_TERMINAL_UPGRADE\.md/);
  assert.match(builder,/docs\\RELEASE_0\.2_ACCEPTANCE\.md/);
  assert.match(builder,/SQLiteSchema\s*=\s*13/);
  assert.match(builder,/ExistingEnrollmentPreserved\s*=\s*\$true/);
  assert.match(upgrade,/Do not repeat Intake or enrollment/);
  assert.match(upgrade,/old binary must never be pointed at the already-upgraded schema-12 database/i);
  assert.match(acceptance,/PhysicalAcceptance/);
});

test('Simple Operations RC surfaces preserve atomic domain commands and friendly copy',()=>{
  const receive=read('src/native/SimpleReceiveDelivery.tsx');
  const hospitality=read('src/native/SimpleHospitality.tsx');
  const importUi=read('src/native/FriendlyImport.tsx');
  const guides=read('src/guidance/core.ts');

  for(const marker of ['purchaseOrder.receive','procurement.receiveDelivery','scanUnitQuantity','Unknown barcode','Review Delivery','Confirm Delivery']) assert.match(receive,new RegExp(marker.replace('.','\\.')));
  for(const marker of ['room.quickCreate','asset.quickCreate','maintenance.report','Review rooms','Advanced details']) assert.match(hospitality,new RegExp(marker.replace('.','\\.')));
  for(const marker of ['Paste from Excel','Match your columns','Validate mapped data','Nothing is applied automatically']) assert.match(importUi,new RegExp(marker));
  for(const bad of ['Ã‚Â·','Ã¢â‚¬Â¦','Ã¢â€ â€™','Ã¢â‚¬â€','Ã¢â‚¬â€œ']) assert.equal(importUi.includes(bad),false,`FriendlyImport contains mojibake marker ${bad}`);

  assert.match(guides,/id:\s*'pos\.first-sale'/);
  assert.match(guides,/id:\s*'stock\.count'/);
  assert.match(guides,/id:\s*'stock\.receive'/);
  assert.match(guides,/inventory\.countLocation/);
  assert.match(guides,/purchaseOrder\.receive/);
  assert.match(guides,/procurement\.receiveDelivery/);
});

test('release documentation distinguishes local verification from physical acceptance',()=>{
  const current=read('docs/CURRENT_RELEASE_STATE.md');
  const ledger=read('docs/COMPLETION_LEDGER.md');
  const evidence=read('docs/TEST_EVIDENCE.md');
  const runbook=read('docs/DEPLOYMENT_RUNBOOK.md');

  assert.match(current,/0\.2\.0 release candidate closure/);
  assert.match(current,/physical terminal acceptance remains open/i);
  assert.match(ledger,/Simple Receive Delivery/);
  assert.match(ledger,/Friendly CSV \/ Excel-paste import/);
  assert.match(evidence,/0\.2\.0 release-candidate gate/);
  assert.match(evidence,/PENDING EXECUTION/);
  assert.match(runbook,/ServOS 0\.2\.0 existing-terminal deployment/);
});


test('Quick Add Property does not require a category before opening the simple dialog',()=>{
  const assets=read('src/native/NativeAssetsView.tsx');
  const hospitality=read('src/native/SimpleHospitality.tsx');
  assert.match(assets,/initialAction==='add-asset'/);
  assert.match(assets,/setModal\(\{kind:'SIMPLE_PROPERTY'\}\)/);
  assert.doesNotMatch(assets,/Create a property category first, then add the property item/);
  assert.match(hospitality,/Unclassified property/);
  assert.match(hospitality,/disabled=\{busy \|\| !name\.trim\(\) \|\| !location\}/);
});


test('release verifier forwards argument lists instead of colliding with automatic Args',()=>{
  const verifier=read('scripts/verify-release-0.2.ps1');
  assert.match(verifier,/function Run\(\[string\]\$File, \[string\[\]\]\$ArgumentList\)/);
  assert.match(verifier,/& \$File @ArgumentList/);
  assert.match(verifier,/Run 'git\.exe' @\('diff','--check'\)/);
  assert.doesNotMatch(verifier,/\[string\[\]\]\$Args/);
  assert.doesNotMatch(verifier,/@Args/);
});


test('disposable PostgreSQL waits for stable query readiness before applying migrations',()=>{
  const harness=read('scripts/test-supabase.mjs');
  assert.match(harness,/psql', '-U', 'postgres', '-Atqc', 'select 1'/);
  assert.match(harness,/consecutiveReady >= 2/);
  assert.match(harness,/attempt < 60/);
  assert.match(harness,/\['logs', container\]/);
  assert.doesNotMatch(harness,/pg_isready/);
});
