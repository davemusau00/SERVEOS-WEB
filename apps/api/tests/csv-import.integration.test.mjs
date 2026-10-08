import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../src/migrate.mjs';
import {PostgresStore} from '../src/postgres-store.mjs';
import {catalogCommandRegistry} from '../src/catalog-commands.mjs';
import {customerCommandRegistry} from '../src/customer-commands.mjs';
import {supplierCommandRegistry} from '../src/supplier-commands.mjs';
import {outletCommandRegistry} from '../src/outlet-commands.mjs';
import {roomCommandRegistry} from '../src/room-commands.mjs';
import {hospitalityCommandRegistry} from '../src/hospitality-commands.mjs';
import {financeAssetCommandRegistry} from '../src/finance-asset-commands.mjs';
import {applyImport,getImportBatch,planImport,stageImport} from '../src/csv-import.mjs';
import {createApiServer} from '../src/server.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('PostgreSQL API CSV importer stages, dry-runs and applies domain commands with durable external IDs',{skip:!databaseUrl,timeout:120_000},async t=>{
 const adminPool=new Pool({connectionString:databaseUrl,max:2});
 const schema=`csv_import_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:databaseUrl,max:12,options:`-c search_path=${schema},public`});
 t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end()});
 await migrate(pool);
 const store=new PostgresStore(pool),businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID();
 const actor={businessId,staffId,deviceId,permissions:['*']};
 const registry=new Map([...catalogCommandRegistry,...customerCommandRegistry,...supplierCommandRegistry,...outletCommandRegistry,...roomCommandRegistry,...hospitalityCommandRegistry,...financeAssetCommandRegistry]);
 await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Disposable CSV Import Test']);
 const api=createApiServer({store,registry,authenticate:async()=>actor,origin:undefined});await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
 const apiOrigin=`http://127.0.0.1:${api.address().port}`;
 const request=async(path,init={})=>{const response=await fetch(`${apiOrigin}${path}`,{...init,headers:{'content-type':'application/json',...(init.headers||{})}});return {status:response.status,body:await response.json()}};
 t.after(async()=>new Promise(resolve=>api.close(resolve)));
 const templates=await request('/v1/import/templates');assert.equal(templates.status,200);assert.equal(templates.body.templates.length,12);

 const locationBatchId=randomUUID();
 const location=await request('/v1/import/batches',{method:'POST',body:JSON.stringify({id:locationBatchId,templateKey:'stockLocations',fileName:'locations.csv',csvText:'external_id,name,code,type\nloc-main,Main Store,STORE-1,STORE\n'})});
 assert.equal(location.status,201);assert.equal(location.body.batch.status,'STAGED');assert.equal(location.body.batch.validCount,1);
 const locationPlan=await request(`/v1/import/batches/${locationBatchId}/plan`,{method:'POST',body:'{}'});
 assert.equal(locationPlan.status,200);assert.equal(locationPlan.body.plan.status,'READY');assert.equal(locationPlan.body.plan.steps[0].status,'PLANNED');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM stock_locations WHERE business_id=$1',[businessId])).rows[0].count,0,'dry-run rolls back domain writes');
 const appliedLocation=await request(`/v1/import/plans/${locationPlan.body.plan.id}/apply`,{method:'POST',body:'{}'});
 assert.equal(appliedLocation.status,200);assert.equal(appliedLocation.body.plan.status,'APPLIED');assert.equal(appliedLocation.body.plan.summary.applied,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM stock_locations WHERE business_id=$1',[businessId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM api_commands WHERE business_id=$1 AND status=\'CONFIRMED\'',[businessId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM business_audit_events WHERE business_id=$1',[businessId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM api_import_external_ids WHERE business_id=$1 AND template_key=\'stockLocations\' AND external_id_key=\'loc-main\'',[businessId])).rows[0].count,1);
 const persistedBatch=await request(`/v1/import/batches/${locationBatchId}`);
 assert.equal(persistedBatch.body.batch.status,'APPLIED');assert.equal(persistedBatch.body.batch.rows.length,0);assert.equal(persistedBatch.body.plan.steps[0].status,'APPLIED');

 const outletBatchId=randomUUID();
 const outlet=await stageImport(pool,actor,{id:outletBatchId,templateKey:'outlets',fileName:'outlets.csv',csvText:'external_id,name,default_stock_location_external_id\noutlet-main,Main Outlet,loc-main\n'});
 const outletPlan=await planImport({store,registry,actor,batchId:outletBatchId});
 assert.equal(outletPlan.plan.status,'READY');
 const appliedOutlet=await applyImport({store,registry,actor,planId:outletPlan.plan.id});
 assert.equal(appliedOutlet.plan.status,'APPLIED');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM business_outlets WHERE business_id=$1',[businessId])).rows[0].count,1);
 assert.equal(outlet.batch.validCount,1);
});
