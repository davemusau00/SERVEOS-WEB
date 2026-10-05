import React from 'react';
import { CheckCircle2, CircleAlert, Info, LoaderCircle, Wifi, WifiOff, X } from 'lucide-react';
import { ds } from './tokens';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return <header className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      {eyebrow && <p className={ds.eyebrow}>{eyebrow}</p>}
      <h1 className={`${ds.pageTitle} mt-1`}>{title}</h1>
      {description && <p className={`mt-2 max-w-3xl text-sm leading-6 ${ds.fgMuted}`}>{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function StatusBadge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; children: React.ReactNode }) {
  const tones = {
    neutral: ds.badgeNeutral,
    success: ds.badgeSuccess,
    warning: ds.badgeWarning,
    danger: ds.badgeDanger,
    info: ds.badgeInfo,
  } as const;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Notice({ tone = 'info', children, onDismiss }: { tone?: 'success' | 'warning' | 'danger' | 'info'; children: React.ReactNode; onDismiss?: () => void }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? CircleAlert : tone === 'warning' ? CircleAlert : Info;
  const styles = {
    success: ds.noticeSuccess,
    warning: ds.noticeWarning,
    danger: ds.noticeDanger,
    info: ds.noticeInfo,
  } as const;
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${styles[tone]}`}>
    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0 flex-1">{children}</div>
    {onDismiss && <button type="button" className="rounded-md p-1 hover:bg-white/10" aria-label="Dismiss message" onClick={onDismiss}><X className="h-4 w-4" /></button>}
  </div>;
}

export function ConnectivityBadge({ online, pending = 0, syncing = false, conflicts = 0 }: { online: boolean; pending?: number; syncing?: boolean; conflicts?: number }) {
  if (conflicts > 0) return <StatusBadge tone="danger"><CircleAlert className="h-3.5 w-3.5" />{conflicts} conflict{conflicts === 1 ? '' : 's'}</StatusBadge>;
  if (syncing) return <StatusBadge tone="info"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Syncing{pending ? ` · ${pending}` : ''}</StatusBadge>;
  if (!online) return <StatusBadge tone="warning"><WifiOff className="h-3.5 w-3.5" />Offline{pending ? ` · ${pending} saved` : ''}</StatusBadge>;
  return <StatusBadge tone={pending > 0 ? 'warning' : 'success'}><Wifi className="h-3.5 w-3.5" />{pending > 0 ? `${pending} waiting` : 'Online · synced'}</StatusBadge>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className={`${ds.mutedPanel} px-6 py-12 text-center`}><h2 className={`text-lg font-bold ${ds.fg}`}>{title}</h2><p className={`mx-auto mt-2 max-w-lg text-sm leading-6 ${ds.fgMuted}`}>{description}</p>{action && <div className="mt-5 flex justify-center">{action}</div>}</div>;
}