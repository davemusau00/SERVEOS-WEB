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
  const actor={businessId,staffId,deviceId,permissions:['catalog.manage','catalog.view','inventory.adjust']};
  const stockId=randomUUID(),productId=randomUUID(),locationId=randomUUID();
  const stockCommand={commandId:randomUUID(),name:'stockItem.save',expectedVersions:{[`stockItems:${stockId}`]:0},payload:{id:stockId,data:{name:'Coffee beans',code:`COF-${stockId.slice(0,6)}`,baseUnit:'kg',scanUnitQuantity:1,reorderLevel:2,averageUnitCostMinor:900,purchasePackages:[]}}};
  const confirmed=await executeCommand({db:store,command:stockCommand,actor,registry:catalogCommandRegistry});
  assert.equal(confirmed.kind,'CONFIRMED');
  const status=await store.commandStatus(businessId,stockCommand.commandId);
  assert.equal(status.status,'CONFIRMED');
  assert.deepEqual(await executeCommand({db:store,command:stockCommand,actor,registry:catalogCommandRegistry}),confirmed);

  // A rolled-back infrastructure failure must remain replayable with the same ID.
  const recoveryCommand={...stockCommand,commandId:randomUUID(),expectedVersions:{[`stockItems:${stockId}`]:1},payload:{id:stockId,data:{...stockCommand.payload.data,name:'Recovered coffee beans'}}};
  let attempts=0;
  const recoveryRegistry=new Map(catalogCommandRegistry);
  const stockDefinition=catalogCommandRegistry.get('stockItem.save');
  recoveryRegistry.set('stockItem.save',{...stockDefinition,handler:async context=>{
    const result=await stockDefinition.handler(context);
    if(++attempts===1)throw new Error('simulated connection failure before commit');
    return result;
  }});
  await assert.rejects(executeCommand({db:store,command:recoveryCommand,actor,registry:recoveryRegistry}),/simulated connection failure/);
  const unresolved=await store.commandStatus(businessId,recoveryCommand.commandId);
  assert.equal(unresolved.status,'PROCESSING');assert.equal(unresolved.outcome,null);
  assert.equal((await store.catalogBootstrap(businessId)).records.find(row=>row.id===stockId).version,1);
  const recovered=await executeCommand({db:store,command:recoveryCommand,actor,registry:recoveryRegistry});
  assert.equal(recovered.kind,'CONFIRMED');
  assert.deepEqual(await executeCommand({db:store,command:recoveryCommand,actor,registry:recoveryRegistry}),recovered);
  assert.equal(attempts,2);

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
  assert.equal(page.changes.length,4);
  assert.deepEqual(page.changes.map(change=>change.sequence),[1,2,3,4]);
  assert.equal(page.highWater,4);
  assert.equal(page.changes.reduce((sum,change)=>sum+change.records.length,0),4);
  const openingStockId=randomUUID(),openingProductId=randomUUID(),openingMovementId=randomUUID();
  const opening={commandId:randomUUID(),name:'catalog.createWithOpeningStock',expectedVersions:{[`stockItems:${openingStockId}`]:0,[`products:${openingProductId}`]:0,[`stockLocations:${locationId}`]:1,[`stockMovements:${openingMovementId}`]:0},payload:{id:openingStockId,stockItem:{id:openingStockId,name:'Opening tea',code:`TEA-${openingStockId.slice(0,6)}`,baseUnit:'kg',averageUnitCostMinor:400},product:{id:openingProductId,name:'Opening cup',code:`CUP-${openingProductId.slice(0,6)}`,priceMinor:200,category:'TEA',routeTo:'BAR'},locationId,startingQuantity:5,openingMovementId}};
  const openingResult=await executeCommand({db:store,command:opening,actor,registry:catalogCommandRegistry});
  assert.equal(openingResult.kind,'CONFIRMED',JSON.stringify(openingResult));
  const openingChanges=(await store.changesAfter(businessId,4,20)).changes;
  assert.equal(openingChanges.length,1);
  assert.deepEqual(new Set(openingChanges[0].records.map(record=>record.collection)),new Set(['stockItems','products','stockMovements']));
  assert.equal(openingChanges[0].records.find(record=>record.id===openingStockId).data.currentStock[locationId],5);
  const editOpening={commandId:randomUUID(),name:'stockItem.save',expectedVersions:{[`stockItems:${openingStockId}`]:1},payload:{id:openingStockId,data:{...opening.payload.stockItem,name:'Opening tea renamed'}}};
  assert.equal((await executeCommand({db:store,command:editOpening,actor,registry:catalogCommandRegistry})).kind,'CONFIRMED');
  const editChanges=(await store.changesAfter(businessId,5,20)).changes;
  assert.equal(editChanges[0].records[0].data.currentStock[locationId],5,'master edits must retain stock balances in changed projections');

  assert.equal(editChanges[0].records[0].data.balanceVersions[locationId],1);
  // Preserve the stock master version and quantity while changing the balance twice.
  await store.transaction(async tx=>{
    await tx.setInventoryBalance({businessId,stockItemId:openingStockId,locationId,quantity:4});
    await tx.setInventoryBalance({businessId,stockItemId:openingStockId,locationId,quantity:5});
  });
  const countActor={...actor,permissions:[...actor.permissions,'inventory.count']};
  const countCommand={commandId:randomUUID(),name:'inventory.countSelected',expectedVersions:{[`stockItems:${openingStockId}`]:2,[`stockLocations:${locationId}`]:1},payload:{locationId,scope:'SELECTED',selectedStockItemIds:[openingStockId],reason:'Reviewed count',expectedBalanceVersions:{[`${openingStockId}:${locationId}`]:1},rows:[{stockItemId:openingStockId,expectedQuantity:5,countedQuantity:5}]}};
  const staleCount=await executeCommand({db:store,command:countCommand,actor:countActor,registry:catalogCommandRegistry});
  assert.equal(staleCount.kind,'CONFLICT');assert.equal(staleCount.error.code,'VERSION_CONFLICT');
  assert.deepEqual(await executeCommand({db:store,command:countCommand,actor:countActor,registry:catalogCommandRegistry}),staleCount);
  const missingRevision={...countCommand,commandId:randomUUID(),payload:{...countCommand.payload,expectedBalanceVersions:{}}};
  assert.equal((await executeCommand({db:store,command:missingRevision,actor:countActor,registry:catalogCommandRegistry})).error.code,'BALANCE_VERSION_REQUIRED');
  const refreshedCount={...countCommand,commandId:randomUUID(),payload:{...countCommand.payload,expectedBalanceVersions:{[`${openingStockId}:${locationId}`]:3}}};
  assert.equal((await executeCommand({db:store,command:refreshedCount,actor:countActor,registry:catalogCommandRegistry})).kind,'CONFIRMED');

  const destinationId=randomUUID();
  assert.equal((await executeCommand({db:store,actor,registry:catalogCommandRegistry,command:{commandId:randomUUID(),name:'stockLocation.save',expectedVersions:{[`stockLocations:${destinationId}`]:0},payload:{id:destinationId,data:{name:'Transfer destination',code:`DST-${destinationId.slice(0,6)}`,type:'STORE'}}}})).kind,'CONFIRMED');
  const movementActor={...actor,permissions:['*']};
  const transfer={commandId:randomUUID(),name:'inventory.transfer',expectedVersions:{[`stockItems:${openingStockId}`]:2,[`stockLocations:${locationId}`]:1,[`stockLocations:${destinationId}`]:1},payload:{stockItemId:openingStockId,locationId,toLocationId:destinationId,quantity:2,reason:'Reviewed transfer',expectedBalanceVersions:{[`${openingStockId}:${locationId}`]:3,[`${openingStockId}:${destinationId}`]:0}}};
  const transferred=await executeCommand({db:store,command:transfer,actor:movementActor,registry:catalogCommandRegistry});
  assert.equal(transferred.kind,'CONFIRMED');
  assert.deepEqual(await executeCommand({db:store,command:transfer,actor:movementActor,registry:catalogCommandRegistry}),transferred);
  const waste={commandId:randomUUID(),name:'inventory.waste',expectedVersions:{[`stockItems:${openingStockId}`]:3,[`stockLocations:${locationId}`]:1},payload:{stockItemId:openingStockId,locationId,quantity:1,reason:'Reviewed waste',expectedBalanceVersions:{[`${openingStockId}:${locationId}`]:4}}};
  assert.equal((await executeCommand({db:store,command:waste,actor:movementActor,registry:catalogCommandRegistry})).kind,'CONFIRMED');
  const adjustment={commandId:randomUUID(),name:'inventory.adjust',expectedVersions:{[`stockItems:${openingStockId}`]:4,[`stockLocations:${locationId}`]:1},payload:{stockItemId:openingStockId,locationId,expectedQuantity:2,countedQty:4,expectedBaseUnit:'kg',expectedSealedContainerSize:0,reason:'Reviewed correction',expectedBalanceVersions:{[`${openingStockId}:${locationId}`]:5}}};
  assert.equal((await executeCommand({db:store,command:adjustment,actor:movementActor,registry:catalogCommandRegistry})).kind,'CONFIRMED');
  const staleMovement={...waste,commandId:randomUUID(),expectedVersions:{[`stockItems:${openingStockId}`]:5,[`stockLocations:${locationId}`]:1},payload:{...waste.payload,expectedBalanceVersions:{[`${openingStockId}:${locationId}`]:5}}};
  assert.equal((await executeCommand({db:store,command:staleMovement,actor:movementActor,registry:catalogCommandRegistry})).kind,'CONFLICT');
  const balances=(await pool.query('SELECT location_id,quantity::text,version::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2',[businessId,openingStockId])).rows;
  assert.deepEqual(balances.find(row=>row.location_id===locationId),{location_id:locationId,quantity:'4.000000',version:'6'});
  assert.deepEqual(balances.find(row=>row.location_id===destinationId),{location_id:destinationId,quantity:'2.000000',version:'1'});

});
