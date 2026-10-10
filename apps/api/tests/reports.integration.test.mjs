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
import {paymentAccountCommandRegistry} from '../src/payment-accounts.mjs';
import {tillCommandRegistry} from '../src/till-commands.mjs';
import {posCommandRegistry} from '../src/pos-commands.mjs';
import {paymentCommandRegistry} from '../src/payment-commands.mjs';
import {refundCommandRegistry} from '../src/refund-commands.mjs';
import {salesSummary,salesRegister,stockOnHand,occupancy} from '../src/reports.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('Report layer reconciles recognized sales, collections, and refunds from the receipt-anchored record',{skip:!databaseUrl,timeout:180_000},async t=>{
 const adminPool=new Pool({connectionString:databaseUrl,max:2});
 const schema=`reports_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:databaseUrl,max:12,options:`-c search_path=${schema},public`});
 t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end()});
 await migrate(pool);
 const store=new PostgresStore(pool),businessId=randomUUID();
 const manager={businessId,staffId:randomUUID(),deviceId:randomUUID(),permissions:['*']};
 const registry=new Map([...catalogCommandRegistry,...businessTaxCommandRegistry,...outletCommandRegistry,...paymentAccountCommandRegistry,...tillCommandRegistry,...posCommandRegistry,...paymentCommandRegistry,...refundCommandRegistry]);
 await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Disposable Report Acceptance']);
 await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[manager.deviceId,businessId,manager.staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'x',y:'y'})]);
 const run=(name,payload,expectedVersions={},commandId=randomUUID())=>executeCommand({db:store,actor:manager,registry,command:{commandId,name,payload,expectedVersions}});
 const confirmed=async(name,payload,expectedVersions={})=>{const outcome=await run(name,payload,expectedVersions);assert.equal(outcome.kind,'CONFIRMED',`${name}: ${JSON.stringify(outcome)}`);return outcome};
 const version=async(entityType,entityId)=>Number((await pool.query('SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type=$2 AND entity_id=$3',[businessId,entityType,entityId])).rows[0].version);

 const locationId=randomUUID();
 await confirmed('stockLocation.save',{id:locationId,data:{name:'Store',code:`ST-${locationId.slice(0,6)}`,type:'STORE'}},{[`stockLocations:${locationId}`]:0});
 const stockId=randomUUID();
 await confirmed('stockItem.save',{id:stockId,data:{name:'Coffee beans',code:`COF-${stockId.slice(0,6)}`,baseUnit:'kg',averageUnitCostMinor:1000,scanUnitQuantity:1,reorderLevel:0,purchasePackages:[]}},{[`stockItems:${stockId}`]:0});
 await store.transaction(tx=>tx.setInventoryBalance({businessId,stockItemId:stockId,locationId,quantity:10}));
 const productId=randomUUID();
 const productData={name:'Filter coffee',code:'DRK-PR-1',priceMinor:500,category:'Coffee',routeTo:'KITCHEN',taxClassId:'A_16',stockItemId:stockId,portions:[{id:'regular',name:'Regular',priceMinor:500,volume:0.25}],recipeIngredients:[{stockItemId:stockId,quantity:0.25,unit:'kg'}]};
 await confirmed('product.save',{id:productId,data:productData},{[`products:${productId}`]:0});
 await confirmed('business.settings.save',{data:{businessName:'Disposable Report Acceptance',address:'Test address',contact:'',taxPin:'',footer:'Thank you',vatRateBasisPoints:1600,levyRateBasisPoints:0},reason:'Configure report acceptance tax policy'},{[`businessSettings:${businessId}`]:0});
 const outletId=randomUUID();
 await confirmed('outlet.save',{id:outletId,data:{name:'Main outlet',defaultStockLocationId:locationId,archived:false},reason:'Configure report acceptance outlet'},{[`outlets:${outletId}`]:0,[`stockLocations:${locationId}`]:1});
 const accountId=randomUUID();
 await confirmed('paymentAccount.save',{id:accountId,reason:'Configure cash account',data:{name:'Cash',code:`CASH-${accountId.slice(0,6)}`,method:'CASH',currency:'KES',referenceRequired:false,archived:false}},{[`paymentAccounts:${accountId}`]:0});
 const tillId=randomUUID();
 await confirmed('till.open',{id:tillId,outletId,openingFloatMinor:100000},{[`tillSessions:${tillId}`]:0,[`outlets:${outletId}`]:1,[`tillPolicy:${businessId}`]:0});

 // Completed sale: quantity units, fully paid, receipt issued.
 const sell=async(name,quantity,amountPaid)=>{
  const orderId=randomUUID(),order=await confirmed('order.create',{id:orderId,name,outletId,serviceDestination:'COUNTER'},{[`orders:${orderId}`]:0,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
  const lineId=randomUUID(),draft=await confirmed('order.addItem',{orderId,itemId:lineId,productId,quantity,portionId:'regular'},{[`orders:${orderId}`]:order.result.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
  const balanceVersion=Number((await pool.query('SELECT version::int AS version FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].version);
  const fire=await confirmed('order.fire',{orderId,itemIds:[lineId],expectedBalanceVersions:{[`${stockId}:${locationId}`]:balanceVersion}},{[`orders:${orderId}`]:draft.result.version,[`stockItems:${stockId}`]:await version('stockItems',stockId),[`stockLocations:${locationId}`]:await version('stockLocations',locationId)});
  const payment=await confirmed('payment.record',{orderId,tillSessionId:tillId,accountId,amountMinor:amountPaid,cashTenderedMinor:amountPaid},{[`orders:${orderId}`]:fire.result.order.version,[`tillSessions:${tillId}`]:await version('tillSessions',tillId),[`paymentAccounts:${accountId}`]:await version('paymentAccounts',accountId)});
  return {orderId,paymentId:payment.result.paymentIds[0]};
 };
 const fullSale=await sell('Fully paid sale',1,500);
 const refundSale=await sell('Sale to refund',2,1000);
 const partialSale=await sell('Partially paid order',1,200);

 // Refund part of the second sale through the audited refund command.
 await confirmed('payment.refund',{paymentId:refundSale.paymentId,tillSessionId:tillId,amountMinor:400,reason:'Guest changed their mind',operatorConfirmedReturned:true},{[`payments:${refundSale.paymentId}`]:await version('payments',refundSale.paymentId),[`orders:${refundSale.orderId}`]:await version('orders',refundSale.orderId),[`tillSessions:${tillId}`]:await version('tillSessions',tillId)});

 const period={start:'2020-01-01',end:'2030-12-31'};
 const summary=await salesSummary(pool,manager,period);
 assert.equal(summary.report,'SALES_SUMMARY');
 assert.equal(summary.timeZone,'Africa/Nairobi');
 // Only completed orders anchor recognized sales; the partial order does not.
 assert.equal(summary.totals.salesCount,2);
 assert.equal(Number(summary.totals.grossMinor),1500);
 assert.equal(Number(summary.totals.refundsMinor),400);
 assert.equal(Number(summary.totals.netSalesMinor),1100);
 // Tax conservation straight from the immutable receipt snapshots.
 assert.equal(Number(summary.totals.netMinor)+Number(summary.totals.vatMinor)+Number(summary.totals.levyMinor),Number(summary.totals.grossMinor));
 assert.ok(Number(summary.totals.vatMinor)>0,'VAT must be attributed from the receipt snapshots');
 // Payment-method breakdown covers recognized sales only (1500), collections cover every posting (1700).
 assert.deepEqual(summary.payments.map(row=>row.method),['CASH']);
 assert.equal(Number(summary.payments[0].amountMinor),1500);
 assert.equal(summary.payments[0].paymentCount,2);
 assert.equal(Number(summary.collections.collectedMinor),1700);
 assert.equal(Number(summary.collections.cashCollectedMinor),1700);
 assert.equal(Number(summary.refunds.refundCount),1);
 assert.equal(Number(summary.refunds.refundMinor),400);
 // Category, outlet, and operator breakdowns stay on the same recognized-sales basis.
 assert.equal(Number(summary.categories.find(row=>row.category==='Coffee')?.grossMinor),1500);
 assert.equal(Number(summary.outlets.find(row=>row.outletId===outletId)?.grossMinor),1500);
 assert.equal(summary.operators.find(row=>row.staffId===manager.staffId)?.salesCount,2);

 // Register: page rows are paginated but totals cover the whole period.
 const register=await salesRegister(pool,manager,{...period,limit:1});
 assert.equal(register.report,'SALES_REGISTER');
 assert.equal(register.lines.length,1);
 assert.equal(Number(register.totals.lineCount),2);
 assert.equal(Number(register.totals.grossMinor),1500);
 const fullPage=await salesRegister(pool,manager,{...period,limit:1000});
 assert.equal(fullPage.lines.length,2);
 assert.equal(Number(fullPage.lines.reduce((sum,line)=>sum+Number(line.netMinor)+Number(line.vatMinor)+Number(line.levyMinor)),0),Number(fullPage.totals.grossMinor));

 // Permission gate: actors without reports.view are rejected.
 const restricted={businessId,staffId:randomUUID(),deviceId:randomUUID(),permissions:['pos.sell']};
 await assert.rejects(()=>salesSummary(pool,restricted,period),error=>error.code==='PERMISSION_DENIED');
 await assert.rejects(()=>salesRegister(pool,restricted,period),error=>error.code==='PERMISSION_DENIED');
 await assert.rejects(()=>salesSummary(pool,manager,{start:'2030-12-31',end:'2020-01-01'}),error=>error.code==='VALIDATION_FAILED');
 await assert.rejects(()=>salesSummary(pool,manager,{...period,timeZone:'Mars/Olympus'}),error=>error.code==='VALIDATION_FAILED');
 await assert.rejects(()=>salesSummary(pool,manager,{...period,timeZone:'a'.repeat(101)}),error=>error.code==='VALIDATION_FAILED');

 // Stock on hand reflects current balances at current average cost.
 const stockReport=await stockOnHand(pool,manager,{});
 const stockRow=stockReport.rows.find(row=>row.stockItemId===stockId);
 assert.ok(stockRow,'the stocked item must appear in stock on hand');
 assert.equal(Number(stockRow.valueMinor),Number(stockRow.quantity)*1000);
 assert.equal(stockRow.sealedContainers,null,'kg stock carries no bottle state');

 // Occupancy runs against the real schema and reports the exact definition it uses.
 const stays=await occupancy(pool,manager,{start:'2026-01-01',end:'2026-01-03'});
 assert.equal(stays.report,'OCCUPANCY');
 assert.equal(stays.nights.length,3);
 assert.ok(stays.nights.every(night=>night.occupiedRooms===0&&night.availableRooms===0));
 assert.ok(stays.definition.includes('time zone'));
});