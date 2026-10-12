import React,{useEffect,useRef,useState} from 'react';
import type {ApiClient,ApiReservationHistory} from './apiClient';
import type {WebSession} from './session';
import {allowed} from './session';
import {formatFinancialMoney} from '../../utils/financialMoney';
import {localReservationTime,operationalText} from './reservationWorkspace';

const button='min-h-11 rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-50';
export function ReservationHistory({reservationId,client,session,timeZone}:{reservationId:string;client:ApiClient;session:WebSession;timeZone:string}){
 const [page,setPage]=useState<ApiReservationHistory|null>(null),[items,setItems]=useState<ApiReservationHistory['items']>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),inFlight=useRef(false);
 const load=async(append=false)=>{
  if(inFlight.current)return;
  inFlight.current=true;const current=++generation.current;setBusy(true);setError('');
  try{
   const result=await client.reservationHistory(reservationId,append?page?.nextCursor||undefined:undefined);
   if(current!==generation.current)return;
   setPage(result);setItems(previous=>append?Array.from(new Map([...previous,...result.items].map(item=>[`${item.kind}:${item.id}`,item])).values()):result.items);
  }catch{if(current===generation.current)setError('Booking history could not be loaded. Reconnect and retry; the booking is unchanged.');}
  finally{if(current===generation.current){setBusy(false);inFlight.current=false;}}
 };
 useEffect(()=>{setPage(null);setItems([]);inFlight.current=false;void load();return()=>{generation.current++;inFlight.current=false;};},[reservationId,client,session.actorId,session.businessId,session.permissions.join('|')]);
 return <section className="mt-3 space-y-2 rounded-lg border border-slate-700 p-3" aria-label="Booking and stay history">
  <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold">Booking and stay history</h5><button type="button" className={button} disabled={busy} onClick={()=>void load()}>Refresh history</button></div>
  {busy&&<p role="status" className="text-sm text-slate-400">Loading history…</p>}{error&&<p role="alert" className="text-sm text-amber-200">{error}</p>}
  {page&&<p className="text-xs text-slate-400">Booking created {localReservationTime(page.createdAt,timeZone)}. Latest history fetched {localReservationTime(page.generatedAt,timeZone)}. {page.financialEntriesIncluded?'Includes authorized guest-account entries.':'Guest-account entries require separate permission.'}</p>}
  <ol className="space-y-3 border-l border-slate-700 pl-3">{items.map(item=><li key={`${item.kind}:${item.id}`} className="text-sm">
   <p className="font-medium">{operationalText(item.title.replace(/_/g,' '),'Recorded update')}{item.amountMinor!==null&&<span className="ml-2 tabular-nums">{formatFinancialMoney(item.amountMinor)}</span>}</p>
   <p className="text-xs text-slate-400">{localReservationTime(item.occurredAt,timeZone)} · {operationalText(item.staffName,'Staff name unavailable')}{item.roomNumber?` · Room ${operationalText(item.roomNumber,'unavailable')}`:''}</p>
   {item.note&&<p className="break-words text-slate-300">{operationalText(item.note,'Recorded in secured history')}</p>}
   {allowed(session,'audit.view')&&item.sourceCommandId&&<details className="text-xs text-slate-400"><summary className="min-h-11 cursor-pointer py-2">Technical details</summary><p className="break-all">Original command: {item.sourceCommandId}</p></details>}
  </li>)}</ol>
  {!busy&&!error&&page&&!items.length&&<p className="text-sm text-slate-400">No subsequent stay or authorized guest-account entries have been recorded.</p>}
  {page?.hasMore&&<button type="button" className={button} disabled={busy} onClick={()=>void load(true)}>Load earlier history</button>}
 </section>;
}
