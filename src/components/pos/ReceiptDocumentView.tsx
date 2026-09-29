import React from 'react';
import { createPortal } from 'react-dom';
import { RECEIPT_FOOTER, type ReceiptDocument } from '../../types/receipt';

export function ReceiptDocumentView({document:d,business=false,reprint=false}:{document:ReceiptDocument;business?:boolean;reprint?:boolean}) {
  const money=(minor:number)=>`${d.currency} ${(minor/100).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const row=(label:string,value:number,strong=false)=><div className={`receipt-total ${strong?'receipt-strong':''}`}><span>{label}</span><span>{money(value)}</span></div>;
  let date=d.issuedAt;
  try { date=new Date(d.issuedAt).toLocaleString('en-KE',{timeZone:d.timezone}); } catch { /* Retain persisted timestamp if a historical timezone is unsupported. */ }
  return <article className="native-receipt-copy">
    <header className="receipt-heading"><h3>{d.business.name}</h3>{[d.business.address,d.business.phone,d.business.email,d.outlet].filter(Boolean).map((v,i)=><div key={i}>{v}</div>)}<b>{business?'BUSINESS RECORD COPY - RETAIN FOR RECONCILIATION':'CUSTOMER COPY'}</b>{reprint&&<div><b>REPRINT</b></div>}</header>
    <div className="receipt-meta">Receipt: {d.number}<br/>Order: {d.orderNumber}<br/>{date}<br/>Cashier: {d.cashier}{d.table&&<div>Table: {d.table}</div>}{d.tab&&<div>Tab: {d.tab}</div>}</div>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>{d.items.map(item=><React.Fragment key={item.id}><tr><td colSpan={4} className="receipt-item-name">{item.description}{item.portion&&<div className="receipt-detail">{item.portion}</div>}{item.modifiers.map((m,i)=><div className="receipt-detail" key={i}>+ {m}</div>)}</td></tr><tr><td/><td>{item.quantity}</td><td>{(item.unitPriceMinor/100).toFixed(2)}</td><td>{(item.amountMinor/100).toFixed(2)}</td></tr></React.Fragment>)}</tbody></table>
    <section className="receipt-totals">{row('Subtotal',d.subtotalMinor)}{d.discountMinor>0&&row('Discount',-d.discountMinor)}{row('Net after discount',d.netMinor)}{d.taxMinor>0&&row('VAT included',d.taxMinor)}{d.levyMinor>0&&row('Levy included',d.levyMinor)}{row('TOTAL',d.totalMinor,true)}</section>
    <section>{d.payments.map(p=><div className="receipt-payment" key={p.id}>{row(p.tenderType,p.amountMinor)}{p.reference&&<div className="receipt-detail">Ref: {p.reference}</div>}{p.cashTenderedMinor!=null&&row('Cash tendered',p.cashTenderedMinor)}{p.changeMinor!=null&&row('Change',p.changeMinor)}</div>)}{row('Paid',d.paidMinor)}{row('Balance',d.balanceMinor,true)}</section>
    {business&&<div className="receipt-detail receipt-meta">Transaction: {d.orderId}</div>}
    <footer>{d.message&&<p>{d.message}</p>}<div className="receipt-attribution">{RECEIPT_FOOTER.map(line=><div key={line}>{line}</div>)}</div></footer>
  </article>;
}

export function ReceiptPrintRoot({document,reprint=false}:{document:ReceiptDocument;reprint?:boolean}) {
  return createPortal(<div id="servos-receipt-print"><ReceiptDocumentView document={document} reprint={reprint}/><ReceiptDocumentView document={document} business reprint={reprint}/></div>,window.document.body);
}

export const receiptStyles=`
.native-receipt-copy{box-sizing:border-box;width:100%;max-width:74mm;margin:0 auto;background:white;color:black;padding:4mm;font:11px/1.4 ui-monospace,monospace;overflow-wrap:anywhere}
.receipt-heading{text-align:center;margin-bottom:3mm}.receipt-heading h3{font-size:16px;font-weight:bold;margin:0}.receipt-heading b{display:block;margin-top:2mm}
.receipt-meta{margin:2mm 0}.native-receipt-copy table{border-collapse:collapse;width:100%;table-layout:fixed}.native-receipt-copy th,.native-receipt-copy td{text-align:right;vertical-align:top}.native-receipt-copy th:first-child{width:20%;text-align:left}.native-receipt-copy th:nth-child(2){width:12%}.native-receipt-copy th:nth-child(3){width:30%}.native-receipt-copy th:last-child{width:38%}.native-receipt-copy thead{border-top:1px dashed black;border-bottom:1px dashed black}.native-receipt-copy td.receipt-item-name{text-align:left;padding-top:2mm}.receipt-detail{font-size:10px}.receipt-totals{border-top:1px dashed black;margin-top:3mm;padding-top:2mm}.receipt-total{display:flex;justify-content:space-between;gap:2mm}.receipt-total span:last-child{text-align:right;white-space:nowrap}.receipt-strong{font-weight:bold;margin:2mm 0}.receipt-payment{margin:2mm 0}.native-receipt-copy footer{text-align:center;margin-top:4mm}.receipt-attribution{font-size:9px;margin-top:3mm}#servos-receipt-print{display:none}
@media print{@page{size:80mm auto;margin:3mm}html,body{height:auto!important;overflow:visible!important;background:white!important}body> :not(#servos-receipt-print){display:none!important}#servos-receipt-print{display:block!important;width:74mm;margin:0;padding:0}.native-receipt-copy{width:74mm;max-width:none;padding:2mm 0;break-after:page;page-break-after:always}.native-receipt-copy:last-child{break-after:auto;page-break-after:auto}.native-receipt-copy tr,.receipt-payment,.native-receipt-copy footer{break-inside:avoid}}
`;
