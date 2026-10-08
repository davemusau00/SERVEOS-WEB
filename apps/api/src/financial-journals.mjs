import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';

const conflict=message=>{throw new ApiProblem(409,'JOURNAL_RECONCILIATION_REQUIRED',message)};
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const roundedRatio=(amount,numerator,denominator)=>Number((BigInt(amount)*BigInt(numerator)*2n+BigInt(denominator))/(2n*BigInt(denominator)));

// Allocate combined tax first, then its VAT/levy split. Each cumulative component
// is monotonic, including one-minor-unit payments, and reaches its exact endpoint.
export function cumulativeAllocation(basis,amount){
 const {grossMinor,netMinor,vatMinor,levyMinor}=basis;
 if(![grossMinor,netMinor,vatMinor,levyMinor,amount].every(integer)||grossMinor<=0||amount>grossMinor||netMinor+vatMinor+levyMinor!==grossMinor)conflict('The original gross and tax allocation does not reconcile.');
 const taxTotal=vatMinor+levyMinor,tax=roundedRatio(amount,taxTotal,grossMinor);
 const vat=taxTotal?roundedRatio(tax,vatMinor,taxTotal):0;
 return {grossMinor:amount,netMinor:amount-tax,vatMinor:vat,levyMinor:tax-vat};
}
export function allocationDelta(basis,before,amount){
 if(!integer(before)||!integer(amount)||amount<=0||!Number.isSafeInteger(before+amount))conflict('The cumulative payment or refund amount is invalid.');
 const start=cumulativeAllocation(basis,before),end=cumulativeAllocation(basis,before+amount);
 return Object.fromEntries(Object.keys(end).map(key=>[key,end[key]-start[key]]));
}
export function orderAllocationBasis(order){
 const basis={grossMinor:order.grandTotalMinor,netMinor:0,vatMinor:0,levyMinor:0};
 for(const line of order.items.filter(item=>item.state!=='VOIDED')){
  if(!line.taxSnapshot)conflict('A sale line lacks its original tax snapshot.');
  for(const key of ['netMinor','vatMinor','levyMinor']){
   if(!integer(line[key])||!Number.isSafeInteger(basis[key]+line[key]))conflict('Sale taxes exceed supported amounts or require reconciliation.');
   basis[key]+=line[key];
  }
 }
 cumulativeAllocation(basis,0);
 return basis;
}

export async function remainingPaymentBasis(db,businessId,orderId,order){
 const orderTotals=orderAllocationBasis(order);
 // A tab can gain newly fired lines after a partial payment. Subtract actual
 // posted allocations instead of recalculating historical tax using new totals.
 const {rows}=await db.query(`SELECT count(DISTINCT p.id)::text AS "paymentCount",count(DISTINCT j.id)::text AS "journalCount",COALESCE(sum(l.debit_minor) FILTER(WHERE l.account_code='ASSET_TENDER'),0)::text AS "grossMinor",COALESCE(sum(l.credit_minor) FILTER(WHERE l.account_code='REVENUE_SALES'),0)::text AS "netMinor",COALESCE(sum(l.credit_minor) FILTER(WHERE l.account_code='LIABILITY_VAT'),0)::text AS "vatMinor",COALESCE(sum(l.credit_minor) FILTER(WHERE l.account_code='LIABILITY_LEVY'),0)::text AS "levyMinor" FROM order_payments p LEFT JOIN financial_journals j ON j.business_id=p.business_id AND j.source_type='PAYMENT' AND j.source_id=p.id LEFT JOIN financial_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id WHERE p.business_id=$1 AND p.order_id=$2`,[businessId,orderId]);
 const row=rows[0],posted=Object.fromEntries(['grossMinor','netMinor','vatMinor','levyMinor'].map(key=>[key,Number(row[key])]));
 if(row.paymentCount!==row.journalCount||!Object.values(posted).every(integer)||posted.grossMinor!==order.amountPaidMinor||posted.netMinor+posted.vatMinor+posted.levyMinor!==posted.grossMinor)conflict('Prior payment journals do not reconcile. Reconcile them before accepting more money.');
 const roomResult=await db.query(`SELECT COALESCE(sum(c.amount_minor-COALESCE(r.amount_minor,0)),0)::text AS "grossMinor",COALESCE(sum(c.net_minor-COALESCE(r.net_minor,0)),0)::text AS "netMinor",COALESCE(sum(c.vat_minor-COALESCE(r.vat_minor,0)),0)::text AS "vatMinor",COALESCE(sum(c.levy_minor-COALESCE(r.levy_minor,0)),0)::text AS "levyMinor" FROM pos_order_room_charges c LEFT JOIN pos_order_room_charge_reversals r ON r.business_id=c.business_id AND r.room_charge_id=c.id WHERE c.business_id=$1 AND c.order_id=$2`,[businessId,orderId]);
 const roomPosted=Object.fromEntries(['grossMinor','netMinor','vatMinor','levyMinor'].map(key=>[key,Number(roomResult.rows[0][key])]));
 if(!Object.values(roomPosted).every(integer)||roomPosted.grossMinor!==Number(order.roomChargeMinor||0)||roomPosted.netMinor+roomPosted.vatMinor+roomPosted.levyMinor!==roomPosted.grossMinor)conflict('POS room-charge entries and reversals do not reconcile to the order.');
 const remaining=Object.fromEntries(Object.keys(orderTotals).map(key=>[key,orderTotals[key]-posted[key]]));
 cumulativeAllocation(remaining,0);
 if(Number(order.amountCreditedMinor)+roomPosted.grossMinor>remaining.grossMinor)conflict('Settled receivables exceed the order amount remaining after tender postings.');
 return {orderTotals,posted,remaining};
}

