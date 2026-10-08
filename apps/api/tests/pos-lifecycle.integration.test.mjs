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
import {floorplanCommandRegistry} from '../src/floorplan-commands.mjs';
import {paymentAccountCommandRegistry} from '../src/payment-accounts.mjs';
import {tillCommandRegistry} from '../src/till-commands.mjs';
import {posCommandRegistry} from '../src/pos-commands.mjs';
import {paymentCommandRegistry} from '../src/payment-commands.mjs';

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
  ...posCommandRegistry,...paymentCommandRegistry,
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
 await confirmed('product.save',{id:productId,data:{name:'Filter coffee',code:`DRK-${productId.slice(0,6)}`,priceMinor:500,category:'Coffee',routeTo:'KITCHEN',taxClassId:'A_16',stockItemId:stockId,recipeIngredients:[{stockItemId:stockId,quantity:0.25,unit:'kg'}]}},{[`products:${productId}`]:0});

 await confirmed('business.settings.save',{data:{businessName:'Disposable POS Acceptance',address:'Test address',contact:'',taxPin:'',footer:'Thank you',vatRateBasisPoints:1600,levyRateBasisPoints:0},reason:'Configure POS acceptance tax policy'},{[`businessSettings:${businessId}`]:0});
 const outletId=randomUUID();
 await confirmed('outlet.save',{id:outletId,data:{name:'Main outlet',defaultStockLocationId:locationId,archived:false},reason:'Configure POS acceptance outlet'},{[`outlets:${outletId}`]:0,[`stockLocations:${locationId}`]:1});
 const accountId=randomUUID();
 await confirmed('paymentAccount.save',{id:accountId,reason:'Configure POS acceptance cash account',data:{name:'Cash',code:`CASH-${accountId.slice(0,6)}`,method:'CASH',currency:'KES',referenceRequired:false,archived:false}},{[`paymentAccounts:${accountId}`]:0});
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

 const orderId=randomUUID();
 const opened=await confirmed('order.create',{id:orderId,name:'Counter sale',outletId,serviceDestination:'COUNTER'},{[`orders:${orderId}`]:0,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
 const lineId=randomUUID();
 const added=await confirmed('order.addItem',{orderId,itemId:lineId,productId,quantity:2,note:'Extra hot',courseName:'Drinks'},{[`orders:${orderId}`]:opened.result.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
 assert.equal(added.result.data.items[0].notes,'Extra hot');
 const {rows:beforeFire}=await pool.query('SELECT version::int AS version FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId]);
 const fireCommand={commandId:randomUUID(),name:'order.fire',payload:{orderId,expectedBalanceVersions:{[`${stockId}:${locationId}`]:beforeFire[0].version}},expectedVersions:{[`orders:${orderId}`]:added.result.version,[`stockItems:${stockId}`]:1,[`stockLocations:${locationId}`]:1}};
 const fireResponse=await executeCommand({db:store,actor,registry,command:fireCommand});
 assert.equal(fireResponse.kind,'CONFIRMED');
 // Treat the first successful response as lost; recovery must return its stored outcome.
 const recoveredFire=await executeCommand({db:store,actor,registry,command:fireCommand});
 assert.deepEqual(recoveredFire,fireResponse);
 assert.equal(recoveredFire.result.documentIds.length,1);
 assert.equal((await pool.query('SELECT quantity::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity,'9.500000');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM inventory_movements WHERE business_id=$1 AND source_command_id=$2',[businessId,fireCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM pos_stock_consumptions WHERE business_id=$1 AND command_id=$2',[businessId,fireCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type='KOT'",[businessId,fireCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM pos_order_events WHERE business_id=$1 AND command_id=$2',[businessId,fireCommand.commandId])).rows[0].count,1);

 const firedOrder=fireResponse.result.order;
 const paymentCommand={commandId:randomUUID(),name:'payment.record',payload:{orderId,tillSessionId:tillId,accountId,amountMinor:firedOrder.data.grandTotalMinor,cashTenderedMinor:firedOrder.data.grandTotalMinor},expectedVersions:{[`orders:${orderId}`]:firedOrder.version,[`tillSessions:${tillId}`]:1,[`paymentAccounts:${accountId}`]:1}};
 const paymentResponse=await executeCommand({db:store,actor,registry,command:paymentCommand});
 assert.equal(paymentResponse.kind,'CONFIRMED');
 const recoveredPayment=await executeCommand({db:store,actor,registry,command:paymentCommand});
 assert.deepEqual(recoveredPayment,paymentResponse);
 assert.equal(paymentResponse.result.order.data.state,'COMPLETED');
 assert.equal(paymentResponse.result.order.data.amountPaidMinor,paymentResponse.result.order.data.grandTotalMinor);
 assert.ok(paymentResponse.result.order.data.receiptDocumentId);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_payments WHERE business_id=$1 AND source_command_id=$2',[businessId,paymentCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type='SALES_RECEIPT'",[businessId,paymentCommand.commandId])).rows[0].count,1);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM pos_order_events WHERE business_id=$1 AND command_id=$2',[businessId,paymentCommand.commandId])).rows[0].count,1);

 const changes=await store.changesAfter(businessId,0,100);
 const posChanges=changes.changes.filter(change=>[fireCommand.commandId,paymentCommand.commandId].includes(change.commandId));
 assert.equal(posChanges.length,2,'fire and payment each publish one ordered change-feed entry');
 assert.ok(posChanges[0].sequence<posChanges[1].sequence);
 assert.ok(posChanges.every(change=>change.records.length>0));
});
