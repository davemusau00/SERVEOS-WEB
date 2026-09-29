import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CORE_GUIDE, validateGuides } from '../src/guidance/core.ts';

const read = path => readFileSync(path, 'utf8');

test('UX and guidance plans have one linked coordination document and current baseline note', () => {
  const coordination=read('docs/UX_GUIDANCE_DELIVERY_PLAN.md');
  const ux=read('simple-ux.md');
  const guidance=read('# ServOS Guidance System.md');
  assert.match(coordination,/Simple Operations UX/);
  assert.match(coordination,/Guidance System\.md/);
  assert.match(coordination,/workflow guides follow stabilized workflows/);
  assert.match(ux,/docs\/UX_GUIDANCE_DELIVERY_PLAN\.md/);
  assert.match(guidance,/docs\/UX_GUIDANCE_DELIVERY_PLAN\.md/);
});

test('native shell uses permission-filtered task navigation with Home and Quick Add', () => {
  const shell=read('src/native/NativeBarShell.tsx');
  const home=read('src/native/NativeHomeView.tsx');
  assert.match(shell,/routes\.filter\(route=>snapshot\.actor\.permissions\.includes\(route\.permission\)\)/);
  assert.match(shell,/aria-label="Primary navigation"/);
  assert.match(shell,/\['Operations','Management','System'\]/);
  assert.match(home,/What are you working on\?/);
  assert.match(home,/Quick Add/);
  assert.match(home,/permissions\.includes\(action\.permission\)/);
  assert.match(home,/action: 'add-item', label: 'Item or menu product', permission: 'catalog.manage'/);
  assert.match(home,/guideProgress=progress\.find\(row=>row\.guideId===guide\.id/);
  assert.match(shell,/servos:guide-route/);
  assert.match(shell,/action\?`\?action=/);
});

test('guidance progress uses its own native table and success events follow command commit', () => {
  const migration=read('src-tauri/migrations/010_guidance.sql');
  const store=read('src-tauri/src/store.rs');
  const runtime=read('src/runtime/RuntimeProvider.tsx');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS guidance_progress/);
  assert.match(migration,/PRIMARY KEY\(staff_id, guide_id\)/);
  assert.match(store,/pub fn save_guidance_progress/);
  assert.match(store,/actor\(db, token, true\)/);
  assert.doesNotMatch(store,/guidance_progress[\s\S]{0,300}outbox/);
  const command=runtime.slice(runtime.indexOf('const command = useCallback'),runtime.indexOf('const guidanceProgress'));
  assert.ok(command.indexOf("invoke<CommandResult>('runtime_command'") < command.indexOf("new CustomEvent('servos:command-committed'") );
  assert.ok(command.indexOf('catch (e)') < command.indexOf("new CustomEvent('servos:command-committed'") );
});

test('guided definitions use semantic anchors and reject duplicate guide and step IDs', () => {
  const core=read('src/guidance/core.ts');
  const provider=read('src/guidance/GuidanceProvider.tsx');
  assert.match(core,/export function validateGuides/);
  assert.match(core,/Duplicate or empty guide ID/);
  assert.match(core,/duplicate or empty step ID/);
  assert.match(core,/unknown guide anchor/);
  assert.match(provider,/data-guide-anchor/);
  assert.match(provider,/servos:command-committed/);
  assert.match(provider,/runtime\.guidanceProgress\(\)/);
});

test('guidance registry accepts the core tour and rejects duplicate IDs or missing anchors', () => {
  assert.deepEqual(validateGuides([CORE_GUIDE]),[]);
  const duplicate={...CORE_GUIDE,steps:[CORE_GUIDE.steps[0],CORE_GUIDE.steps[0]]};
  assert.ok(validateGuides([duplicate]).some(error=>error.includes('duplicate or empty step ID')));
  const missingAnchor={...CORE_GUIDE,steps:[{...CORE_GUIDE.steps[0],target:'navigation.missing'}]};
  assert.ok(validateGuides([missingAnchor]).some(error=>error.includes('unknown guide anchor')));
  assert.ok(validateGuides([CORE_GUIDE,CORE_GUIDE]).some(error=>error.includes('Duplicate or empty guide ID')));
});
