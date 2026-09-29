import React,{useState} from 'react';
import type {BusinessRecord,WebSession} from './session';
import {allowed} from './session';

type CommandFn=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<unknown>;
const field='w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';
const button='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold disabled:opacity-40';
const primary='rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40';
const data=(record?:BusinessRecord)=>record?.data as Record<string,any>|undefined;
const active=(records:BusinessRecord[],collection:string)=>records.filter(r=>r.collection===collection&&!r.archived);
const money=(minor:unknown)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(Number(minor||0)/100);
const toMinor=(value:string)=>{const amount=Number(value);if(!Number.isFinite(amount)||amount<=0)throw new Error('Enter a valid amount greater than zero.');return Math.round(amount*100)};

export function WebRefundsView({records,session,disabled,command}:{records:BusinessRecord[];session:WebSession;disabled:boolean;command:CommandFn}){
 const payments=active(records,'payments').slice().sort((a,b)=>String(data(b)?.occurredAt||'').localeCompare(String(data(a)?.occurredAt||'')));
 const refunds=active(records,'refunds');
 const [current,setCurrent]=useState<BusinessRecord|null>(null);const [amount,setAmount]=useState('');const [reason,setReason]=useState('');const [reference,setReference]=useState('');const [confirmed,setConfirmed]=useState(false);const [notice,setNotice]=useState('');
 const refundedFor=(paymentId:string)=>refunds.filter(refund=>data(refund)?.paymentId===paymentId).reduce((sum,refund)=>sum+Number(data(refund)?.amountMinor||0),0);
 const begin=(payment:BusinessRecord)=>{const remaining=Math.max(0,Number(data(payment)?.amountMinor||0)-refundedFor(payment.id));setCurrent(payment);setAmount((remaining/100).toFixed(2));setReason('');setReference('');setConfirmed(false);setNotice('')};
 const submit=async(reverse:boolean)=>{
  if(!current)return;
  const method=String(data(current)?.method||'').toUpperCase();const payload={paymentId:current.id,reason:reason.trim(),...(reverse?{}:{amountMinor:toMinor(amount)}),...(method!=='CASH'?{externalReference:reference.trim(),manuallyConfirmed:confirmed}:{})};
  try{await command(reverse?'payment.reverse':'payment.refund','payments',current.id,payload);setCurrent(null)}catch(error){setNotice(String(error))}
 };
 return <section className="space-y-5">
  <header><h2 className="text-2xl font-bold">Payments &amp; refunds</h2><p className="mt-1 text-sm text-slate-400">Refunds reverse money and accounting. Ingredient stock is not automatically restored.</p></header>
  {notice&&<p role="alert" className="rounded-lg border border-rose-800 bg-rose-950 p-3 text-sm">{notice}</p>}
  <div className="space-y-2">{payments.map(payment=>{const d=data(payment)!;const original=Number(d.amountMinor||0);const refunded=refundedFor(payment.id);const remaining=Math.max(0,original-refunded);return <article key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"><div><b>{String(d.method||d.tenderType||'PAYMENT')} · {money(original)}</b><p className="text-xs text-slate-500">{String(d.reference||d.referenceNumber||payment.id)} · {d.occurredAt?new Date(String(d.occurredAt)).toLocaleString():'Date unavailable'}</p><p className="text-xs text-slate-500">Refunded {money(refunded)} · remaining {money(remaining)}</p></div><button disabled={disabled||remaining<=0||!allowed(session,'order.refund')&&!allowed(session,'payment.reverse')} className={button} onClick={()=>begin(payment)}>Refund</button></article>})}</div>
  {!payments.length&&<p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-500">No paid transactions are available to refund.</p>}
  {current&&<Modal title={`Refund ${String(data(current)?.method||'payment')}`} onClose={()=>setCurrent(null)}><div className="space-y-3"><p className="text-sm text-slate-400">The original payment remains immutable. This creates a new journaled refund event.</p><label className="block text-sm">Refund amount (KES)<input aria-label="Refund amount in KES" type="number" min="0.01" step="0.01" className={field} value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="block text-sm">Reason<textarea aria-label="Reason" className={field} value={reason} onChange={e=>setReason(e.target.value)}/></label>{String(data(current)?.method||'').toUpperCase()!=='CASH'&&<><label className="block text-sm">External refund reference<input className={field} value={reference} onChange={e=>setReference(e.target.value.toUpperCase())}/></label><label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I manually verified the external refund. ServOS did not initiate or confirm a provider payout.</span></label></>}<div className="flex flex-wrap gap-2"><button disabled={disabled||!allowed(session,'order.refund')||reason.trim().length<3||(String(data(current)?.method||'').toUpperCase()!=='CASH'&&(!reference.trim()||!confirmed))} className={primary} onClick={()=>void submit(false)}>Record refund</button>{allowed(session,'payment.reverse')&&<button disabled={disabled||reason.trim().length<3||(String(data(current)?.method||'').toUpperCase()!=='CASH'&&(!reference.trim()||!confirmed))} className={button} onClick={()=>void submit(true)}>Reverse full remaining amount</button>}</div></div></Modal>}
 </section>;
}

const Modal=({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode})=><div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4"><section role="dialog" aria-modal="true" aria-label={title} className="mx-auto my-8 max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button className={button} onClick={onClose}>Close</button></div>{children}</section></div>;