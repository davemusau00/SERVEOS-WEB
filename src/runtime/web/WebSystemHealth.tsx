import React,{useCallback,useEffect,useState} from 'react';
import appMetadata from '../../../package.json';
import type {QueuedCommand} from './BusinessStore';
import {ds} from '../../design-system/tokens';

type HealthClient={healthReadiness:()=>Promise<{status:'ready'|'not_ready';reason?:string}>};
type Readiness='checking'|'ready'|'not_ready'|'unknown';
const inFlight=(entry:QueuedCommand)=>entry.state==='PENDING_SYNC'||entry.state==='OUTCOME_UNKNOWN';

export function WebSystemHealth({client,queue,online}:{client:HealthClient;queue:QueuedCommand[];online:boolean}){
 const [readiness,setReadiness]=useState<Readiness>('checking');
 const [reason,setReason]=useState('');
 const [checkedAt,setCheckedAt]=useState('');
 const [busy,setBusy]=useState(false);
 const pending=queue.filter(entry=>entry.state==='PENDING_SYNC').length;
 const uncertain=queue.filter(entry=>entry.state==='OUTCOME_UNKNOWN').length;
 const needsReview=queue.filter(entry=>entry.state==='CONFLICT'||entry.state==='REJECTED').length;
 const check=useCallback(async()=>{
  if(!online){setReadiness('unknown');setReason('Reconnect this browser before checking API and database readiness.');return}
  setBusy(true);setReason('');
  try{const result=await client.healthReadiness();setReadiness(result.status);setReason(result.reason==='database_migrations_pending'?'Database migrations are pending.':result.reason||'');setCheckedAt(new Date().toLocaleString())}
  catch{setReadiness('unknown');setReason('The readiness check could not be completed. Check the connection and try again.');setCheckedAt(new Date().toLocaleString())}
  finally{setBusy(false)}
 },[client,online]);
 useEffect(()=>{void check()},[check]);
 const readinessLabel=readiness==='ready'?'Ready':readiness==='not_ready'?'Not ready':readiness==='checking'?'Checking':'Unknown';
 const readinessTone=readiness==='ready'?'success':readiness==='not_ready'?'danger':'warning';
 const syncLabel=uncertain?`${uncertain} outcome${uncertain===1?'':'s'} need checking`:pending?`${pending} action${pending===1?'':'s'} waiting to sync`:needsReview?`${needsReview} action${needsReview===1?'':'s'} need review`:'No pending actions';
 return <section className={`${ds.panel} space-y-4 p-4`} aria-label="System health">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">System health</h2><p className="mt-1 text-sm text-slate-400">Current status for this business and browser. This page does not expose credentials or database details.</p></div><button type="button" className={ds.button} disabled={busy||!online} onClick={()=>void check()}>Refresh health</button></header>
  <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
   <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">API and database readiness</dt><dd className="mt-2"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${readinessTone==='success'?'border-emerald-700 text-emerald-200':readinessTone==='danger'?'border-rose-700 text-rose-200':'border-amber-700 text-amber-200'}`}>{readinessLabel}</span>{reason&&<p className="mt-2 text-xs text-slate-400">{reason}</p>}</dd></div>
   <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application version</dt><dd className="mt-2 font-mono text-sm">{appMetadata.version}</dd></div>
   <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved work</dt><dd className="mt-2 text-sm">{syncLabel}</dd><p className="mt-1 text-xs text-slate-500">{pending} waiting · {uncertain} uncertain · {needsReview} need review</p></div>
   <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Browser receipt printing</dt><dd className="mt-2 text-sm">{typeof window!=='undefined'&&typeof window.print==='function'?'Print dialog available; choose an installed operating-system printer.':'Browser print dialog unavailable.'}</dd></div>
   <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Backup status</dt><dd className="mt-2 text-sm">Not reported to this workspace.</dd><p className="mt-1 text-xs text-slate-500">Verify backups and restore readiness with the configured backup service.</p></div>
  </dl>
  <p className="text-xs text-slate-500">Last API readiness check: {checkedAt||'Not checked yet'}. Browser print availability does not confirm that a printer is installed or that paper was delivered.</p>
 </section>;
}
