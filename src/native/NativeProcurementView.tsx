import React, { useEffect, useState } from 'react';
import { Barcode, ClipboardCheck, Plus, Truck } from 'lucide-react';
import { useRuntime } from '../runtime/RuntimeProvider';
import type { Permission } from '../types/runtime';
import { barcodeEquals, useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { ReceiptCorrectionDialog } from './ReceiptCorrectionDialog';
import { SimpleReceiveDelivery } from './SimpleReceiveDelivery';
import { ActionDialog } from './ActionDialog';
import { ManagerApprovalDialog } from './ManagerApprovalDialog';
import { ClassifiedPurchaseOrderDialog } from './ClassifiedPurchaseOrderDialog';
import { buttonClass, fieldClass, money, primaryButtonClass, recordOf, recordsOf, shortDate } from './records';

type ReceiptDraftLine = { delivered: number; rejected: number; rejectionReason: string };
const dateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const procurementLineKey = (line: any) => String(line.lineId || line.stockItemId || '');

export function NativeProcurementView({ onOpenCatalog, initialAction = '' }: { onOpenCatalog: () => void; initialAction?: string }) {
  const runtime = useRuntime();
  const snapshot = runtime.snapshot!;
  const suppliers = recordsOf(snapshot, 'suppliers');
  const stockItems = recordsOf(snapshot, 'stockItems');
  const locations = recordsOf(snapshot, 'stockLocations');
  const orders = recordsOf(snapshot, 'purchaseOrders').slice().reverse();
  const receipts = recordsOf(snapshot, 'goodsReceipts').slice().reverse();
  const payables = recordsOf(snapshot, 'supplierPayables').slice().reverse();
  const supplierPayments = recordsOf(snapshot, 'supplierPayments').slice().reverse();
  const permissions = snapshot.actor.permissions;
  const canManage = permissions.includes('procurement.manage');
  const canReceive = permissions.includes('procurement.receive');
  const canViewPayables = permissions.includes('accounting.view');
  const canEditCatalog = permissions.includes('catalog.manage');
  const canPay = permissions.includes('procurement.pay');

  const [simpleReceive, setSimpleReceive] = useState(initialAction === 'receive-delivery');
  useEffect(() => { if (initialAction === 'receive-delivery') setSimpleReceive(true); }, [initialAction]);
  const [section, setSection] = useState<'ORDERS' | 'RECEIPTS' | 'PAYABLES'>('ORDERS');
  const [notice, setNotice] = useState('');
  const [correctingReceipt,setCorrectingReceipt]=useState<any|null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [classifiedOpen, setClassifiedOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [selectedStockId, setSelectedStockId] = useState(stockItems[0]?.id || '');
  const [packageQuantity, setPackageQuantity] = useState(1);
  const [packagePrice, setPackagePrice] = useState(0);
  const [poScanCode, setPoScanCode] = useState('');
  const [poLines, setPoLines] = useState<any[]>([]);

  const [receivingOrder, setReceivingOrder] = useState<any | null>(null);
  const [receiptLocationId, setReceiptLocationId] = useState(locations[0]?.id || '');
  const [receiptDraft, setReceiptDraft] = useState<Record<string, ReceiptDraftLine>>({});
  const [grnScanCode, setGrnScanCode] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [approval, setApproval] = useState<{ permission: Permission; target: string; run: (token: string) => Promise<void> } | null>(null);
  const [matchingPayable, setMatchingPayable] = useState<any | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceLines, setInvoiceLines] = useState<any[]>([]);
  const [matchError, setMatchError] = useState('');
  const [payingPayable, setPayingPayable] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'MPESA'>('BANK');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentReason, setPaymentReason] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const selectStockItem = (id: string) => {
    setSelectedStockId(id);
    setPackageQuantity(1);
    const item = stockItems.find((stock: any) => stock.id === id);
    const packSize = Number(item?.scanUnitQuantity) || 1;
    setPackagePrice((Number(item?.averageUnitCost) || 0) * packSize);
  };

  const handleScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const matches = stockItems.filter((item: any) => barcodeEquals(item.barcode, code) || barcodeEquals(item.code, code));
    setPoScanCode('');
    setGrnScanCode('');
    if (matches.length !== 1) {
      setNotice(matches.length ? `Scan ${code} matches multiple stock items. Resolve the duplicate first.` : `No stock item is assigned to ${code}. No order or stock change was made.`);
      return;
    }
    const item = matches[0];
    if (createOpen) {
      selectStockItem(item.id);
      setNotice(`${item.name} selected. Confirm the ordered package quantity and price, then add the line.`);
      return;
    }
    if (receivingOrder) {
      const poLine = receivingOrder.items?.find((line: any) => (line.treatment || 'STOCK') === 'STOCK' && line.stockItemId === item.id);
      if (!poLine) {
        setNotice(`${item.name} is not a STOCK line on ${receivingOrder.poNumber}. It was not counted.`);
        return;
      }
      const key = procurementLineKey(poLine);
      const increment = Number(poLine.scanUnitQuantity) || Number(item.scanUnitQuantity) || 1;
      setReceiptDraft(previous => {
        const current = previous[key] || { delivered: 0, rejected: 0, rejectionReason: '' };
        return { ...previous, [key]: { ...current, delivered: Number(current.delivered || 0) + increment } };
      });
      setNotice(`Received draft: +${increment} ${poLine.unitSymbol} for ${poLine.displayName || item.name}. Review delivered and rejected quantities before posting the GRN.`);
    }
  };
  useBarcodeScanner({ enabled: createOpen || Boolean(receivingOrder), onScan: handleScan });

  const addPoLine = () => {
    const stock = stockItems.find((item: any) => item.id === selectedStockId);
    const packSize = Number(stock?.scanUnitQuantity) || 1;
    if (!stock || !Number.isFinite(packageQuantity) || packageQuantity <= 0 || !Number.isFinite(packagePrice) || packagePrice < 0) {
      setNotice('Choose a stock item and enter a positive package quantity and a valid package price.');
      return;
    }
    if (poLines.some(line => line.stockItemId === stock.id)) {
      setNotice(`${stock.name} is already on this draft. Remove its line before replacing it.`);
      return;
    }
    setPoLines(previous => [...previous, {
      stockItemId: stock.id,
      stockItemName: stock.name,
      quantityOrdered: packageQuantity * packSize,
      unitPrice: packagePrice / packSize,
      unitSymbol: stock.baseUnit,
      scanUnitQuantity: packSize,
      packageQuantity,
      packagePrice,
      lineTotal: packageQuantity * packagePrice,
    }]);
    setNotice(`${stock.name} added to the purchase order draft.`);
  };

  const createOrder = async () => {
    if (!supplierId || !poLines.length) {
      setNotice('Choose a supplier and add at least one stock item.');
      return;
    }
    setNotice('');
    try {
      await runtime.command('purchaseOrder.create', {
        supplierId,
        items: poLines.map(line => ({ stockItemId: line.stockItemId, quantityOrdered: line.quantityOrdered, unitPrice: line.unitPrice })),
      });
      setCreateOpen(false);
      setPoLines([]);
      setPoScanCode('');
      setNotice('Purchase order created and approved locally. It is queued for synchronization when online.');
    } catch (error) {
      setNotice(String(error));
    }
  };

  const beginReceiving = (order: any) => {
    setReceivingOrder(order);
    setReceiptLocationId(locations[0]?.id || '');
    setReceiptDraft({});
    setGrnScanCode('');
    setSupplierInvoiceNumber('');
    setDeliveryNote('');
    setReceiptNotes('');
    setNotice('');
  };

  const postReceipt = async (approvalToken?: string) => {
    if (!receivingOrder) return;
    const lines = (receivingOrder.items || []).map((line: any) => {
      const key = procurementLineKey(line);
      const draft = receiptDraft[key] || { delivered: 0, rejected: 0, rejectionReason: '' };
      return {
        lineId: line.lineId,
        ...(line.stockItemId ? { stockItemId: line.stockItemId } : {}),
        quantityDelivered: Number(draft.delivered || 0),
        quantityRejected: Number(draft.rejected || 0),
        quantityAccepted: Number(draft.delivered || 0) - Number(draft.rejected || 0),
        rejectionReason: draft.rejectionReason,
      };
    }).filter((line: any) => line.quantityDelivered > 0);
    const needsStockLocation = lines.some((received: any) => {
      const poLine = receivingOrder.items.find((item: any) => procurementLineKey(item) === String(received.lineId || received.stockItemId || ''));
      return (poLine?.treatment || 'STOCK') === 'STOCK';
    });
    if ((needsStockLocation && !receiptLocationId) || !lines.length) {
      setNotice(needsStockLocation ? 'Choose a receiving stock location and enter at least one delivered quantity.' : 'Enter at least one delivered quantity.');
      return;
    }
    if (lines.some((line: any) => line.quantityRejected > line.quantityDelivered || line.quantityAccepted < 0)) {
      setNotice('Rejected quantity cannot exceed delivered quantity.');
      return;
    }
    if (lines.some((line: any) => line.quantityRejected > 0 && !line.rejectionReason.trim())) {
      setNotice('Enter a reason for each rejected delivery quantity.');
      return;
    }
    const overReceived = lines.some((received: any) => {
      const poLine = receivingOrder.items.find((item: any) => procurementLineKey(item) === String(received.lineId || received.stockItemId || ''));
      const remaining = Number(poLine?.quantityOrdered || 0) - Number(poLine?.quantityReceived || 0);
      return received.quantityAccepted > remaining + 0.000001;
    });
    if (overReceived && !approvalToken) {
      setApproval({ permission: 'procurement.over_receive', target: receivingOrder.id, run: token => postReceipt(token) });
      return;
    }
    setNotice('');
    try {
      await runtime.command('purchaseOrder.receive', {
        purchaseOrderId: receivingOrder.id,
        ...(needsStockLocation ? { locationId: receiptLocationId } : {}),
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
        deliveryNote: deliveryNote.trim(),
        notes: receiptNotes.trim(),
        lines,
        ...(approvalToken ? { approvalToken } : {}),
      }, recordOf(snapshot, 'purchaseOrders', receivingOrder.id)?.version);
      setReceivingOrder(null);
      setReceiptDraft({});
      setNotice('Goods receipt posted. STOCK, EXPENSE and ASSET treatment, supplier payable and journal were committed together.');
    } catch (error) {
      setNotice(String(error));
    }
  };
  const beginInvoiceMatch = (payable: any) => {
    const receipt = recordsOf(snapshot, 'goodsReceipts').find((item: any) => item.id === payable.goodsReceiptId);
    const order = recordsOf(snapshot, 'purchaseOrders').find((item: any) => item.id === payable.purchaseOrderId);
    if (!receipt || !order) { setNotice('The linked GRN or PO is missing from this local snapshot. Refresh the terminal records before matching.'); return; }
    const lines = (receipt.lines || []).filter((line: any) => Number(line.quantityAccepted) > 0).map((line: any) => ({
      lineId: line.lineId,
      stockItemId: line.stockItemId,
      displayName: line.displayName || line.stockItemName || line.assetName || 'Procurement line',
      treatment: line.treatment || 'STOCK',
      quantityBilled: Number(line.quantityAccepted),
      unitSymbol: line.unitSymbol || 'unit',
      unitPrice: Number(line.unitCost),
    }));
    const total = lines.reduce((sum: number, line: any) => sum + Math.round(line.quantityBilled * line.unitPrice * 100) / 100, 0);
    const today = dateInput(new Date());
    const supplier = suppliers.find((item: any) => item.id === payable.supplierId);
    const due = new Date(`${today}T12:00:00`);
    due.setDate(due.getDate() + Math.max(0, Number(supplier?.paymentTermsDays) || 0));
    setMatchingPayable(payable);
    setMatchError('');
    setInvoiceNumber(payable.supplierInvoiceNumber || receipt.supplierInvoiceNumber || '');
    setInvoiceDate(today);
    setInvoiceDueDate(dateInput(due));
    setInvoiceLines(lines);
    setInvoiceAmount(total.toFixed(2));
    setNotice('');
  };
  const updateInvoiceLine = (index: number, key: 'quantityBilled' | 'unitPrice', value: number) => {
    const next = invoiceLines.map((line, current) => current === index ? { ...line, [key]: value } : line);
    setInvoiceLines(next);
    setInvoiceAmount(next.reduce((sum, line) => sum + Math.round(Number(line.quantityBilled || 0) * Number(line.unitPrice || 0) * 100) / 100, 0).toFixed(2));
  };

  const matchSupplierInvoice = async () => {
    if (!matchingPayable) return;
    setMatchError('');
    try {
      await runtime.command('supplierPayable.matchInvoice', {
        payableId: matchingPayable.id,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        dueDate: invoiceDueDate,
        invoiceAmount: Number(invoiceAmount),
        lines: invoiceLines.map(({ lineId, stockItemId, quantityBilled, unitPrice }) => ({ lineId, ...(stockItemId ? { stockItemId } : {}), quantityBilled, unitPrice })),
      }, recordOf(snapshot, 'supplierPayables', matchingPayable.id)?.version);
      setMatchingPayable(null);
      setNotice('Supplier invoice matched to the PO and accepted GRN. This records the match; it does not pay the supplier.');
    } catch (error) { setMatchError(String(error)); }
  };
  const beginSupplierPayment = (payable: any) => {
    setPayingPayable(payable);
    setPaymentAmount(Number(payable.amountDue ?? payable.amount).toFixed(2));
    setPaymentMethod('BANK');
    setPaymentReference('');
    setPaymentReason('');
    setPaymentConfirmed(false);
    setPaymentError('');
    setNotice('');
  };

  const recordSupplierPayment = async () => {
    if (!payingPayable) return;
    setPaymentError('');
    try {
      await runtime.command('supplierPayable.pay', {
        payableId: payingPayable.id,
        amount: Number(paymentAmount),
        method: paymentMethod,
        reference: paymentReference.trim(),
        reason: paymentReason.trim(),
        confirmed: paymentConfirmed,
      }, recordOf(snapshot, 'supplierPayables', payingPayable.id)?.version);
      setPayingPayable(null);
      setNotice('Supplier payment confirmation recorded locally and posted to accounts payable. Synchronization is queued; ServOS did not transfer funds.');
    } catch (error) { setPaymentError(String(error)); }
  };

  const sectionButton = (id: typeof section, label: string) => <button key={id} className={section === id ? primaryButtonClass : buttonClass} onClick={() => setSection(id)}>{label}</button>;

  return <div className="h-full overflow-auto bg-slate-950 p-5 text-white">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>{canReceive && <button className={primaryButtonClass + ' mb-3'} onClick={() => setSimpleReceive(true)}>Receive Delivery</button>}<h1 className="flex items-center gap-2 text-2xl font-bold"><Truck className="h-6 w-6 text-amber-400" />Procurement</h1><p className="mt-1 text-sm text-slate-400">Purchase orders, scanner-assisted GRNs, three-way invoice matching and accounts payable. Changes save locally first.</p></div>
      {canManage && <div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => { setNotice(''); setSupplierId(suppliers[0]?.id || ''); setPoLines([]); setPoScanCode(''); setCreateOpen(true); }}><Plus className="mr-1 inline h-4 w-4" />New stock PO</button><button className={primaryButtonClass} onClick={()=>setClassifiedOpen(true)}>Classified PO</button></div>}
    </header>

    {notice && <p role="status" className="mb-4 whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{notice}</p>}
    <nav className="mb-4 flex flex-wrap gap-2">{sectionButton('ORDERS', `Purchase orders (${orders.length})`)}{sectionButton('RECEIPTS', `Goods receipts (${receipts.length})`)}{canViewPayables&&sectionButton('PAYABLES', `Payables (${payables.length})`)}</nav>

    {section === 'ORDERS' && <div className="space-y-3">
      {!suppliers.length && <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm">Add a supplier in Catalog before creating a purchase order. {canEditCatalog ? <button className="ml-2 underline" onClick={onOpenCatalog}>Open Catalog</button> : <span className="ml-1 text-amber-200">Ask an Admin or Manager to add the supplier.</span>}</div>}
      {orders.map((order: any) => <article key={order.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-amber-300">{order.poNumber}</h2><p className="text-sm text-slate-300">{order.supplierName} · {shortDate(order.createdAt)}</p><p className="mt-1 text-xs text-slate-500">{order.status} · approved by {order.approvedBy || order.createdByName || '—'}</p></div><div className="text-right">{canViewPayables && <b>{money(order.grandTotal)}</b>}{canReceive && ['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status) && <button className={buttonClass + ' ml-3'} onClick={() => beginReceiving(order)}>Receive delivery</button>}</div></div>
        <div className="mt-3 divide-y divide-slate-800">{(order.items || []).map((line: any) => <div key={procurementLineKey(line)} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{line.displayName || line.stockItemName}<span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px]">{line.treatment || 'STOCK'}</span></span><span className="font-mono text-slate-300">Ordered {line.quantityOrdered} {line.unitSymbol} · accepted {line.quantityReceived || 0} · rejected {line.quantityRejected || 0}</span></div>)}</div>
      </article>)}
      {!orders.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-slate-400">No purchase orders have been created.</p>}
    </div>}

    {section === 'RECEIPTS' && <div className="space-y-3">{receipts.map((receipt: any) => <article key={receipt.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold text-emerald-300">{receipt.grnNumber}</h2><p className="text-sm text-slate-300">{receipt.poNumber} · {receipt.supplierName}</p><p className="text-xs text-slate-500">{shortDate(receipt.receivedAt)} · {receipt.receivedByName}</p></div><div className="text-right text-sm">{canViewPayables ? <>Accepted value: {money(receipt.acceptedValue)}<p className="text-xs text-slate-500">{receipt.supplierInvoiceNumber || 'Invoice reference not entered'}</p></> : <span className="text-xs text-slate-500">Posted GRN</span>}</div></div><div className="mt-3 space-y-1 text-sm">{(receipt.lines || []).map((line: any) => <p key={line.lineId || line.stockItemId} className="text-slate-300"><b>{line.treatment || 'STOCK'}</b> · {line.displayName || line.stockItemName}: delivered {line.quantityDelivered}, accepted {line.quantityAccepted}, rejected {line.quantityRejected} {line.unitSymbol}</p>)}</div>{canManage&&canPay&&<button className={buttonClass+' mt-3'} onClick={()=>setCorrectingReceipt(receipt)}>Correct mistake</button>}</article>)}{!receipts.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-slate-400">No goods receipts have been posted.</p>}</div>}

    {section === 'PAYABLES' && canViewPayables && <div className="space-y-3">
      {payables.map((payable: any) => {
        const dueDate = payable.dueDate ? new Date(`${payable.dueDate}T00:00:00`) : null;
        const daysOverdue = dueDate ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000)) : 0;
        const linkedPayments = supplierPayments.filter((payment: any) => payment.supplierPayableId === payable.id);
        const due = Number(payable.amountDue ?? payable.amount);
        return <article key={payable.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{payable.payableNumber} · {payable.supplierName}</h2><p className="text-sm text-slate-400">{payable.grnNumber} · {payable.status}</p><p className="text-xs text-slate-500">{payable.supplierInvoiceNumber ? `Invoice ${payable.supplierInvoiceNumber}` : 'Invoice not matched'}{payable.dueDate ? ` · Due ${payable.dueDate}` : ''}{daysOverdue > 0 && due > 0 ? ` · ${daysOverdue} days overdue` : ''}</p><p className="text-xs text-slate-500">{payable.basis}</p></div><div className="text-right"><p className="text-xs text-slate-500">Outstanding</p><b>{money(due)}</b></div></div>
          <div className="flex flex-wrap gap-2">
            {canManage && payable.status === 'RECEIVED_UNINVOICED' && <button className={buttonClass} onClick={() => beginInvoiceMatch(payable)}>Match supplier invoice</button>}
            {canPay && due > 0 && ['MATCHED_UNPAID', 'PARTIALLY_PAID'].includes(payable.status) && <button className={primaryButtonClass} onClick={() => beginSupplierPayment(payable)}>Record payment</button>}
          </div>
          {linkedPayments.length > 0 && <div className="border-t border-slate-800 pt-2"><p className="mb-1 text-xs font-semibold text-slate-400">Payment history</p>{linkedPayments.map((payment: any) => <p key={payment.id} className="text-xs text-slate-500">{shortDate(payment.occurredAt)} · {payment.method} · {money(payment.amount)} · {payment.reference} · recorded by {payment.recordedByName}</p>)}</div>}
        </article>;
      })}
      {!payables.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-slate-400">Accepted goods create supplier payables. Rejected quantities do not create stock or payable value.</p>}
      <p className="rounded-lg border border-slate-800 p-3 text-xs text-slate-500">Invoice matching checks billed quantities against the GRN and billed prices against the approved PO. Differences block payment. Record only a payment that has already been confirmed outside ServOS; this screen does not transfer cash or call a bank or M-Pesa service.</p>
    </div>}

    {matchingPayable && <ActionDialog title={`Match invoice for ${matchingPayable.grnNumber}`} onClose={() => setMatchingPayable(null)}>
      <div className="space-y-3">
        <p className="text-xs text-slate-400">This invoice is matched to one GRN. Quantity, unit cost and total must match every accepted STOCK / EXPENSE / ASSET line and the approved PO exactly.</p>
        <label className="block text-sm">Supplier invoice number<input autoFocus className={fieldClass + ' mt-1'} value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} /></label>
        <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Invoice date<input type="date" className={fieldClass + ' mt-1'} value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} /></label><label className="text-sm">Due date<input type="date" className={fieldClass + ' mt-1'} min={invoiceDate || undefined} value={invoiceDueDate} onChange={event => setInvoiceDueDate(event.target.value)} /></label></div>
        <div className="space-y-2">{invoiceLines.map((line: any, index: number) => <div key={line.lineId || line.stockItemId} className="rounded-lg border border-slate-800 p-2"><b className="text-sm">{line.displayName}</b><span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px]">{line.treatment}</span><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs">Billed quantity ({line.unitSymbol})<input className={fieldClass + ' mt-1'} type="number" min="0" step={line.treatment === 'ASSET' ? '1' : '0.001'} value={line.quantityBilled} onChange={event => updateInvoiceLine(index, 'quantityBilled', Number(event.target.value))} /></label><label className="text-xs">Unit price (KES/{line.unitSymbol})<input className={fieldClass + ' mt-1'} type="number" min="0" step="0.000001" value={line.unitPrice} onChange={event => updateInvoiceLine(index, 'unitPrice', Number(event.target.value))} /></label></div></div>)}</div>
        <label className="block text-sm">Invoice total (KES)<input className={fieldClass + ' mt-1'} type="number" min="0" step="0.01" value={invoiceAmount} onChange={event => setInvoiceAmount(event.target.value)} /></label>
        <button className={primaryButtonClass} disabled={!invoiceNumber.trim() || !invoiceLines.length || !invoiceAmount.trim() || !Number.isFinite(Number(invoiceAmount)) || Number(invoiceAmount) < 0} onClick={() => void matchSupplierInvoice()}>Match invoice to PO and GRN</button>
      </div>
    </ActionDialog>}


    {payingPayable && <ActionDialog title={`Record supplier payment · ${payingPayable.payableNumber}`} onClose={() => setPayingPayable(null)}>
      <div className="space-y-3">
        <p className="text-sm text-slate-300">Outstanding: <b>{money(payingPayable.amountDue ?? payingPayable.amount)}</b>. This records a manual settlement after you have paid the supplier elsewhere; it does not initiate a transfer.</p>
        <label className="block text-sm">Amount paid (KES)<input className={fieldClass + ' mt-1'} type="number" min="0.01" max={payingPayable.amountDue ?? payingPayable.amount} step="0.01" value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} /></label>
        <label className="block text-sm">Paid from<select className={fieldClass + ' mt-1'} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="BANK">Bank transfer</option><option value="MPESA">Business M-Pesa</option><option value="CASH">Petty cash (outside POS till)</option></select></label>
        <label className="block text-sm">Transfer reference or petty-cash voucher<input className={fieldClass + ' mt-1'} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /></label>
        <label className="block text-sm">Payment note<input className={fieldClass + ' mt-1'} value={paymentReason} onChange={event => setPaymentReason(event.target.value)} /></label>
        <label className="flex items-start gap-2 text-xs text-amber-200"><input className="mt-0.5" type="checkbox" checked={paymentConfirmed} onChange={event => setPaymentConfirmed(event.target.checked)} />I confirm this amount has already been paid to the supplier. This is a manual record only.</label>
        <button className={primaryButtonClass} disabled={!paymentConfirmed || !paymentReference.trim() || !paymentReason.trim() || !Number.isFinite(Number(paymentAmount)) || Number(paymentAmount) <= 0 || Number(paymentAmount) > Number(payingPayable.amountDue ?? payingPayable.amount)} onClick={() => void recordSupplierPayment()}>Record confirmed payment</button>
      </div>
    </ActionDialog>}
    {simpleReceive && <SimpleReceiveDelivery onClose={() => setSimpleReceive(false)} />}
    {classifiedOpen && <ClassifiedPurchaseOrderDialog onClose={()=>setClassifiedOpen(false)} onCreated={message=>setNotice(message)}/>}
    {createOpen && <ActionDialog title="Create purchase order" onClose={() => setCreateOpen(false)}>
      {notice && <p role="status" className="mb-3 rounded-lg bg-slate-950 p-3 text-sm text-slate-200">{notice}</p>}
      {!suppliers.length ? <div className="space-y-3"><p>No suppliers are configured.</p>{canEditCatalog ? <button className={buttonClass} onClick={onOpenCatalog}>Open Catalog to add a supplier</button> : <p className="text-amber-200">Ask an Admin or Manager to add the supplier.</p>}</div> : <div className="space-y-4">
        <label className="block text-sm">Supplier<select className={fieldClass + ' mt-1'} value={supplierId} onChange={event => setSupplierId(event.target.value)}>{suppliers.map((supplier: any) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <div className="rounded-xl border border-slate-700 p-3"><label className="block text-sm">Scan stock barcode or SKU<input autoFocus data-barcode-capture="true" className={fieldClass + ' mt-1 font-mono'} placeholder="Focus here, then scan" value={poScanCode} onChange={event => setPoScanCode(event.target.value)} /></label><div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Barcode className="h-4 w-4" />Scan selects a stock master; it does not set the ordered quantity.</div></div>
        <label className="block text-sm">Stock item<select className={fieldClass + ' mt-1'} value={selectedStockId} onChange={event => selectStockItem(event.target.value)}>{stockItems.map((item: any) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select></label>
        {(() => { const stock = stockItems.find((item: any) => item.id === selectedStockId); const packSize = Number(stock?.scanUnitQuantity) || 1; return <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Packages ordered<input className={fieldClass + ' mt-1'} type="number" min="0.001" step="0.001" value={packageQuantity} onChange={event => setPackageQuantity(Number(event.target.value))} /><span className="text-xs text-slate-500">Each package represents {packSize} {stock?.baseUnit || 'base units'}.</span></label><label className="text-sm">Price per package (KES)<input className={fieldClass + ' mt-1'} type="number" min="0" step="0.01" value={packagePrice} onChange={event => setPackagePrice(Number(event.target.value))} /></label></div>; })()}
        <button className={buttonClass} disabled={!stockItems.length} onClick={addPoLine}>Add item to draft</button>
        <div className="space-y-2">{poLines.map(line => <div key={line.stockItemId} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3 text-sm"><div><b>{line.stockItemName}</b><p className="text-xs text-slate-500">{line.packageQuantity} package(s) → {line.quantityOrdered} {line.unitSymbol}</p></div><div className="flex items-center gap-3"><span>{money(line.lineTotal)}</span><button className="text-rose-300" onClick={() => setPoLines(previous => previous.filter(item => item.stockItemId !== line.stockItemId))}>Remove</button></div></div>)}</div>
        <p className="text-xs text-slate-500">Order costs are recorded per stock base unit. Tax is not inferred; enter the agreed supplier package cost.</p>
        <button className={primaryButtonClass} disabled={!supplierId || !poLines.length} onClick={() => void createOrder()}>Create and approve PO</button>
      </div>}
    </ActionDialog>}

    {receivingOrder && <ActionDialog title={`Receive ${receivingOrder.poNumber}`} onClose={() => setReceivingOrder(null)}>
      <div className="space-y-4">
        {notice && <p role="status" className="rounded-lg bg-slate-950 p-3 text-sm text-slate-200">{notice}</p>}
        {(receivingOrder.items || []).some((line: any) => (line.treatment || 'STOCK') === 'STOCK') && <label className="block text-sm">Receiving stock location<select className={fieldClass + ' mt-1'} value={receiptLocationId} onChange={event => setReceiptLocationId(event.target.value)}>{locations.map((location: any) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}
        {(receivingOrder.items || []).some((line: any) => (line.treatment || 'STOCK') === 'STOCK') && <div className="rounded-xl border border-slate-700 p-3"><label className="block text-sm">Scan delivered STOCK packages<input autoFocus data-barcode-capture="true" className={fieldClass + ' mt-1 font-mono'} placeholder="Focus here; each scan adds one stock package" value={grnScanCode} onChange={event => setGrnScanCode(event.target.value)} /></label><p className="mt-2 text-xs text-slate-500">Scanner increments STOCK lines only. EXPENSE and ASSET lines are entered as delivered physical/service quantities below.</p></div>}
        <div className="space-y-3">{(receivingOrder.items || []).map((line: any) => {
          const key = procurementLineKey(line);
          const stock = line.stockItemId ? stockItems.find((item: any) => item.id === line.stockItemId) : undefined;
          const draft = receiptDraft[key] || { delivered: 0, rejected: 0, rejectionReason: '' };
          const remaining = Math.max(0, Number(line.quantityOrdered || 0) - Number(line.quantityReceived || 0));
          const accepted = Number(draft.delivered || 0) - Number(draft.rejected || 0);
          const packageSize = (line.treatment || 'STOCK') === 'STOCK' ? (Number(line.scanUnitQuantity) || Number(stock?.scanUnitQuantity) || 1) : 1;
          return <div key={key} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <div className="flex flex-wrap justify-between gap-2"><div><b>{line.displayName || line.stockItemName}</b><span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-black">{line.treatment || 'STOCK'}</span></div><span className="text-xs text-slate-400">Ordered {line.quantityOrdered} · accepted previously {line.quantityReceived || 0} · remaining {remaining} {line.unitSymbol}</span></div>
            <p className="my-2 text-xs text-slate-500">{(line.treatment || 'STOCK') === 'STOCK' ? `One barcode scan adds ${packageSize} ${line.unitSymbol}.` : (line.treatment === 'ASSET' ? 'Accepted asset quantities must be whole physical units. Each accepted unit creates one commissioning shell.' : 'Accepted expense quantities post directly to the approved expense account.')}</p>
            <div className="grid gap-2 sm:grid-cols-3"><label className="text-xs">Delivered<input className={fieldClass + ' mt-1'} type="number" min="0" step={line.treatment === 'ASSET' ? '1' : '0.001'} value={draft.delivered} onChange={event => setReceiptDraft(previous => ({ ...previous, [key]: { ...draft, delivered: Number(event.target.value) } }))} /></label><label className="text-xs">Rejected<input className={fieldClass + ' mt-1'} type="number" min="0" step={line.treatment === 'ASSET' ? '1' : '0.001'} value={draft.rejected} onChange={event => setReceiptDraft(previous => ({ ...previous, [key]: { ...draft, rejected: Number(event.target.value) } }))} /></label><div className="rounded-lg bg-slate-950 p-2 text-xs">Accepted now<strong className="mt-1 block text-emerald-300">{Math.max(0, accepted)} {line.unitSymbol}</strong></div></div>
            {Number(draft.rejected) > 0 && <label className="mt-2 block text-xs">Rejection reason<input className={fieldClass + ' mt-1'} value={draft.rejectionReason} onChange={event => setReceiptDraft(previous => ({ ...previous, [key]: { ...draft, rejectionReason: event.target.value } }))} /></label>}
            {accepted > remaining + 0.000001 && <p className="mt-2 text-xs text-amber-300">This accepts {accepted - remaining} {line.unitSymbol} above the open PO quantity and requires a different Admin or Manager to approve.</p>}
          </div>;
        })}</div>
        <label className="block text-sm">Invoice reference (does not mark the invoice matched)<input className={fieldClass + ' mt-1'} value={supplierInvoiceNumber} onChange={event => setSupplierInvoiceNumber(event.target.value)} /></label>
        <label className="block text-sm">Delivery note (optional)<input className={fieldClass + ' mt-1'} value={deliveryNote} onChange={event => setDeliveryNote(event.target.value)} /></label>
        <label className="block text-sm">Receipt notes<textarea className={fieldClass + ' mt-1'} value={receiptNotes} onChange={event => setReceiptNotes(event.target.value)} /></label>
        <button className={primaryButtonClass} disabled={(receivingOrder.items || []).some((line: any) => (line.treatment || 'STOCK') === 'STOCK') && !receiptLocationId} onClick={() => void postReceipt()}><ClipboardCheck className="mr-1 inline h-4 w-4" />Post goods receipt</button>
      </div>
    </ActionDialog>}


    {correctingReceipt&&<ReceiptCorrectionDialog receipt={correctingReceipt} onClose={()=>setCorrectingReceipt(null)}/>}
    {approval && <ManagerApprovalDialog permission={approval.permission} target={approval.target} onClose={() => setApproval(null)} onApproved={approval.run} />}
  </div>;
}
