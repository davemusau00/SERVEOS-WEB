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
 const dispatchRepair=read('../supabase/expansion/042_floorplan_dispatch_repair.sql');
 const acceptance=read('../tests/supabase/floorplan.sql');
 assert.match(registry,/id: 'Floorplan'.*floorplan\.view.*floorplan\.manage/);
 assert.match(app,/tab==='Floorplan'.*WebFloorplanView/);
 assert.match(view,/command\('floorplan\.save','tables',outletId,\{outletId,baseline,tables\}\)/);
 assert.match(view,/currentOrderId/);
 assert.match(view,/Baseline version checks protect against stale editors/);
 assert.match(dependencies,/operation === 'floorplan\.save'/);
 assert.match(dependencies,/add\('tables', \(entry as Record<string, unknown>\)\.id\)/);
 assert.match(dispatch,/operation'='floorplan\.save' then return servos_v2\.apply_floorplan/);
 assert.match(dispatch,/return servos_v2\.dispatch_before_floorplan\(command\)/);
 assert.match(dispatchRepair,/operation'='floorplan\.save'.*apply_floorplan/s);
 assert.match(dispatchRepair,/operation'='inventory\.produceBatch'.*apply_inventory_batch_preparation/s);
 assert.match(dispatchRepair,/return servos_v2\.dispatch_before_batch_preparation\(command\)/);
 assert.match(dispatch,/assert_version\(command,'tables',current_row\.id\)/);
 assert.match(dispatch,/cannot remove a table with an active order/);
 assert.match(acceptance,/replay changed the result/);
 assert.match(acceptance,/active table ownership/);
});
