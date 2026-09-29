import React, { useEffect, useState } from 'react';
import { useRuntime } from '../runtime/RuntimeProvider';
import { useGuidance } from './GuidanceProvider';

const VERSION = 1;
export function StaffWelcome() {
  const runtime = useRuntime();
  const { guides, start } = useGuidance();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    void runtime.guidanceProgress().then(rows => {
      if (current) setVisible(!rows.some(row => row.guideId === 'staff.welcome' && row.guideVersion === VERSION && row.state === 'DISMISSED'));
    }).catch(() => {});
    return () => { current = false; };
  }, [runtime.session?.staffId]);
  const dismiss = async (guideId?: string) => {
    setBusy(true); setError('');
    try {
      await runtime.saveGuidanceProgress({ guideId: 'staff.welcome', guideVersion: VERSION, state: 'DISMISSED', currentStepId: null, completedStepIds: [] });
      setVisible(false); if (guideId) start(guideId);
    } catch (cause) { setError(`Welcome preference could not be saved: ${String(cause)}`); }
    finally { setBusy(false); }
  };
  if (!visible) return null;
  return <section className="mb-5 rounded-2xl border border-amber-500/40 bg-slate-900 p-5" aria-label="Staff welcome">
    <h2 className="text-xl font-bold">Welcome, {runtime.snapshot?.actor.name}</h2>
    <p className="mt-1 text-sm text-slate-300">You’re signed in as {runtime.snapshot?.actor.role}. Choose a task to learn with your available permissions.</p>
    <div className="mt-3 flex flex-wrap gap-2">{guides.filter(guide => guide.id !== 'servos.core').map(guide => <button key={guide.id} disabled={busy} className="rounded-xl border border-amber-500/40 px-3 py-2 text-sm text-amber-200" onClick={() => void dismiss(guide.id)}>{guide.title}</button>)}<button disabled={busy} className="rounded-xl border border-slate-600 px-3 py-2 text-sm" onClick={() => void dismiss('servos.core')}>Find my way around</button></div>
    {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
    <button disabled={busy} className="mt-3 text-sm text-slate-400 underline" onClick={() => void dismiss()}>Dismiss welcome</button>
  </section>;
}
