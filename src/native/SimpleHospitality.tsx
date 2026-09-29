import React, { useRef, useState } from 'react';
import { useRuntime } from '../runtime/RuntimeProvider';
import { ActionDialog } from './ActionDialog';
import { buttonClass, fieldClass, primaryButtonClass, recordsOf } from './records';

function useSubmit(onClose: () => void) {
  const runtime = useRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const attempts = useRef(new Map<string, string>());
  const submit = async (operation: string, payload: Record<string, unknown>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { const key = JSON.stringify({ operation, payload }); const commandId = attempts.current.get(key) || crypto.randomUUID(); attempts.current.set(key, commandId); await runtime.command(operation, payload, undefined, commandId); onClose(); }
    catch (cause) { setError(String(cause)); }
    finally { running.current = false; setBusy(false); }
  };
  return { busy, error, submit };
}

export function SimpleRoomDialog({ onClose }: { onClose: () => void }) {
  const runtime = useRuntime();
  const types = recordsOf(runtime.snapshot, 'roomTypes');
  const rooms = recordsOf(runtime.snapshot, 'rooms');
  const [type, setType] = useState(types[0]?.id || 'NEW');
  const [number, setNumber] = useState('');
  const [bulk, setBulk] = useState(false);
  const [end, setEnd] = useState('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [price, setPrice] = useState('');
  const [turnaround, setTurnaround] = useState('30');
  const [initialStatus, setInitialStatus] = useState('READY');
  const [floor, setFloor] = useState('');
  const [review, setReview] = useState(false);
  const { busy, error, submit } = useSubmit(onClose);
  const rangeValid = /^\d{1,6}$/.test(number) && /^\d{1,6}$/.test(end) && Number(end) >= Number(number) && Number(end) - Number(number) < 200;
  const numbers = bulk ? rangeValid ? Array.from({ length: Number(end) - Number(number) + 1 }, (_, i) => String(Number(number) + i).padStart(number.length, '0')) : [] : number.trim() ? [number.trim()] : [];
  const conflicts = numbers.filter(value => rooms.some(room => String(room.number).trim().toLowerCase() === value.toLowerCase()));
  const valid = numbers.length > 0 && conflicts.length === 0 && (type !== 'NEW' || (name.trim() && /^\d+$/.test(capacity) && Number(capacity) > 0 && /^\d+(\.\d{1,2})?$/.test(price)));
  return <ActionDialog title={bulk ? 'Add Rooms' : 'Add Room'} onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-3" data-guide-anchor="rooms.add">
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {!review ? <>
        <label className="block text-sm">Room number{bulk ? ' from' : ''}<input className={fieldClass} value={number} maxLength={40} onChange={event => setNumber(event.target.value)} placeholder="104" /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={bulk} onChange={event => setBulk(event.target.checked)} />Add a range of rooms</label>
        {bulk && <label className="block text-sm">Last room number<input className={fieldClass} value={end} onChange={event => setEnd(event.target.value)} /><span className="text-xs text-slate-400">Up to 200 rooms. Review every generated number before adding.</span></label>}
        <label className="block text-sm">Room type<select className={fieldClass} value={type} onChange={event => setType(event.target.value)}>{types.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="NEW">Create a room type</option></select></label>
        {type === 'NEW' && <div className="space-y-2 rounded-lg border border-slate-700 p-3"><label className="block text-sm">Type name<input className={fieldClass} value={name} onChange={event => setName(event.target.value)} placeholder="Standard" /></label><label className="block text-sm">Guest capacity<input className={fieldClass} type="number" min="1" max="1000" value={capacity} onChange={event => setCapacity(event.target.value)} /></label><label className="block text-sm">Normal nightly price (KES)<input className={fieldClass} type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label><p className="text-xs text-slate-400">Creates a nightly rate with no additional rate tax. Configure rate taxes and special prices in Rate plans.</p></div>}
        <details><summary className="cursor-pointer text-sm text-amber-200">Advanced details</summary><label className="block text-sm">Floor<input className={fieldClass} value={floor} onChange={event => setFloor(event.target.value)} /></label><label className="block text-sm">Turnaround (minutes)<input className={fieldClass} type="number" min="0" max="1440" value={turnaround} onChange={event => setTurnaround(event.target.value)} /></label><label className="block text-sm">Initial condition<select className={fieldClass} value={initialStatus} onChange={event => setInitialStatus(event.target.value)}><option value="READY">Ready</option><option value="DIRTY">Needs cleaning</option><option value="OUT_OF_ORDER">Out of order</option></select></label></details>
        {conflicts.length > 0 && <p role="alert" className="text-rose-300">Already exists: {conflicts.join(', ')}. No rooms will be added.</p>}
        <button className={primaryButtonClass} disabled={!valid} onClick={() => setReview(true)}>Review rooms</button>
      </> : <><p className="text-sm">Add {numbers.length} room(s) as {type === 'NEW' ? name : types.find(item => item.id === type)?.name}:</p><p className="max-h-44 overflow-auto break-words rounded-lg bg-slate-950 p-3">{numbers.join(', ')}</p><p className="text-xs text-slate-400">All rooms are saved together. A conflict prevents the entire batch.</p><div className="flex gap-2"><button className={buttonClass} disabled={busy} onClick={() => setReview(false)}>Back</button><button className={primaryButtonClass} disabled={busy || !valid} onClick={() => void submit('room.quickCreate', { numbers, ...(type === 'NEW' ? { newType: { name: name.trim(), capacity: Number(capacity), nightlyPrice: Number(price) } } : { roomTypeId: type }), details: { floor, turnaroundMinutes: Number(turnaround), initialStatus } })}>{busy ? 'Adding…' : numbers.length === 1 ? 'Add Room' : 'Add Rooms'}</button></div></>}
    </div>
  </ActionDialog>;
}

export function SimplePropertyDialog({ onClose }: { onClose: () => void }) {
  const runtime = useRuntime();
  const rooms = recordsOf(runtime.snapshot, 'rooms'), places = recordsOf(runtime.snapshot, 'stockLocations'), categories = recordsOf(runtime.snapshot, 'assetCategories');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, error, submit } = useSubmit(onClose);
  return <ActionDialog title="Add Property" onClose={() => { if (!busy) onClose(); }}><div className="space-y-3" data-guide-anchor="property.add">
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <label className="block text-sm">Property name<input className={fieldClass} value={name} onChange={event => setName(event.target.value)} placeholder="Samsung TV" /></label>
    <label className="block text-sm">Where is it?<select className={fieldClass} value={location} onChange={event => setLocation(event.target.value)}><option value="">Choose location</option>{rooms.map(item => <option key={item.id} value={`room:${item.id}`}>Room {item.number}</option>)}{places.map(item => <option key={item.id} value={`place:${item.id}`}>{item.name}</option>)}</select></label>
    <details><summary className="cursor-pointer text-sm text-amber-200">Advanced details</summary><label className="block text-sm">Category<select className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}><option value="">Unclassified property</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm">Notes<textarea className={fieldClass} value={notes} onChange={event => setNotes(event.target.value)} /></label></details>
    <p className="text-xs text-slate-400">Registers existing property with a unique permanent tag. Acquisition cost remains unrecorded. For a purchased asset waiting for commissioning, use Commissioning.</p>
    <button className={primaryButtonClass} disabled={busy || !name.trim() || !location} onClick={() => void submit('asset.quickCreate', { name: name.trim(), ...(location.startsWith('room:') ? { roomId: location.slice(5) } : { locationId: location.slice(6) }), assetCategoryId: category, notes: `${notes}${notes ? '\n' : ''}Acquisition cost not supplied.` })}>{busy ? 'Adding…' : 'Add Property'}</button>
  </div></ActionDialog>;
}

export function ReportProblemDialog({ roomId, assetId, label, onClose }: { roomId?: string; assetId?: string; label: string; onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const { busy, error, submit } = useSubmit(onClose);
  const id = useRef(crypto.randomUUID());
  return <ActionDialog title={`Report Problem · ${label}`} onClose={() => { if (!busy) onClose(); }}><div className="space-y-3">{error && <p role="alert" className="text-rose-300">{error}</p>}<label className="block text-sm">What is wrong?<textarea className={fieldClass} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} /></label><label className="block text-sm">Urgency<select className={fieldClass} value={priority} onChange={event => setPriority(event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label><button className={primaryButtonClass} disabled={busy || !description.trim()} onClick={() => void submit('maintenance.report', { id: id.current, roomId, assetId, description: description.trim(), priority })}>{busy ? 'Reporting…' : 'Report Problem'}</button></div></ActionDialog>;
}
