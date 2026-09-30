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
  const [snapshotBusy,setSnapshotBusy]=useState(false);
  const [feedBusy,setFeedBusy]=useState(false);
  const [snapshotResult,setSnapshotResult]=useState<{records:number;cursor:number;pageCount:number}|null>(null);
  const [feedResult,setFeedResult]=useState<{appliedChanges:number;acknowledgedCommands:number;cursor:number;hasMore:boolean}|null>(null);
  const [message,setMessage]=useState('');
  const differences=useMemo(()=>report?.records.filter(r=>r.classification!=='MATCHED')||[],[report]);
  const compare=async()=>{
    setBusy(true);setMessage('');
    try{const next=await runtime.reconcile();setReport(next);setOpen(true)}
    catch(e){setMessage(String(e))}
    finally{setBusy(false)}
  };
  const prepareV2Snapshot=async()=>{
    setSnapshotBusy(true);setMessage('');setSnapshotResult(null);
    try{const result=await runtime.installV2Snapshot();setSnapshotResult(result)}
    catch(e){setMessage(String(e))}
    finally{setSnapshotBusy(false)}
  };
  const syncV2Replica=async()=>{
    setFeedBusy(true);setMessage('');setFeedResult(null);
    try{setFeedResult(await runtime.syncV2Replica())}
    catch(e){setMessage(String(e))}
    finally{setFeedBusy(false)}
  };
  return <section className="mt-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-bold text-sky-200">Local ↔ cloud reconciliation</h2><p className="mt-1 max-w-3xl text-xs text-slate-400">Compares SQLite with the legacy Supabase replica without repairing either side. Same-version content is compared semantically inside the native process; business payloads are not displayed in this report.</p></div>
      <button className={buttonClass} disabled={busy} onClick={()=>void compare()}>{busy?'Comparing…':'Compare local ↔ cloud'}</button>
    </div>
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-200">Prepare staged v2 shadow baseline</h3><p className="mt-1 max-w-3xl text-xs text-slate-400">Requires an online Auth-bound operator and the read-only snapshot migration. Copies only to isolated v2 shadow storage; the legacy records and write authority are unchanged. Refresh is blocked while v2 commands await acknowledgement.</p></div><button className={buttonClass} disabled={busy||snapshotBusy||feedBusy||!runtime.session||runtime.session.staffId!==runtime.snapshot?.actor.id} onClick={()=>void prepareV2Snapshot()}>{snapshotBusy?'Loading authorized snapshot…':'Install or refresh v2 shadow snapshot'}</button></div>
      {snapshotResult&&<p className="mt-3 text-xs text-emerald-200" role="status">Shadow baseline installed: {snapshotResult.records.toLocaleString()} records at feed cursor {snapshotResult.cursor} ({snapshotResult.pageCount} pages). V2 writes remain separately gated.</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3"><p className="text-xs text-slate-400">Retry any durable online v2 command awaiting acknowledgement, then refresh the isolated shadow replica. This does not update legacy records or enable v2 writes.</p><button className={buttonClass} disabled={busy||snapshotBusy||feedBusy||!runtime.session||runtime.session.staffId!==runtime.snapshot?.actor.id} onClick={()=>void syncV2Replica()}>{feedBusy?'Synchronizing v2 commands and feed…':'Synchronize v2 pending commands and feed'}</button></div>
      {feedResult&&<p className="mt-3 text-xs text-emerald-200" role="status">Acknowledged {feedResult.acknowledgedCommands} pending command(s), applied {feedResult.appliedChanges} feed change(s); shadow cursor is {feedResult.cursor}{feedResult.hasMore?' · more changes remain; synchronize again':''}.</p>}
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
      <div className={`mt-2 rounded-lg border p-3 text-xs ${report.controlTotals.matches?'border-emerald-800/40 text-emerald-200':'border-rose-500/30 text-rose-200'}`}>
        Migration control totals: {report.controlTotals.matches?'match':'DIFFER'} · {Object.keys(report.controlTotals.local.collections).length} collections · {Object.keys(report.controlTotals.local.stockQuantityMicros).length} stock/location balances · {Object.keys(report.controlTotals.local.movementQuantityMicros).length} movement balances
      </div>
      <button className="mt-3 text-xs font-semibold text-sky-300 underline" onClick={()=>setOpen(true)}>View reconciliation evidence</button>
    </div>}
    {report&&open&&<ActionDialog title="Local ↔ cloud reconciliation evidence" onClose={()=>setOpen(false)}><div className="space-y-4 text-sm">
      <div className="grid gap-2 sm:grid-cols-2"><MetricText label="Local sequence" value={String(report.local.lastOutboxSequence)}/><MetricText label="Cloud sequence" value={String(report.cloud.lastSequence)}/><MetricText label="Local terminal" value={report.local.terminalId}/><MetricText label="Cloud terminal" value={report.cloud.terminalId}/></div>
      {report.blockers.length>0&&<div className="rounded-xl border border-amber-500/30 p-3"><div className="font-bold text-amber-300">Cutover blockers</div><ul className="mt-2 space-y-1 text-xs">{report.blockers.map(x=><li key={x}>• {x}</li>)}</ul></div>}
      {report.warnings.length>0&&<div className="rounded-xl border border-slate-700 p-3"><div className="font-bold">Notes</div><ul className="mt-2 space-y-1 text-xs text-slate-400">{report.warnings.map(x=><li key={x}>• {x}</li>)}</ul></div>}
      <details className="rounded-xl border border-slate-700 p-3"><summary className="cursor-pointer font-bold">Migration control totals {report.controlTotals.matches?'match':'differ'}</summary><p className="mt-2 text-xs text-slate-400">Totals include per-collection active/archive counts, item/location stock quantities, movement-derived quantities, and selected financial ledgers. Each side also verifies that its current quantities reconcile to immutable movement history. Quantities use millionths of a base unit; money uses minor units.</p><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-[11px]">{JSON.stringify({local:report.controlTotals.local,cloud:report.controlTotals.cloud},null,2)}</pre></details>
      <div><h3 className="mb-2 font-bold">Differences</h3>{differences.length===0?<p className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 text-xs text-emerald-200">No record differences detected.</p>:<div className="max-h-80 overflow-auto rounded-xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-950 text-slate-400"><tr><th className="p-2">Record</th><th className="p-2">State</th><th className="p-2 text-right">Local</th><th className="p-2 text-right">Cloud</th></tr></thead><tbody>{differences.map(r=><tr key={`${r.collection}:${r.id}`} className="border-t border-slate-800"><td className="p-2"><div className="font-mono">{r.collection}</div><div className="max-w-64 truncate text-slate-500" title={r.id}>{r.id}</div><div className="mt-1 text-slate-500">{r.reason}</div></td><td className={`p-2 font-bold ${badge(r.classification)}`}>{r.classification}</td><td className="p-2 text-right">{r.localVersion??'—'}{r.localArchived?' A':''}</td><td className="p-2 text-right">{r.cloudVersion??'—'}{r.cloudArchived?' A':''}</td></tr>)}</tbody></table></div>}</div>
      <p className="text-xs text-slate-500">A = archived. This evidence screen intentionally omits record payloads and credentials. Patch 02B will use the real terminal checkpoint to decide whether any manual repair is necessary before v2 cutover.</p>
    </div></ActionDialog>}
  </section>;
}
const Metric=({label,value}:{label:string;value:number})=><div className="rounded-xl bg-slate-950 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-lg font-black">{value}</div></div>;
const MetricText=({label,value}:{label:string;value:string})=><div className="rounded-xl bg-slate-950 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 break-all font-semibold">{value}</div></div>;
