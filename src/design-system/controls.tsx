import React, { useEffect, useId, useRef, useState } from 'react';
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
  return <div className={ds.dialogOverlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId} className={ds.dialogPanel}>
      <header className={ds.dialogHeader}><h2 id={headingId} className="text-lg font-bold">{title}</h2><button type="button" className={ds.button} onClick={onClose} aria-label="Close dialog">Close</button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      {footer && <footer className={ds.dialogFooter}>{footer}</footer>}
    </section>
  </div>;
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const generated = useId(); const panel = useRef<HTMLElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
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
  return <div className={ds.dialogOverlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={generated} className={ds.drawerPanel}><header className={ds.drawerHeader}><h2 id={generated} className="font-bold">{title}</h2><button className={ds.button} type="button" onClick={onClose}>Close</button></header><div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div></aside></div>;
}

export function FormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  const id = useId();
  return <label className={`block space-y-1.5 text-sm font-medium ${ds.fg}`}><span>{label}</span>{React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { id, 'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined, 'aria-invalid': Boolean(error) }) : children}{error ? <span id={`${id}-error`} role="alert" className={`block text-xs ${ds.formError}`}>{error}</span> : hint ? <span id={`${id}-hint`} className={`block text-xs ${ds.fgMuted}`}>{hint}</span> : null}</label>;
}

export interface SearchComboboxOption { id: string; label: string; description?: string; disabled?: boolean; }
export function SearchCombobox({ options, value, onValueChange, loading = false, error, emptyLabel = 'No matches', createLabel, onCreate, placeholder = 'Search…', className = '', disabled, ...inputProps }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { options: SearchComboboxOption[]; value?: string; onValueChange: (id: string) => void; loading?: boolean; error?: string; emptyLabel?: string; createLabel?: string; onCreate?: () => void }) {
  const inputId = useId(); const listId = `${inputId}-list`; const [query, setQuery] = useState(''); const [open, setOpen] = useState(false); const [active, setActive] = useState(0);
  const selected = options.find(option => option.id === value); const filtered = options.filter(option => `${option.label} ${option.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const select = (option: SearchComboboxOption) => { if (option.disabled) return; onValueChange(option.id); setQuery(''); setOpen(false); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    inputProps.onKeyDown?.(event); if (event.defaultPrevented) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, Math.max(filtered.length - 1, 0))); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter' && open && filtered[active]) { event.preventDefault(); select(filtered[active]); }
    else if (event.key === 'Escape') { setOpen(false); }
  };
  return <div className="relative">
    <input {...inputProps} id={inputId} type="search" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && filtered[active] ? `${listId}-${filtered[active].id}` : undefined} disabled={disabled} placeholder={placeholder} value={open ? query : selected?.label || ''} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} onKeyDown={onKeyDown} className={`${ds.input} ${className}`} />
    {open && !disabled && <div id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
      {loading && <p role="status" className="p-2 text-sm text-slate-400">Loading…</p>}
      {error && <p role="alert" className="p-2 text-sm text-rose-300">{error}</p>}
      {!loading && !error && filtered.map((option, index) => <button type="button" role="option" aria-selected={option.id === value} aria-disabled={option.disabled || undefined} id={`${listId}-${option.id}`} key={option.id} disabled={option.disabled} className={`block w-full rounded-lg p-2 text-left text-sm ${index === active ? 'bg-slate-800' : ''} ${option.disabled ? 'cursor-not-allowed text-slate-500' : 'text-slate-100'}`} onMouseDown={event => event.preventDefault()} onClick={() => select(option)}><span className="block font-medium">{option.label}</span>{option.description && <span className="block text-xs text-slate-400">{option.description}</span>}</button>)}
      {!loading && !error && !filtered.length && <p className="p-2 text-sm text-slate-400">{emptyLabel}</p>}
      {onCreate && createLabel && <button type="button" className="mt-1 w-full border-t border-slate-800 p-2 text-left text-sm font-semibold text-amber-300" onMouseDown={event => event.preventDefault()} onClick={() => { onCreate(); setOpen(false); }}>{createLabel}</button>}
    </div>}
  </div>;
}
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
