import {queueDocumentPrint} from './print-commands.mjs';
import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {assertUniqueExternalPaymentReference} from './external-payment-references.mjs';
import {moneyMinor,requireOpenTill,tillSessionProjection} from './till-commands.mjs';
import {orderProjection} from './pos-commands.mjs';
import {documentHash} from './business-documents.mjs';
import {allocationDelta,remainingPaymentBasis,postFinancialJournal} from './financial-journals.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const expected=(command,collection,id)=>{const value=command.expectedVersions[`${collection}:${id}`];if(!Number.isSafeInteger(value)||value<0)fail(`Reviewed ${collection} version is required.`);return value;};
const columns=`(SELECT version FROM business_entity_versions v WHERE v.business_id=order_payments.business_id AND v.entity_type='payments' AND v.entity_id=order_payments.id::text) AS version,(SELECT COALESCE(sum(r.amount_minor),0) FROM payment_refunds r WHERE r.business_id=order_payments.business_id AND r.payment_id=order_payments.id) AS "refundedAmountMinor",id,order_id AS "orderId",account_id AS "accountId",account_snapshot AS "accountSnapshot",till_session_id AS "tillSessionId",method,amount_minor AS "amountMinor",cash_tendered_minor AS "cashTenderedMinor",change_minor AS "changeMinor",external_reference AS reference,received_amount_minor AS "receivedAmountMinor",external_received_at AS "receivedAt",origin,staff_id AS "staffId",device_id AS "deviceId",recorded_at AS "recordedAt",source_command_id AS "sourceCommandId",tender_index AS "tenderIndex"`;
export const paymentProjection=row=>{
 const data={...row};for(const key of ['amountMinor','cashTenderedMinor','changeMinor','receivedAmountMinor','refundedAmountMinor'])data[key]=row[key]===null?null:Number(row[key]);
 data.recordedAt=row.recordedAt.toISOString();data.receivedAt=row.receivedAt?.toISOString()??null;
 return {collection:'payments',id:row.id,version:Number(row.version??1),archived:false,data};
};
export async function paymentProjections(db,businessId,orderId=null){const {rows}=await db.query(`SELECT ${columns} FROM order_payments WHERE business_id=$1 AND ($2::uuid IS NULL OR order_id=$2) ORDER BY recorded_at DESC,id LIMIT CASE WHEN $2::uuid IS NULL THEN 1000 ELSE NULL END`,[businessId,orderId]);return rows.map(paymentProjection);}

export async function paymentById(db,businessId,id){const {rows}=await db.query(`SELECT ${columns} FROM order_payments WHERE business_id=$1 AND id=$2`,[businessId,id]);return rows[0]?paymentProjection(rows[0]):null;}

