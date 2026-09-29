import React,{useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,Cloud,Database,HardDrive,Power,Printer,ScanLine,ShieldCheck,WifiOff} from 'lucide-react';
import type {PrinterJobResult,TerminalAcceptanceStatus} from '../types/runtime';
import {useRuntime} from '../runtime/RuntimeProvider';
import {useBarcodeScanner} from '../hooks/useBarcodeScanner';
import {buttonClass,primaryButtonClass} from './records';

// SERVOS_PATCH_10_TERMINAL_ACCEPTANCE

export function NativeTerminalAcceptancePanel(){
  const runtime=useRuntime();
  const [status,setStatus]=useState<TerminalAcceptanceStatus|null>(null);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [printerJob,setPrinterJob]=useState<PrinterJobResult|null>(null);
  const [scannerArmed,setScannerArmed]=useState(false);
  const [online,setOnline]=useState(()=>navigator.onLine);

  const load=async()=>{try{setStatus(await runtime.acceptanceStatus())}catch(e){setMessage(String(e))}};
  useEffect(()=>{void load();const sync=()=>setOnline(navigator.onLine);window.addEventListener('online',sync);window.addEventListener('offline',sync);return()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync)}},[]);
  const act=async(action:string,payload:Record<string,unknown>={})=>{setBusy(action);setMessage('');try{const next=await runtime.acceptanceAction(action,payload);setStatus(next);return next}catch(e){setMessage(String(e));throw e}finally{setBusy('')}};
  const scannerCapture=async(raw:string)=>{const clean=raw.trim();if(!clean)return;setScannerArmed(false);try{await act('SCANNER_CONFIRM',{codeLength:clean.length});setMessage(`Scanner captured ${clean.length} character(s). The scanned value was not stored.`)}catch{}};
  useBarcodeScanner({enabled:scannerArmed,onScan:raw=>void scannerCapture(raw)});

  const required=useMemo(()=>status?.requiredEvidence||[],[status]);
  const complete=required.filter(kind=>status?.evidence?.[kind]).length;
  const runBackup=async()=>{try{await act('BACKUP_REHEARSAL');setMessage('Backup created and restored into an isolated rehearsal copy. Identity/counts matched, the restored copy stayed healthy after a writable command, and duplicate command replay was idempotent.')}catch{}};
  const testPrinter=async()=>{setBusy('PRINTER_TEST');setMessage('');try{const job=await runtime.testPrinter();setPrinterJob(job);setMessage(`Printer transport: ${job.state}. Check the physical paper before confirming.`)}catch(e){setMessage(String(e))}finally{setBusy('')}};
  const confirmPrinter=async()=>{if(!printerJob?.jobId)return;try{await act('PRINTER_CONFIRM',{jobId:printerJob.jobId,paperObserved:true});setMessage('Physical printer output recorded.')}catch{}};
  const cloudRecovery=async()=>{setBusy('CLOUD_CONFIRM');setMessage('');try{await runtime.sync();const next=await runtime.acceptanceAction('CLOUD_CONFIRM',{});setStatus(next);setMessage('Synchronization completed with no pending outbox operations.')}catch(e){setMessage(String(e))}finally{setBusy('')}};
  const drawer=async()=>{if(!window.confirm('Physically open/test the cash drawer manually first. Record acceptance only if the drawer and workflow were actually observed.'))return;try{await act('CASH_DRAWER_CONFIRM',{observed:true});setMessage('Manual cash-drawer observation recorded. ServOS still has no direct drawer adapter.')}catch{}};
  const finalize=async()=>{try{await act('FINALIZE');setMessage('This terminal has a completed ServOS acceptance record for the current schema and terminal identity.')}catch{}};

  return <section className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-emerald-200">Physical terminal acceptance</h2><p className="mt-1 max-w-3xl text-xs text-slate-400">Evidence-driven final rehearsal for this exact installed terminal. Hardware observations, backup recovery, restart behavior, offline SQLite and cloud recovery are recorded locally and cannot be edited later.</p></div><button className={buttonClass} disabled={Boolean(busy)} onClick={()=>void load()}>Refresh acceptance</button></div>
    {message&&<p role="status" className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-300">{message}</p>}

    {status&&<><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Fact icon={<Database className="h-4 w-4"/>} label="SQLite" value={`v${status.facts.schemaVersion} · ${status.facts.quickCheck}`}/>
      <Fact icon={<ShieldCheck className="h-4 w-4"/>} label="Terminal" value={status.facts.terminalId?.slice(0,12)||'Missing'}/>
      <Fact icon={<Cloud className="h-4 w-4"/>} label="Outbox" value={`${status.facts.outboxPending} pending`}/>
      <Fact icon={<HardDrive className="h-4 w-4"/>} label="Backup" value={status.facts.lastBackup?new Date(status.facts.lastBackup).toLocaleString():'Never'}/>
      <Fact icon={<Printer className="h-4 w-4"/>} label="Print queue" value={`${status.facts.unresolvedPrinterJobs} unresolved`}/>
      <Fact icon={<Power className="h-4 w-4"/>} label="Evidence" value={`${complete}/${required.length}`}/>
    </div>

    {status.accepted&&<div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4"><div className="flex items-center gap-2 font-bold text-emerald-300"><CheckCircle2 className="h-5 w-5"/>Terminal accepted</div><p className="mt-1 text-xs text-slate-400">Accepted {status.acceptedAt?new Date(status.acceptedAt).toLocaleString():'for this schema'}.</p></div>}

    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <Check title="Backup / restore" done={Boolean(status.evidence.BACKUP_RESTORE_REHEARSAL)} description="Creates a real SQLite backup, copies it as a rehearsal restore, opens it read-only and compares schema, terminal identity and core row counts." action={<button className={buttonClass} disabled={Boolean(busy)} onClick={()=>void runBackup()}>{busy==='BACKUP_REHEARSAL'?'Rehearsing…':'Run backup rehearsal'}</button>}/>
      {status.expectations.printer&&<Check title="Receipt printer" done={Boolean(status.evidence.PRINTER_PAPER_OBSERVED)} description="Transport success is not treated as physical paper acknowledgement. Send a ServOS test slip, look at the printer, then confirm only if the slip exists." action={<div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={Boolean(busy)} onClick={()=>void testPrinter()}>Send test slip</button><button className={primaryButtonClass} disabled={!printerJob?.jobId||!['SENT','DELIVERY_UNCERTAIN'].includes(printerJob.state)||Boolean(busy)} onClick={()=>void confirmPrinter()}>Paper observed</button></div>}/>}
      {status.expectations.scanner&&<Check title="Barcode scanner" done={Boolean(status.evidence.SCANNER_INPUT)} description="Arms the keyboard-wedge scanner listener. ServOS records only capture length and the fact a wedge scan occurred, never the scanned value." action={<button className={scannerArmed?primaryButtonClass:buttonClass} disabled={Boolean(busy)} onClick={()=>setScannerArmed(v=>!v)}><ScanLine className="mr-1 inline h-4 w-4"/>{scannerArmed?'Scan now…':'Arm scanner test'}</button>}/>}
      {status.expectations.cashDrawer&&<Check title="Cash drawer" done={Boolean(status.evidence.CASH_DRAWER_MANUAL)} description="Direct cash-drawer control is not implemented. This is deliberately a manual physical observation, not simulated device success." action={<button className={buttonClass} disabled={Boolean(busy)} onClick={()=>void drawer()}>Record observed manual test</button>}/>}
      <Check title="Restart recovery" done={Boolean(status.evidence.RESTART_RECOVERY)} description={status.restart.pending?(status.restart.canConfirm?'A different ServOS process is running. Sign-in recovery can now be confirmed.':'Challenge stored. Close ServOS completely, relaunch it and sign in again.'):'Stores this process nonce. Acceptance only succeeds after a genuinely different native process starts.'} action={status.restart.pending&&status.restart.canConfirm?<button className={primaryButtonClass} disabled={Boolean(busy)} onClick={()=>void act('RESTART_CONFIRM')}>Confirm restart recovery</button>:!status.restart.pending?<button className={buttonClass} disabled={Boolean(busy)} onClick={()=>void act('RESTART_BEGIN').then(()=>setMessage('Restart challenge stored. Close ServOS completely, relaunch it, sign in, then return here.')).catch(()=>undefined)}>Begin restart test</button>:<span className="text-xs text-amber-300">Relaunch required</span>}/>
      <Check title="Offline local operation" done={Boolean(status.evidence.OFFLINE_LOCAL_PROBE)} description="Disconnect networking first. The probe is enabled only while the browser/native webview reports offline, then verifies SQLite can still read and commit local acceptance evidence." action={<button className={buttonClass} disabled={online||Boolean(busy)} onClick={()=>void act('OFFLINE_PROBE',{navigatorOffline:!online})}><WifiOff className="mr-1 inline h-4 w-4"/>{online?'Disconnect network first':'Run offline probe'}</button>}/>
      <Check title="Reconnect + cloud" done={Boolean(status.evidence.CLOUD_RESYNC)} description="Reconnect networking, synchronize, then require a recent successful sync and zero pending outbox operations. This must occur after the offline rehearsal." action={<button className={buttonClass} disabled={!online||Boolean(busy)} onClick={()=>void cloudRecovery()}>{busy==='CLOUD_CONFIRM'?'Synchronizing…':'Sync and verify recovery'}</button>}/>
    </div>

    {status.blockers.length>0&&<div className="mt-4 rounded-xl border border-amber-500/30 bg-slate-950 p-3"><div className="flex items-center gap-2 text-xs font-bold text-amber-300"><AlertTriangle className="h-4 w-4"/>Final acceptance blockers</div><ul className="mt-2 space-y-1 text-xs text-slate-300">{status.blockers.map((b,i)=><li key={`${i}-${b}`}>• {b}</li>)}</ul></div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-950 p-4"><div><b>Final acceptance</b><p className="mt-1 text-xs text-slate-500">Admin-only. Requires LIVE stage, clean SQLite, closed till, empty outbox/print queue, configured cloud and every required evidence item.</p></div><button className={primaryButtonClass} disabled={!status.readyToFinalize||status.accepted||Boolean(busy)} onClick={()=>void finalize()}>{status.accepted?'Accepted':'Finalize terminal acceptance'}</button></div>
    </>}
  </section>;
}

function Fact({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="rounded-xl bg-slate-950 p-3"><div className="flex items-center gap-1 text-[10px] uppercase text-slate-500">{icon}{label}</div><div className="mt-1 break-all text-sm font-bold">{value}</div></div>}
function Check({title,done,description,action}:{title:string;done:boolean;description:string;action:React.ReactNode}){return <article className={`rounded-xl border p-4 ${done?'border-emerald-500/30 bg-emerald-950/10':'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${done?'text-emerald-300':'text-slate-600'}`}/><b>{title}</b></div><span className={`text-[10px] font-black ${done?'text-emerald-300':'text-slate-500'}`}>{done?'PASS':'PENDING'}</span></div><p className="mt-2 text-xs text-slate-500">{description}</p><div className="mt-3">{action}</div></article>}
