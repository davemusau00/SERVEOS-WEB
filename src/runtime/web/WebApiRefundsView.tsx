import React,{useEffect,useRef,useState} from 'react';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {QueuedCommand} from './BusinessStore';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {parseMoneyToMinor} from '../../utils/fiscal';

type Review={payment:BusinessRecord;order:BusinessRecord;till:BusinessRecord};
type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const money=(value:unknown)=>(Number(value||0)/100).toLocaleString('en-KE',{style:'currency',currency:'KES'});
const version=(row:BusinessRecord)=>({collection:row.collection,id:row.id,version:row.version});
export function WebApiRefundsView({records,session,deviceId,disabled,command,queue}:{records:BusinessRecord[];session:WebSession;deviceId:string;disabled:boolean;command:Command;queue:QueuedCommand[]}){
 const [review,setReview]=useState<Review|null>(null),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[reference,setReference]=useState(''),[returned,setReturned]=useState(false),[externalConfirmed,setExternalConfirmed]=useState(false),[reverse,setReverse]=useState(false),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[pendingId,setPendingId]=useState('');
 const inFlight=useRef(false);
 const payments=records.filter(row=>row.collection==='payments'&&!row.archived);
 const refunds=records.filter(row=>row.collection==='refunds'&&!row.archived);
 const canRefund=allowed(session,'order.refund'),canReverse=allowed(session,'payment.reverse');
 useEffect(()=>{if(!pendingId)return;const saved=queue.find(row=>row.id===pendingId);if(!saved||['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(saved.state))return;setPendingId('');if(saved.state==='SYNCHRONIZED'){setReview(null);setMessage('The original return confirmed after recovery. Its document is available in Activity.');}else setMessage(saved.result?.error?.message||'The return did not confirm. Reopen its review using current refundable amounts.');},[queue,pendingId]);
 const begin=(payment:BusinessRecord)=>{
  if(disabled||busy||pendingId)return;
  const order=records.find(row=>row.collection==='orders'&&row.id===payment.data.orderId);
  if(!order){setMessage('Synchronize the original order before reviewing this payment.');return;}
  const till=records.find(row=>row.collection==='tillSessions'&&row.data.status==='OPEN'&&row.data.outletId===order.data.outletId&&row.data.operatorId===session.actorId&&row.data.deviceId===deviceId);
  if(!till){setMessage('Open your till in the original order outlet before returning funds.');return;}
  const remaining=Number(payment.data.amountMinor)-Number(payment.data.refundedAmountMinor||0);
  if(remaining<=0){setMessage('This payment has no remaining refundable amount.');return;}
  setReview({payment,order,till});setAmount((remaining/100).toFixed(2));setReverse(!canRefund&&canReverse);setReason('');setReference('');setReturned(false);setExternalConfirmed(false);setMessage('');
 };
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!review||disabled||inFlight.current||pendingId)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   if(!returned)throw new Error('Confirm that the funds were actually returned.');
   const remaining=Number(review.payment.data.amountMinor)-Number(review.payment.data.refundedAmountMinor||0),amountMinor=reverse?remaining:parseMoneyToMinor(amount);
   if(amountMinor<=0||amountMinor>remaining)throw new Error('Enter a return within the remaining refundable amount.');
   const cash=review.payment.data.method==='CASH';
   if(!cash&&(!externalConfirmed||!reference.trim()))throw new Error('Manually verify the external return and record its reference.');
   const operation=reverse?'payment.reverse':'payment.refund';
   const outcome=await command(operation,'payments',review.payment.id,{paymentId:review.payment.id,tillSessionId:review.till.id,...(reverse?{}:{amountMinor}),reason:reason.trim(),operatorConfirmedReturned:true,...(!cash?{externalReference:reference.trim(),manuallyConfirmed:true}:{}),expectedVersions:[version(review.payment),version(review.order),version(review.till)]});
   if(isCommandConfirmed(outcome)){setReview(null);setMessage('Return confirmed. Its issued document and printing are in Activity.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPendingId(outcome.commandId);setMessage('message' in outcome?outcome.message:'The original return is saved. Recover its outcome in Activity before recording another return.');}
  }catch(error){setMessage(error instanceof Error?error.message:String(error))}finally{inFlight.current=false;setBusy(false)}
 };
 const field='mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2',button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
 return <section className="space-y-4">
  <h2 className="text-xl font-bold">Refunds and payment reversals</h2>
  <p className="text-sm text-slate-400">Review the original payment and the actual funds returned. Handle any physical stock return separately.</p>
  <label className="block text-sm">Find payment<input className={field} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Order, payment ID or reference"/></label>
  <div className="space-y-2">{payments.filter(row=>`${row.id} ${row.data.reference||''} ${records.find(order=>order.collection==='orders'&&order.id===row.data.orderId)?.data.name||''}`.toLowerCase().includes(query.toLowerCase())).map(row=>{
   const order=records.find(item=>item.collection==='orders'&&item.id===row.data.orderId),remaining=Number(row.data.amountMinor)-Number(row.data.refundedAmountMinor||0);
   return <article key={row.id} className="rounded-xl border border-slate-700 p-3"><b>{String(order?.data.name||row.data.orderId)} · {String(row.data.method)}</b><p className="text-sm">Received {money(row.data.amountMinor)} · Returned {money(row.data.refundedAmountMinor)} · Remaining {money(remaining)}</p><p className="text-xs text-slate-400">Payment {row.id}{row.data.reference?` · ${String(row.data.reference)}`:''}</p><button className={`${button} mt-2`} disabled={disabled||busy||Boolean(pendingId)||Boolean(review)||remaining<=0||!canRefund&&!canReverse} onClick={()=>begin(row)}>Review return</button></article>;
  })}</div>
  {review&&<form role="dialog" aria-label="Review payment return" className="space-y-3 rounded-xl border border-amber-700 p-4" onSubmit={event=>void save(event)}>
   <h3 className="font-bold">{String(review.order.data.name)} · {String(review.payment.data.method)}</h3>
   {canRefund&&canReverse&&<label className="block text-sm"><input type="checkbox" disabled={busy||Boolean(pendingId)} checked={reverse} onChange={event=>{setReverse(event.target.checked);setReturned(false);setExternalConfirmed(false)}}/> Reverse the full remaining amount</label>}
   {reverse?<p>Full remaining return: {money(Number(review.payment.data.amountMinor)-Number(review.payment.data.refundedAmountMinor||0))}</p>:<label className="block text-sm">Amount returned (KES)<input required type="number" min="0.01" step="0.01" className={field} disabled={busy||Boolean(pendingId)} value={amount} onChange={event=>{setAmount(event.target.value);setReturned(false);setExternalConfirmed(false)}}/></label>}
   <label className="block text-sm">Reason<textarea required minLength={3} maxLength={500} className={field} disabled={busy||Boolean(pendingId)} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   {review.payment.data.method!=='CASH'&&<><label className="block text-sm">External return reference<input required maxLength={160} className={field} disabled={busy||Boolean(pendingId)} value={reference} onChange={event=>{setReference(event.target.value);setExternalConfirmed(false)}}/></label><label className="block text-sm"><input type="checkbox" disabled={busy||Boolean(pendingId)} checked={externalConfirmed} onChange={event=>setExternalConfirmed(event.target.checked)}/> I manually verified the external funds return</label></>}
   <label className="block text-sm"><input type="checkbox" disabled={busy||Boolean(pendingId)} checked={returned} onChange={event=>setReturned(event.target.checked)}/> I confirm that these funds were actually returned</label>
   <button className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" disabled={disabled||busy||Boolean(pendingId)||!returned||reason.trim().length<3||review.payment.data.method!=='CASH'&&!externalConfirmed}>{reverse?'Confirm full remaining reversal':'Confirm refund'}</button><button type="button" className={`${button} ml-2`} disabled={busy} onClick={()=>setReview(null)}>Close review</button>
  </form>}
  <h3 className="font-bold">Return history</h3><div className="space-y-2">{refunds.map(row=><article key={row.id} className="rounded border border-slate-700 p-3 text-sm"><b>{String(row.data.kind)} · {money(row.data.amountMinor)} · {String(row.data.method)}</b><p>{String(row.data.reason)}</p><p className="text-xs text-slate-400">{String(row.data.occurredAt)} · Original payment {String(row.data.paymentId)}</p></article>)}</div>
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
