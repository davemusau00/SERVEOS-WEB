import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('web commands use operation-specific dependencies instead of the full snapshot', () => {
  const source=readFileSync('src/runtime/web/dependencies.ts','utf8');
  const app=readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  assert.match(source,/resolveOperationDependencies/);assert.match(source,/roomReservations/);assert.match(source,/sort\(/);
  assert.match(app,/resolveOperationDependencies\(operation,collection,id,payload,records\)/);
  assert.doesNotMatch(app,/const baselines=records\.map/);
});
