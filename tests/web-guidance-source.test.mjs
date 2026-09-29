import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(file, 'utf8');

test('web terminal shares task-first intake and help language with the native terminal', () => {
  const guidance = read('src/runtime/web/WebGuidanceViews.tsx');
  const app = read('src/runtime/web/WebBusinessApp.tsx');
  assert.match(guidance, /What are you working on\?/);
  assert.match(guidance, /Quick Add/);
  assert.match(guidance, /Item or menu product/);
  assert.match(guidance, /Receive a delivery/);
  assert.match(guidance, /Search help articles/);
  assert.match(guidance, /same simple operating guides/);
  assert.match(app, /WebStartHere/);
  assert.match(app, /WebHelpView/);
  assert.match(app, /WebGuidedTour/);
});

test('web quick actions remain permission filtered and use existing queued editors', () => {
  const guidance = read('src/runtime/web/WebGuidanceViews.tsx');
  const app = read('src/runtime/web/WebBusinessApp.tsx');
  assert.match(guidance, /canUse\(permissions, \[action\.permission\]\)/);
  assert.match(app, /const quickAdd=\(id:string\)=>/);
  assert.match(app, /record\.save/);
  assert.match(app, /product\.save/);
  assert.doesNotMatch(guidance, /supabase\.from|business_records/);
});

test('web operator copy hides implementation terms from the primary workflow', () => {
  const app = read('src/runtime/web/WebBusinessApp.tsx');
  const catalog = read('src/runtime/web/WebCatalogInventory.tsx');
  const procurement = read('src/runtime/web/WebProcurementView.tsx');
  assert.match(app, /Saved changes/);
  assert.match(app, /waiting to sync/);
  assert.doesNotMatch(app, /Command history|Disconnected actions are drafts|server will validate/);
  assert.match(catalog, /See what is on hand/);
  assert.match(procurement, /Create an order, check what arrived/);
});