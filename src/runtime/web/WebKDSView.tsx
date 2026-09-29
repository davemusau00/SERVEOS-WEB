import React,{useMemo,useState} from 'react';
import {CheckCircle2,Clock3,Flame,RefreshCw,Search,Utensils} from 'lucide-react';
import {allowed,type BusinessRecord,type WebSession} from './session';

type CommandFn=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<unknown>;
type Station='BAR'|'KITCHEN'|'SERVICE';
type Status='FIRED'|'PREPARING'|'READY'|'SERVED';
const stations:Station[]=['BAR','KITCHEN','SERVICE'];
const statuses:Status[]=['FIRED','PREPARING','READY','SERVED'];
const data=(record?:BusinessRecord)=>record?.data as Record<string,any>|undefined;
const active=(records:BusinessRecord[],collection:string)=>records.filter(r=>r.collection===collection&&!r.archived);
const nextStatus=(status:Status):Status=>status==='FIRED'?'PREPARING':status==='PREPARING'?'READY':'SERVED';
const actionLabel=(status:Status)=>status==='FIRED'?'Start preparing':status==='PREPARING'?'Mark ready':'Mark served';
const statusTone=(status:Status)=>status==='READY'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-200':status==='PREPARING'?'border-amber-500/30 bg-amber-500/10 text-amber-200':'border-sky-500/30 bg-sky-500/10 text-sky-200';

export function WebKDSView({records,session,disabled,command}:{records:BusinessRecord[];session:WebSession;disabled:boolean;command:CommandFn}){
 const orders=active(records,'orders');
 const [station,setStation]=useState<Station>('BAR');
 const [status,setStatus]=useState<'ALL'|Status>('ALL');
 const [query,setQuery]=useState('');
 const [notice,setNotice]=useState('');
 const canUpdate=allowed(session,'kds.update');
 const tickets=useMemo(()=>orders.flatMap(order=>(Array.isArray(data(order)?.items)?data(order)!.items:[]).filter((item:any)=>{
   const route=String(item.productSnapshot?.routeTo||item.routeTo||'BAR').toUpperCase();
   const itemStatus=String(item.courseStatus||'FIRED').toUpperCase() as Status;
   const text=[data(order)?.orderNumber,data(order)?.tabName,data(order)?.tableName,item.productName,item.note].join(' ').toLowerCase();
   return item.stockFired===true&&route===station&&itemStatus!=='SERVED'&&(status==='ALL'||itemStatus===status)&&(!query.trim()||text.includes(query.trim().toLowerCase()));
 }).map((item:any)=>({order,item,status:String(item.courseStatus||'FIRED').toUpperCase() as Status}))),[orders,station,status,query]);
 const advance=async(ticket:{order:BusinessRecord;item:any;status:Status})=>{
   setNotice('');
   try{await command('order.kds','orders',ticket.order.id,{orderId:ticket.order.id,itemId:ticket.item.id,station,status:nextStatus(ticket.status)});setNotice(`${ticket.item.productName||'Item'} moved to ${nextStatus(ticket.status)}.`)}catch(error){setNotice(String(error))}
 };
 return <section className="space-y-5" aria-label="Kitchen and bar pass">
   <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Flame className="h-5 w-5 text-amber-300"/>Bar / Kitchen Pass</h2><p className="mt-1 text-sm text-slate-400">Advance fired items through preparation states. Stock is already depleted by the committed fire command.</p></div><div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400"><Clock3 className="h-4 w-4"/>{tickets.length} active ticket{tickets.length===1?'':'s'}</div></header>
   {notice&&<p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200"><CheckCircle2 className="mr-2 inline h-4 w-4"/>{notice}</p>}
   <div className="grid gap-3 lg:grid-cols-[1fr_auto]"><label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-400" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search order, table, tab, or item"/></label><button className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold" onClick={()=>setNotice('Ticket list refreshed from the authorized snapshot.')}><RefreshCw className="h-4 w-4"/>Refresh view</button></div>
   <div className="flex flex-wrap gap-2"><div className="flex gap-2 overflow-x-auto">{stations.map(value=><button key={value} className={`rounded-xl px-4 py-2 text-sm font-bold ${station===value?'bg-amber-400 text-slate-950':'border border-slate-700 bg-slate-900 text-slate-300'}`} onClick={()=>setStation(value)}>{value}</button>)}</div><div className="flex gap-2 overflow-x-auto">{(['ALL',...statuses] as const).map(value=><button key={value} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${status===value?'border-amber-400 bg-amber-400/10 text-amber-200':'border-slate-700 text-slate-400'}`} onClick={()=>setStatus(value)}>{value}</button>)}</div></div>
   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tickets.map(ticket=>{const orderData=data(ticket.order)!;return <article key={`${ticket.order.id}-${ticket.item.id}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-black/10"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-mono text-xs text-amber-400">{String(orderData.orderNumber||ticket.order.id)}</div><h3 className="mt-1 truncate text-lg font-bold">{Number(ticket.item.quantity||1)} × {String(ticket.item.productName||'Item')}</h3><p className="text-sm text-slate-400">{String(orderData.tabName||orderData.tableName||'Walk-in')}</p></div><span className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-bold ${statusTone(ticket.status)}`}>{ticket.status}</span></div>{ticket.item.courseName&&<p className="mt-3 text-xs text-slate-500">Course: {String(ticket.item.courseName)}{ticket.item.seatLabel?` · Seat ${String(ticket.item.seatLabel)}`:''}</p>}{ticket.item.note&&<p className="mt-3 rounded-xl bg-slate-950 p-3 text-sm text-slate-300">Note: {String(ticket.item.note)}</p>}<button disabled={disabled||!canUpdate} className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40" onClick={()=>void advance(ticket)}>{actionLabel(ticket.status)}</button></article>})}{tickets.length===0&&<div className="col-span-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-6 py-14 text-center"><Utensils className="mx-auto h-8 w-8 text-slate-600"/><h3 className="mt-3 font-bold">No active {station.toLowerCase()} items</h3><p className="mt-1 text-sm text-slate-500">Fired orders will appear here after a POS operator sends items to the pass.</p></div>}</div>
 </section>;
}