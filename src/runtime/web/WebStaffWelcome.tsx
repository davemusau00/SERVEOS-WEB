import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import type { WebSession } from './session';

const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-40';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40';

export function WebStaffWelcome({ session, onDismiss, onStartTour }: { session: WebSession; onDismiss: () => void; onStartTour: () => void }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(`servos-welcome:${session.businessId}:${session.actorId}:v1`) === 'dismissed');
  if (hidden) return null;
  const dismiss = () => {
    localStorage.setItem(`servos-welcome:${session.businessId}:${session.actorId}:v1`, 'dismissed');
    setHidden(true);
    onDismiss();
  };
  return <section className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5" data-guide-anchor="web.welcome">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex gap-3"><LockKeyhole className="mt-1 h-5 w-5 text-amber-300"/><div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-300">WELCOME TO SERVOS WEB</p>
        <h2 className="mt-1 text-xl font-bold">Start with the work you need to finish.</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Your access controls what appears here. Changes are checked by the business server and can be reviewed from Saved changes.</p>
      </div></div>
      <div className="flex gap-2"><button className={button} onClick={onStartTour}>Take the tour</button><button className={primary} onClick={dismiss}>Got it</button></div>
    </div>
  </section>;
}
