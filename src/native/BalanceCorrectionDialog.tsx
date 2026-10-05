import React, { useEffect, useRef, useState } from 'react';
import { useRuntime, type InventoryCountDraft } from '../runtime/RuntimeProvider';
import { guardLocalWork } from '../runtime/localWork';
import { adjustmentPayload, emptyCountEntry, frozenDependencies, type CountEntry } from '../utils/bottleInventory';
import { BottleInputs } from './BottleCountDialog';
import { ActionDialog } from './ActionDialog';
import { buttonClass, fieldClass, primaryButtonClass } from './records';

export function BalanceCorrectionDialog({ stock, locations, sourceRecord, onClose }: { stock: any; locations: any[]; sourceRecord?: { collection: string; id: string }; onClose: () => void }) {
  const runtime = useRuntime(); const ref = useRef(runtime); ref.current = runtime;
  const [locationId, setLocationId] = useState(locations[0]?.id || ''); const [draft, setDraft] = useState<InventoryCountDraft | null>(null); const savedRef = useRef<InventoryCountDraft | null>(null);
  const [entry, setEntry] = useState<CountEntry>(emptyCountEntry()); const [reason, setReason] = useState(''); const [review, setReview] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const queue = useRef<Promise<void>>(Promise.resolve()); const failure = useRef<unknown>(null); const submitting = useRef(false);
  const persist = (value: InventoryCountDraft) => { savedRef.current = value; setDraft(value); const job = queue.current.then(async () => { await ref.current.saveInventoryCountDraft(value.locationId, value); failure.current = null; }); queue.current = job.catch(cause => { failure.current = cause; setError(String(cause)); }); return job; };
  const flush = async () => { await queue.current; if (failure.current) throw failure.current; };
  useEffect(() => guardLocalWork(async () => { if (submitting.current) throw new Error('Wait for correction confirmation'); await flush(); }), []);
  useEffect(() => { let current = true; setDraft(null); savedRef.current = null; setError(''); setEntry(emptyCountEntry()); setReason(''); setReview(false);
    void ref.current.inventoryCountDraft(locationId).then(saved => { if (!current) return;
      if (saved && (saved.scope !== 'CORRECTION' || !saved.baseline[stock.id])) throw new Error('A different count or correction is saved here. Complete or discard that draft first.');
      const versions = frozenDependencies(ref.current.snapshot?.records || [], [stock.id], locationId);
      const initial: InventoryCountDraft = saved || { sessionId: crypto.randomUUID(), revision: 1, locationId, scope: 'CORRECTION', baseline: { [stock.id]: { name: stock.name, baseUnit: stock.baseUnit, scanUnitQuantity: Number(stock.scanUnitQuantity || 1), expectedQuantity: Number(stock.currentStock?.[locationId] || 0) } }, expectedVersions: versions, entries: { [stock.id]: emptyCountEntry() }, counts: {}, scanCounts: {}, unknownScans: [], reason: '', sourceRecord };
      savedRef.current = initial; setDraft(initial); setEntry(initial.entries?.[stock.id] || emptyCountEntry()); setReason(initial.reason || ''); setReview(!!initial.pendingCommand); if (!saved) void persist(initial).catch(() => {});
    }).catch(cause => { if (current) setError(String(cause)); }); return () => { current = false; };
  }, [locationId, stock.id]);
  const change = (nextEntry: CountEntry, nextReason: string) => { const current = savedRef.current; if (!current || current.pendingCommand) return; setEntry(nextEntry); setReason(nextReason); void persist({ ...current, revision: current.revision + 1, entries: { [stock.id]: nextEntry }, reason: nextReason }).catch(() => {}); };
  const preview = () => adjustmentPayload(stock, locationId, entry, reason);
  let valid = false; let counted: number | null = null; try { counted = preview().countedQty; valid = !!draft; } catch {}
  const commit = async () => { if (submitting.current) return; submitting.current = true; setBusy(true); setError(''); try { await flush(); let current = savedRef.current!;
    if (!current.pendingCommand) { const revision = current.revision + 1; const payload = { ...preview(), expectedQuantity: current.baseline[stock.id].expectedQuantity, expectedVersions: current.expectedVersions, sourceRecord: current.sourceRecord, draftSessionId: current.sessionId, draftRevision: revision }; current = { ...current, revision, pendingCommand: { id: crypto.randomUUID(), operation: 'inventory.adjust', payload } }; await persist(current); }
    await ref.current.command('inventory.adjust', current.pendingCommand!.payload, undefined, current.pendingCommand!.id); await ref.current.clearInventoryCountDraft(locationId).catch(() => {}); onClose();
  } catch (cause) { setError(`${String(cause)}. Retry uses the original command.`); } finally { submitting.current = false; setBusy(false); } };
  return <ActionDialog title="Correct balance" onClose={() => void flush().then(onClose).catch(cause => setError(String(cause)))}><div className="space-y-3"><b>{stock.name}</b><p className="text-sm text-slate-400">Record the physical balance now. Earlier sales and the original record remain in history.</p><label className="block text-sm">Storage place<select disabled={busy || !!draft?.pendingCommand} className={fieldClass} value={locationId} onChange={event => void flush().then(() => setLocationId(event.target.value)).catch(cause => setError(String(cause)))}>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
    {draft && !review && !draft.pendingCommand && <><BottleInputs stock={stock} value={entry} onChange={value => change(value, reason)}/><label className="block text-sm">Reason<textarea className={fieldClass} maxLength={500} value={reason} onChange={event => change(entry, event.target.value)}/></label><button className={primaryButtonClass} disabled={!valid} onClick={() => void flush().then(() => setReview(true)).catch(cause => setError(String(cause)))}>Review correction</button><button className={buttonClass} onClick={() => void flush().then(() => ref.current.clearInventoryCountDraft(locationId)).then(onClose).catch(cause => setError(String(cause)))}>Discard correction draft</button></>}
    {(review || draft?.pendingCommand) && <><p>Before: {draft?.baseline[stock.id]?.expectedQuantity.toLocaleString()} {stock.baseUnit}. Corrected: {draft?.pendingCommand ? String(draft.pendingCommand.payload.countedQty) : counted?.toLocaleString()} {stock.baseUnit}.</p><p className="text-xs">{draft?.reason}</p><button className={buttonClass} disabled={busy || !!draft?.pendingCommand} onClick={() => setReview(false)}>Back</button><button className={primaryButtonClass} disabled={busy} onClick={() => void commit()}>{draft?.pendingCommand ? 'Retry correction' : 'Confirm correction'}</button></>}
    {draft?.pendingCommand&&<button className={buttonClass} disabled={busy} onClick={()=>void flush().then(()=>ref.current.clearInventoryCountDraft(locationId)).then(onClose).catch(cause=>setError(String(cause)))}>Discard resolved review</button>}
    {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}{failure.current != null && draft && <button className={buttonClass} onClick={() => void persist(draft).catch(() => {})}>Retry saving correction</button>}
  </div></ActionDialog>;
}
