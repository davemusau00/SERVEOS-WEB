import React from 'react';
import type {LocalBusinessDocument} from './BusinessStore';
import {documentCopyStatus,documentPaperProfile,formatDocumentMoney,displayDocumentReference} from './documentPaperProfiles';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.map(object):[];
const rawText=(value:unknown)=>typeof value==='string'?value:'';
const text=(value:unknown)=>{const result=rawText(value);return /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(result)?'':result;};
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const money=(value:unknown)=>formatDocumentMoney(number(value));
const localTime=(value:unknown,timeZone='Africa/Nairobi')=>{const raw=text(value),date=new Date(raw);return raw&&Number.isFinite(date.getTime())?date.toLocaleString('en-KE',{timeZone}):raw;};
const titles:Record<string,string>={EXPENSE_PAYMENT_VOUCHER:'Expense payment voucher',SUPPLIER_RETURN_NOTE:'Supplier return note',SUPPLIER_PAYMENT_VOUCHER:'Supplier payment voucher',GOODS_RECEIPT:'Goods received note',PURCHASE_ORDER:'Purchase order',SALES_RECEIPT:'Sales receipt',CUSTOMER_CREDIT_INVOICE:'Customer credit invoice',CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT:'Customer credit payment acknowledgement',CUSTOMER_CREDIT_WRITE_OFF_NOTICE:'Customer credit write-off notice',CUSTOMER_CREDIT_REVERSAL_NOTICE:'Customer credit reversal notice',PAYMENT_ACKNOWLEDGEMENT:'Payment acknowledgement',GUEST_FOLIO:'Guest folio',GUEST_CHECKOUT:'Guest checkout statement',RESERVATION_CONFIRMATION:'Reservation confirmation',KOT:'Kitchen order ticket',BOT:'Bar order ticket',REFUND_RECEIPT:'Refund receipt',CLOSE_DAY_REPORT:'Close-day report',ORDER_VOID_NOTICE:'Order void notice',KOT_CANCEL:'Cancel kitchen order',BOT_CANCEL:'Cancel bar order'};
const canonical=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;

const documentState=(type:string,attempt:number)=>documentCopyStatus(attempt)==='REPRINT'?'REPRINT':type==='REFUND_RECEIPT'?'REFUND':['ORDER_VOID_NOTICE','KOT_CANCEL','BOT_CANCEL'].includes(type)?'VOIDED':'ISSUED';
const paymentStatus=(snapshot:Record<string,unknown>)=>{
 if(snapshot.provisional===true)return 'Cash received locally. PENDING SERVER SYNC / NOT FISCAL INVOICE.';
 if(snapshot.noPaymentRequired===true)return 'No payment required; no money received.';
 const balance=number(snapshot.balanceMinor),paid=number(snapshot.paidMinor),credited=number(snapshot.creditedMinor),roomCharged=number(snapshot.roomChargedMinor);
 const settlement=balance===0?'Settled when issued':balance!==null?`Balance due when issued: ${money(balance)}`:'Settlement balance not recorded in this document';
 const sources=[paid!==null&&paid>0?`tender recorded ${money(paid)}`:'',credited!==null&&credited>0?`customer account ${money(credited)}`:'',roomCharged!==null&&roomCharged>0?`room folio ${money(roomCharged)}`:''].filter(Boolean);
 return sources.length?`${settlement}; ${sources.join('; ')}.`:`${settlement}.`;
};

