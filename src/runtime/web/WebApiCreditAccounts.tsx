import React,{useEffect,useRef,useState} from 'react';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {QueuedCommand} from './BusinessStore';
import type {CommandOutcome} from '../../types/transactions';
import {parseMoneyToMinor} from '../../utils/fiscal';

type Form={customerId:string;version:number;limit:string;terms:string;status:'ACTIVE'|'HOLD'|'CLOSED';notes:string};
const input='mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2';
const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
const money=(value:unknown)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(Number(value||0)/100);

export function WebApiCreditAccounts({records,queue,session,disabled,command}:{records:BusinessRecord[];queue:QueuedCommand[];session:WebSession;disabled:boolean;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>}){
 const [form,setForm]=useState<Form|null>(null),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pendingId,setPendingId]=useState(''),[statementCustomer,setStatementCustomer]=useState('');
 const inFlight=useRef(false),manage=allowed(session,'credit.manage');
 const customers=records.filter(row=>row.collection==='customers'&&!row.archived).sort((a,b)=>String(a.data.name).localeCompare(String(b.data.name)));
 const accounts=records.filter(row=>row.collection==='customerCreditAccounts'&&!row.archived);
 const entries=records.filter(row=>row.collection==='customerCreditEntries'&&row.data.customerId===statementCustomer).slice().reverse();
 const unresolved=queue.some(row=>row.command.operation==='customerCredit.configure'&&['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(row.state));
 const blocked=disabled||busy||unresolved||Boolean(pendingId);
 useEffect(()=>{if(!pendingId)return;const row=queue.find(entry=>entry.id===pendingId);if(!row||!['SYNCHRONIZED','REJECTED','CONFLICT'].includes(row.state))return;setPendingId('');setForm(null);setMessage(row.state==='SYNCHRONIZED'?'Credit account terms saved and confirmed.':row.result?.error?.message||'The original account change needs review. Refresh before trying again.');},[queue,pendingId]);
 const open=(customer:BusinessRecord)=>{const account=accounts.find(row=>row.id===customer.id);setForm({customerId:customer.id,version:account?.version??0,limit:account?(Number(account.data.limitMinor)/100).toFixed(2):'0.00',terms:String(account?.data.termsDays??30),status:account?.data.status==='HOLD'?'HOLD':account?.data.status==='CLOSED'?'CLOSED':'ACTIVE',notes:String(account?.data.notes||'')});setReason('');setMessage('')};
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(!form||!manage||blocked||inFlight.current)return;inFlight.current=true;setBusy(true);setMessage('');try{
  const limitMinor=parseMoneyToMinor(form.limit),termsDays=Number(form.terms);if(!Number.isSafeInteger(termsDays)||termsDays<0||termsDays>365)throw new Error('Credit terms must be a whole number from 0 to 365 days.');if(reason.trim().length<3)throw new Error('Enter a change reason of at least 3 characters.');
  const outcome=await command('customerCredit.configure','customerCreditAccounts',form.customerId,{id:form.customerId,customerId:form.customerId,limitMinor,termsDays,status:form.status,notes:form.notes,reason:reason.trim(),expectedVersions:[{collection:'customerCreditAccounts',id:form.customerId,version:form.version}]});
  if(outcome.kind==='CONFIRMED'){setForm(null);setMessage('Credit account terms saved and confirmed. Charging, settlements and write-offs are not enabled yet.');}
  else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPendingId(outcome.commandId);setMessage('message' in outcome?outcome.message:'Recover the original account change in Activity before retrying.');}
 }catch(error){setMessage(error instanceof Error?error.message:String(error));}finally{inFlight.current=false;setBusy(false)}};
 return <section className="space-y-4" aria-label="API customer credit accounts">
  <h2 className="text-xl font-bold">Customer credit accounts</h2>
  <p className="text-sm text-slate-400">Configure named-account limits and payment terms. Credit ledger entries are read-only here; API credit charging, settlement and write-offs are not enabled yet.</p>
  {unresolved&&<p role="status">Recover the original credit-terms command in Activity before making another change.</p>}
  {!customers.length&&<p className="text-sm text-slate-400">Add a named customer in Master Data before configuring credit terms.</p>}
  <div className="grid gap-3 md:grid-cols-2">{customers.map(customer=>{const account=accounts.find(row=>row.id===customer.id);return <article key={customer.id} className="space-y-2 rounded-xl border border-slate-700 p-4">
   <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{String(customer.data.name)}</h3><span className="text-xs text-slate-400">{account?String(account.data.status):'No credit terms'}</span></div>
   <p className="text-sm text-slate-400">{account?`${money(account.data.limitMinor)} limit · ${Number(account.data.termsDays)} day terms · ${money(account.data.balanceMinor)} outstanding`:'Credit not configured'}</p>
   <div className="flex gap-2">{account&&<button className={button} onClick={()=>setStatementCustomer(statementCustomer===customer.id?'':customer.id)}>{statementCustomer===customer.id?'Hide statement':'View statement'}</button>}{manage&&<button disabled={blocked} className={button} onClick={()=>open(customer)}>{account?'Review terms':'Configure account'}</button>}</div>
  </article>})}</div>
  {statementCustomer&&<section className="space-y-2 rounded-xl border border-slate-700 p-4">
   <h3 className="font-semibold">{String(customers.find(row=>row.id===statementCustomer)?.data.name||'Customer')} credit statement</h3>
   <p className="text-xs text-slate-400">Read-only ledger view. This device receives the latest 1,000 business credit entries.</p>
   <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Reference</th><th className="p-2 text-right">Change</th><th className="p-2 text-right">Balance</th></tr></thead><tbody>{entries.map(row=><tr key={row.id} className="border-t border-slate-800"><td className="p-2">{new Date(String(row.data.occurredAt)).toLocaleString()}</td><td className="p-2">{String(row.data.kind)}</td><td className="p-2">{String(row.data.reference||row.data.orderId||'—')}</td><td className="p-2 text-right">{Number(row.data.balanceDeltaMinor)>0?'+':''}{money(row.data.balanceDeltaMinor)}</td><td className="p-2 text-right">{money(row.data.balanceAfterMinor)}</td></tr>)}</tbody></table></div>
   {!entries.length&&<p className="text-sm text-slate-400">No credit ledger entries.</p>}
  </section>}
  {form&&<form role="dialog" aria-label="Customer credit terms" onSubmit={event=>void save(event)} className="space-y-3 rounded-xl border border-slate-700 p-4">
   <h3 className="font-semibold">{form.version?'Review credit terms':'Configure named customer credit'}</h3>
   <label className="block text-sm">Credit limit (KES)<input required inputMode="decimal" type="number" min="0" step="0.01" disabled={blocked} className={input} value={form.limit} onChange={event=>setForm({...form,limit:event.target.value})}/></label>
   <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Payment terms (days)<input required type="number" min="0" max="365" step="1" disabled={blocked} className={input} value={form.terms} onChange={event=>setForm({...form,terms:event.target.value})}/></label><label className="block text-sm">Account status<select disabled={blocked} className={input} value={form.status} onChange={event=>setForm({...form,status:event.target.value as Form['status']})}><option value="ACTIVE">Active</option><option value="HOLD">Hold new charges</option><option value="CLOSED">Closed</option></select></label></div>
   {form.status==='CLOSED'&&<p className="text-xs text-amber-200">Closing is allowed only when the API ledger balance is zero.</p>}
   <label className="block text-sm">Notes<textarea maxLength={1000} disabled={blocked} className={input} value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></label>
   <label className="block text-sm">Change reason<textarea required minLength={3} maxLength={500} disabled={blocked} className={input} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button disabled={blocked||reason.trim().length<3} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Save terms</button><button type="button" disabled={busy} className={`${button} ml-2`} onClick={()=>setForm(null)}>Close</button>
  </form>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
