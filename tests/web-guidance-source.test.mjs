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
  assert.match(guidance, /onStartTour:startTour/);
  assert.match(guidance, /React\.MouseEvent<HTMLButtonElement>/);
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
  assert.match(submit, /const command=await store\.current\.enqueue\(operation,payload,baselines,editor\?\.supersedes,typeof payload\.reviewCommandId==='string'\?payload\.reviewCommandId:undefined\);activeCommandId=command\.id;setNotice\(/);
  assert.match(submit, /saveDraft\(\{id:draftId,operation,collection,targetId:id/);
  assert.match(submit, /retainForReview\(\[safeError\],command\.id,false\)/);
  assert.match(submit, /setEditor\(currentEditor=>currentEditor\?\{\.\.\.currentEditor,supersedes:command\.id\}/);
  assert.match(submit, /result\?\.status==='SYNCHRONIZED'\).*setEditor\(null\)/);
  assert.doesNotMatch(submit, /enqueue\(operation,payload,baselines\);setEditor\(null\)/);
});

test('web task guides resume by guide ID and only complete on a server-confirmed command',()=>{
  const app=read('src/runtime/web/WebBusinessApp.tsx');
  const guidance=read('src/runtime/web/WebGuidanceViews.tsx');
  const generated=read('src/generated/help-index.json');
  const stockGuide=read('src/guidance/core.ts');
  assert.match(app,/entry\.state==='SYNCHRONIZED'[\s\S]*setCommittedOperation\(\{id:entry\.id,operation:entry\.command\.operation\}\)/);
  assert.match(app,/committedOperation=\{committedOperation\}/);
  assert.match(guidance,/selectedGuideId/);
  assert.match(guidance,/initialGuide=GUIDES\.find/);
  assert.match(app,/Count stock':'stock\.count/);
  assert.match(guidance,/progress\.state!=='IN_PROGRESS'[\s\S]*currentStepId:steps\[0\]/);
  assert.match(app,/const startTour=\(guideId='servos\.core'\)[\s\S]*guide\.permissions/);
  assert.match(app,/Guide progress could not be saved to your account/);
  assert.match(guidance,/seenCommit\.current===committedOperation\.id/);
  assert.match(guidance,/successOperations\?\.includes\(committedOperation\.operation\)/);
  assert.match(guidance,/successOperations\?\.length&&!committed/);
  assert.match(generated,/"guideId": "servos\.core"/);
  assert.match(generated,/"guideId": "pos\.first-sale"/);
  assert.match(generated,/"guideId": "stock\.count"/);
  assert.match(generated,/"guideId": "stock\.receive"/);
  assert.match(stockGuide,/articleId: '21-stocktake'/);
  assert.doesNotMatch(guidance,/onClick=\{\(\)=>move\(step\+1\)\}[^}]*successOperations/);
});

test('activity recovery never instructs operators to resend immutable commands', () => {
  const activity = read('src/runtime/web/ActivitySyncCenter.tsx');
  const store = read('src/runtime/web/BusinessStore.ts');
  const sync = read('src/runtime/web/sync.ts');
  const app = read('src/runtime/web/WebBusinessApp.tsx');
  assert.match(activity, /reopen the saved workflow and submit a new command with fresh versions/);
  assert.match(activity, /Do not resend it/);
  assert.match(activity, /OUTCOME_UNKNOWN/);
  assert.match(activity, /retry the same command ID/);
  assert.match(sync, /row\.state==='PENDING_SYNC'\|\|row\.state==='OUTCOME_UNKNOWN'/);
  assert.match(sync, /await store\.markOutcomeUnknown\(row\.id\)/);
  assert.match(store, /state:'PENDING_SYNC'\|'OUTCOME_UNKNOWN'/);
  assert.match(app, /submitInFlight\.current/);
  assert.match(app, /original command is saved for outcome checking/);
  assert.match(app, /draft\.supersedes===entry\.id/);
  assert.match(store, /export const redactSensitiveData/);
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
  assert.match(store, /async enqueue\(operation:string,payload:Record<string,unknown>,expectedVersions:RecordVersion\[\],supersedes\?:string,reviewCommandId\?:string\)/);
  assert.match(app, /enqueue\(operation,payload,baselines,editor\?\.supersedes,typeof payload\.reviewCommandId==='string'\?payload\.reviewCommandId:undefined\)/);
  assert.match(app, /command\.id;setNotice\('Saved on this browser; waiting to sync\.'/);
  assert.match(migration, /previous\.result->>'status' not in \('CONFLICT','REJECTED'\)/);
  assert.match(acceptance, /supersedes correlation missing/);
});