function DocumentIdentity({document,attempt,business,timeZone}:{document:LocalBusinessDocument;attempt:number;business:Record<string,unknown>;timeZone:string}){
 const issued=new Date(document.issuedAt),preparedBy=text(business.preparedBy)||text(business.issuedBy)||text(document.snapshot.generatedBy)||text(document.snapshot.issuedBy)||text(object(document.snapshot.cashier).name)||text(document.snapshot.staffId)||text(document.snapshot.receivedBy)||text(document.snapshot.dispatchedBy);
 const outlet=text(document.snapshot.outletName)||text(document.snapshot.outletId)||text(document.snapshot.propertyName)||text(document.snapshot.propertyId);
 const periodStart=text(document.snapshot.periodStart)||text(document.snapshot.openedAt),periodEnd=text(document.snapshot.periodEnd)||text(document.snapshot.closedAt);
 return <header className="servos-document-header">
  <div className="servos-document-identity"><SnapshotImage value={business.logoPngDataUrl} label="Business logo"/><div>
   {text(business.businessName)&&<h1>{text(business.businessName)}</h1>}
   {text(business.address)&&<p>{text(business.address)}</p>}
   {text(business.contact)&&<p>{text(business.contact)}</p>}
   {rawText(business.taxPin)&&<p>Tax PIN: {rawText(business.taxPin)}</p>}
   {outlet&&<p>Outlet / property: {outlet}</p>}
  </div></div>
  <div className="servos-document-title"><div><h2>{titles[document.type]||document.type}</h2><p className="servos-document-number">Document no. {displayDocumentReference(document)}</p></div><strong className={`servos-document-state servos-document-state-${documentState(document.type,attempt).toLowerCase()}`}>{document.snapshot.provisional===true?`${documentCopyStatus(attempt)==='REPRINT'?'REPRINT / ':''}PROVISIONAL - PENDING SYNC`:documentState(document.type,attempt)}</strong></div>
  <dl className="servos-document-control"><div><dt>Issued (Africa/Nairobi)</dt><dd>{Number.isFinite(issued.getTime())?issued.toLocaleString('en-KE',{timeZone}):document.issuedAt}</dd></div>{(periodStart||periodEnd)&&<div><dt>Shift / report period (Africa/Nairobi)</dt><dd>{periodStart?localTime(periodStart,timeZone):'—'} – {periodEnd?localTime(periodEnd,timeZone):'—'}</dd></div>}{preparedBy&&<div><dt>Prepared / recorded by</dt><dd>{preparedBy}</dd></div>}</dl>
  {document.type==='SALES_RECEIPT'&&<p className="servos-document-payment-status">Payment status: {paymentStatus(document.snapshot)}</p>}
 </header>;
}

function DocumentFooter({document,attempt}:{document:LocalBusinessDocument;attempt:number}){
 const snapshotFooter=text(document.snapshot.footer)||text(object(document.snapshot.business).footer);
 return <footer className="servos-business-document-footer">
  {snapshotFooter&&<p>{snapshotFooter}</p>}
  <p>Reference: {displayDocumentReference(document)} · Copy status: {documentCopyStatus(attempt)}</p>
 </footer>;
}

const isSnapshotPng=(value:unknown):value is string=>typeof value==='string'&&value.length<=240_000&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value);

/** Logo and QR use the same bounded embedded PNG pipeline; no mutable remote URLs. */
function SnapshotImage({value,label}:{value:unknown;label:string}){
 if(!isSnapshotPng(value))return null;
 return <img className={label==='Payment QR'?'servos-document-qr':'servos-document-logo'} src={value} alt={label}/>;
}

