import React,{useState} from 'react';
import type {WebDeviceIdentity} from './deviceIdentity';
import {readBridgePreference,saveBridgePreference} from './printBridgePreferences';
export function WebBridgeSettings({businessId,identity,disabled}:{businessId:string;identity:WebDeviceIdentity;disabled:boolean}){
 const [saved]=useState(()=>{try{return readBridgePreference(businessId,identity.deviceId);}catch{return undefined;}});
 const [bridgeId,setBridgeId]=useState(saved?.bridgeId||''),[origin,setOrigin]=useState(saved?.origin||'https://localhost:9443'),[approved,setApproved]=useState(false),[message,setMessage]=useState('');
 return <section aria-label="Local Print Bridge selection" className="space-y-3 rounded-xl border border-slate-700 p-4">
  <h3 className="font-bold">Local Print Bridge</h3>
  <p className="text-sm text-slate-400">Use the identity and trusted HTTPS address supplied by the bridge installer. Local selection does not approve this device on the bridge.</p>
  <label className="block text-sm">Installed bridge ID<input className="mt-1 w-full rounded bg-slate-950 p-2" value={bridgeId} disabled={disabled} onChange={event=>{setBridgeId(event.target.value);setApproved(false);}}/></label>
  <label className="block text-sm">Installed HTTPS origin<input className="mt-1 w-full rounded bg-slate-950 p-2" value={origin} disabled={disabled} onChange={event=>{setOrigin(event.target.value);setApproved(false);}}/></label>
  <label className="block text-sm"><input type="checkbox" checked={approved} disabled={disabled} onChange={event=>setApproved(event.target.checked)}/> I verified this installed bridge and its device approval locally</label>
  <button type="button" disabled={disabled||!approved} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40" onClick={()=>{try{saveBridgePreference({bridgeId:bridgeId.trim(),businessId,origin:origin.trim()},identity.deviceId);setMessage('Bridge selected for this browser device. No print request was sent.');}catch(error){setMessage(error instanceof Error?error.message:'Cannot save bridge selection.');}}}>Save local bridge selection</button>
  <details><summary className="cursor-pointer text-sm">Public device identity for local approval</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({businessId,deviceId:identity.deviceId,origin:window.location.origin,publicKey:identity.publicKey},null,2)}</pre></details>
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
