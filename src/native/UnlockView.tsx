import React, { useEffect, useState } from 'react';
import { useRuntime } from '../runtime/RuntimeProvider';
import { fieldClass, primaryButtonClass } from './records';

export const UnlockView = () => {
  const runtime = useRuntime();
  const [staffId, setStaffId] = useState(''); const [pin, setPin] = useState('');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  useEffect(() => { if (!staffId && runtime.status?.staff[0]) setStaffId(runtime.status.staff[0].id); }, [runtime.status, staffId]);
  return <div className="min-h-screen bg-slate-950 p-6 text-white grid place-items-center"><form className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6" onSubmit={e => { e.preventDefault(); void runtime.login(staffId, pin,email,password); }}>
    <div><div className="text-xs font-bold tracking-[.2em] text-amber-400">SERVOS</div><h1 className="mt-2 text-2xl font-black">Unlock terminal</h1><p className="mt-2 text-sm text-slate-400">Authority comes from this staff identity, never from a role selector.</p></div>
    <label className="block text-sm">Staff<select className={fieldClass} value={staffId} onChange={e => setStaffId(e.target.value)}>{runtime.status?.staff.map(s => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}</select></label>
    <label className="block text-sm">Local PIN (offline / legacy access)<input autoFocus={!email} required={!email && !password} type="password" inputMode="numeric" minLength={6} maxLength={12} className={fieldClass} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
    <div className="rounded-xl border border-slate-800 p-3"><p className="mb-2 text-sm font-semibold">Business account (online operator sign-in)</p><label className="block text-sm">Email<input type="email" autoComplete="username" className={fieldClass} value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="mt-2 block text-sm">Password<input type="password" autoComplete="current-password" className={fieldClass} value={password} onChange={e=>setPassword(e.target.value)}/></label><p className="mt-2 text-xs text-slate-400">Use your own invited account. Your Auth identity and server permissions identify you; a local PIN is not required for online sign-in.</p></div>
    {runtime.error && <p className="rounded-xl bg-rose-950 p-3 text-sm text-rose-200">{runtime.error}</p>}
    <p className="text-xs text-slate-400">Enter both business credentials to sign in online without a PIN. Leave both blank to use the existing local-PIN legacy path; v2 remains disabled unless separately accepted and enabled.</p>
    <button disabled={runtime.busy || !staffId || Boolean(email) !== Boolean(password) || (!email && !pin)} className={`${primaryButtonClass} w-full`}>{runtime.busy ? 'Signing in…' : email && password ? 'Sign in online' : 'Continue with local PIN'}</button>
  </form></div>;
};
