import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {postCustomerCreditJournal,remainingPaymentBasis,allocationDelta} from './financial-journals.mjs';
import {documentHash} from './business-documents.mjs';
import {queueDocumentPrint} from './print-commands.mjs';
import {orderProjection} from './pos-commands.mjs';
import {requireOpenTill,tillSessionProjection} from './till-commands.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const projection=row=>{const balance=Number(row.balanceMinor),data={customerId:row.id,customerName:row.customerName,status:row.status,limitMinor:Number(row.limitMinor),balanceMinor:balance,availableMinor:Math.max(0,Number(row.limitMinor)-balance),termsDays:Number(row.termsDays),notes:row.notes,updatedBy:row.updatedBy,updatedAt:row.updatedAt.toISOString()};if(row.aging){const aging=row.aging,buckets={currentMinor:Number(aging.currentMinor??0),days1To30Minor:Number(aging.days1To30Minor??0),days31To60Minor:Number(aging.days31To60Minor??0),days61To90Minor:Number(aging.days61To90Minor??0),over90DaysMinor:Number(aging.over90DaysMinor??0)},agingTotal=Object.values(buckets).reduce((sum,value)=>sum+value,0);data.aging={...buckets,reconciled:Number.isSafeInteger(agingTotal)&&agingTotal===balance};}return {collection:'customerCreditAccounts',id:row.id,version:Number(row.version),archived:false,data}};

export async function customerCreditAccountProjections(db,businessId,ids=null){
 const {rows}=await db.query(`SELECT a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE((SELECT SUM(e.balance_delta_minor) FROM customer_credit_entries e WHERE e.business_id=a.business_id AND e.customer_id=a.customer_id),0) AS "balanceMinor",aging.buckets AS aging FROM customer_credit_accounts a JOIN business_customers c ON c.business_id=a.business_id AND c.id=a.customer_id LEFT JOIN LATERAL (SELECT jsonb_build_object('currentMinor',COALESCE(sum(open_minor) FILTER(WHERE due_at>=statement_timestamp()),0),'days1To30Minor',COALESCE(sum(open_minor) FILTER(WHERE due_at<statement_timestamp() AND due_at>=statement_timestamp()-interval '30 days'),0),'days31To60Minor',COALESCE(sum(open_minor) FILTER(WHERE due_at<statement_timestamp()-interval '30 days' AND due_at>=statement_timestamp()-interval '60 days'),0),'days61To90Minor',COALESCE(sum(open_minor) FILTER(WHERE due_at<statement_timestamp()-interval '60 days' AND due_at>=statement_timestamp()-interval '90 days'),0),'over90DaysMinor',COALESCE(sum(open_minor) FILTER(WHERE due_at<statement_timestamp()-interval '90 days'),0)) AS buckets FROM (SELECT charge.due_at,GREATEST(0,charge.amount_minor-COALESCE(reversal.amount,0)-COALESCE(allocated.amount,0)) AS open_minor FROM customer_credit_entries charge LEFT JOIN LATERAL (SELECT sum(r.amount_minor) AS amount FROM customer_credit_entries r WHERE r.business_id=charge.business_id AND r.reverses_entry_id=charge.id AND r.kind='CHARGE_REVERSAL') reversal ON TRUE LEFT JOIN LATERAL (SELECT sum((allocation->>'amountMinor')::numeric) AS amount FROM customer_credit_entries movement CROSS JOIN LATERAL jsonb_array_elements(movement.allocations) allocation WHERE movement.business_id=charge.business_id AND movement.customer_id=charge.customer_id AND movement.kind IN ('SETTLEMENT','WRITE_OFF') AND NOT EXISTS(SELECT 1 FROM customer_credit_entries undo WHERE undo.business_id=movement.business_id AND undo.reverses_entry_id=movement.id) AND allocation->>'chargeId'=charge.id::text AND allocation->>'amountMinor' ~ '^[0-9]+$') allocated ON TRUE WHERE charge.business_id=a.business_id AND charge.customer_id=a.customer_id AND charge.kind='CHARGE') open_charges) aging ON TRUE WHERE a.business_id=$1 AND ($2::uuid[] IS NULL OR a.customer_id=ANY($2)) ORDER BY lower(c.name),c.id`,[businessId,ids]);
 return rows.map(projection);
}

export async function customerCreditEntryProjections(db,businessId,ids=null){
 const {rows}=await db.query(`WITH running AS (SELECT e.id,e.customer_id AS "customerId",c.name AS "customerName",e.kind,e.balance_delta_minor AS "balanceDeltaMinor",e.amount_minor AS "amountMinor",e.order_id AS "orderId",e.due_at AS "dueAt",e.payment_method AS "paymentMethod",e.payment_account_id AS "paymentAccountId",e.payment_account_snapshot AS "paymentAccountSnapshot",e.till_session_id AS "tillSessionId",e.received_at AS "receivedAt",e.reference,e.allocations,e.reverses_entry_id AS "reversesEntryId",e.reason,e.actor_id AS "actorId",e.device_id AS "deviceId",e.source_command_id AS "sourceCommandId",e.occurred_at AS "occurredAt",SUM(e.balance_delta_minor) OVER(PARTITION BY e.customer_id ORDER BY e.occurred_at,e.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "balanceAfterMinor" FROM customer_credit_entries e JOIN business_customers c ON c.business_id=e.business_id AND c.id=e.customer_id WHERE e.business_id=$1), recent AS (SELECT * FROM running WHERE $2::uuid[] IS NOT NULL AND id=ANY($2) OR $2::uuid[] IS NULL ORDER BY "occurredAt" DESC,id DESC LIMIT CASE WHEN $2::uuid[] IS NULL THEN 1000 ELSE 1001 END) SELECT * FROM recent ORDER BY "occurredAt",id`,[businessId,ids]);
 return rows.map(row=>({collection:'customerCreditEntries',id:row.id,version:1,archived:false,data:{...row,balanceDeltaMinor:Number(row.balanceDeltaMinor),amountMinor:Number(row.amountMinor),balanceAfterMinor:Number(row.balanceAfterMinor),dueAt:row.dueAt?.toISOString()??null,receivedAt:row.receivedAt?.toISOString()??null,occurredAt:row.occurredAt.toISOString()}}));
}

