import React, { useEffect, useState } from 'react';
import { useRuntime } from '../runtime/RuntimeProvider';
import { fieldClass, primaryButtonClass } from './records';

export const UnlockView = () => {
  const runtime = useRuntime();
  const [staffId, setStaffId] = useState(''); const [pin, setPin] = useState('');
  useEffect(() => { if (!staffId && runtime.status?.staff[0]) setStaffId(runtime.status.staff[0].id); }, [runtime.status, staffId]);
  return <div className="min-h-screen bg-slate-950 p-6 text-white grid place-items-center"><form className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6" onSubmit={e => { e.preventDefault(); void runtime.login(staffId, pin); }}>
    <div><div className="text-xs font-bold tracking-[.2em] text-amber-400">SERVOS</div><h1 className="mt-2 text-2xl font-black">Unlock terminal</h1><p className="mt-2 text-sm text-slate-400">Authority comes from this staff identity, never from a role selector.</p></div>
    <label className="block text-sm">Staff<select className={fieldClass} value={staffId} onChange={e => setStaffId(e.target.value)}>{runtime.status?.staff.map(s => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}</select></label>
    <label className="block text-sm">PIN<input autoFocus required type="password" inputMode="numeric" minLength={6} maxLength={12} className={fieldClass} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
    {runtime.error && <p className="rounded-xl bg-rose-950 p-3 text-sm text-rose-200">{runtime.error}</p>}
    <button disabled={runtime.busy || !staffId} className={`${primaryButtonClass} w-full`}>{runtime.busy ? 'Unlocking…' : 'Unlock'}</button>
  </form></div>;
};
