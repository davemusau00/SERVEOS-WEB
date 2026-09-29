import React,{useState} from 'react';
import type {ProductionHealthAudit} from '../types/runtime';
import {useRuntime} from '../runtime/RuntimeProvider';
import {ActionDialog} from './ActionDialog';
import {buttonClass,primaryButtonClass} from './records';

const downloadAudit=(audit:ProductionHealthAudit)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(audit,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='servos-local-audit.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
const displayTime=(value:string|null)=>value?new Date(value).toLocaleString():'Never';

export function NativeProductionHealthPanel(){
  const runtime=useRuntime();
  const [audit,setAudit]=useState<ProductionHealthAudit|null>(null);
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const run=async()=>{setBusy(true);setMessage('');try{setAudit(await runtime.healthAudit());setDetailsOpen(true)}catch(e){setMessage(String(e))}finally{setBusy(false)}};
  const checkpoint=async()=>{setBusy(true);setMessage('');try{const backup=await runtime.backup();const next=await runtime.healthAudit();setAudit(next);setDetailsOpen(true);setMessage(`Checkpoint backup created: ${backup}`)}catch(e){setMessage(String(e))}finally{setBusy(false)}};
  return <section className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-amber-200">Production data safety</h2><p className="mt-1 max-w-3xl text-xs text-slate-400">Read-only local audit for the already-deployed terminal. It reports schema, record versions, audit/outbox state and backup/sync evidence without exposing cloud/device secrets or changing business records.</p></div><div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy} onClick={()=>void run()}>{busy?'Checking…':'Run read-only audit'}</button><button className={primaryButtonClass} disabled={busy} onClick={()=>void checkpoint()}>Create checkpoint backup</button></div></div>
    {message&&<p role="status" className="mt-3 text-xs text-slate-300">{message}</p>}
    {audit&&<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="SQLite" value={`v${audit.database.schemaVersion} · ${audit.database.quickCheck}`}/><Metric label="Records" value={`${audit.records.active} active · ${audit.records.archived} archived`}/><Metric label="Outbox" value={`${audit.operations.outboxPending} pending / ${audit.operations.outboxAcknowledged} acknowledged`}/><Metric label="Last backup" value={displayTime(audit.installation.lastBackup)}/></div>}
    {audit&&audit.warnings.length>0&&<div className="mt-3 rounded-xl border border-amber-500/30 bg-slate-950 p-3"><div className="text-xs font-bold text-amber-300">Review before migration</div><ul className="mt-2 space-y-1 text-xs text-slate-300">{audit.warnings.map(w=><li key={w}>• {w}</li>)}</ul></div>}
    {audit&&<button className={buttonClass+' mt-3'} onClick={()=>downloadAudit(audit)}>Export read-only audit</button>}
    {audit&&<button className="mt-3 text-xs font-semibold text-amber-300 underline" onClick={()=>setDetailsOpen(true)}>Local manifest captured: {audit.records.manifest.length} record version(s)</button>}
    {audit&&detailsOpen&&<ActionDialog title="Production data health audit" onClose={()=>setDetailsOpen(false)}><div className="space-y-4 text-sm"><div className="grid gap-2 sm:grid-cols-2"><Metric label="Generated" value={displayTime(audit.generatedAt)}/><Metric label="App version" value={audit.appVersion}/><Metric label="Installation" value={audit.installation.stage}/><Metric label="Terminal" value={audit.installation.terminalId||'Missing'}/><Metric label="Last sync" value={displayTime(audit.installation.lastSync)}/><Metric label="Supabase project" value={audit.installation.projectHostname||'Not reported'}/><Metric label="Cloud configured" value={audit.installation.cloudConfigured?'Yes':'No'}/><Metric label="Commands" value={String(audit.operations.commands)}/><Metric label="Audit sequence" value={audit.operations.lastAuditSequence===null?'None':`${audit.operations.firstAuditSequence} - ${audit.operations.lastAuditSequence}`}/></div><div><h3 className="mb-2 font-bold">Collection manifest</h3><div className="max-h-72 overflow-auto rounded-xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-950 text-slate-400"><tr><th className="p-2">Collection</th><th className="p-2 text-right">Active</th><th className="p-2 text-right">Archived</th><th className="p-2 text-right">Max version</th></tr></thead><tbody>{audit.records.collections.map(c=><tr key={c.collection} className="border-t border-slate-800"><td className="p-2 font-mono">{c.collection}</td><td className="p-2 text-right">{c.active}</td><td className="p-2 text-right">{c.archived}</td><td className="p-2 text-right">{c.maxVersion}</td></tr>)}</tbody></table></div></div><p className="text-xs text-slate-500">Run replica reconciliation separately to compare this local manifest with the retained Supabase project. This audit alone does not verify hosted synchronization.</p></div></ActionDialog>}
  </section>;
}
const Metric=({label,value}:{label:string;value:string})=><div className="rounded-xl bg-slate-950 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 break-all font-semibold">{value}</div></div>;
