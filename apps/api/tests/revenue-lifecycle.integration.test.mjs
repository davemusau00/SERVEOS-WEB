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
import {closeDayCommandRegistry} from '../src/close-day-commands.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('PostgreSQL revenue refunds, journals, till variance review, and close-day reconciliation',{skip:!databaseUrl,timeout:120_000},async t=>{
 const adminPool=new Pool({connectionString:databaseUrl,max:2});
 const schema=`revenue_acceptance_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:databaseUrl,max:12,options:`-c search_path=${schema},public`});
 t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end()});
 await migrate(pool);

 const store=new PostgresStore(pool),businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID();
 const actor={businessId,staffId,deviceId,permissions:['*']};
 const registry=new Map([
  ...catalogCommandRegistry,...businessTaxCommandRegistry,...outletCommandRegistry,...paymentAccountCommandRegistry,
  ...tillCommandRegistry,...posCommandRegistry,...paymentCommandRegistry,...refundCommandRegistry,...closeDayCommandRegistry,
 ]);
 await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Disposable Revenue Acceptance']);
 await pool.query("INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password) VALUES($1,$2,$3,$4,'Admin','test-hash',false)",[businessId,staffId,`revenue-${staffId}@example.invalid`,'Revenue Integration Admin']);

 const run=(name,payload,expectedVersions={},commandId=randomUUID())=>executeCommand({db:store,actor,registry,command:{commandId,name,payload,expectedVersions}});
 const confirmed=async(name,payload,expectedVersions={})=>{
  const outcome=await run(name,payload,expectedVersions);
  assert.equal(outcome.kind,'CONFIRMED',`${name}: ${JSON.stringify(outcome)}`);
  return outcome;
 };
 const entityVersion=async(type,id)=>Number((await pool.query('SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type=$2 AND entity_id=$3',[businessId,type,id])).rows[0].version);

 const locationId=randomUUID();
 await confirmed('stockLocation.save',{id:locationId,data:{name:'Revenue store',code:`REV-${locationId.slice(0,6)}`,type:'STORE'}},{[`stockLocations:${locationId}`]:0});
 const outletId=randomUUID();
 await confirmed('outlet.save',{id:outletId,data:{name:'Revenue outlet',defaultStockLocationId:locationId,archived:false},reason:'Configure revenue acceptance outlet'},{[`outlets:${outletId}`]:0,[`stockLocations:${locationId}`]:1});
 await confirmed('business.settings.save',{data:{businessName:'Disposable Revenue Acceptance',address:'Test address',contact:'',taxPin:'',footer:'Thank you',vatRateBasisPoints:1600,levyRateBasisPoints:0},reason:'Configure revenue receipt tax evidence'},{[`businessSettings:${businessId}`]:0});

 const cashAccountId=randomUUID();
 await confirmed('paymentAccount.save',{id:cashAccountId,reason:'Configure revenue test cash',data:{name:'Cash',code:`CASH-${cashAccountId.slice(0,6)}`,method:'CASH',currency:'KES',referenceRequired:false,archived:false}},{[`paymentAccounts:${cashAccountId}`]:0});
 const mpesaAccountId=randomUUID();
 await confirmed('paymentAccount.save',{id:mpesaAccountId,reason:'Configure revenue test M-Pesa',data:{name:'M-Pesa',code:`MPESA-${mpesaAccountId.slice(0,6)}`,method:'MPESA',currency:'KES',referenceRequired:true,mpesaMode:'TILL',mpesaNumber:'123456',archived:false}},{[`paymentAccounts:${mpesaAccountId}`]:0});
 const tillId=randomUUID();
 await confirmed('till.open',{id:tillId,outletId,openingFloatMinor:10_000},{[`tillSessions:${tillId}`]:0,[`outlets:${outletId}`]:1,[`tillPolicy:${businessId}`]:0});

 const productId=randomUUID();
 await confirmed('product.save',{id:productId,data:{name:'Revenue test coffee',code:`REV-${productId.slice(0,6)}`,priceMinor:2500,category:'Coffee',routeTo:'BAR',taxClassId:'A_16',portions:[{id:'regular',name:'Regular',priceMinor:2500,volume:1}]}},{[`products:${productId}`]:0});
 const createFiredSale=async name=>{
  const orderId=randomUUID();
  const opened=await confirmed('order.create',{id:orderId,name,outletId,serviceDestination:'COUNTER'},{[`orders:${orderId}`]:0,[`outlets:${outletId}`]:1,[`stockLocations:${locationId}`]:1,[`businessSettings:${businessId}`]:1});
  const itemId=randomUUID();
  const added=await confirmed('order.addItem',{orderId,itemId,productId,quantity:1,portionId:'regular'},{[`orders:${orderId}`]:opened.result.version,[`products:${productId}`]:1,[`businessSettings:${businessId}`]:1});
  const fired=await confirmed('order.fire',{orderId},{[`orders:${orderId}`]:added.result.version,[`stockLocations:${locationId}`]:1});
  return fired.result.order;
 };

 const cashSale=await createFiredSale('Refundable cash sale');
 const cashPaymentCommandId=randomUUID();
 const cashPaymentVersions={[
  `orders:${cashSale.id}`]:cashSale.version,
  [`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId),
  [`paymentAccounts:${cashAccountId}`]:1,
 };
 const cashPaymentPayload={orderId:cashSale.id,tillSessionId:tillId,accountId:cashAccountId,amountMinor:2500,cashTenderedMinor:2500};
 const cashPayment=await run('payment.record',cashPaymentPayload,cashPaymentVersions,cashPaymentCommandId);
 assert.equal(cashPayment.kind,'CONFIRMED',`cash payment: ${JSON.stringify(cashPayment)}`);
 const cashPaymentReplay=await run('payment.record',cashPaymentPayload,cashPaymentVersions,cashPaymentCommandId);
 assert.deepEqual(cashPaymentReplay,cashPayment,'lost cash payment response replays the same settlement');
 const cashPaymentId=cashPayment.result.paymentIds[0];
 const cashRefundCommands=[];
 let reviewedOrderVersion=cashPayment.result.order.version;
 for(const [index,amountMinor] of [500,1000,1000].entries()){
  const commandId=randomUUID(),payload={paymentId:cashPaymentId,tillSessionId:tillId,amountMinor,reason:`Cash refund portion ${index+1}`,operatorConfirmedReturned:true};
  const versions={[
   `payments:${cashPaymentId}`]:await entityVersion('payments',cashPaymentId),
   [`orders:${cashSale.id}`]:reviewedOrderVersion,
   [`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId),
  };
  const outcome=await run('payment.refund',payload,versions,commandId);
  assert.equal(outcome.kind,'CONFIRMED',`cash refund ${index+1}: ${JSON.stringify(outcome)}`);
  assert.equal(outcome.result.refund.data.amountMinor,amountMinor);
  cashRefundCommands.push(commandId);
  reviewedOrderVersion=await entityVersion('orders',cashSale.id);
  if(index===0){
   const replay=await run('payment.refund',payload,versions,commandId);
   assert.deepEqual(replay,outcome,'lost refund response does not duplicate a return or journal');
  }
 }
 const overRefund=await run('payment.refund',{paymentId:cashPaymentId,tillSessionId:tillId,amountMinor:1,reason:'Exceeds returned cash',operatorConfirmedReturned:true},{[`payments:${cashPaymentId}`]:await entityVersion('payments',cashPaymentId),[`orders:${cashSale.id}`]:await entityVersion('orders',cashSale.id),[`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId)});
 assert.equal(overRefund.kind,'CONFLICT');assert.equal(overRefund.error.code,'REFUND_EXCEEDS_REMAINING');
 assert.equal((await store.commandStatus(businessId,overRefund.commandId)).status,'CONFLICT','over-refund refusal is durable');

 const mpesaSale=await createFiredSale('Cashier-confirmed M-Pesa sale');
 const mpesaPayment=await confirmed('payment.record',{orderId:mpesaSale.id,tillSessionId:tillId,accountId:mpesaAccountId,amountMinor:2500,manuallyConfirmed:true,reference:'REV-TEST-RECEIPT-1',receivedAmountMinor:2500,receivedAt:new Date(Date.now()-1000).toISOString()},{[`orders:${mpesaSale.id}`]:mpesaSale.version,[`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId),[`paymentAccounts:${mpesaAccountId}`]:1});
 const mpesaPaymentId=mpesaPayment.result.paymentIds[0];
 const mpesaPartialId=randomUUID(),mpesaPartialPayload={paymentId:mpesaPaymentId,tillSessionId:tillId,amountMinor:500,reason:'Cashier confirmed partial M-Pesa return',operatorConfirmedReturned:true,manuallyConfirmed:true,externalReference:'REV-TEST-RETURN-1'};
 const mpesaPartialVersions={[
  `payments:${mpesaPaymentId}`]:await entityVersion('payments',mpesaPaymentId),
  [`orders:${mpesaSale.id}`]:mpesaPayment.result.order.version,
  [`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId),
 };
 const mpesaPartial=await run('payment.refund',mpesaPartialPayload,mpesaPartialVersions,mpesaPartialId);
 assert.equal(mpesaPartial.kind,'CONFIRMED',`external partial refund: ${JSON.stringify(mpesaPartial)}`);
 const mpesaReverseId=randomUUID(),mpesaReverse=await run('payment.reverse',{paymentId:mpesaPaymentId,tillSessionId:tillId,reason:'Reverse remaining manually confirmed M-Pesa funds',operatorConfirmedReturned:true,manuallyConfirmed:true,externalReference:'REV-TEST-RETURN-2'},{[`payments:${mpesaPaymentId}`]:await entityVersion('payments',mpesaPaymentId),[`orders:${mpesaSale.id}`]:await entityVersion('orders',mpesaSale.id),[`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId)},mpesaReverseId);
 assert.equal(mpesaReverse.kind,'CONFIRMED',`external remaining reversal: ${JSON.stringify(mpesaReverse)}`);
 assert.equal(mpesaReverse.result.refund.data.amountMinor,2000);
 assert.equal(mpesaReverse.result.refund.data.kind,'FULL_REMAINING_REVERSAL');
 assert.equal(mpesaReverse.result.refund.data.manuallyConfirmed,true);

 const refundRows=await pool.query('SELECT amount_minor,method,kind,external_reference,manually_confirmed FROM payment_refunds WHERE business_id=$1 ORDER BY occurred_at,id',[businessId]);
 assert.equal(refundRows.rows.length,5);
 assert.equal(refundRows.rows.filter(row=>row.method==='CASH').reduce((sum,row)=>sum+Number(row.amount_minor),0),2500);
 assert.equal(refundRows.rows.filter(row=>row.method==='MPESA').reduce((sum,row)=>sum+Number(row.amount_minor),0),2500);
 assert.ok(refundRows.rows.filter(row=>row.method==='MPESA').every(row=>row.manually_confirmed&&row.external_reference));
 assert.equal((await pool.query('SELECT amount_paid_minor=refunded_amount_minor AS fully_refunded FROM pos_orders WHERE business_id=$1 AND id=$2',[businessId,cashSale.id])).rows[0].fully_refunded,true);
 assert.equal((await pool.query('SELECT amount_paid_minor=refunded_amount_minor AS fully_refunded FROM pos_orders WHERE business_id=$1 AND id=$2',[businessId,mpesaSale.id])).rows[0].fully_refunded,true);

 const refundCommandIds=[...cashRefundCommands,mpesaPartialId,mpesaReverseId];
 const journalRows=await pool.query(`SELECT j.id,j.source_type,j.source_id,j.total_debit_minor,j.total_credit_minor,
  COALESCE((SELECT sum(l.debit_minor) FROM financial_journal_lines l WHERE l.business_id=j.business_id AND l.journal_id=j.id),0)::text AS debits,
  COALESCE((SELECT sum(l.credit_minor) FROM financial_journal_lines l WHERE l.business_id=j.business_id AND l.journal_id=j.id),0)::text AS credits
  FROM financial_journals j WHERE j.business_id=$1 AND j.source_command_id=ANY($2::uuid[])`,[businessId,[cashPaymentCommandId,mpesaPayment.commandId,...refundCommandIds]]);
 assert.ok(journalRows.rows.length>=7,'each payment and refund posts an accounting journal');
 assert.ok(journalRows.rows.every(row=>Number(row.total_debit_minor)===Number(row.total_credit_minor)&&Number(row.debits)===Number(row.credits)),'every linked journal balances');

 const tillCloseId=randomUUID(),closeCountedCashMinor=9999;
 const closedForReview=await confirmed('till.close',{id:tillId,countedCashMinor:closeCountedCashMinor,varianceReason:'One shilling drawer shortage confirmed'},{[`tillSessions:${tillId}`]:await entityVersion('tillSessions',tillId)});
 assert.equal(closedForReview.result.data.status,'REVIEW_REQUIRED');
 assert.equal(closedForReview.result.data.expectedCashMinor,10_000);
 assert.equal(closedForReview.result.data.varianceMinor,-1);
 const reviewedClose=await confirmed('till.reviewVariance',{id:tillId,reason:'Manager reviewed count and accepted the recorded shortage'},{[`tillSessions:${tillId}`]:closedForReview.result.version});
 assert.equal(reviewedClose.result.data.status,'CLOSED');
 const report=await confirmed('closeDay.generate',{id:tillCloseId,tillId},{[`closeDayReports:${tillCloseId}`]:0,[`tillSessions:${tillId}`]:reviewedClose.result.version});
 const reportSnapshot=report.result.data.snapshot;
 assert.equal(reportSnapshot.sales.receivedMinor,5000);
 assert.equal(reportSnapshot.sales.returnedMinor,5000);
 assert.equal(reportSnapshot.sales.netReceivedMinor,0);
 assert.equal(reportSnapshot.cash.expectedMinor,10_000);
 assert.equal(reportSnapshot.cash.countedMinor,9999);
 assert.equal(reportSnapshot.cash.varianceMinor,-1);
 assert.equal(reportSnapshot.paymentsByTender.find(row=>row.method==='MPESA').returnedMinor,2500);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM close_day_reports WHERE business_id=$1 AND till_session_id=$2',[businessId,tillId])).rows[0].count,1);
});
