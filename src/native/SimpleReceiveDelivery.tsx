import React, { useRef, useState } from 'react';
import { selectGuideResource } from '../guidance/workflow';
import { useRuntime } from '../runtime/RuntimeProvider';
import { barcodeEquals, useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { ActionDialog } from './ActionDialog';
import { ManagerApprovalDialog } from './ManagerApprovalDialog';
import { buttonClass, fieldClass, money, primaryButtonClass, recordOf, recordsOf } from './records';

type Line = { key: string; stockItemId?: string; name: string; unit: string; scan: number; delivered: string; rejected: string; cost: string; reason: string; remaining?: number };
const number = (value: string) => /^\d+(\.\d{1,6})?$/.test(value) && Number(value) <= 1e9;

export function SimpleReceiveDelivery({ onClose }: { onClose: () => void }) {
  const runtime = useRuntime();
  const snapshot = runtime.snapshot!;
  const stocks = recordsOf(snapshot, 'stockItems');
  const products = recordsOf(snapshot, 'products');
  const suppliers = recordsOf(snapshot, 'suppliers');
  const places = recordsOf(snapshot, 'stockLocations');
  const orders = recordsOf(snapshot, 'purchaseOrders').filter(order => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status));
  const canPurchase = snapshot.actor.permissions.includes('procurement.manage');
  const canReceive = snapshot.actor.permissions.includes('procurement.receive');
  const [orderId, setOrderId] = useState('');
  const [orderVersion, setOrderVersion] = useState<number>();
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [place, setPlace] = useState(places[0]?.id || '');
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState('');
  const [scan, setScan] = useState('');
  const [problem, setProblem] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState(false);
  const request = useRef<{ id: string; operation: string; payload: Record<string, unknown>; version?: number } | null>(null);
  const inFlight = useRef(false);
  const order = orders.find(item => item.id === orderId);
  const chooseOrder = (id: string) => {
    const chosen = orders.find(item => item.id === id);
    setOrderId(id); setOrderVersion(recordOf(snapshot, 'purchaseOrders', id)?.version); setSupplierId(chosen?.supplierId || '');
    setLines((chosen?.items || []).map((item: any) => ({ key: item.lineId || item.stockItemId, stockItemId: item.stockItemId, name: item.displayName || item.stockItemName, unit: item.unitSymbol, scan: Number(item.scanUnitQuantity) || 1, delivered: '0', rejected: '0', cost: String(item.unitPrice), reason: '', remaining: Math.max(0, Number(item.quantityOrdered) - Number(item.quantityReceived || 0)) })));
  };
  const add = (item: any, scanned = false) => {
    const existing = lines.find(line => line.stockItemId === item.id);
    if (orderId && !existing) { setProblem(`${item.name} is not on this purchase order. Choose the correct order.`); return; }
    const increment = existing?.scan || Number(item.scanUnitQuantity) || 1;
    setLines(previous => existing ? previous.map(line => line.stockItemId === item.id ? { ...line, delivered: String(Math.round((Number(line.delivered || 0) + increment) * 1e6) / 1e6) } : line) : [...previous, { key: item.id, stockItemId: item.id, name: item.name, unit: item.baseUnit, scan: increment, delivered: String(scanned ? increment : 1), rejected: '0', cost: String(item.averageUnitCost || 0), reason: '' }]);
    setProblem('');
  };
  const receiveScan = (raw: string) => {
    const ids = new Set(products.filter(item => item.active !== false && (barcodeEquals(item.barcode, raw) || barcodeEquals(item.code, raw))).map(item => item.stockItemId));
    const matches = stocks.filter(item => ids.has(item.id) || barcodeEquals(item.barcode, raw) || barcodeEquals(item.code, raw));
    setScan('');
    if (matches.length !== 1) { setProblem(matches.length ? `Barcode ${raw} is ambiguous. Search and select the correct item.` : `Unknown barcode ${raw}. Search and select an item explicitly.`); return; }
    add(matches[0], true);
  };
  useBarcodeScanner({ enabled: canReceive && !review && !busy && (Boolean(orderId) || canPurchase), onScan: receiveScan });
  const update = (key: string, field: keyof Line, value: string) => setLines(previous => previous.map(line => line.key === key ? { ...line, [field]: value } : line));
  const delivered = lines.filter(line => Number(line.delivered) > 0);
  const valid = canReceive && (Boolean(order) || canPurchase) && supplierId && reference.trim() && place && delivered.length > 0 && lines.every(line => number(line.delivered) && number(line.rejected) && number(line.cost) && Number(line.rejected) <= Number(line.delivered) && (Number(line.rejected) === 0 || line.reason.trim()));
  const over = delivered.some(line => line.remaining !== undefined && Number(line.delivered) - Number(line.rejected) > line.remaining + 0.000001);
  const confirm = async (approvalToken?: string) => {
    if (inFlight.current || !valid) return;
    inFlight.current = true; setBusy(true); setProblem('');
    try {
      if (!request.current) request.current = {
        id: crypto.randomUUID(), operation: order ? 'purchaseOrder.receive' : 'procurement.receiveDelivery', version: orderVersion,
        payload: { ...(order ? { purchaseOrderId: order.id } : { supplierId }), locationId: place, supplierInvoiceNumber: reference.trim(), ...(approvalToken ? { approvalToken } : {}), lines: delivered.map(line => ({ lineId: line.key, stockItemId: line.stockItemId, quantityDelivered: Number(line.delivered), quantityRejected: Number(line.rejected), quantityAccepted: Math.round((Number(line.delivered) - Number(line.rejected)) * 1e6) / 1e6, unitPrice: Number(line.cost), rejectionReason: line.reason.trim() })) },
      };
      const current = request.current;
      await runtime.command(current.operation, current.payload, current.version, current.id);
      onClose();
    } catch (cause) { setProblem(`${String(cause)}. Retry keeps the same delivery command.`); throw cause; }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <ActionDialog title="Receive Delivery" onClose={() => { if (!busy) onClose(); }}>
    <section data-guide-anchor="stock.receive" className="space-y-3">
      {problem && <p role="alert" className="text-sm text-rose-300">{problem}</p>}
      {!review ? <>
        <label className="block text-sm">Purchase order<select className={fieldClass} value={orderId} onChange={event => chooseOrder(event.target.value)}><option value="">{canPurchase ? 'Delivery without a purchase order' : 'Choose an approved purchase order'}</option>{orders.map(item => <option key={item.id} value={item.id}>{item.poNumber} · {item.supplierName}</option>)}</select></label>
        {!orderId && !canPurchase && <p className="text-sm text-amber-200">Your access permits receiving against approved orders. A purchasing manager must authorize a delivery without an order.</p>}
        <label className="block text-sm">Supplier<select className={fieldClass} disabled={Boolean(orderId)} value={supplierId} onChange={event => setSupplierId(event.target.value)}><option value="">Choose supplier</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block text-sm">Invoice / delivery reference<input className={fieldClass} maxLength={120} value={reference} onChange={event => setReference(event.target.value)} /></label>
        <label className="block text-sm">Storage Place<select className={fieldClass} value={place} onChange={event => setPlace(event.target.value)}>{places.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block text-sm">Scan barcode<input data-barcode-capture="true" className={fieldClass} value={scan} onChange={event => setScan(event.target.value)} disabled={!canReceive || (!orderId && !canPurchase)} /></label>
        {!orderId && canPurchase && <><input aria-label="Search delivery items" className={fieldClass} placeholder="Search items to add" value={query} onChange={event => setQuery(event.target.value)} /><div className="max-h-32 overflow-auto">{query && stocks.filter(item => [item.name, item.code, item.barcode].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))).map(item => <button key={item.id} className={buttonClass + ' m-1'} onClick={() => add(item)}>{item.name}</button>)}</div></>}
        {lines.map(line => <div key={line.key} className="rounded-lg border border-slate-700 p-3"><b>{line.name}</b><p className="text-xs text-slate-400">1 scan = {line.scan} {line.unit}{line.remaining !== undefined ? ` · ${line.remaining} ${line.unit} remaining` : ''}</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{([['delivered', 'Delivered'], ['rejected', 'Rejected'], ['cost', 'KES per']] as const).map(([key, label]) => <label key={key} className="text-xs">{label} {line.unit}<input aria-label={`${label} ${line.name}`} className={fieldClass} type="number" min="0" step="0.000001" disabled={key === 'cost' && Boolean(orderId)} value={line[key]} onChange={event => update(line.key, key, event.target.value)} /></label>)}</div>{Number(line.rejected) > 0 && <label className="text-xs">Rejection reason<input className={fieldClass} value={line.reason} onChange={event => update(line.key, 'reason', event.target.value)} /></label>}{!orderId && <button className={buttonClass + ' mt-2'} onClick={() => setLines(previous => previous.filter(item => item.key !== line.key))}>Remove</button>}</div>)}
        <button className={primaryButtonClass} disabled={!valid} onClick={() => { selectGuideResource('stock.receive', { key: orderId ? 'purchaseOrderId' : 'supplierId', id: orderId || supplierId }); setReview(true); }}>Review Delivery</button>
      </> : <>
        <p>{suppliers.find(item => item.id === supplierId)?.name} · {reference} · {places.find(item => item.id === place)?.name}</p>
        {delivered.map(line => <div key={line.key} className="rounded-lg bg-slate-950 p-3 text-sm"><b>{line.name}</b><p>Delivered {line.delivered}; rejected {line.rejected}; accepted {Number(line.delivered) - Number(line.rejected)} {line.unit}</p><p>{money(line.cost)} per {line.unit} · {money((Number(line.delivered) - Number(line.rejected)) * Number(line.cost))}</p></div>)}
        <p className="text-sm text-slate-400">Confirming records accepted stock and the amount owed to the supplier. No payment is recorded.</p>
        {over && <p className="text-sm text-amber-200">This exceeds the ordered quantity. A different manager must approve it.</p>}
        <div className="flex gap-2"><button className={buttonClass} disabled={busy || Boolean(request.current)} onClick={() => setReview(false)}>Back</button><button className={primaryButtonClass} disabled={busy || !valid} onClick={() => { if (over && !request.current) setApproval(true); else void confirm().catch(() => {}); }}>{busy ? 'Confirming…' : request.current ? 'Retry delivery' : 'Confirm Delivery'}</button></div>
      </>}
    </section>
    {approval && <ManagerApprovalDialog permission="procurement.over_receive" target={orderId} onClose={() => setApproval(false)} onApproved={confirm} />}
  </ActionDialog>;
}
