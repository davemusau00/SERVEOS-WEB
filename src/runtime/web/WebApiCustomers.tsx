import {operatorError} from './operatorError';
import React,{useRef,useState} from 'react';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {QueuedCommand} from './BusinessStore';
import type {CommandOutcome} from '../../types/transactions';

type Editor={id:string;version:number;values:{name:string;phone:string;email:string;notes:string}};
const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
const input='mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2';
export function WebApiCustomers({records,queue,session,disabled,command}:{records:BusinessRecord[];queue:QueuedCommand[];session:WebSession;disabled:boolean;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>}){
 const [editor,setEditor]=useState<Editor|null>(null),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false);
 const inFlight=useRef(false),manage=allowed(session,'customers.manage');
 const unresolved=queue.some(row=>row.command.operation==='customer.save'&&['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(row.state));
 const open=(record?:BusinessRecord)=>{setEditor({id:record?.id||crypto.randomUUID(),version:record?.version??0,values:{name:String(record?.data.name||''),phone:String(record?.data.phone||''),email:String(record?.data.email||''),notes:String(record?.data.notes||'')}});setReason('');setMessage('');};
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!editor||!manage||disabled||busy||unresolved||inFlight.current)return;
  if(reason.trim().length<3){setMessage('Enter a reason of at least 3 characters.');return;}
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const outcome=await command('customer.save','customers',editor.id,{id:editor.id,data:editor.values,reason:reason.trim(),expectedVersions:[{collection:'customers',id:editor.id,version:editor.version}]});
   if(outcome.kind==='CONFIRMED'){setEditor(null);setMessage('Customer saved and confirmed.');}
   else setMessage('message' in outcome?outcome.message:'Recover the original customer command in Activity before trying again.');
  }catch(error){setMessage(operatorError(error));}finally{inFlight.current=false;setBusy(false);}
 };
 const customers=records.filter(row=>row.collection==='customers'&&`${row.data.name} ${row.data.phone||''} ${row.data.email||''}`.toLowerCase().includes(search.toLowerCase()));
 const blocked=disabled||busy||unresolved;
 return <section className="space-y-4" aria-label="API customers">
  <h2 className="text-xl font-bold">Customers</h2><p className="text-sm text-slate-400">Customer records are stored by the ServOS API. Creating a customer does not enable credit or record a payment.</p>
  <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Search customers<input className="ml-2 rounded border border-slate-700 bg-slate-950 p-2" value={search} onChange={event=>setSearch(event.target.value)}/></label>{manage&&<button disabled={blocked} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" onClick={()=>open()}>Add customer</button>}</div>
  {unresolved&&<p role="status">Recover the original customer command in Activity before making another change.</p>}
  <div className="grid gap-3 md:grid-cols-2">{customers.map(row=><article key={row.id} className="space-y-2 rounded-xl border border-slate-700 p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-bold">{String(row.data.name)}</h3><span className="text-xs text-slate-400">{row.archived?'Archived':'Active'}</span></div><p className="break-words text-sm text-slate-400">{[row.data.phone,row.data.email].filter(Boolean).join(' · ')||'No contact details'}</p>{manage&&!row.archived&&<button disabled={blocked} className={button} onClick={()=>open(row)}>Edit customer</button>}</article>)}</div>
  {!customers.length&&<p className="text-sm text-slate-400">No customers match this search.</p>}
  {editor&&<form role="dialog" aria-label="Edit API customer" onSubmit={event=>void save(event)} className="space-y-3 rounded-xl border border-slate-700 p-4">
   <h3 className="font-semibold">{editor.version?'Edit customer':'Add customer'}</h3>
   <label className="block text-sm">Name<input autoFocus required maxLength={160} disabled={blocked} className={input} value={editor.values.name} onChange={event=>setEditor({...editor,values:{...editor.values,name:event.target.value}})}/></label>
   <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Phone<input maxLength={40} disabled={blocked} className={input} value={editor.values.phone} onChange={event=>setEditor({...editor,values:{...editor.values,phone:event.target.value}})}/></label><label className="block text-sm">Email<input type="email" maxLength={254} disabled={blocked} className={input} value={editor.values.email} onChange={event=>setEditor({...editor,values:{...editor.values,email:event.target.value}})}/></label></div>
   <label className="block text-sm">Notes<textarea maxLength={1000} disabled={blocked} className={input} value={editor.values.notes} onChange={event=>setEditor({...editor,values:{...editor.values,notes:event.target.value}})}/></label>
   <label className="block text-sm">Change reason<textarea required minLength={3} maxLength={500} disabled={blocked} className={input} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button disabled={blocked||reason.trim().length<3} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Save customer</button><button type="button" disabled={busy} className={`${button} ml-2`} onClick={()=>setEditor(null)}>Close</button>
  </form>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
