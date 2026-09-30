import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Boxes, PackageCheck, Search, Trash2 } from 'lucide-react';
import { selectGuideResource } from '../guidance/workflow';
import { useRuntime } from '../runtime/RuntimeProvider';
import type { InventoryCountDraft } from '../runtime/RuntimeProvider';
import { flushLocalWork, guardLocalWork } from '../runtime/localWork';
import type { Permission } from '../types/runtime';
import { recordsOf, fieldClass, buttonClass, primaryButtonClass, money, shortDate } from './records';
import { ManagerApprovalDialog } from './ManagerApprovalDialog';
import { ActionDialog } from './ActionDialog';
import { domainErrorMessage } from './errors/domainErrorMessages';
import { barcodeEquals, useBarcodeScanner } from '../hooks/useBarcodeScanner';

type StockStatus = 'ALL' | 'LOW' | 'OUT' | 'HEALTHY';

const totalStock = (stock: any) =>
  Object.values(stock.currentStock || {}).reduce((sum: number, value) => sum + Number(value || 0), 0);

const statusOf = (stock: any): Exclude<StockStatus, 'ALL'> => {
  const quantity = totalStock(stock);
  const reorder = Number(stock.reorderLevel || 0);
  if (quantity <= 0) return 'OUT';
  if (reorder > 0 && quantity <= reorder) return 'LOW';
  return 'HEALTHY';
};

const statusClass = (status: Exclude<StockStatus, 'ALL'>) =>
  status === 'OUT'
    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
    : status === 'LOW'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';

