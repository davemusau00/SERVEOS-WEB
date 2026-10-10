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
import {stageImport,planImport,applyImport} from '../src/csv-import.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('Reviewed bulk price updates apply through audited commands and reject stale or unknown codes',{skip:!databaseUrl,timeout:120_000},async t=>{
 const adminPool=new Pool({connectionString:databaseUrl,max:2});
 const schema=`price_update_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA \"${schema}\"`);
 const pool=new Pool({connectionString:databaseUrl,max:12,options:`-c search_path=${schema},public`});
 t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS \"${schema}\" CASCADE`);await adminPool.end()});
 await migrate(pool);
 const store=new PostgresStore(pool),businessId=randomUUID();
 const manager={businessId,staffId:randomUUID(),deviceId:randomUUID(),permissions:['*']};
 const registry=new Map([...catalogCommandRegistry,...businessTaxCommandRegistry,...outletCommandRegistry,...paymentAccountCommandRegistry,...tillCommandRegistry,...posCommandRegistry,...paymentCommandRegistry]);
 await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Disposable Price-Update Acceptance']);
 await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[manager.deviceId,businessId,manager.staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'x',y:'y'})]);
 const run=(name,payload,expectedVersions={},commandId=randomUUID())=>executeCommand({db:store,actor:manager,registry,command:{commandId,name,payload,expectedVersions}});
 const confirmed=async(name,payload,expectedVersions={})=>{const outcome=await run(name,payload,expectedVersions);assert.equal(outcome.kind,'CONFIRMED',`${name}: ${JSON.stringify(outcome)}`);return outcome};
 const stage=async csv=>stageImport(pool,manager,{id:randomUUID(),templateKey:'priceUpdates',fileName:`${randomUUID()}.csv`,csvText:csv});

 const locationId=randomUUID();
 await confirmed('stockLocation.save',{id:locationId,data:{name:'Store',code:`ST-${locationId.slice(0,6)}`,type:'STORE'}},{[`stockLocations:${locationId}`]:0});
 const stockId=randomUUID();
 await confirmed('stockItem.save',{id:stockId,data:{name:'Coffee beans',code:`COF-${stockId.slice(0,6)}`,baseUnit:'kg',averageUnitCostMinor:1000,scanUnitQuantity:1,reorderLevel:0,purchasePackages:[]}},{[`stockItems:${stockId}`]:0});
 await store.transaction(tx=>tx.setInventoryBalance({businessId,stockItemId:stockId,locationId,quantity:10}));
 const productId=randomUUID();
 const productData={name:'Filter coffee',code:'DRK-PR-1',priceMinor:500,category:'Coffee',routeTo:'KITCHEN',taxClassId:'A_16',stockItemId:stockId,portions:[{id:'regular',name:'Regular',priceMinor:500,volume:0.25}],recipeIngredients:[{stockItemId:stockId,quantity:0.25,unit:'kg'}]};
 await confirmed('product.save',{id:productId,data:productData},{[`products:${productId}`]:0});
 await confirmed('business.settings.save',{data:{businessName:'Disposable Price-Update Acceptance',address:'Test address',contact:'',taxPin:'',footer:'Thank you',vatRateBasisPoints:1600,levyRateBasisPoints:0},reason:'Configure price-update acceptance tax policy'},{[`businessSettings:${businessId}`]:0});
 const outletId=randomUUID();
 await confirmed('outlet.save',{id:outletId,data:{name:'Main outlet',defaultStockLocationId:locationId,archived:false},reason:'Configure price-update acceptance outlet'},{[`outlets:${outletId}`]:0,[`stockLocations:${locationId}`]:1});
 const accountId=randomUUID();
 await confirmed('paymentAccount.save',{id:accountId,reason:'Configure cash account',data:{name:'Cash',code:`CASH-${accountId.slice(0,6)}`,method:'CASH',currency:'KES',referenceRequired:false,archived:false}},{[`paymentAccounts:${accountId}`]:0});
 const tillId=randomUUID();
 await confirmed('till.open',{id:tillId,outletId,openingFloatMinor:0},{[`tillSessions:${tillId}`]:0,[`outlets:${outletId}`]:1,[`tillPolicy:${businessId}`]:0});
 const orderId=randomUUID(),order=await confirmed('order.create',{id:orderId,name:'Repriced sale baseline',outletId,serviceDestination:'COUNTER'},{[`orders:${orderId}`]:0,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
 const lineId=randomUUID(),draft=await confirmed('order.addItem',{orderId,itemId:lineId,productId,quantity:1,portionId:'regular'},{[`orders:${orderId}`]:order.result.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
 const balanceVersion=Number((await pool.query('SELECT version::int AS version FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].version);
 const fire=await confirmed('order.fire',{orderId,itemIds:[lineId],expectedBalanceVersions:{[`${stockId}:${locationId}`]:balanceVersion}},{[`orders:${orderId}`]:draft.result.version,[`stockItems:${stockId}`]:1,[`stockLocations:${locationId}`]:1});
 const tillVersion=Number((await pool.query('SELECT version FROM till_sessions WHERE business_id=$1 AND id=$2',[businessId,tillId])).rows[0].version);
 await confirmed('payment.record',{orderId,tillSessionId:tillId,accountId,amountMinor:500,cashTenderedMinor:500},{[`orders:${orderId}`]:fire.result.order.version,[`tillSessions:${tillId}`]:tillVersion,[`paymentAccounts:${accountId}`]:1});
 const originalReceipt=(await pool.query("SELECT snapshot,snapshot_hash FROM business_documents WHERE business_id=$1 AND document_type='SALES_RECEIPT'",[businessId])).rows[0];
 assert.equal(originalReceipt.snapshot.totalMinor,500);

 // Clean batch: old and new prices previewed, applied through the audited domain command.
 const cleanBatch=(await stage('product_code,new_price,reason\nDRK-PR-1,650.00,Supplier price increase')).batch;
 assert.equal(cleanBatch.validCount,1);
 const cleanPlan=(await planImport({store,registry,actor:manager,batchId:cleanBatch.id})).plan;
 assert.equal(cleanPlan.status,'READY');
 const plannedStep=cleanPlan.steps.find(step=>step.rowNumber===2);
 assert.equal(plannedStep.action,'UPDATE');assert.equal(plannedStep.operation,'product.save');
 assert.ok(plannedStep.reason.startsWith('Reprice validated: "Filter coffee" from Ksh'));
 assert.ok(plannedStep.reason.includes('5.00 to Ksh'));assert.ok(plannedStep.reason.includes('650.00.'));
 const applied=(await applyImport({store,registry,actor:manager,planId:cleanPlan.id})).plan;
 assert.equal(applied.status,'APPLIED',JSON.stringify(applied));
 assert.equal(applied.steps.find(step=>step.rowNumber===2).status,'APPLIED');
 assert.equal(Number((await pool.query('SELECT price_minor AS price FROM products WHERE business_id=$1 AND id=$2',[businessId,productId])).rows[0].price),65000);
 const auditedCommand=(await pool.query("SELECT request FROM api_commands WHERE business_id=$1 AND command_name='product.save' AND status='CONFIRMED' ORDER BY received_at DESC LIMIT 1",[businessId])).rows[0].request;
 assert.equal(auditedCommand.payload.reason,'Supplier price increase');
 const receiptAfter=(await pool.query("SELECT snapshot,snapshot_hash FROM business_documents WHERE business_id=$1 AND document_type='SALES_RECEIPT'",[businessId])).rows[0];
 assert.equal(receiptAfter.snapshot.totalMinor,500,'an issued receipt never changes after a price update');
 assert.equal(receiptAfter.snapshot_hash,originalReceipt.snapshot_hash);

 // Unknown codes are identified in the dry run and the plan cannot apply.
 const unknownBatch=(await stage('product_code,new_price,reason\nGHOST-CODE,700.00,Typo check')).batch;
 const unknownPlan=(await planImport({store,registry,actor:manager,batchId:unknownBatch.id})).plan;
 assert.equal(unknownPlan.status,'BLOCKED');
 const unknownStep=unknownPlan.steps.find(step=>step.rowNumber===2);
 assert.equal(unknownStep.status,'CONFLICT');assert.equal(unknownStep.error,'IMPORT_REFERENCE_MISSING');
 await assert.rejects(()=>applyImport({store,registry,actor:manager,planId:unknownPlan.id}),error=>error.code==='IMPORT_PLAN_CLOSED');

 // A stale reviewed sheet is rejected instead of silently overwriting a newer operator change.
 const staleBatch=(await stage('product_code,new_price,reason\nDRK-PR-1,700.00,Second reviewed update')).batch;
 const stalePlan=(await planImport({store,registry,actor:manager,batchId:staleBatch.id})).plan;
 assert.equal(stalePlan.status,'READY');
 const reviewedVersion=Number((await pool.query("SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type='products' AND entity_id=$2",[businessId,productId])).rows[0].version);
 await confirmed('product.save',{id:productId,data:{...productData,priceMinor:660}},{[`products:${productId}`]:reviewedVersion});
 const staleApply=(await applyImport({store,registry,actor:manager,planId:stalePlan.id})).plan;
 assert.equal(staleApply.status,'PARTIAL');
 const staleStep=staleApply.steps.find(step=>step.rowNumber===2);
 assert.equal(staleStep.status,'FAILED');assert.equal(staleStep.error,'VERSION_CONFLICT');
 assert.equal(Number((await pool.query('SELECT price_minor AS price FROM products WHERE business_id=$1 AND id=$2',[businessId,productId])).rows[0].price),660,'the newer operator price was not silently overwritten');
});