export function BusinessDocumentRenderer({document,attempt=1}:{document:LocalBusinessDocument;attempt?:number}){
 const s=document.snapshot,b=object(s.business),tax=object(s.taxes),cashier=object(s.cashier),timeZone=text(b.timeZone)||'Africa/Nairobi';
 const ticket=['KOT','BOT','KOT_CANCEL','BOT_CANCEL'].includes(document.type);
 const voidNotice=['ORDER_VOID_NOTICE','KOT_CANCEL','BOT_CANCEL'].includes(document.type);
 const qr=document.type==='SALES_RECEIPT'&&b.paymentQrEnabled===true?text(b.paymentQrPngDataUrl):'';
 const profile=documentPaperProfile(document.type);
 return <article className="servos-business-document" data-paper-profile={profile} data-document-type={document.type} aria-label={titles[document.type]||document.type}>
  <DocumentIdentity document={document} attempt={attempt} business={b} timeZone={timeZone}/>
  <section className="servos-document-meta">
   {text(s.orderName)&&<p>Order: {text(s.orderName)}</p>}
   {(text(cashier.name)||text(s.staffId))&&<p>Cashier: {text(cashier.name)||text(s.staffId)}</p>}
   {ticket&&text(object(s.approvedTicket).waiterName)&&<p>Waiter: {text(object(s.approvedTicket).waiterName)}</p>}
   {text(s.serviceDestination)&&<p>Service: {text(s.serviceDestination)}</p>}
  </section>
  {document.type==='RESERVATION_CONFIRMATION' &&<section><p>Guest: {text(object(s.guest).name)}</p><p>Room: {text(object(s.room).number)}</p><p>Arrival: {localTime(object(s.reservation).startsAt)}</p><p>Departure: {localTime(object(s.reservation).endsAt)}</p><p>Guests: {String(object(s.reservation).guests)}</p><p>Quoted total: {money(object(s.reservation).quotedAmountMinor)}</p><p>This confirms a reservation. It does not confirm payment or check-in.</p></section>}
  {document.type==='GUEST_FOLIO'&&<section><p>Guest: {text(object(s.guest).name)}</p><p>Reservation: {text(object(s.reservation).id)}</p><p>Folio status: {text(object(s.folio).status)}</p>{rows(s.entries).map((entry,index)=>{const data=object(entry.data),details=object(data.details);return <div key={rawText(entry.id)||index}><p><b>{text(data.description)||text(data.kind)}</b> · {money(data.amountMinor||data.grossMinor)}</p><p>{localTime(data.postedAt)} · Balance effect {money(data.balanceDeltaMinor)}</p>{text(details.reason)&&<p>Reason: {text(details.reason)}</p>}</div>})}<dl className="servos-document-totals"><div><dt>Outstanding balance</dt><dd>{money(object(s.folio).balanceMinor)}</dd></div><div><dt>Unapplied deposit</dt><dd>{money(object(s.folio).depositMinor)}</dd></div></dl><p>External funds shown here were manually confirmed by staff; no payment-provider verification is asserted.</p></section>}
  {document.type==='GUEST_CHECKOUT'&&<section><p>Guest: {text(object(s.guest).name)}</p><p>Room: {text(object(s.room).number)}</p><p>Checked in: {localTime(s.checkedInAt)} · Checked out: {localTime(s.checkedOutAt)}</p>{rows(object(s.folio).entries).map((entry,index)=><div key={index}><p><b>{text(entry.kind)||text(entry.sourceType)}</b> · {money(entry.amountMinor)}</p><p>{text(object(entry.details).description)} · {localTime(entry.postedAt)}</p></div>)}<dl className="servos-document-totals"><div><dt>Settled balance</dt><dd>{money(object(s.folio).balanceMinor)}</dd></div><div><dt>Unapplied deposit</dt><dd>{money(object(s.folio).depositMinor)}</dd></div></dl><p>Checkout was recorded after all booked accommodation was posted and the folio was settled.</p></section>}
  {voidNotice&&<section><p><b>ORDER VOIDED - stop preparation/service</b></p><p>Reason: {text(s.reason)}</p><p>Stock disposition: {text(s.disposition)}</p><p>{s.stockRestored===true?'Original sealed bottles returned to stock.':'No automatic stock return.'}</p>{s.inventoryCorrectionRequired===true&&<p>Separate reviewed inventory correction required.</p>}{Array.isArray(s.unresolvedTicketIds)&&s.unresolvedTicketIds.length>0&&<p>Earlier preparation tickets may already have printed. Confirm cancellation with kitchen/bar staff.</p>}<p>This notice does not refund money.</p></section>}
  {document.type==='SUPPLIER_RETURN_NOTE'&&<section><p>Supplier: {text(object(s.supplier).name)}</p><p>Original goods receipt: {text(s.goodsReceiptId)}</p><p>Dispatch reference: {rawText(s.dispatchReference)}</p><p>Supplier/driver acknowledgement: {text(s.supplierAcknowledgmentName)}</p>{rows(s.items).map(line=><div key={rawText(line.id)}><p><b>{text(object(line.stockSnapshot).name)}</b></p><p>Returned: {String(line.quantity)} {text(object(line.purchasePackageSnapshot).name)||text(object(line.stockSnapshot).baseUnit)} - condition {text(line.condition)}</p><p>Estimated credit at dispatch: {money(line.estimatedCreditMinor)}</p><p>{text(line.reason)}</p></div>)}<p><b>Estimated supplier credit: {money(s.estimatedCreditMinor)}</b></p><p>Reason: {text(s.reason)}</p><p>Dispatched by: {text(s.dispatchedBy)} - {localTime(s.dispatchedAt)}</p><p>Physical return note only; supplier credit note/settlement is not confirmed.</p></section>}
  {document.type==='SUPPLIER_PAYMENT_VOUCHER'&&<section><p>Supplier: {text(object(s.supplier).name)}</p><p>Invoice: {text(s.invoiceNumber)}</p><p>Payable: {text(s.supplierPayableId)}</p><p><b>Paid ({text(s.currency)}): {money(s.amountMinor)}</b></p><p>Account: {text(object(s.accountSnapshot).name)} - {text(object(s.accountSnapshot).method)}</p><p>Reference: {rawText(s.reference)}</p><p>Actual payment time: {localTime(s.paidAt)}</p><p>Paid before: {money(s.paidBeforeMinor)} - Paid after: {money(s.paidAfterMinor)}</p>{Number(s.creditedMinor)>0&&<p>Supplier credit applied: {money(s.creditedMinor)}</p>}<p>Remaining payable: {money(s.outstandingAfterMinor)}</p><p>Reason: {text(s.reason)}</p><p>Confirmed by: {text(s.confirmedBy)}</p><p>{s.origin==='MANUALLY_CONFIRMED_PETTY_CASH'?'Manually confirmed petty cash outside the POS till.':'External payment manually confirmed by operator; no provider verification is asserted.'}</p></section>}
  {document.type==='EXPENSE_PAYMENT_VOUCHER'&&<section><p>Category: {text(object(s.category).name)}</p><p>Description: {text(s.description)}</p><p><b>Expense paid ({text(s.currency)}): {money(s.amountMinor)}</b></p><p>Payment account: {text(object(s.account).name)} - {text(object(s.account).method)}</p>{Boolean(s.reference)&&<p>Reference: {rawText(s.reference)}</p>}<p>Expense date: {localTime(s.occurredAt,timeZone)} · Recorded: {localTime(s.issuedAt,timeZone)}</p><p>Reason: {text(s.reason)}</p>{Boolean(object(s.asset).id)&&<p>Asset: {text(object(s.asset).assetTag)} · {text(object(s.asset).name)}</p>}{Boolean(object(s.workOrder).id)&&<p>Maintenance work order: {text(object(s.workOrder).title)}</p>}<p>Reviewed by: {text(s.approvedBy)||'Authorized expense recorder'}</p><p>{s.kind==='EXTERNAL'?'External funds were manually confirmed by staff; no payment-provider verification is asserted.':'Cash drawer outflow recorded in the linked till.'}</p></section>}
  {document.type==='CUSTOMER_CREDIT_INVOICE'&&<section><p>Customer: {text(object(s.customer).name)}</p><p>Order: {text(s.orderName)} ({text(s.orderId)})</p><p><b>Charged to customer account: {money(s.amountMinor)}</b></p><p>Payment received: {money(0)}</p><p>Due: {localTime(s.dueAt)} ({String(s.termsDays)} day terms)</p><p>Account balance before: {money(s.accountBalanceBeforeMinor)} - after: {money(s.accountBalanceAfterMinor)}</p><dl className="servos-document-totals"><div><dt>Net</dt><dd>{money(tax.netMinor)}</dd></div><div><dt>VAT</dt><dd>{money(tax.vatMinor)}</dd></div><div><dt>Levy</dt><dd>{money(tax.levyMinor)}</dd></div><div className="servos-document-grand-total"><dt>Credit invoice total (KES)</dt><dd>{money(s.amountMinor)}</dd></div></dl><p>This document records a customer account charge. It does not record payment or confirm money received.</p><p>Issued by: {text(s.issuedBy)}</p></section>}
  {document.type==='CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT'&&<section><p>Customer: {text(object(s.customer).name)}</p><p><b>Funds received: {money(s.amountMinor)} by {text(s.paymentMethod)}</b></p><p>Payment account: {text(object(s.paymentAccount).name)}</p>{Boolean(s.reference)&&<p>External reference: {rawText(s.reference)}</p>}<p>Received: {localTime(s.receivedAt)} · Recorded: {localTime(s.recordedAt)}</p><p>Customer balance before: {money(s.balanceBeforeMinor)} · after: {money(s.balanceAfterMinor)}</p><p>This acknowledgement records funds the cashier manually confirmed as received. It does not represent a payment-provider confirmation.</p></section>}
  {document.type==='CUSTOMER_CREDIT_WRITE_OFF_NOTICE'&&<section><p>Customer: {text(object(s.customer).name)}</p><p><b>Accounts-receivable write-off: {money(s.amountMinor)}</b></p><p>Balance before: {money(s.balanceBeforeMinor)} · after: {money(s.balanceAfterMinor)}</p><p>Reason: {text(s.reason)}</p><p>Recorded by: {text(s.recordedBy)} · {localTime(s.recordedAt)}</p><p>This is not a cash refund or customer payment.</p></section>}
  {document.type==='CUSTOMER_CREDIT_REVERSAL_NOTICE'&&<section><p>Customer: {text(object(s.customer).name)}</p><p><b>{text(s.kind)} reversal: {money(s.amountMinor)}</b></p><p>Original entry: {text(s.originalEntryId)} · Reversal entry: {text(s.entryId)}</p><p>Balance before: {money(s.balanceBeforeMinor)} · after: {money(s.balanceAfterMinor)}</p><p>Reason: {text(s.reason)}</p>{rawText(s.externalReference)&&<p>External return reference: {rawText(s.externalReference)}</p>}<p>Recorded by: {text(s.recordedBy)} · {localTime(s.recordedAt)}</p><p>{text(s.notice)}</p></section>}
  {document.type==='GOODS_RECEIPT'&&<section><p>Supplier: {text(object(s.supplier).name)}</p><p>Purchase order: {text(s.purchaseOrderNumber)}</p><p>Delivery reference: {rawText(s.deliveryReference)}</p><p>Receiving location: {text(s.locationId)}</p>{rows(s.items).map(line=><div key={rawText(line.id)}><p><b>{text(object(line.stockSnapshot).name)}</b></p><p>Unit: {text(object(line.purchasePackageSnapshot).name)||text(object(line.stockSnapshot).baseUnit)}</p><p>Delivered: {String(line.quantityDelivered)} - Accepted: {String(line.quantityAccepted)} - Rejected: {String(line.quantityRejected)}</p><p>Accepted base quantity: {String(line.baseQuantityAccepted)} {text(object(line.stockSnapshot).baseUnit)}</p><p>Unit cost: {money(line.unitPriceMinor)}</p><p>Previously accepted: {String(line.previousQuantityAccepted)} - Cumulative accepted: {String(line.cumulativeQuantityAccepted)}</p><p>Accepted value: {money(line.acceptedTotalMinor)}</p>{text(line.rejectionReason)&&<p>Rejection reason: {text(line.rejectionReason)}</p>}</div>)}<p><b>Accepted total: {money(s.acceptedTotalMinor)}</b></p><p>Receiving reason: {text(s.reason)}</p><p>Received by: {text(s.receivedBy)} - {localTime(s.issuedAt)}</p>{s.overReceiveAcknowledged===true&&<p>Over-receiving explicitly reviewed.</p>}<p>This GRN records goods receiving. It is not a supplier invoice or payment confirmation.</p></section>}
  {document.type==='PURCHASE_ORDER'&&<section><p>Supplier: {text(object(s.supplier).name)}</p><p>Supplier code: {text(object(s.supplier).code)}</p><p>{text(object(s.supplier).address)}</p><p>{text(object(s.supplier).phone)} {text(object(s.supplier).email)}</p><p>Expected delivery: {text(s.expectedDeliveryDate)||'Not specified'}</p>{rows(s.items).map(line=><div key={rawText(line.id)}><p><b>{text(object(line.stockSnapshot).name)}</b></p><p>{String(line.quantityOrdered)} {text(object(line.purchasePackageSnapshot).name)||text(object(line.stockSnapshot).baseUnit)} x {money(line.unitPriceMinor)} = {money(line.lineTotalMinor)}</p><p>Base quantity: {String(line.baseQuantityOrdered)} {text(object(line.stockSnapshot).baseUnit)}</p></div>)}<p><b>PO total: {money(s.subtotalMinor)}</b></p><p>{text(s.notes)}</p><p>Approved by: {text(s.approvedBy)} · {localTime(s.approvedAt)}</p><p>Issuing this document does not confirm supplier delivery or receipt of goods.</p></section>}
  {!['PURCHASE_ORDER','GOODS_RECEIPT'].includes(document.type)&&rows(s.items).length>0&&<section aria-label="Document items">{rows(s.items).map((line,index)=>{
   const product=object(line.productSnapshot),portion=object(line.portionSnapshot);
   return <div className="servos-document-line" key={rawText(line.id)||index}><b>{text(line.name)||text(product.name)}</b>{text(portion.name)&&<small>{text(portion.name)}</small>}{rows(line.modifierSnapshots).map((modifier,i)=><small key={i}>{text(modifier.name)}</small>)}{line.comped===true&&<small>Complimentary: {text(line.compReason)}</small>}{Number(line.discountMinor)>0&&<small>Reduction: {money(line.discountMinor)}</small>}{text(line.courseName)&&<small>Course: {text(line.courseName)}</small>}{text(line.notes)&&<small>{text(line.notes)}</small>}<div className="servos-document-line-values"><span>{number(line.quantity)?.toLocaleString('en-KE',{maximumFractionDigits:6})??'Unavailable'}{!ticket&&<> x {money(line.unitPriceMinor)}</>}</span>{!ticket&&<strong>{money(line.lineTotalMinor)}</strong>}</div></div>;
  })}</section>}
  {!ticket&&<>
   {document.type==='SALES_RECEIPT'&&<dl className="servos-document-totals"><div><dt>Net</dt><dd>{money(tax.netMinor)}</dd></div><div><dt>VAT</dt><dd>{money(tax.vatMinor)}</dd></div><div><dt>Levy</dt><dd>{money(tax.levyMinor)}</dd></div><div className="servos-document-grand-total"><dt>Total ({text(s.currency)||'KES'})</dt><dd>{money(s.totalMinor)}</dd></div></dl>}
   {document.type==='SALES_RECEIPT'&&Number(s.discountTotalMinor)>0&&<p>Discounts / comps: {money(s.discountTotalMinor)}</p>}{s.noPaymentRequired===true&&<p>No payment required. No money received.</p>}
   {document.type==='SALES_RECEIPT'&&Number(s.refundedAmountMinor)>0&&<p>Refunds recorded separately: {money(s.refundedAmountMinor)}</p>}
   {document.type==='PAYMENT_ACKNOWLEDGEMENT'&&<>{s.purpose==='ACCOMMODATION'&&<p>Guest: {text(object(s.guest).name)} ? Room {text(object(s.room).number)}</p>}<dl className="servos-document-totals"><div><dt>Received ({text(s.currency)||'KES'})</dt><dd>{money(s.amountReceivedMinor)}</dd></div><div><dt>{s.purpose==='ACCOMMODATION'?'Booked accommodation':'Order total'}</dt><dd>{money(s.orderTotalMinor)}</dd></div>{s.purpose==='ACCOMMODATION'&&<><div><dt>Cash received</dt><dd>{money(s.cashTenderedMinor)}</dd></div><div><dt>Change</dt><dd>{money(s.changeMinor)}</dd></div></>}<div><dt>Balance</dt><dd>{money(s.balanceMinor)}</dd></div></dl></>}
   {document.type==='REFUND_RECEIPT'&&<section><p><b>Returned: {money(s.amountReturnedMinor)}</b></p><p>Method: {text(s.method)}</p><p>Reason: {text(s.reason)}</p>{rawText(s.externalReference)&&<p>Return reference: {rawText(s.externalReference)}</p>}<p>Original payment: {text(s.paymentId)}</p>{Boolean(s.taxReversal)&&<dl className="servos-document-totals"><div><dt>Net reversed</dt><dd>{money(object(s.taxReversal).netMinor)}</dd></div><div><dt>VAT reversed</dt><dd>{money(object(s.taxReversal).vatMinor)}</dd></div><div><dt>Levy reversed</dt><dd>{money(object(s.taxReversal).levyMinor)}</dd></div></dl>}</section>}
   {document.type==='CLOSE_DAY_REPORT'&&<>
    <section><p>Till: {text(s.tillSessionId)}</p><p>Opened: {localTime(s.openedAt)}</p><p>Closed: {localTime(s.closedAt)}</p><p>Generated by: {text(s.generatedBy)}</p><p>Sales: receipts settled in this till. Collections: payment postings in this till, including partial payments. These totals can differ. This is not a calendar-day accrual report.</p></section>
    <section><h3>Settled sales</h3><p>Receipts: {String(object(s.settledSales).receiptCount??'Unavailable')}</p><dl className="servos-document-totals">{[['Gross','grossMinor'],['Net','netMinor'],['VAT','vatMinor'],['Levy','levyMinor']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>{money(object(s.settledSales)[key])}</dd></div>)}</dl></section>
    {s.customerCreditSales&&<section><h3>Customer credit sales / accrual (not cash received)</h3><p>Charges: {String(object(s.customerCreditSales).chargeCount)} Â· Reversals: {String(object(s.customerCreditSales).reversalCount)}</p><dl className="servos-document-totals">{[['Charged to accounts','chargedMinor'],['Charge reversals','reversedMinor'],['Net account sales','expectedNetMinor'],['Net sales revenue','revenueNetMinor'],['Net VAT','vatNetMinor'],['Net levy','levyNetMinor']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>{money(object(s.customerCreditSales)[key])}</dd></div>)}</dl></section>}
    <dl className="servos-document-totals">{[['Received',object(s.sales).receivedMinor],['Returned',object(s.sales).returnedMinor],['Net received',object(s.sales).netReceivedMinor]].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{money(value)}</dd></div>)}</dl>
    <section><h3>Tenders</h3>{rows(s.paymentsByTender).map((tender,index)=><div key={index}><p><b>{text(tender.method)} · {text(tender.name)}</b></p><p>Received {money(tender.receivedMinor)} · Returned {money(tender.returnedMinor)} · Net {money(tender.netMinor)}</p></div>)}</section>
    <section><h3>Revenue and tax allocations</h3>{['collected','reversed','net'].map(kind=>{const amounts=object(object(s.taxes)[kind]);return <p key={kind}>{kind}: Net {money(amounts.netMinor)} · VAT {money(amounts.vatMinor)} · Levy {money(amounts.levyMinor)}</p>})}</section>
    <section><h3>Customer credit collections</h3>{rows(object(s.customerCreditCollections).entries).map((tender,index)=><p key={index}>{text(tender.method)} - {text(tender.name)}: {String(tender.settlementCount)} settlement(s), {money(tender.receivedMinor)}</p>)}</section><section><h3>Drawer close</h3><dl className="servos-document-totals">{[['Opening float','openingFloatMinor'],['Paid in','paidInMinor'],['Paid out','paidOutMinor'],['Cash sales','salesMinor'],['Cash customer-credit collections','customerCreditCollectionsMinor'],['Cash customer-credit refunds','customerCreditRefundsMinor'],['Cash refunds','refundsMinor'],['Expected','expectedMinor'],['Counted','countedMinor'],['Variance','varianceMinor']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>{money(object(s.cash)[key])}</dd></div>)}</dl>{text(object(s.cash).varianceReason)&&<p>Variance reason: {text(object(s.cash).varianceReason)}</p>}{text(object(s.cash).reviewReason)&&<p>Manager review: {text(object(s.cash).reviewReason)}</p>}</section>
    <section><h3>Business diagnostics at generation</h3><p>Observed: {text(object(s.operationalDiagnostics).observedAt)}</p><p>Open orders: {String(object(s.operationalDiagnostics).openOrderCount??'Unavailable')} · Outstanding: {money(object(s.operationalDiagnostics).openOrderOutstandingMinor)}</p><p>Zero-value receipts without till attribution (business-wide): {String(object(s.operationalDiagnostics).unassignedZeroReceiptCount??'Unavailable')}</p><p>Unresolved money commands: {String(object(s.operationalDiagnostics).unresolvedMoneyCommandCount??'Unavailable')}</p><p>Hotel/folio exposure: unavailable until that API domain migrates. Customer-credit collections are reported separately from sale receipts.</p></section>
   </>}
   {rows(s.payments).length>0&&<section className="servos-document-payments"><h3>Payment</h3>{rows(s.payments).map((payment,index)=><div key={rawText(payment.id)||index}><p><b>{text(payment.method)}</b> {money(payment.amountMinor)}</p>{rawText(payment.reference)&&<p>Reference: {rawText(payment.reference)}</p>}{payment.method==='CASH'&&<p>Tendered {money(payment.cashTenderedMinor)} · Change {money(payment.changeMinor)}</p>}{payment.origin==='CASHIER_CONFIRMED_EXTERNAL'&&<p>Manually confirmed by cashier</p>}</div>)}</section>}
  </>}
  {isSnapshotPng(qr)&&<section className="servos-document-payment-qr"><SnapshotImage value={qr} label="Payment QR"/><p><strong>Optional M-Pesa pay-to QR</strong></p><p>This QR is not proof of payment. Do not pay again if this receipt is settled.</p></section>}
  <DocumentFooter document={document} attempt={attempt}/>
 </article>;
}

