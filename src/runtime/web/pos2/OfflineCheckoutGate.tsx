import React,{useEffect,useState} from 'react';
import {BusinessStore} from '../BusinessStore';
import type {OfflineCashLease} from '../offlineCashLedger';
import {offlinePublicKey} from './OfflineCashSetup';
import {LocalCashActivity} from './LocalCashActivity';
import {CashierWorkspace} from './CashierWorkspace';
import type {BusinessRecord} from '../session';
import {resumeApiDeviceSession,openApiBusinessStore,type ApiAuthenticatedDeviceSession} from '../apiAuth';
import {findApiWebDeviceIdentity} from '../deviceIdentity';
import {operatorError} from '../operatorError';
import {inspectBrowserCapabilities} from '../browserCapabilities';
export function OfflineCheckoutGate({apiOrigin,onOnline,onBack}:{apiOrigin:string;onOnline:(session:ApiAuthenticatedDeviceSession,store:BusinessStore)=>void;onBack:()=>void}){
 const [pin,setPin]=useState(''),[store,setStore]=useState<BusinessStore|null>(null),[lease,setLease]=useState<OfflineCashLease|null>(null),[records,setRecords]=useState<BusinessRecord[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[activity,setActivity]=useState(false),[sales,setSales]=useState<Array<Record<string,unknown>>>([]);
 useEffect(()=>()=>store?.close(),[store]);
 useEffect(()=>{if(!store||!lease)return;let stopped=false,running=false;const reconnect=async()=>{if(stopped||running)return;running=true;try{const session=await resumeApiDeviceSession({apiOrigin});if(session){const opened=await openApiBusinessStore(session);if(stopped){opened.close();return;}onOnline(session,opened);}}catch{/* Local cash evidence stays available while the API cannot authenticate. */}finally{running=false;}};const timer=window.setInterval(()=>void reconnect(),15000);window.addEventListener('online',reconnect);return()=>{stopped=true;clearInterval(timer);window.removeEventListener('online',reconnect);};},[store,lease,apiOrigin,onOnline]);
 const unlock=async()=>{if(busy)return;setBusy(true);let opened:BusinessStore|undefined;try{
  if((await inspectBrowserCapabilities()).mode!=='Full')throw Error('This browser cannot safely reopen offline checkout. Update it and preserve its browser profile.');
  const locator=JSON.parse(localStorage.getItem('servos:offline-checkout')||'null');if(!locator?.businessId||!locator?.staffId||!locator?.deviceId)throw Error('Provision this browser online before using offline checkout.');
  const identity=await findApiWebDeviceIdentity(locator.businessId,locator.staffId,locator.deviceId);if(!identity)throw Error('The enrolled device identity is unavailable. Reconnect without clearing browser data.');
  opened=await BusinessStore.open(locator.businessId,locator.deviceId,locator.staffId);const cached=await opened.reopenOfflineIdentity(pin,offlinePublicKey());
  const catalog=await opened.records();if(!catalog.some(row=>row.collection==='products')||!catalog.some(row=>row.collection==='tillSessions'&&row.id===cached.lease.tillSessionId&&row.data.status==='OPEN'))throw Error('The catalogue and open shift were not provisioned. Reconnect.');
  setRecords(catalog);setLease(cached.lease);setStore(opened);opened=undefined;setPin('');setMessage('Offline cashier unlocked. Cash remains provisional until reconciliation.');
 }catch(error){opened?.close();setMessage(operatorError(error));}finally{setBusy(false);}};
 if(store&&lease){const session={businessId:lease.businessId,actorId:lease.staffId,enabled:true,permissions:lease.permissions,policyVersion:'offline-v2',capabilities:{'pos2.simpleCashier':true,'pos2.offlineCash':true,'pos2.offlineAuthV2':true}};return <main className="min-h-screen bg-slate-950 p-4 text-white"><button className="min-h-11 border px-3" onClick={onBack}>Lock checkout</button><p role="status">{message}</p>{activity?<section><button className="min-h-11 border px-3" onClick={()=>setActivity(false)}>Back to products</button><LocalCashActivity store={store}/></section>:<CashierWorkspace store={store} records={records} session={session} deviceId={lease.deviceId} queue={[]} disabled={false} command={async()=>({kind:'BLOCKED',message:'Reconnect for this server-only action. Local cash checkout remains available.'})} readRecords={()=>store.records()} initialOfflineLease={lease} onMore={()=>{void store.localCashSales().then(next=>{setSales(next);setActivity(true);});}}/>}</main>;}
 return <main className="mx-auto max-w-md space-y-4 p-6"><h1>Unlock provisioned offline checkout</h1><p>Use the kiosk PIN for this enrolled browser and shift. A new browser must sign in online.</p><label>Kiosk PIN<input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={event=>setPin(event.target.value)}/></label><button className="min-h-11 border px-3" disabled={busy} onClick={()=>void unlock()}>Unlock checkout</button><button className="min-h-11 border px-3" onClick={onBack}>Back to sign in</button>{message&&<p role="alert">{message}</p>}</main>;
}
