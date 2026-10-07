import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {tillSessionProjection} from './till-commands.mjs';
import {receiptSettings} from './business-tax.mjs';
import {documentHash} from './business-documents.mjs';
import {queueDocumentPrint} from './print-commands.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const conflict=message=>{throw new ApiProblem(409,'CLOSE_DAY_RECONCILIATION_REQUIRED',message)};
const integer=value=>{const n=Number(value);if(!Number.isSafeInteger(n))conflict('A report amount exceeds the supported integer range.');return n;};
const sumList=values=>integer(values.reduce((total,value)=>total+BigInt(value),0n).toString());
const sum=(...values)=>sumList(values);
const columns=`r.id,r.till_session_id AS "tillSessionId",r.document_id AS "documentId",r.generated_by AS "generatedBy",r.generated_at AS "generatedAt",d.document_number AS "documentNumber",d.layout_version AS "layoutVersion",d.snapshot,d.snapshot_hash AS hash`;
const projection=row=>({collection:'closeDayReports',id:row.id,version:1,archived:false,data:{...row,generatedAt:row.generatedAt.toISOString()}});
export async function closeDayProjections(db,businessId){
 const {rows}=await db.query(`SELECT ${columns} FROM close_day_reports r JOIN business_documents d ON d.business_id=r.business_id AND d.id=r.document_id WHERE r.business_id=$1 ORDER BY r.generated_at DESC,r.id LIMIT 1000`,[businessId]);
 return rows.map(projection);
}

