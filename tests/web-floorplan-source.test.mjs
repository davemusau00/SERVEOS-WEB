import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');

test('Web floorplan is discoverable and submits one versioned atomic command',()=>{
 const view=read('../src/runtime/web/WebFloorplanView.tsx');
 const app=read('../src/runtime/web/WebBusinessApp.tsx');
 const registry=read('../src/runtime/web/workspaceRegistry.ts');
 const dependencies=read('../src/runtime/web/dependencies.ts');
 const dispatch=read('../supabase/expansion/038_floorplan_atomic_save.sql');
 const acceptance=read('../tests/supabase/floorplan.sql');
 assert.match(registry,/id: 'Floorplan'.*floorplan\.view.*floorplan\.manage/);
 assert.match(app,/tab==='Floorplan'.*WebFloorplanView/);
 assert.match(view,/command\('floorplan\.save','tables',outletId,\{outletId,baseline,tables\}\)/);
 assert.match(view,/currentOrderId/);
 assert.match(view,/Baseline version checks protect against stale editors/);
 assert.match(dependencies,/operation === 'floorplan\.save'/);
 assert.match(dependencies,/add\('tables', \(entry as Record<string, unknown>\)\.id\)/);
 assert.match(dispatch,/operation'='floorplan\.save' then return servos_v2\.apply_floorplan/);
 assert.match(dispatch,/operation' like 'admin\.%'.*servos_v2\.apply_admin_operations/);
 assert.match(dispatch,/assert_version\(command,'tables',current_row\.id\)/);
 assert.match(dispatch,/cannot remove a table with an active order/);
 assert.match(acceptance,/replay changed the result/);
 assert.match(acceptance,/active table ownership/);
});
