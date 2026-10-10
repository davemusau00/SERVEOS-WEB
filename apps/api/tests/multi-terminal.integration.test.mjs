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

const databaseUrl=process.env.TEST_DATABASE_URL;

test('Two independent terminals preserve version, money and stock consistency',{skip:!databaseUrl,timeout:120_000},async t=>{
 const adminPool=new Pool({connectionString:databaseUrl,max:2});
 const schema=`two_terminal_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA \"${schema}\"`);
 const pool=new Pool({connectionString:databaseUrl,max:12,options:`-c search_path=${schema},public`});
 t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS \"${schema}\" CASCADE`);await adminPool.end()});
 await migrate(pool);

 const store=new PostgresStore(pool),businessId=randomUUID();
 const manager={businessId,staffId:randomUUID(),deviceId:randomUUID(),permissions:['*']};
 const supervisor={businessId,staffId:randomUUID(),deviceId:randomUUID(),permissions:['catalog.manage']};
 const terminalA={businessId,staffId:randomUUID(),deviceId:randomUUID(),permissions:['pos.sell','order.fire','payment.record','mpesa.record','till.open','till.cashMovement']};
 const terminalB={businessId,staffId:randomUUID(),deviceId:randomUUID(),permissions:['pos.sell','order.fire','payment.record','mpesa.record','till.open','till.cashMovement','till.close']};
 const registry=new Map([...catalogCommandRegistry,...businessTaxCommandRegistry,...outletCommandRegistry,...paymentAccountCommandRegistry,...tillCommandRegistry,...posCommandRegistry,...paymentCommandRegistry]);
 await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Disposable Two-Terminal Acceptance']);
 for(const actor of [manager,supervisor,terminalA,terminalB])await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[actor.deviceId,businessId,actor.staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'x',y:'y'})]);

 const run=(actor,name,payload,expectedVersions={},commandId=randomUUID())=>executeCommand({db:store,actor,registry,command:{commandId,name,payload,expectedVersions}});
 const confirmed=async(actor,name,payload,expectedVersions={})=>{const outcome=await run(actor,name,payload,expectedVersions);assert.equal(outcome.kind,'CONFIRMED',`${name}: ${JSON.stringify(outcome)}`);return outcome};
 const entityVersion=async(collection,id)=>{const {rows}=await pool.query('SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type=$2 AND entity_id=$3',[businessId,collection,id]);return rows.length?Number(rows[0].version):0};
 const balanceVersion=async()=>Number((await pool.query('SELECT version::int AS version FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].version);
 const stockQuantity=async()=>(await pool.query('SELECT quantity::text AS quantity FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0].quantity;

 // Shared fixtures
 const locationId=randomUUID();
 await confirmed(manager,'stockLocation.save',{id:locationId,data:{name:'Main store',code:`ST-${locationId.slice(0,6)}`,type:'STORE'}},{[`stockLocations:${locationId}`]:0});
 const stockId=randomUUID();
 await confirmed(manager,'stockItem.save',{id:stockId,data:{name:'Coffee beans',code:`COF-${stockId.slice(0,6)}`,baseUnit:'kg',averageUnitCostMinor:1000,scanUnitQuantity:1,reorderLevel:0,purchasePackages:[]}},{[`stockItems:${stockId}`]:0});
 await store.transaction(tx=>tx.setInventoryBalance({businessId,stockItemId:stockId,locationId,quantity:10}));
 const productId=randomUUID();
 await confirmed(manager,'product.save',{id:productId,data:{name:'Filter coffee',code:`DRK-${productId.slice(0,6)}`,priceMinor:500,category:'Coffee',routeTo:'KITCHEN',taxClassId:'A_16',stockItemId:stockId,portions:[{id:'regular',name:'Regular',priceMinor:500,volume:0.25}],recipeIngredients:[{stockItemId:stockId,quantity:0.25,unit:'kg'}]}},{[`products:${productId}`]:0});
 await confirmed(manager,'business.settings.save',{data:{businessName:'Disposable Two-Terminal Acceptance',address:'Test address',contact:'',taxPin:'',footer:'Thank you',vatRateBasisPoints:1600,levyRateBasisPoints:0},reason:'Configure two-terminal acceptance tax policy'},{[`businessSettings:${businessId}`]:0});
 const outletId=randomUUID();
 await confirmed(manager,'outlet.save',{id:outletId,data:{name:'Main outlet',defaultStockLocationId:locationId,archived:false},reason:'Configure two-terminal acceptance outlet'},{[`outlets:${outletId}`]:0,[`stockLocations:${locationId}`]:1});
 const cashAccountId=randomUUID();
 await confirmed(manager,'paymentAccount.save',{id:cashAccountId,reason:'Configure two-terminal cash account',data:{name:'Cash',code:`CASH-${cashAccountId.slice(0,6)}`,method:'CASH',currency:'KES',referenceRequired:false,archived:false}},{[`paymentAccounts:${cashAccountId}`]:0});
 const mpesaAccountId=randomUUID();
 await confirmed(manager,'paymentAccount.save',{id:mpesaAccountId,reason:'Configure two-terminal M-Pesa account',data:{name:'M-Pesa',code:`MP-${mpesaAccountId.slice(0,6)}`,method:'MPESA',currency:'KES',referenceRequired:true,mpesaMode:'TILL',mpesaNumber:'123456',archived:false}},{[`paymentAccounts:${mpesaAccountId}`]:0});
 await confirmed(manager,'till.policy.save',{scope:'OPERATOR_DEVICE',varianceThresholdMinor:0,reason:'Each terminal operates its own till'},{[`tillPolicy:${businessId}`]:0});
 const openTill=async(actor,tillId)=>confirmed(actor,'till.open',{id:tillId,outletId,openingFloatMinor:0},{[`tillSessions:${tillId}`]:0,[`outlets:${outletId}`]:1,[`tillPolicy:${businessId}`]:await entityVersion('tillPolicy',businessId)});
 const tillAId=randomUUID(),tillBId=randomUUID();
 await openTill(terminalA,tillAId);await openTill(terminalB,tillBId);
 const newCounterSale=async(actor,label)=>{
  const orderId=randomUUID(),order=await confirmed(actor,'order.create',{id:orderId,name:label,outletId,serviceDestination:'COUNTER'},{[`orders:${orderId}`]:0,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
  const lineId=randomUUID(),draft=await confirmed(actor,'order.addItem',{orderId,itemId:lineId,productId,quantity:1,portionId:'regular'},{[`orders:${orderId}`]:order.result.version,[`products:${productId}`]:await entityVersion('products',productId),[`businessSettings:${businessId}`]:await entityVersion('businessSettings',businessId)});
  return {orderId,lineId,version:draft.result.version};
 };
 const fireOrder=(actor,sale,balanceV,stockV)=>run(actor,'order.fire',{orderId:sale.orderId,itemIds:[sale.lineId],expectedBalanceVersions:{[`${stockId}:${locationId}`]:balanceV}},{[`orders:${sale.orderId}`]:sale.version,[`stockItems:${stockId}`]:stockV,[`stockLocations:${locationId}`]:1});

 // S1 (R035): both terminals review and submit a sale of the same stock concurrently.
 const saleA=await newCounterSale(terminalA,'Terminal A sale'),saleB=await newCounterSale(terminalB,'Terminal B sale');
 const sharedBalance=await balanceVersion(),sharedStock=await entityVersion('stockItems',stockId);
 const race=await Promise.all([fireOrder(terminalA,saleA,sharedBalance,sharedStock),fireOrder(terminalB,saleB,sharedBalance,sharedStock)]);
 assert.deepEqual(race.map(row=>row.kind).sort(),['CONFIRMED','CONFLICT'],'concurrent fires of the same stock serialize through one reviewed baseline');
 const loser=race.find(row=>row.kind==='CONFLICT');
 assert.equal(loser.error.code,'VERSION_CONFLICT');
 // The stale terminal refreshes its reviewed versions and fires again; no sale is lost.
 const staleSale=loser===race[0]?saleA:saleB;
 const refreshed=await fireOrder(staleSale===saleA?terminalA:terminalB,staleSale,await balanceVersion(),await entityVersion('stockItems',stockId));
 assert.equal(refreshed.kind,'CONFIRMED','the refreshed terminal completes its sale without losing it');
 assert.equal(await stockQuantity(),'9.500000','exactly two 0.25 kg servings were deducted once each');

 // S2 (R036): two users attempt to modify the same price; exactly one wins.
 const priceRaceBase={id:productId,data:{name:'Filter coffee',code:`DRK-${productId.slice(0,6)}`,category:'Coffee',routeTo:'KITCHEN',taxClassId:'A_16',stockItemId:stockId,portions:[],recipeIngredients:[{stockItemId:stockId,quantity:0.25,unit:'kg'}]}};
 const priceRace=await Promise.all([supervisor,manager].map(async(actor,index)=>executeCommand({db:store,actor,registry,command:{commandId:randomUUID(),name:'product.save',payload:{...priceRaceBase,data:{...priceRaceBase.data,priceMinor:600+index,portions:[{id:'regular',name:'Regular',priceMinor:600+index,volume:0.25}]}},expectedVersions:{[`products:${productId}`]:await entityVersion('products',productId)}}})));
 assert.deepEqual(priceRace.map(row=>row.kind).sort(),['CONFIRMED','CONFLICT'],'two simultaneous price changes cannot both overwrite the reviewed version');
 assert.equal(priceRace.find(row=>row.kind==='CONFLICT').error.code,'VERSION_CONFLICT');
 const winnerPrice=priceRace.find(row=>row.kind==='CONFIRMED').result.data.priceMinor;
 assert.equal(Number((await pool.query('SELECT price_minor AS price FROM products WHERE business_id=$1 AND id=$2',[businessId,productId])).rows[0].price),winnerPrice);
 // S3 (R037): terminal A settles in cash; a lost response replays to the identical durable outcome.
 const orderAAfterFire=Number((await pool.query('SELECT version FROM pos_orders WHERE business_id=$1 AND id=$2',[businessId,saleA.orderId])).rows[0].version);
 const payCommand={commandId:randomUUID(),name:'payment.record',payload:{orderId:saleA.orderId,tillSessionId:tillAId,accountId:cashAccountId,amountMinor:500,cashTenderedMinor:500},expectedVersions:{[`orders:${saleA.orderId}`]:orderAAfterFire,[`tillSessions:${tillAId}`]:await entityVersion('tillSessions',tillAId),[`paymentAccounts:${cashAccountId}`]:await entityVersion('paymentAccounts',cashAccountId)}};
 const paymentFirst=await executeCommand({db:store,actor:terminalA,registry,command:payCommand});
 assert.equal(paymentFirst.kind,'CONFIRMED',`terminal A cash payment: ${JSON.stringify(paymentFirst)}`);
 const paymentReplay=await executeCommand({db:store,actor:terminalA,registry,command:payCommand});
 assert.deepEqual(paymentReplay,paymentFirst,'a replayed command returns its stored outcome without new money');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_payments WHERE business_id=$1 AND source_command_id=$2',[businessId,payCommand.commandId])).rows[0].count,1);
 assert.equal(Number((await pool.query('SELECT amount_minor FROM order_payments WHERE business_id=$1 AND source_command_id=$2',[businessId,payCommand.commandId])).rows[0].amount_minor),500);
 const issuedReceipt=(await pool.query("SELECT snapshot FROM business_documents WHERE business_id=$1 AND source_command_id=$2 AND document_type='SALES_RECEIPT'",[businessId,payCommand.commandId])).rows[0].snapshot;
 assert.equal(issuedReceipt.totalMinor,500);assert.equal(issuedReceipt.balanceMinor,0);

 // S5: a terminal cannot pay into another terminal's till.
 const saleB2=await newCounterSale(terminalB,'Terminal B second sale');
 const saleB2Fire=await fireOrder(terminalB,saleB2,await balanceVersion(),await entityVersion('stockItems',stockId));
 assert.equal(saleB2Fire.kind,'CONFIRMED',`terminal B second fire: ${JSON.stringify(saleB2Fire)}`);
 const foreignTill=await run(terminalB,'payment.record',{orderId:saleB2.orderId,tillSessionId:tillAId,accountId:cashAccountId,amountMinor:500,cashTenderedMinor:500},{[`orders:${saleB2.orderId}`]:saleB2Fire.result.order.version,[`tillSessions:${tillAId}`]:await entityVersion('tillSessions',tillAId),[`paymentAccounts:${cashAccountId}`]:await entityVersion('paymentAccounts',cashAccountId)});
 assert.ok(['REJECTED','CONFLICT'].includes(foreignTill.kind),`foreign till: ${JSON.stringify(foreignTill)}`);
 assert.equal(foreignTill.error.code,'TILL_OWNERSHIP_REQUIRED','till ownership is enforced per operator and device');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_payments WHERE business_id=$1 AND order_id=$2',[businessId,saleB2.orderId])).rows[0].count,0,'the foreign-till attempt recorded no money');

 // S4: the same external M-Pesa reference cannot be posted by two terminals.
 const orderTotal=async orderId=>Number((await pool.query('SELECT grand_total_minor AS total FROM pos_orders WHERE business_id=$1 AND id=$2',[businessId,orderId])).rows[0].total);
 const mpesaPay=async(actor,order,tillId,reference,orderVersion,amountMinor)=>run(actor,'payment.record',{orderId:order,tillSessionId:tillId,accountId:mpesaAccountId,amountMinor,manuallyConfirmed:true,reference,receivedAmountMinor:amountMinor,receivedAt:new Date(Date.now()-1000).toISOString()},{[`orders:${order}`]:orderVersion,[`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId),[`paymentAccounts:${mpesaAccountId}`]:await entityVersion('paymentAccounts',mpesaAccountId)});
 const saleB2FiredVersion=Number((await pool.query('SELECT version FROM pos_orders WHERE business_id=$1 AND id=$2',[businessId,saleB2.orderId])).rows[0].version);
 const saleB2Total=await orderTotal(saleB2.orderId);
 const mpesaPayment=await mpesaPay(terminalB,saleB2.orderId,tillBId,'MPESA-UNIQUE-001',saleB2FiredVersion,saleB2Total);
 assert.equal(mpesaPayment.kind,'CONFIRMED',`unique M-Pesa reference settles: ${JSON.stringify(mpesaPayment)}`);
 // Terminal A now attempts the exact reference terminal B already committed, on its own fresh order.
 const saleA2=await newCounterSale(terminalA,'Terminal A third sale');
 const saleA2Fire=await fireOrder(terminalA,saleA2,await balanceVersion(),await entityVersion('stockItems',stockId));
 assert.equal(saleA2Fire.kind,'CONFIRMED',`terminal A third fire: ${JSON.stringify(saleA2Fire)}`);
 const saleA2Total=await orderTotal(saleA2.orderId);
 const crossTerminalDuplicate=await mpesaPay(terminalA,saleA2.orderId,tillAId,'MPESA-UNIQUE-001',saleA2Fire.result.order.version,saleA2Total);
 assert.equal(crossTerminalDuplicate.kind,'CONFLICT');
 assert.equal(crossTerminalDuplicate.error.code,'PAYMENT_REFERENCE_DUPLICATE','a committed reference blocks a second terminal before any money moves');
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM order_payments WHERE business_id=$1 AND external_reference=$2',[businessId,'MPESA-UNIQUE-001'])).rows[0].count,1,'the duplicate attempt left no partial payment');
 const saleA2Retry=await mpesaPay(terminalA,saleA2.orderId,tillAId,'MPESA-A2-001',saleA2Fire.result.order.version,saleA2Total);
 assert.equal(saleA2Retry.kind,'CONFIRMED','a distinct reference settles the same order normally');
 assert.equal(saleA2Retry.result.order.data.state,'COMPLETED');
 // Terminal B's first sale is settled with its own unique reference.
 // Terminal B's first sale is settled with its own unique reference.
 const saleBFiredVersion=Number((await pool.query('SELECT version FROM pos_orders WHERE business_id=$1 AND id=$2',[businessId,saleB.orderId])).rows[0].version);
 const saleBPayment=await mpesaPay(terminalB,saleB.orderId,tillBId,'MPESA-B-001',saleBFiredVersion,await orderTotal(saleB.orderId));
 assert.equal(saleBPayment.kind,'CONFIRMED',`terminal B first sale settles: ${JSON.stringify(saleBPayment)}`);

 // S7: a stale terminal is told to refresh, not to resubmit blind.
 const staleEdit=await run(terminalB,'order.addItem',{orderId:saleB2.orderId,itemId:randomUUID(),productId,quantity:1,portionId:'regular'},{[`orders:${saleB2.orderId}`]:saleB2.version,[`products:${productId}`]:await entityVersion('products',productId),[`businessSettings:${businessId}`]:await entityVersion('businessSettings',businessId)});
 assert.equal(staleEdit.kind,'CONFLICT');assert.equal(staleEdit.error.code,'VERSION_CONFLICT');
 assert.match(staleEdit.error.message,/refresh/i,'the conflict instructs the operator to refresh');

 // S6: a till cannot close while unsettled orders remain, then closes reconciled.
 const saleB3=await newCounterSale(terminalB,'Terminal B fourth sale');
 const saleB3Fire=await fireOrder(terminalB,saleB3,await balanceVersion(),await entityVersion('stockItems',stockId));
 assert.equal(saleB3Fire.kind,'CONFIRMED',`terminal B fourth fire: ${JSON.stringify(saleB3Fire)}`);
 const unsettledClose=await run(terminalB,'till.close',{id:tillBId,countedCashMinor:0},{[`tillSessions:${tillBId}`]:await entityVersion('tillSessions',tillBId)});
 assert.equal(unsettledClose.kind,'CONFLICT',`unsettled close: ${JSON.stringify(unsettledClose)}`);assert.equal(unsettledClose.error.code,'UNSETTLED_ORDERS','an open order in the outlet blocks the till close');
 const saleB3Payment=await mpesaPay(terminalB,saleB3.orderId,tillBId,'MPESA-B3-001',saleB3Fire.result.order.version,await orderTotal(saleB3.orderId));
 assert.equal(saleB3Payment.kind,'CONFIRMED',`terminal B fourth sale settles: ${JSON.stringify(saleB3Payment)}`);
 const closedTill=await confirmed(terminalB,'till.close',{id:tillBId,countedCashMinor:0,varianceReason:'No cash collected on this terminal'},{[`tillSessions:${tillBId}`]:await entityVersion('tillSessions',tillBId)});
 assert.equal(closedTill.result.data.status,'CLOSED');
 assert.equal(Number(closedTill.result.data.expectedCashMinor),0,'terminal B expected cash is zero; M-Pesa never entered a drawer');
 const tillALedger=await pool.query('SELECT COALESCE(sum(amount_delta_minor),0)::int AS total FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[businessId,tillAId]);
 assert.equal(tillALedger.rows[0].total,500,'terminal A ledger holds exactly its cash sale');
 const tillBLedger=await pool.query('SELECT COALESCE(sum(amount_delta_minor),0)::int AS total FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[businessId,tillBId]);
 assert.equal(tillBLedger.rows[0].total,0,'terminal B collected no cash');
 assert.equal(await stockQuantity(),'9.500000','stock remains conserved after every terminal activity');
});