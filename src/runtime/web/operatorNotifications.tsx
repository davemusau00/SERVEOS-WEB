import React,{useEffect,useSyncExternalStore} from 'react';
import {AlertTriangle,CheckCircle2,Info,X} from 'lucide-react';
import type {CommandOutcome} from '../../types/transactions';

export type NoticeSeverity='success'|'info'|'warning'|'error';
export type NoticeStage='local'|'pending'|'confirmed'|'rejected'|'conflict'|'unknown';
export type NoticeAction={label:string;destination:'activity'|'stock'|'procurement'|'pos'|'devices'|'printing';detail?:Record<string,string>};
export type OperatorNotice={id:string;severity:NoticeSeverity;stage?:NoticeStage;title:string;message?:string;scope?:{businessId:string;deviceId?:string};dedupeKey?:string;action?:NoticeAction;persistent?:boolean;durationMs?:number};
type StoredNotice=OperatorNotice&{key:string;scopeKey:string};
type State={scopeKey:string;toasts:StoredNotice[];alerts:StoredNotice[]};
const empty:State={scopeKey:'',toasts:[],alerts:[]};let state=empty;const listeners=new Set<()=>void>(),seen=new Set<string>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
const publish=()=>listeners.forEach(listener=>listener());
const scopeKey=(scope?:OperatorNotice['scope'])=>scope?`${scope.businessId}:${scope.deviceId||''}`:'';
const removeToast=(key:string)=>{const next=state.toasts.filter(item=>item.key!==key);if(next.length!==state.toasts.length){state={...state,toasts:next};publish()}const timer=timers.get(key);if(timer)clearTimeout(timer);timers.delete(key)};
const isDuplicate=(key:string)=>{
 if(seen.has(key))return true;
 try{const storageKey=`serveos:notice:${key}`;const prior=Number(localStorage.getItem(storageKey)||0);if(prior>Date.now()-24*60*60_000)return true;localStorage.setItem(storageKey,String(Date.now()));}catch{/* Private browsing may deny storage; active-tab dedupe remains available. */}
 seen.add(key);if(seen.size>800)seen.delete(seen.values().next().value as string);return false;
};
export function subscribeOperatorNotices(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}
export function getOperatorNoticeSnapshot(){return state}
export function setOperatorNoticeScope(scope?:OperatorNotice['scope']){const next=scopeKey(scope);if(state.scopeKey===next)return;for(const key of [...timers.keys()])removeToast(key);state={scopeKey:next,toasts:next?state.toasts.filter(item=>item.scopeKey===next):[],alerts:next?state.alerts.filter(item=>item.scopeKey===next):[]};publish()}
export function publishOperatorNotice(notice:OperatorNotice){
 const ownScope=scopeKey(notice.scope);if(state.scopeKey&&ownScope&&state.scopeKey!==ownScope)return;
 const key=`${ownScope||state.scopeKey}:${notice.dedupeKey||notice.id}:${notice.stage||'event'}`;if(isDuplicate(key))return;
 const entry:StoredNotice={...notice,key,scopeKey:ownScope||state.scopeKey};
 const priorAlerts=notice.stage==='confirmed'?state.alerts.filter(item=>item.id!==notice.id):state.alerts;
 state={...state,toasts:[...state.toasts,entry].slice(-3),alerts:notice.persistent?[...priorAlerts.filter(item=>item.key!==key),entry].slice(-40):priorAlerts};publish();
 if(notice.severity==='success')return;
 const duration=notice.durationMs??(notice.severity==='error'?6500:5500);timers.set(key,setTimeout(()=>removeToast(key),duration));
}
export function dismissOperatorToast(key:string){removeToast(key)}
export function acknowledgePersistentNotice(key:string){state={...state,alerts:state.alerts.filter(item=>item.key!==key)};publish()}
export function clearOperatorNotices(){for(const key of [...timers.keys()])removeToast(key);state=empty;publish()}

