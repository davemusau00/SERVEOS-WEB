import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../src/migrate.mjs';
import {PostgresStore} from '../src/postgres-store.mjs';
import {executeCommand} from '../src/command-kernel.mjs';
import {catalogCommandRegistry} from '../src/catalog-commands.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;
test('PostgreSQL API lifecycle, catalog writes, replay, and ordered change feed', {skip:!databaseUrl}, async t=>{
  const pool=new Pool({connectionString:databaseUrl,max:4});t.after(()=>pool.end());
  pool.on('error',error=>console.error('integration pool error',error));
  await migrate(pool);
  const store=new PostgresStore(pool);
  const businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID();
  await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'API integration business']);
  await pool.query("INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password) VALUES($1,$2,$3,$4,'Admin','test-hash',false)",[businessId,staffId,`test-${staffId}@example.invalid`,'Integration Admin']);
  await pool.query("INSERT INTO api_staff_permissions(business_id,staff_id,permission) VALUES($1,$2,'catalog.manage'),($1,$2,'catalog.view')",[businessId,staffId]);
  await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[deviceId,businessId,staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'x',y:'y'})]);
  const actor={businessId,staffId,deviceId,permissions:['catalog.manage','catalog.view']};
  const stockId=randomUUID(),productId=randomUUID(),locationId=randomUUID();
  const stockCommand={commandId:randomUUID(),name:'stockItem.save',expectedVersions:{[`stockItems:${stockId}`]:0},payload:{id:stockId,data:{name:'Coffee beans',code:`COF-${stockId.slice(0,6)}`,baseUnit:'kg',scanUnitQuantity:1,reorderLevel:2,averageUnitCostMinor:900,purchasePackages:[]}}};
  const confirmed=await executeCommand({db:store,command:stockCommand,actor,registry:catalogCommandRegistry});
  assert.equal(confirmed.kind,'CONFIRMED');
  const status=await store.commandStatus(businessId,stockCommand.commandId);
  assert.equal(status.status,'CONFIRMED');
  assert.deepEqual(await executeCommand({db:store,command:stockCommand,actor,registry:catalogCommandRegistry}),confirmed);

  const productCommand={commandId:randomUUID(),name:'product.save',expectedVersions:{[`products:${productId}`]:0},payload:{id:productId,data:{name:'Coffee',code:`COF-${productId.slice(0,6)}`,priceMinor:350,category:'HOT DRINKS',routeTo:'BAR',stockItemId:stockId,recipeIngredients:[{stockItemId:stockId,quantity:0.02,unit:'kg'}]}}};
  const productOutcome=await executeCommand({db:store,command:productCommand,actor,registry:catalogCommandRegistry});
  assert.equal(productOutcome.kind,'CONFIRMED');
  assert.equal((await store.catalogBootstrap(businessId)).records.filter(row=>[stockId,productId].includes(row.id)).length,2);

  const duplicate={...stockCommand,commandId:randomUUID(),payload:{...stockCommand.payload,data:{...stockCommand.payload.data}}};
  const rejected=await executeCommand({db:store,command:duplicate,actor,registry:catalogCommandRegistry});
  assert.equal(rejected.kind,'CONFLICT');
  assert.equal((await store.commandStatus(businessId,duplicate.commandId)).status,'CONFLICT');
  assert.deepEqual(await executeCommand({db:store,command:duplicate,actor,registry:catalogCommandRegistry}),rejected);

  const locationCommand={commandId:randomUUID(),name:'stockLocation.save',expectedVersions:{[`stockLocations:${locationId}`]:0},payload:{id:locationId,data:{name:'Main store',code:`LOC-${locationId.slice(0,6)}`,type:'STORE'}}};
  const locationOutcome=await executeCommand({db:store,command:locationCommand,actor,registry:catalogCommandRegistry});
  assert.equal(locationOutcome.kind,'CONFIRMED');
  const page=await store.changesAfter(businessId,0,20);
  assert.equal(page.changes.length,3);
  assert.deepEqual(page.changes.map(change=>change.sequence),[1,2,3]);
  assert.equal(page.highWater,3);
  assert.equal(page.changes.reduce((sum,change)=>sum+change.records.length,0),3);
});