const headers=`id,source_type AS "sourceType",source_id AS "sourceId",payment_id AS "paymentId",refund_id AS "refundId",customer_credit_entry_id AS "customerCreditEntryId",original_journal_id AS "originalJournalId",currency,total_debit_minor AS "totalDebitMinor",total_credit_minor AS "totalCreditMinor",basis_snapshot AS "basisSnapshot",source_command_id AS "sourceCommandId",staff_id AS "staffId",device_id AS "deviceId",occurred_at AS "occurredAt"`;
async function projected(db,businessId,rows){
 if(!rows.length)return [];
 const lines=await db.query(`SELECT journal_id AS "journalId",line_number AS "lineNumber",account_code AS "accountCode",account_ref AS "accountRef",debit_minor AS "debitMinor",credit_minor AS "creditMinor" FROM financial_journal_lines WHERE business_id=$1 AND journal_id=ANY($2::uuid[]) ORDER BY journal_id,line_number`,[businessId,rows.map(row=>row.id)]);
 const byJournal=new Map();
 for(const line of lines.rows){const list=byJournal.get(line.journalId)??[];list.push({...line,debitMinor:Number(line.debitMinor),creditMinor:Number(line.creditMinor)});byJournal.set(line.journalId,list);}
 return rows.map(row=>({collection:'journalEntries',id:row.id,version:1,archived:false,data:{...row,totalDebitMinor:Number(row.totalDebitMinor),totalCreditMinor:Number(row.totalCreditMinor),occurredAt:row.occurredAt.toISOString(),lines:byJournal.get(row.id)??[]}}));
}
export async function journalProjections(db,businessId){
 const {rows}=await db.query(`SELECT ${headers} FROM financial_journals WHERE business_id=$1 ORDER BY occurred_at DESC,id LIMIT 1000`,[businessId]);
 return projected(db,businessId,rows);
}
export async function originalPaymentJournal(db,businessId,payment){
 const {rows}=await db.query(`SELECT ${headers} FROM financial_journals WHERE business_id=$1 AND source_type='PAYMENT' AND source_id=$2`,[businessId,payment.id]);
 if(!rows.length)conflict('The original payment has no accounting journal. Reconcile it before returning money; historical allocations cannot be guessed.');
 const record=(await projected(db,businessId,rows))[0],journal=record.data;
 const tender=journal.lines.find(line=>line.accountCode==='ASSET_TENDER');
 const basis={grossMinor:journal.totalDebitMinor,netMinor:0,vatMinor:0,levyMinor:0};
 const components={REVENUE_SALES:'netMinor',LIABILITY_VAT:'vatMinor',LIABILITY_LEVY:'levyMinor'};
 for(const line of journal.lines){
  if(line.accountCode==='ASSET_TENDER')continue;
  if(!components[line.accountCode]||line.debitMinor!==0)conflict('Original payment journal lines require reconciliation.');
  basis[components[line.accountCode]]=line.creditMinor;
 }
 if(!tender||tender.accountRef!==payment.accountId||tender.debitMinor!==payment.amountMinor||tender.creditMinor!==0||journal.totalCreditMinor!==payment.amountMinor||basis.grossMinor!==payment.amountMinor)conflict('Original tender journal does not match the payment.');
 cumulativeAllocation(basis,0);
 const previous=await db.query(`SELECT count(DISTINCT r.id)::text AS "refundCount",count(DISTINCT j.id)::text AS "journalCount",COALESCE(sum(l.credit_minor) FILTER(WHERE l.account_code='ASSET_TENDER'),0)::text AS "grossMinor",COALESCE(sum(l.debit_minor) FILTER(WHERE l.account_code='REVENUE_SALES'),0)::text AS "netMinor",COALESCE(sum(l.debit_minor) FILTER(WHERE l.account_code='LIABILITY_VAT'),0)::text AS "vatMinor",COALESCE(sum(l.debit_minor) FILTER(WHERE l.account_code='LIABILITY_LEVY'),0)::text AS "levyMinor" FROM payment_refunds r LEFT JOIN financial_journals j ON j.business_id=r.business_id AND j.source_type='REFUND' AND j.source_id=r.id LEFT JOIN financial_journal_lines l ON l.business_id=j.business_id AND l.journal_id=j.id WHERE r.business_id=$1 AND r.payment_id=$2`,[businessId,payment.id]);
 const prior=previous.rows[0],expected=cumulativeAllocation(basis,payment.refundedAmountMinor);
 if(prior.refundCount!==prior.journalCount||Object.entries(expected).some(([key,value])=>Number(prior[key])!==value))conflict('Prior refund journals do not reconcile. Reconcile them before returning more money.');
 return {id:journal.id,basis};
}

