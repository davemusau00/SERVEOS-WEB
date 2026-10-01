import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const nativeStore=read('../src-tauri/src/store.rs');
const nativeView=read('../src/native/NativeInventoryView.tsx');
const webView=read('../src/runtime/web/WebCatalogInventory.tsx');
const webSmartItem=read('../src/runtime/web/SmartItemDialog.tsx');
const webDependencies=read('../src/runtime/web/dependencies.ts');
const manifest=read('../src/runtime/operationManifest.ts');
const prepareMigration=read('../supabase/expansion/035_inventory_batch_preparation.sql');
const posMigration=read('../supabase/expansion/036_batch_pos_stock_consumption.sql');
const modifierMigration=read('../supabase/expansion/037_batch_modifier_inventory.sql');
const dispatchRepair=read('../supabase/expansion/042_floorplan_dispatch_repair.sql');
const inventoryAcceptance=read('../tests/supabase/inventory.sql');
const contracts=JSON.parse(readFileSync(new URL('../contracts/operations.json',import.meta.url),'utf8'));

test('native store validation errors collect using the shared String result type',()=>{
  assert.match(nativeStore,/ok_or_else\(\|\|"Stock barcode aliases must be non-empty text up to 128 characters"\.to_string\(\)\)\.collect::<Result<Vec<_>>>\(\)\?/);
});

test('batch preparation atomically consumes full recipe yields and records output stock',()=>{
  assert.match(nativeStore,/"inventory\.produceBatch" =>/);
  assert.match(nativeStore,/per_portion\*yield_per_batch\*batches as f64/);
  assert.match(nativeStore,/"BATCH_PREPARATION_INGREDIENT"/);
  assert.match(nativeStore,/"BATCH_PREPARATION_OUTPUT"/);
  assert.match(nativeStore,/let movement_id=id\(\);[\s\S]*"organizationId":"business","propertyId":"property"[\s\S]*"occurredAt":now\(\)/);
  assert.doesNotMatch(nativeStore,/let movement_id=new_id\(\)|user\.organization_id|user\.property_id|now_iso\(\)/);
  assert.match(nativeStore,/Finished portions must use the stock item linked to this batch recipe/);
  assert.match(prepareMigration,/require_permission\('inventory\.adjust'\)/);
  assert.match(prepareMigration,/assert_version\(command,'stockItems',ingredient_key\)/);
  assert.match(prepareMigration,/insufficient ingredient stock for batch preparation/);
  assert.match(prepareMigration,/BATCH_PREPARATION_INGREDIENT/);
  assert.match(prepareMigration,/BATCH_PREPARATION_OUTPUT/);
  assert.match(prepareMigration,/product->>'stockItemId' is distinct from output_key/);
  assert.match(prepareMigration,/offlineFinalized[\s\S]*signed offline grants required/);
  assert.match(dispatchRepair,/operation'='inventory\.produceBatch'.*apply_inventory_batch_preparation/s);
  assert.match(inventoryAcceptance,/inventory\.produceBatch/);
  assert.match(inventoryAcceptance,/batch preparation did not conserve ingredient and output stock/);
  assert.match(inventoryAcceptance,/insufficient batch ingredients changed stock or movements/);
});

test('batch portion sales consume prepared stock instead of consuming recipe inputs twice',()=>{
  assert.match(nativeStore,/if inventory_type=="BATCH"[\s\S]*Batch recipe has no linked finished-portions stock item/);
  assert.match(posMigration,/inventoryType','BATCH/);
  assert.match(posMigration,/pos_build_item_before_batch_stock/);
  assert.match(posMigration,/ingredientSnapshot/);
  assert.match(modifierMigration,/ingredientAdjustments/);
  assert.match(modifierMigration,/raw recipe lines are intentionally/);
  assert.match(webDependencies,/selectedModifierIds/);
  assert.match(webDependencies,/entry\.ingredientAdjustments/);
  assert.match(nativeView,/Prepare a recipe batch/);
  assert.match(webView,/Prepare a recipe batch/);
  assert.match(webSmartItem,/Batch recipe with prepared portion stock/);
  assert.match(webSmartItem,/recipeYield/);
  assert.match(webSmartItem,/catalog\.createWithOpeningStock/);
  assert.match(webSmartItem,/inventoryType: 'BATCH'/);
  assert.match(webSmartItem,/startingQuantity: 0/);
  assert.match(webDependencies,/operation === 'inventory\.produceBatch'/);
  assert.ok(contracts.operations.includes('inventory.produceBatch'));
  assert.match(manifest,/operation: 'inventory\.produceBatch',[\s\S]*native: 'implemented', backend: 'implemented', web: 'implemented'/);
});
