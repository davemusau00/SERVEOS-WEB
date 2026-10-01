import { LEGACY_RECEIPT_FOOTER, RECEIPT_FOOTER, type ReceiptDocument } from '../types/receipt';

export function receiptMoney(minor:number,currency:string):string{
  return `${currency} ${(minor/100).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

export function receiptText(document:ReceiptDocument,businessCopy=false,reprint=false):string{
  const lines=[document.business.name,document.business.address,document.business.phone,document.business.email,document.outlet,
    businessCopy?'BUSINESS RECORD COPY':'CUSTOMER COPY',...(reprint?['REPRINT']:[]),`Receipt: ${document.number}`,`Order: ${document.orderNumber}`,
    !businessCopy&&document.customerName?`Customer: ${document.customerName}`:undefined,
    document.issuedAt?new Date(document.issuedAt).toLocaleString('en-KE',{timeZone:document.timezone}):undefined,
    `Cashier: ${document.cashier}`,document.table?`Table: ${document.table}`:undefined,document.tab?`Tab: ${document.tab}`:undefined,'--------------------------------'];
  for(const item of document.items){lines.push(item.description,...(item.portion?[`  ${item.portion}`]:[]),...item.modifiers.map(value=>`  + ${value}`),`${item.quantity} x ${receiptMoney(item.unitPriceMinor,document.currency)}  ${receiptMoney(item.amountMinor,document.currency)}`)}
  lines.push('--------------------------------',`Subtotal: ${receiptMoney(document.subtotalMinor,document.currency)}`);
  if(document.discountMinor)lines.push(`Discount: -${receiptMoney(document.discountMinor,document.currency)}`);
  if(document.taxMinor)lines.push(`VAT included: ${receiptMoney(document.taxMinor,document.currency)}`);
  if(document.levyMinor)lines.push(`Levy included: ${receiptMoney(document.levyMinor,document.currency)}`);
  lines.push(`TOTAL: ${receiptMoney(document.totalMinor,document.currency)}`);
  for(const payment of document.payments){lines.push(`${payment.tenderType}: ${receiptMoney(payment.amountMinor,document.currency)}`);if(payment.reference&&/M[\s_-]?PESA/i.test(payment.tenderType))lines.push(`M-Pesa ref: ${payment.reference}`);if(payment.cashTenderedMinor!=null)lines.push(`Cash tendered: ${receiptMoney(payment.cashTenderedMinor,document.currency)}`);if(payment.changeMinor!=null)lines.push(`Change: ${receiptMoney(payment.changeMinor,document.currency)}`)}
  lines.push(`Paid: ${receiptMoney(document.paidMinor,document.currency)}`,`Balance: ${receiptMoney(document.balanceMinor,document.currency)}`);
  if(businessCopy)lines.push('Business record copy');
  if(document.message)lines.push(document.message);
  // Plain text cannot carry image data; mark the position only. Never emit QR base64.
  if(!businessCopy&&document.brandingSnapshot?.mpesaTillQr?.enabled)lines.push(document.brandingSnapshot.mpesaTillQr.label?`M-Pesa Till QR (${document.brandingSnapshot.mpesaTillQr.label}) - included on customer print`:'M-Pesa Till QR: included on customer print');
  lines.push(...(document.brandingSnapshot?.footerLines||(document.schemaVersion===1?LEGACY_RECEIPT_FOOTER:RECEIPT_FOOTER)));
  if(!businessCopy&&document.brandingSnapshot?.receiptLogoDataUrl)lines.push('[Business receipt logo follows]');
  return lines.filter((line):line is string=>Boolean(line)).join('\n');
}
