import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Web maintenance exposes only the staged/native maintenance command family', () => {
  const view = read('../src/runtime/web/WebMaintenanceView.tsx');
  const app = read('../src/runtime/web/WebBusinessApp.tsx');
  const registry = read('../src/runtime/web/workspaceRegistry.ts');
  const manifest = read('../src/runtime/operationManifest.ts');
  for (const operation of ['maintenance.report', 'maintenance.assign', 'maintenance.start', 'maintenance.complete', 'maintenance.cancel']) {
    assert.ok(view.includes(operation), `missing Web workflow for ${operation}`);
    assert.ok(manifest.includes(`operation: '${operation}'`), `missing parity entry for ${operation}`);
  }
  assert.match(app, /tab==='Maintenance'.*WebMaintenanceView/);
  assert.match(registry, /id: 'Maintenance'.*maintenance\.view.*maintenance\.manage/);
  assert.doesNotMatch(manifest, /operation: 'asset\.maintenance'/);
  assert.match(view, /command\(operation,'maintenanceOrders',id,payload\)/);
  assert.match(view, /Promise<CommandOutcome>/);
  assert.match(view, /isCommandConfirmed\(await run\(/);
  assert.match(view, /setOutcome\(result\)/);
  assert.match(view, /case'OUTCOME_UNKNOWN':case'REJECTED'/);
  assert.doesNotMatch(view, /Maintenance action queued/);
  assert.match(view, /parts:\[\]/, 'parts issue must remain explicitly empty until the form supports it');
});
