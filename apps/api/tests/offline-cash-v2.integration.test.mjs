import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {calculateLine} from '../../../contracts/pos-math.mjs';
import {Pool} from 'pg';
import {migrate} from '../src/migrate.mjs';
import {PostgresStore} from '../src/postgres-store.mjs';
import {executeCommand} from '../src/command-kernel.mjs';
import {createApiCommandRegistry} from '../src/command-registry.mjs';
import {filterRecords} from '../src/projection-access.mjs';

test('offline V2 commits cash and preparation once and preserves conflicting cash evidence',{skip:!process.env.TEST_DATABASE_URL,timeout:120000},async t=>{
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),schema=`tickets_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:10});
 const previous=process.env.POS2_WAITER_TICKET_COHORTS,oldKey=process.env.OFFLINE_GRANT_PRIVATE_JWK,oldCohort=process.env.POS2_OFFLINE_CASH_COHORTS;
 const keys=generateKeyPairSync('ec',{namedCurve:'P-256'});process.env.OFFLINE_GRANT_PRIVATE_JWK=JSON.stringify(keys.privateKey.export({format:'jwk'}));
 t.after(async()=>{if(oldKey===undefined)delete process.env.OFFLINE_GRANT_PRIVATE_JWK;else process.env.OFFLINE_GRANT_PRIVATE_JWK=oldKey;if(oldCohort===undefined)delete process.env.POS2_OFFLINE_CASH_COHORTS;else process.env.POS2_OFFLINE_CASH_COHORTS=oldCohort;if(previous===undefined)delete process.env.POS2_WAITER_TICKET_COHORTS;else process.env.POS2_WAITER_TICKET_COHORTS=previous;await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();});
 await migrate(pool);
 const businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID(),waiterId=randomUUID(),waiterDevice=randomUUID(),secondId=randomUUID(),secondDevice=randomUUID();
 const cashier={businessId,staffId,deviceId,permissions:['*']},waiter={businessId,staffId:waiterId,deviceId:waiterDevice,permissions:['ticket.create','ticket.view_own']},second={...waiter,staffId:secondId,deviceId:secondDevice};
 process.env.POS2_WAITER_TICKET_COHORTS=JSON.stringify([cashier,waiter,second].map(({businessId,staffId,deviceId})=>({businessId,staffId,deviceId})));
 await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Ticket acceptance']);
 for(const actor of [cashier,waiter,second]){
  await pool.query("INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password) VALUES($1,$2,$3,'Ticket tester','Custom','test-hash',false)",[businessId,actor.staffId,`${actor.staffId}@example.invalid`]);
  await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[actor.deviceId,businessId,actor.staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'x',y:'y'})]);
 }
 const store=new PostgresStore(pool),registry=createApiCommandRegistry();
 const run=(actor,name,payload,expectedVersions={},commandId=randomUUID())=>executeCommand({db:store,actor,registry,command:{commandId,name,payload,expectedVersions}});
 const ok=async(name,payload,expectedVersions={})=>{const out=await run(cashier,name,payload,expectedVersions);assert.equal(out.kind,'CONFIRMED',JSON.stringify(out));return out;};
 const locationId=randomUUID(),stockId=randomUUID(),productId=randomUUID(),outletId=randomUUID();
 await ok('stockLocation.save',{id:locationId,data:{name:'Store',code:'TICKET-STORE',type:'STORE'}},{[`stockLocations:${locationId}`]:0});
 await ok('stockItem.save',{id:stockId,data:{name:'Coffee stock',code:'TICKET-STOCK',baseUnit:'kg',averageUnitCostMinor:1000,scanUnitQuantity:1,reorderLevel:0,purchasePackages:[]}},{[`stockItems:${stockId}`]:0});
 await store.transaction(tx=>tx.setInventoryBalance({businessId,stockItemId:stockId,locationId,quantity:200}));
 await ok('product.save',{id:productId,data:{name:'Coffee',code:'TICKET-COFFEE',priceMinor:90000,category:'Coffee',routeTo:'KITCHEN',taxClassId:'A_16',stockItemId:stockId,recipeIngredients:[{stockItemId:stockId,quantity:0.25,unit:'kg'}]}},{[`products:${productId}`]:0});
 await ok('business.settings.save',{data:{businessName:'Ticket acceptance',address:'Test',contact:'',taxPin:'',footer:'Thanks',vatRateBasisPoints:1600,levyRateBasisPoints:0},reason:'Set acceptance taxes'},{[`businessSettings:${businessId}`]:0});
 await ok('outlet.save',{id:outletId,data:{name:'Outlet',defaultStockLocationId:locationId,archived:false},reason:'Configure outlet'},{[`outlets:${outletId}`]:0,[`stockLocations:${locationId}`]:1});
 await ok('pos.checkoutEnroll',{outletId,deviceId});
 const accountId=randomUUID(),tillId=randomUUID();
 await ok('paymentAccount.save',{id:accountId,reason:'Test cash account',data:{name:'Cash',code:'CASH',method:'CASH',currency:'KES',referenceRequired:false,archived:false}},{[`paymentAccounts:${accountId}`]:0});
 await ok('till.open',{id:tillId,outletId,openingFloatMinor:0},{[`tillSessions:${tillId}`]:0,[`outlets:${outletId}`]:1,[`tillPolicy:${businessId}`]:0});
 const issue={outletId,tillSessionId:tillId,deviceLabel:'POS01',durationMinutes:240};
 const disabled=await run(cashier,'pos.offlineCapability.issue',issue);assert.equal(disabled.error.code,'OFFLINE_PILOT_DISABLED');
 process.env.POS2_OFFLINE_CASH_COHORTS=JSON.stringify([{businessId,staffId,deviceId}]);
 const issued=await ok('pos.offlineCapability.issue',issue),lease=issued.result;
 const taxSnapshot={settingsVersion:1,taxClassId:'A_16',priceMode:'INCLUSIVE',vatRateBasisPoints:1600,levyRateBasisPoints:0};
 const make=(sequence,price=90000)=>{const id=randomUUID(),line={id:randomUUID(),productId,name:'Kitchen product',productVersion:1,quantity:1,unitPriceMinor:price,discountBasisPoints:0,comped:false,taxSnapshot,...calculateLine(1,price,0,false,taxSnapshot)},reference='POS01-20261011-'+String(sequence).padStart(6,'0'),input={id,outletId,tillSessionId:tillId,cashAccountId:accountId,cashTenderedMinor:100000,stockMovements:[{id:randomUUID(),stockItemId:stockId,locationId,quantityFixed:'-250000',unit:'kg'}],expectedVersions:{[`businessSettings:${businessId}`]:1,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`products:${productId}`]:1,[`stockItems:${stockId}`]:1,[`paymentAccounts:${accountId}`]:1},expectedBalanceVersions:{[`${stockId}:${locationId}`]:1}};return {sale:{id,businessId,deviceId,staffId,outletId,tillSessionId:tillId,sequence,reference,currency:'KES',occurredAt:new Date().toISOString(),input,lines:[line],totalMinor:price,changeMinor:100000-price},lease};};
 const envelope=make(1),saleId=envelope.sale.id;
 const committed=await run(cashier,'pos.offlineSale.commitV2',envelope,{},saleId);assert.equal(committed.kind,'CONFIRMED',JSON.stringify(committed));assert.equal(committed.result.data.status,'SERVER_CONFIRMED',JSON.stringify(committed));
 for(let i=0;i<5;i++)assert.deepEqual(await run(cashier,'pos.offlineSale.commitV2',envelope,{},saleId),committed);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_payments WHERE business_id=$1 AND order_id=$2',[businessId,saleId])).rows[0].n,1);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type='KOT'",[businessId,saleId])).rows[0].n,1);
 assert.equal(Number((await pool.query('SELECT quantity FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2',[businessId,stockId])).rows[0].quantity),199.75);
 const conflict=make(101,1),review=await run(cashier,'pos.offlineSale.commitV2',conflict,{},conflict.sale.id);assert.equal(review.kind,'CONFIRMED',JSON.stringify(review));assert.equal(review.result.data.status,'RECONCILIATION_REQUIRED');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM pos_orders WHERE business_id=$1 AND id=$2',[businessId,conflict.sale.id])).rows[0].n,0);
 assert.equal((await pool.query('SELECT local_snapshot FROM pos_offline_cash_reconciliations WHERE business_id=$1 AND sale_id=$2',[businessId,conflict.sale.id])).rows[0].local_snapshot.totalMinor,1);
 for(let sequence=2;sequence<=100;sequence++){
  const next=make(sequence);next.sale.input.expectedVersions[`stockItems:${stockId}`]=sequence;next.sale.input.expectedBalanceVersions[`${stockId}:${locationId}`]=sequence;
  const outcome=await run(cashier,'pos.offlineSale.commitV2',next,{},next.sale.id);assert.equal(outcome.kind,'CONFIRMED',JSON.stringify(outcome));assert.equal(outcome.result.data.status,'SERVER_CONFIRMED',JSON.stringify(outcome));
  for(let replay=0;replay<5;replay++)assert.deepEqual(await run(cashier,'pos.offlineSale.commitV2',next,{},next.sale.id),outcome);
 }
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_payments WHERE business_id=$1',[businessId])).rows[0].n,100);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM business_documents WHERE business_id=$1 AND document_type='KOT'",[businessId])).rows[0].n,100);
 assert.equal(Number((await pool.query('SELECT quantity FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2',[businessId,stockId])).rows[0].quantity),175);
});
