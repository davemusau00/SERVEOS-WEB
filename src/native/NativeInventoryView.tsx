import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Boxes, CookingPot, PackageCheck, Search, Trash2 } from 'lucide-react';
import { selectGuideResource } from '../guidance/workflow';
import { useRuntime } from '../runtime/RuntimeProvider';
import { BottleCountDialog } from './BottleCountDialog';
import { ReceiptCorrectionDialog } from './ReceiptCorrectionDialog';
import { BalanceCorrectionDialog } from './BalanceCorrectionDialog';
import { bottleSize, physicalStock, classifyBottleStock } from '../utils/bottleInventory';
import type { Permission } from '../types/runtime';
import { recordsOf, fieldClass, buttonClass, primaryButtonClass, money, shortDate } from './records';
import { ManagerApprovalDialog } from './ManagerApprovalDialog';
import { ActionDialog } from './ActionDialog';
import { domainErrorMessage } from './errors/domainErrorMessages';

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
  const stocks: any[] = recordsOf(snapshot, 'stockItems');
  const products = recordsOf(snapshot, 'products');
  const locations = recordsOf(snapshot, 'stockLocations');
  const movements = recordsOf(snapshot, 'stockMovements').slice().reverse();
  const [modal, setModal] = useState<string | null>(null);
  const [correctionSource,setCorrectionSource]=useState<{collection:string;id:string}>();
  const [countScope,setCountScope]=useState<'FULL'|'SELECTED'>('FULL');
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
    quantity: 1, reason: '', disposition: 'SEALED',
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
        setNotice(operation === 'inventory.countLocation' ? 'Stock count committed.' : operation === 'inventory.produceBatch' ? 'Batch prepared and stock updated.' : 'Inventory movement committed.');
      } catch (error) {
        setNotice(domainErrorMessage(error, operation === 'inventory.countLocation' ? 'commit this stock count' : operation === 'inventory.produceBatch' ? 'prepare this batch' : 'commit this inventory movement'));
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
        {permissions.includes('inventory.adjust') && <button className={buttonClass} onClick={() => setModal('BATCH')}><CookingPot className="mr-1 inline h-4 w-4"/>Prepare batch</button>}
        <button className={primaryButtonClass} onClick={() => {setCountScope('FULL');openLocationCount();}}>Count stock</button>
        <button className={buttonClass} onClick={() => {setCountScope('SELECTED');openLocationCount();}}>Quick count</button><button className={buttonClass} onClick={() => setModal('CLASSIFY')}>Review bottle configuration</button><button className={buttonClass} onClick={() => openMovement('TRANSFER')}>Transfer</button>
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
          <tbody>{filtered.map(row => <tr key={row.stock.id} onClick={() => setSelectedStockId(row.stock.id)} className={`cursor-pointer border-t border-slate-800 transition hover:bg-slate-900 ${selected?.id === row.stock.id ? 'bg-amber-400/5' : ''}`}><td className="p-3"><div className="font-semibold">{row.stock.name}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.stock.code || 'No SKU'}{row.stock.barcode ? ` · ${row.stock.barcode}` : ''}</div></td><td className="p-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(row.status)}`}>{row.status}</span></td><td className="p-3 text-right font-mono font-semibold">{physicalStock(row.stock,locationFilter === 'ALL' ? undefined : locationFilter)}<span className="block text-[11px] text-slate-500">{row.locationQty.toLocaleString()} {row.stock.baseUnit}</span> <span className="font-sans text-xs text-slate-500">{row.stock.baseUnit}</span></td><td className="p-3 text-right font-mono">{row.reorder > 0 ? `${row.reorder.toLocaleString()} ${row.stock.baseUnit}` : '—'}</td><td className="p-3 text-right">{money(row.stock.averageUnitCost)}</td><td className="p-3 text-right font-semibold">{money(row.value)}</td></tr>)}</tbody>
        </table></div>
        {filtered.length === 0 && <div className="p-8 text-center">{stocks.length===0?<><h2 className="font-semibold text-white">No stock items yet</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Create a stock master in Catalog before counting, moving or receiving stock. Inventory movements will be recorded in the native ledger.</p></>:<p className="text-sm text-slate-500">No stock items match the current filters. Try clearing the search or selecting another stock state.</p>}</div>}
      </section>

      <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        {!selected ? <p className="text-sm text-slate-500">Select a stock item to inspect quantities and movements.</p> : <>
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs uppercase tracking-wide text-slate-500">Selected stock</div><h2 className="mt-1 text-lg font-bold">{selected.name}</h2><div className="font-mono text-xs text-slate-500">{selected.code}</div></div><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(statusOf(selected))}`}>{statusOf(selected)}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><SmallFact label="Total on hand" value={physicalStock(selected)}/><SmallFact label="Reorder level" value={Number(selected.reorderLevel || 0) > 0 ? `${Number(selected.reorderLevel).toLocaleString()} ${selected.baseUnit}` : 'Not set'}/><SmallFact label="Avg unit cost" value={money(selected.averageUnitCost)}/><SmallFact label="Scan quantity" value={`${Number(selected.scanUnitQuantity || 1).toLocaleString()} ${selected.baseUnit}`}/></div>
          <div className="mt-4"><div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">By location</div><div className="space-y-2">{locations.map((location: any) => { const qty = Number(selected.currentStock?.[location.id] || 0); return <button key={location.id} onClick={() => {setCountScope('FULL');openLocationCount(location.id);}} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3 text-left hover:border-slate-700"><span><b className="text-sm">{location.name}</b><span className="block text-[11px] text-slate-500">Start a full count at this Storage Place</span></span><span className="text-right font-mono text-sm">{physicalStock(selected,location.id)}<small className="block">{qty.toLocaleString()} {selected.baseUnit}</small></span></button>; })}</div></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button className={buttonClass} onClick={() => {setCountScope('FULL');openLocationCount();}}>Count location</button><button className={buttonClass} onClick={() => openMovement('TRANSFER', selected.id)}><ArrowRightLeft className="mr-1 inline h-3.5 w-3.5"/>Move</button><button className={buttonClass} onClick={() => openMovement('WASTE', selected.id)}>Waste</button></div>
          {permissions.includes('inventory.adjust')&&<button className={buttonClass+' mt-3'} onClick={()=>{setCorrectionSource(undefined);setModal('CORRECTION')}}>Correct balance</button>}<div className="mt-5"><div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Recent movement history</div><div className="max-h-72 space-y-2 overflow-auto">{selectedMovements.map((movement: any) => <div key={movement.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"><div className="flex justify-between gap-3"><b>{movement.locationName || 'Stock location'}</b><span className={Number(movement.quantityDelta) >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{Number(movement.quantityDelta) > 0 ? '+' : ''}{Number(movement.quantityDelta).toLocaleString()} {movement.baseUnit}</span></div><div className="mt-1 text-slate-500">{movement.movementType} · {movement.reasonCode || movement.reason || 'Movement'}</div><div className="mt-1 text-slate-600">{permissions.includes('inventory.adjust')&&<button className={buttonClass} onClick={()=>{setCorrectionSource({collection:'stockMovements',id:movement.id});setModal('CORRECTION')}}>Correct balance</button>}{permissions.includes('inventory.adjust')&&['WASTE','TRANSFER_IN','TRANSFER_OUT'].includes(movement.movementType)&&<button className={buttonClass} onClick={()=>{setCorrectionSource({collection:'stockMovements',id:movement.id});setModal('REVERSE_MOVEMENT')}}>Correct mistake ? Reverse recording</button>}{shortDate(movement.occurredAt || movement.createdAt)}{movement.actorName ? ` · ${movement.actorName}` : ''}</div></div>)}{selectedMovements.length === 0 && <p className="text-xs text-slate-500">No movement history for this stock item yet.</p>}</div></div>
        </>}
      </aside>
    </div>

    {recordsOf(snapshot,'stockCounts').length>0&&<section className="mt-5 rounded-xl border border-slate-700 p-3"><h2 className="font-bold">Stock count history</h2><div className="mt-2 max-h-64 space-y-2 overflow-auto">{recordsOf(snapshot,'stockCounts').slice().reverse().map(count=><div key={count.id} className="rounded border border-slate-800 p-3 text-sm"><b>{count.scope==='SELECTED'?'Quick count ? selected items':'Full stocktake'}</b><p>{count.locationName||count.locationId} ? {count.itemCount} items ? {shortDate(count.createdAt||count.occurredAt)}</p><p className="text-xs text-slate-400">{count.reason}</p>{permissions.includes('inventory.adjust')&&(count.rows||[]).map((row:any)=><button key={row.stockItemId} className={buttonClass+' mt-1 mr-1'} onClick={()=>{setSelectedStockId(row.stockItemId);setCorrectionSource({collection:'stockCounts',id:count.id});setModal('CORRECTION')}}>Correct mistake ? {row.stockItemName||stocks.find(stock=>stock.id===row.stockItemId)?.name||row.stockItemId}</button>)}</div>)}</div></section>}
    {modal === 'LOCATION_COUNT' && <BottleCountDialog stocks={stocks} products={products} locations={locations} initialLocationId={countLocationId} initialScope={countScope} onClose={() => setModal(null)} onCommit={async (operation,payload,commandId) => {await act(operation,payload,'inventory.count',commandId);}}/>}
    {modal === 'REVERSE_MOVEMENT' && <ReceiptCorrectionDialog movement receipt={movements.find(item=>item.id===correctionSource?.id)} onClose={()=>setModal(null)}/>}
    {modal === 'CORRECTION' && selected && <BalanceCorrectionDialog stock={selected} locations={locations} sourceRecord={correctionSource} onClose={()=>setModal(null)}/>}
    {modal === 'CLASSIFY' && <ActionDialog title="Bottle configuration review" onClose={()=>setModal(null)}><p className="mb-3 text-sm text-slate-400">Read-only preview. No stock or sale configuration changes here.</p><div className="max-h-[65vh] space-y-3 overflow-auto">{stocks.map(stock=>{const preview=classifyBottleStock(stock,products);return <div key={stock.id} className="rounded border border-slate-700 p-3"><b>{stock.name}</b><p className="text-sm">{preview.classification.replaceAll('_',' ').toLowerCase()} ? {physicalStock(stock)}</p><p className="text-xs text-slate-400">Size {preview.containerSize||'not configured'} ml ? scan {stock.scanUnitQuantity||1} {stock.baseUnit} ? products {preview.linkedProductIds.join(', ')||'none'} ? recipe/modifier consumers {preview.consumerProductIds.join(', ')||'none'}</p><p className="text-xs text-amber-200">{preview.problems.join(' ')}</p></div>})}</div></ActionDialog>}
    {modal === 'BATCH' && <ActionDialog title="Prepare a recipe batch" onClose={() => setModal(null)}><BatchPreparationForm products={products} stocks={stocks} locations={locations} onClose={()=>setModal(null)} onSubmit={async payload => { await act('inventory.produceBatch', payload, 'inventory.adjust'); }}/></ActionDialog>}
    {modal && ['TRANSFER','WASTE'].includes(modal) && <ActionDialog title={{ TRANSFER: 'Transfer stock', WASTE: 'Record waste' }[modal] || modal} onClose={() => setModal(null)}><InventoryForm modal={modal} form={form} setForm={setForm} stocks={stocks} locations={locations} onSubmit={async () => {
      if (modal === 'WASTE') await act('inventory.waste', { stockItemId: form.stockItemId, locationId: form.locationId, quantity: bottleSize(stocks.find(stock=>stock.id===form.stockItemId)||{id:''}) && form.disposition==='SEALED' ? form.quantity*Number(stocks.find(stock=>stock.id===form.stockItemId)?.sealedContainerSize) : form.quantity, ...(bottleSize(stocks.find(stock=>stock.id===form.stockItemId)||{id:''})?{disposition:form.disposition}:{}), reason: form.reason || 'Declared waste' }, 'inventory.waste');
      if (modal === 'TRANSFER') await act('inventory.transfer', { stockItemId: form.stockItemId, locationId: form.locationId, toLocationId: form.toLocationId, quantity: bottleSize(stocks.find(stock=>stock.id===form.stockItemId)||{id:''}) && form.disposition==='SEALED' ? form.quantity*Number(stocks.find(stock=>stock.id===form.stockItemId)?.sealedContainerSize) : form.quantity, ...(bottleSize(stocks.find(stock=>stock.id===form.stockItemId)||{id:''})?{disposition:form.disposition}:{}), reason: form.reason || 'Internal transfer' }, 'inventory.transfer');
    }} /></ActionDialog>}
    {approval && <ManagerApprovalDialog permission={approval.permission} onClose={() => setApproval(null)} onApproved={approval.run} />}
  </div>;
}

function BatchPreparationForm({products,stocks,locations,onSubmit,onClose}:{products:any[];stocks:any[];locations:any[];onSubmit:(payload:Record<string,unknown>)=>Promise<void>;onClose:()=>void}) {
  const recipes=products.filter(product=>product.inventoryType==='BATCH'&&typeof product.stockItemId==='string'&&product.stockItemId&&Array.isArray(product.recipeIngredients)&&product.recipeIngredients.length>0);
  const [recipeProductId,setRecipeProductId]=useState(recipes[0]?.id||'');
  const [locationId,setLocationId]=useState(locations[0]?.id||'');
  const [batchCount,setBatchCount]=useState(1);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const recipe=recipes.find(product=>product.id===recipeProductId);
  const ingredients=Array.isArray(recipe?.recipeIngredients)?recipe.recipeIngredients:[];
  const outputStockItemId=String(recipe?.stockItemId||'');
  const selectedOutput=stocks.find(stock=>stock.id===outputStockItemId&&['piece','portion'].includes(String(stock.baseUnit||'piece').toLowerCase()));
  const yieldPerBatch=Number(recipe?.recipeYield||0);
  const outputCount=yieldPerBatch*batchCount;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setError('');
    if(!recipe||!selectedOutput||!locationId||!Number.isInteger(batchCount)||batchCount<1||batchCount>1000||!reason.trim())return;
    setBusy(true);
    try{await onSubmit({recipeProductId,outputStockItemId,locationId,batchCount,reason:reason.trim()})}
    catch(cause){setError(domainErrorMessage(cause,'prepare this batch'))}
    finally{setBusy(false)}
  };
  return <form className="max-h-[75vh] space-y-4 overflow-y-auto p-1" onSubmit={event=>void submit(event)}>
    {!recipes.length?<div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><b>No batch recipes are configured.</b><p className="mt-1 text-slate-400">Create a Batch recipe in Catalog first. ServOS will use its saved per-portion recipe and full-batch yield.</p></div>:<>
      <label className="block text-sm">Batch recipe<select required className={fieldClass+' mt-1'} value={recipeProductId} onChange={event=>setRecipeProductId(event.target.value)}>{recipes.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"><b>Finished portions stock</b><p className="mt-1">{selectedOutput?`${selectedOutput.name} · ${selectedOutput.baseUnit}`:'Linked output stock must use piece or portion units.'}</p><p className="mt-1 text-xs text-slate-500">POS deducts prepared portions from this linked stock. The saved recipe ingredients are consumed here during preparation.</p></div>
      <label className="block text-sm">Storage place<select required className={fieldClass+' mt-1'} value={locationId} onChange={event=>setLocationId(event.target.value)}><option value="">Choose storage place</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label className="block text-sm">Number of batches<input required className={fieldClass+' mt-1'} type="number" min="1" max="1000" step="1" value={batchCount} onChange={event=>setBatchCount(Number(event.target.value))}/></label>
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"><div className="font-semibold">Preparation preview</div><p className="mt-1">{recipe?.name||'Select a recipe'} makes {yieldPerBatch||'—'} portions per batch · output {outputCount||'—'} {selectedOutput?.baseUnit||'portions'} into {locations.find(location=>location.id===locationId)?.name||'the selected location'}.</p><div className="mt-2 space-y-1 text-xs text-slate-400">{ingredients.map((line:any)=><p key={line.stockItemId}>{stocks.find(stock=>stock.id===line.stockItemId)?.name||line.stockItemId}: {(Number(line.quantity)*yieldPerBatch*batchCount).toLocaleString()} {stocks.find(stock=>stock.id===line.stockItemId)?.baseUnit||'units'}</p>)}</div><p className="mt-2 text-xs text-slate-500">Ingredient consumption and finished-portion stock are committed together. Insufficient input stock rejects the whole preparation.</p></section>
      <label className="block text-sm">Preparation note<input required minLength={3} maxLength={180} className={fieldClass+' mt-1'} value={reason} onChange={event=>setReason(event.target.value)} placeholder="e.g. Lunch service prep"/></label>
    </>}
    {error&&<p role="alert" className="rounded-lg bg-rose-950 p-3 text-sm text-rose-200">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" className={buttonClass} onClick={onClose}>Close</button><button type="submit" disabled={!recipes.length||busy||!selectedOutput||!locationId||!reason.trim()} className={primaryButtonClass}>{busy?'Preparing…':'Prepare batch'}</button></div>
  </form>;
}

const Metric = ({ label, value, hint, icon, tone = 'normal' }: { label: string; value: string; hint: string; icon: React.ReactNode; tone?: 'normal' | 'amber' | 'rose' }) =>
  <div className={`rounded-2xl border p-4 ${tone === 'rose' ? 'border-rose-500/25 bg-rose-500/5' : tone === 'amber' ? 'border-amber-500/25 bg-amber-500/5' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{label}</div><div className="mt-2 text-2xl font-black">{value}</div><div className="mt-1 text-[11px] text-slate-500">{hint}</div></div>;

const SmallFact = ({ label, value }: { label: string; value: string }) =>
  <div className="rounded-xl bg-slate-950 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-600">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;

const InventoryForm = ({ modal, form, setForm, stocks, locations, onSubmit }: {
  modal: string; form: any; setForm: (next: any) => void; stocks: any[]; locations: any[];
  onSubmit: () => Promise<void>;
}) => {
  const selected = stocks.find(item => item.id === form.stockItemId);
  return <div className="space-y-3">
    <label className="block text-sm">Stock item<select className={fieldClass + ' mt-1'} value={form.stockItemId} onChange={event => setForm({ ...form, stockItemId: event.target.value })}>{stocks.map(item => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select></label>
    <label className="block text-sm">Location<select className={fieldClass + ' mt-1'} value={form.locationId} onChange={event => setForm({ ...form, locationId: event.target.value, toLocationId: locations.find(location => location.id !== event.target.value)?.id || '' })}>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
    {modal === 'TRANSFER' && <label className="block text-sm">Destination<select className={fieldClass + ' mt-1'} value={form.toLocationId} onChange={event => setForm({ ...form, toLocationId: event.target.value })}>{locations.filter(location => location.id !== form.locationId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}
    {bottleSize(selected||{id:''})&&<label className="block text-sm">Physical stock<select className={fieldClass} value={form.disposition} onChange={event=>setForm({...form,disposition:event.target.value})}><option value="SEALED">Sealed bottles</option><option value="OPEN">Open liquid (ml)</option></select></label>}<label className="block text-sm">Quantity in {bottleSize(selected||{id:''})&&form.disposition==='SEALED'?'sealed bottles':selected?.baseUnit || 'base units'}<input className={fieldClass + ' mt-1'} type="number" min="0.001" step="0.001" value={form.quantity} onChange={event => setForm({ ...form, quantity: Number(event.target.value) })} /></label><label className="block text-sm">Reason / note<textarea className={fieldClass + ' mt-1'} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
    <button className={primaryButtonClass} disabled={!form.stockItemId || !form.locationId || Number(form.quantity) <= 0 || (modal === 'TRANSFER' && !form.toLocationId)} onClick={() => void onSubmit()}>{modal === 'TRANSFER' ? 'Commit transfer' : 'Commit waste'}</button>
  </div>;
};