export const businessDocumentPreviewStyles=`
.servos-business-document{box-sizing:border-box;width:80mm;max-width:80mm;margin:0 auto;padding:2mm 4mm;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.25;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.servos-business-document *{box-sizing:border-box;max-width:100%;color:#000}
.servos-business-document h1,.servos-business-document h2,.servos-business-document h3{line-height:1.2;margin:1.5mm 0;font-size:11pt}
.servos-business-document h1{font-size:13pt}.servos-business-document h2{font-size:12pt}.servos-business-document p{margin:1mm 0;white-space:pre-wrap;overflow-wrap:anywhere}
.servos-document-header{border-bottom:1px solid #000;padding-bottom:2mm;margin-bottom:2mm}.servos-document-identity{text-align:center}.servos-document-logo{display:block;max-width:28mm;max-height:15mm;object-fit:contain;margin:0 auto;filter:grayscale(1)}
.servos-document-title{text-align:center;margin-top:2mm}.servos-document-number{font-weight:700;overflow-wrap:anywhere}.servos-document-state{display:inline-block;border:1px solid #000;padding:.5mm 1mm;font-size:9pt}.servos-document-state-voided{border-width:2px}
.servos-document-control{margin:2mm 0;font-size:9pt}.servos-document-control>div{margin:1mm 0}.servos-document-control dt{font-weight:600}.servos-document-control dd{margin:0;overflow-wrap:anywhere}.servos-document-payment-status{font-weight:600}
.servos-document-meta{border-bottom:1px solid #000;padding:1mm 0;margin:2mm 0}.servos-business-document section{margin:2mm 0;break-inside:auto}.servos-business-document section>h3{break-after:avoid}
.servos-document-line{border-bottom:1px dashed #000;padding:1.5mm 0;break-inside:avoid}.servos-document-line-values{display:flex;justify-content:space-between;gap:2mm;flex-wrap:wrap}.servos-business-document small{display:block;font-size:8pt;margin-top:.5mm}
.servos-document-totals{border-top:1px solid #000;padding-top:1mm;margin:2mm 0}.servos-document-totals div{display:flex;justify-content:space-between;gap:2mm;margin:1mm 0;flex-wrap:wrap}.servos-document-totals dt{text-align:left}.servos-document-totals dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}.servos-document-grand-total{font-weight:700;font-size:13pt;border-top:1px solid #000;padding-top:1mm}
.servos-document-payments{border-top:1px solid #000;padding:1mm 0}.servos-document-payment-qr{text-align:center;padding:2mm 0;break-inside:avoid}.servos-document-qr{display:block;width:34mm;height:34mm;object-fit:contain;margin:2mm auto}
.servos-business-document-footer{text-align:center;border-top:1px solid #000;margin-top:2mm;padding-top:1mm;white-space:pre-wrap;font-size:8pt;break-inside:avoid}.servos-business-document-footer p{margin:.5mm 0}
`;

