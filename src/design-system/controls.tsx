import React, { useEffect, useId, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ds } from './tokens';
import { Notice } from './components';

export function Dialog({ title, onClose, children, footer, labelledBy }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; labelledBy?: string }) {
  const generated = useId(); const headingId = labelledBy || generated; const panel = useRef<HTMLElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); panel.current.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[180] grid place-items-center bg-black/70 p-3 sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId} className="flex max-h-[min(92dvh,56rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 p-4 sm:px-5"><h2 id={headingId} className="text-lg font-bold">{title}</h2><button type="button" className={ds.button} onClick={onClose} aria-label={`Close ${title}`}>Close</button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      {footer && <footer className="sticky bottom-0 flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-800 bg-slate-900 p-3 sm:px-5">{footer}</footer>}
    </section>
  </div>;
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[170] bg-black/60" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><aside role="dialog" aria-modal="true" aria-label={title} className="ml-auto flex h-[100dvh] w-full max-w-xl flex-col border-l border-slate-700 bg-slate-950 text-white"><header className="flex items-center justify-between border-b border-slate-800 p-4"><h2 className="font-bold">{title}</h2><button className={ds.button} type="button" onClick={onClose}>Close</button></header><div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div></aside></div>;
}

export function FormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  const id = useId();
  return <label className="block space-y-1.5 text-sm font-medium text-slate-200"><span>{label}</span>{React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { id, 'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined, 'aria-invalid': Boolean(error) }) : children}{error ? <span id={`${id}-error`} role="alert" className="block text-xs text-rose-300">{error}</span> : hint ? <span id={`${id}-hint`} className="block text-xs text-slate-400">{hint}</span> : null}</label>;
}

export function SearchCombobox(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} type="search" className={`${ds.input} ${props.className || ''}`} />; }
export function MoneyInput(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} type="number" inputMode="decimal" min={props.min ?? '0'} step={props.step ?? '0.01'} className={`${ds.input} ${props.className || ''}`} />; }
export function QuantityInput(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} type="number" inputMode="decimal" min={props.min ?? '0'} step={props.step ?? '1'} className={`${ds.input} ${props.className || ''}`} />; }
export function BusinessDateTimeField({ timeZone = 'Africa/Nairobi', className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { timeZone?: string }) { return <input {...props} type="datetime-local" data-business-timezone={timeZone} className={`${ds.input} ${className}`} />; }

export function BusyButton({ busy = false, disabled, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button {...props} disabled={disabled || busy} aria-busy={busy || undefined} className={`${ds.primaryButton} ${className || ''}`}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}{busy ? 'Working…' : children}</button>;
}

export function BlockerCard({ title = 'Action unavailable', children }: { title?: string; children: React.ReactNode }) { return <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-100"><h3 className="font-bold">{title}</h3><div className="mt-1 text-amber-100/80">{children}</div></div>; }
export function RecoveryAction({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) { return <Notice tone="danger"><b>{title}</b><p className="mt-1">{children}</p>{action && <div className="mt-2">{action}</div>}</Notice>; }
export function ConflictNotice({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) { return <Notice tone="warning">{children}{action && <div className="mt-2">{action}</div>}</Notice>; }
export function SyncState({ state, detail }: { state: 'saved' | 'waiting' | 'syncing' | 'conflict' | 'error'; detail?: string }) {
  const tone = state === 'saved' ? 'success' : state === 'conflict' || state === 'error' ? 'danger' : state === 'waiting' ? 'warning' : 'info';
  const label = { saved: 'Saved', waiting: 'Waiting to sync', syncing: 'Syncing', conflict: 'Needs review', error: 'Could not sync' }[state];
  return <Notice tone={tone}>{label}{detail && <span className="ml-1">· {detail}</span>}</Notice>;
}
