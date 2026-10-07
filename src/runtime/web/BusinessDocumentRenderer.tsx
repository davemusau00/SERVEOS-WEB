import React from 'react';
import type {LocalBusinessDocument} from './BusinessStore';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.map(object):[];
const text=(value:unknown)=>typeof value==='string'?value:'';
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const money=(value:unknown)=>{const amount=number(value);return amount===null?'—':(amount/100).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});};
const localTime=(value:unknown)=>{const raw=text(value),date=new Date(raw);return raw&&Number.isFinite(date.getTime())?date.toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}):raw;};
const titles:Record<string,string>={SALES_RECEIPT:'Sales receipt',PAYMENT_ACKNOWLEDGEMENT:'Payment acknowledgement',KOT:'Kitchen order ticket',BOT:'Bar order ticket',REFUND_RECEIPT:'Refund receipt',CLOSE_DAY_REPORT:'Close-day report'};
const canonical=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;

const isSnapshotPng=(value:unknown):value is string=>typeof value==='string'&&value.length<=2_800_000&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value);

/** Logo and QR use the same bounded embedded PNG pipeline; no mutable remote URLs. */
function SnapshotImage({value,label}:{value:unknown;label:string}){
 if(!isSnapshotPng(value))return null;
 return <img className={label==='Payment QR'?'servos-document-qr':'servos-document-logo'} src={value} alt={label}/>;
}

