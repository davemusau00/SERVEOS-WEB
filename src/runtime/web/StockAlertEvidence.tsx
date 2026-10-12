import React,{useCallback,useEffect,useRef,useState} from 'react';
import type {ApiClient,ApiStockAlertEvidence} from './apiClient';
import {allowed,type WebSession} from './session';
import {localReservationTime,operationalText} from './reservationWorkspace';
import {ds} from '../../design-system/tokens';

const quantity=(value:string|null,unit:string|null)=>{
 if(value===null||!/^\d{1,12}(\.\d{1,6})?$/.test(value))return 'Unavailable';
 const [whole,fraction='']=value.split('.'),tail=fraction.replace(/0+$/,'');
 return `${BigInt(whole).toLocaleString('en-KE')}${tail?`.${tail}`:''}${unit?` ${operationalText(unit,'units')}`:''}`;
};
const condition={LOW:'Low stock',OUT:'Out of stock',ABOVE_THRESHOLD:'Above opening threshold; replenishment evidence still required',EVIDENCE_REQUIRED:'Stock unit changed; evidence review required'};

/** Viewing or acknowledging this evidence never adjusts stock or resolves its task. */
export function StockAlertEvidence({id,client,session,onBack,onInventory}:{id:string;client:ApiClient;session:WebSession;onBack:()=>void;onInventory:()=>void}){
 const [data,setData]=useState<ApiStockAlertEvidence|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),flight=useRef(false),heading=useRef<HTMLHeadingElement|null>(null);
 const scope=`${session.businessId}:${session.actorId}:${session.policyVersion}:${session.permissions.join('|')}:${session.capabilities?.['operations.stockAlerts']}`;
 const inventory=allowed(session,'*')||['inventory.view','inventory.receive','inventory.transfer','inventory.waste','inventory.count','inventory.adjust'].some(permission=>allowed(session,permission));
 const authorized=session.enabled&&inventory&&session.capabilities?.['operations.inbox']===true&&session.capabilities?.['operations.stockAlerts']===true;
 const load=useCallback(async()=>{
  if(flight.current||!authorized)return;flight.current=true;const request=++generation.current;setBusy(true);setError('');
  try{const next=await client.stockAlertEvidence(id);if(request===generation.current)setData(next);}
  catch{if(request===generation.current){setData(null);setError('This alert could not be loaded for your current staff and device. Reconnect and refresh the inbox.');}}
  finally{if(request===generation.current){flight.current=false;setBusy(false);}}
 },[client,id,authorized,scope]);
 useEffect(()=>{setData(null);flight.current=false;heading.current?.focus();void load();return()=>{generation.current++;flight.current=false;};},[load]);
 const timeZone=session.propertyContext?.timeZone||'Africa/Nairobi',button=`${ds.button} min-h-11`;
 const episode=data?.episode;
 return <section className="space-y-4" aria-label="Stock alert evidence">
  <div className="flex flex-wrap items-center gap-2"><button className={button} onClick={onBack}>Back to alerts</button><button className={button} disabled={busy||!authorized} onClick={()=>void load()}>Refresh evidence</button><button className={button} onClick={onInventory}>Open inventory</button></div>
  <h3 tabIndex={-1} ref={heading} className="text-lg font-bold">Stock alert review</h3>
  {!authorized&&<p role="alert">Stock alert access is unavailable for your current staff and device.</p>}
  {busy&&<p role="status">Loading current server evidence…</p>}{error&&<p role="alert" className="text-amber-200">{error}</p>}
  {authorized&&data&&episode&&<>
   <div className={`${ds.panel} space-y-2 p-3`}><h4 className="font-bold">{operationalText(data.canonical.stockName,'Stock item')}{data.canonical.stockCode?` · ${operationalText(data.canonical.stockCode,'')}`:''}</h4><p>{operationalText(data.canonical.locationName,'Stock location')}</p><p className="font-semibold">{episode.status==='RESOLVED'?'Resolved through canonical replenishment':condition[episode.currentCondition]||'Evidence review required'}</p><p className="text-sm text-slate-400">Fetched {localReservationTime(data.generatedAt,timeZone)}. Server-confirmed on-hand quantity excludes unsynchronized terminal sales.</p></div>
   <dl className="grid grid-cols-2 gap-3 text-sm"><dt>Current server on hand</dt><dd className="text-right font-semibold">{quantity(data.canonical.quantity,data.canonical.baseUnit)}</dd><dt>Opening minimum</dt><dd className="text-right">{quantity(episode.minimumQuantity,episode.baseUnit)}</dd><dt>Quantity when opened</dt><dd className="text-right">{quantity(episode.openedQuantity,episode.baseUnit)}</dd><dt>Opened</dt><dd className="text-right">{localReservationTime(episode.openedAt,timeZone)}</dd>{episode.resolvedAt&&<><dt>Resolved</dt><dd className="text-right">{localReservationTime(episode.resolvedAt,timeZone)}</dd><dt>Replenishment balance</dt><dd className="text-right">{quantity(episode.resolvedQuantity,episode.baseUnit)}</dd></>}</dl>
   {(!data.canonical.unitMatches||data.canonical.archived)&&<p role="alert" className="text-sm text-amber-200">The original unit or active stock record changed. Review the original evidence and current stock before ordering or counting.</p>}
   <p className="text-sm text-slate-400">Reserved and available quantities are not yet established. Reading an alert or changing its policy does not resolve it. A new positive canonical stock movement must restore the original base-unit balance above this episode's opening minimum.</p>
   <h4 className="font-semibold">Recorded transitions</h4><ol className="space-y-3 border-l border-slate-700 pl-3">{data.transitions.map((entry,index)=><li key={`${entry.kind}:${index}`}><p>{entry.kind==='RESOLVED'?'Replenishment recorded':entry.kind==='OUT'?'Out-of-stock alert':'Low-stock alert'} · {quantity(entry.quantity,episode.baseUnit)}</p><p className="text-xs text-slate-400">{localReservationTime(entry.occurredAt,timeZone)}</p>{allowed(session,'audit.view')&&<details className="mt-1 text-xs text-slate-400"><summary className="min-h-11 cursor-pointer py-2">Technical details</summary><p className="break-all">Original command: {entry.sourceCommandId}</p><p>Balance revision: {entry.balanceVersion}</p><p className="break-all">Movement references: {entry.movementIds.join(', ')||'No movement; explicit policy review'}</p></details>}</li>)}</ol>
   <h4 className="font-semibold">Inbox delivery evidence</h4>{data.events.map(event=><p key={event.id} className="text-sm">{event.kind==='stock.out'?'Out-of-stock':'Low-stock'} · {localReservationTime(event.createdAt,timeZone)} · {event.readAt?`Seen ${localReservationTime(event.readAt,timeZone)}`:'Unread'}{event.resolvedAt?' · Underlying task resolved':''}</p>)}
  </>}
 </section>;
}
