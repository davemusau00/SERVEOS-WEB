import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('web whole-location count persists every row and retains rejected review state', () => {
  const source = readFileSync('src/runtime/web/WebCatalogInventory.tsx', 'utf8');
  const migration = readFileSync('supabase/expansion/024_inventory_location_counts.sql', 'utf8');
  assert.match(source, /counts:Record<string,number\|null>/);
  assert.match(source, /baseline:Record<string/);
  assert.match(source, /rows=stocks\.map/);
  assert.match(source, /unknownBarcodes\}/);
  assert.match(source, /if\(!committed\)return/);
  assert.match(source, /localStorage\.setItem\(sessionKey,JSON\.stringify/);
  assert.match(source, /data\(record\)\?\.sessionId===sessionKey&&Number\(data\(record\)\?\.revision\)/);
  assert.match(source, /localStorage\.removeItem\(sessionKey\+':unknown'\)/);
  assert.doesNotMatch(source, /unknownBarcodes\.length>0&&false/);
  assert.match(migration, /every active stock item/);
  assert.match(migration, /apply_inventory_location_count/);
  assert.match(migration, /stockCounts/);
  assert.match(migration, /assert_version\(command,'stockLocations'/);
});