export function BusinessDocumentRenderer({document}:{document:LocalBusinessDocument}){
 const s=document.snapshot,b=object(s.business),tax=object(s.taxes),cashier=object(s.cashier);
 const ticket=['KOT','BOT'].includes(document.type);
 const qr=document.type==='CLOSE_DAY_REPORT'?'':text(b.paymentQrPngDataUrl);
 const issued=new Date(document.issuedAt);
 return <article className="servos-business-document" aria-label={titles[document.type]||document.type}>
  <header>
   <SnapshotImage value={b.logoPngDataUrl} label="Business logo"/>
   {text(b.businessName)&&<h1>{text(b.businessName)}</h1>}
   {text(b.address)&&<p>{text(b.address)}</p>}
   {text(b.contact)&&<p>{text(b.contact)}</p>}
   {text(b.taxPin)&&<p>Tax PIN: {text(b.taxPin)}</p>}
   <h2>{titles[document.type]||document.type}</h2>
   <p className="servos-document-number">{document.documentNumber}</p>
   <p>{Number.isFinite(issued.getTime())?issued.toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}):document.issuedAt}</p>
  </header>
  <section className="servos-document-meta">
   {text(s.orderName)&&<p>Order: {text(s.orderName)}</p>}
   {(text(cashier.name)||text(s.staffId))&&<p>Cashier: {text(cashier.name)||text(s.staffId)}</p>}
   {text(s.serviceDestination)&&<p>Service: {text(s.serviceDestination)}</p>}
  </section>
  {rows(s.items).length>0&&<table><thead><tr><th>Item</th><th>Qty</th>{!ticket&&<><th>Price</th><th>Amount</th></>}</tr></thead><tbody>{rows(s.items).map((line,index)=>{
   const product=object(line.productSnapshot),portion=object(line.portionSnapshot);
   return <tr key={text(line.id)||index}><td>{text(line.name)||text(product.name)}{text(portion.name)&&<small>{text(portion.name)}</small>}{rows(line.modifierSnapshots).map((modifier,i)=><small key={i}>{text(modifier.name)}</small>)}{text(line.notes)&&<small>{text(line.notes)}</small>}</td><td>{number(line.quantity)?.toLocaleString('en-KE',{maximumFractionDigits:6})??'—'}</td>{!ticket&&<><td>{money(line.unitPriceMinor)}</td><td>{money(line.lineTotalMinor)}</td></>}</tr>;
  })}</tbody></table>}
  {!ticket&&<>
   {document.type==='SALES_RECEIPT'&&<dl className="servos-document-totals"><div><dt>Net</dt><dd>{money(tax.netMinor)}</dd></div><div><dt>VAT</dt><dd>{money(tax.vatMinor)}</dd></div><div><dt>Levy</dt><dd>{money(tax.levyMinor)}</dd></div><div className="servos-document-grand-total"><dt>Total ({text(s.currency)||'KES'})</dt><dd>{money(s.totalMinor)}</dd></div></dl>}
   {document.type==='SALES_RECEIPT'&&Number(s.refundedAmountMinor)>0&&<p>Refunds recorded separately: {money(s.refundedAmountMinor)}</p>}
   {document.type==='PAYMENT_ACKNOWLEDGEMENT'&&<dl className="servos-document-totals"><div><dt>Received ({text(s.currency)||'KES'})</dt><dd>{money(s.amountReceivedMinor)}</dd></div><div><dt>Order total</dt><dd>{money(s.orderTotalMinor)}</dd></div><div><dt>Balance</dt><dd>{money(s.balanceMinor)}</dd></div></dl>}
   {document.type==='REFUND_RECEIPT'&&<section><p><b>Returned: {money(s.amountReturnedMinor)}</b></p><p>Method: {text(s.method)}</p><p>Reason: {text(s.reason)}</p>{text(s.externalReference)&&<p>Return reference: {text(s.externalReference)}</p>}<p>Original payment: {text(s.paymentId)}</p>{s.taxReversal&&<dl className="servos-document-totals"><div><dt>Net reversed</dt><dd>{money(object(s.taxReversal).netMinor)}</dd></div><div><dt>VAT reversed</dt><dd>{money(object(s.taxReversal).vatMinor)}</dd></div><div><dt>Levy reversed</dt><dd>{money(object(s.taxReversal).levyMinor)}</dd></div></dl>}</section>}
   {document.type==='CLOSE_DAY_REPORT'&&<>
    <section><p>Till: {text(s.tillSessionId)}</p><p>Opened: {localTime(s.openedAt)}</p><p>Closed: {localTime(s.closedAt)}</p><p>Generated by: {text(s.generatedBy)}</p><p>Sales: receipts settled in this till. Collections: payment postings in this till, including partial payments. These totals can differ. This is not a calendar-day accrual report.</p></section>
    <section><h3>Settled sales</h3><p>Receipts: {String(object(s.settledSales).receiptCount??'Unavailable')}</p><dl className="servos-document-totals">{[['Gross','grossMinor'],['Net','netMinor'],['VAT','vatMinor'],['Levy','levyMinor']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>{money(object(s.settledSales)[key])}</dd></div>)}</dl></section>
    <dl className="servos-document-totals">{[['Received',object(s.sales).receivedMinor],['Returned',object(s.sales).returnedMinor],['Net received',object(s.sales).netReceivedMinor]].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{money(value)}</dd></div>)}</dl>
    <section><h3>Tenders</h3>{rows(s.paymentsByTender).map((tender,index)=><div key={index}><p><b>{text(tender.method)} · {text(tender.name)}</b></p><p>Received {money(tender.receivedMinor)} · Returned {money(tender.returnedMinor)} · Net {money(tender.netMinor)}</p></div>)}</section>
    <section><h3>Revenue and tax allocations</h3>{['collected','reversed','net'].map(kind=>{const amounts=object(object(s.taxes)[kind]);return <p key={kind}>{kind}: Net {money(amounts.netMinor)} · VAT {money(amounts.vatMinor)} · Levy {money(amounts.levyMinor)}</p>})}</section>
    <section><h3>Drawer close</h3><dl className="servos-document-totals">{[['Opening float','openingFloatMinor'],['Paid in','paidInMinor'],['Paid out','paidOutMinor'],['Cash sales','salesMinor'],['Cash refunds','refundsMinor'],['Expected','expectedMinor'],['Counted','countedMinor'],['Variance','varianceMinor']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>{money(object(s.cash)[key])}</dd></div>)}</dl>{text(object(s.cash).varianceReason)&&<p>Variance reason: {text(object(s.cash).varianceReason)}</p>}{text(object(s.cash).reviewReason)&&<p>Manager review: {text(object(s.cash).reviewReason)}</p>}</section>
    <section><h3>Business diagnostics at generation</h3><p>Observed: {text(object(s.operationalDiagnostics).observedAt)}</p><p>Open orders: {String(object(s.operationalDiagnostics).openOrderCount??'Unavailable')} · Outstanding: {money(object(s.operationalDiagnostics).openOrderOutstandingMinor)}</p><p>Unresolved money commands: {String(object(s.operationalDiagnostics).unresolvedMoneyCommandCount??'Unavailable')}</p><p>Credit and room/folio exposure: unavailable until those API domains migrate.</p></section>
   </>}
   {rows(s.payments).length>0&&<section className="servos-document-payments"><h3>Payment</h3>{rows(s.payments).map((payment,index)=><div key={text(payment.id)||index}><p><b>{text(payment.method)}</b> {money(payment.amountMinor)}</p>{text(payment.reference)&&<p>Reference: {text(payment.reference)}</p>}{payment.method==='CASH'&&<p>Tendered {money(payment.cashTenderedMinor)} · Change {money(payment.changeMinor)}</p>}{payment.origin==='CASHIER_CONFIRMED_EXTERNAL'&&<p>Manually confirmed by cashier</p>}</div>)}</section>}
  </>}
  {isSnapshotPng(qr)&&<section className="servos-document-payment-qr"><SnapshotImage value={qr} label="Payment QR"/><p>Scan to Pay via One app</p></section>}
  {text(s.footer||b.footer)&&<footer>{text(s.footer||b.footer)}</footer>}
 </article>;
}

