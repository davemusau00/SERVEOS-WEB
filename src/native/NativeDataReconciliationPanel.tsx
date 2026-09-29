import React,{useMemo,useState} from 'react';
import type {ReconciliationReport} from '../types/runtime';
import {useRuntime} from '../runtime/RuntimeProvider';
import {ActionDialog} from './ActionDialog';
import {buttonClass} from './records';

// SERVOS_PATCH_02A_RECONCILIATION
const badge=(value:string)=>value==='MATCHED'?'text-emerald-300':value==='DIVERGED'?'text-rose-300':'text-amber-300';

export function NativeDataReconciliationPanel(){
  const runtime=useRuntime();
  const [report,setReport]=useState<ReconciliationReport|null>(null);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const differences=useMemo(()=>report?.records.filter(r=>r.classification!=='MATCHED')||[],[report]);
  const compare=async()=>{
    setBusy(true);setMessage('');
    try{const next=await runtime.reconcile();setReport(next);setOpen(true)}
    catch(e){setMessage(String(e))}
    finally{setBusy(false)}
  };
  return <section className="mt-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-bold text-sky-200">Local ↔ cloud reconciliation</h2><p className="mt-1 max-w-3xl text-xs text-slate-400">Compares SQLite with the legacy Supabase replica without repairing either side. Same-version content is compared semantically inside the native process; business payloads are not displayed in this report.</p></div>
      <button className={buttonClass} disabled={busy} onClick={()=>void compare()}>{busy?'Comparing…':'Compare local ↔ cloud'}</button>
    </div>
    {message&&<p role="alert" className="mt-3 rounded-lg bg-slate-950 p-3 text-xs text-rose-200">{message}</p>}
    {report&&<div className="mt-4">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Matched" value={report.summary.matched}/>
        <Metric label="Local ahead" value={report.summary.localAhead}/>
        <Metric label="Cloud missing" value={report.summary.cloudMissing}/>
        <Metric label="Cloud ahead" value={report.summary.cloudAhead}/>
        <Metric label="Diverged" value={report.summary.diverged}/>
        <Metric label="Pending outbox" value={report.local.pendingOutbox}/>
      </div>
      <div className={`mt-3 rounded-xl border p-3 text-xs ${report.cutoverReady?'border-emerald-500/30 bg-emerald-950/20 text-emerald-200':'border-amber-500/30 bg-slate-950 text-slate-300'}`}>
        {report.cutoverReady?'Replica matches local authority and the comparison has no cutover blockers.':'Comparison completed. Differences remain informational until reviewed; nothing was repaired automatically.'}
      </div>
      <button className="mt-3 text-xs font-semibold text-sky-300 underline" onClick={()=>setOpen(true)}>View reconciliation evidence</button>
    </div>}
    {report&&open&&<ActionDialog title="Local ↔ cloud reconciliation evidence" onClose={()=>setOpen(false)}><div className="space-y-4 text-sm">
      <div className="grid gap-2 sm:grid-cols-2"><MetricText label="Local sequence" value={String(report.local.lastOutboxSequence)}/><MetricText label="Cloud sequence" value={String(report.cloud.lastSequence)}/><MetricText label="Local terminal" value={report.local.terminalId}/><MetricText label="Cloud terminal" value={report.cloud.terminalId}/></div>
      {report.blockers.length>0&&<div className="rounded-xl border border-amber-500/30 p-3"><div className="font-bold text-amber-300">Cutover blockers</div><ul className="mt-2 space-y-1 text-xs">{report.blockers.map(x=><li key={x}>• {x}</li>)}</ul></div>}
      {report.warnings.length>0&&<div className="rounded-xl border border-slate-700 p-3"><div className="font-bold">Notes</div><ul className="mt-2 space-y-1 text-xs text-slate-400">{report.warnings.map(x=><li key={x}>• {x}</li>)}</ul></div>}
      <div><h3 className="mb-2 font-bold">Differences</h3>{differences.length===0?<p className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 text-xs text-emerald-200">No record differences detected.</p>:<div className="max-h-80 overflow-auto rounded-xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-950 text-slate-400"><tr><th className="p-2">Record</th><th className="p-2">State</th><th className="p-2 text-right">Local</th><th className="p-2 text-right">Cloud</th></tr></thead><tbody>{differences.map(r=><tr key={`${r.collection}:${r.id}`} className="border-t border-slate-800"><td className="p-2"><div className="font-mono">{r.collection}</div><div className="max-w-64 truncate text-slate-500" title={r.id}>{r.id}</div><div className="mt-1 text-slate-500">{r.reason}</div></td><td className={`p-2 font-bold ${badge(r.classification)}`}>{r.classification}</td><td className="p-2 text-right">{r.localVersion??'—'}{r.localArchived?' A':''}</td><td className="p-2 text-right">{r.cloudVersion??'—'}{r.cloudArchived?' A':''}</td></tr>)}</tbody></table></div>}</div>
      <p className="text-xs text-slate-500">A = archived. This evidence screen intentionally omits record payloads and credentials. Patch 02B will use the real terminal checkpoint to decide whether any manual repair is necessary before v2 cutover.</p>
    </div></ActionDialog>}
  </section>;
}
const Metric=({label,value}:{label:string;value:number})=><div className="rounded-xl bg-slate-950 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-lg font-black">{value}</div></div>;
const MetricText=({label,value}:{label:string;value:string})=><div className="rounded-xl bg-slate-950 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 break-all font-semibold">{value}</div></div>;
