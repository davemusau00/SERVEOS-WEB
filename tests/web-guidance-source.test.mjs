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

test('web command editors remain available until synchronization is confirmed', () => {
  const app = read('src/runtime/web/WebBusinessApp.tsx');
  const submit = app.slice(app.indexOf('const submit='), app.indexOf('const action=', app.indexOf('const submit=')));
  assert.match(submit, /enqueue\(operation,payload,baselines,editor\?\.supersedes\);setNotice\(/);
  assert.match(submit, /saveDraft\(\{id:draftId,operation,collection,targetId:id/);
  assert.match(submit, /workflow was saved for review/);
  assert.match(submit, /result\?\.status==='SYNCHRONIZED'\).*setEditor\(null\)/);
  assert.doesNotMatch(submit, /enqueue\(operation,payload,baselines\);setEditor\(null\)/);
});

test('activity recovery never instructs operators to resend immutable commands', () => {
  const activity = read('src/runtime/web/ActivitySyncCenter.tsx');
  assert.match(activity, /reopen the saved workflow and submit a new command with fresh versions/);
  assert.match(activity, /Do not resend it/);
  assert.doesNotMatch(activity, /retry the same command/);
});

test('activity exposes typed draft reopening and the app re-resolves the workflow', () => {
  const activity = read('src/runtime/web/ActivitySyncCenter.tsx');
  const store = read('src/runtime/web/BusinessStore.ts');
  const app = read('src/runtime/web/WebBusinessApp.tsx');
  assert.match(store, /fields\?:WorkflowDraftField\[\]/);
  assert.match(activity, /Review and reopen/);
  assert.match(activity, /onReviewDraft\(draft\)/);
  assert.match(app, /const reviewDraft=\(draft:WorkflowDraft\)/);
  assert.match(app, /draftId:draft\.id/);
  assert.match(app, /resolveOperationDependencies\(operation,collection,id,payload,records\)/);
  assert.match(app, /Business policy changed while this workflow was saved/);
  assert.match(app, /no command was queued/);
});

test('reviewed replacement commands carry immutable supersedes correlation', () => {
  const types = read('src/types/transactions.ts');
  const store = read('src/runtime/web/BusinessStore.ts');
  const app = read('src/runtime/web/WebBusinessApp.tsx');
  const migration = read('supabase/expansion/026_command_supersedes.sql');
  const acceptance = read('tests/supabase/expansion.sql');
  assert.match(types, /supersedes\?:string/);
  assert.match(store, /async enqueue\(operation:string,payload:Record<string,unknown>,expectedVersions:RecordVersion\[\],supersedes\?:string\)/);
  assert.match(app, /enqueue\(operation,payload,baselines,editor\?\.supersedes\)/);
  assert.match(app, /command\.id\);setNotice/);
  assert.match(migration, /previous\.result->>'status' not in \('CONFLICT','REJECTED'\)/);
  assert.match(acceptance, /supersedes correlation missing/);
});