export const businessDocumentStyles=`
html,body{margin:0;background:white;color:#000;font-family:Arial,sans-serif;font-size:12px}
.servos-business-document{box-sizing:border-box;width:74mm;max-width:100%;margin:0 auto;padding:2mm;overflow-wrap:anywhere}
.servos-business-document header{text-align:center}.servos-business-document h1{font-size:18px;margin:4px 0}.servos-business-document h2{font-size:14px;margin:7px 0}.servos-business-document h3{font-size:12px;margin:6px 0}.servos-business-document p{margin:3px 0;white-space:pre-wrap}
.servos-document-logo{display:block;max-width:46mm;max-height:24mm;object-fit:contain;margin:0 auto 3mm}.servos-document-qr{display:block;width:36mm;height:36mm;object-fit:contain;margin:3mm auto 1mm}.servos-document-payment-qr{text-align:center;break-inside:avoid}
.servos-document-meta{border-top:1px dashed #000;padding:2mm 0}.servos-business-document table{border-collapse:collapse;width:100%;table-layout:fixed}.servos-business-document th,.servos-business-document td{padding:2mm 1mm;vertical-align:top;text-align:right}.servos-business-document th:first-child,.servos-business-document td:first-child{text-align:left;width:43%}.servos-business-document thead{border-bottom:1px dashed #000}.servos-business-document small{display:block;font-size:10px;margin-top:2px}.servos-business-document tr{break-inside:avoid}
.servos-document-totals{border-top:1px dashed #000;padding-top:2mm}.servos-document-totals div{display:flex;justify-content:space-between;gap:2mm;margin:1mm 0}.servos-document-totals dd{margin:0}.servos-document-grand-total{font-weight:bold;font-size:14px}.servos-document-payments{border-top:1px dashed #000;padding:1mm 0}.servos-business-document footer{text-align:center;border-top:1px dashed #000;margin-top:3mm;padding-top:2mm;white-space:pre-wrap}
@media print{@page{margin:3mm}body{width:74mm}.servos-business-document{margin:0;padding:0}header,footer{break-inside:avoid}}
`;

/** Browser dialogs cannot prove that paper was delivered, including on cancel. */
export async function printBusinessDocument(document:LocalBusinessDocument):Promise<{delivery:'UNKNOWN'}>{
 if(document.layoutVersion!==1||!titles[document.type])throw new Error('This document layout is not supported by this browser renderer.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(document.snapshot)));
 const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(hash!==document.hash)throw new Error('The document snapshot hash does not match. Synchronize the issued document before printing.');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const markup=renderToStaticMarkup(<BusinessDocumentRenderer document={document}/>);
 const frame=window.document.createElement('iframe');
 frame.title='ServOS document print';frame.style.cssText='position:fixed;left:-10000px;top:0;width:80mm;height:100mm;border:0';
 let loadTimer:number|undefined;
 const loaded=new Promise<void>((resolve,reject)=>{loadTimer=window.setTimeout(()=>reject(new Error('Print document preparation timed out.')),15000);frame.onload=()=>{window.clearTimeout(loadTimer);resolve()};frame.onerror=()=>{window.clearTimeout(loadTimer);reject(new Error('Unable to prepare the print document.'))};});
 frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><title>ServOS document</title><style>${businessDocumentStyles}</style></head><body>${markup}</body></html>`;
 window.document.body.appendChild(frame);
 let transportStarted=false;
 try{
  await loaded;
  const target=frame.contentWindow;if(!target)throw new Error('The print frame is unavailable.');
  await Promise.all(Array.from(frame.contentDocument?.images||[],img=>img.decode()));
  target.focus();transportStarted=true;target.print();
  return {delivery:'UNKNOWN'};
 }catch(error){if(transportStarted)return {delivery:'UNKNOWN'};throw error}
 finally{window.clearTimeout(loadTimer);window.setTimeout(()=>frame.remove(),60000)}
}
