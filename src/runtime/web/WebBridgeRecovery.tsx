import type {ApiAuthenticatedDeviceSession} from './apiAuth';
import type {BusinessRecord} from './session';
import type {CommandOutcome} from '../../types/transactions';
import {reconcileBridgeDelivery} from './printBridgeReconciliation';
import React,{useEffect,useRef,useState} from 'react';
import type {WebDeviceIdentity} from './deviceIdentity';
import {listDeviceBridgeEvidence,recoverBridgeRequest,sendBridgeAction,type BridgeRequestEvidence} from './printBridgeTransport';
import type {BridgeResponse} from './printBridgeResponses';
function unwrap(response:BridgeResponse|undefined):BridgeResponse|undefined{
 let value=response;for(let i=0;i<5&&value?.state==='COMPLETED';i++)value=value.response;return value;
}
function localId(response:BridgeResponse|undefined):string|undefined{
 const value=unwrap(response);
 if(value?.state==='RECORDED'||value?.state==='STATUS')return value.delivery?.jobId;
 if(value?.state==='RECONCILIATION_REQUIRED')return value.attempt?.localJobId;
}
function summary(response:BridgeResponse|undefined):string{
 const value=unwrap(response);
 if(!value)return 'Outcome unresolved';
 if(value.state==='RECORDED'||value.state==='STATUS')return value.delivery?`${value.delivery.state}: ${value.delivery.detail}`:'No local delivery record found';
 if(value.state==='RECONCILIATION_REQUIRED')return 'Review required. Do not reprint until delivery evidence is reconciled.';
 if(value.state==='NOT_FOUND')return 'Request not found on this bridge. Confirm bridge identity and retained evidence before retry.';
 if(value.state==='REFUSED')return value.message;
 return 'Review original request evidence';
}
export function WebBridgeRecovery({businessId,identity,disabled,reporting}:{businessId:string;identity:WebDeviceIdentity;disabled:boolean;reporting?:{auth:ApiAuthenticatedDeviceSession;readRecords:()=>Promise<BusinessRecord[]>;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>}}){
 const [rows,setRows]=useState<BridgeRequestEvidence[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [observations,setObservations]=useState<Record<string,BridgeResponse>>({});const inFlight=useRef(false);
 useEffect(()=>{let active=true;setRows([]);setObservations({});void listDeviceBridgeEvidence(businessId,identity).then(value=>{if(active)setRows(value);}).catch(()=>{if(active)setMessage('Cannot open print recovery evidence. Preserve browser storage.');});return()=>{active=false;};},[businessId,identity]);
 const check=async(row:BridgeRequestEvidence,delivery:boolean)=>{
  if(inFlight.current||disabled)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const bridge={bridgeId:row.bridgeId,businessId:row.businessId,origin:row.bridgeOrigin};
   const id=localId(observations[row.requestId]||row.response);
   const result=delivery&&id?await sendBridgeAction(bridge,identity,{action:'STATUS',jobId:id}):await recoverBridgeRequest(bridge,identity,row.requestId);
   if(result.response)setObservations(current=>({...current,[row.requestId]:result.response!}));
  }catch(error){setMessage(error instanceof Error?error.message:'Recovery lookup failed. Preserve the original request.');}
  finally{inFlight.current=false;setBusy(false);}
 };
 const report=async(row:BridgeRequestEvidence)=>{
  if(!reporting||inFlight.current||disabled)return;inFlight.current=true;setBusy(true);setMessage('');
  try{const outcome=await reconcileBridgeDelivery({...reporting,evidence:row});setMessage(outcome.kind==='CONFIRMED'?'Recovered transport outcome recorded in the API. Check paper delivery before confirmation or retry.':'message' in outcome?outcome.message:'Recover the original report command in Activity before reporting again.');}
  catch(error){setMessage(error instanceof Error?error.message:'Cannot reconcile this print attempt.');}
  finally{inFlight.current=false;setBusy(false);}
 };
 const submissions=rows.filter(row=>row.action==='SUBMIT');
 return <section className="space-y-3 rounded-xl border border-slate-700 p-4" aria-label="Print Bridge recovery">
  <h3 className="font-bold">Print Bridge recovery</h3>
  <p className="text-sm text-slate-400">Check retained requests after a lost response or restart. Transport acceptance does not confirm paper delivery. These controls never reprint.</p>
  {!submissions.length&&<p className="text-sm">No retained bridge submissions for this enrolled device.</p>}
  {submissions.slice(0,100).map(row=>{const response=observations[row.requestId]||row.response;return <article className="space-y-2 rounded border border-slate-700 p-3" key={row.requestId}>
   <p className="break-all text-sm">Request {row.requestId}</p><p className="break-all text-xs text-slate-400">{row.bridgeOrigin} ? {row.createdAt}</p>
   <p className="text-sm" role="status">{summary(response)}</p>
   <div className="flex flex-wrap gap-2"><button type="button" className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40" disabled={disabled||busy} onClick={()=>void check(row,false)}>Recover original request</button>
   {localId(response)&&<button type="button" className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40" disabled={disabled||busy} onClick={()=>void check(row,true)}>Check current delivery</button>}{reporting&&row.apiAttempt&&<button type="button" className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40" disabled={disabled||busy} onClick={()=>void report(row)}>Record recovered outcome in API</button>}</div>
  </article>;})}
  {message&&<p role="alert" className="break-words text-sm text-amber-200">{message}</p>}
 </section>;
}
