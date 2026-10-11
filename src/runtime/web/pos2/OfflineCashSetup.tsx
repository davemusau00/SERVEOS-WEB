import React,{useState} from 'react';
import type {WebApiPosProps} from '../WebApiPosView';
import {verifyCashLease,type OfflineCashLease} from '../offlineCashLedger';
import {operatorError} from '../operatorError';
export function offlinePublicKey():JsonWebKey {const key=JSON.parse(String(import.meta.env.VITE_API_OFFLINE_GRANT_PUBLIC_JWK||'null'));if(!key||key.d)throw Error('The public offline verification key is not configured.');return key;}
export function OfflineCashSetup({store,session,apiAuth,outletId,tillId,onUnlocked}:{store:WebApiPosProps['store'];session:WebApiPosProps['session'];apiAuth:WebApiPosProps['apiAuth'];outletId:string;tillId?:string;onUnlocked:(lease:OfflineCashLease)=>void}){
 const [pin,setPin]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const run=async(provision:boolean)=>{if(busy)return;setBusy(true);setMessage('');try{
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
 return <details className="rounded border p-2"><summary>Offline checkout security</summary><label>Kiosk PIN<input type="password" inputMode="numeric" autoComplete="off" minLength={6} maxLength={12} value={pin} onChange={event=>setPin(event.target.value)}/></label><button className="min-h-11 border px-3" disabled={busy||!/^\d{6,12}$/.test(pin)} onClick={()=>void run(false)}>Unlock cached shift</button>{apiAuth&&<button className="min-h-11 border px-3" disabled={busy||!navigator.onLine||!/^\d{6,12}$/.test(pin)} onClick={()=>void run(true)}>Provision four-hour shift online</button>}{message&&<p role="status">{message}</p>}</details>;
}
