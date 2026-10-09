import React,{useEffect,useRef,useState} from 'react';
import type {BusinessStore} from './BusinessStore';
import {operatorError} from './operatorError';
import {ds} from '../../design-system/tokens';

type Diagnostics=Awaited<ReturnType<BusinessStore['storageDiagnostics']>>;
const size=(bytes:number|null)=>bytes===null?'Unavailable':`${(bytes/1024/1024).toFixed(1)} MB`;

export function WebStorageDiagnostics({store,refreshKey=''}:{store:BusinessStore;refreshKey?:string}){
 const generation=useRef(0);
 const [value,setValue]=useState<Diagnostics|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 useEffect(()=>{let active=true;const id=++generation.current;void store.storageDiagnostics().then(result=>{if(active&&id===generation.current){setValue(result);setError('')}}).catch(cause=>{if(active&&id===generation.current)setError(operatorError(cause))});return()=>{active=false}},[store,refreshKey]);
 const refresh=async(requestPersistence=false)=>{
  const id=++generation.current;setBusy(true);setError('');setMessage('');
  try{
   if(requestPersistence){const granted=await navigator.storage?.persist?.();setMessage(granted?'Browser persistence granted.':'Browser persistence was not granted. Keep pending work synchronized and export recovery evidence.');}
   const result=await store.storageDiagnostics();if(id===generation.current)setValue(result);
  }catch(cause){setError(operatorError(cause))}finally{setBusy(false)}
 };
 return <section className={`${ds.panel} p-4`} aria-label="Browser storage">
  <h3 className="font-bold">Browser storage</h3>
  {value&&<><p className="mt-2 text-sm">Persistence: {value.persisted===null?'Unavailable':value.persisted?'Granted':'Not granted'} · Used: {size(value.usageBytes)} · Estimated quota: {size(value.quotaBytes)}</p>
   <p className="mt-2 text-xs text-slate-400">{value.pendingCommands} pending actions · {value.unknownCommands} unknown outcomes · {value.pendingPrintJobs} pending print jobs · {value.documents} saved documents</p></>}
  <p className="mt-2 text-xs text-slate-400">Storage estimates cover this site. Clearing browser data removes local drafts and pending work. Persistence does not replace a server backup.</p>
  <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={ds.button} disabled={busy} onClick={()=>void refresh()}>Refresh storage status</button><button type="button" className={ds.button} disabled={busy||value?.persisted===true||!navigator.storage?.persist} onClick={()=>void refresh(true)}>Request persistent storage</button></div>
  {message&&<p role="status" className="mt-2 text-sm">{message}</p>}{error&&<p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
 </section>;
}
