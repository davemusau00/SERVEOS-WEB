import React, { useMemo, useState } from 'react';
import { useRuntime } from '../runtime/RuntimeProvider';
import { buttonClass, fieldClass, primaryButtonClass } from './records';

export const EnrollmentView = () => {
  const runtime = useRuntime();
  const profile = runtime.status?.intakeProfile;
  const owner = profile?.owner;
  const admin = profile?.initialAdministrator;
  const business = profile?.business;

  const [email, setEmail] = useState(owner?.email || '');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [localError, setLocalError] = useState('');

  const ready = useMemo(
    () => !!business?.tradingName && !!owner?.fullName && !!admin?.fullName && !!admin?.email,
    [business, owner, admin]
  );

  if (!profile || !business || !owner || !admin || !ready) {
    return <div className="min-h-screen bg-slate-950 p-6 text-white grid place-items-center">
      <div className="w-full max-w-lg rounded-2xl border border-amber-700/40 bg-slate-900 p-6">
        <div className="text-xs font-bold tracking-[.2em] text-amber-400">INTAKE UPDATE REQUIRED</div>
        <h1 className="mt-2 text-2xl font-black">Complete the commissioning profile first</h1>
        <p className="mt-2 text-sm text-slate-400">The current intake is missing business, owner or initial Administrator identity. Reopen Intake, correct the commissioning profile, then confirm it again.</p>
        <button className={`${buttonClass} mt-4`} disabled={runtime.busy} onClick={() => void runtime.reopenIntake()}>Reopen Intake</button>
      </div>
    </div>;
  }

  return <div className="min-h-screen bg-slate-950 p-6 text-white grid place-items-center">
    <form className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6" onSubmit={e => {
      e.preventDefault();
      setLocalError('');
      if (pin !== confirmPin) { setLocalError('The local PIN confirmation does not match.'); return; }
      void runtime.enroll({ email, password, pin });
    }}>
      <div>
        <div className="text-xs font-bold tracking-[.2em] text-amber-400">SECURE TERMINAL ENROLLMENT</div>
        <h1 className="mt-2 text-2xl font-black">Authorize this ServOS terminal</h1>
        <p className="mt-2 text-sm text-slate-400">The confirmed Intake determines the business and initial local Administrator. Credentials entered here are never written into the intake profile.</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
        <div className="text-slate-500">Business</div><div className="font-bold">{business.tradingName}</div>
        <div className="mt-3 text-slate-500">Authorizing owner</div><div className="font-bold">{owner.fullName}</div>
        <div className="mt-3 text-slate-500">Initial System Administrator</div><div className="font-bold">{admin.fullName}</div>
        <div className="text-xs text-slate-400">{admin.jobTitle} · Admin role · {admin.email}</div>
      </div>

      <label className="block text-sm">Owner authorization email<input required type="email" autoComplete="username" className={fieldClass} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block text-sm">Online account password<input required type="password" autoComplete="current-password" className={fieldClass} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label className="block text-sm">Create local Administrator PIN<input required type="password" inputMode="numeric" minLength={6} maxLength={12} className={fieldClass} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))} /><span className="text-xs text-slate-500">6–12 digits. Stored only as an Argon2 hash after successful enrollment.</span></label>
      <label className="block text-sm">Confirm local PIN<input required type="password" inputMode="numeric" minLength={6} maxLength={12} className={fieldClass} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
      {(localError || runtime.error) && <p className="rounded-xl bg-rose-950 p-3 text-sm text-rose-200">{localError || runtime.error}</p>}
      <button disabled={runtime.busy || pin.length < 6 || pin !== confirmPin} className={`${primaryButtonClass} w-full`}>{runtime.busy ? 'Enrolling…' : 'Authorize & enroll terminal'}</button>
    </form>
  </div>;
};

