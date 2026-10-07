import {ApiProblem} from './command-kernel.mjs';
import {payableProjections} from './procurement-payables.mjs';
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message);};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value))fail(`Invalid ${label}.`);return value.trim();};
const date=(value,label)=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail(`Invalid ${label}; use YYYY-MM-DD.`);return value;};
const micros=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1e9||Math.abs(value*1e6-Math.round(value*1e6))>0.0001)fail('Invoice quantities require positive six-decimal values.');return BigInt(value.toFixed(6).replace('.',''));};
async function matchInvoice({tx,command,actor,at}){
 const p=command.payload;if(!uuid(p.payableId)||!Array.isArray(p.lines)||!p.lines.length||p.lines.length>100)fail('Choose a payable and 1 to 100 invoice lines.');
 const invoiceNumber=text(p.invoiceNumber,'invoice number',80),reason=text(p.reason,'matching reason',500);if(reason.length<3)fail('Explain the invoice match.');
 const invoiceDate=date(p.invoiceDate,'invoice date'),dueDate=date(p.dueDate,'due date');if(dueDate<invoiceDate)fail('Due date cannot precede invoice date.');
 if(!Number.isSafeInteger(p.invoiceAmountMinor)||p.invoiceAmountMinor<=0)fail('Invoice amount must be positive minor currency units.');
 const expected=command.expectedVersions[`supplierPayables:${p.payableId}`];if(!Number.isSafeInteger(expected)||expected<1)fail('Reviewed payable version is required.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement:${actor.businessId}`]);
 const {rows}=await tx.client.query('SELECT * FROM procurement_payables WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.payableId]);
 const payable=rows[0];if(!payable||payable.status!=='RECEIVED_UNINVOICED'||Number(payable.version)!==expected||Number(payable.paid_minor)!==0)throw new ApiProblem(409,'PAYABLE_STATE_CONFLICT','Review the current uninvoiced payable before matching.');
 const duplicate=await tx.client.query('SELECT id FROM procurement_payables WHERE business_id=$1 AND supplier_id=$2 AND lower(btrim(invoice_number))=lower($3)',[actor.businessId,payable.supplier_id,invoiceNumber]);if(duplicate.rows.length)throw new ApiProblem(409,'DUPLICATE_INVOICE','This supplier invoice reference is already matched. Recover the original action.');
 const receipt=await tx.client.query(`SELECT d.snapshot FROM procurement_goods_receipts g JOIN business_documents d ON d.business_id=g.business_id AND d.id=g.document_id WHERE g.business_id=$1 AND g.id=$2`,[actor.businessId,payable.grn_id]);
 const snapshot=receipt.rows[0]?.snapshot;if(!snapshot||snapshot.supplier?.id!==payable.supplier_id||snapshot.goodsReceiptId!==payable.grn_id)throw new ApiProblem(409,'RECEIPT_RECONCILIATION_REQUIRED','Original GRN evidence requires reconciliation.');
 const accepted=snapshot.items.filter(line=>line.quantityAccepted>0),seen=new Set(),matched=[];let total=0n;
 for(const billed of p.lines){
  if(!billed||!uuid(billed.goodsReceiptLineId)||seen.has(billed.goodsReceiptLineId))fail('Each accepted GRN line must appear exactly once.');seen.add(billed.goodsReceiptLineId);
  const line=accepted.find(line=>line.id===billed.goodsReceiptLineId);if(!line)fail('Invoice line is not an accepted line on this GRN.');
  if(micros(billed.quantityBilled)!==micros(line.quantityAccepted)||!Number.isSafeInteger(billed.unitPriceMinor)||billed.unitPriceMinor!==line.unitPriceMinor||!Number.isSafeInteger(billed.lineTotalMinor)||billed.lineTotalMinor!==line.acceptedTotalMinor)fail('Invoice quantities, prices and line amounts must match the accepted GRN cost basis. Resolve variances through a reviewed correction.');
  total+=BigInt(billed.lineTotalMinor);matched.push({goodsReceiptLineId:line.id,purchaseOrderLineId:line.purchaseOrderLineId,stockItemId:line.stockItemId,quantityBilled:billed.quantityBilled,unitPriceMinor:billed.unitPriceMinor,lineTotalMinor:billed.lineTotalMinor});
 }
 if(seen.size!==accepted.length||total!==BigInt(p.invoiceAmountMinor)||total!==BigInt(payable.amount_minor)||total!==BigInt(snapshot.acceptedTotalMinor))fail('Invoice must match every accepted GRN line and the payable control total.');
 const version=await tx.bumpEntityVersion(actor.businessId,'supplierPayables',p.payableId,expected);
 const evidence={schemaVersion:1,invoiceNumber,invoiceDate,dueDate,invoiceAmountMinor:p.invoiceAmountMinor,goodsReceiptId:payable.grn_id,supplierId:payable.supplier_id,lines:matched,reason,matchedBy:actor.staffId,deviceId:actor.deviceId,matchedAt:at.toISOString(),sourceCommandId:command.commandId};
 const credited=BigInt(payable.credited_minor??0),paid=BigInt(payable.paid_minor),status=paid+credited===BigInt(payable.amount_minor)?'SETTLED':paid>0n?'PARTIALLY_PAID':'MATCHED_UNPAID';
 await tx.client.query(`UPDATE procurement_payables SET status=$3,invoice_number=$4,invoice_date=$5,due_date=$6,invoice_snapshot=$7::jsonb,version=$8 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.payableId,status,invoiceNumber,invoiceDate,dueDate,JSON.stringify(evidence),version]);
 const value=(await payableProjections(tx.client,actor.businessId)).find(row=>row.id===p.payableId);return {value,records:[value]};
}
export const supplierInvoiceCommandRegistry=new Map([['supplierPayable.matchInvoice',{permission:'procurement.manage',offlinePolicy:'ONLINE_ONLY',handler:matchInvoice}]]);
