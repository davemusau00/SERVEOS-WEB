import {operatorError} from './operatorError';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../../design-system/controls';
import { parseQuantity } from '../../utils/fiscal';
import { isCommandConfirmed, type CommandOutcome } from '../../types/transactions';
import type { BusinessRecord } from './session';
import { inventoryRevisions } from './inventoryRevisions';
import type {QueuedCommand} from './BusinessStore';
import {inventoryCommandInFlight,inventoryQuantity,scopedStockQuantity} from './inventoryPresentation';

type CountValue = { quantity: string; sealed: string; open: string };
const data = (record: BusinessRecord) => record.data as Record<string, any>;
const active = (records: BusinessRecord[], collection: string) => records.filter(record => record.collection === collection && !record.archived);

export function WebPhysicalCountDialog({ records, queue=[], scope, locationId, command, onClose }: {
  records: BusinessRecord[];
  queue?: QueuedCommand[];
  scope: 'FULL' | 'SELECTED';
  locationId: string;
  command: (operation: string, collection: string, id: string, payload: Record<string, unknown>) => Promise<CommandOutcome>;
  onClose: () => void;
}) {
  const [reviewedRecords,setReviewedRecords]=useState(records);
  const stocks = useMemo(() => active(reviewedRecords, 'stockItems'), [reviewedRecords]);
  const locations = useMemo(() => active(reviewedRecords, 'stockLocations'), [reviewedRecords]);
  const products = useMemo(() => active(reviewedRecords, 'products'), [reviewedRecords]);
  const initialLocation = locationId || locations[0]?.id || '';
  const [targetLocation, setTargetLocation] = useState(initialLocation);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, CountValue>>(() => Object.fromEntries(stocks.map(stock => {
    const measured = scopedStockQuantity(stock,initialLocation),current=measured??0;
    const size = Number(data(stock).sealedContainerSize || 0);
    const sealed = size > 0 ? Math.floor(current / size) : 0;
    return [stock.id, { quantity: measured===null?'':String(current), sealed: measured===null?'':String(sealed), open: measured===null?'':String(Number((current - sealed * size).toFixed(6))) }];
  })));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending,setPending]=useState('');
  const [reviewReady,setReviewReady]=useState(false),[reviewAck,setReviewAck]=useState(false),[requiresReview,setRequiresReview]=useState(false);
  const inFlight=useRef(false);
  const [error, setError] = useState('');
  const [commandId] = useState(() => crypto.randomUUID());
  const targets = scope === 'FULL' ? stocks : stocks.filter(stock => selectedIds.includes(stock.id));
  const unresolved=inventoryCommandInFlight(queue,targets.map(stock=>stock.id));
  const changed=targets.some(stock=>{const current=records.find(row=>row.collection==='stockItems'&&row.id===stock.id);return !current||current.version!==stock.version||JSON.stringify(current.data.balanceVersions)!==JSON.stringify(stock.data.balanceVersions);});
  const blocked=busy||submitted||Boolean(unresolved)||requiresReview;
  const resetReview=()=>{setReviewReady(false);setReviewAck(false);};
  const updateValue = (stockId: string, next: Partial<CountValue>) => {resetReview();setValues(current => ({ ...current, [stockId]: { ...current[stockId], ...next } }));};
  useEffect(()=>{if(!pending)return;const entry=queue.find(row=>row.id===pending);if(!entry||!['SYNCHRONIZED','REJECTED','CONFLICT'].includes(entry.state))return;setPending('');if(entry.state==='SYNCHRONIZED'){onClose();return;}setSubmitted(false);setRequiresReview(true);setError(entry.result?.error?.message||'The original count was not accepted. Review current balances before recording another count.');},[queue,pending,onClose]);
  const setCountedQuantity = (stock: BusinessRecord, value: string) => {
    const size = Number(data(stock).sealedContainerSize || 0);
    const quantity = Number(value);
    updateValue(stock.id, { quantity: value, ...(size > 0 && Number.isFinite(quantity) ? { sealed: String(Math.floor(quantity / size)), open: String(Number((quantity % size).toFixed(6))) } : {}) });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked || changed || inFlight.current) return;
    setError('');
    if (!targetLocation || !targets.length) {
      setError(scope === 'SELECTED' ? 'Select at least one stock item to count.' : 'Choose a stock location before continuing.');
      return;
    }
    if (!reason.trim()) {
      setError('Add a short note describing this count.');
      return;
    }
    const rows: Record<string, unknown>[] = [];
    try {
      for (const stock of targets) {
        const stockData = data(stock);
        const current = scopedStockQuantity(stock,targetLocation);
        if(current===null)throw new Error(`${String(stockData.name)} has no reviewed stock projection. Synchronize before recording its count.`);
        const value = values[stock.id] || { quantity: '', sealed: '', open: '' };
        const quantity = parseQuantity(value.quantity,{maxDecimals:6});
        const row: Record<string, unknown> = {
          stockItemId: stock.id,
          expectedQuantity: current,
          countedQuantity: quantity,
          measurementMethod: 'EXACT',
          consumptionProductIds: products.filter(product => product.data.stockItemId === stock.id || Array.isArray(product.data.recipeIngredients) && product.data.recipeIngredients.some((line: any) => line.stockItemId === stock.id)).map(product => product.id).sort(),
        };
        const size = Number(stockData.sealedContainerSize || 0);
        if (size > 0) {
          const sealed = Number(value.sealed), open = Number(value.open);
          if (!Number.isInteger(sealed) || sealed < 0 || !Number.isFinite(open) || open < 0 || open >= size || Math.abs(quantity - sealed * size - open) > 0.001) {
            throw new Error(`${String(stockData.name)} must equal whole sealed containers plus an open quantity below ${size} ml.`);
          }
          row.countedSealedContainers = sealed;
          row.countedOpenQuantity = open;
        }
        rows.push(row);
      }
      const selectedStockItemIds = targets.map(stock => stock.id).sort();
      const productIds = [...new Set(rows.flatMap(row => row.consumptionProductIds as string[]))];
      const revisions = inventoryRevisions(reviewedRecords, selectedStockItemIds, [targetLocation], productIds);
      const payload = {
        id: commandId,
        locationId: targetLocation,
        scope,
        ...(scope === 'SELECTED' ? { selectedStockItemIds } : {}),
        rows,
        reason: reason.trim(),
        ...revisions,
      };
      if(!reviewReady){setReviewReady(true);setReviewAck(false);return;}
      if(!reviewAck){setError('Confirm the item-by-item variances before recording this count.');return;}
      if (!navigator.onLine) {
        setError('Connect to the API before confirming this stock count.');
        return;
      }
      inFlight.current=true;setBusy(true);
      const operation = scope === 'SELECTED' ? 'inventory.countSelected' : 'inventory.countLocation';
      const outcome = await command(operation, 'stockCounts', commandId, payload);
      if (isCommandConfirmed(outcome)) {
        onClose();
        return;
      }
      const message = 'message' in outcome ? outcome.message : 'Review Activity before submitting again.';
      if (outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN'){setSubmitted(true);setPending(outcome.commandId);}
      if(outcome.kind==='CONFLICT'||outcome.kind==='REJECTED'){setRequiresReview(true);resetReview();}
      setError(message);
    } catch (cause) {
      setError(operatorError(cause));
    } finally {
      setBusy(false);
      inFlight.current=false;
    }
  };

  return <Dialog title={scope === 'FULL' ? 'Count stock at a location' : 'Quick count selected items'} onClose={()=>{if(!inFlight.current)onClose();}}>
    <form onSubmit={event => void submit(event)} className="max-h-[72vh] space-y-4 overflow-y-auto">
      <p className="text-sm text-slate-400">Compare the current API balance with the physical quantity. The server checks the reviewed balances before it records the count.</p>
      {(changed||requiresReview)&&<div className="rounded-lg border border-amber-700/40 p-3 text-sm text-amber-200"><p>Stock has changed or the previous count was rejected. Physical quantities stay on this form until you close it. Review the latest balances before confirming.</p><button type="button" disabled={busy||submitted||Boolean(unresolved)} className="mt-2 min-h-11 rounded border border-amber-700 px-3" onClick={()=>{setReviewedRecords(records);setRequiresReview(false);resetReview();setError('');}}>Review latest balances, keep physical quantities</button></div>}
      {(submitted||unresolved)&&<p role="status" className="text-sm text-amber-200">An original action affecting these items is still pending. Recover it in Activity; this count has not been confirmed.</p>}
      <fieldset disabled={blocked} className="space-y-4">
      <label className="block text-sm">Location<select required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" value={targetLocation} onChange={event => { const nextLocation = event.target.value; resetReview(); setTargetLocation(nextLocation); setValues(Object.fromEntries(stocks.map(stock => { const current = Number(data(stock).currentStock?.[nextLocation] || 0); const size = Number(data(stock).sealedContainerSize || 0); const sealed = size > 0 ? Math.floor(current / size) : 0; return [stock.id, { quantity: String(current), sealed: String(sealed), open: String(Number((current - sealed * size).toFixed(6))) }]; }))); }}>{locations.map(location => <option key={location.id} value={location.id}>{String(data(location).name || location.id)}</option>)}</select></label>
      {scope === 'SELECTED' && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Items to count</legend>{stocks.map(stock => <label key={stock.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"><input type="checkbox" checked={selectedIds.includes(stock.id)} onChange={event => {resetReview();setSelectedIds(current => event.target.checked ? [...current, stock.id] : current.filter(id => id !== stock.id));}}/><span>{String(data(stock).name)} <span className="text-xs text-slate-500">{String(data(stock).code || '')}</span></span></label>)}</fieldset>}
      <div className="space-y-3">{targets.map(stock => {
        const stockData = data(stock), current = scopedStockQuantity(stock,targetLocation), value = values[stock.id] || { quantity: '', sealed: '', open: '' };
        const size = Number(stockData.sealedContainerSize || 0);
        return <section key={stock.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{String(stockData.name)}</h3><span className="text-sm text-slate-400">Reviewed: {inventoryQuantity(current)} {String(stockData.baseUnit || '')}<span className="block font-semibold text-amber-200">Variance: {current!==null&&value.quantity.trim()&&Number.isFinite(Number(value.quantity))?inventoryQuantity(Number(value.quantity)-current):'Not available'} {String(stockData.baseUnit||'')}</span></span></div>
          {size > 0 ? <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Sealed containers<input type="number" min="0" step="1" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={value.sealed} onChange={event => { const sealed = event.target.value; const open = Number(value.open || 0); const quantity = Number((Number(sealed) * size + open).toFixed(6)); updateValue(stock.id, { sealed, quantity: String(quantity) }); }}/></label><label className="block text-sm">Open quantity (ml)<input type="number" min="0" max={size - 0.000001} step="0.1" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={value.open} onChange={event => { const open = event.target.value; const quantity = Number((Number(value.sealed || 0) * size + Number(open || 0)).toFixed(6)); updateValue(stock.id, { open, quantity: String(quantity) }); }}/></label><p className="text-sm text-slate-400 sm:col-span-2">Counted total: {Number(value.quantity || 0).toLocaleString()} ml</p></div> : <label className="block text-sm">Physical quantity ({String(stockData.baseUnit || 'units')})<input type="number" min="0" step="0.000001" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={value.quantity} onChange={event => setCountedQuantity(stock, event.target.value)}/></label>}
        </section>;
      })}</div>
      <label className="block text-sm">Count note<textarea required minLength={3} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" value={reason} onChange={event => {resetReview();setReason(event.target.value);}} placeholder="For example: weekly bar count"/></label>
      {reviewReady&&<div className="rounded-lg border border-amber-700/40 bg-amber-500/5 p-3 text-sm"><p>Review {targets.length} item-by-item variances above. Confirming records these physical quantities and their stock movements together; quantities in different units are not totalled.</p><label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={reviewAck} onChange={event=>setReviewAck(event.target.checked)}/> I reviewed the item quantities, units and variances.</label></div>}
      </fieldset>
      {error&&<p role="alert" className="rounded-lg border border-rose-700/40 bg-rose-500/5 p-3 text-sm text-rose-200">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={blocked||changed||!targets.length||!targetLocation||reason.trim().length<3||reviewReady&&!reviewAck} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{busy?'Recording…':submitted?'Check Activity':reviewReady?'Record reviewed count':'Review count variances'}</button></div>
    </form>
  </Dialog>;
}
