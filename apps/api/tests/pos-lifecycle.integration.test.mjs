import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../src/migrate.mjs';
import {PostgresStore} from '../src/postgres-store.mjs';
import {executeCommand} from '../src/command-kernel.mjs';
import {catalogCommandRegistry} from '../src/catalog-commands.mjs';
import {businessTaxCommandRegistry} from '../src/business-tax.mjs';
import {outletCommandRegistry} from '../src/outlet-commands.mjs';
import {floorplanCommandRegistry,floorplanProjections} from '../src/floorplan-commands.mjs';
import {paymentAccountCommandRegistry} from '../src/payment-accounts.mjs';
import {tillCommandRegistry} from '../src/till-commands.mjs';
import {posCommandRegistry} from '../src/pos-commands.mjs';
import {paymentCommandRegistry} from '../src/payment-commands.mjs';
import {customerCommandRegistry} from '../src/customer-commands.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('PostgreSQL POS settlement, receipt replay, stock consumption, and floorplan table race',{skip:!databaseUrl,timeout:120_000},async t=>{
 const adminPool=new Pool({connectionString:databaseUrl,max:2});
 const schema=`pos_acceptance_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:databaseUrl,max:12,options:`-c search_path=${schema},public`});
 t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end()});
 await migrate(pool);

 const store=new PostgresStore(pool),businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID();
 const actor={businessId,staffId,deviceId,permissions:['*']};
 const registry=new Map([
  ...catalogCommandRegistry,...businessTaxCommandRegistry,...outletCommandRegistry,
  ...floorplanCommandRegistry,...paymentAccountCommandRegistry,...tillCommandRegistry,
  ...posCommandRegistry,...paymentCommandRegistry,...customerCommandRegistry,
 ]);
 await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Disposable POS Acceptance']);
 await pool.query("INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password) VALUES($1,$2,$3,$4,'Admin','test-hash',false)",[businessId,staffId,`pos-${staffId}@example.invalid`,'POS Integration Admin']);
 await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[deviceId,businessId,staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'x',y:'y'})]);

 const run=(name,payload,expectedVersions={},commandId=randomUUID())=>executeCommand({db:store,actor,registry,command:{commandId,name,payload,expectedVersions}});
 const confirmed=async(name,payload,expectedVersions={})=>{
  const outcome=await run(name,payload,expectedVersions);
  assert.equal(outcome.kind,'CONFIRMED',`${name}: ${JSON.stringify(outcome)}`);
  return outcome;
 };

 const locationId=randomUUID();
 await confirmed('stockLocation.save',{id:locationId,data:{name:'POS store',code:`POS-${locationId.slice(0,6)}`,type:'STORE'}},{[`stockLocations:${locationId}`]:0});
 const stockId=randomUUID();
 await confirmed('stockItem.save',{id:stockId,data:{name:'Coffee beans',code:`COF-${stockId.slice(0,6)}`,baseUnit:'kg',averageUnitCostMinor:1000,scanUnitQuantity:1,reorderLevel:0,purchasePackages:[]}},{[`stockItems:${stockId}`]:0});
 await store.transaction(tx=>tx.setInventoryBalance({businessId,stockItemId:stockId,locationId,quantity:10}));
 const productId=randomUUID();
 await confirmed('product.save',{id:productId,data:{name:'Filter coffee',code:`DRK-${productId.slice(0,6)}`,priceMinor:500,category:'Coffee',routeTo:'KITCHEN',taxClassId:'A_16',stockItemId:stockId,portions:[{id:'regular',name:'Regular',priceMinor:500,volume:0.25}],modifiers:[{id:'oat',name:'Oat milk',priceDeltaMinor:50,ingredientAdjustments:[]}],recipeIngredients:[{stockItemId:stockId,quantity:0.25,unit:'kg'}]}},{[`products:${productId}`]:0});
 const barProductId=randomUUID();
 await confirmed('product.save',{id:barProductId,data:{name:'Bar tea',code:`TEA-${barProductId.slice(0,6)}`,priceMinor:400,category:'Tea',routeTo:'BAR',taxClassId:'A_16',stockItemId:stockId,portions:[{id:'regular',name:'Regular',priceMinor:400,volume:0.25}],recipeIngredients:[{stockItemId:stockId,quantity:0.25,unit:'kg'}]}},{[`products:${barProductId}`]:0});

 await confirmed('business.settings.save',{data:{businessName:'Disposable POS Acceptance',address:'Test address',contact:'',taxPin:'',footer:'Thank you',vatRateBasisPoints:1600,levyRateBasisPoints:0},reason:'Configure POS acceptance tax policy'},{[`businessSettings:${businessId}`]:0});
 const outletId=randomUUID();
 await confirmed('outlet.save',{id:outletId,data:{name:'Main outlet',defaultStockLocationId:locationId,archived:false},reason:'Configure POS acceptance outlet'},{[`outlets:${outletId}`]:0,[`stockLocations:${locationId}`]:1});
 const accountId=randomUUID();
 await confirmed('paymentAccount.save',{id:accountId,reason:'Configure POS acceptance cash account',data:{name:'Cash',code:`CASH-${accountId.slice(0,6)}`,method:'CASH',currency:'KES',referenceRequired:false,archived:false}},{[`paymentAccounts:${accountId}`]:0});
 const mpesaAccountId=randomUUID();
 await confirmed('paymentAccount.save',{id:mpesaAccountId,reason:'Configure POS acceptance M-Pesa account',data:{name:'M-Pesa',code:`MPESA-${mpesaAccountId.slice(0,6)}`,method:'MPESA',currency:'KES',referenceRequired:true,mpesaMode:'TILL',mpesaNumber:'123456',archived:false}},{[`paymentAccounts:${mpesaAccountId}`]:0});
 const tillId=randomUUID();
 await confirmed('till.open',{id:tillId,outletId,openingFloatMinor:0},{[`tillSessions:${tillId}`]:0,[`outlets:${outletId}`]:1,[`tillPolicy:${businessId}`]:0});

 const tableId=randomUUID();
 await confirmed('floorplan.save',{outletId,baseline:[],tables:[{id:tableId,label:'T1',section:'Main',capacity:2,posX:10,posY:10,minimumSpend:0,shape:'ROUND',isJoinable:true,assignedServerId:null}]});
 const tableOrders=[randomUUID(),randomUUID()].map(id=>({commandId:randomUUID(),name:'order.create',payload:{id,name:`Table order ${id.slice(0,6)}`,outletId,tableId},expectedVersions:{[`orders:${id}`]:0,[`tables:${tableId}`]:1,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1}}));
 const tableRace=await Promise.all(tableOrders.map(command=>executeCommand({db:store,actor,registry,command})));
 assert.deepEqual(tableRace.map(value=>value.kind).sort(),['CONFIRMED','CONFLICT']);
 const raceWinner=tableRace.find(value=>value.kind==='CONFIRMED');
 const raceLoser=tableRace.find(value=>value.kind==='CONFLICT');
 assert.equal((await store.commandStatus(businessId,raceLoser.commandId)).status,'CONFLICT');
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM pos_orders WHERE business_id=$1 AND service_destination='TABLE' AND service_reference->>'tableId'=$2 AND state IN ('OPEN','FIRED')",[businessId,tableId])).rows[0].count,1);
 const blockedEdit=await run('floorplan.save',{outletId,baseline:[{id:tableId,version:2}],tables:[{id:tableId,label:'Renamed T1',section:'Main',capacity:2,posX:10,posY:10,minimumSpend:0,shape:'ROUND',isJoinable:true,assignedServerId:null}]},{[`tables:${tableId}`]:2});
 assert.equal(blockedEdit.kind,'CONFLICT');
 assert.equal(blockedEdit.error.code,'TABLE_HAS_ACTIVE_ORDER');
 assert.equal((await pool.query('SELECT label,version FROM business_floor_tables WHERE business_id=$1 AND id=$2',[businessId,tableId])).rows[0].label,'T1');
 const archiveActiveTable=await run('floorplan.save',{outletId,baseline:[{id:tableId,version:2}],tables:[]});
 assert.equal(archiveActiveTable.kind,'CONFLICT','a table cannot be archived while an active order owns it');
 assert.equal(archiveActiveTable.error.code,'TABLE_HAS_ACTIVE_ORDER');

 const transferSourceId=randomUUID(),transferDestinationId=randomUUID(),raceSourceA=randomUUID(),raceSourceB=randomUUID(),raceDestination=randomUUID(),mergeSourceId=randomUUID(),firedSourceTableId=randomUUID(),firedTargetTableId=randomUUID(),mergeTargetTableId=randomUUID();
 const tableDefinition=(id,label,posX)=>({id,label,section:'Main',capacity:2,posX,posY:20,minimumSpend:0,shape:'SQUARE',isJoinable:true,assignedServerId:null});
 await confirmed('floorplan.save',{outletId,baseline:[{id:tableId,version:2}],tables:[
  {...tableDefinition(tableId,'T1',10),posY:10,shape:'ROUND'},tableDefinition(transferSourceId,'Transfer source',20),tableDefinition(transferDestinationId,'Transfer destination',30),
  tableDefinition(raceSourceA,'Race source A',40),tableDefinition(raceSourceB,'Race source B',50),tableDefinition(raceDestination,'Race destination',60),tableDefinition(mergeSourceId,'Merge source',70),
  tableDefinition(firedSourceTableId,'Fired source',80),tableDefinition(firedTargetTableId,'Fired destination',90),tableDefinition(mergeTargetTableId,'Merge destination',95),
 ]},{[`tables:${tableId}`]:2});
 const createTableOrder=async(id,table)=>confirmed('order.create',{id,name:`Table ${table}`,outletId,tableId:table},{[`orders:${id}`]:0,[`tables:${table}`]:1,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
 const transferOrderId=randomUUID();
 const transferOrder=await createTableOrder(transferOrderId,transferSourceId);
 const transfer=await confirmed('order.transfer',{orderId:transferOrderId,targetTableId:transferDestinationId},{[`orders:${transferOrderId}`]:transferOrder.result.version,[`tables:${transferSourceId}`]:2,[`tables:${transferDestinationId}`]:1});
 assert.equal(transfer.result.data.tableId,transferDestinationId);
 const transferState=await pool.query('SELECT id,state,version FROM business_floor_tables WHERE business_id=$1 AND id=ANY($2::uuid[])',[businessId,[transferSourceId,transferDestinationId]]);
 assert.equal(transferState.rows.find(row=>row.id===transferSourceId).state,'CLEANING');
 assert.equal(Number(transferState.rows.find(row=>row.id===transferDestinationId).version),2);

 const transferRaceOrders=await Promise.all([[randomUUID(),raceSourceA],[randomUUID(),raceSourceB]].map(([id,table])=>createTableOrder(id,table)));
 const raceSourceOrderIds=transferRaceOrders.map(row=>row.result.id);
 const transferCommands=transferRaceOrders.map((row,index)=>({commandId:randomUUID(),name:'order.transfer',payload:{orderId:raceSourceOrderIds[index],targetTableId:raceDestination},expectedVersions:{[`orders:${raceSourceOrderIds[index]}`]:row.result.version,[`tables:${index===0?raceSourceA:raceSourceB}`]:2,[`tables:${raceDestination}`]:1}}));
 const transferRace=await Promise.all(transferCommands.map(command=>executeCommand({db:store,actor,registry,command})));
 assert.deepEqual(transferRace.map(row=>row.kind).sort(),['CONFIRMED','CONFLICT']);
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM pos_orders WHERE business_id=$1 AND service_destination='TABLE' AND service_reference->>'tableId'=$2 AND state IN ('OPEN','FIRED')",[businessId,raceDestination])).rows[0].count,1);

 const mergeSourceOrderId=randomUUID();
 const mergeSourceOrder=await createTableOrder(mergeSourceOrderId,mergeSourceId);
 const mergeLineId=randomUUID();
 const mergeDraft=await confirmed('order.addItem',{orderId:mergeSourceOrderId,itemId:mergeLineId,productId,quantity:1,portionId:'regular',note:'Held for merge'},{[`orders:${mergeSourceOrderId}`]:mergeSourceOrder.result.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
 const raceWinnerCommand=tableOrders.find(command=>command.commandId===raceWinner.commandId);
 const merge=await confirmed('order.merge',{orderId:mergeSourceOrderId,targetOrderId:raceWinnerCommand.payload.id,targetTableId:tableId},{[`orders:${mergeSourceOrderId}`]:mergeDraft.result.version,[`orders:${raceWinnerCommand.payload.id}`]:raceWinner.result.version,[`tables:${mergeSourceId}`]:2,[`tables:${tableId}`]:3});
 assert.equal(merge.result.mergedOrder.data.state,'MERGED');
 assert.equal(merge.result.mergedOrder.data.mergedIntoOrderId,raceWinnerCommand.payload.id);
 assert.equal(merge.result.order.data.items.length,1);
 assert.equal(merge.result.order.data.items[0].id,mergeLineId);
 const changedSource=await run('order.addItem',{orderId:mergeSourceOrderId,itemId:randomUUID(),productId,quantity:1},{[`orders:${mergeSourceOrderId}`]:merge.result.mergedOrder.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
 assert.equal(changedSource.kind,'CONFLICT','a merged source order refuses further business mutations');
 const mergedVoid=await confirmed('order.void',{orderId:raceWinnerCommand.payload.id,reason:'Close merged acceptance check',operatorConfirmedDisposition:true},{[`orders:${raceWinnerCommand.payload.id}`]:merge.result.order.version});
 assert.equal(mergedVoid.result.order.data.state,'VOIDED');
 const targetReady=await confirmed('table.ready',{tableId},{[`tables:${tableId}`]:4});
 assert.equal(targetReady.result.state,'AVAILABLE');
 const sourceReady=await confirmed('table.ready',{tableId:mergeSourceId},{[`tables:${mergeSourceId}`]:3});
 assert.equal(sourceReady.result.state,'AVAILABLE');

 const customerId=randomUUID();
 const customer=await confirmed('customer.save',{id:customerId,reason:'Create POS acceptance customer',data:{name:'POS Guest',phone:'',email:'',notes:''}},{[`customers:${customerId}`]:0});
 const orderId=randomUUID();
 const opened=await confirmed('order.create',{id:orderId,name:'Counter sale',outletId,serviceDestination:'COUNTER'},{[`orders:${orderId}`]:0,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
 const assigned=await confirmed('order.assignCustomer',{orderId,customerId},{[`orders:${orderId}`]:opened.result.version,[`customers:${customerId}`]:customer.result.version});
 const lineId=randomUUID();
 const added=await confirmed('order.addItem',{orderId,itemId:lineId,productId,quantity:1,portionId:'regular',modifierIds:['oat'],note:'Extra hot',courseName:'First'},{[`orders:${orderId}`]:assigned.result.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
 assert.equal(added.result.data.items[0].notes,'Extra hot');
 assert.equal(added.result.data.items[0].portionSnapshot.id,'regular');
 assert.equal(added.result.data.items[0].modifierSnapshots[0].id,'oat');
 const barLineId=randomUUID();
 const addedBar=await confirmed('order.addItem',{orderId,itemId:barLineId,productId:barProductId,quantity:1,portionId:'regular',note:'No sugar',courseName:'Second'},{[`orders:${orderId}`]:added.result.version,[`products:${barProductId}`]:1,[`businessSettings:${businessId}`]:1});
 const discounted=await confirmed('order.discount',{orderId,percentBasisPoints:1000,reason:'Service recovery discount'},{[`orders:${orderId}`]:addedBar.result.version});
 assert.equal(discounted.result.data.items.find(line=>line.id===lineId).lineTotalMinor,495);
 const comped=await confirmed('order.compItem',{orderId,itemId:barLineId,reason:'Manager approved hospitality comp'},{[`orders:${orderId}`]:discounted.result.version});
 assert.equal(comped.result.data.items.find(line=>line.id===barLineId).lineTotalMinor,0);
 const {rows:beforeFire}=await pool.query('SELECT version::int AS version FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId]);
 const fireCommand={commandId:randomUUID(),name:'order.fire',payload:{orderId,itemIds:[lineId],expectedBalanceVersions:{[`${stockId}:${locationId}`]:beforeFire[0].version}},expectedVersions:{[`orders:${orderId}`]:comped.result.version,[`stockItems:${stockId}`]:1,[`stockLocations:${locationId}`]:1}};
 const fireResponse=await executeCommand({db:store,actor,registry,command:fireCommand});
 assert.equal(fireResponse.kind,'CONFIRMED');
 // Treat the first successful response as lost; recovery must return its stored outcome.
 const recoveredFire=await executeCommand({db:store,actor,registry,command:fireCommand});
 assert.deepEqual(recoveredFire,fireResponse);
 assert.equal(recoveredFire.result.documentIds.length,1);
 assert.equal((await pool.query('SELECT quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity,'9.750000');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM inventory_movements WHERE business_id=$1 AND source_command_id=$2',[businessId,fireCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM pos_stock_consumptions WHERE business_id=$1 AND command_id=$2',[businessId,fireCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type='KOT'",[businessId,fireCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM pos_order_events WHERE business_id=$1 AND command_id=$2',[businessId,fireCommand.commandId])).rows[0].count,1);

 let lifecycleOrder=fireResponse.result.order;
 assert.deepEqual(lifecycleOrder.data.items.filter(line=>line.state==='DRAFT').map(line=>line.id),[barLineId]);
 const fireBar={commandId:randomUUID(),name:'order.fire',payload:{orderId,itemIds:[barLineId],expectedBalanceVersions:{[`${stockId}:${locationId}`]:2}},expectedVersions:{[`orders:${orderId}`]:lifecycleOrder.version,[`stockItems:${stockId}`]:2,[`stockLocations:${locationId}`]:1}};
 const firedBar=await executeCommand({db:store,actor,registry,command:fireBar});
 assert.equal(firedBar.kind,'CONFIRMED');assert.equal(firedBar.result.documentIds.length,1);
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type='BOT'",[businessId,fireBar.commandId])).rows[0].count,1);
 lifecycleOrder=firedBar.result.order;assert.equal(lifecycleOrder.data.currentRoundNo,2);
 for(const [station,itemId] of [['KITCHEN',lineId]]){
  for(const status of ['PREPARING','READY','SERVED']){
   const advanced=await confirmed('order.kds',{orderId,itemId,station,status},{[`orders:${orderId}`]:lifecycleOrder.version});
   lifecycleOrder=advanced.result;
  }
 }
 assert.equal(lifecycleOrder.data.items.find(line=>line.id===lineId).preparationStatus,'SERVED');
 const stockBeforeRepeat=(await pool.query('SELECT quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity;
 const repeated=await confirmed('order.repeatRound',{orderId},{[`orders:${orderId}`]:lifecycleOrder.version,[`products:${productId}`]:1,[`products:${barProductId}`]:1,[`businessSettings:${businessId}`]:1});
 assert.equal(repeated.result.data.currentRoundNo,2);
 assert.equal(repeated.result.data.items.length,4);
 assert.equal(repeated.result.data.items.filter(line=>line.state==='DRAFT'&&line.roundNo===2).length,2);
 assert.equal(repeated.result.data.items.find(line=>line.id===lineId).lineTotalMinor,495);
 assert.equal((await pool.query('SELECT quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity,stockBeforeRepeat,'repeating a round holds new lines without consuming stock');
 const laterLineId=randomUUID();
 const laterLine=await confirmed('order.addItem',{orderId,itemId:laterLineId,productId:barProductId,quantity:1,portionId:'regular',courseName:'Third'},{[`orders:${orderId}`]:repeated.result.version,[`products:${barProductId}`]:1,[`businessSettings:${businessId}`]:1});
 const laterFire={commandId:randomUUID(),name:'order.fire',payload:{orderId,expectedBalanceVersions:{[`${stockId}:${locationId}`]:3}},expectedVersions:{[`orders:${orderId}`]:laterLine.result.version,[`stockItems:${stockId}`]:3,[`stockLocations:${locationId}`]:1}};
 const firedLater=await executeCommand({db:store,actor,registry,command:laterFire});
 assert.equal(firedLater.kind,'CONFIRMED');assert.equal(firedLater.result.documentIds.length,2);
 assert.equal(firedLater.result.order.data.currentRoundNo,3);
 assert.equal(firedLater.result.order.data.items.filter(line=>line.state==='FIRED').length,5);
 assert.equal((await pool.query('SELECT quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity,'8.750000');
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type IN ('KOT','BOT')",[businessId,laterFire.commandId])).rows[0].count,2);

 const firedOrder=firedLater.result.order;
 const mpesaAmount=firedOrder.data.grandTotalMinor-900;
 const paymentCommand={commandId:randomUUID(),name:'payment.split',payload:{orderId,tillSessionId:tillId,payments:[{accountId,amountMinor:900,cashTenderedMinor:900},{accountId:mpesaAccountId,amountMinor:mpesaAmount,manuallyConfirmed:true,reference:'POS-ACCEPTANCE-001',receivedAmountMinor:mpesaAmount,receivedAt:new Date(Date.now()-1000).toISOString()}]},expectedVersions:{[`orders:${orderId}`]:firedOrder.version,[`tillSessions:${tillId}`]:1,[`paymentAccounts:${accountId}`]:1,[`paymentAccounts:${mpesaAccountId}`]:1}};
 const paymentResponse=await executeCommand({db:store,actor,registry,command:paymentCommand});
 assert.equal(paymentResponse.kind,'CONFIRMED');
 const recoveredPayment=await executeCommand({db:store,actor,registry,command:paymentCommand});
 assert.deepEqual(recoveredPayment,paymentResponse);
 assert.equal(paymentResponse.result.order.data.state,'COMPLETED');
 assert.equal(paymentResponse.result.order.data.amountPaidMinor,paymentResponse.result.order.data.grandTotalMinor);
 assert.ok(paymentResponse.result.order.data.receiptDocumentId);
 const settledComp=await run('order.comp',{orderId,reason:'Attempt after settlement'},{[`orders:${paymentResponse.result.order.version}`]:paymentResponse.result.order.version});
 assert.equal(settledComp.kind,'CONFLICT','settled orders cannot be repriced or comped');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_payments WHERE business_id=$1 AND source_command_id=$2',[businessId,paymentCommand.commandId])).rows[0].count,2,'split settlement writes one row per recorded tender');
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type='SALES_RECEIPT'",[businessId,paymentCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM pos_order_events WHERE business_id=$1 AND command_id=$2',[businessId,paymentCommand.commandId])).rows[0].count,1);

 const voidOrderId=randomUUID();
 const voidOrder=await confirmed('order.create',{id:voidOrderId,name:'Consumed void acceptance',outletId,serviceDestination:'COUNTER'},{[`orders:${voidOrderId}`]:0,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
 const voidLineId=randomUUID();
 const voidDraft=await confirmed('order.addItem',{orderId:voidOrderId,itemId:voidLineId,productId,quantity:1,portionId:'regular',modifierIds:['oat'],note:'Prepared then cancelled',courseName:'Test'},{[`orders:${voidOrderId}`]:voidOrder.result.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
 const voidFire={commandId:randomUUID(),name:'order.fire',payload:{orderId:voidOrderId,expectedBalanceVersions:{[`${stockId}:${locationId}`]:4}},expectedVersions:{[`orders:${voidOrderId}`]:voidDraft.result.version,[`stockItems:${stockId}`]:4,[`stockLocations:${locationId}`]:1}};
 const consumedFire=await executeCommand({db:store,actor,registry,command:voidFire});
 assert.equal(consumedFire.kind,'CONFIRMED');
 const voidCommand={commandId:randomUUID(),name:'order.void',payload:{orderId:voidOrderId,reason:'Prepared order was cancelled and consumed',disposition:'CONSUMED',operatorConfirmedDisposition:true},expectedVersions:{[`orders:${voidOrderId}`]:consumedFire.result.order.version}};
 const voidResponse=await executeCommand({db:store,actor,registry,command:voidCommand});
 assert.equal(voidResponse.kind,'CONFIRMED');
 const recoveredVoid=await executeCommand({db:store,actor,registry,command:voidCommand});
 assert.deepEqual(recoveredVoid,voidResponse);
 assert.equal(voidResponse.result.order.data.state,'VOIDED');
 assert.equal(voidResponse.result.order.data.voidDisposition,'CONSUMED');
 assert.equal((await pool.query('SELECT quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity,'8.500000','consumed stock remains consumed after void');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM inventory_movements WHERE business_id=$1 AND source_command_id=$2',[businessId,voidCommand.commandId])).rows[0].count,0,'a consumed void does not create a fictitious stock return');
 assert.ok((await pool.query("SELECT count(*)::int AS count FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type IN ('ORDER_VOID_NOTICE','KOT_CANCEL')",[businessId,voidCommand.commandId])).rows[0].count>=1);

 const compOrderId=randomUUID();
 const compOrder=await confirmed('order.create',{id:compOrderId,name:'Order-level comp acceptance',outletId,serviceDestination:'COUNTER'},{[`orders:${compOrderId}`]:0,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
 const compLineIds=[randomUUID(),randomUUID()];let compVersion=compOrder.result.version;
 for(const itemId of compLineIds){const addedCompLine=await confirmed('order.addItem',{orderId:compOrderId,itemId,productId,quantity:1,portionId:'regular'},{[`orders:${compOrderId}`]:compVersion,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});compVersion=addedCompLine.result.version}
 const stockBeforeComp=(await pool.query('SELECT quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity;
 const orderComp=await confirmed('order.comp',{orderId:compOrderId,reason:'Manager approved full-order recovery'},{[`orders:${compOrderId}`]:compVersion});
 assert.equal(orderComp.result.data.grandTotalMinor,0);assert.ok(orderComp.result.data.items.filter(item=>compLineIds.includes(item.id)).every(item=>item.comped&&item.lineTotalMinor===0));
 assert.equal((await pool.query('SELECT quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity,stockBeforeComp,'comps do not fire stock');
 const repeatedComp=await run('order.comp',{orderId:compOrderId,reason:'Duplicate full-order comp'},{[`orders:${compOrderId}`]:orderComp.result.version});
 assert.equal(repeatedComp.kind,'CONFLICT','a second comp cannot rewrite already comped lines');
 const compEvent=await pool.query("SELECT event_data FROM pos_order_events WHERE business_id=$1 AND order_id=$2 AND event_type='order.comp' ORDER BY occurred_at DESC LIMIT 1",[businessId,compOrderId]);
 assert.equal(compEvent.rows.length,1);assert.equal(compEvent.rows[0].event_data.reason,'Manager approved full-order recovery');assert.equal(compEvent.rows[0].event_data.adjustments.length,2);

 const firedTableOrderId=randomUUID(),firedTableOrder=await createTableOrder(firedTableOrderId,firedSourceTableId),firedTableLineId=randomUUID();
 const firedTableDraft=await confirmed('order.addItem',{orderId:firedTableOrderId,itemId:firedTableLineId,productId,quantity:1,portionId:'regular'},{[`orders:${firedTableOrderId}`]:firedTableOrder.result.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
 const firedTableBalance=await pool.query('SELECT version FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId]);
 const firedTableStockVersion=await pool.query("SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type='stockItems' AND entity_id=$2",[businessId,stockId]);
 const firedTableCommand={commandId:randomUUID(),name:'order.fire',payload:{orderId:firedTableOrderId,itemIds:[firedTableLineId],expectedBalanceVersions:{[`${stockId}:${locationId}`]:Number(firedTableBalance.rows[0].version)}},expectedVersions:{[`orders:${firedTableOrderId}`]:firedTableDraft.result.version,[`stockItems:${stockId}`]:Number(firedTableStockVersion.rows[0].version),[`stockLocations:${locationId}`]:1}};
 const firedTable=await executeCommand({db:store,actor,registry,command:firedTableCommand});assert.equal(firedTable.kind,'CONFIRMED');
 const tableVersion=async id=>Number((await pool.query('SELECT version FROM business_floor_tables WHERE business_id=$1 AND id=$2',[businessId,id])).rows[0].version);
 const entityVersion=async(type,id)=>Number((await pool.query('SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type=$2 AND entity_id=$3',[businessId,type,id])).rows[0].version);
 const preparingTransfer=await run('order.transfer',{orderId:firedTableOrderId,targetTableId:firedTargetTableId},{[`orders:${firedTableOrderId}`]:firedTable.result.order.version,[`tables:${firedSourceTableId}`]:await tableVersion(firedSourceTableId),[`tables:${firedTargetTableId}`]:await tableVersion(firedTargetTableId)});
 assert.equal(preparingTransfer.kind,'CONFLICT');assert.equal(preparingTransfer.error.code,'PREPARATION_IN_PROGRESS','fired work cannot move while preparation is active');
 let firedTableVersion=firedTable.result.order.version;
 for(const status of ['PREPARING','READY','SERVED']){const advanced=await confirmed('order.kds',{orderId:firedTableOrderId,itemId:firedTableLineId,station:'KITCHEN',status},{[`orders:${firedTableOrderId}`]:firedTableVersion});firedTableVersion=advanced.result.version}
 const servedTransfer=await confirmed('order.transfer',{orderId:firedTableOrderId,targetTableId:firedTargetTableId},{[`orders:${firedTableOrderId}`]:firedTableVersion,[`tables:${firedSourceTableId}`]:await tableVersion(firedSourceTableId),[`tables:${firedTargetTableId}`]:await tableVersion(firedTargetTableId)});
 assert.equal(servedTransfer.result.data.tableId,firedTargetTableId,'a fully served fired order can transfer');
 const tableSaleAmount=servedTransfer.result.data.grandTotalMinor;
 const tableCashAmount=Math.floor(tableSaleAmount/2),tableMpesaAmount=tableSaleAmount-tableCashAmount;
 const tableSettlement=await confirmed('payment.split',{orderId:firedTableOrderId,tillSessionId:tillId,payments:[{accountId,amountMinor:tableCashAmount,cashTenderedMinor:tableCashAmount},{accountId:mpesaAccountId,amountMinor:tableMpesaAmount,manuallyConfirmed:true,reference:'TABLE-SERVED-ACCEPTANCE',receivedAmountMinor:tableMpesaAmount,receivedAt:new Date(Date.now()-1000).toISOString()}]},{[`orders:${firedTableOrderId}`]:servedTransfer.result.version,[`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId),[`paymentAccounts:${accountId}`]:await entityVersion('paymentAccounts',accountId),[`paymentAccounts:${mpesaAccountId}`]:await entityVersion('paymentAccounts',mpesaAccountId)});
 assert.equal(tableSettlement.result.order.data.state,'COMPLETED');
 const settledTransfer=await run('order.transfer',{orderId:firedTableOrderId,targetTableId:mergeTargetTableId},{[`orders:${firedTableOrderId}`]:tableSettlement.result.order.version,[`tables:${firedTargetTableId}`]:await tableVersion(firedTargetTableId),[`tables:${mergeTargetTableId}`]:await tableVersion(mergeTargetTableId)});
 assert.equal(settledTransfer.kind,'CONFLICT','settled table orders cannot transfer');
 const mergeTargetOrderId=randomUUID(),mergeTargetOrder=await createTableOrder(mergeTargetOrderId,mergeTargetTableId);
 const settledMerge=await run('order.merge',{orderId:firedTableOrderId,targetOrderId:mergeTargetOrderId,targetTableId:mergeTargetTableId},{[`orders:${firedTableOrderId}`]:tableSettlement.result.order.version,[`orders:${mergeTargetOrderId}`]:mergeTargetOrder.result.version,[`tables:${firedTargetTableId}`]:await tableVersion(firedTargetTableId),[`tables:${mergeTargetTableId}`]:await tableVersion(mergeTargetTableId)});
 assert.equal(settledMerge.kind,'CONFLICT','settled source checks cannot merge');assert.equal(settledMerge.error.code,'ORDER_NOT_MERGEABLE');

 const finalFloorplan=await floorplanProjections(pool,businessId),archivedTableId=mergeSourceId;
 const archiveLayout=finalFloorplan.filter(row=>row.data.outletId===outletId&&row.id!==archivedTableId).map(row=>({id:row.id,label:row.data.label,section:row.data.section,capacity:row.data.capacity,posX:row.data.posX,posY:row.data.posY,minimumSpend:row.data.minimumSpend,shape:row.data.shape,isJoinable:row.data.isJoinable,assignedServerId:row.data.assignedServerId}));
 const archived=await confirmed('floorplan.save',{outletId,baseline:finalFloorplan.filter(row=>row.data.outletId===outletId).map(row=>({id:row.id,version:row.version})),tables:archiveLayout});
 assert.equal((await floorplanProjections(pool,businessId)).find(row=>row.id===archivedTableId).archived,true,'an inactive table can be archived');
 assert.equal((await pool.query('SELECT archived_at IS NOT NULL AS archived FROM business_floor_tables WHERE business_id=$1 AND id=$2',[businessId,archivedTableId])).rows[0].archived,true);

 const changes=await store.changesAfter(businessId,0,100);
 const posCommandIds=[fireCommand.commandId,fireBar.commandId,laterFire.commandId,paymentCommand.commandId,voidFire.commandId,voidCommand.commandId];
 const posChanges=changes.changes.filter(change=>posCommandIds.includes(change.commandId));
 assert.equal(posChanges.length,posCommandIds.length,'each fire and payment publishes one ordered change-feed entry');
 assert.ok(posChanges[0].sequence<posChanges[1].sequence);
 assert.deepEqual(new Set(posChanges.map(change=>change.commandId)),new Set(posCommandIds));
 assert.ok(posChanges.every(change=>change.records.length>0));
});
