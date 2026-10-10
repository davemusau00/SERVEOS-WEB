import {operatorError} from './operatorError';
import React,{useEffect,useRef,useState} from 'react';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {QueuedCommand} from './BusinessStore';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {parseMoneyToMinor} from '../../utils/fiscal';
import {businessDateTimeToUtc} from '../../utils/businessTime';

type Tender={id:string;accountId:string;amount:string;cashTendered:string;reference:string;receivedAmount:string;receivedAt:string;confirmed:boolean};
type Review={order:BusinessRecord;till:BusinessRecord;accounts:BusinessRecord[]};
type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const money=(value:number)=>(value/100).toLocaleString('en-KE',{style:'currency',currency:'KES'});
const draft=(accountId='',amount=''):Tender=>({id:crypto.randomUUID(),accountId,amount,cashTendered:'',reference:'',receivedAmount:'',receivedAt:'',confirmed:false});
const version=(row:BusinessRecord)=>({collection:row.collection,id:row.id,version:row.version});

export function WebApiPaymentPanel({records,order,session,deviceId,disabled,command,queue}:{records:BusinessRecord[];order?:BusinessRecord;session:WebSession;deviceId:string;disabled:boolean;command:Command;queue:QueuedCommand[]}){
 const [review,setReview]=useState<Review|null>(null),[tenders,setTenders]=useState<Tender[]>([]),[busy,setBusy]=useState(false),[pendingId,setPendingId]=useState(''),[message,setMessage]=useState('');
 const inFlight=useRef(false);
 const timeZone=session.propertyContext?.timeZone||'Africa/Nairobi';
 useEffect(()=>{if(!pendingId)return;const saved=queue.find(row=>row.id===pendingId);if(!saved||['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(saved.state))return;setPendingId('');if(saved.state==='SYNCHRONIZED'){setReview(null);setTenders([]);setMessage('The original payment confirmed after recovery. Issued documents are in Activity.');}else setMessage(saved.result?.error?.message||'Payment did not confirm. Reopen the review using the current order balance.');},[queue,pendingId]);
 const open=()=>{
  if(!order||disabled||busy||pendingId)return;
  if(window.document.querySelector('[role="dialog"]')){setMessage('Finish the open review before recording payment.');return;}
  const till=records.find(row=>row.collection==='tillSessions'&&row.data.status==='OPEN'&&row.data.operatorId===session.actorId&&row.data.deviceId===deviceId&&row.data.outletId===order.data.outletId);
   if(!till){setMessage('Start a shift for this sale’s outlet before recording payment.');return;}
  const accounts=records.filter(row=>row.collection==='paymentAccounts'&&!row.archived&&(row.data.method!=='MPESA'||allowed(session,'mpesa.record')));
  if(!accounts.length){setMessage('An authorized administrator must configure a payment account.');return;}
  const account=accounts.find(row=>row.data.method==='CASH')||accounts[0];
  setReview({order,till,accounts});setTenders([draft(account.id,((Number(order.data.grandTotalMinor)-Number(order.data.amountPaidMinor)-Number(order.data.amountCreditedMinor||0)-Number(order.data.roomChargeMinor||0))/100).toFixed(2))]);setMessage('');
 };
 const patch=(id:string,values:Partial<Tender>)=>setTenders(old=>old.map(row=>row.id===id?{...row,...values}:row));
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!review||disabled||inFlight.current||pendingId)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const used=new Map<string,BusinessRecord>();
   const payments=tenders.map(tender=>{
    const account=review.accounts.find(row=>row.id===tender.accountId);if(!account)throw new Error('Choose a payment account for every tender.');used.set(account.id,account);
    const amountMinor=parseMoneyToMinor(tender.amount);if(amountMinor<=0)throw new Error('Every tender must be greater than zero.');
    const common={accountId:account.id,amountMinor};
    if(account.data.method==='CASH'){const cashTenderedMinor=parseMoneyToMinor(tender.cashTendered);if(cashTenderedMinor<amountMinor)throw new Error('Cash tendered must cover its allocation.');return {...common,cashTenderedMinor};}
    if(!tender.confirmed)throw new Error('Manually verify that external funds were received before confirming the tender.');
    if(account.data.referenceRequired===true&&!tender.reference.trim())throw new Error('This account requires an external payment reference.');
    const external={...common,reference:tender.reference.trim(),manuallyConfirmed:true};
    if(account.data.method==='MPESA'){
     const receivedAmountMinor=parseMoneyToMinor(tender.receivedAmount);
     if(receivedAmountMinor!==amountMinor)throw new Error('The actual M-Pesa received amount must match this allocation. Reconcile any discrepancy before posting.');
     return {...external,receivedAmountMinor,receivedAt:businessDateTimeToUtc(tender.receivedAt,timeZone)};
    }
    return external;
   });
   const sum=payments.reduce((total,row)=>total+row.amountMinor,0),balance=Number(review.order.data.grandTotalMinor)-Number(review.order.data.amountPaidMinor)-Number(review.order.data.amountCreditedMinor||0)-Number(review.order.data.roomChargeMinor||0);
   if(!Number.isSafeInteger(sum)||sum>balance||payments.length>1&&sum!==balance)throw new Error('Payment cannot exceed the reviewed balance; split tenders must settle it exactly.');
   const operation=payments.length===1?'payment.record':'payment.split';
   const outcome=await command(operation,'orders',review.order.id,{orderId:review.order.id,tillSessionId:review.till.id,...(payments.length===1?payments[0]:{payments}),expectedVersions:[version(review.order),version(review.till),...Array.from(used.values(),version)]});
   if(isCommandConfirmed(outcome)){setReview(null);setTenders([]);setMessage('Payment confirmed. Issued documents and printing are in Activity.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPendingId(outcome.commandId);setMessage('message' in outcome?outcome.message:'The original payment is saved. Recover its outcome in Activity before recording another payment.');}
  }catch(error){setMessage(operatorError(error))}finally{inFlight.current=false;setBusy(false)}
 };
 if(!order||!allowed(session,'payment.record')&&!allowed(session,'payment.split'))return null;
 const field='mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2',button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
 let allocated:number|null=null;try{allocated=tenders.reduce((sum,row)=>sum+parseMoneyToMinor(row.amount),0)}catch{ /* Incomplete tender input remains reviewable. */ }
 const balance=Number(order.data.grandTotalMinor)-Number(order.data.amountPaidMinor)-Number(order.data.amountCreditedMinor||0)-Number(order.data.roomChargeMinor||0);
 const payable=order.data.state==='FIRED'&&balance>0&&!(Array.isArray(order.data.items)&&order.data.items.some(row=>(row as Record<string,unknown>).state==='DRAFT'));
 return <section className="space-y-3 rounded-xl border border-slate-700 p-3">
  <button className={button} disabled={disabled||busy||Boolean(pendingId)||!payable||!allowed(session,'payment.record')} onClick={open}>Record payment for {String(order.data.name)}</button>
  {review&&<form role="dialog" aria-label="Review order payment" onSubmit={event=>void save(event)} className="space-y-3">
   <h3 className="font-bold">{String(review.order.data.name)} · Reviewed balance {money(Number(review.order.data.grandTotalMinor)-Number(review.order.data.amountPaidMinor)-Number(review.order.data.amountCreditedMinor||0)-Number(review.order.data.roomChargeMinor||0))}</h3>
   {tenders.map(tender=>{
    const account=review.accounts.find(row=>row.id===tender.accountId),method=String(account?.data.method||'');let change:string='—';try{change=money(parseMoneyToMinor(tender.cashTendered)-parseMoneyToMinor(tender.amount))}catch{ /* Invalid entry is explained on submit. */ }
    return <fieldset key={tender.id} disabled={busy||Boolean(pendingId)} className="space-y-2 rounded border border-slate-700 p-3"><legend>Tender</legend>
     <label className="block text-sm">Payment account<select required className={field} value={tender.accountId} onChange={event=>setTenders(old=>old.map(row=>row.id===tender.id?{...draft(event.target.value,row.amount),id:row.id}:row))}>{review.accounts.map(row=><option key={row.id} value={row.id}>{String(row.data.name)} · {String(row.data.method)}</option>)}</select></label>
     <label className="block text-sm">Allocated amount (KES)<input required type="number" min="0.01" step="0.01" className={field} value={tender.amount} onChange={event=>patch(tender.id,{amount:event.target.value,confirmed:false})}/></label>
     {method==='CASH'?<><label className="block text-sm">Cash physically tendered (KES)<input required type="number" min="0.01" step="0.01" className={field} value={tender.cashTendered} onChange={event=>patch(tender.id,{cashTendered:event.target.value})}/></label><p className="text-sm">Change: {change}</p></>:<>
      {method==='MPESA'&&<p className="text-sm">{String(account?.data.mpesaMode)} {String(account?.data.mpesaNumber||'')}{account?.data.mpesaAccountReference?` · Account ${String(account.data.mpesaAccountReference)}`:''}</p>}
      <label className="block text-sm">External reference<input required={account?.data.referenceRequired===true} maxLength={160} className={field} value={tender.reference} onChange={event=>patch(tender.id,{reference:event.target.value,confirmed:false})}/></label>
      {method==='MPESA'&&<><label className="block text-sm">Actual received amount (KES)<input required type="number" min="0.01" step="0.01" className={field} value={tender.receivedAmount} onChange={event=>patch(tender.id,{receivedAmount:event.target.value,confirmed:false})}/></label><label className="block text-sm">Actual received time ({timeZone})<input required type="datetime-local" className={field} value={tender.receivedAt} onChange={event=>patch(tender.id,{receivedAt:event.target.value,confirmed:false})}/></label></>}
      <label className="block text-sm"><input type="checkbox" checked={tender.confirmed} onChange={event=>patch(tender.id,{confirmed:event.target.checked})}/> I manually verified that these funds were received</label>
     </>}
     {tenders.length>1&&<button type="button" className={button} onClick={()=>setTenders(old=>old.filter(row=>row.id!==tender.id))}>Remove tender</button>}
    </fieldset>;
   })}
   {allowed(session,'payment.split')&&<button type="button" className={button} disabled={busy||Boolean(pendingId)||tenders.length>=10} onClick={()=>setTenders(old=>[...old,draft(review.accounts[0]?.id)])}>Add split tender</button>}
   <p className="text-sm">Allocated: {allocated===null?'Complete tender amounts':money(allocated)}{allocated!==null?` ? Remaining ${money(Number(review.order.data.grandTotalMinor)-Number(review.order.data.amountPaidMinor)-Number(review.order.data.amountCreditedMinor||0)-Number(review.order.data.roomChargeMinor||0)-allocated)}`:''}</p>
   <p className="text-sm text-slate-400">Only confirmed payment outcomes settle the order. If a response is lost, recover the original payment in Activity.</p>
   <button className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" disabled={disabled||busy||Boolean(pendingId)}>Confirm received payment</button><button type="button" className={`${button} ml-2`} disabled={busy} onClick={()=>setReview(null)}>Close review</button>
  </form>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