export const businessDocumentStyles=`${businessDocumentPreviewStyles}
html,body{box-sizing:border-box;width:80mm;margin:0;padding:0;background:#fff;color:#000}
/* The OS driver must use an 80 mm roll. Automatic roll length is driver-dependent. */
@page{size:80mm 100mm;margin:0}
@media print{
 .servos-business-document{width:80mm;max-width:80mm;margin:0;padding:2mm 4mm}
 .servos-business-document img,.servos-document-header,.servos-business-document-footer{break-inside:avoid}
 .servos-business-document h3{break-after:avoid-page}
}
`;

/** A valid two-length page rule; printed height follows the measured thermal content. */
export function thermalPrintPageStyle(contentHeightPx:number){
 if(!Number.isFinite(contentHeightPx)||contentHeightPx<=0)throw new Error('Thermal document height could not be measured. Physical print is unavailable.');
 const heightMm=Math.max(30,Math.ceil(contentHeightPx*25.4/96)+2);
 return `@page{size:80mm ${heightMm}mm;margin:0}`;
}

/** Browser dialogs cannot prove that paper was delivered, including on cancel. */
export async function printBusinessDocument(document:LocalBusinessDocument,options:{attempt?:number}={}):Promise<{delivery:'UNKNOWN'}>{
 if(document.layoutVersion!==1||!titles[document.type])throw new Error('This document layout is not supported by this browser renderer.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(document.snapshot)));
 const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(hash!==document.hash)throw new Error('The document snapshot hash does not match. Synchronize the issued document before printing.');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const attempt=Number.isSafeInteger(options.attempt)&&Number(options.attempt)>0?Number(options.attempt):1;
 const markup=renderToStaticMarkup(<BusinessDocumentRenderer document={document} attempt={attempt}/>);
 documentPaperProfile(document.type);
 const frame=window.document.createElement('iframe'),frameWidth='80mm';
 frame.title='ServOS document print';frame.style.cssText=`position:fixed;left:-10000px;top:0;width:${frameWidth};height:100mm;border:0`;
 let loadTimer:number|undefined;
 const loaded=new Promise<void>((resolve,reject)=>{loadTimer=window.setTimeout(()=>reject(new Error('Print document preparation timed out.')),15000);frame.onload=()=>{window.clearTimeout(loadTimer);resolve()};frame.onerror=()=>{window.clearTimeout(loadTimer);reject(new Error('Unable to prepare the print document.'))};});
 frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><title>ServOS document</title><style>${businessDocumentStyles}</style></head><body>${markup}</body></html>`;
 window.document.body.appendChild(frame);
 let transportStarted=false;
 try{
  await loaded;
  const target=frame.contentWindow;if(!target)throw new Error('The print frame is unavailable.');
  await Promise.all(Array.from(frame.contentDocument?.images||[],img=>img.decode()));
  await frame.contentDocument?.fonts?.ready;
  const sheet=frame.contentDocument?.querySelector<HTMLElement>('.servos-business-document');if(!sheet)throw new Error('Thermal document content is unavailable.');
  const pageStyle=frame.contentDocument!.createElement('style');pageStyle.textContent=thermalPrintPageStyle(sheet.getBoundingClientRect().height);frame.contentDocument!.head.appendChild(pageStyle);
  if(!pageStyle.sheet?.cssRules.length)throw new Error('This browser cannot apply the 80 mm print page rule.');
  target.focus();transportStarted=true;target.print();
  return {delivery:'UNKNOWN'};
 }catch(error){if(transportStarted)return {delivery:'UNKNOWN'};throw error}
 finally{window.clearTimeout(loadTimer);window.setTimeout(()=>frame.remove(),60000)}
}
