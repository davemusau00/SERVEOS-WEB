import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {moneyMinor,requireOpenTill,tillSessionProjection} from './till-commands.mjs';
import {orderProjection} from './pos-commands.mjs';
import {paymentById} from './payment-commands.mjs';
import {documentHash} from './business-documents.mjs';
import {queueDocumentPrint} from './print-commands.mjs';
import {allocationDelta,originalPaymentJournal,postFinancialJournal} from './financial-journals.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const expected=(command,collection,id)=>{const value=command.expectedVersions[`${collection}:${id}`];if(!Number.isSafeInteger(value)||value<1)fail(`Reviewed ${collection} version is required.`);return value;};
const columns=`id,payment_id AS "paymentId",order_id AS "orderId",till_session_id AS "tillSessionId",amount_minor AS "amountMinor",method,kind,reason,external_reference AS "externalReference",manually_confirmed AS "manuallyConfirmed",staff_id AS "staffId",device_id AS "deviceId",occurred_at AS "occurredAt",source_command_id AS "sourceCommandId"`;
const projection=row=>({collection:'refunds',id:row.id,version:1,archived:false,data:{...row,amountMinor:Number(row.amountMinor),occurredAt:row.occurredAt.toISOString(),stockDisposition:'NO_AUTOMATIC_RESTOCK'}});
export async function refundProjections(db,businessId){const {rows}=await db.query(`SELECT ${columns} FROM payment_refunds WHERE business_id=$1 ORDER BY occurred_at DESC,id LIMIT 1000`,[businessId]);return rows.map(projection);}