export function NativeInventoryView() {
  const runtime = useRuntime();
  const snapshot = runtime.snapshot!;
  const stocks = recordsOf(snapshot, 'stockItems');
  const products = recordsOf(snapshot, 'products');
  const locations = recordsOf(snapshot, 'stockLocations');
  const movements = recordsOf(snapshot, 'stockMovements').slice().reverse();
  const [modal, setModal] = useState<string | null>(null);
  const [approval, setApproval] = useState<{ permission: Permission; run: (token: string) => Promise<void> } | null>(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockStatus>('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [countLocationId, setCountLocationId] = useState('');
  const [selectedStockId, setSelectedStockId] = useState(stocks[0]?.id || '');
  const permissions = snapshot.actor.permissions;
  const [form, setForm] = useState({
    stockItemId: stocks[0]?.id || '', locationId: locations[0]?.id || '', toLocationId: locations[1]?.id || '',
    quantity: 1, reason: '',
  });

  const rows = useMemo(() => stocks.map((stock: any) => {
    const total = totalStock(stock);
    const reorder = Number(stock.reorderLevel || 0);
    const unitCost = Number(stock.averageUnitCost || 0);
    const locationQty = locationFilter === 'ALL' ? total : Number(stock.currentStock?.[locationFilter] || 0);
    return { stock, total, locationQty, reorder, value: total * unitCost, status: statusOf(stock) };
  }), [stocks, locationFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(row => {
      const matchesSearch = !q || [row.stock.name, row.stock.code, row.stock.barcode, row.stock.baseUnit]
        .some(value => String(value || '').toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const selected = stocks.find((stock: any) => stock.id === selectedStockId) || filtered[0]?.stock || stocks[0];
  const selectedMovements = selected ? movements.filter((movement: any) => movement.stockItemId === selected.id).slice(0, 12) : [];
  const stockValue = rows.reduce((sum, row) => sum + row.value, 0);
  const lowCount = rows.filter(row => row.status === 'LOW').length;
  const outCount = rows.filter(row => row.status === 'OUT').length;

  const act = async (operation: string, payload: Record<string, unknown>, permission: Permission, commandId?: string) => {
    const execute = async (token?: string) => {
      try {
        await runtime.command(operation, token ? { ...payload, approvalToken: token } : payload, undefined, commandId);
        setModal(null);
        setNotice(operation === 'inventory.countLocation' ? 'Stock count committed.' : 'Inventory movement committed.');
      } catch (error) {
        setNotice(domainErrorMessage(error, operation === 'inventory.countLocation' ? 'commit this stock count' : 'commit this inventory movement'));
        throw error;
      }
    };
    if (permissions.includes(permission)) await execute();
    else if (payload.draftSessionId) throw new Error('Sign in with inventory.count permission to commit this scanner count.');
    else setApproval({ permission, run: async token => execute(token) });
  };

  const openMovement = (kind: 'TRANSFER' | 'WASTE', stockId?: string, locationId?: string) => {
    const targetId = stockId || selected?.id || stocks[0]?.id || '';
    const sourceLocation = locationId || form.locationId || locations[0]?.id || '';
    const destination = locations.find((location: any) => location.id !== sourceLocation)?.id || '';
    setNotice('');
    setForm(previous => ({ ...previous, stockItemId: targetId, locationId: sourceLocation, toLocationId: destination, quantity: 1, reason: '' }));
    setModal(kind);
  };
  const openLocationCount = (locationId = '') => { setCountLocationId(locationId); setModal('LOCATION_COUNT'); setNotice(''); };

  return <div className="h-full overflow-auto bg-slate-950 p-5 text-white">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="mb-1 text-[11px] font-black uppercase tracking-[0.22em] text-amber-400">Stock control</div>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">One location-driven stock truth. Count, transfer and waste actions post through the native ledger. Supplier receipts are posted through Procurement so stock, GRN, payable and journal remain one atomic chain.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={primaryButtonClass} onClick={() => openLocationCount()}>Count stock</button>
        <button className={buttonClass} onClick={() => openMovement('TRANSFER')}>Transfer</button>
        <button className={buttonClass} onClick={() => openMovement('WASTE')}>Record waste</button>
      </div>
    </div>

    {notice && <p role="status" className="mb-4 rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">{notice}</p>}

    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Stock masters" value={String(stocks.length)} hint={`${locations.length} stock location${locations.length === 1 ? '' : 's'}`} icon={<Boxes className="h-4 w-4"/>}/>
      <Metric label="Stock value" value={money(stockValue)} hint="Current quantity × average unit cost" icon={<PackageCheck className="h-4 w-4"/>}/>
      <Metric label="Low stock" value={String(lowCount)} hint="At or below configured reorder level" tone={lowCount ? 'amber' : 'normal'} icon={<AlertTriangle className="h-4 w-4"/>}/>
      <Metric label="Out of stock" value={String(outCount)} hint="Zero or below across all locations" tone={outCount ? 'rose' : 'normal'} icon={<Trash2 className="h-4 w-4"/>}/>
    </section>

    <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_180px_220px]">
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input className={fieldClass + ' pl-9'} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search stock name, SKU or barcode"/></label>
        <select className={fieldClass} value={statusFilter} onChange={event => setStatusFilter(event.target.value as StockStatus)}><option value="ALL">All stock states</option><option value="LOW">Low stock</option><option value="OUT">Out of stock</option><option value="HEALTHY">Healthy</option></select>
        <select className={fieldClass} value={locationFilter} onChange={event => setLocationFilter(event.target.value)}><option value="ALL">All locations / total</option>{locations.map((location: any) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
      </div>
    </section>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30">
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Stock item</th><th className="p-3">Status</th><th className="p-3 text-right">{locationFilter === 'ALL' ? 'Total on hand' : 'At location'}</th><th className="p-3 text-right">Reorder at</th><th className="p-3 text-right">Avg cost</th><th className="p-3 text-right">Stock value</th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.stock.id} onClick={() => setSelectedStockId(row.stock.id)} className={`cursor-pointer border-t border-slate-800 transition hover:bg-slate-900 ${selected?.id === row.stock.id ? 'bg-amber-400/5' : ''}`}><td className="p-3"><div className="font-semibold">{row.stock.name}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.stock.code || 'No SKU'}{row.stock.barcode ? ` · ${row.stock.barcode}` : ''}</div></td><td className="p-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(row.status)}`}>{row.status}</span></td><td className="p-3 text-right font-mono font-semibold">{row.locationQty.toLocaleString()} <span className="font-sans text-xs text-slate-500">{row.stock.baseUnit}</span></td><td className="p-3 text-right font-mono">{row.reorder > 0 ? `${row.reorder.toLocaleString()} ${row.stock.baseUnit}` : '—'}</td><td className="p-3 text-right">{money(row.stock.averageUnitCost)}</td><td className="p-3 text-right font-semibold">{money(row.value)}</td></tr>)}</tbody>
        </table></div>
        {filtered.length === 0 && <div className="p-8 text-center">{stocks.length===0?<><h2 className="font-semibold text-white">No stock items yet</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Create a stock master in Catalog before counting, moving or receiving stock. Inventory movements will be recorded in the native ledger.</p></>:<p className="text-sm text-slate-500">No stock items match the current filters. Try clearing the search or selecting another stock state.</p>}</div>}
      </section>

      <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        {!selected ? <p className="text-sm text-slate-500">Select a stock item to inspect quantities and movements.</p> : <>
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs uppercase tracking-wide text-slate-500">Selected stock</div><h2 className="mt-1 text-lg font-bold">{selected.name}</h2><div className="font-mono text-xs text-slate-500">{selected.code}</div></div><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(statusOf(selected))}`}>{statusOf(selected)}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><SmallFact label="Total on hand" value={`${totalStock(selected).toLocaleString()} ${selected.baseUnit}`}/><SmallFact label="Reorder level" value={Number(selected.reorderLevel || 0) > 0 ? `${Number(selected.reorderLevel).toLocaleString()} ${selected.baseUnit}` : 'Not set'}/><SmallFact label="Avg unit cost" value={money(selected.averageUnitCost)}/><SmallFact label="Scan quantity" value={`${Number(selected.scanUnitQuantity || 1).toLocaleString()} ${selected.baseUnit}`}/></div>
          <div className="mt-4"><div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">By location</div><div className="space-y-2">{locations.map((location: any) => { const qty = Number(selected.currentStock?.[location.id] || 0); return <button key={location.id} onClick={() => openLocationCount(location.id)} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3 text-left hover:border-slate-700"><span><b className="text-sm">{location.name}</b><span className="block text-[11px] text-slate-500">Start a full count at this Storage Place</span></span><span className="font-mono text-sm">{qty.toLocaleString()} {selected.baseUnit}</span></button>; })}</div></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button className={buttonClass} onClick={() => openLocationCount()}>Count location</button><button className={buttonClass} onClick={() => openMovement('TRANSFER', selected.id)}><ArrowRightLeft className="mr-1 inline h-3.5 w-3.5"/>Move</button><button className={buttonClass} onClick={() => openMovement('WASTE', selected.id)}>Waste</button></div>
          <div className="mt-5"><div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Recent movement history</div><div className="max-h-72 space-y-2 overflow-auto">{selectedMovements.map((movement: any) => <div key={movement.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"><div className="flex justify-between gap-3"><b>{movement.locationName || 'Stock location'}</b><span className={Number(movement.quantityDelta) >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{Number(movement.quantityDelta) > 0 ? '+' : ''}{Number(movement.quantityDelta).toLocaleString()} {movement.baseUnit}</span></div><div className="mt-1 text-slate-500">{movement.movementType} · {movement.reasonCode || movement.reason || 'Movement'}</div><div className="mt-1 text-slate-600">{shortDate(movement.occurredAt || movement.createdAt)}{movement.actorName ? ` · ${movement.actorName}` : ''}</div></div>)}{selectedMovements.length === 0 && <p className="text-xs text-slate-500">No movement history for this stock item yet.</p>}</div></div>
        </>}
      </aside>
    </div>

    {modal === 'LOCATION_COUNT' && <LocationStockCountDialog stocks={stocks} products={products} locations={locations} initialLocationId={countLocationId} onClose={() => setModal(null)} onCommit={async (payload, commandId) => { await act('inventory.countLocation', payload, 'inventory.count', commandId); }}/ >}
    {modal && modal !== 'LOCATION_COUNT' && <ActionDialog title={{ TRANSFER: 'Transfer stock', WASTE: 'Record waste' }[modal] || modal} onClose={() => setModal(null)}><InventoryForm modal={modal} form={form} setForm={setForm} stocks={stocks} locations={locations} onSubmit={async () => {
      if (modal === 'WASTE') await act('inventory.waste', { stockItemId: form.stockItemId, locationId: form.locationId, quantity: form.quantity, reason: form.reason || 'Declared waste' }, 'inventory.waste');
      if (modal === 'TRANSFER') await act('inventory.transfer', { stockItemId: form.stockItemId, locationId: form.locationId, toLocationId: form.toLocationId, quantity: form.quantity, reason: form.reason || 'Internal transfer' }, 'inventory.transfer');
    }} /></ActionDialog>}
    {approval && <ManagerApprovalDialog permission={approval.permission} onClose={() => setApproval(null)} onApproved={approval.run} />}
  </div>;
}

const Metric = ({ label, value, hint, icon, tone = 'normal' }: { label: string; value: string; hint: string; icon: React.ReactNode; tone?: 'normal' | 'amber' | 'rose' }) =>
  <div className={`rounded-2xl border p-4 ${tone === 'rose' ? 'border-rose-500/25 bg-rose-500/5' : tone === 'amber' ? 'border-amber-500/25 bg-amber-500/5' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{label}</div><div className="mt-2 text-2xl font-black">{value}</div><div className="mt-1 text-[11px] text-slate-500">{hint}</div></div>;

const SmallFact = ({ label, value }: { label: string; value: string }) =>
  <div className="rounded-xl bg-slate-950 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-600">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;

const ScannerCountSession = ({ stocks, products, locationId, locationName, onBack, onCommit }: {
  stocks: any[]; products: any[]; locationId: string; locationName: string; onBack: () => void;
  onCommit: (payload: Record<string, unknown>, commandId?: string) => Promise<void>;
}) => {
  const runtime = useRuntime();
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const scannerInput = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const sessionId = useRef(crypto.randomUUID() as string);
  const revision = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const saveFailure = useRef<unknown>(null);
  const committed = useRef(false);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading draft');
  const [baseline, setBaseline] = useState<InventoryCountDraft['baseline']>({});
  const [pending, setPending] = useState<InventoryCountDraft['pendingCommand']>();
  const pendingRef = useRef<InventoryCountDraft['pendingCommand']>(undefined);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [scanCounts, setScanCounts] = useState<Record<string, number>>({});
  const [unknownScans, setUnknownScans] = useState<{ barcode: string; count: number }[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [stage, setStage] = useState<'SCAN' | 'REVIEW'>('SCAN');
  const [active, setActive] = useState(true);
  const [buffer, setBuffer] = useState('');
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [discardKind,setDiscardKind]=useState<'saved-draft'|'active-session'|null>(null);
  const snapshotOf = (item: any) => ({ name: String(item.name), baseUnit: String(item.baseUnit), scanUnitQuantity: Number(item.scanUnitQuantity) > 0 ? Number(item.scanUnitQuantity) : 1, expectedQuantity: Number(item.currentStock?.[locationId] || 0) });
  const changed = stocks.filter(item => !baseline[item.id] || Object.entries(snapshotOf(item)).some(([key, value]) => baseline[item.id][key as keyof typeof baseline[string]] !== value));
  const rows = stocks.map(item => ({ item, expected: baseline[item.id]?.expectedQuantity ?? Number(item.currentStock?.[locationId] || 0), counted: counts[item.id] }));
  const completed = rows.filter(row => row.counted !== undefined).length;
  const complete = rows.length > 0 && changed.length === 0 && rows.every(row => Number.isFinite(row.counted) && row.counted >= 0 && row.counted <= 1e9 && Math.abs(row.counted * 1e6 - Math.round(row.counted * 1e6)) < 0.00001) && unknownScans.length === 0;
  const matches = rows.filter(row => row.counted === row.expected).length;
  const short = rows.filter(row => row.counted !== undefined && row.counted < row.expected).length;
  const over = rows.filter(row => row.counted !== undefined && row.counted > row.expected).length;

  useEffect(() => {
    let current = true;
    setLoaded(false);
    void runtimeRef.current.inventoryCountDraft(locationId).then(draft => {
      if (!current) return;
      setCounts(draft?.counts || {});
      setScanCounts(draft?.scanCounts || {});
      setUnknownScans(draft?.unknownScans || []);
      setUpdatedAt(draft?.updatedAt || '');
      sessionId.current = draft?.sessionId || crypto.randomUUID();
      revision.current = draft?.revision || 0;
      setBaseline(draft?.baseline || (draft ? {} : Object.fromEntries(stocks.map(item => [item.id, snapshotOf(item)]))));
      setPending(draft?.pendingCommand);
      pendingRef.current = draft?.pendingCommand;
      if (draft?.pendingCommand) { setStage('REVIEW'); setActive(false); }
      setProblem('');
      setLoaded(true);
    }).catch(cause => {
      if (!current) return;
      setProblem(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { current = false; };
  }, [locationId, loadAttempt]);

  const enqueue = (draft: InventoryCountDraft) => {
    setSaveStatus('Saving draft…');
    const operation = queue.current.then(async () => {
      if (committed.current) return;
      const saved = await runtimeRef.current.saveInventoryCountDraft(locationId, draft);
      saveFailure.current = null;
      setUpdatedAt(saved.updatedAt || new Date().toISOString()); setSaveStatus('Draft saved');
    });
    queue.current = operation.catch(cause => { saveFailure.current = cause; setSaveStatus('Draft save failed'); setProblem(String(cause)); });
    return operation;
  };
  const flush = async () => { await queue.current; if (saveFailure.current) throw saveFailure.current; };
  useLayoutEffect(() => {
    if (!loaded || pending || committed.current) return;
    void enqueue({ sessionId: sessionId.current, revision: ++revision.current, baseline, locationId, counts, scanCounts, unknownScans }).catch(() => {});
  }, [loaded, locationId, baseline, counts, scanCounts, unknownScans]);
  useEffect(() => guardLocalWork(async () => { if (submitting.current) throw new Error('Wait for count confirmation'); await flush(); }), []);
  const recountChanged = () => {
    const affected = new Set(changed.map(item => item.id));
    const ids = new Set(stocks.map(item => item.id));
    setCounts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => ids.has(id) && !affected.has(id))));
    setScanCounts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => ids.has(id) && !affected.has(id))));
    setBaseline(Object.fromEntries(stocks.map(item => [item.id, snapshotOf(item)])));
    setProblem(''); setNotice('Changed items cleared. Count them again before reviewing.');
  };

  const receiveScan = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || !loaded || pending || changed.length || busy) return;
    setBuffer(''); setProblem('');
    const exact = stocks.filter(item => barcodeEquals(item.barcode, code) || barcodeEquals(item.code, code));
    const linked = products.filter(product => product.active !== false && product.stockItemId && (barcodeEquals(product.barcode, code) || barcodeEquals(product.code, code))).map(product => stocks.find(item => item.id === product.stockItemId)).filter(Boolean);
    const matchesByStock = [...new Map([...exact, ...linked].map(item => [item.id, item])).values()];
    if (matchesByStock.length === 1) {
      const item = matchesByStock[0];
      const scanQuantity = Number(item.scanUnitQuantity) > 0 ? Number(item.scanUnitQuantity) : 1;
      setCounts(previous => ({ ...previous, [item.id]: Math.round(((previous[item.id] || 0) + scanQuantity) * 1_000_000) / 1_000_000 }));
      setScanCounts(previous => ({ ...previous, [item.id]: (previous[item.id] || 0) + 1 }));
      setNotice(`${item.name} +${scanQuantity.toLocaleString()} ${item.baseUnit || 'units'}`);
    } else {
      setUnknownScans(previous => {
        const existing = previous.find(item => barcodeEquals(item.barcode, code));
        return existing ? previous.map(item => barcodeEquals(item.barcode, code) ? { ...item, count: item.count + 1 } : item) : [...previous, { barcode: code, count: 1 }];
      });
      setProblem(matchesByStock.length ? `Barcode ${code} matches multiple stock items. Assign it after checking the label.` : `Barcode ${code} is unknown. The scan is saved for review and did not change stock.`);
    }
    window.setTimeout(() => scannerInput.current?.focus(), 0);
  };
  useBarcodeScanner({ enabled: loaded && !pending && !busy && changed.length === 0 && active && stage === 'SCAN', minLength: 3, onScan: receiveScan });

  const assignUnknown = (barcode: string, numberOfScans: number) => {
    const stockId = resolution[barcode];
    const item = stocks.find(stock => stock.id === stockId);
    if (!item) return;
    const scanQuantity = Number(item.scanUnitQuantity) > 0 ? Number(item.scanUnitQuantity) : 1;
    setCounts(previous => ({ ...previous, [item.id]: Math.round(((previous[item.id] || 0) + scanQuantity * numberOfScans) * 1_000_000) / 1_000_000 }));
    setScanCounts(previous => ({ ...previous, [item.id]: (previous[item.id] || 0) + numberOfScans }));
    setUnknownScans(previous => previous.filter(entry => entry.barcode !== barcode));
    setResolution(previous => { const next = { ...previous }; delete next[barcode]; return next; });
    setProblem(''); setNotice(`Assigned ${numberOfScans} scan${numberOfScans === 1 ? '' : 's'} to ${item.name}.`);
  };

  const review = async () => {
    if (!complete) return;
    setActive(false);
    try {
      await flush(); setProblem(''); setStage('REVIEW');
    } catch (cause) { setProblem(cause instanceof Error ? cause.message : String(cause)); setActive(true); }
  };
  const commit = async () => {
    if (submitting.current || (!pending && !complete)) return;
    submitting.current = true; setBusy(true);
    setProblem('');
    try {
      if (!pendingRef.current) await flush();
      const request = pendingRef.current || { id: crypto.randomUUID(), payload: { locationId, draftSessionId: sessionId.current, draftRevision: ++revision.current, reason: 'Continuous scanner stock count', rows: rows.map(row => ({ stockItemId: row.item.id, expectedQuantity: row.expected, countedQuantity: row.counted })) } };
      if (!pendingRef.current || saveFailure.current) {
        pendingRef.current = request; setPending(request);
        await enqueue({ sessionId: sessionId.current, revision: revision.current, baseline, locationId, counts, scanCounts, unknownScans, pendingCommand: request });
      }
      await onCommit(request.payload, request.id);
      committed.current = true;
    } catch (cause) { setProblem(`${String(cause)}. Retry uses the same reviewed command.`); }
    finally { submitting.current = false; setBusy(false); }
  };

  if (!loaded) return <><div className="rounded-xl bg-slate-950 p-4 text-sm text-slate-400">{problem ? <><p role="alert">Draft could not be loaded: {problem}. Editing is blocked to protect saved work.</p><button className={buttonClass} onClick={() => { setProblem(''); setLoadAttempt(value => value + 1); }}>Retry loading draft</button><button className={buttonClass} onClick={() => setDiscardKind('saved-draft')}>Discard saved draft</button></> : 'Loading saved scanner session…'}</div>{discardKind&&<ActionDialog title="Discard saved count draft" onClose={()=>setDiscardKind(null)}><p className="text-sm text-amber-100">Permanently remove the saved count draft for this Storage Place? No inventory has been changed.</p><div className="mt-4 flex justify-end gap-2"><button className={buttonClass} onClick={()=>setDiscardKind(null)}>Keep draft</button><button className={primaryButtonClass} onClick={()=>void runtime.clearInventoryCountDraft(locationId).then(()=>{setDiscardKind(null);setLoadAttempt(value=>value+1)}).catch(cause=>setProblem(String(cause)))}>Discard draft</button></div></ActionDialog>}</>;
  return <section className="rounded-xl border border-amber-500/25 bg-slate-950/70 p-3 sm:p-4">
    {problem && <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{problem}</p>}
    {problem && <button className={buttonClass} disabled={busy} onClick={() => setDiscardKind('active-session')}>Discard session and recount</button>}
    {changed.length > 0 && !pending && <p role="alert" className="mb-3 text-amber-200">Inventory or item details changed for {changed.length} items. <button className={buttonClass} onClick={recountChanged}>Recount changed items</button></p>}
    <p role="status" className="mb-2 text-xs text-slate-400">{saveStatus}</p>
    {Boolean(saveFailure.current) && <button className={buttonClass} onClick={() => void enqueue({ sessionId: sessionId.current, revision: revision.current, baseline, locationId, counts, scanCounts, unknownScans, ...(pending ? { pendingCommand: pending } : {}) }).catch(() => {})}>Retry saving draft</button>}
    {stage === 'SCAN' ? <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><b>{completed} / {stocks.length} items counted</b><p className="text-xs text-slate-400">{updatedAt ? `Draft saved ${new Date(updatedAt).toLocaleTimeString()}` : 'New local draft'} · scans change this draft only</p></div><button className={active ? buttonClass : primaryButtonClass} onClick={() => { setActive(value => !value); window.setTimeout(() => scannerInput.current?.focus(), 0); }}>{active ? 'Pause scanning' : 'Resume scanning'}</button></div>
      <label className="mb-3 block text-sm">Scan a barcode or stock code<input ref={scannerInput} data-barcode-capture="true" className={fieldClass + ' mt-1 font-mono'} value={buffer} onChange={event => setBuffer(event.target.value)} placeholder={active ? 'Scanner ready — scan now' : 'Resume scanning to capture codes'} disabled={!active} autoFocus={active}/></label>
      {notice && <p role="status" aria-live="polite" className="mb-3 rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-200">{notice}</p>}
      {unknownScans.length > 0 && <section className="mb-3 rounded-lg border border-rose-500/30 p-3"><h3 className="text-sm font-bold text-rose-200">Unknown barcodes</h3><p className="text-xs text-slate-400">Choose a stock item to assign these scans, or dismiss a scan that was not part of this count.</p>{unknownScans.map(entry => <div key={entry.barcode} className="mt-2 grid gap-2 sm:grid-cols-[minmax(100px,1fr)_minmax(140px,1fr)_auto_auto] sm:items-center"><code className="break-all text-xs">{entry.barcode} × {entry.count}</code><select aria-label={`Assign ${entry.barcode} to stock item`} className={fieldClass} value={resolution[entry.barcode] || ''} onChange={event => setResolution(previous => ({ ...previous, [entry.barcode]: event.target.value }))}><option value="">Select stock item</option>{stocks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className={buttonClass} disabled={!resolution[entry.barcode]} onClick={() => assignUnknown(entry.barcode,entry.count)}>Assign</button><button className={buttonClass} onClick={() => { setUnknownScans(previous => previous.filter(item => item.barcode !== entry.barcode)); setProblem(''); }}>Dismiss</button></div>)}</section>}
      <div className="max-h-[38vh] space-y-2 overflow-auto">{rows.map(({ item, expected, counted }) => <div key={item.id} className="grid gap-2 rounded-lg border border-slate-800 p-3 sm:grid-cols-[minmax(0,1fr)_100px_140px] sm:items-center"><div><b className="text-sm">{item.name}</b><p className="text-xs text-slate-500">Expected {expected.toLocaleString()} {item.baseUnit} · {scanCounts[item.id] || 0} scans × {Number(item.scanUnitQuantity) > 0 ? Number(item.scanUnitQuantity).toLocaleString() : 1} {item.baseUnit}</p></div><span className="text-xs text-slate-400">{counted === undefined ? 'Not counted' : `Counted ${counted.toLocaleString()}`}</span><label className="text-xs text-slate-500">Manual count<input aria-label={`Scanner count for ${item.name}`} className={fieldClass + ' mt-1'} type="number" min="0" step="0.000001" value={counted ?? ''} onChange={event => { const value=event.target.value; setCounts(previous => { const next={...previous}; if (value==='') delete next[item.id]; else next[item.id]=Number(value); return next; }); }}/></label></div>)}</div>
      <div className="mt-4 flex flex-wrap justify-between gap-2"><button className={buttonClass} onClick={() => void flush().then(onBack).catch(cause => setProblem(String(cause)))}>Back to manual count</button><button className={primaryButtonClass} disabled={!complete || Boolean(problem)} onClick={() => void review()}>Review scanner count</button></div>
    </> : <>
      <h3 className="mb-2 text-lg font-bold">Review scanner count</h3><p className="mb-3 text-sm text-slate-400">{rows.length} items · {matches} match · {short} short · {over} over · {locationName}. Draft scans have not changed inventory.</p>
      <div className="max-h-[42vh] space-y-2 overflow-auto">{rows.map(({ item, expected, counted }) => { const variance=(counted || 0)-expected; return <div key={item.id} className="flex justify-between gap-3 rounded-lg bg-slate-900 p-3 text-sm"><span>{item.name}<span className="ml-2 text-xs text-slate-500">{expected.toLocaleString()} → {counted?.toLocaleString()} {item.baseUnit}</span></span><b className={variance===0?'text-emerald-300':variance<0?'text-rose-300':'text-amber-300'}>{variance>0?'+':''}{variance.toLocaleString()}</b></div>; })}</div>
      <div className="mt-4 flex flex-wrap justify-between gap-2"><button className={buttonClass} disabled={busy || Boolean(pending)} onClick={() => { setStage('SCAN'); setActive(true); }}>Back to session</button><button className={primaryButtonClass} disabled={busy} onClick={() => void commit()}>{busy ? 'Confirming?' : pending ? 'Retry Confirm Count' : 'Confirm Count'}</button></div>
    </>}
    {discardKind==='active-session'&&<ActionDialog title="Discard count session" onClose={()=>setDiscardKind(null)}><p className="text-sm text-amber-100">Discard this saved count draft and start over? This does not undo any count that has already been committed.</p><div className="mt-4 flex justify-end gap-2"><button className={buttonClass} onClick={()=>setDiscardKind(null)}>Keep session</button><button className={primaryButtonClass} onClick={()=>void queue.current.then(()=>runtime.clearInventoryCountDraft(locationId)).then(()=>{committed.current=true;saveFailure.current=null;setDiscardKind(null);onBack()}).catch(cause=>{setDiscardKind(null);setProblem(String(cause))})}>Discard and recount</button></div></ActionDialog>}
  </section>;
};

const LocationStockCountDialog = ({ stocks, products, locations, initialLocationId, onClose, onCommit }: {
  stocks: any[]; products: any[]; locations: any[]; initialLocationId: string; onClose: () => void;
  onCommit: (payload: Record<string, unknown>, commandId?: string) => Promise<void>;
}) => {
  const [stage, setStage] = useState<'LOCATION' | 'COUNT' | 'SCANNER' | 'REVIEW'>(initialLocationId ? 'COUNT' : 'LOCATION');
  const [locationId, setLocationId] = useState(initialLocationId);
  useEffect(() => { if (initialLocationId) selectGuideResource('stock.count', { key: 'locationId', id: initialLocationId }); }, [initialLocationId]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const location = locations.find(item => item.id === locationId);
  const rows = stocks.map(item => {
    const expected = Number(item.currentStock?.[locationId] || 0);
    const counted = quantities[item.id] === undefined ? null : Number(quantities[item.id]);
    return { item, expected, counted, variance: counted === null ? null : counted - expected };
  });
  const query = filter.trim().toLowerCase();
  const visibleRows = rows.filter(row => !query || [row.item.name, row.item.code, row.item.barcode].some(value => String(value || '').toLowerCase().includes(query)));
  const complete = rows.length > 0 && rows.every(row => row.counted !== null && Number.isFinite(row.counted) && row.counted >= 0 && row.counted <= 1_000_000_000 && /^\d+(\.\d{1,6})?$/.test(quantities[row.item.id] || ''));
  const matches = rows.filter(row => row.variance === 0).length;
  const short = rows.filter(row => row.variance !== null && row.variance < 0).length;
  const over = rows.filter(row => row.variance !== null && row.variance > 0).length;
  const chooseLocation = (id: string) => { selectGuideResource('stock.count', { key: 'locationId', id }); setLocationId(id); setQuantities({}); setStage('COUNT'); setError(''); };
  const commit = async () => {
    setError('');
    try {
      await onCommit({ locationId, reason: reason.trim() || 'Location stock count', rows: rows.map(row => ({ stockItemId: row.item.id, expectedQuantity: row.expected, countedQuantity: row.counted })) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Count could not be committed. Review the location and try again.'); }
  };
  return <div className="fixed inset-0 z-[180] grid place-items-center bg-black/70 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Count stock by location">
    <div className="max-h-[94vh] w-full max-w-4xl overflow-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-widest text-amber-400">{stage === 'LOCATION' ? 'Count stock' : location?.name || 'Location count'}</div><h2 className="mt-1 text-xl font-bold">{stage === 'LOCATION' ? 'Where are you counting?' : stage === 'COUNT' ? 'Count every stock item' : stage === 'SCANNER' ? 'Continuous scanner session' : 'Review this count'}</h2>{stage === 'COUNT' && <p className="mt-1 text-sm text-slate-400">{Object.keys(quantities).length} / {stocks.length} counted · quantities are a draft until you confirm</p>}</div><button className={buttonClass} onClick={() => void flushLocalWork().then(onClose).catch(cause => setError(String(cause)))} aria-label="Close count">Close</button></div>
      {error && <p role="alert" className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {stage === 'LOCATION' && <div className="grid gap-3 sm:grid-cols-2">{locations.map(item => <button key={item.id} onClick={() => chooseLocation(item.id)} className="rounded-xl border border-slate-700 bg-slate-950 p-5 text-left text-lg font-bold hover:border-amber-400">{item.name}<span className="mt-1 block text-sm font-normal text-slate-500">Start a full stock count here</span></button>)}{locations.length === 0 && <p className="text-sm text-slate-400">Create a Storage Place before counting stock.</p>}</div>}
      {stage === 'COUNT' && <>
        <button className="mb-3 w-full rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-left text-sm font-semibold text-amber-200 hover:bg-amber-500/10" onClick={() => setStage('SCANNER')}>Continuous scanner session<span className="mt-1 block text-xs font-normal text-slate-400">Scan packages into a saved draft, then review before stock changes.</span></button>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]"><label><span className="sr-only">Filter stock items</span><input className={fieldClass} value={filter} onChange={event => setFilter(event.target.value)} placeholder="Find item by name, code or barcode" /></label><button className={buttonClass} onClick={() => { setStage('LOCATION'); setQuantities({}); }}>Change Storage Place</button></div>
        <div className="max-h-[52vh] space-y-2 overflow-auto pr-1">{visibleRows.map(({ item, expected, counted, variance }) => <div key={item.id} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[minmax(0,1fr)_120px_150px] sm:items-center"><div><div className="font-semibold">{item.name}</div><div className="text-xs text-slate-500">Expected {expected.toLocaleString()} {item.baseUnit} · {item.code || 'No code'}</div></div><div className={`text-sm font-semibold ${variance === null ? 'text-slate-500' : variance === 0 ? 'text-emerald-300' : variance < 0 ? 'text-rose-300' : 'text-amber-300'}`}>{variance === null ? 'Not counted' : `Variance ${variance > 0 ? '+' : ''}${variance.toLocaleString()}`}</div><label className="text-xs text-slate-500">Counted ({item.baseUnit})<input aria-label={`Counted quantity for ${item.name}`} className={fieldClass + ' mt-1'} type="number" min="0" max="1000000000" step="0.000001" value={quantities[item.id] ?? ''} onChange={event => setQuantities(previous => ({ ...previous, [item.id]: event.target.value }))} /></label></div>)}{visibleRows.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No stock items match that search.</p>}</div>
        <label className="mt-3 block text-sm">Count note <textarea className={fieldClass + ' mt-1'} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} placeholder="Optional reason for this count" /></label>
        <div className="mt-4 flex justify-end"><button className={primaryButtonClass} disabled={!complete} onClick={() => setStage('REVIEW')}>Review Count</button></div>
      </>}
      {stage === 'SCANNER' && <ScannerCountSession stocks={stocks} products={products} locationId={locationId} locationName={location?.name || 'Storage Place'} onBack={() => setStage('COUNT')} onCommit={onCommit} />}
      {stage === 'REVIEW' && <><div className="mb-4 grid grid-cols-3 gap-2"><SmallFact label="Match" value={String(matches)} /><SmallFact label="Short" value={String(short)} /><SmallFact label="Over" value={String(over)} /></div><p className="mb-3 text-sm text-slate-400">{stocks.length} items at {location?.name}. Stock changes only after you confirm.</p><div className="max-h-[45vh] space-y-2 overflow-auto">{rows.map(({ item, expected, counted, variance }) => <div key={item.id} className="flex justify-between gap-3 rounded-lg bg-slate-950 p-3 text-sm"><span>{item.name}<span className="ml-2 text-xs text-slate-500">{expected.toLocaleString()} → {counted?.toLocaleString()} {item.baseUnit}</span></span><b className={variance === 0 ? 'text-emerald-300' : variance! < 0 ? 'text-rose-300' : 'text-amber-300'}>{variance! > 0 ? '+' : ''}{variance!.toLocaleString()}</b></div>)}</div><div className="mt-4 flex flex-wrap justify-between gap-2"><button className={buttonClass} onClick={() => setStage('COUNT')}>Back to count</button><button className={primaryButtonClass} onClick={() => void commit()}>Confirm Count</button></div></>}
    </div>
  </div>;
};

const InventoryForm = ({ modal, form, setForm, stocks, locations, onSubmit }: {
  modal: string; form: any; setForm: (next: any) => void; stocks: any[]; locations: any[];
  onSubmit: () => Promise<void>;
}) => {
  const selected = stocks.find(item => item.id === form.stockItemId);
  return <div className="space-y-3">
    <label className="block text-sm">Stock item<select className={fieldClass + ' mt-1'} value={form.stockItemId} onChange={event => setForm({ ...form, stockItemId: event.target.value })}>{stocks.map(item => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select></label>
    <label className="block text-sm">Location<select className={fieldClass + ' mt-1'} value={form.locationId} onChange={event => setForm({ ...form, locationId: event.target.value, toLocationId: locations.find(location => location.id !== event.target.value)?.id || '' })}>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
    {modal === 'TRANSFER' && <label className="block text-sm">Destination<select className={fieldClass + ' mt-1'} value={form.toLocationId} onChange={event => setForm({ ...form, toLocationId: event.target.value })}>{locations.filter(location => location.id !== form.locationId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}
    <label className="block text-sm">Quantity in {selected?.baseUnit || 'base units'}<input className={fieldClass + ' mt-1'} type="number" min="0.001" step="0.001" value={form.quantity} onChange={event => setForm({ ...form, quantity: Number(event.target.value) })} /></label><label className="block text-sm">Reason / note<textarea className={fieldClass + ' mt-1'} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
    <button className={primaryButtonClass} disabled={!form.stockItemId || !form.locationId || Number(form.quantity) <= 0 || (modal === 'TRANSFER' && !form.toLocationId)} onClick={() => void onSubmit()}>{modal === 'TRANSFER' ? 'Commit transfer' : 'Commit waste'}</button>
  </div>;
};