const configure=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.manage'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer credit management permission is required.');
 const p=command.payload;
 if(!uuid(p.customerId)||p.id!==p.customerId)fail('Choose a valid customer account.');
 if(!Number.isSafeInteger(p.limitMinor)||p.limitMinor<0||p.limitMinor>9_000_000_000_000)fail('Credit limit must be a non-negative KES amount in minor units.');
 if(!Number.isSafeInteger(p.termsDays)||p.termsDays<0||p.termsDays>365)fail('Credit terms must be between 0 and 365 days.');
 if(!['ACTIVE','HOLD','CLOSED'].includes(p.status))fail('Credit status must be Active, Hold or Closed.');
 if(typeof p.notes!=='string'||p.notes.length>1000||/[\u0000-\u001f\u007f]/u.test(p.notes))fail('Credit account notes are invalid or too long.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.reason))fail('Enter a change reason between 3 and 500 characters.');
 const expected=p.expectedVersions?.find(row=>row?.collection==='customerCreditAccounts'&&row.id===p.customerId)?.version;
 if(!Number.isSafeInteger(expected)||expected<0)fail('Review the current customer credit account version before saving.');
 const {rows:customerRows}=await tx.client.query(`SELECT name,archived_at AS "archivedAt" FROM business_customers WHERE business_id=$1 AND id=$2 FOR SHARE`,[actor.businessId,p.customerId]);
 if(!customerRows.length||customerRows[0].archivedAt)throw new ApiProblem(409,'RESOURCE_CONFLICT','The customer is missing or archived. Refresh the customer list.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer-credit:${actor.businessId}:${p.customerId}`]);
 const version=await tx.bumpEntityVersion(actor.businessId,'customerCreditAccounts',p.customerId,expected);
 const {rows:priorRows}=await tx.client.query(`SELECT a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE((SELECT SUM(e.balance_delta_minor) FROM customer_credit_entries e WHERE e.business_id=a.business_id AND e.customer_id=a.customer_id),0) AS "balanceMinor" FROM customer_credit_accounts a JOIN business_customers c ON c.business_id=a.business_id AND c.id=a.customer_id WHERE a.business_id=$1 AND a.customer_id=$2 FOR UPDATE OF a`,[actor.businessId,p.customerId]);
 const prior=priorRows[0]??null;
 if(expected===0&&prior)throw new ApiProblem(409,'VERSION_CONFLICT','This customer credit account already exists. Refresh the account list.');
 if(expected>0&&!prior)throw new ApiProblem(409,'RESOURCE_CONFLICT','This customer credit account is no longer available. Refresh the account list.');
 const balance=Number(prior?.balanceMinor??0);
 if(!Number.isSafeInteger(balance))throw new ApiProblem(409,'CREDIT_BALANCE_RECONCILIATION_REQUIRED','Customer credit balance exceeds the supported range. Reconcile it before changing terms.');
 if(p.status==='CLOSED'&&balance!==0)throw new ApiProblem(409,'CREDIT_BALANCE_OPEN','Settle or write off the customer balance before closing credit.');
 await tx.client.query(`INSERT INTO customer_credit_accounts(business_id,customer_id,status,credit_limit_minor,terms_days,notes,version,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(business_id,customer_id) DO UPDATE SET status=EXCLUDED.status,credit_limit_minor=EXCLUDED.credit_limit_minor,terms_days=EXCLUDED.terms_days,notes=EXCLUDED.notes,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,p.customerId,p.status,p.limitMinor,p.termsDays,p.notes.trim(),version,actor.staffId,at]);
 const value=(await customerCreditAccountProjections(tx.client,actor.businessId,[p.customerId]))[0];
 await tx.client.query(`INSERT INTO customer_credit_account_events(business_id,id,customer_id,version,event_type,reason,before_state,after_state,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,'TERMS_SAVED',$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,[actor.businessId,randomUUID(),p.customerId,version,p.reason.trim(),prior?JSON.stringify(projection(prior).data):null,JSON.stringify(value.data),command.commandId,actor.staffId,actor.deviceId,at]);
 return {value,records:[value]};
};

const charge=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.charge'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer credit charging permission is required.');
 const p=command.payload;if(!uuid(p.id)||!uuid(p.orderId)||!uuid(p.customerId))fail('Choose a named customer and current order.');
 const reviewedOrder=command.expectedVersions[`orders:${p.orderId}`],reviewedAccount=command.expectedVersions[`customerCreditAccounts:${p.customerId}`];
 if(!Number.isSafeInteger(reviewedOrder)||reviewedOrder<1||!Number.isSafeInteger(reviewedAccount)||reviewedAccount<1)fail('Review the current order and credit-account revisions before charging.');
 const reviewedCustomer=command.expectedVersions[`customers:${p.customerId}`];if(!Number.isSafeInteger(reviewedCustomer)||reviewedCustomer<1)fail('Review the current named-customer revision before charging.');
 if(p.reason!==undefined&&(typeof p.reason!=='string'||p.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.reason)))fail('Charge notes are invalid or too long.');
 const {rows:customerRows}=await tx.client.query(`SELECT name,version FROM business_customers WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,p.customerId]);
 if(!customerRows.length||Number(customerRows[0].version)!==reviewedCustomer)throw new ApiProblem(409,'VERSION_CONFLICT','The named customer changed or is archived. Refresh before charging.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer-credit:${actor.businessId}:${p.customerId}`]);
 const {rows:accountRows}=await tx.client.query(`SELECT status,credit_limit_minor AS "limitMinor",terms_days AS "termsDays",version FROM customer_credit_accounts WHERE business_id=$1 AND customer_id=$2 FOR UPDATE`,[actor.businessId,p.customerId]);
 if(!accountRows.length)throw new ApiProblem(409,'CREDIT_ACCOUNT_REQUIRED','Configure an active customer credit account before charging.');
 const account=accountRows[0];if(account.status!=='ACTIVE')throw new ApiProblem(409,'CREDIT_ACCOUNT_INACTIVE','The customer credit account is not active.');
 if(Number(account.version)!==reviewedAccount)throw new ApiProblem(409,'VERSION_CONFLICT','Customer credit terms changed. Review the account before charging.');
 const {rows:orderRows}=await tx.client.query(`SELECT state,version,grand_total_minor AS "grandTotalMinor",amount_paid_minor AS "amountPaidMinor",amount_credited_minor AS "amountCreditedMinor",customer_id AS "customerId" FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.orderId]);
 if(!orderRows.length||orderRows[0].customerId!==p.customerId)throw new ApiProblem(409,'ORDER_CUSTOMER_CHANGED','The order is not assigned to this customer. Refresh and review it.');
 const orderRow=orderRows[0];if(Number(orderRow.version)!==reviewedOrder)throw new ApiProblem(409,'VERSION_CONFLICT','The order changed. Refresh and review it before charging.');
 if(orderRow.state!=='FIRED')throw new ApiProblem(409,'ORDER_NOT_READY_FOR_CREDIT','Fire the order before charging it to a customer account.');
 const order=await orderProjection(tx.client,actor.businessId,p.orderId);
 if(order.data.items.some(line=>line.state==='DRAFT'))throw new ApiProblem(409,'ORDER_HAS_HELD_LINES','Fire or remove held lines before charging the account.');
 if(!Number.isSafeInteger(p.amountMinor)||p.amountMinor<=0)fail('Enter the exact positive outstanding balance in minor units.');
 const outstanding=order.data.grandTotalMinor-order.data.amountPaidMinor-order.data.amountCreditedMinor;
 if(p.amountMinor!==outstanding)throw new ApiProblem(409,'CREDIT_AMOUNT_CHANGED','Credit charge must settle the exact reviewed order balance. Refresh the order and review the full balance.');
 const {rows:balanceRows}=await tx.client.query(`SELECT COALESCE(SUM(balance_delta_minor),0) AS balance FROM customer_credit_entries WHERE business_id=$1 AND customer_id=$2`,[actor.businessId,p.customerId]);
 const balance=Number(balanceRows[0].balance),limit=Number(account.limitMinor);
 if(!Number.isSafeInteger(balance)||!Number.isSafeInteger(limit)||!Number.isSafeInteger(balance+p.amountMinor))throw new ApiProblem(409,'CREDIT_BALANCE_RECONCILIATION_REQUIRED','Customer credit balance or limit exceeds supported amounts. Reconcile before charging.');
 const overLimit=balance+p.amountMinor>limit;
 if(overLimit){
  if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.override_limit'))throw new ApiProblem(409,'CREDIT_LIMIT_EXCEEDED','The charge exceeds the configured credit limit. A manager with credit.override_limit must review it.');
  if(p.limitOverrideConfirmed!==true||typeof p.limitOverrideReason!=='string'||p.limitOverrideReason.trim().length<3||p.limitOverrideReason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.limitOverrideReason))fail('Manager override requires an explicit confirmation and a reason from 3 to 500 characters.');
 }else if(p.limitOverrideConfirmed!==undefined||p.limitOverrideReason!==undefined)fail('Remove the manager override fields when the charge fits the configured limit.');
 const {rows:priorCharges}=await tx.client.query(`SELECT 1 FROM customer_credit_entries WHERE business_id=$1 AND order_id=$2 AND kind='CHARGE' LIMIT 1`,[actor.businessId,p.orderId]);
 if(priorCharges.length)throw new ApiProblem(409,'ORDER_ALREADY_CREDITED','This order already has a customer credit charge. Reconcile the original entry before continuing.');
 const accountVersion=await tx.bumpEntityVersion(actor.businessId,'customerCreditAccounts',p.customerId,reviewedAccount);
 await tx.client.query(`UPDATE customer_credit_accounts SET version=$3,updated_by=$4,updated_at=$5 WHERE business_id=$1 AND customer_id=$2`,[actor.businessId,p.customerId,accountVersion,actor.staffId,at]);
 const orderVersion=await tx.bumpEntityVersion(actor.businessId,'orders',p.orderId,reviewedOrder);
 const paidBasis=await remainingPaymentBasis(tx.client,actor.businessId,p.orderId,order.data);
 const allocation=allocationDelta(paidBasis.remaining,order.data.amountCreditedMinor,p.amountMinor);
 const dueAt=new Date(at.getTime()+Number(account.termsDays)*24*60*60_000);
 const entry={id:p.id,customerId:p.customerId,kind:'CHARGE',amountMinor:p.amountMinor,balanceDeltaMinor:p.amountMinor,orderId:p.orderId,dueAt:dueAt.toISOString(),paymentMethod:null,reference:String(order.data.name||p.orderId).slice(0,160),allocations:[],reversesEntryId:null,reason:String(p.reason||'').trim(),actorId:actor.staffId,deviceId:actor.deviceId,sourceCommandId:command.commandId,occurredAt:at.toISOString()};
 await tx.client.query(`INSERT INTO customer_credit_entries(business_id,id,customer_id,kind,balance_delta_minor,amount_minor,order_id,due_at,reference,allocations,reason,actor_id,device_id,source_command_id,occurred_at) VALUES($1,$2,$3,'CHARGE',$4,$5,$6,$7,$8,'[]'::jsonb,$9,$10,$11,$12,$13)`,[actor.businessId,entry.id,entry.customerId,entry.balanceDeltaMinor,entry.amountMinor,entry.orderId,dueAt,entry.reference,entry.reason,actor.staffId,actor.deviceId,command.commandId,at]);
 const lines=[{code:'ASSET_CUSTOMER_AR',debitMinor:p.amountMinor,creditMinor:0},...Object.entries({REVENUE_SALES:allocation.netMinor,LIABILITY_VAT:allocation.vatMinor,LIABILITY_LEVY:allocation.levyMinor}).filter(([,minor])=>minor>0).map(([code,minor])=>({code,debitMinor:0,creditMinor:minor}))];
 const journal=await postCustomerCreditJournal(tx,{actor,command,at,entry,sourceType:'CUSTOMER_CREDIT_CHARGE',lines,basisSnapshot:{policyVersion:1,rounding:'CUMULATIVE_REMAINING_TENDER_BASIS',orderId:p.orderId,orderVersion,customerId:p.customerId,paidBeforeMinor:order.data.amountPaidMinor,creditedBeforeMinor:order.data.amountCreditedMinor,amountMinor:p.amountMinor,allocation,accountVersion,creditLimitMinor:limit,balanceBeforeMinor:balance,balanceAfterMinor:balance+p.amountMinor,limitOverride:overLimit?{approvedBy:actor.staffId,reason:p.limitOverrideReason.trim()}:null}});
 const credited=order.data.amountCreditedMinor+p.amountMinor,complete=order.data.amountPaidMinor+credited===order.data.grandTotalMinor;
 await tx.client.query(`UPDATE pos_orders SET amount_credited_minor=$3,state=$4,version=$5,updated_at=$6 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId,credited,complete?'COMPLETED':'FIRED',orderVersion,at]);
 await tx.client.query(`INSERT INTO pos_order_events(business_id,id,order_id,order_version,event_type,event_data,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),p.orderId,orderVersion,command.name,JSON.stringify({customerId:p.customerId,creditEntryId:entry.id,amountMinor:p.amountMinor,completed:complete}),command.commandId,actor.staffId,actor.deviceId,at]);
 const accountRecord=(await customerCreditAccountProjections(tx.client,actor.businessId,[p.customerId]))[0];
 const entryRecord=(await customerCreditEntryProjections(tx.client,actor.businessId,[entry.id]))[0];
 const updatedOrder=await orderProjection(tx.client,actor.businessId,p.orderId);
 const invoiceId=randomUUID(),documentNumber=`CR-${command.commandId}`;
 const snapshot={business:order.data.businessSnapshot,customer:{id:p.customerId,name:order.data.customerName},orderId:p.orderId,orderName:order.data.name,currency:order.data.currency,amountMinor:p.amountMinor,amountPaidMinor:order.data.amountPaidMinor,amountCreditedMinor:credited,orderBalanceAfterMinor:0,accountBalanceBeforeMinor:balance,accountBalanceAfterMinor:balance+p.amountMinor,dueAt:dueAt.toISOString(),termsDays:Number(account.termsDays),reason:entry.reason,items:order.data.items.filter(line=>line.state!=='VOIDED').map(line=>({id:line.id,name:line.name,quantity:line.quantity,unitPriceMinor:line.unitPriceMinor,lineTotalMinor:line.lineTotalMinor,netMinor:line.netMinor,vatMinor:line.vatMinor,levyMinor:line.levyMinor})),taxes:{netMinor:allocation.netMinor,vatMinor:allocation.vatMinor,levyMinor:allocation.levyMinor},issuedBy:actor.staffId,issuedAt:at.toISOString(),footer:order.data.businessSnapshot.footer};
 const hash=documentHash(snapshot);
 await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'CUSTOMER_CREDIT_INVOICE',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,invoiceId,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
 const document={collection:'businessDocuments',id:invoiceId,version:1,archived:false,data:{id:invoiceId,type:'CUSTOMER_CREDIT_INVOICE',documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}};
 const printJob=await queueDocumentPrint(tx,{businessId:actor.businessId,documentId:invoiceId,printerRole:'RECEIPT',staffId:actor.staffId,at});
 const value={entry:entryRecord,order:updatedOrder,invoice:document};
 return {value,records:[accountRecord,entryRecord,updatedOrder,journal,document,printJob]};
};

const fifoAllocations=(rows,customerId,amount)=>{
 const entries=rows.filter(row=>row.customer_id===customerId),reversed=new Set(entries.filter(row=>row.reverses_entry_id).map(row=>row.reverses_entry_id));
 const charges=entries.filter(row=>row.kind==='CHARGE').sort((a,b)=>a.occurred_at-b.occurred_at||a.id.localeCompare(b.id));
 let remaining=amount;const allocations=[];
 for(const charge of charges){
  if(remaining<=0)break;
  const chargeReversed=entries.some(row=>row.reverses_entry_id===charge.id);
  const allocated=entries.filter(row=>['SETTLEMENT','WRITE_OFF'].includes(row.kind)&&!reversed.has(row.id)).reduce((sum,row)=>sum+(Array.isArray(row.allocations)?row.allocations.filter(item=>item.chargeId===charge.id).reduce((n,item)=>n+Number(item.amountMinor||0),0):0),0);
  const available=Math.max(0,Number(charge.amount_minor)-(chargeReversed?Number(charge.amount_minor):0)-allocated);
  if(!Number.isSafeInteger(available))throw new ApiProblem(409,'CREDIT_ALLOCATION_RECONCILIATION_REQUIRED','Customer credit allocations require reconciliation before settlement.');
  const take=Math.min(available,remaining);if(take){allocations.push({chargeId:charge.id,orderId:charge.order_id,amountMinor:take});remaining-=take;}
 }
 if(remaining!==0)throw new ApiProblem(409,'CREDIT_ALLOCATION_RECONCILIATION_REQUIRED','Customer credit balance cannot be allocated to original charges. Reconcile before settlement.');
 return allocations;
};

const settle=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.settle'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer credit settlement permission is required.');
 const p=command.payload;if(!uuid(p.id)||!uuid(p.customerId)||!uuid(p.accountId))fail('Choose a customer, payment account and settlement identity.');
 const accountVersion=command.expectedVersions[`customerCreditAccounts:${p.customerId}`],tenderVersion=command.expectedVersions[`paymentAccounts:${p.accountId}`];
 if(!Number.isSafeInteger(accountVersion)||accountVersion<1||!Number.isSafeInteger(tenderVersion)||tenderVersion<1)fail('Review the current customer credit account and payment account revisions.');
 if(!Number.isSafeInteger(p.amountMinor)||p.amountMinor<=0)fail('Settlement must be a positive amount in minor currency units.');
 if(p.reason!==undefined&&(typeof p.reason!=='string'||p.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.reason)))fail('Settlement notes are invalid or too long.');
 const note=typeof p.reason==='string'?p.reason.trim():'';
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer-credit:${actor.businessId}:${p.customerId}`]);
 const {rows:accountRows}=await tx.client.query(`SELECT status,version FROM customer_credit_accounts WHERE business_id=$1 AND customer_id=$2 FOR UPDATE`,[actor.businessId,p.customerId]);
 if(!accountRows.length||Number(accountRows[0].version)!==accountVersion)throw new ApiProblem(409,'VERSION_CONFLICT','Customer credit account changed. Refresh its balance before settlement.');
 if(accountRows[0].status==='CLOSED')throw new ApiProblem(409,'CREDIT_ACCOUNT_CLOSED','A closed customer credit account cannot receive a settlement.');
 const {rows:tenderRows}=await tx.client.query(`SELECT id,name,code,method,currency,reference_required AS "referenceRequired",mpesa_mode AS "mpesaMode",mpesa_number AS "mpesaNumber",mpesa_account_reference AS "mpesaAccountReference",version FROM payment_accounts WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,p.accountId]);
 const tender=tenderRows[0];if(!tender||!['CASH','MPESA','CARD'].includes(tender.method)||tender.currency!=='KES'||Number(tender.version)!==tenderVersion)throw new ApiProblem(409,'PAYMENT_ACCOUNT_CHANGED','Review an active KES cash, card or M-Pesa account.');
 if(tender.method==='MPESA'&&!actor.permissions.includes('*')&&!actor.permissions.includes('mpesa.record'))throw new ApiProblem(403,'PERMISSION_DENIED','M-Pesa recording permission is required.');
 let till=null,reference=null,normalized=null,receivedAt=null;
 if(tender.method==='CASH'){
  if(p.cashReceivedConfirmed!==true)fail('Confirm that the exact cash settlement was physically received.');
  if(p.reference!==undefined||p.manuallyConfirmed===true||p.receivedAmountMinor!==undefined||p.receivedAt!==undefined)fail('Cash settlement cannot include external payment evidence.');
  if(!uuid(p.tillSessionId))fail('Choose the open till receiving this cash.');
  till=await requireOpenTill(tx,actor,p.tillSessionId,command.expectedVersions[`tillSessions:${p.tillSessionId}`]);
 }else{
  if(p.manuallyConfirmed!==true)fail('The cashier must manually verify that the external funds were received.');
  reference=typeof p.reference==='string'?p.reference.trim():'';
  if(!reference||reference.length>160||tender.referenceRequired&&!reference)fail('Enter the external payment approval or M-Pesa reference.');
  normalized=reference.toUpperCase();
  if(tender.method==='MPESA'&&!/^[A-Z0-9]{6,20}$/.test(normalized))fail('Enter a valid M-Pesa transaction code.');
  if(!Number.isSafeInteger(p.receivedAmountMinor)||p.receivedAmountMinor!==p.amountMinor)throw new ApiProblem(409,'CREDIT_RECEIPT_AMOUNT_MISMATCH','The confirmed external receipt must equal this settlement amount.');
  if(typeof p.receivedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(p.receivedAt)||!Number.isFinite(Date.parse(p.receivedAt))||Date.parse(p.receivedAt)>at.getTime()+300000)fail('Record the actual external receipt timestamp with its timezone.');
  receivedAt=new Date(p.receivedAt);
  await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`external-payment:${actor.businessId}:${tender.method}:${normalized}`]);
  const duplicate=await tx.client.query(`SELECT 1 FROM order_payments WHERE business_id=$1 AND method=$2 AND normalized_reference=$3 UNION ALL SELECT 1 FROM customer_credit_entries WHERE business_id=$1 AND payment_method=$2 AND normalized_reference=$3 LIMIT 1`,[actor.businessId,tender.method,normalized]);
  if(duplicate.rows.length)throw new ApiProblem(409,'PAYMENT_REFERENCE_DUPLICATE','This payment reference is already recorded. Reconcile the original receipt before continuing.');
 }
 const balanceRows=await tx.client.query(`SELECT COALESCE(sum(balance_delta_minor),0) AS balance FROM customer_credit_entries WHERE business_id=$1 AND customer_id=$2`,[actor.businessId,p.customerId]);
 const balance=Number(balanceRows.rows[0].balance);if(!Number.isSafeInteger(balance)||p.amountMinor>balance)throw new ApiProblem(409,'CREDIT_SETTLEMENT_EXCEEDS_BALANCE','Settlement cannot exceed the outstanding customer credit balance.');
 const ledgerRows=await tx.client.query(`SELECT id,kind,amount_minor,reverses_entry_id,order_id,allocations,occurred_at,customer_id FROM customer_credit_entries WHERE business_id=$1 AND customer_id=$2 ORDER BY occurred_at,id`,[actor.businessId,p.customerId]);
 const allocations=fifoAllocations(ledgerRows.rows,p.customerId,p.amountMinor);
 if(till){
  const drawer=await tx.client.query('SELECT COALESCE(sum(amount_delta_minor),0) AS delta FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[actor.businessId,till.id]);
  const after=Number(till.openingFloatMinor)+Number(drawer.rows[0].delta)+p.amountMinor;if(!Number.isSafeInteger(after)||after<0)throw new ApiProblem(409,'DRAWER_AMOUNT_LIMIT','Cash settlement exceeds the supported drawer balance.');
 }
 const accountNext=await tx.bumpEntityVersion(actor.businessId,'customerCreditAccounts',p.customerId,accountVersion);
 await tx.client.query(`UPDATE customer_credit_accounts SET version=$3,updated_by=$4,updated_at=$5 WHERE business_id=$1 AND customer_id=$2`,[actor.businessId,p.customerId,accountNext,actor.staffId,at]);
 const entry={id:p.id,customerId:p.customerId,kind:'SETTLEMENT',amountMinor:p.amountMinor,balanceDeltaMinor:-p.amountMinor,paymentMethod:tender.method,paymentAccountId:tender.id,paymentAccountSnapshot:{...tender,version:Number(tender.version)},tillSessionId:till?.id??null,receivedAt:receivedAt?.toISOString()??null,normalizedReference:normalized,reference:reference??'',allocations,reversesEntryId:null,reason:note,actorId:actor.staffId,deviceId:actor.deviceId,sourceCommandId:command.commandId,occurredAt:at.toISOString()};
 await tx.client.query(`INSERT INTO customer_credit_entries(business_id,id,customer_id,kind,balance_delta_minor,amount_minor,payment_method,payment_account_id,payment_account_snapshot,till_session_id,received_at,normalized_reference,reference,allocations,reason,actor_id,device_id,source_command_id,occurred_at) VALUES($1,$2,$3,'SETTLEMENT',$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18)`,[actor.businessId,entry.id,entry.customerId,entry.balanceDeltaMinor,entry.amountMinor,entry.paymentMethod,entry.paymentAccountId,JSON.stringify(entry.paymentAccountSnapshot),entry.tillSessionId,receivedAt,normalized,entry.reference,JSON.stringify(allocations),note,actor.staffId,actor.deviceId,command.commandId,at]);
 const lines=[{code:'ASSET_TENDER',ref:tender.id,debitMinor:p.amountMinor,creditMinor:0},{code:'ASSET_CUSTOMER_AR',debitMinor:0,creditMinor:p.amountMinor}];
 const journal=await postCustomerCreditJournal(tx,{actor,command,at,entry,sourceType:'CUSTOMER_CREDIT_SETTLEMENT',lines,basisSnapshot:{policyVersion:1,customerId:p.customerId,accountVersion:accountNext,balanceBeforeMinor:balance,balanceAfterMinor:balance-p.amountMinor,amountMinor:p.amountMinor,allocations,paymentAccount:entry.paymentAccountSnapshot,receiptOrigin:tender.method==='CASH'?'CASHIER_CASH':'CASHIER_CONFIRMED_EXTERNAL',receivedAt:entry.receivedAt}});
 const records=[(await customerCreditAccountProjections(tx.client,actor.businessId,[p.customerId]))[0],(await customerCreditEntryProjections(tx.client,actor.businessId,[p.id]))[0],journal];
 if(till){
  const cashId=randomUUID(),why=`Customer credit settlement ${p.customerId}`;
  await tx.client.query(`INSERT INTO till_cash_entries(business_id,id,till_session_id,kind,amount_delta_minor,reason,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,'CREDIT_COLLECTION',$4,$5,$6,$7,$8,$9)`,[actor.businessId,cashId,till.id,p.amountMinor,why,command.commandId,actor.staffId,actor.deviceId,at]);
  const tillVersion=await tx.bumpEntityVersion(actor.businessId,'tillSessions',till.id,Number(till.version));await tx.client.query('UPDATE till_sessions SET version=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,till.id,tillVersion]);
  records.push({collection:'cashMovements',id:cashId,version:1,archived:false,data:{id:cashId,tillSessionId:till.id,kind:'CREDIT_COLLECTION',amountDeltaMinor:p.amountMinor,reason:why,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,occurredAt:at.toISOString()}},await tillSessionProjection(tx.client,actor.businessId,till.id));
 }
 const documentId=randomUUID(),documentNumber=`CRP-${command.commandId}`;
 const snapshot={customer:{id:p.customerId,name:records[0].data.customerName},entryId:p.id,amountMinor:p.amountMinor,paymentMethod:tender.method,paymentAccount:entry.paymentAccountSnapshot,reference:reference??'',receivedAt:entry.receivedAt,recordedAt:at.toISOString(),balanceBeforeMinor:balance,balanceAfterMinor:balance-p.amountMinor,allocations,confirmedBy:actor.staffId,receiptOrigin:tender.method==='CASH'?'CASHIER_CASH':'CASHIER_CONFIRMED_EXTERNAL',statement:'This acknowledgement records funds the cashier manually confirmed as received.'};
 const hash=documentHash(snapshot);await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,documentId,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
 const document={collection:'businessDocuments',id:documentId,version:1,archived:false,data:{id:documentId,type:'CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT',documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}};
 const printJob=await queueDocumentPrint(tx,{businessId:actor.businessId,documentId,printerRole:'OFFICE',staffId:actor.staffId,at});records.push(document,printJob);
 return {value:{entry:records[1],acknowledgement:document},records};
};

const writeOff=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.write_off'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer credit write-off permission is required.');
 const p=command.payload;if(!uuid(p.id)||!uuid(p.customerId))fail('Choose a customer and a write-off identity.');
 const expected=command.expectedVersions[`customerCreditAccounts:${p.customerId}`];if(!Number.isSafeInteger(expected)||expected<1)fail('Review the current customer credit account revision.');
 if(!Number.isSafeInteger(p.amountMinor)||p.amountMinor<=0)fail('Write-off must be a positive amount in minor currency units.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.reason))fail('Write-off reason must be 3 to 500 characters.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer-credit:${actor.businessId}:${p.customerId}`]);
 const {rows:accountRows}=await tx.client.query(`SELECT status,version FROM customer_credit_accounts WHERE business_id=$1 AND customer_id=$2 FOR UPDATE`,[actor.businessId,p.customerId]);
 if(!accountRows.length||Number(accountRows[0].version)!==expected)throw new ApiProblem(409,'VERSION_CONFLICT','Customer credit terms or balance changed. Review the account before writing off debt.');
 const {rows:balanceRows}=await tx.client.query(`SELECT COALESCE(sum(balance_delta_minor),0) AS balance FROM customer_credit_entries WHERE business_id=$1 AND customer_id=$2`,[actor.businessId,p.customerId]);
 const balance=Number(balanceRows[0].balance);if(!Number.isSafeInteger(balance)||p.amountMinor>balance)throw new ApiProblem(409,'CREDIT_WRITE_OFF_EXCEEDS_BALANCE','Write-off cannot exceed the outstanding account balance.');
 const ledger=await tx.client.query(`SELECT id,kind,amount_minor,reverses_entry_id,order_id,allocations,occurred_at,customer_id FROM customer_credit_entries WHERE business_id=$1 AND customer_id=$2 ORDER BY occurred_at,id`,[actor.businessId,p.customerId]);
 const allocations=fifoAllocations(ledger.rows,p.customerId,p.amountMinor),version=await tx.bumpEntityVersion(actor.businessId,'customerCreditAccounts',p.customerId,expected);
 await tx.client.query(`UPDATE customer_credit_accounts SET version=$3,updated_by=$4,updated_at=$5 WHERE business_id=$1 AND customer_id=$2`,[actor.businessId,p.customerId,version,actor.staffId,at]);
 const {rows:customerRows}=await tx.client.query(`SELECT name FROM business_customers WHERE business_id=$1 AND id=$2`,[actor.businessId,p.customerId]);
 const entry={id:p.id,customerId:p.customerId,kind:'WRITE_OFF',amountMinor:p.amountMinor,balanceDeltaMinor:-p.amountMinor,orderId:null,dueAt:null,paymentMethod:null,reference:`WO-${command.commandId}`,allocations,reversesEntryId:null,reason:p.reason.trim(),actorId:actor.staffId,deviceId:actor.deviceId,sourceCommandId:command.commandId,occurredAt:at.toISOString()};
 await tx.client.query(`INSERT INTO customer_credit_entries(business_id,id,customer_id,kind,balance_delta_minor,amount_minor,reference,allocations,reason,actor_id,device_id,source_command_id,occurred_at) VALUES($1,$2,$3,'WRITE_OFF',$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,[actor.businessId,entry.id,entry.customerId,entry.balanceDeltaMinor,entry.amountMinor,entry.reference,JSON.stringify(allocations),entry.reason,actor.staffId,actor.deviceId,command.commandId,at]);
 const journal=await postCustomerCreditJournal(tx,{actor,command,at,entry,sourceType:'CUSTOMER_CREDIT_WRITE_OFF',lines:[{code:'EXPENSE_BAD_DEBT',debitMinor:p.amountMinor,creditMinor:0},{code:'ASSET_CUSTOMER_AR',debitMinor:0,creditMinor:p.amountMinor}],basisSnapshot:{policyVersion:1,customerId:p.customerId,accountVersion:version,balanceBeforeMinor:balance,balanceAfterMinor:balance-p.amountMinor,amountMinor:p.amountMinor,allocations,reason:entry.reason}});
 const account=(await customerCreditAccountProjections(tx.client,actor.businessId,[p.customerId]))[0],projectedEntry=(await customerCreditEntryProjections(tx.client,actor.businessId,[p.id]))[0],documentId=randomUUID(),documentNumber=`WO-${command.commandId}`;
 const snapshot={customer:{id:p.customerId,name:customerRows[0]?.name??p.customerId},entryId:p.id,amountMinor:p.amountMinor,balanceBeforeMinor:balance,balanceAfterMinor:balance-p.amountMinor,allocations,reason:entry.reason,recordedBy:actor.staffId,recordedAt:at.toISOString(),notice:'This is an accounts-receivable write-off. It is not a cash refund or customer payment.'};
 const hash=documentHash(snapshot);await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'CUSTOMER_CREDIT_WRITE_OFF_NOTICE',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,documentId,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
 const document={collection:'businessDocuments',id:documentId,version:1,archived:false,data:{id:documentId,type:'CUSTOMER_CREDIT_WRITE_OFF_NOTICE',documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},printJob=await queueDocumentPrint(tx,{businessId:actor.businessId,documentId,printerRole:'OFFICE',staffId:actor.staffId,at});
 return {value:{entry:projectedEntry,notice:document},records:[account,projectedEntry,journal,document,printJob]};
};

const reverse=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.write_off'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer credit reversal permission is required.');
 const p=command.payload;if(!uuid(p.id)||!uuid(p.entryId))fail('Choose an original customer credit entry and a reversal identity.');
 const entryVersion=command.expectedVersions[`customerCreditEntries:${p.entryId}`],accountVersion=command.expectedVersions[`customerCreditAccounts:${p.customerId}`];
 if(!Number.isSafeInteger(entryVersion)||entryVersion!==1||!Number.isSafeInteger(accountVersion)||accountVersion<1)fail('Review the original entry and current account revisions before reversal.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.reason))fail('Reversal reason must be 3 to 500 characters.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer-credit:${actor.businessId}:${p.customerId}`]);
 const {rows:accountRows}=await tx.client.query(`SELECT version FROM customer_credit_accounts WHERE business_id=$1 AND customer_id=$2 FOR UPDATE`,[actor.businessId,p.customerId]);
 if(!accountRows.length||Number(accountRows[0].version)!==accountVersion)throw new ApiProblem(409,'VERSION_CONFLICT','The customer credit account changed. Refresh before reversing an entry.');
 const {rows:entryRows}=await tx.client.query(`SELECT id,customer_id AS "customerId",kind,balance_delta_minor AS "balanceDeltaMinor",amount_minor AS "amountMinor",order_id AS "orderId",payment_method AS "paymentMethod",payment_account_snapshot AS "paymentAccountSnapshot",till_session_id AS "tillSessionId",allocations,reference,reverses_entry_id AS "reversesEntryId" FROM customer_credit_entries WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.entryId]);
 const original=entryRows[0];if(!original||original.customerId!==p.customerId||!['CHARGE','SETTLEMENT','WRITE_OFF'].includes(original.kind))throw new ApiProblem(409,'CREDIT_ENTRY_NOT_REVERSIBLE','Only an unreversed original charge, settlement or write-off can be reversed.');
 const prior=await tx.client.query(`SELECT 1 FROM customer_credit_entries WHERE business_id=$1 AND reverses_entry_id=$2 LIMIT 1`,[actor.businessId,p.entryId]);
 if(prior.rows.length)throw new ApiProblem(409,'CREDIT_ENTRY_ALREADY_REVERSED','This customer credit entry already has a reversal.');
 let till=null,externalReference=null;
 if(original.kind==='CHARGE'){
  if(p.cashReturnedConfirmed===true||p.manuallyConfirmed===true||p.externalReference!==undefined||p.tillSessionId!==undefined)fail('A customer charge reversal does not record returned money.');
  const allocated=await tx.client.query(`SELECT COALESCE(sum((allocation->>'amountMinor')::numeric),0) AS amount FROM customer_credit_entries movement CROSS JOIN LATERAL jsonb_array_elements(movement.allocations) allocation WHERE movement.business_id=$1 AND movement.customer_id=$2 AND movement.kind IN ('SETTLEMENT','WRITE_OFF') AND allocation->>'chargeId'=$3 AND allocation->>'amountMinor' ~ '^[0-9]+$' AND NOT EXISTS(SELECT 1 FROM customer_credit_entries undo WHERE undo.business_id=movement.business_id AND undo.reverses_entry_id=movement.id)`,[actor.businessId,p.customerId,p.entryId]);
  if(Number(allocated.rows[0].amount)!==0)throw new ApiProblem(409,'CREDIT_CHARGE_ALREADY_ALLOCATED','Reverse its settlement/write-off allocations before reversing the original customer credit charge.');
 }else if(original.kind==='SETTLEMENT'){
  if(original.paymentMethod==='CASH'){
   if(p.cashReturnedConfirmed!==true||!uuid(p.tillSessionId)||p.manuallyConfirmed===true||p.externalReference!==undefined)fail('Confirm the cash refund and choose the open till paying it out.');
   till=await requireOpenTill(tx,actor,p.tillSessionId,command.expectedVersions[`tillSessions:${p.tillSessionId}`]);
   const drawer=await tx.client.query('SELECT COALESCE(sum(amount_delta_minor),0) AS delta FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[actor.businessId,till.id]);
   if(Number(till.openingFloatMinor)+Number(drawer.rows[0].delta)<Number(original.amountMinor))throw new ApiProblem(409,'INSUFFICIENT_DRAWER_CASH','The cash settlement reversal exceeds recorded drawer cash.');
  }else{
   if(p.cashReturnedConfirmed===true||p.tillSessionId!==undefined)fail('External settlement returns cannot be recorded as cash drawer movement.');
   if(p.manuallyConfirmed!==true||typeof p.externalReference!=='string'||!p.externalReference.trim()||p.externalReference.trim().length>160)fail('Confirm the external settlement refund and record its return reference.');
   externalReference=p.externalReference.trim();
   const normalizedReturn=externalReference.toUpperCase();if(original.paymentMethod==='MPESA'&&!/^[A-Z0-9]{6,20}$/.test(normalizedReturn))fail('Enter a valid M-Pesa refund reference.');
   await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`external-payment-return:${actor.businessId}:${original.paymentMethod}:${normalizedReturn}`]);
   const duplicateReturn=await tx.client.query(`SELECT 1 FROM order_payments WHERE business_id=$1 AND method=$2 AND normalized_reference=$3 UNION ALL SELECT 1 FROM customer_credit_entries WHERE business_id=$1 AND payment_method=$2 AND (normalized_reference=$3 OR (kind='SETTLEMENT_REVERSAL' AND upper(reference)=$3)) LIMIT 1`,[actor.businessId,original.paymentMethod,normalizedReturn]);
   if(duplicateReturn.rows.length)throw new ApiProblem(409,'PAYMENT_RETURN_REFERENCE_DUPLICATE','This return reference is already recorded. Reconcile the original return before continuing.');
  }
 }else if(p.cashReturnedConfirmed===true||p.manuallyConfirmed===true||p.externalReference!==undefined||p.tillSessionId!==undefined)fail('A bad-debt write-off reversal does not record returned money.');
 const originalJournalResult=await tx.client.query(`SELECT id FROM financial_journals WHERE business_id=$1 AND source_type IN ('CUSTOMER_CREDIT_CHARGE','CUSTOMER_CREDIT_SETTLEMENT','CUSTOMER_CREDIT_WRITE_OFF') AND customer_credit_entry_id=$2`,[actor.businessId,p.entryId]);
 if(!originalJournalResult.rows.length)throw new ApiProblem(409,'CREDIT_JOURNAL_MISSING','The original customer credit journal is missing. Reconcile before reversing.');
 const originalJournalId=originalJournalResult.rows[0].id;
 const originalLines=await tx.client.query(`SELECT account_code AS code,account_ref AS ref,debit_minor AS debitMinor,credit_minor AS creditMinor FROM financial_journal_lines WHERE business_id=$1 AND journal_id=$2 ORDER BY line_number`,[actor.businessId,originalJournalId]);
 if(!originalLines.rows.length||originalLines.rows.length>4)throw new ApiProblem(409,'CREDIT_JOURNAL_INVALID','The original credit journal needs reconciliation before reversal.');
 const balanceRows=await tx.client.query(`SELECT COALESCE(sum(balance_delta_minor),0) AS balance FROM customer_credit_entries WHERE business_id=$1 AND customer_id=$2`,[actor.businessId,p.customerId]);
 const balance=Number(balanceRows.rows[0].balance),amount=Number(original.amountMinor),delta=Number(original.balanceDeltaMinor);
 if(!Number.isSafeInteger(balance)||!Number.isSafeInteger(amount)||amount<=0||Math.abs(delta)!==amount)throw new ApiProblem(409,'CREDIT_BALANCE_RECONCILIATION_REQUIRED','The original entry or current balance requires reconciliation.');
 let order=null,orderVersion=null;
 if(original.kind==='CHARGE'){
  orderVersion=command.expectedVersions[`orders:${original.orderId}`];if(!Number.isSafeInteger(orderVersion)||orderVersion<1)fail('Review the charged order revision before reversing its account charge.');
  const lockedOrder=await tx.client.query(`SELECT version,amount_credited_minor AS "amountCreditedMinor" FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,original.orderId]);
  if(!lockedOrder.rows.length||Number(lockedOrder.rows[0].version)!==orderVersion||Number(lockedOrder.rows[0].amountCreditedMinor)<amount)throw new ApiProblem(409,'ORDER_CREDIT_CHANGED','The original order credit no longer matches this entry. Reconcile the order first.');
  order=await orderProjection(tx.client,actor.businessId,original.orderId);
 }
 const version=await tx.bumpEntityVersion(actor.businessId,'customerCreditAccounts',p.customerId,accountVersion);
 await tx.client.query(`UPDATE customer_credit_accounts SET version=$3,updated_by=$4,updated_at=$5 WHERE business_id=$1 AND customer_id=$2`,[actor.businessId,p.customerId,version,actor.staffId,at]);
 const kind=original.kind==='CHARGE'?'CHARGE_REVERSAL':original.kind==='SETTLEMENT'?'SETTLEMENT_REVERSAL':'WRITE_OFF_REVERSAL',id=p.id,note=p.reason.trim(),balanceDelta=-delta;
 const reversePaymentMethod=original.kind==='SETTLEMENT'?original.paymentMethod:null;
 const reference=externalReference??`REV-${command.commandId}`;
 const allocations=Array.isArray(original.allocations)?original.allocations:[];
 await tx.client.query(`INSERT INTO customer_credit_entries(business_id,id,customer_id,kind,balance_delta_minor,amount_minor,payment_method,till_session_id,reference,allocations,reverses_entry_id,reason,actor_id,device_id,source_command_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16)`,[actor.businessId,id,p.customerId,kind,balanceDelta,amount,reversePaymentMethod,till?.id??null,reference,JSON.stringify(allocations),p.entryId,note,actor.staffId,actor.deviceId,command.commandId,at]);
 const journal=await postCustomerCreditJournal(tx,{actor,command,at,entry:{id,amountMinor:amount},sourceType:'CUSTOMER_CREDIT_REVERSAL',originalJournalId,lines:originalLines.rows.map(line=>({code:line.code,ref:line.ref,debitMinor:Number(line.creditMinor),creditMinor:Number(line.debitMinor)})),basisSnapshot:{policyVersion:1,customerId:p.customerId,originalEntryId:p.entryId,originalJournalId,balanceBeforeMinor:balance,balanceAfterMinor:balance+balanceDelta,amountMinor:amount,reason:note,returnedMoney:original.kind==='SETTLEMENT',externalReference}});
 const records=[(await customerCreditAccountProjections(tx.client,actor.businessId,[p.customerId]))[0],(await customerCreditEntryProjections(tx.client,actor.businessId,[id]))[0],journal];
 if(till){
  const cashId=randomUUID();await tx.client.query(`INSERT INTO till_cash_entries(business_id,id,till_session_id,kind,amount_delta_minor,reason,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,'CREDIT_COLLECTION_REVERSAL',$4,$5,$6,$7,$8,$9)`,[actor.businessId,cashId,till.id,-amount,`Reverse credit collection ${p.entryId}`,command.commandId,actor.staffId,actor.deviceId,at]);
  const tillVersion=await tx.bumpEntityVersion(actor.businessId,'tillSessions',till.id,Number(till.version));await tx.client.query('UPDATE till_sessions SET version=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,till.id,tillVersion]);
  records.push({collection:'cashMovements',id:cashId,version:1,archived:false,data:{id:cashId,tillSessionId:till.id,kind:'CREDIT_COLLECTION_REVERSAL',amountDeltaMinor:-amount,reason:`Reverse credit collection ${p.entryId}`,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,occurredAt:at.toISOString()}},await tillSessionProjection(tx.client,actor.businessId,till.id));
 }
 if(order){
  const nextCredit=Number(order.data.amountCreditedMinor)-amount;if(nextCredit<0)throw new ApiProblem(409,'ORDER_CREDIT_CHANGED','The charged order credit total is below the entry amount.');
  const nextOrderVersion=await tx.bumpEntityVersion(actor.businessId,'orders',order.id,orderVersion);
  await tx.client.query(`UPDATE pos_orders SET amount_credited_minor=$3,state='FIRED',version=$4,updated_at=$5 WHERE business_id=$1 AND id=$2`,[actor.businessId,order.id,nextCredit,nextOrderVersion,at]);
  await tx.client.query(`INSERT INTO pos_order_events(business_id,id,order_id,order_version,event_type,event_data,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),order.id,nextOrderVersion,command.name,JSON.stringify({creditEntryId:id,reversesEntryId:p.entryId,amountMinor:amount,reason:note}),command.commandId,actor.staffId,actor.deviceId,at]);
  records.push(await orderProjection(tx.client,actor.businessId,order.id));
 }
 const {rows:customerRows}=await tx.client.query(`SELECT name FROM business_customers WHERE business_id=$1 AND id=$2`,[actor.businessId,p.customerId]);
 const documentId=randomUUID(),documentNumber=`CRR-${command.commandId}`,snapshot={customer:{id:p.customerId,name:customerRows[0]?.name??p.customerId},entryId:id,originalEntryId:p.entryId,kind,amountMinor:amount,balanceBeforeMinor:balance,balanceAfterMinor:balance+balanceDelta,reason:note,externalReference,recordedBy:actor.staffId,recordedAt:at.toISOString(),notice:original.kind==='SETTLEMENT'?'This reversal records returned customer funds. Verify actual delivery independently.':'This reversal cancels prior customer-account accounting evidence.'};
 const hash=documentHash(snapshot);await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'CUSTOMER_CREDIT_REVERSAL_NOTICE',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,documentId,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
 const document={collection:'businessDocuments',id:documentId,version:1,archived:false,data:{id:documentId,type:'CUSTOMER_CREDIT_REVERSAL_NOTICE',documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},printJob=await queueDocumentPrint(tx,{businessId:actor.businessId,documentId,printerRole:'OFFICE',staffId:actor.staffId,at});records.push(document,printJob);
 return {value:{entry:records[1],notice:document},records};
};

export const customerCreditCommandRegistry=new Map([
 ['customerCredit.configure',{permission:'credit.manage',offlinePolicy:'ONLINE_ONLY',handler:configure}],
 ['credit.charge',{permission:'credit.charge',offlinePolicy:'ONLINE_ONLY',handler:charge}],
 ['credit.settle',{permission:'credit.settle',offlinePolicy:'ONLINE_ONLY',handler:settle}],
 ['credit.writeOff',{permission:'credit.write_off',offlinePolicy:'ONLINE_ONLY',handler:writeOff}],
 ['credit.reverse',{permission:'credit.write_off',offlinePolicy:'ONLINE_ONLY',handler:reverse}],
]);
