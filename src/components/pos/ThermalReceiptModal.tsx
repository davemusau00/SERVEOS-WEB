import React, { useState } from 'react';
import type { Order } from '../../types/servos';
import { useServOS } from '../../context/ServOSContext';
import { isNative } from '../../runtime/RuntimeProvider';
import { RECEIPT_FOOTER } from '../../types/receipt';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  isProForma?: boolean;
  paymentDetails?: {
    tenderType: string;
    receiptRef?: string;
    cashTendered?: number;
    changeDue?: number;
    guestName?: string;
    roomNumber?: string;
  };
}

export const ThermalReceiptModal = ({ isOpen, onClose, order, paymentDetails, isProForma = false }: Props) => {
  const { currentProperty, currentOutlet, currentUser } = useServOS();
  const [message, setMessage] = useState('');
  if (!isOpen || !order) return null;

  const title = isProForma ? 'Pro-forma bill' : 'Receipt';
  const money = (amount?: number) => `KES ${(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const occurredAt = new Date(order.completedAt || order.createdAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
  const paid = order.amountPaid;
  const lines = order.items.map(item => `${item.quantity} x ${item.productName}: ${money(item.totalPrice)}`);
  const copyText = (label: string, internal: boolean) => [
    currentProperty.name,
    currentOutlet.name,
    label,
    `Order: ${order.orderNumber}`,
    `Date: ${occurredAt}`,
    ...(internal ? [`Order ID: ${order.id}`, `Served by: ${currentUser.name}`] : []),
    ...lines,
    `Total: ${money(order.grandTotal)}`,
    paymentDetails ? `Tender: ${paymentDetails.tenderType}` : `Paid: ${money(paid)}`,
    paymentDetails?.receiptRef ? `Reference: ${paymentDetails.receiptRef}` : '',
    paymentDetails?.changeDue ? `Change: ${money(paymentDetails.changeDue)}` : '',
    'Thank you.',
    ...RECEIPT_FOOTER
  ].filter(Boolean).join('\n');
  const customerText = copyText(isProForma ? 'PRO-FORMA BILL' : 'CUSTOMER COPY', false);
  const businessText = copyText('BUSINESS RECORD COPY - RETAIN FOR RECONCILIATION', true);
  const download = () => {
    const content = isProForma ? customerText : `${customerText}\n\n${'='.repeat(32)}\n\n${businessText}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `receipts-${order.orderNumber.replace(/[^a-z0-9_-]/gi, '')}.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="receipt-heading" className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-5">
      <header className="flex justify-between"><h2 id="receipt-heading" className="text-xl font-bold">{title}</h2><button onClick={onClose} aria-label="Close receipt">Close</button></header>
      <div className="space-y-4">
        <ReceiptCopy className="receipt-print-copy" business={currentProperty.name} outlet={currentOutlet.name} label={isProForma ? 'PRO-FORMA BILL' : 'CUSTOMER COPY'} orderNumber={order.orderNumber} occurredAt={occurredAt} items={order.items} total={order.grandTotal} money={money} paymentDetails={paymentDetails} paid={paid} />
        {!isProForma && <ReceiptCopy className="receipt-print-copy business-copy" business={currentProperty.name} outlet={currentOutlet.name} label="BUSINESS RECORD COPY - RETAIN FOR RECONCILIATION" orderNumber={order.orderNumber} orderId={order.id} cashier={currentUser.name} occurredAt={occurredAt} items={order.items} total={order.grandTotal} money={money} paymentDetails={paymentDetails} paid={paid} />}
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="rounded bg-amber-400 p-2 text-slate-950" onClick={() => { window.print(); setMessage(isNative ? 'Print dialog opened. Choose the installed Xprinter XP-80T queue; customer and business copies are in this print job.' : 'Preview only. In the installed app, choose the Xprinter XP-80T queue; both copies print in one job.'); }}>{isProForma ? 'Print / save PDF' : 'Print both receipt copies'}</button>
        <button className="rounded border border-slate-600 p-2" onClick={download}>Download both copies</button>
        <button className="rounded border border-slate-600 p-2" onClick={() => void navigator.clipboard.writeText(isProForma ? customerText : `${customerText}\n\n${businessText}`).then(() => setMessage('Receipt text copied.')).catch(() => setMessage('Clipboard unavailable; use Download text.'))}>Copy text</button>
      </div>
      {message && <p role="status" className="text-xs">{message}</p>}
    </section>
    <style>{`@media print {
      @page { size: 80mm auto; margin: 3mm; }
      body * { visibility: hidden !important; }
      .receipt-print-copy, .receipt-print-copy * { visibility: visible !important; }
      .receipt-print-copy { display: block !important; position: relative; width: 74mm; margin: 0; padding: 2mm 0; color: #000; background: #fff; font-family: monospace; font-size: 9pt; break-after: page; page-break-after: always; }
      .receipt-print-copy:last-child { break-after: auto; page-break-after: auto; }
    }
    @media screen { .receipt-print-copy { border: 1px solid rgb(51 65 85); border-radius: .5rem; background: #fff; color: #000; padding: 1rem; font-family: monospace; font-size: .75rem; } }
    `}</style>
  </div>;
};

const ReceiptCopy = ({ className, business, outlet, label, orderNumber, orderId, cashier, occurredAt, items, total, money, paymentDetails, paid }: {
  className: string; business: string; outlet: string; label: string; orderNumber: string; orderId?: string; cashier?: string; occurredAt: string;
  items: Order['items']; total: number; money: (amount?: number) => string; paymentDetails?: Props['paymentDetails']; paid: number;
}) => <article className={className}>
  <h3 className="text-center font-bold">{business}</h3>
  <p className="text-center">{outlet}</p>
  {!isNative && <p className="text-center font-bold">SAMPLE - UI PREVIEW</p>}
  <p className="text-center font-bold">{label}</p>
  <p>Receipt: {orderNumber}</p>
  {orderId && <p>Transaction ID: {orderId}</p>}
  <p>{occurredAt}</p>
  {cashier && <p>Cashier: {cashier}</p>}
  <table className="w-full"><thead><tr><th className="text-left">Item</th><th>Qty</th><th className="text-right">Amount</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td className="py-1">{item.productName}</td><td className="text-center">{item.quantity}</td><td className="text-right">{money(item.totalPrice)}</td></tr>)}</tbody></table>
  <p className="border-t pt-2 font-bold">Total: {money(total)}</p>
  {paymentDetails && <><p>Recorded tender: {paymentDetails.tenderType}</p>{paymentDetails.receiptRef&&<p>Reference: {paymentDetails.receiptRef}</p>}{paymentDetails.guestName&&<p>Guest: {paymentDetails.guestName}</p>}{paymentDetails.roomNumber&&<p>Room: {paymentDetails.roomNumber}</p>}{paymentDetails.changeDue? <p>Change: {money(paymentDetails.changeDue)}</p>:null}{paymentDetails.tenderType==='MPESA'&&<p>Manually confirmed; reconciliation is recorded separately.</p>}</>}
  {!paymentDetails&&<p>Paid: {money(paid)}</p>}
  <p className="text-center">Thank you.</p>
  <footer className="mt-3 text-center text-[9px]">{RECEIPT_FOOTER.map(line=><div key={line}>{line}</div>)}</footer>
</article>;