export function publishCommandOutcomeNotice(operation:string,payload:Record<string,unknown>,outcome:CommandOutcome,scope:{businessId:string;deviceId?:string},canViewStock:boolean){
 const commandId='commandId' in outcome?outcome.commandId:('draftId' in outcome?outcome.draftId:`${operation}:${String(payload.id||payload.orderId||'action')}`);
 const code='error' in outcome?outcome.error?.code:undefined;
 const orderId=typeof payload.orderId==='string'?payload.orderId:typeof payload.id==='string'&&operation.startsWith('order.')?payload.id:undefined;
 const action:NoticeAction={label:'Open Activity',destination:'activity'};
 let severity:NoticeSeverity='info',stage:NoticeStage='pending',title='',message:string|undefined,critical=false;
 if(outcome.kind==='CONFIRMED'){
  severity='success';stage='confirmed';title=operation==='order.fire'?'Items fired':operation.startsWith('payment.')||operation==='folio.pay'?'Payment recorded by the API':operation.startsWith('inventory.')||operation==='procurement.receive'?'Stock record updated':operation==='device.revoke'?'Device access revoked':operation.startsWith('room')||operation.startsWith('stay.')?'Room workflow updated':operation==='mpesaReference.submit'?'Reference sent for cashier review':operation==='print.claim'?'Print job claimed':operation==='print.report'&&payload.outcome==='DELIVERY_UNCERTAIN'?'Printer result uncertain. Check paper before retrying.':operation==='print.report'?'Print delivery status recorded':operation==='print.confirm'?'Delivery confirmation recorded':operation==='print.retry'?'Print job requeued after review':operation.startsWith('print.')?'Print job updated':'Change confirmed by the API';
  if(operation==='mpesaReference.submit')message='Payment is not confirmed.';else if(operation==='print.report'&&payload.outcome==='DELIVERY_UNCERTAIN'){severity='warning';stage='unknown';critical=true;message='The browser print dialog cannot confirm that paper was produced. Review the current job before retrying.';Object.assign(action,{label:'Open printer recovery',destination:'printing',detail:typeof payload.jobId==='string'?{jobId:payload.jobId}:undefined});}else if(operation.startsWith('print.'))message='This records the job state; it does not by itself prove physical paper delivery.';
 }else if(outcome.kind==='DRAFT_SAVED'){title='Draft saved on this browser';message='It has not been submitted to the API.';}
 else if(outcome.kind==='PENDING'){title=operation==='order.offlineCashSale'?'Cash recorded on this device. Pending server sync.':'Saved on this device; waiting to synchronize.';severity='warning';stage='pending';message=undefined;critical=/payment|offlineCash|order\.fire/.test(operation);}
 else if(outcome.kind==='OUTCOME_UNKNOWN'){title='Still checking whether this was saved';message='Open Activity and recover the original command before trying again.';severity='warning';stage='unknown';critical=true;}
 else if(outcome.kind==='CONFLICT'||outcome.kind==='REJECTED'){
  severity=outcome.kind==='CONFLICT'?'warning':'error';stage=outcome.kind==='CONFLICT'?'conflict':'rejected';critical=true;
  title=code==='INSUFFICIENT_STOCK'?'Cannot fire: not enough stock for this order':code==='VERSION_CONFLICT'?'This record changed elsewhere':code==='PERMISSION_DENIED'?'This device or role is not authorized':operation==='mpesaReference.submit'?'Reference needs correction or review':'Action needs review';message=outcome.message;
  if(code==='INSUFFICIENT_STOCK'&&canViewStock)Object.assign(action,{label:'Review stock',destination:'stock',...(orderId?{detail:{orderId}}:{})});
 }else return;
 publishOperatorNotice({id:commandId,stage,severity,title,message,scope,dedupeKey:`${commandId}:${stage}`,action,persistent:critical,durationMs:severity==='success'?3600:6000});
}

const icon=(severity:NoticeSeverity)=>severity==='success'?CheckCircle2:severity==='error'||severity==='warning'?AlertTriangle:Info;
const color:Record<NoticeSeverity,string>={success:'border-emerald-700 bg-emerald-950/95',info:'border-sky-700 bg-slate-900/95',warning:'border-amber-700 bg-amber-950/95',error:'border-rose-700 bg-rose-950/95'};
export function OperatorNotificationViewport({scope}:{scope:{businessId:string;deviceId?:string}}){
 const snapshot=useSyncExternalStore(subscribeOperatorNotices,getOperatorNoticeSnapshot,getOperatorNoticeSnapshot);
 useEffect(()=>{setOperatorNoticeScope(scope)},[scope.businessId,scope.deviceId]);
 const currentToasts=snapshot.toasts.filter(item=>item.scopeKey===scopeKey(scope)),currentAlerts=snapshot.alerts.filter(item=>item.scopeKey===scopeKey(scope));
 const act=(item:StoredNotice)=>{if(item.action)window.dispatchEvent(new CustomEvent('servos:operator-notice-action',{detail:item.action}));};
 return <div className="pointer-events-none mb-3 flex justify-end" aria-label="Operator notifications">
  <div className="pointer-events-auto w-full max-w-xl space-y-2">
   {currentAlerts.length>0&&<section aria-label="Needs attention" className="space-y-2">{currentAlerts.map(item=>{const Icon=icon(item.severity);return <article key={item.key} className={`rounded-xl border p-3 text-sm shadow-lg ${color[item.severity]}`}><div className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0"/><div className="min-w-0 flex-1"><b>{item.title}</b>{item.message&&<p className="mt-1 text-slate-200">{item.message}</p>}<div className="mt-2 flex gap-3">{item.action&&<button className="min-h-10 underline underline-offset-2" onClick={()=>act(item)}>{item.action.label}</button>}<button className="min-h-10 text-slate-300 underline underline-offset-2" onClick={()=>acknowledgePersistentNotice(item.key)}>Mark reviewed</button></div></div></div></article>})}</section>}
   <div className="space-y-2" aria-label="New notifications">{currentToasts.map(item=>{const Icon=icon(item.severity);return <article key={item.key} role={item.severity==='error'?'alert':'status'} aria-live={item.severity==='error'?'assertive':'polite'} className={`rounded-xl border p-3 text-sm shadow-xl motion-safe:animate-in motion-safe:fade-in ${color[item.severity]}`} onMouseEnter={()=>{const timer=timers.get(item.key);if(timer)clearTimeout(timer)}} onMouseLeave={()=>{if(item.severity!=='success')timers.set(item.key,setTimeout(()=>removeToast(item.key),item.durationMs??5500))}} onFocusCapture={()=>{const timer=timers.get(item.key);if(timer)clearTimeout(timer)}} onBlurCapture={()=>{if(item.severity!=='success')timers.set(item.key,setTimeout(()=>removeToast(item.key),item.durationMs??5500))}}><div className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0"/><div className="min-w-0 flex-1"><b>{item.title}</b>{item.message&&<p className="mt-1 text-slate-200">{item.message}</p>}{item.action&&<button className="mt-2 min-h-10 underline underline-offset-2" onClick={()=>act(item)}>{item.action.label}</button>}</div><button className="min-h-10 min-w-10 rounded-lg text-slate-300 hover:bg-white/10" aria-label={`Dismiss ${item.title}`} onClick={()=>dismissOperatorToast(item.key)}><X className="mx-auto h-4 w-4"/></button></div></article>})}</div>
  </div>
 </div>;
}
