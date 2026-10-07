import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileEdit, RefreshCw, Send, WifiOff, XCircle } from 'lucide-react';
import type { QueuedCommand, WorkflowDraft } from './BusinessStore';
import { ds } from '../../design-system/tokens';
import { EmptyState, StatusBadge } from '../../design-system/components';

type QueueFilter = 'ALL' | 'WAITING' | 'OUTCOME_UNKNOWN' | 'SYNCED' | 'CONFLICT' | 'REJECTED';

const labels: Record<QueuedCommand['state'], string> = {
  PENDING_SYNC: 'Waiting to sync',
  OUTCOME_UNKNOWN: 'Checking outcome',
  SYNCHRONIZED: 'Synchronized',
  CONFLICT: 'Conflict',
  REJECTED: 'Rejected',
};

const tone: Record<QueuedCommand['state'], 'warning' | 'success' | 'danger' | 'info'> = {
  PENDING_SYNC: 'warning',
  OUTCOME_UNKNOWN: 'warning',
  SYNCHRONIZED: 'success',
  CONFLICT: 'danger',
  REJECTED: 'danger',
};

const icon: Record<QueuedCommand['state'], React.ComponentType<{ className?: string }>> = {
  PENDING_SYNC: Clock3,
  OUTCOME_UNKNOWN: AlertTriangle,
  SYNCHRONIZED: CheckCircle2,
  CONFLICT: AlertTriangle,
  REJECTED: XCircle,
};

const operationLabel = (operation: string) => operation.replace(/[._]/g, ' ').replace(/\b\w/g, value => value.toUpperCase());

export function ActivitySyncCenter({ queue, drafts, online, syncing, onSync, onReviewDraft,onExportRecovery }: { queue: QueuedCommand[]; drafts: WorkflowDraft[]; online: boolean; syncing: boolean; onSync: () => Promise<void>; onReviewDraft: (draft: WorkflowDraft) => void;onExportRecovery?:()=>Promise<void> }) {
  const [filter, setFilter] = useState<QueueFilter>('ALL');
  const filtered = useMemo(() => queue.slice().reverse().filter(item => {
    if (filter === 'ALL') return true;
    if (filter === 'WAITING') return item.state === 'PENDING_SYNC';
    if (filter === 'SYNCED') return item.state === 'SYNCHRONIZED';
    return item.state === filter;
  }), [filter, queue]);
  const pending = queue.filter(item => item.state === 'PENDING_SYNC' || item.state === 'OUTCOME_UNKNOWN').length;
  const unknown = queue.filter(item => item.state === 'OUTCOME_UNKNOWN').length;
  const conflicts = queue.filter(item => item.state === 'CONFLICT' || item.state === 'REJECTED').length;

  return <section className="space-y-5" data-guide-anchor="activity.sync-center">
    {onExportRecovery&&<div className="flex flex-wrap items-center gap-3"><button type="button" className={ds.button} onClick={()=>void onExportRecovery()}>Export recovery evidence</button><span className="text-xs text-slate-400">Contains business data. Keep it private. Redacted evidence is for reconciliation, not automatic restore.</span></div>}
    <div className={`${ds.panel} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className={ds.eyebrow}>ACTIVITY & SYNC</p><h2 className="mt-1 text-xl font-black text-white">Changes made on this browser</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">ServOS keeps a durable record of each queued command. A saved command is not silently discarded when the network or server is unavailable.</p></div>
        <button type="button" className={ds.primaryButton} disabled={!online || syncing || pending === 0} onClick={() => void onSync()}><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Synchronizing…' : 'Synchronize now'}</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge tone={online ? 'success' : 'warning'}>{online ? 'Online' : 'Offline · saved changes only'}</StatusBadge>
        {pending > 0 && <StatusBadge tone="warning"><Send className="h-3.5 w-3.5" />{pending} waiting</StatusBadge>}
        {unknown > 0 && <StatusBadge tone="warning">{unknown} outcome check{unknown===1?'':'s'} required</StatusBadge>}
        {conflicts > 0 && <StatusBadge tone="danger"><AlertTriangle className="h-3.5 w-3.5" />{conflicts} need review</StatusBadge>}
      </div>
    </div>

    <div className="flex flex-wrap gap-2" role="group" aria-label="Activity filters">
      {(['ALL', 'WAITING', 'OUTCOME_UNKNOWN', 'SYNCED', 'CONFLICT', 'REJECTED'] as QueueFilter[]).map(value => <button type="button" key={value} className={`${ds.button} ${filter === value ? 'border-amber-400 bg-amber-400 text-slate-950' : ''}`} onClick={() => setFilter(value)}>{value === 'ALL' ? 'All changes' : value === 'WAITING' ? 'Waiting' : value === 'OUTCOME_UNKNOWN' ? 'Checking outcome' : value === 'SYNCED' ? 'Synchronized' : value === 'CONFLICT' ? 'Conflicts' : 'Rejected'}</button>)}
    </div>

    {filtered.length === 0 && drafts.length === 0 ? <EmptyState title="No saved changes yet" description="Commands and local drafts will appear here after you work in the browser." /> : <div className="space-y-3">
      {filtered.map(item => { const Icon = icon[item.state]; return <article className={`${ds.panel} p-4`} key={item.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="mt-0.5 rounded-lg bg-slate-950 p-2 text-slate-300"><Icon className="h-4 w-4" /></span><div><h3 className="font-bold text-white">{operationLabel(item.command.operation)}</h3><p className="mt-1 text-xs text-slate-500">Command saved on this browser · sequence {item.sequence}</p></div></div><StatusBadge tone={tone[item.state]}>{labels[item.state]}</StatusBadge></div>
        {item.result?.error && <p className="mt-3 rounded-lg border border-rose-900/70 bg-rose-950/30 p-3 text-sm text-rose-200">{item.result.error.message}</p>}
        {item.state === 'OUTCOME_UNKNOWN' && <p role="status" className="mt-3 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100">The server may have committed this command, but its acknowledgement was not received. Synchronize to retry the same command ID and reconcile its original result. Do not submit this action again.</p>}
        {item.state === 'CONFLICT' && <p className="mt-3 text-sm leading-6 text-amber-100">The server did not silently overwrite this change. Review the current records, then reopen the saved workflow and submit a new command with fresh versions.</p>}
        {item.state === 'REJECTED' && <p className="mt-3 text-sm leading-6 text-slate-300">The server rejected this command. Do not resend it. Review the saved workflow and create a new command only after its business conditions are valid.</p>}
        <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer font-semibold">Technical details</summary><p className="mt-2 break-all">{item.command.operation} · {item.id}</p><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3">{JSON.stringify(item.result || item.command.payload, null, 2)}</pre></details>
      </article> })}
      {drafts.map(draft => <article className={`${ds.panel} p-4`} key={draft.id}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="rounded-lg bg-slate-950 p-2 text-slate-300"><FileEdit className="h-4 w-4" /></span><div><h3 className="font-bold text-white">{operationLabel(draft.operation)}</h3><p className="mt-1 text-sm text-slate-400">Local draft · saved {new Date(draft.updatedAt).toLocaleString()}</p><p className="mt-2 text-xs text-amber-200">This draft has not been finalized as a business transaction. It will remain local until the workflow can submit it safely.</p></div></div>{draft.fields&&<button type="button" className={ds.button} onClick={()=>onReviewDraft(draft)}><FileEdit className="h-4 w-4" />Review and reopen</button>}</div></article>)}
    </div>}
    {!online && <p className="flex items-start gap-2 rounded-xl border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" />Reconnect before synchronizing. Local drafts and queued commands remain on this browser.</p>}
  </section>;
}
