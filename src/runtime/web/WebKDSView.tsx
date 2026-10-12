import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Clock3,Flame,RefreshCw,Search} from 'lucide-react';
import {Notice,StatusBadge,EmptyState} from '../../design-system/components';
import {ds} from '../../design-system/tokens';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {CommandOutcome} from '../../types/transactions';
import type {QueuedCommand} from './BusinessStore';
import {kdsBoard,prepLabel,prepStates,prepStations,type PrepLine,type PrepState,type PrepStation} from './kdsBoard';

type CommandFn=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
type Filters={station:PrepStation;status:'ALL'|PrepState;query:string};
const stationLabel:Record<PrepStation,string>={BAR:'Bar',KITCHEN:'Kitchen',ROOMS:'Rooms'};
const nextStatus=(status:PrepState)=>status==='FIRED'?'PREPARING':status==='PREPARING'?'READY':'SERVED';
const actionLabel=(status:PrepState)=>status==='FIRED'?'Start preparing':status==='PREPARING'?'Mark ready':'Mark served';
const defaultFilters:Filters={station:'BAR',status:'ALL',query:''};
const readFilters=(key:string):Filters=>{try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');return saved&&prepStations.includes(saved.station)&&['ALL',...prepStates].includes(saved.status)&&typeof saved.query==='string'?saved:defaultFilters;}catch{return defaultFilters;}};

export function WebKDSView({records,session,disabled,command,onRefresh,onActivity,queue=[]}:{records:BusinessRecord[];session:WebSession;disabled:boolean;command:CommandFn;onRefresh:()=>Promise<void>;onActivity?:()=>void;queue?:QueuedCommand[]}){
 const key=`servos-kds-filters:${session.businessId}:${session.actorId}`;
 const [filters,setFilters]=useState(()=>readFilters(key));
 const [now,setNow]=useState(Date.now),[refreshing,setRefreshing]=useState(false),[saving,setSaving]=useState('');
 const [notice,setNotice]=useState(''),[failure,setFailure]=useState<{orderId:string;reference:string;message:string;unknown:boolean;commandId?:string}|null>(null);
 const [awaiting,setAwaiting]=useState<Record<string,{version:number;unknown:boolean;commandId?:string}>>({});
 const inFlight=useRef(false);const refreshedAfterFailure=useRef(false);
 const board=useMemo(()=>kdsBoard(records),[records]);
 const canUpdate=allowed(session,'kds.update');
 const settings=records.find(r=>r.collection==='businessSettings'&&!r.archived);
 const configuredThreshold=Number(settings?.data.preparationOverdueMinutes);
 const overdueMinutes=Number.isFinite(configuredThreshold)&&configuredThreshold>=1&&configuredThreshold<=240?configuredThreshold:15;
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(filters));}catch{/* Filters are optional, never financial storage. */}},[key,filters]);
 useEffect(()=>{setAwaiting(current=>Object.fromEntries(Object.entries(current).filter(([id,pending])=>{const row=records.find(r=>r.collection==='orders'&&r.id===id);const entry=pending.commandId?queue.find(q=>q.id===pending.commandId):undefined;const unresolved=pending.unknown&&entry?.state!=='SYNCHRONIZED';return unresolved||!row||row.version<=pending.version;})));},[records,queue]);
 useEffect(()=>{
  if(!failure?.commandId)return;
  const entry=queue.find(q=>q.id===failure.commandId);
  if(entry?.state==='SYNCHRONIZED'){setFailure(null);setAwaiting(current=>{const next={...current};delete next[failure.orderId];return next;});}
  else if(failure.unknown&&(entry?.state==='CONFLICT'||entry?.state==='REJECTED')){
   setAwaiting(current=>{const next={...current};delete next[failure.orderId];return next;});
   setFailure({...failure,unknown:false,message:'The server did not apply this update. Refresh and review the current ticket before trying again.'});refreshedAfterFailure.current=false;
  }
 },[queue,failure]);
 const unresolved=(id:string)=>queue.some(q=>q.state!=='SYNCHRONIZED'&&q.state!=='REJECTED'&&q.state!=='CONFLICT'&&q.command.operation==='order.kds'&&q.command.payload.orderId===id);
 const configuredStations=prepStations.filter(station=>board.lines.some(line=>line.station===station)||records.some(r=>r.collection==='products'&&!r.archived&&r.data.routeTo===station));
 const stations=configuredStations.length?configuredStations:prepStations;
 useEffect(()=>{if(!stations.includes(filters.station))setFilters(current=>({...current,station:stations[0]}));},[stations.join('|'),filters.station]);
 const stationLines=board.lines.filter(line=>line.station===filters.station);
 const visible=stationLines.filter(line=>(filters.status==='ALL'||line.status===filters.status)&&`${line.reference} ${line.location} ${line.name} ${line.note} ${line.choices.join(' ')} ${line.waiter}`.toLowerCase().includes(filters.query.trim().toLowerCase()));
 const elapsed=(line:PrepLine)=>line.firedAt===null?null:Math.max(0,Math.floor((now-line.firedAt)/60000));
 const overdue=stationLines.filter(line=>line.status!=='READY'&&(elapsed(line)??0)>=overdueMinutes).length;
 const refresh=async()=>{
  if(inFlight.current||refreshing)return;setRefreshing(true);setNotice('');
  try{await onRefresh();setNow(Date.now());refreshedAfterFailure.current=true;setNotice('Preparation list refreshed. Review the current items before continuing.');}
  catch{setNotice('Could not refresh. Check your connection and open Activity for unresolved updates.');}
  finally{setRefreshing(false);}
 };
 const advance=async(line:PrepLine)=>{
  if(disabled||!canUpdate||inFlight.current||refreshing||awaiting[line.order.id]||unresolved(line.order.id)||!line.name||line.problems.some(p=>p.includes('Product name')||p.includes('quantity')))return;
  if(failure?.orderId===line.order.id&&(failure.unknown||!refreshedAfterFailure.current))return;
  inFlight.current=true;setSaving(line.id);setNotice('');setFailure(null);refreshedAfterFailure.current=false;
  try{
   const out=await command('order.kds','orders',line.order.id,{orderId:line.order.id,itemId:line.id,station:line.station,status:nextStatus(line.status),expectedVersions:[{collection:'orders',id:line.order.id,version:line.order.version}]});
   if(out.kind==='CONFIRMED'){
    setAwaiting(current=>({...current,[line.order.id]:{version:line.order.version,unknown:false}}));setNotice(`${line.reference}: update recorded by server; refreshing the board.`);
    try{await onRefresh();}catch{setNotice(`${line.reference}: update recorded. Refresh the board to see its current state.`);}
   }else if(out.kind==='PENDING'||out.kind==='OUTCOME_UNKNOWN'){
    setAwaiting(current=>({...current,[line.order.id]:{version:line.order.version,unknown:out.kind==='OUTCOME_UNKNOWN',commandId:out.commandId}}));setFailure({orderId:line.order.id,reference:line.reference,message:'This update is awaiting confirmation. Recover the original update in Activity; do not submit another.',unknown:true,commandId:out.commandId});
   }else setFailure({orderId:line.order.id,reference:line.reference,message:out.kind==='DRAFT_SAVED'?'This update is only a draft and has not reached preparation. Refresh before continuing.':out.message,unknown:false});
  }catch{setFailure({orderId:line.order.id,reference:line.reference,message:'The update outcome is uncertain. Open Activity to recover the original update before continuing.',unknown:true});}
  finally{inFlight.current=false;setSaving('');}
 };
 return <section className="space-y-3" aria-label="Kitchen and bar pass" data-guide-anchor="web.kds">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className={`${ds.pageTitle} flex items-center gap-2`}><Flame aria-hidden="true" className="h-5 w-5 text-amber-300"/>{stationLabel[filters.station]} preparation</h2><p className={`${ds.fgMuted} mt-1 text-sm`}>{stationLines.length} active items{overdue>0?` / ${overdue} waiting over ${overdueMinutes} min`:''}</p></div>
   <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={disabled?'warning':'neutral'}>{disabled?'Updates unavailable':'Server updates'}</StatusBadge><button className={`${ds.button} min-h-11`} disabled={refreshing||Boolean(saving)||disabled} onClick={()=>void refresh()}><RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing?'animate-spin':''}`}/>{refreshing?'Refreshing':'Refresh'}</button></div>
  </header>
  <nav aria-label="Preparation station" className="flex flex-wrap gap-2">{stations.map(station=><button key={station} aria-pressed={filters.station===station} className={`${filters.station===station?ds.primaryButton:ds.button} min-h-11`} onClick={()=>setFilters(current=>({...current,station}))}>{stationLabel[station]} <span className="tabular-nums">{board.lines.filter(line=>line.station===station).length}</span></button>)}</nav>
  <div className="flex flex-wrap items-end justify-between gap-3">
   <nav className="flex flex-wrap gap-1" aria-label="Preparation status">{(['ALL',...prepStates] as const).map(status=><button key={status} aria-pressed={filters.status===status} className={`${ds.button} min-h-11 ${filters.status===status?'border-amber-400 text-amber-300':''}`} onClick={()=>setFilters(current=>({...current,status}))}>{status==='ALL'?'All active':prepLabel[status]} <span className="tabular-nums">{stationLines.filter(line=>status==='ALL'||line.status===status).length}</span></button>)}</nav>
   <label className="block w-full sm:max-w-sm"><span className="sr-only">Search preparation</span><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500"/><input className={`${ds.input} min-h-11 pl-10`} value={filters.query} onChange={e=>setFilters(current=>({...current,query:e.target.value}))} placeholder="Order, table, item or note"/></div></label>
  </div>
  {!canUpdate&&<Notice>You can view preparation. Ask an authorized preparation operator to update items.</Notice>}
  {notice&&<Notice>{notice}</Notice>}
  {failure&&<Notice tone="warning"><strong>{failure.reference} needs attention.</strong> {failure.message}<div className="mt-2 flex flex-wrap gap-2"><button className={`${ds.button} min-h-11`} disabled={refreshing||disabled} onClick={()=>void refresh()}>Refresh ticket</button>{onActivity&&<button className={`${ds.button} min-h-11`} onClick={onActivity}>View activity</button>}</div></Notice>}
  {board.issues.length>0&&<Notice tone="warning"><details><summary className="cursor-pointer">{board.issues.length} preparation snapshot{board.issues.length===1?'':'s'} need attention</summary><ul className="mt-2 space-y-2">{board.issues.map(issue=><li key={issue.key}><b>{issue.reference}</b>: {issue.message}</li>)}</ul><button className={`${ds.button} mt-2 min-h-11`} disabled={refreshing||disabled} onClick={()=>void refresh()}>Refresh affected orders</button>{onActivity&&<button className={`${ds.button} ml-2 min-h-11`} onClick={onActivity}>View activity</button>}</details></Notice>}
  <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map(line=>{
   const age=elapsed(line),late=line.status!=='READY'&&age!==null&&age>=overdueMinutes;
   const invalid=line.problems.some(p=>p.includes('Product name')||p.includes('quantity'));
   const pending=Boolean(awaiting[line.order.id])||unresolved(line.order.id);
   const blocked=disabled||!canUpdate||Boolean(saving)||refreshing||pending||invalid||failure?.orderId===line.order.id&&(failure.unknown||!refreshedAfterFailure.current);
   const explanation=invalid?'Ask a supervisor to review the incomplete item.':pending?'Waiting for the original update. Open Activity for recovery.':disabled?'Connect to the server to update preparation.':!canUpdate?'Your account can view but cannot update preparation.':blocked?'Finish or refresh the current update before continuing.':undefined;
   return <article key={`${line.order.id}:${line.id}`} className={`${ds.panel} min-w-0 p-3 ${late?'border-amber-500/70':''}`}>
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-bold text-amber-300">{line.reference}</h3><p className="break-words text-sm text-slate-300">{line.location}</p></div><StatusBadge tone={line.status==='READY'?'success':line.status==='PREPARING'?'warning':'info'}>{prepLabel[line.status]}</StatusBadge></div>
    <p className="mt-3 break-words text-lg font-bold leading-snug"><span className="tabular-nums">{Number.isFinite(line.quantity)?line.quantity:'?'} x </span>{line.name}</p>
    {line.choices.length>0&&<p className="mt-1 break-words text-sm text-slate-300">{line.choices.join(' / ')}</p>}
    {line.note&&<p className="mt-2 break-words rounded-lg bg-slate-950 p-2 text-sm text-white">{line.note}</p>}
    {(line.course||line.waiter)&&<p className="mt-2 break-words text-xs text-slate-400">{[line.course,line.waiter].filter(Boolean).join(' / ')}</p>}
    <p className={`mt-2 flex items-center gap-1 text-sm ${late?'font-bold text-amber-300':'text-slate-400'}`}><Clock3 aria-hidden="true" className="h-4 w-4"/>{age===null?'Start time unavailable':`${age} min since sent`}</p>
    {line.problems.map(problem=><p className="mt-2 text-sm text-amber-200" key={problem}>{problem}</p>)}
    {explanation&&<p className="mt-2 text-xs text-slate-400">{explanation}</p>}
    <button className={`${ds.primaryButton} mt-3 min-h-11 w-full`} title={explanation} disabled={Boolean(blocked)} aria-busy={saving===line.id} onClick={()=>void advance(line)}>{saving===line.id?'Recording update':actionLabel(line.status)}</button>
    {allowed(session,'audit.view')&&<details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">Technical details</summary><p className="break-all">Order: {line.order.id}</p><p className="break-all">Item: {line.id}</p><p>Order version: {line.order.version}</p></details>}
   </article>;
  })}</div>
  {!visible.length&&<EmptyState title={filters.query||filters.status!=='ALL'?'No matching preparation items':`No active ${stationLabel[filters.station].toLowerCase()} tickets`} description={filters.query||filters.status!=='ALL'?'Try another filter or clear the search.':'Approved items appear here when they are sent for preparation.'} action={filters.query||filters.status!=='ALL'?<button className={`${ds.button} min-h-11`} onClick={()=>setFilters(current=>({...current,status:'ALL',query:''}))}>Clear filters</button>:undefined}/>}
 </section>;
}
