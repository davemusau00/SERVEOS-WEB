import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('native inventory exposes stock health, valuation, filtering and safe movement actions',()=>{
  const source=readFileSync('src/native/NativeInventoryView.tsx','utf8')+readFileSync('src/native/BottleCountDialog.tsx','utf8');
  assert.match(source,/Stock control/);
  assert.match(source,/Stock value/);
  assert.match(source,/reorderLevel/);
  assert.match(source,/Out of stock/);
  assert.match(source,/useBarcodeScanner/);
  assert.match(source,/inventory\.countLocation/);
  assert.match(source,/inventory\.transfer/);
  assert.match(source,/inventory\.waste/);
  assert.match(source,/Confirm Count/);
  assert.doesNotMatch(source,/inventory\.receive/);
});

test('stock master exposes reorder level without owning live currentStock',()=>{
  const source=readFileSync('src/native/NativeCatalogView.tsx','utf8');
  assert.match(source,/Reorder level in base units/);
  assert.match(source,/reorderLevel/);
  assert.match(source,/currentStock/);
});

test('legacy remote manager is human-readable while preserving terminal authority',()=>{
  const source=readFileSync('src/runtime/RemoteManagerApp.tsx','utf8');
  assert.match(source,/ServOS Remote/);
  assert.match(source,/Terminal sync/);
  assert.match(source,/Pending requests/);
  assert.match(source,/Technical data/);
  assert.match(source,/servos_request_change/);
  assert.match(source,/Remote edits remain requests until the terminal applies and uploads them/);
});

test('catalog visible copy contains no known mojibake markers',()=>{
  const source=readFileSync('src/native/NativeCatalogView.tsx','utf8');
  for(const bad of ['Â·','â†’','â˜…','â€”','â€¦','â€“']) assert.equal(source.includes(bad),false,`found ${bad}`);
});
