import {randomUUID} from 'node:crypto';
export async function payableProjections(db,businessId){
 const {rows}=await db.query(`SELECT id,grn_id AS "goodsReceiptId",supplier_id AS "supplierId",amount_minor AS "amountMinor",paid_minor AS "paidMinor",credited_minor AS "creditedMinor",status,invoice_number AS "invoiceNumber",invoice_date::text AS "invoiceDate",due_date::text AS "dueDate",invoice_snapshot AS "invoiceSnapshot",version,source_command_id AS "sourceCommandId",staff_id AS "staffId",created_at AS "createdAt" FROM procurement_payables WHERE business_id=$1 ORDER BY created_at DESC,id`,[businessId]);
 return rows.map(({id,version,createdAt,...data})=>({collection:'supplierPayables',id,version:Number(version),archived:false,data:{...data,amountMinor:Number(data.amountMinor),paidMinor:Number(data.paidMinor),creditedMinor:Number(data.creditedMinor),outstandingMinor:Math.max(0,Number(data.amountMinor)-Number(data.paidMinor)-Number(data.creditedMinor)),supplierCreditMinor:Math.max(0,Number(data.paidMinor)+Number(data.creditedMinor)-Number(data.amountMinor)),createdAt:createdAt.toISOString()}}));
}
/** Called only inside the receiving transaction after immutable GRN evidence exists. */
export async function postReceivingLiability(tx,{actor,command,at,grnId,supplierId,amountMinor,items}){
 if(amountMinor===0)return [];
 const id=randomUUID(),journalId=randomUUID();
 await tx.bumpEntityVersion(actor.businessId,'supplierPayables',id,0);
 await tx.client.query(`INSERT INTO procurement_payables(business_id,id,grn_id,supplier_id,amount_minor,version,source_command_id,staff_id,created_at) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8)`,[actor.businessId,id,grnId,supplierId,amountMinor,command.commandId,actor.staffId,at]);
 const basis={schemaVersion:1,goodsReceiptId:grnId,supplierId,payableId:id,items,recognition:'ACCEPTED_GOODS_AT_FROZEN_PO_COST',taxTreatment:'NO_INPUT_TAX_CLAIMED'};
 await tx.client.query(`INSERT INTO financial_journals(business_id,id,source_type,source_id,currency,total_debit_minor,total_credit_minor,basis_snapshot,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,'GOODS_RECEIPT',$3,'KES',$4,$4,$5::jsonb,$6,$7,$8,$9)`,[actor.businessId,journalId,grnId,amountMinor,JSON.stringify(basis),command.commandId,actor.staffId,actor.deviceId,at]);
 const lines=[{accountCode:'ASSET_INVENTORY',debitMinor:amountMinor,creditMinor:0},{accountCode:'LIABILITY_ACCOUNTS_PAYABLE',debitMinor:0,creditMinor:amountMinor}];
 for(const [index,line] of lines.entries())await tx.client.query(`INSERT INTO financial_journal_lines(business_id,journal_id,line_number,account_code,debit_minor,credit_minor) VALUES($1,$2,$3,$4,$5,$6)`,[actor.businessId,journalId,index+1,line.accountCode,line.debitMinor,line.creditMinor]);
 const payable=(await payableProjections(tx.client,actor.businessId)).find(row=>row.id===id);
 return [payable,{collection:'journalEntries',id:journalId,version:1,archived:false,data:{id:journalId,sourceType:'GOODS_RECEIPT',sourceId:grnId,paymentId:null,refundId:null,originalJournalId:null,currency:'KES',totalDebitMinor:amountMinor,totalCreditMinor:amountMinor,basisSnapshot:basis,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,occurredAt:at.toISOString(),lines:lines.map((line,index)=>({...line,lineNumber:index+1,accountRef:null}))}}];
}
