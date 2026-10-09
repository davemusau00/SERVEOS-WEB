import React, { useMemo, useState } from 'react';
import { Dialog } from '../../design-system/controls';
import { parseQuantity } from '../../utils/fiscal';
import { isCommandConfirmed, type CommandOutcome } from '../../types/transactions';
import type { BusinessRecord } from './session';
import { inventoryRevisions } from './inventoryRevisions';

type CountValue = { quantity: string; sealed: string; open: string };
const data = (record: BusinessRecord) => record.data as Record<string, any>;
const active = (records: BusinessRecord[], collection: string) => records.filter(record => record.collection === collection && !record.archived);

export function WebPhysicalCountDialog({ records, scope, locationId, command, onClose }: {
  records: BusinessRecord[];
  scope: 'FULL' | 'SELECTED';
  locationId: string;
  command: (operation: string, collection: string, id: string, payload: Record<string, unknown>) => Promise<CommandOutcome>;
  onClose: () => void;
}) {
  const stocks = useMemo(() => active(records, 'stockItems'), [records]);
  const locations = useMemo(() => active(records, 'stockLocations'), [records]);
  const products = useMemo(() => active(records, 'products'), [records]);
  const initialLocation = locationId || locations[0]?.id || '';
  const [targetLocation, setTargetLocation] = useState(initialLocation);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, CountValue>>(() => Object.fromEntries(stocks.map(stock => {
    const current = Number(data(stock).currentStock?.[initialLocation] || 0);
    const size = Number(data(stock).sealedContainerSize || 0);
    const sealed = size > 0 ? Math.floor(current / size) : 0;
    return [stock.id, { quantity: String(current), sealed: String(sealed), open: String(Number((current - sealed * size).toFixed(6))) }];
  })));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [commandId] = useState(() => crypto.randomUUID());
  const targets = scope === 'FULL' ? stocks : stocks.filter(stock => selectedIds.includes(stock.id));
  const updateValue = (stockId: string, next: Partial<CountValue>) => setValues(current => ({ ...current, [stockId]: { ...current[stockId], ...next } }));
  const setCountedQuantity = (stock: BusinessRecord, value: string) => {
    const size = Number(data(stock).sealedContainerSize || 0);
    const quantity = Number(value);
    updateValue(stock.id, { quantity: value, ...(size > 0 && Number.isFinite(quantity) ? { sealed: String(Math.floor(quantity / size)), open: String(Number((quantity % size).toFixed(6))) } : {}) });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || submitted) return;
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
        const current = Number(stockData.currentStock?.[targetLocation] || 0);
        const value = values[stock.id] || { quantity: '', sealed: '', open: '' };
        const quantity = parseQuantity(value.quantity);
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
      const revisions = inventoryRevisions(records, selectedStockItemIds, [targetLocation], productIds);
      const payload = {
        id: commandId,
        locationId: targetLocation,
        scope,
        ...(scope === 'SELECTED' ? { selectedStockItemIds } : {}),
        rows,
        reason: reason.trim(),
        ...revisions,
      };
      setBusy(true);
      if (!navigator.onLine) {
        setError('Connect to the API before confirming this stock count.');
        return;
      }
      const operation = scope === 'SELECTED' ? 'inventory.countSelected' : 'inventory.countLocation';
      const outcome = await command(operation, 'stockCounts', commandId, payload);
      if (isCommandConfirmed(outcome)) {
        onClose();
        return;
      }
      const message = 'message' in outcome ? outcome.message : 'Review Activity before submitting again.';
      if (['PENDING', 'OUTCOME_UNKNOWN', 'CONFLICT'].includes(outcome.kind)) setSubmitted(true);
      setError(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return <Dialog title={scope === 'FULL' ? 'Count stock at a location' : 'Quick count selected items'} onClose={onClose}>
    <form onSubmit={event => void submit(event)} className="max-h-[72vh] space-y-4 overflow-y-auto">
      <p className="text-sm text-slate-400">Compare the current API balance with the physical quantity. The server checks the reviewed balances before it records the count.</p>
      <label className="block text-sm">Location<select required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" value={targetLocation} onChange={event => { const nextLocation = event.target.value; setTargetLocation(nextLocation); setValues(Object.fromEntries(stocks.map(stock => { const current = Number(data(stock).currentStock?.[nextLocation] || 0); const size = Number(data(stock).sealedContainerSize || 0); const sealed = size > 0 ? Math.floor(current / size) : 0; return [stock.id, { quantity: String(current), sealed: String(sealed), open: String(Number((current - sealed * size).toFixed(6))) }]; }))); }}>{locations.map(location => <option key={location.id} value={location.id}>{String(data(location).name || location.id)}</option>)}</select></label>
      {scope === 'SELECTED' && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Items to count</legend>{stocks.map(stock => <label key={stock.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"><input type="checkbox" checked={selectedIds.includes(stock.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, stock.id] : current.filter(id => id !== stock.id))}/><span>{String(data(stock).name)} <span className="text-xs text-slate-500">{String(data(stock).code || '')}</span></span></label>)}</fieldset>}
      <div className="space-y-3">{targets.map(stock => {
        const stockData = data(stock), current = Number(stockData.currentStock?.[targetLocation] || 0), value = values[stock.id] || { quantity: '', sealed: '', open: '' };
        const size = Number(stockData.sealedContainerSize || 0);
        return <section key={stock.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{String(stockData.name)}</h3><span className="text-sm text-slate-400">Current: {current.toLocaleString()} {String(stockData.baseUnit || '')}</span></div>
          {size > 0 ? <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Sealed containers<input type="number" min="0" step="1" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={value.sealed} onChange={event => { const sealed = event.target.value; const open = Number(value.open || 0); const quantity = Number((Number(sealed) * size + open).toFixed(6)); updateValue(stock.id, { sealed, quantity: String(quantity) }); }}/></label><label className="block text-sm">Open quantity (ml)<input type="number" min="0" max={size - 0.000001} step="0.1" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={value.open} onChange={event => { const open = event.target.value; const quantity = Number((Number(value.sealed || 0) * size + Number(open || 0)).toFixed(6)); updateValue(stock.id, { open, quantity: String(quantity) }); }}/></label><p className="text-sm text-slate-400 sm:col-span-2">Counted total: {Number(value.quantity || 0).toLocaleString()} ml</p></div> : <label className="block text-sm">Physical quantity ({String(stockData.baseUnit || 'units')})<input type="number" min="0" step="0.000001" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2" value={value.quantity} onChange={event => setCountedQuantity(stock, event.target.value)}/></label>}
        </section>;
      })}</div>
      <label className="block text-sm">Count note<textarea required minLength={3} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" value={reason} onChange={event => setReason(event.target.value)} placeholder="For example: weekly bar count"/></label>
      {error&&<p role="alert" className="rounded-lg border border-rose-700/40 bg-rose-500/5 p-3 text-sm text-rose-200">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={busy||submitted||!targets.length||!targetLocation||reason.trim().length<3} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">{busy?'Recording…':submitted?'Check Activity':'Review and record count'}</button></div>
    </form>
  </Dialog>;
}
