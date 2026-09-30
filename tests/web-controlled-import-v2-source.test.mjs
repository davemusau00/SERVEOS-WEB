import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/expansion/039_controlled_csv_import.sql', 'utf8');
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
  assert.match(sql, /servos_v2\.apply_procurement\(domain_command\)/);
  assert.match(sql, /servos_v2\.apply_master\(domain_command\)/);
});

test('Web import UI exposes server review and explicit apply while recording partial parity', () => {
  assert.match(ui, /admin\.import\.dryRun/);
  assert.match(ui, /admin\.import\.apply/);
  assert.match(ui, /Staged batches/);
  assert.match(ui, /opening balances, historical transactions, rooms, staff, assets and migrations are not imported here/i);
  assert.match(manifest, /operation: 'admin\.import\.stage'.*backend: 'partial'.*web: 'partial'/);
});