const generate=async({tx,command,actor,at})=>{
 const p=command.payload;
 if(!uuid(p.id)||!uuid(p.tillId)||command.expectedVersions[`closeDayReports:${p.id}`]!==0)throw new ApiProblem(400,'VALIDATION_FAILED','Choose a closed till and a new report identity.');
 const baseline=command.expectedVersions[`tillSessions:${p.tillId}`];
 if(!Number.isSafeInteger(baseline)||baseline<1)throw new ApiProblem(400,'VALIDATION_FAILED','The reviewed till revision is required.');
 const locked=await tx.client.query('SELECT status,version FROM till_sessions WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.tillId]);
 if(!locked.rows.length||locked.rows[0].status!=='CLOSED')throw new ApiProblem(409,'TILL_NOT_CLOSED','Close and complete variance review before generating this report.');
 if(Number(locked.rows[0].version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','The till changed. Review its final close information.');
 const exists=await tx.client.query('SELECT 1 FROM close_day_reports WHERE business_id=$1 AND till_session_id=$2',[actor.businessId,p.tillId]);
 if(exists.rows.length)throw new ApiProblem(409,'CLOSE_DAY_ALREADY_ISSUED','This till already has an immutable close-day report. Open its existing document.');
 const till=(await tillSessionProjection(tx.client,actor.businessId,p.tillId)).data;
 const business=await receiptSettings(tx.client,actor.businessId);
 if(!business)throw new ApiProblem(409,'BUSINESS_SETTINGS_REQUIRED','Configure the business receipt identity before issuing this report.');
 // Closed tills cannot accept more payments/refunds/cash movements. All report
 // money follows the recorded till identity, never a loose timestamp window.
 const tenders=await tx.client.query(`WITH entries AS (
  SELECT account_id,account_snapshot->>'name' AS name,method,amount_minor,'PAYMENT'::text AS kind FROM order_payments WHERE business_id=$1 AND till_session_id=$2
  UNION ALL
  SELECT p.account_id,p.account_snapshot->>'name',r.method,r.amount_minor,'REFUND'::text FROM payment_refunds r JOIN order_payments p ON p.business_id=r.business_id AND p.id=r.payment_id WHERE r.business_id=$1 AND r.till_session_id=$2
 ) SELECT account_id AS "accountId",name,method,count(*) FILTER(WHERE kind='PAYMENT')::text AS "paymentCount",count(*) FILTER(WHERE kind='REFUND')::text AS "refundCount",COALESCE(sum(amount_minor) FILTER(WHERE kind='PAYMENT'),0)::text AS "receivedMinor",COALESCE(sum(amount_minor) FILTER(WHERE kind='REFUND'),0)::text AS "returnedMinor" FROM entries GROUP BY account_id,name,method ORDER BY method,name,account_id`,[actor.businessId,p.tillId]);
 const paymentsByTender=tenders.rows.map(row=>({...row,paymentCount:integer(row.paymentCount),refundCount:integer(row.refundCount),receivedMinor:integer(row.receivedMinor),returnedMinor:integer(row.returnedMinor),netMinor:sum(integer(row.receivedMinor),-integer(row.returnedMinor))}));
 const received=sumList(paymentsByTender.map(row=>row.receivedMinor)),returned=sumList(paymentsByTender.map(row=>row.returnedMinor));
 const settled=await tx.client.query(`SELECT count(*) FILTER(WHERE jsonb_typeof(d.snapshot->'totalMinor') IS DISTINCT FROM 'number' OR jsonb_typeof(d.snapshot->'taxes'->'netMinor') IS DISTINCT FROM 'number' OR jsonb_typeof(d.snapshot->'taxes'->'vatMinor') IS DISTINCT FROM 'number' OR jsonb_typeof(d.snapshot->'taxes'->'levyMinor') IS DISTINCT FROM 'number')::text AS "invalidCount",count(*)::text AS "receiptCount",COALESCE(sum((d.snapshot->>'totalMinor')::numeric),0)::text AS "grossMinor",COALESCE(sum((d.snapshot->'taxes'->>'netMinor')::numeric),0)::text AS "netMinor",COALESCE(sum((d.snapshot->'taxes'->>'vatMinor')::numeric),0)::text AS "vatMinor",COALESCE(sum((d.snapshot->'taxes'->>'levyMinor')::numeric),0)::text AS "levyMinor" FROM business_documents d WHERE d.business_id=$1 AND d.document_type='SALES_RECEIPT' AND (EXISTS(SELECT 1 FROM order_payments p WHERE p.business_id=d.business_id AND p.till_session_id=$2 AND p.source_command_id=d.source_command_id) OR (d.snapshot->>'noPaymentRequired'='true' AND d.snapshot->>'tillSessionId'=$2::text))`,[actor.businessId,p.tillId]);
 const {invalidCount,...settledSales}=Object.fromEntries(Object.entries(settled.rows[0]).map(([key,value])=>[key,integer(value)]));
 if(invalidCount||Object.values(settledSales).some(value=>value<0))conflict('Settled receipts have missing or invalid original tax evidence.');
 if(sum(settledSales.netMinor,settledSales.vatMinor,settledSales.levyMinor)!==settledSales.grossMinor)conflict('Settled receipt totals and taxes do not reconcile.');
 const journals=await tx.client.query(`WITH sources AS (
  SELECT id,'PAYMENT'::text AS kind FROM order_payments WHERE business_id=$1 AND till_session_id=$2
  UNION ALL SELECT id,'REFUND'::text FROM payment_refunds WHERE business_id=$1 AND till_session_id=$2
 ) SELECT s.kind,count(DISTINCT s.id)::text AS "sourceCount",count(DISTINCT j.id)::text AS "journalCount",COALESCE(sum(l.debit_minor+l.credit_minor) FILTER(WHERE l.account_code='ASSET_TENDER'),0)::text AS "grossMinor",COALESCE(sum(l.debit_minor+l.credit_minor) FILTER(WHERE l.account_code='REVENUE_SALES'),0)::text AS "netMinor",COALESCE(sum(l.debit_minor+l.credit_minor) FILTER(WHERE l.account_code='LIABILITY_VAT'),0)::text AS "vatMinor",COALESCE(sum(l.debit_minor+l.credit_minor) FILTER(WHERE l.account_code='LIABILITY_LEVY'),0)::text AS "levyMinor" FROM sources s LEFT JOIN financial_journals j ON j.business_id=$1 AND j.source_type=s.kind AND j.source_id=s.id LEFT JOIN financial_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id GROUP BY s.kind`,[actor.businessId,p.tillId]);
 const allocations={PAYMENT:{grossMinor:0,netMinor:0,vatMinor:0,levyMinor:0},REFUND:{grossMinor:0,netMinor:0,vatMinor:0,levyMinor:0}};
 for(const row of journals.rows){
  if(row.sourceCount!==row.journalCount)conflict('Every payment and refund needs its original accounting journal before close-day reporting.');
  const amounts=Object.fromEntries(['grossMinor','netMinor','vatMinor','levyMinor'].map(key=>[key,integer(row[key])]));
  if(sum(amounts.netMinor,amounts.vatMinor,amounts.levyMinor)!==amounts.grossMinor)conflict('Tax and revenue allocations do not reconcile.');
  allocations[row.kind]=amounts;
 }
 if(allocations.PAYMENT.grossMinor!==received||allocations.REFUND.grossMinor!==returned)conflict('Tender records do not reconcile to journal totals.');
 const drawer=await tx.client.query(`SELECT COALESCE(sum(amount_delta_minor),0)::text AS delta,COALESCE(sum(amount_delta_minor) FILTER(WHERE kind='SALE'),0)::text AS sales,COALESCE(-sum(amount_delta_minor) FILTER(WHERE kind IN ('REFUND','PAYMENT_REVERSAL')),0)::text AS refunds,COALESCE(sum(amount_delta_minor) FILTER(WHERE kind='PAID_IN'),0)::text AS "paidIn",COALESCE(-sum(amount_delta_minor) FILTER(WHERE kind='PAID_OUT'),0)::text AS "paidOut" FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2`,[actor.businessId,p.tillId]);
 const cashRow=drawer.rows[0],cashReceived=sumList(paymentsByTender.filter(row=>row.method==='CASH').map(row=>row.receivedMinor)),cashReturned=sumList(paymentsByTender.filter(row=>row.method==='CASH').map(row=>row.returnedMinor));
 if(integer(cashRow.sales)!==cashReceived||integer(cashRow.refunds)!==cashReturned)conflict('Cash payment/refund records do not reconcile to the drawer ledger.');
 const expectedCash=sum(till.openingFloatMinor,integer(cashRow.delta));
 if(!Number.isSafeInteger(till.countedCashMinor)||expectedCash!==till.expectedCashMinor||sum(till.countedCashMinor,-expectedCash)!==till.varianceMinor)conflict('The recorded close count and variance do not reconcile to drawer evidence.');
 // Operational diagnostics share one statement snapshot and are explicitly as
 // observed at generation, not retroactively presented as the close timestamp.
 const observed=await tx.client.query(`SELECT statement_timestamp() AS "observedAt",(SELECT count(*)::text FROM business_documents WHERE business_id=$1 AND document_type='SALES_RECEIPT' AND snapshot->>'noPaymentRequired'='true' AND snapshot->>'tillSessionId' IS NULL) AS "unassignedZeroReceiptCount",(SELECT count(*)::text FROM pos_orders WHERE business_id=$1 AND state NOT IN ('COMPLETED','VOIDED')) AS "openOrderCount",(SELECT COALESCE(sum(grand_total_minor-amount_paid_minor),0)::text FROM pos_orders WHERE business_id=$1 AND state NOT IN ('COMPLETED','VOIDED')) AS "openOrderOutstandingMinor",(SELECT count(*)::text FROM api_commands WHERE business_id=$1 AND status IN ('RECEIVED','PROCESSING') AND command_name IN ('payment.record','payment.split','payment.refund','payment.reverse','till.cashMovement')) AS "unresolvedMoneyCommandCount"`,[actor.businessId]);
 const diagnostics=observed.rows[0];
 const taxes={collected:allocations.PAYMENT,reversed:allocations.REFUND,net:Object.fromEntries(Object.keys(allocations.PAYMENT).map(key=>[key,sum(allocations.PAYMENT[key],-allocations.REFUND[key])]))};
 const snapshot={schemaVersion:1,business,tillSessionId:p.tillId,outletId:till.outletId,operatorId:till.operatorId,deviceId:till.deviceId,openedAt:till.openedAt,closedAt:till.closedAt,generatedAt:at.toISOString(),generatedBy:actor.staffId,currency:'KES',salesBasis:'SETTLEMENT_RECEIPTS_IN_TILL_SESSION',paymentBasis:'PAYMENT_POSTINGS_IN_TILL_SESSION',settledSales,sales:{receivedMinor:received,returnedMinor:returned,netReceivedMinor:sum(received,-returned)},paymentsByTender,taxes,cash:{openingFloatMinor:till.openingFloatMinor,paidInMinor:integer(cashRow.paidIn),paidOutMinor:integer(cashRow.paidOut),salesMinor:cashReceived,refundsMinor:cashReturned,expectedMinor:expectedCash,countedMinor:till.countedCashMinor,varianceMinor:till.varianceMinor,varianceReason:till.varianceReason,reviewReason:till.reviewReason,closedBy:till.closedBy},credit:{status:'NOT_MIGRATED'},hotelExposure:{status:'NOT_MIGRATED'},operationalDiagnostics:{scope:'BUSINESS_AT_GENERATION',observedAt:diagnostics.observedAt.toISOString(),unassignedZeroReceiptCount:integer(diagnostics.unassignedZeroReceiptCount),openOrderCount:integer(diagnostics.openOrderCount),openOrderOutstandingMinor:integer(diagnostics.openOrderOutstandingMinor),unresolvedMoneyCommandCount:integer(diagnostics.unresolvedMoneyCommandCount)}};
 const documentId=randomUUID(),documentNumber=`CLOSE-${command.commandId}`,hash=documentHash(snapshot);
 await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'CLOSE_DAY_REPORT',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,documentId,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
 const saved=await tx.client.query(`INSERT INTO close_day_reports(business_id,id,till_session_id,document_id,source_command_id,generated_by,generated_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[actor.businessId,p.id,p.tillId,documentId,command.commandId,actor.staffId,at]);
 const value=projection({id:saved.rows[0].id,tillSessionId:p.tillId,documentId,documentNumber,layoutVersion:1,generatedBy:actor.staffId,generatedAt:at,snapshot,hash});
 return {value,records:[value,{collection:'businessDocuments',id:documentId,version:1,archived:false,data:{id:documentId,type:'CLOSE_DAY_REPORT',documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},await queueDocumentPrint(tx,{businessId:actor.businessId,documentId,printerRole:'OFFICE',staffId:actor.staffId,at})]};
};
export const closeDayCommandRegistry=new Map([['closeDay.generate',{permission:'reports.view',offlinePolicy:'ONLINE_ONLY',handler:generate}]]);
