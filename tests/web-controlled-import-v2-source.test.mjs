import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/expansion/039_controlled_csv_import.sql', 'utf8');
const forwardSql = readFileSync('supabase/expansion/040_controlled_import_master_templates.sql', 'utf8');
const roomSql = readFileSync('supabase/expansion/041_controlled_import_room_inventory.sql', 'utf8');
const importFixture = readFileSync('tests/supabase/controlled-import.sql', 'utf8');
const ui = readFileSync('src/runtime/web/WebAdministrationView.tsx', 'utf8');
const manifest = readFileSync('src/runtime/operationManifest.ts', 'utf8');

test('Web controlled import stages bounded CSV and preserves reviewed source hash', () => {
  assert.match(sql, /parse_import_csv\(source text\)/);
  assert.match(sql, /n>2000000/);
  assert.match(sql, /20000 data rows/);
  assert.match(sql, /sourceHash/);
  assert.match(sql, /external_id is required for stable import identity/);
  assert.match(sql, /externalId/);
  assert.match(sql, /barcode/);
  assert.match(sql, /scientific notation is not accepted/);
});

test('Web controlled import dry-run rolls back domain validation and apply is hash-bound', () => {
  assert.match(sql, /admin\.import\.dryRun/);
  assert.match(sql, /IMPORT_DRY_RUN_ROLLBACK/);
  assert.match(sql, /admin\.import\.apply/);
  assert.match(sql, /md5\(preview::text\)<>batch->>'planHash'/);
  assert.match(sql, /create table servos_v2\.import_sources/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /'sourceCsv'/);
  assert.match(sql, /servos_v2\.apply_catalog_inventory\(domain_command\)/);
  assert.match(forwardSql, /'stockLocation\.save'/);
  assert.match(sql, /servos_v2\.apply_procurement\(domain_command\)/);
  assert.match(sql, /servos_v2\.apply_master\(domain_command\)/);
  assert.match(forwardSql, /template='stockLocations' then perform servos_v2\.require_any_permission\(array\['inventory\.adjust'\]\)/);
  assert.match(forwardSql, /template='roomTypes' then perform servos_v2\.require_any_permission\(array\['roomTypes\.manage'\]\)/);
  assert.match(forwardSql, /'collection',case when template='roomTypes' then 'roomTypes' else 'customers' end/);
  assert.match(roomSql, /servos_v2\.import_room_domain_command/);
  assert.match(roomSql, /servos_v2\.apply_rooms\(domain_command\)/);
  assert.match(roomSql, /perform servos_v2\.assert_version\(result,'roomTypes',room_type_id\)/);
  assert.match(roomSql, /only NIGHTLY rate plans can be imported/);
  assert.match(roomSql, /admin\.import\.cancel/);
  assert.match(roomSql, /batch ID has already been used; stage this source with a new batch ID/);
  assert.match(roomSql, /status','CANCELLED'.*cancellationReason.*sourcePurged/s);
  assert.match(roomSql, /for update/);
  assert.match(roomSql, /servos_v2\.import_asset_domain_command/);
  assert.match(roomSql, /select version into ref_version from servos_v2\.records where collection='assetCategories'.*for share/s);
  assert.match(roomSql, /servos_v2\.apply_assets\(domain_command\)/);
  assert.match(roomSql, /assetCategories\.manage/);
  assert.match(roomSql, /exactly one room or stock-location external ID/);
  assert.match(roomSql, /md5\(key\|\|':'\|\|target_id\)::uuid/);
  assert.match(importFixture, /template='ratePlans'/);
  assert.match(importFixture, /template='rooms'/);
  assert.match(importFixture, /room_type_external_id/);
  assert.match(importFixture, /template='assetCategories'/);
  assert.match(importFixture, /template='assets'/);
  assert.match(importFixture, /asset import did not leave immutable domain audit event/);
  assert.match(importFixture, /import cancellation rejected/);
  assert.match(importFixture, /cancelled batch ID was unexpectedly reusable/);
  assert.match(importFixture, /applied import was incorrectly cancelled/);
});

test('Web import UI exposes server review and explicit apply while recording partial parity', () => {
  assert.match(ui, /admin\.import\.dryRun/);
  assert.match(ui, /admin\.import\.apply/);
  assert.match(ui, /Staged batches/);
  assert.match(ui, /stockLocations:\[.*roomTypes:/s);
  assert.match(ui, /value="stockLocations">Stock locations.*value="roomTypes">Room types/s);
  assert.match(ui, /nightly rates, rooms, guests, suppliers, asset categories and assets.*does not import reservations\/bookings, opening balances, historical transactions or staff/i);
  assert.match(ui, /value="ratePlans">Nightly rate plans.*value="rooms">Rooms/s);
  assert.match(ui, /value="assetCategories">Asset categories.*value="assets">Assets \(no history\)/s);
  assert.match(ui, /admin\.import\.cancel/);
  assert.match(ui, /Cancel batch and remove file/);
  assert.match(manifest, /operation: 'admin\.import\.stage'.*backend: 'partial'.*web: 'partial'/);
});