const refund=reverse=>async({tx,command,actor,at})=>{
 const p=command.payload;if(!uuid(p.paymentId)||!uuid(p.tillSessionId))fail('Choose an original payment and an open till.');
 const locked=await tx.client.query('SELECT order_id AS "orderId" FROM order_payments WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.paymentId]);
 if(!locked.rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The original payment is missing.');
 const payment=await paymentById(tx.client,actor.businessId,p.paymentId);
 if(expected(command,'payments',p.paymentId)!==payment.version)throw new ApiProblem(409,'VERSION_CONFLICT','The refundable payment changed. Review its remaining amount.');
 const orderId=locked.rows[0].orderId,baseline=expected(command,'orders',orderId);
 const orderLock=await tx.client.query('SELECT version FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,orderId]);
 if(!orderLock.rows.length||Number(orderLock.rows[0].version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','The order changed. Review it before refunding.');
 const order=await orderProjection(tx.client,actor.businessId,orderId),till=await requireOpenTill(tx,actor,p.tillSessionId,expected(command,'tillSessions',p.tillSessionId));
 if(till.outletId!==order.data.outletId)throw new ApiProblem(409,'TILL_OUTLET_MISMATCH','Use an owned till in this order outlet.');
 const remaining=payment.data.amountMinor-payment.data.refundedAmountMinor,amount=reverse?remaining:moneyMinor(p.amountMinor);
 if(!Number.isSafeInteger(amount)||amount<=0||amount>remaining)throw new ApiProblem(409,'REFUND_EXCEEDS_REMAINING','The refund exceeds this payment’s remaining refundable amount.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>500)fail('Explain the refund in 3 to 500 characters.');
 if(p.operatorConfirmedReturned!==true)fail('Confirm that the money was actually returned.');
 const method=payment.data.method;let externalReference=null;
 if(method!=='CASH'){
  if(p.manuallyConfirmed!==true||typeof p.externalReference!=='string'||!p.externalReference.trim()||p.externalReference.trim().length>160)fail('Manually verify the external refund and record its return reference.');
  externalReference=p.externalReference.trim();
 }else if(p.externalReference)fail('A cash refund cannot carry an external return reference.');
 const originalJournal=await originalPaymentJournal(tx.client,actor.businessId,payment.data);
 const taxReversal=allocationDelta(originalJournal.basis,payment.data.refundedAmountMinor,amount);
 const records=[],id=randomUUID(),note=p.reason.trim();
 if(method==='CASH'){
  const entries=await tx.client.query('SELECT COALESCE(sum(amount_delta_minor),0) AS delta FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[actor.businessId,p.tillSessionId]);
  const available=Number(till.openingFloatMinor)+Number(entries.rows[0].delta);
  if(!Number.isSafeInteger(available)||available<amount)throw new ApiProblem(409,'INSUFFICIENT_DRAWER_CASH','The cash refund exceeds recorded drawer cash.');
  const entryId=randomUUID(),kind=reverse?'PAYMENT_REVERSAL':'REFUND';
  await tx.client.query(`INSERT INTO till_cash_entries(business_id,id,till_session_id,kind,amount_delta_minor,reason,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[actor.businessId,entryId,p.tillSessionId,kind,-amount,note,command.commandId,actor.staffId,actor.deviceId,at]);
  records.push({collection:'cashMovements',id:entryId,version:1,archived:false,data:{id:entryId,tillSessionId:p.tillSessionId,kind,amountDeltaMinor:-amount,reason:note,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,occurredAt:at.toISOString()}});
 }
 const saved=await tx.client.query(`INSERT INTO payment_refunds(business_id,id,payment_id,order_id,till_session_id,amount_minor,method,kind,reason,external_reference,manually_confirmed,staff_id,device_id,occurred_at,source_command_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${columns}`,[actor.businessId,id,p.paymentId,orderId,p.tillSessionId,amount,method,reverse?'FULL_REMAINING_REVERSAL':'REFUND',note,externalReference,method==='CASH'?false:true,actor.staffId,actor.deviceId,at,command.commandId]);
 records.push(await postFinancialJournal(tx,{actor,command,at,paymentId:p.paymentId,refundId:id,originalJournalId:originalJournal.id,accountId:payment.data.accountId,currency:order.data.currency,allocation:taxReversal,basisSnapshot:{policyVersion:1,rounding:'CUMULATIVE_COMBINED_TAX_THEN_VAT',originalJournalId:originalJournal.id,originalAllocation:originalJournal.basis,refundedBeforeMinor:payment.data.refundedAmountMinor,refundedAfterMinor:payment.data.refundedAmountMinor+amount,allocation:taxReversal,reason:note}}));
 const refunded=order.data.refundedAmountMinor+amount;if(!Number.isSafeInteger(refunded)||refunded>order.data.amountPaidMinor)throw new ApiProblem(409,'REFUND_RECONCILIATION_FAILED','Refund totals exceed recorded paid amounts.');
 const version=await tx.bumpEntityVersion(actor.businessId,'orders',orderId,baseline);
 await tx.client.query('UPDATE pos_orders SET refunded_amount_minor=$3,version=$4,updated_at=$5 WHERE business_id=$1 AND id=$2',[actor.businessId,orderId,refunded,version,at]);
 await tx.bumpEntityVersion(actor.businessId,'payments',p.paymentId,payment.version);
 const tillVersion=await tx.bumpEntityVersion(actor.businessId,'tillSessions',p.tillSessionId,Number(till.version));await tx.client.query('UPDATE till_sessions SET version=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,p.tillSessionId,tillVersion]);
 await tx.client.query(`INSERT INTO pos_order_events(business_id,id,order_id,order_version,event_type,event_data,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),orderId,version,command.name,JSON.stringify({refundId:id,paymentId:p.paymentId,amountMinor:amount,stockDisposition:'NO_AUTOMATIC_RESTOCK'}),command.commandId,actor.staffId,actor.deviceId,at]);
 const value=projection(saved.rows[0]);records.push(value,await paymentById(tx.client,actor.businessId,p.paymentId),await orderProjection(tx.client,actor.businessId,orderId),await tillSessionProjection(tx.client,actor.businessId,p.tillSessionId));
 const documentId=randomUUID(),documentNumber=`REF-${command.commandId}`,snapshot={business:order.data.businessSnapshot,orderId,orderName:order.data.name,paymentId:p.paymentId,refundId:id,amountReturnedMinor:amount,method,reason:note,externalReference,taxReversal,originalJournalId:originalJournal.id,stockDisposition:'NO_AUTOMATIC_RESTOCK',staffId:actor.staffId,issuedAt:at.toISOString()};
 const hash=documentHash(snapshot);await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'REFUND_RECEIPT',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,documentId,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
 records.push({collection:'businessDocuments',id:documentId,version:1,archived:false,data:{id:documentId,type:'REFUND_RECEIPT',documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},await queueDocumentPrint(tx,{businessId:actor.businessId,documentId,printerRole:'RECEIPT',staffId:actor.staffId,at}));
 return {value:{refund:value,documentId},records};
};
export const refundCommandRegistry=new Map([
 ['payment.refund',{permission:'order.refund',offlinePolicy:'ONLINE_ONLY',handler:refund(false)}],
 ['payment.reverse',{permission:'payment.reverse',offlinePolicy:'ONLINE_ONLY',handler:refund(true)}],
]);
