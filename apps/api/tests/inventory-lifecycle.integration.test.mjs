import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../src/migrate.mjs';
import {PostgresStore} from '../src/postgres-store.mjs';
import {executeCommand} from '../src/command-kernel.mjs';
import {catalogCommandRegistry} from '../src/catalog-commands.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('PostgreSQL inventory receipt, count, movement, bottle conservation, and reversal lifecycle',{skip:!databaseUrl,timeout:120_000},async t=>{
  const adminPool=new Pool({connectionString:databaseUrl,max:2});
  const schema=`inventory_acceptance_${randomUUID().replaceAll('-','')}`;
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const pool=new Pool({connectionString:databaseUrl,max:10,options:`-c search_path=${schema},public`});
  t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end()});
  await migrate(pool);

  const store=new PostgresStore(pool),businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID();
  const actor={businessId,staffId,deviceId,permissions:['*']};
  await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Disposable Inventory Acceptance']);
  const run=(name,payload,expectedVersions={},commandId=randomUUID(),registry=catalogCommandRegistry)=>executeCommand({db:store,actor,registry,command:{commandId,name,payload,expectedVersions}});
  const saveStock=async({name,code,baseUnit,averageUnitCostMinor=0,sealedContainerSize,purchasePackages=[]})=>{
    const id=randomUUID();
    const outcome=await run('stockItem.save',{id,data:{name,code,baseUnit,averageUnitCostMinor,sealedContainerSize,scanUnitQuantity:1,reorderLevel:0,purchasePackages}},{[`stockItems:${id}`]:0});
    assert.equal(outcome.kind,'CONFIRMED',JSON.stringify(outcome));return{id,outcome};
  };
  const saveLocation=async(name,code)=>{
    const id=randomUUID();
    const outcome=await run('stockLocation.save',{id,data:{name,code,type:'STORE'}},{[`stockLocations:${id}`]:0});
    assert.equal(outcome.kind,'CONFIRMED',JSON.stringify(outcome));return id;
  };
  const projection=async(id,collection='stockItems')=>(await store.catalogBootstrap(businessId)).records.find(record=>record.collection===collection&&record.id===id);
  const balance=async(stockId,locationId)=>{
    const {rows}=await pool.query('SELECT quantity::text,version::text,sealed_containers::text,open_quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId]);
    return rows[0]||null;
  };

  const locationId=await saveLocation('Main store','MAIN');
  const destinationId=await saveLocation('Bar store','BAR');
  const packageId=randomUUID();
  const stock=await saveStock({name:'Coffee beans',code:'INV-COF',baseUnit:'kg',averageUnitCostMinor:1000,purchasePackages:[{id:packageId,name:'Case',baseQuantity:12,unitCostMinor:24000,barcode:'616000201'}]});
  await store.transaction(tx=>tx.setInventoryBalance({businessId,stockItemId:stock.id,locationId,quantity:6}));
  const bottle=await saveStock({name:'House spirit',code:'INV-SPIRIT',baseUnit:'ml',sealedContainerSize:750});

  const policy=await run('inventory.policy.save',{allowDirectReceipts:true,requireSupplierReference:true,requirePurchaseOrder:false,reason:'Disposable inventory acceptance policy'},{[`inventoryPolicy:${businessId}`]:0});
  assert.equal(policy.kind,'CONFIRMED');

  const receive=(stockId,quantity,totalCostMinor,reference,{stockVersion,balanceVersion,purchasePackageId:packageReference,physical={}}={})=>({
    commandId:randomUUID(),name:'inventory.receive',expectedVersions:{[`stockItems:${stockId}`]:stockVersion,[`stockLocations:${locationId}`]:1,[`inventoryPolicy:${businessId}`]:1},payload:{id:randomUUID(),stockItemId:stockId,locationId,quantity,totalCostMinor,purchasePackageId:packageReference,sourceDocument:{type:'INVOICE',reference,supplierReference:'INV-SUPPLIER'},expectedBalanceVersions:{[`${stockId}:${locationId}`]:balanceVersion},...physical},
  });

  const firstReceipt=receive(stock.id,2,48000,'INV-RECEIPT-1',{stockVersion:1,balanceVersion:1,purchasePackageId:packageId});
  const firstReceived=await executeCommand({db:store,actor,registry:catalogCommandRegistry,command:firstReceipt});
  assert.equal(firstReceived.kind,'CONFIRMED');
  assert.equal(firstReceived.result.receipt.data.baseQuantity,24);
  assert.equal(Number((await pool.query('SELECT average_unit_cost_minor FROM stock_items WHERE business_id=$1 AND id=$2',[businessId,stock.id])).rows[0].average_unit_cost_minor),1800);
  assert.deepEqual(await balance(stock.id,locationId),{quantity:'30.000000',version:'2',sealed_containers:null,open_quantity:null});

  const competing=[
    receive(stock.id,1,24000,'INV-RECEIPT-RACE-A',{stockVersion:2,balanceVersion:2,purchasePackageId:packageId}),
    receive(stock.id,1,24000,'INV-RECEIPT-RACE-B',{stockVersion:2,balanceVersion:2,purchasePackageId:packageId}),
  ];
  const competingOutcomes=await Promise.all(competing.map(command=>executeCommand({db:store,actor,registry:catalogCommandRegistry,command})));
  assert.deepEqual(competingOutcomes.map(outcome=>outcome.kind).sort(),['CONFIRMED','CONFLICT']);
  assert.equal(Number((await pool.query('SELECT average_unit_cost_minor FROM stock_items WHERE business_id=$1 AND id=$2',[businessId,stock.id])).rows[0].average_unit_cost_minor),1857.142857142857);
  assert.deepEqual(await balance(stock.id,locationId),{quantity:'42.000000',version:'3',sealed_containers:null,open_quantity:null});

  const winningReference=competing[competingOutcomes.findIndex(outcome=>outcome.kind==='CONFIRMED')].payload.sourceDocument.reference;
  const duplicateReference=receive(stock.id,1,24000,winningReference,{stockVersion:3,balanceVersion:3,purchasePackageId:packageId});
  const duplicateOutcome=await executeCommand({db:store,actor,registry:catalogCommandRegistry,command:duplicateReference});
  assert.equal(duplicateOutcome.kind,'CONFLICT');assert.equal(duplicateOutcome.error.code,'DUPLICATE_REFERENCE');

  const recovery=receive(stock.id,1,24000,'INV-RECEIPT-REPLAY',{stockVersion:3,balanceVersion:3,purchasePackageId:packageId});
  const receiveDefinition=catalogCommandRegistry.get('inventory.receive');let receiveAttempts=0;
  const recoveryRegistry=new Map(catalogCommandRegistry);
  recoveryRegistry.set('inventory.receive',{...receiveDefinition,handler:async context=>{const result=await receiveDefinition.handler(context);if(++receiveAttempts===1)throw new Error('simulated receipt response loss before commit');return result;}});
  await assert.rejects(executeCommand({db:store,actor,registry:recoveryRegistry,command:recovery}),/simulated receipt response loss/);
  assert.equal((await store.commandStatus(businessId,recovery.commandId)).status,'PROCESSING');
  const replayedReceipt=await executeCommand({db:store,actor,registry:recoveryRegistry,command:recovery});
  assert.equal(replayedReceipt.kind,'CONFIRMED');
  assert.deepEqual(await executeCommand({db:store,actor,registry:recoveryRegistry,command:recovery}),replayedReceipt);
  assert.equal(receiveAttempts,2);
  assert.equal(Number((await pool.query('SELECT average_unit_cost_minor FROM stock_items WHERE business_id=$1 AND id=$2',[businessId,stock.id])).rows[0].average_unit_cost_minor),1888.888888888889);
  assert.deepEqual(await balance(stock.id,locationId),{quantity:'54.000000',version:'4',sealed_containers:null,open_quantity:null});
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM inventory_receipts WHERE business_id=$1 AND stock_item_id=$2',[businessId,stock.id])).rows[0].count),3);

  const bottleReceipt=receive(bottle.id,1500,4000,'INV-BOTTLE-RECEIPT',{stockVersion:1,balanceVersion:0,physical:{sealedContainers:2,openQuantity:0}});
  assert.equal((await executeCommand({db:store,actor,registry:catalogCommandRegistry,command:bottleReceipt})).kind,'CONFIRMED');
  assert.deepEqual(await balance(bottle.id,locationId),{quantity:'1500.000000',version:'1',sealed_containers:'2.000000',open_quantity:'0.000000'});

  const currentWeighted=await projection(stock.id),currentBottle=await projection(bottle.id);
  const fullCount=await run('inventory.countLocation',{locationId,scope:'FULL',reason:'Measured sealed and open bottle state',expectedBalanceVersions:{[`${stock.id}:${locationId}`]:4,[`${bottle.id}:${locationId}`]:1},rows:[
    {stockItemId:stock.id,expectedQuantity:54,countedQuantity:54,measurementMethod:'EXACT'},
    {stockItemId:bottle.id,expectedQuantity:1500,countedQuantity:1200,countedSealedContainers:1,countedOpenQuantity:450,measurementMethod:'ESTIMATED'},
  ]},{[`stockItems:${stock.id}`]:currentWeighted.version,[`stockItems:${bottle.id}`]:currentBottle.version,[`stockLocations:${locationId}`]:1});
  assert.equal(fullCount.kind,'CONFIRMED',JSON.stringify(fullCount));
  assert.equal(fullCount.result.count.data.scope,'FULL');
  assert.equal(fullCount.result.count.data.locationId,locationId);
  assert.deepEqual(fullCount.result.count.data.selectedStockItemIds,[bottle.id,stock.id].sort());
  assert.equal(fullCount.result.count.data.itemCount,2);
  assert.equal(fullCount.result.count.data.matches,1);
  assert.equal(fullCount.result.count.data.short,1);
  assert.equal(fullCount.result.count.data.over,0);
  assert.equal(fullCount.result.count.data.status,'COMMITTED');
  assert.equal(fullCount.result.count.data.sourceCommandId,fullCount.commandId);
  assert.equal(fullCount.result.count.data.createdBy,staffId);
  assert.equal(fullCount.result.count.data.rows.find(row=>row.stockItemId===bottle.id).measurementMethod,'ESTIMATED');
  assert.deepEqual(await balance(bottle.id,locationId),{quantity:'1200.000000',version:'2',sealed_containers:'1.000000',open_quantity:'450.000000'});
  const countProjection=await projection(`count-${fullCount.commandId}`,'stockCounts');
  assert.equal(countProjection?.data.itemCount,2);assert.equal(countProjection?.data.rows.find(row=>row.stockItemId===bottle.id).measurementMethod,'ESTIMATED');

  const countRace=countedQuantity=>({commandId:randomUUID(),name:'inventory.countSelected',expectedVersions:{[`stockItems:${stock.id}`]:4,[`stockLocations:${locationId}`]:1},payload:{locationId,scope:'SELECTED',selectedStockItemIds:[stock.id],reason:'Two terminal count race',expectedBalanceVersions:{[`${stock.id}:${locationId}`]:4},rows:[{stockItemId:stock.id,expectedQuantity:54,countedQuantity}]}});
  const raceCommands=[countRace(56),countRace(57)];
  const countOutcomes=await Promise.all(raceCommands.map(command=>executeCommand({db:store,actor,registry:catalogCommandRegistry,command})));
  assert.deepEqual(countOutcomes.map(outcome=>outcome.kind).sort(),['CONFIRMED','CONFLICT']);
  const selectedCount=countOutcomes.find(outcome=>outcome.kind==='CONFIRMED');assert.equal(selectedCount.result.count.data.scope,'SELECTED');assert.equal(selectedCount.result.count.data.itemCount,1);
  const selectedBalance=await balance(stock.id,locationId);assert.ok(['56.000000','57.000000'].includes(selectedBalance.quantity));assert.equal(selectedBalance.version,'5');

  const transferCommand={commandId:randomUUID(),name:'inventory.transfer',expectedVersions:{[`stockItems:${stock.id}`]:5,[`stockLocations:${locationId}`]:1,[`stockLocations:${destinationId}`]:1},payload:{stockItemId:stock.id,locationId,toLocationId:destinationId,quantity:2,reason:'Reviewed transfer',expectedBalanceVersions:{[`${stock.id}:${locationId}`]:5,[`${stock.id}:${destinationId}`]:0}}};
  const transfer=await executeCommand({db:store,actor,registry:catalogCommandRegistry,command:transferCommand});
  assert.equal(transfer.kind,'CONFIRMED');
  assert.deepEqual(await balance(stock.id,destinationId),{quantity:'2.000000',version:'1',sealed_containers:null,open_quantity:null});
  const transferReplay=await executeCommand({db:store,actor,registry:catalogCommandRegistry,command:transferCommand});
  assert.deepEqual(transferReplay,transfer);
  const transferOut=transfer.result.stockMovements.find(movement=>movement.data.movementType==='TRANSFER_OUT');
  const reversal=await run('inventory.reverseMovement',{movementId:transferOut.id,reason:'Undo transfer entered in error',expectedBalanceVersions:{[`${stock.id}:${locationId}`]:6,[`${stock.id}:${destinationId}`]:1}},{[`stockItems:${stock.id}`]:6,[`stockLocations:${locationId}`]:1,[`stockLocations:${destinationId}`]:1});
  assert.equal(reversal.kind,'CONFIRMED');assert.deepEqual(await balance(stock.id,destinationId),{quantity:'0.000000',version:'2',sealed_containers:null,open_quantity:null});

  const wasteOne=await run('inventory.waste',{stockItemId:stock.id,locationId,quantity:1,reason:'First reviewed waste',expectedBalanceVersions:{[`${stock.id}:${locationId}`]:7}},{[`stockItems:${stock.id}`]:7,[`stockLocations:${locationId}`]:1});
  assert.equal(wasteOne.kind,'CONFIRMED');
  const wasteTwo=await run('inventory.waste',{stockItemId:stock.id,locationId,quantity:1,reason:'Second reviewed waste',expectedBalanceVersions:{[`${stock.id}:${locationId}`]:8}},{[`stockItems:${stock.id}`]:8,[`stockLocations:${locationId}`]:1});
  assert.equal(wasteTwo.kind,'CONFIRMED');
  const blockedReversal=await run('inventory.reverseMovement',{movementId:wasteOne.result.stockMovements[0].id,reason:'Attempt an outdated reversal',expectedBalanceVersions:{[`${stock.id}:${locationId}`]:9}},{[`stockItems:${stock.id}`]:9,[`stockLocations:${locationId}`]:1});
  assert.equal(blockedReversal.kind,'CONFLICT');assert.equal(blockedReversal.error.code,'LATER_STOCK_ACTIVITY');
  const lastWasteReversal=await run('inventory.reverseMovement',{movementId:wasteTwo.result.stockMovements[0].id,reason:'Reverse latest waste',expectedBalanceVersions:{[`${stock.id}:${locationId}`]:9}},{[`stockItems:${stock.id}`]:9,[`stockLocations:${locationId}`]:1});
  assert.equal(lastWasteReversal.kind,'CONFIRMED');

  const openBottleTransfer=await run('inventory.transfer',{stockItemId:bottle.id,locationId,toLocationId:destinationId,quantity:100,disposition:'OPEN',reason:'Move measured open liquid',expectedBalanceVersions:{[`${bottle.id}:${locationId}`]:2,[`${bottle.id}:${destinationId}`]:0}},{[`stockItems:${bottle.id}`]:3,[`stockLocations:${locationId}`]:1,[`stockLocations:${destinationId}`]:1});
  assert.equal(openBottleTransfer.kind,'CONFIRMED',JSON.stringify(openBottleTransfer));
  const sealedBottleTransfer=await run('inventory.transfer',{stockItemId:bottle.id,locationId,toLocationId:destinationId,quantity:750,disposition:'SEALED',reason:'Move one sealed bottle',expectedBalanceVersions:{[`${bottle.id}:${locationId}`]:3,[`${bottle.id}:${destinationId}`]:1}},{[`stockItems:${bottle.id}`]:4,[`stockLocations:${locationId}`]:1,[`stockLocations:${destinationId}`]:1});
  assert.equal(sealedBottleTransfer.kind,'CONFIRMED');
  assert.deepEqual(await balance(bottle.id,locationId),{quantity:'350.000000',version:'4',sealed_containers:'0.000000',open_quantity:'350.000000'});
  assert.deepEqual(await balance(bottle.id,destinationId),{quantity:'850.000000',version:'2',sealed_containers:'1.000000',open_quantity:'100.000000'});

  const history=await store.catalogBootstrap(businessId);
  assert.ok(history.records.filter(record=>record.collection==='stockCounts').length>=2);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM inventory_reversals WHERE business_id=$1',[businessId])).rows[0].count),2);
});
