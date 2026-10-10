import {operatorError} from './operatorError';
import React,{useEffect,useRef,useState} from 'react';
import type {QueuedCommand} from './BusinessStore';
import {allowed,type BusinessRecord,type WebSession} from './session';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {parseMoneyToMinor} from '../../utils/fiscal';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
type Editor={kind:'OPEN'|'CASH'|'CLOSE'|'REVIEW';id:string;version:number;outlet?:BusinessRecord;policyVersion:number};
const money=(value:unknown)=>(Number(value||0)/100).toLocaleString('en-KE',{style:'currency',currency:'KES'});
export function WebApiTillPanel({records,session,deviceId,outletId,disabled,command,queue}:{records:BusinessRecord[];session:WebSession;deviceId:string;outletId:string;disabled:boolean;command:Command;queue:QueuedCommand[]}){
 const [editor,setEditor]=useState<Editor|null>(null),[amount,setAmount]=useState(''),[direction,setDirection]=useState('PAID_IN'),[reason,setReason]=useState(''),[approvalToken,setApprovalToken]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pendingId,setPendingId]=useState('');
 const inFlight=useRef(false);
 const tills=records.filter(row=>row.collection==='tillSessions');
 const outlet=records.find(row=>row.collection==='outlets'&&row.id===outletId&&!row.archived);
 const own=tills.find(row=>row.data.operatorId===session.actorId&&row.data.deviceId===deviceId&&row.data.outletId===outletId&&row.data.status!=='CLOSED');
 const otherOwn=tills.find(row=>row.data.operatorId===session.actorId&&row.data.status!=='CLOSED'&&row.id!==own?.id);
 useEffect(()=>{if(!pendingId)return;const saved=queue.find(row=>row.id===pendingId);if(!saved||['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(saved.state))return;setPendingId('');if(saved.state==='SYNCHRONIZED'){setEditor(null);setMessage('The original till action confirmed after recovery.');}else setMessage(saved.result?.error?.message||'The till action did not confirm. Reopen the review using current till information.');},[queue,pendingId]);
 const begin=(kind:Editor['kind'],till?:BusinessRecord)=>{
  if(disabled||busy||pendingId)return;
  if(window.document.querySelector('[role="dialog"]')){setMessage('Finish the open review before starting another till action.');return;}
  setEditor({kind,id:till?.id||crypto.randomUUID(),version:till?.version??0,outlet:records.find(row=>row.collection==='outlets'&&row.id===outletId&&!row.archived),policyVersion:records.find(row=>row.collection==='tillPolicy'&&row.id===session.businessId)?.version??0});setAmount('');setDirection('PAID_IN');setReason('');setApprovalToken('');setMessage('');
 };
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!editor||disabled||inFlight.current||pendingId)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   let operation:string,payload:Record<string,unknown>;
   const versions=[{collection:'tillSessions',id:editor.id,version:editor.version}];
   if(editor.kind==='OPEN'){
    if(!editor.outlet)throw new Error('Choose an active outlet.');operation='till.open';payload={id:editor.id,outletId:editor.outlet.id,openingFloatMinor:parseMoneyToMinor(amount),expectedVersions:[...versions,{collection:'outlets',id:editor.outlet.id,version:editor.outlet.version},{collection:'tillPolicy',id:session.businessId,version:editor.policyVersion}]};
   }else if(editor.kind==='CASH'){operation='till.cashMovement';payload={tillSessionId:editor.id,direction,amountMinor:parseMoneyToMinor(amount),reason:reason.trim(),expectedVersions:versions};}
   else if(editor.kind==='CLOSE'){operation='till.close';payload={id:editor.id,countedCashMinor:parseMoneyToMinor(amount),varianceReason:reason.trim(),expectedVersions:versions};}
   else{operation='till.reviewVariance';payload={id:editor.id,reason:reason.trim(),...(approvalToken.trim()?{approvalToken:approvalToken.trim()}:{}),expectedVersions:versions};}
   const outcome=await command(operation,'tillSessions',editor.id,payload);
   if(isCommandConfirmed(outcome)){setEditor(null);setMessage('Till action confirmed.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPendingId(outcome.commandId);setMessage('message' in outcome?outcome.message:'The original till action is saved. Recover its outcome in Activity before another action.');}
  }catch(error){setMessage(operatorError(error))}finally{inFlight.current=false;setBusy(false)}
 };
 const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40',field='mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2';
 return <section className="space-y-3 rounded-xl border border-slate-700 p-3">
   <h3 className="font-bold">Shift</h3><p className="text-sm text-slate-400">Outlet: {String(outlet?.data.name||'Choose an outlet')}</p>
   {own?<><p className="text-sm">{String(own.data.status)} · Opening float {money(own.data.openingFloatMinor)}</p>{own.data.status==='OPEN'&&<div className="flex flex-wrap gap-2">{allowed(session,'till.cashMovement')&&<button className={button} disabled={disabled||busy||Boolean(pendingId)||Boolean(editor)} onClick={()=>begin('CASH',own)}>Cash in / out</button>}{allowed(session,'till.close')&&<button className={button} disabled={disabled||busy||Boolean(pendingId)||Boolean(editor)} onClick={()=>begin('CLOSE',own)}>Count and close shift</button>}</div>}</>:otherOwn?<p className="text-sm text-amber-200">Your active shift belongs to another outlet or device. Resolve it before starting another shift.</p>:<button className={button} disabled={disabled||busy||Boolean(pendingId)||!outletId||!allowed(session,'till.open')} onClick={()=>begin('OPEN')}>Start shift</button>}
  {tills.filter(row=>row.data.outletId===outletId&&row.data.status==='REVIEW_REQUIRED').map(row=><div key={row.id} className="rounded border border-amber-700 p-3 text-sm"><p>Counted {money(row.data.countedCashMinor)} · Expected {money(row.data.expectedCashMinor)} · Variance {money(row.data.varianceMinor)}</p><p>{String(row.data.varianceReason||'')}</p>{(allowed(session,'till.override_variance')||allowed(session,'till.view'))&&<button className={`${button} mt-2`} disabled={disabled||busy||Boolean(pendingId)||Boolean(editor)} onClick={()=>begin('REVIEW',row)}>Review variance</button>}</div>)}
  {editor&&<form role="dialog" aria-label="Review till action" onSubmit={event=>void save(event)} className="space-y-3 rounded border border-amber-700 p-3">
    <h4 className="font-bold">{editor.kind==='OPEN'?'Start shift':editor.kind==='CASH'?'Record cash movement':editor.kind==='CLOSE'?'Count cash and close shift':'Manager variance review'}</h4>
    {editor.kind==='OPEN'&&<p className="text-sm text-slate-400">Starting shift at {String(editor.outlet?.data.name||'the selected outlet')}.</p>}
    {editor.kind==='CASH'&&<label className="block text-sm">Direction<select className={field} value={direction} disabled={busy||Boolean(pendingId)} onChange={event=>setDirection(event.target.value)}><option value="PAID_IN">Paid in</option><option value="PAID_OUT">Paid out</option></select></label>}
    {editor.kind!=='REVIEW'&&<label className="block text-sm">{editor.kind==='OPEN'?'Opening float (KES)':editor.kind==='CLOSE'?'Counted drawer cash (KES)':'Amount (KES)'}<input required type="number" min={editor.kind==='CASH'?'0.01':'0'} step="0.01" className={field} value={amount} disabled={busy||Boolean(pendingId)} onChange={event=>setAmount(event.target.value)}/></label>}
    {editor.kind==='CLOSE'&&<p className="text-sm text-slate-400">Count the physical drawer first. Expected cash and any variance are shown after you submit the count.</p>}
   {editor.kind!=='OPEN'&&<label className="block text-sm">{editor.kind==='CLOSE'?'Count / variance explanation':'Reason'}<textarea required minLength={3} maxLength={500} className={field} value={reason} disabled={busy||Boolean(pendingId)} onChange={event=>setReason(event.target.value)}/></label>}
   {editor.kind==='REVIEW'&&!allowed(session,'till.override_variance')&&<label className="block text-sm">Single-use manager approval token<input required autoComplete="off" className={field} value={approvalToken} disabled={busy||Boolean(pendingId)} onChange={event=>setApprovalToken(event.target.value)}/></label>}
    <button className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" disabled={disabled||busy||Boolean(pendingId)}>{editor.kind==='OPEN'?'Start shift':editor.kind==='CLOSE'?'Submit cash count':'Confirm'}</button><button type="button" className={`${button} ml-2`} disabled={busy} onClick={()=>setEditor(null)}>Close review</button>
  </form>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
