import React,{useState} from 'react';
import type {WebApiPosProps} from '../WebApiPosView';
import {verifyCashLease,type OfflineCashLease} from '../offlineCashLedger';
import {operatorError} from '../operatorError';
import {parseMoneyToMinor} from '../../../utils/fiscal.js';
import {inspectBrowserCapabilities} from '../browserCapabilities';
export function offlinePublicKey():JsonWebKey {const key=JSON.parse(String(import.meta.env.VITE_API_OFFLINE_GRANT_PUBLIC_JWK||'null'));if(!key||key.d)throw Error('The public offline verification key is not configured.');return key;}
export function OfflineCashSetup({store,session,apiAuth,outletId,tillId,onUnlocked,onStopped}:{store:WebApiPosProps['store'];session:WebApiPosProps['session'];apiAuth:WebApiPosProps['apiAuth'];outletId:string;tillId?:string;onUnlocked:(lease:OfflineCashLease)=>void;onStopped:()=>void}){
 const [count,setCount]=useState(''),[countReason,setCountReason]=useState('');
 const [pin,setPin]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const run=async(provision:boolean)=>{if(busy)return;setBusy(true);setMessage('');try{
  if((await inspectBrowserCapabilities()).mode!=='Full')throw Error('This browser is restricted to online use. Update to a supported browser before offline checkout.');
  const publicKey=offlinePublicKey();
  if(provision){
   if(!apiAuth||!tillId)throw Error('Sign in online and open the enrolled cashier shift first.');
   const id=crypto.randomUUID(),outcome=await apiAuth.client.submitCommand({commandId:id,name:'pos.offlineCapability.issue',payload:{outletId,tillSessionId:tillId,deviceLabel:'POS01',durationMinutes:240},expectedVersions:{}});
   if(outcome.kind!=='CONFIRMED')throw Error(outcome.error?.message||'Capability was not issued.');
   const lease=outcome.result as OfflineCashLease;if(!(await verifyCashLease(lease,publicKey,{businessId:session.businessId,deviceId:store.deviceId,staffId:session.actorId})))throw Error('Issued capability could not be verified.');
   await navigator.storage.persist();await store.provisionOfflineIdentity(pin,lease,publicKey,'Cashier');
   localStorage.setItem('servos:offline-checkout',JSON.stringify({businessId:session.businessId,staffId:session.actorId,deviceId:store.deviceId}));onUnlocked(lease);setMessage('Checkout capability provisioned for this shift.');
  }else{const identity=await store.reopenOfflineIdentity(pin,publicKey);onUnlocked(identity.lease);setMessage('Offline checkout unlocked until its capability expires.');}
  setPin('');
 }catch(error){setMessage(operatorError(error));}finally{setBusy(false);}};
 const stop=async()=>{if(busy||!apiAuth||!tillId)return;setBusy(true);setMessage('');try{
  const sales=(await store.stopOfflineCashCreation()).filter(sale=>sale.tillSessionId===tillId);onStopped();
  if(sales.some(sale=>sale.state!=='SERVER_CONFIRMED'))throw Error('Offline creation stopped. Synchronize or reconcile every local cash sale in Activity, then retry ending this capability.');
  const outcome=await apiAuth.client.submitCommand({commandId:crypto.randomUUID(),name:'pos.offlineCapability.finish',payload:{tillSessionId:tillId,saleIds:sales.map(sale=>sale.id)},expectedVersions:{}});
  if(outcome.kind!=='CONFIRMED')throw Error(outcome.error?.message||'Capability ending was not confirmed. Retry after recovering its outcome.');
  setMessage('Offline capability ended with the complete confirmed ledger. The shift may now be closed using its ordinary reconciliation.');
 }catch(error){setMessage(operatorError(error));}finally{setBusy(false);}};
 const countCash=async()=>{if(!tillId||busy)return;setBusy(true);try{const minor=parseMoneyToMinor(count);if(minor===null)throw Error('Enter a cash amount.');const evidence=await store.recordLocalShiftCount(tillId,minor,countReason);setMessage(`Physical cash count saved locally; ${evidence.pendingSaleIds.length} original sales still pending. This does not close or confirm the central shift.`);}catch(error){setMessage(operatorError(error));}finally{setBusy(false);}};
 return <details className="rounded border p-2"><summary>Offline checkout security</summary><label>Kiosk PIN<input type="password" inputMode="numeric" autoComplete="off" minLength={6} maxLength={12} value={pin} onChange={event=>setPin(event.target.value)}/></label><button className="min-h-11 border px-3" disabled={busy||!/^\d{6,12}$/.test(pin)} onClick={()=>void run(false)}>Unlock cached shift</button>{apiAuth&&<button className="min-h-11 border px-3" disabled={busy||!navigator.onLine||!/^\d{6,12}$/.test(pin)} onClick={()=>void run(true)}>Provision four-hour shift online</button>}{apiAuth&&tillId&&<button className="min-h-11 border px-3" disabled={busy||!navigator.onLine} onClick={()=>void stop()}>Stop offline creation / end capability</button>}{tillId&&<fieldset><legend>Local physical cash count</legend><label>Counted cash KES<input inputMode="decimal" value={count} onChange={event=>setCount(event.target.value)}/></label><label>Count reason<input maxLength={500} value={countReason} onChange={event=>setCountReason(event.target.value)}/></label><button className="min-h-11 border px-3" disabled={busy} onClick={()=>void countCash()}>Save provisional shift count</button></fieldset>}{message&&<p role="status">{message}</p>}</details>;
}