export async function postFinancialJournal(tx,{actor,command,at,paymentId,refundId=null,originalJournalId=null,accountId,currency,allocation,basisSnapshot}){
 const {grossMinor,netMinor,vatMinor,levyMinor}=allocation;
 cumulativeAllocation(allocation,grossMinor);
 const id=randomUUID(),reversing=refundId!==null;
 const {rows}=await tx.client.query(`INSERT INTO financial_journals(business_id,id,source_type,source_id,payment_id,refund_id,original_journal_id,currency,total_debit_minor,total_credit_minor,basis_snapshot,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10::jsonb,$11,$12,$13,$14) RETURNING ${headers}`,[actor.businessId,id,reversing?'REFUND':'PAYMENT',refundId??paymentId,paymentId,refundId,originalJournalId,currency,grossMinor,JSON.stringify(basisSnapshot),command.commandId,actor.staffId,actor.deviceId,at]);
 const lines=[{code:'ASSET_TENDER',ref:accountId,amount:grossMinor},...Object.entries({REVENUE_SALES:netMinor,LIABILITY_VAT:vatMinor,LIABILITY_LEVY:levyMinor}).filter(([,amount])=>amount>0).map(([code,amount])=>({code,ref:null,amount}))];
 for(const [index,line] of lines.entries()){
  const debit=(line.code==='ASSET_TENDER')!==reversing;
  await tx.client.query(`INSERT INTO financial_journal_lines(business_id,journal_id,line_number,account_code,account_ref,debit_minor,credit_minor) VALUES($1,$2,$3,$4,$5,$6,$7)`,[actor.businessId,id,index+1,line.code,line.ref,debit?line.amount:0,debit?0:line.amount]);
 }
 return (await projected(tx.client,actor.businessId,rows))[0];
}

export async function postCustomerCreditJournal(tx,{actor,command,at,entry,sourceType,originalJournalId=null,lines,basisSnapshot}){
 if(!['CUSTOMER_CREDIT_CHARGE','CUSTOMER_CREDIT_SETTLEMENT','CUSTOMER_CREDIT_WRITE_OFF','CUSTOMER_CREDIT_REVERSAL'].includes(sourceType)||!Array.isArray(lines)||!lines.length||lines.length>4)throw new ApiProblem(500,'INVALID_CREDIT_JOURNAL','Customer credit journal configuration is invalid.');
 const amount=entry.amountMinor;if(!Number.isSafeInteger(amount)||amount<=0)throw new ApiProblem(409,'CREDIT_JOURNAL_AMOUNT_INVALID','Customer credit journal amount needs reconciliation.');
 const id=randomUUID();
 const {rows}=await tx.client.query(`INSERT INTO financial_journals(business_id,id,source_type,source_id,payment_id,refund_id,customer_credit_entry_id,original_journal_id,currency,total_debit_minor,total_credit_minor,basis_snapshot,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,NULL,NULL,$4,$5,'KES',$6,$6,$7::jsonb,$8,$9,$10,$11) RETURNING ${headers}`,[actor.businessId,id,sourceType,entry.id,originalJournalId,amount,JSON.stringify(basisSnapshot),command.commandId,actor.staffId,actor.deviceId,at]);
 for(const [index,line] of lines.entries()){
  if(!['ASSET_TENDER','REVENUE_SALES','LIABILITY_VAT','LIABILITY_LEVY','ASSET_CUSTOMER_AR','EXPENSE_BAD_DEBT'].includes(line.code)||!Number.isSafeInteger(line.debitMinor)||!Number.isSafeInteger(line.creditMinor))throw new ApiProblem(500,'INVALID_CREDIT_JOURNAL_LINE','Customer credit journal lines are invalid.');
  await tx.client.query(`INSERT INTO financial_journal_lines(business_id,journal_id,line_number,account_code,account_ref,debit_minor,credit_minor) VALUES($1,$2,$3,$4,$5,$6,$7)`,[actor.businessId,id,index+1,line.code,line.ref??null,line.debitMinor,line.creditMinor]);
 }
 return (await projected(tx.client,actor.businessId,rows))[0];
}
