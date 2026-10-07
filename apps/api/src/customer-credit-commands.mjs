import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {postCustomerCreditJournal,remainingPaymentBasis,allocationDelta} from './financial-journals.mjs';
import {documentHash} from './business-documents.mjs';
import {queueDocumentPrint} from './print-commands.mjs';
import {orderProjection} from './pos-commands.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const columns=`a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE(SUM(e.balance_delta_minor),0) AS "balanceMinor"`;
const projection=row=>({collection:'customerCreditAccounts',id:row.id,version:Number(row.version),archived:false,data:{customerId:row.id,customerName:row.customerName,status:row.status,limitMinor:Number(row.limitMinor),balanceMinor:Number(row.balanceMinor),availableMinor:Math.max(0,Number(row.limitMinor)-Number(row.balanceMinor)),termsDays:Number(row.termsDays),notes:row.notes,updatedBy:row.updatedBy,updatedAt:row.updatedAt.toISOString()}});

export async function customerCreditAccountProjections(db,businessId,ids=null){
 const {rows}=await db.query(`SELECT a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE(SUM(e.balance_delta_minor),0) AS "balanceMinor" FROM customer_credit_accounts a JOIN business_customers c ON c.business_id=a.business_id AND c.id=a.customer_id LEFT JOIN customer_credit_entries e ON e.business_id=a.business_id AND e.customer_id=a.customer_id WHERE a.business_id=$1 AND ($2::uuid[] IS NULL OR a.customer_id=ANY($2)) GROUP BY a.business_id,a.customer_id,c.name ORDER BY lower(c.name),c.id`,[businessId,ids]);
 return rows.map(projection);
}

export async function customerCreditEntryProjections(db,businessId,ids=null){
 const {rows}=await db.query(`WITH running AS (SELECT e.id,e.customer_id AS "customerId",c.name AS "customerName",e.kind,e.balance_delta_minor AS "balanceDeltaMinor",e.amount_minor AS "amountMinor",e.order_id AS "orderId",e.due_at AS "dueAt",e.payment_method AS "paymentMethod",e.reference,e.allocations,e.reverses_entry_id AS "reversesEntryId",e.reason,e.actor_id AS "actorId",e.device_id AS "deviceId",e.source_command_id AS "sourceCommandId",e.occurred_at AS "occurredAt",SUM(e.balance_delta_minor) OVER(PARTITION BY e.customer_id ORDER BY e.occurred_at,e.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "balanceAfterMinor" FROM customer_credit_entries e JOIN business_customers c ON c.business_id=e.business_id AND c.id=e.customer_id WHERE e.business_id=$1), recent AS (SELECT * FROM running WHERE $2::uuid[] IS NOT NULL AND id=ANY($2) OR $2::uuid[] IS NULL ORDER BY "occurredAt" DESC,id DESC LIMIT CASE WHEN $2::uuid[] IS NULL THEN 1000 ELSE 1001 END) SELECT * FROM recent ORDER BY "occurredAt",id`,[businessId,ids]);
 return rows.map(row=>({collection:'customerCreditEntries',id:row.id,version:1,archived:false,data:{...row,balanceDeltaMinor:Number(row.balanceDeltaMinor),amountMinor:Number(row.amountMinor),balanceAfterMinor:Number(row.balanceAfterMinor),dueAt:row.dueAt?.toISOString()??null,occurredAt:row.occurredAt.toISOString()}}));
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
 const {rows}=await tx.client.query(`SELECT a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE((SELECT SUM(e.balance_delta_minor) FROM customer_credit_entries e WHERE e.business_id=a.business_id AND e.customer_id=a.customer_id),0) AS "balanceMinor" FROM customer_credit_accounts a JOIN business_customers c ON c.business_id=a.business_id AND c.id=a.customer_id WHERE a.business_id=$1 AND a.customer_id=$2`,[actor.businessId,p.customerId]);
 const value=projection(rows[0]);
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
 if(balance+p.amountMinor>limit)throw new ApiProblem(409,'CREDIT_LIMIT_EXCEEDED','The charge exceeds the configured credit limit. Manager limit override is not available on the API yet.');
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
 const journal=await postCustomerCreditJournal(tx,{actor,command,at,entry,sourceType:'CUSTOMER_CREDIT_CHARGE',lines,basisSnapshot:{policyVersion:1,rounding:'CUMULATIVE_REMAINING_TENDER_BASIS',orderId:p.orderId,orderVersion,customerId:p.customerId,paidBeforeMinor:order.data.amountPaidMinor,creditedBeforeMinor:order.data.amountCreditedMinor,amountMinor:p.amountMinor,allocation,accountVersion,creditLimitMinor:limit,balanceBeforeMinor:balance,balanceAfterMinor:balance+p.amountMinor}});
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

export const customerCreditCommandRegistry=new Map([
 ['customerCredit.configure',{permission:'credit.manage',offlinePolicy:'ONLINE_ONLY',handler:configure}],
 ['credit.charge',{permission:'credit.charge',offlinePolicy:'ONLINE_ONLY',handler:charge}],
]);
