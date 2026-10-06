import React,{useEffect,useRef,useState} from 'react';
import {LogOut,RefreshCw,Wifi,WifiOff} from 'lucide-react';
import {BusinessStore} from './BusinessStore';
import type {ApiAuthenticatedDeviceSession} from './apiAuth';
import {WebCatalogView} from './WebCatalogInventory';
import {createApiTransport,synchronizeStore,startAutomaticSync} from './sync';
import {resolveOperationDependencies} from './dependencies';
import {acquireOfflineGrant} from './offlineGrant';
import type {BusinessRecord,WebSession} from './session';
import type {CommandOutcome,TransactionResult} from '../../types/transactions';

const allowedApiCommands=new Set(['product.save','stockItem.save','stockLocation.save','catalog.createWithOpeningStock']);
const button='inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-40';

export function ApiCatalogPilot({auth,store,onSignOut}:{auth:ApiAuthenticatedDeviceSession;store:BusinessStore;onSignOut:()=>void}){
 const [records,setRecords]=useState<BusinessRecord[]>([]);const [queue,setQueue]=useState<TransactionResult[]>([]);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [online,setOnline]=useState(()=>navigator.onLine);const [syncing,setSyncing]=useState(false);
 const currentStore=useRef(store);currentStore.current=store;const transport=useRef(createApiTransport(auth.client));
 const session:WebSession={businessId:auth.profile.businessId,actorId:auth.profile.staffId,enabled:true,permissions:auth.profile.permissions,policyVersion:'api-catalog-v1',lifecycleStage:'LIVE'};
 const refresh=async()=>{const [nextRecords,entries]=await Promise.all([currentStore.current.records(),currentStore.current.queue()]);setRecords(nextRecords as BusinessRecord[]);setQueue(entries.flatMap(entry=>entry.result?[entry.result]:[]))};
 const sync=async()=>{setSyncing(true);try{await synchronizeStore(currentStore.current,transport.current);await refresh();setError('')}catch(cause){setError(cause instanceof Error?cause.message:'Synchronization is pending.');await refresh();throw cause}finally{setSyncing(false)}};
 useEffect(()=>{let stopped=false;let automatic:ReturnType<typeof startAutomaticSync>|undefined;void(async()=>{try{await refresh();automatic=startAutomaticSync(async()=>{if(!stopped)await sync()},cause=>{if(!stopped)setError(cause instanceof Error?cause.message:'Synchronization failed.')});}catch(cause){if(!stopped)setError(cause instanceof Error?cause.message:'Catalog could not be loaded.')}})();const onOnline=()=>setOnline(true);const onOffline=()=>setOnline(false);window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);return()=>{stopped=true;automatic?.stop();window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline)}},[]);
 const command=async(operation:string,collection:string,id:string,payload:Record<string,unknown>):Promise<CommandOutcome>=>{
  if(!allowedApiCommands.has(operation))return {kind:'BLOCKED',message:`${operation} is not on the API pilot yet. No change was queued.`};
  if(busy)return {kind:'BLOCKED',message:'Another catalog command is being submitted.'};setBusy(true);
  try{
   const baselines=resolveOperationDependencies(operation,collection,id,payload,records).map(item=>({...item}));
   const target=baselines.find(item=>item.collection===collection&&item.id===id);if(!target)baselines.push({collection,id,version:records.find(row=>row.collection===collection&&row.id===id)?.version||0});
   const queued=await store.enqueue(operation,payload,baselines);if(navigator.onLine)await sync();else await refresh();
   const entry=(await store.queue()).find(item=>item.id===queued.id);const outcome=entry?.result;
   if(outcome?.status==='SYNCHRONIZED')return {kind:'CONFIRMED',commandId:queued.id};
   if(outcome?.status==='CONFLICT')return {kind:'CONFLICT',commandId:queued.id,message:outcome.error?.message||'Refresh this record and review the change.'};
   if(outcome?.status==='REJECTED')return {kind:'REJECTED',commandId:queued.id,message:outcome.error?.message||'The API rejected this change.'};
   if(entry?.state==='OUTCOME_UNKNOWN')return {kind:'OUTCOME_UNKNOWN',commandId:queued.id,message:'The API response is still being recovered. Synchronize before submitting another change.'};
   return {kind:'PENDING',commandId:queued.id};
  }catch(cause){const message=cause instanceof Error?cause.message:'The catalog command could not be submitted.';setError(message);return {kind:'BLOCKED',message}}finally{setBusy(false);await refresh()}
 };
 const grantOffline=async()=>{setBusy(true);setError('');try{const publicJwk=import.meta.env.VITE_API_OFFLINE_GRANT_PUBLIC_JWK;if(!publicJwk)throw new Error('This PWA release has no trusted offline-grant verification key configured.');const keys=JSON.parse(publicJwk) as Record<string,JsonWebKey>;await acquireOfflineGrant(auth.client,store,keys,{maxCommands:10,durationMinutes:60});setNotice('A one-hour catalog grant is active on this device, with a limit of 10 commands.');}catch(cause){setError(cause instanceof Error?cause.message:'Offline grant was not saved.')}finally{setBusy(false)}};
 return <div className="min-h-screen bg-slate-950 text-slate-100"><header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-4"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-400">ServOS API pilot</p><h1 className="text-lg font-black">Catalog operations</h1><p className="text-xs text-slate-400">{auth.profile.displayName} · API authority · {online?<><Wifi className="inline h-3 w-3"/> Online</>:<><WifiOff className="inline h-3 w-3"/> Offline</>}</p></div><div className="flex gap-2"><button className={button} disabled={busy||syncing} onClick={()=>void sync()}><RefreshCw className="h-4 w-4"/>Synchronize</button><button className={button} disabled={busy||!online||(!auth.profile.permissions.includes('*')&&!auth.profile.permissions.includes('catalog.manage'))} onClick={()=>void grantOffline()}>Enable offline catalog</button><button className={button} onClick={onSignOut}><LogOut className="h-4 w-4"/>Sign out</button></div></div></header><main className="mx-auto max-w-[1500px] space-y-3 p-4 sm:p-6"><div role="status" className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-100">This pilot currently supports product, stock master, and stock location saves. POS, inventory movements, archives, procurement, finance, and hospitality remain on their current runtime.</div>{notice&&<p role="status" className="rounded-lg bg-emerald-950/40 p-3 text-sm text-emerald-100">{notice}</p>}{error&&<p role="alert" className="rounded-lg bg-rose-950/50 p-3 text-sm text-rose-100">{error}</p>}{queue.some(item=>item.status==='OUTCOME_UNKNOWN')&&<p role="alert" className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-100">A command outcome is unknown. Synchronize to recover its durable API status before retrying.</p>}<WebCatalogView records={records} session={session} disabled={busy||syncing} command={command}/></main></div>;
}