const record=split=>async({tx,command,actor,at})=>{
 const p=command.payload;if(!uuid(p.orderId)||!uuid(p.tillSessionId))fail('Choose an order and an open till.');
 const baseline=expected(command,'orders',p.orderId);
 const locked=await tx.client.query('SELECT state,version FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.orderId]);
 if(!locked.rows.length||locked.rows[0].state!=='FIRED')throw new ApiProblem(409,'ORDER_NOT_PAYABLE','Fire all order lines before recording payment.');
 if(Number(locked.rows[0].version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','This order changed. Review its outstanding balance.');
 const order=await orderProjection(tx.client,actor.businessId,p.orderId);
 if(order.data.items.some(line=>line.state==='DRAFT'))throw new ApiProblem(409,'UNFIRED_LINES','Fire or remove all draft lines before payment.');
 if(!order.data.businessSnapshot||order.data.items.some(line=>line.state!=='VOIDED'&&!line.taxSnapshot))throw new ApiProblem(409,'RECEIPT_SNAPSHOT_REQUIRED','This order lacks the identity or tax snapshots needed for settlement. Review and rebuild its draft before payment.');
 const till=await requireOpenTill(tx,actor,p.tillSessionId,expected(command,'tillSessions',p.tillSessionId));
 if(till.outletId!==order.data.outletId)throw new ApiProblem(409,'TILL_OUTLET_MISMATCH','Use a till in this order outlet.');
 const inputs=split?p.payments:[p];
 if(!Array.isArray(inputs)||inputs.length<(split?2:1)||inputs.length>10)fail('Split payments require two to ten tenders.');
 const plans=[];let sum=0;
 for(const [index,input] of inputs.entries()){
  if(!input||typeof input!=='object'||!uuid(input.accountId))fail('Choose an active payment account for each tender.');
  const amount=moneyMinor(input.amountMinor);sum+=amount;if(!Number.isSafeInteger(sum))fail('Payment total exceeds supported amount.');
  const {rows}=await tx.client.query(`SELECT id,name,code,method,currency,reference_required AS "referenceRequired",mpesa_mode AS "mpesaMode",mpesa_number AS "mpesaNumber",mpesa_account_reference AS "mpesaAccountReference",version FROM payment_accounts WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,input.accountId]);
  const account=rows[0];if(!account)throw new ApiProblem(409,'RESOURCE_CONFLICT','A payment account is missing or archived.');
  if(expected(command,'paymentAccounts',input.accountId)!==Number(account.version))throw new ApiProblem(409,'VERSION_CONFLICT','Payment account configuration changed. Review it.');
  if(account.currency!==order.data.currency)throw new ApiProblem(409,'CURRENCY_MISMATCH','Order and tender currencies must match.');
  const plan={id:randomUUID(),index,account:{...account,version:Number(account.version)},amount,cashTendered:null,change:null,reference:null,normalized:null,receivedAmount:null,receivedAt:null,origin:'CASHIER_CASH'};
  if(account.method==='CASH'){
   plan.cashTendered=moneyMinor(input.cashTenderedMinor);if(plan.cashTendered<amount)fail('Cash tendered must cover the cash allocation.');plan.change=plan.cashTendered-amount;
   if(input.reference||input.manuallyConfirmed||input.receivedAt||input.receivedAmountMinor!==undefined)fail('Cash tenders cannot include external-payment evidence.');
  }else{
   if(input.manuallyConfirmed!==true)fail('The cashier must manually verify receipt of external funds.');
   if(input.cashTenderedMinor!==undefined)fail('External tenders cannot include cash tendered.');
   if(input.reference!==undefined&&typeof input.reference!=='string')fail('External reference must be text.');
   plan.reference=input.reference?.trim()||null;if(plan.reference&&plan.reference.length>160)fail('External reference is too long.');
   if(account.referenceRequired&&!plan.reference)fail('This account requires an external payment reference.');
   plan.normalized=plan.reference?.toUpperCase()??null;plan.origin='CASHIER_CONFIRMED_EXTERNAL';
   if(account.method==='MPESA'){
    if(!actor.permissions.includes('*')&&!actor.permissions.includes('mpesa.record'))throw new ApiProblem(403,'PERMISSION_DENIED','M-Pesa recording permission is required.');
    plan.receivedAmount=moneyMinor(input.receivedAmountMinor);
    if(plan.receivedAmount!==amount)throw new ApiProblem(409,'MPESA_DISCREPANCY_REQUIRED','The received M-Pesa amount differs from this allocation. Reconcile the discrepancy before posting.');
    if(typeof input.receivedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(input.receivedAt)||!Number.isFinite(Date.parse(input.receivedAt))||Date.parse(input.receivedAt)>at.getTime()+300000)fail('Record the actual M-Pesa received timestamp.');
    plan.receivedAt=new Date(input.receivedAt);
   }else if(input.receivedAmountMinor!==undefined||input.receivedAt!==undefined)fail('Received-amount evidence is supported by the M-Pesa workflow.');
  }
  plans.push(plan);
 }
 const outstanding=order.data.grandTotalMinor-order.data.amountPaidMinor-order.data.amountCreditedMinor-order.data.roomChargeMinor;
 if(sum>outstanding||sum<=0||split&&sum!==outstanding)throw new ApiProblem(409,'PAYMENT_BALANCE_CONFLICT','Payment cannot exceed the outstanding balance; split tender must settle it exactly.');
 const references=plans.filter(plan=>plan.normalized).map(plan=>`${plan.account.method}:${plan.normalized}`);
 if(new Set(references).size!==references.length)fail('A split tender cannot reuse an external reference.');
 const externalPlans=plans.filter(plan=>plan.normalized).sort((a,b)=>`${a.account.method}:${a.normalized}`.localeCompare(`${b.account.method}:${b.normalized}`));
 for(const plan of externalPlans)await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`external-payment:${actor.businessId}:${plan.account.method}:${plan.normalized}`]);
 for(const plan of externalPlans){
  await assertUniqueExternalPaymentReference(tx,actor.businessId,plan.account.method,plan.normalized);
 }
 const cashAmount=plans.filter(plan=>plan.account.method==='CASH').reduce((sum,plan)=>sum+plan.amount,0);
 const drawer=await tx.client.query('SELECT COALESCE(sum(amount_delta_minor),0) AS delta FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[actor.businessId,p.tillSessionId]);
 const drawerAfter=Number(till.openingFloatMinor)+Number(drawer.rows[0].delta)+cashAmount;
 if(!Number.isSafeInteger(drawerAfter)||drawerAfter<0)throw new ApiProblem(409,'DRAWER_AMOUNT_LIMIT','Drawer balance exceeds supported money amounts or needs reconciliation.');
 const records=[],allocationBasis=await remainingPaymentBasis(tx.client,actor.businessId,p.orderId,order.data);
 let allocatedPaid=0;
 for(const plan of plans){
  await tx.bumpEntityVersion(actor.businessId,'payments',plan.id,0);
  const {rows}=await tx.client.query(`INSERT INTO order_payments(business_id,id,order_id,account_id,account_snapshot,till_session_id,method,amount_minor,cash_tendered_minor,change_minor,external_reference,normalized_reference,received_amount_minor,external_received_at,origin,staff_id,device_id,recorded_at,source_command_id,tender_index) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING ${columns}`,[actor.businessId,plan.id,p.orderId,plan.account.id,JSON.stringify(plan.account),p.tillSessionId,plan.account.method,plan.amount,plan.cashTendered,plan.change,plan.reference,plan.normalized,plan.receivedAmount,plan.receivedAt,plan.origin,actor.staffId,actor.deviceId,at,command.commandId,plan.index]);
  records.push(paymentProjection(rows[0]));
  const allocation=allocationDelta(allocationBasis.remaining,order.data.amountCreditedMinor+order.data.roomChargeMinor+allocatedPaid,plan.amount);
  records.push(await postFinancialJournal(tx,{actor,command,at,paymentId:plan.id,accountId:plan.account.id,currency:order.data.currency,allocation,basisSnapshot:{policyVersion:1,rounding:'CUMULATIVE_COMBINED_TAX_THEN_VAT',orderId:p.orderId,orderVersion:baseline,...allocationBasis,paidBeforeMinor:order.data.amountPaidMinor+allocatedPaid,paidAfterMinor:order.data.amountPaidMinor+allocatedPaid+plan.amount,allocation,accountSnapshot:plan.account}}));
  allocatedPaid+=plan.amount;
  if(plan.account.method==='CASH'){
   const id=randomUUID(),reason=`Order ${p.orderId} cash payment`;
   await tx.client.query(`INSERT INTO till_cash_entries(business_id,id,till_session_id,kind,amount_delta_minor,reason,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,'SALE',$4,$5,$6,$7,$8,$9)`,[actor.businessId,id,p.tillSessionId,plan.amount,reason,command.commandId,actor.staffId,actor.deviceId,at]);
   records.push({collection:'cashMovements',id,version:1,archived:false,data:{id,tillSessionId:p.tillSessionId,kind:'SALE',amountDeltaMinor:plan.amount,reason,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,occurredAt:at.toISOString()}});
  }
 }
 const paid=order.data.amountPaidMinor+sum,complete=paid+order.data.amountCreditedMinor+order.data.roomChargeMinor===order.data.grandTotalMinor;
 const orderVersion=await tx.bumpEntityVersion(actor.businessId,'orders',p.orderId,baseline);
 await tx.client.query(`UPDATE pos_orders SET amount_paid_minor=$3,state=$4,version=$5,updated_at=$6 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId,paid,complete?'COMPLETED':'FIRED',orderVersion,at]);
 const tillVersion=await tx.bumpEntityVersion(actor.businessId,'tillSessions',p.tillSessionId,Number(till.version));await tx.client.query('UPDATE till_sessions SET version=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,p.tillSessionId,tillVersion]);
 await tx.client.query(`INSERT INTO pos_order_events(business_id,id,order_id,order_version,event_type,event_data,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),p.orderId,orderVersion,command.name,JSON.stringify({paymentIds:plans.map(plan=>plan.id),amountMinor:sum,completed:complete}),command.commandId,actor.staffId,actor.deviceId,at]);
 const value=await orderProjection(tx.client,actor.businessId,p.orderId);records.push(value,await tillSessionProjection(tx.client,actor.businessId,p.tillSessionId));
 // This document acknowledges funds received; fiscal sales documents use tax snapshots.
 const documentId=randomUUID(),documentNumber=`PAY-${command.commandId}`;
  const snapshot={business:order.data.businessSnapshot,orderId:p.orderId,orderName:order.data.name,currency:order.data.currency,amountReceivedMinor:sum,orderTotalMinor:order.data.grandTotalMinor,amountPaidMinor:paid,amountCreditedMinor:order.data.amountCreditedMinor,roomChargedMinor:order.data.roomChargeMinor,balanceMinor:order.data.grandTotalMinor-paid-order.data.amountCreditedMinor-order.data.roomChargeMinor,payments:records.filter(row=>row.collection==='payments').map(row=>row.data),issuedAt:at.toISOString()};
 const hash=documentHash(snapshot);
 await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'PAYMENT_ACKNOWLEDGEMENT',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,documentId,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
 records.push({collection:'businessDocuments',id:documentId,version:1,archived:false,data:{id:documentId,type:'PAYMENT_ACKNOWLEDGEMENT',documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}});
 let printableId=documentId;
 if(complete){
  const receiptId=randomUUID(),receiptNumber=`SALE-${command.commandId}`;
  const items=value.data.items.filter(line=>line.state!=='VOIDED');
  const taxes=items.reduce((sum,line)=>({netMinor:sum.netMinor+line.netMinor,vatMinor:sum.vatMinor+line.vatMinor,levyMinor:sum.levyMinor+line.levyMinor}),{netMinor:0,vatMinor:0,levyMinor:0});
  if(Object.values(taxes).some(amount=>!Number.isSafeInteger(amount)||amount<0)||taxes.netMinor+taxes.vatMinor+taxes.levyMinor!==value.data.grandTotalMinor)throw new ApiProblem(409,'TAX_RECONCILIATION_FAILED','Order taxes do not reconcile to the sale total.');
  const tenders=(await paymentProjections(tx.client,actor.businessId,p.orderId)).map(row=>row.data);
  const roomChargeRows=await tx.client.query(`SELECT c.id,c.folio_id AS "folioId",c.amount_minor AS "amountMinor" FROM pos_order_room_charges c WHERE c.business_id=$1 AND c.order_id=$2 AND NOT EXISTS(SELECT 1 FROM pos_order_room_charge_reversals r WHERE r.business_id=c.business_id AND r.room_charge_id=c.id) ORDER BY c.occurred_at,c.id`,[actor.businessId,p.orderId]);
  const settlementLines=[...tenders,...roomChargeRows.rows.map(row=>({id:row.id,tenderType:'ROOM_CHARGE',amountMinor:Number(row.amountMinor),reference:row.folioId})),...(value.data.amountCreditedMinor?[{id:`account-${p.orderId}`,tenderType:'CUSTOMER_ACCOUNT',amountMinor:value.data.amountCreditedMinor}]:[])];
  if(settlementLines.reduce((sum,payment)=>sum+payment.amountMinor,0)!==value.data.grandTotalMinor||value.data.amountPaidMinor!==tenders.reduce((sum,payment)=>sum+payment.amountMinor,0))throw new ApiProblem(409,'PAYMENT_RECONCILIATION_FAILED','Payment, account-credit and room-charge ledgers do not reconcile to the settled order.');
  const cashier=await tx.client.query('SELECT display_name AS name FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[actor.businessId,actor.staffId]);
  const discountTotalMinor=items.reduce((sum,line)=>sum+line.discountMinor,0);
  if(!Number.isSafeInteger(discountTotalMinor))throw new ApiProblem(409,'PRICE_RECONCILIATION_FAILED','Discount totals exceed supported amounts.');
  const roomChargedMinor=value.data.roomChargeMinor;
  // Authoritative settlement invariant at issuance: outstanding = total - recorded
  // payments - approved account credit - valid room charges. A completed order must settle to zero.
  const balanceMinor=value.data.grandTotalMinor-value.data.amountPaidMinor-value.data.amountCreditedMinor-roomChargedMinor;
  if(!Number.isSafeInteger(balanceMinor)||balanceMinor<0||paid+value.data.amountCreditedMinor+roomChargedMinor!==value.data.grandTotalMinor)throw new ApiProblem(409,'PAYMENT_RECONCILIATION_FAILED','Payment, account-credit and room-charge ledgers do not reconcile to the settled order.');
  const receiptSnapshot={discountTotalMinor,cashier:{id:actor.staffId,name:cashier.rows[0]?.name??actor.staffId},business:value.data.businessSnapshot,orderId:p.orderId,orderName:value.data.name,receiptNumber,currency:value.data.currency,refundedAmountMinor:value.data.refundedAmountMinor,items,taxes,totalMinor:value.data.grandTotalMinor,paidMinor:value.data.amountPaidMinor,creditedMinor:value.data.amountCreditedMinor,roomChargedMinor,balanceMinor,payments:settlementLines,staffId:actor.staffId,deviceId:actor.deviceId,issuedAt:at.toISOString(),footer:value.data.businessSnapshot.footer};
  const receiptHash=documentHash(receiptSnapshot);
  await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'SALES_RECEIPT',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,receiptId,receiptNumber,JSON.stringify(receiptSnapshot),receiptHash,command.commandId,actor.staffId,at]);
  records.push({collection:'businessDocuments',id:receiptId,version:1,archived:false,data:{id:receiptId,type:'SALES_RECEIPT',documentNumber:receiptNumber,layoutVersion:1,hash:receiptHash,snapshot:receiptSnapshot,issuedAt:at.toISOString()}});
  await tx.client.query('UPDATE pos_orders SET receipt_document_id=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,p.orderId,receiptId]);
  value.data.receiptDocumentId=receiptId;
  printableId=receiptId;
 }
 records.push(await queueDocumentPrint(tx,{businessId:actor.businessId,documentId:printableId,printerRole:'RECEIPT',staffId:actor.staffId,at}));
 return {value:{order:value,paymentIds:plans.map(plan=>plan.id),documentId:printableId,acknowledgementId:documentId},records};
};
export const paymentCommandRegistry=new Map([
 ['payment.record',{permission:'payment.record',offlinePolicy:'ONLINE_ONLY',handler:record(false)}],
 ['payment.split',{permission:'payment.split',offlinePolicy:'ONLINE_ONLY',handler:record(true)}],
]);
