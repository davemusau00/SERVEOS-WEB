import React,{useEffect,useRef,useState} from 'react';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {QueuedCommand} from './BusinessStore';
import type {CommandOutcome} from '../../types/transactions';
const fields=[['code','Supplier code',80],['name','Supplier name',160],['contactName','Contact name',160],['phone','Phone',80],['email','Email',254],['taxPin','Tax PIN',80],['address','Address',2000],['notes','Notes',2000]] as const;
type Editor={id:string;version:number;values:Record<string,string>};
export function WebApiSuppliers({records,session,queue,disabled,command}:{records:BusinessRecord[];session:WebSession;queue:QueuedCommand[];disabled:boolean;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>}){
 const [editor,setEditor]=useState<Editor|null>(null),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pendingId,setPendingId]=useState(''),[search,setSearch]=useState('');
 const inFlight=useRef(false);const manage=allowed(session,'procurement.manage')||allowed(session,'suppliers.manage');
 const unresolved=queue.some(row=>row.command.operation==='supplier.save'&&['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(row.state));
 useEffect(()=>{if(!pendingId)return;const entry=queue.find(row=>row.id===pendingId);if(!entry||!['SYNCHRONIZED','REJECTED','CONFLICT'].includes(entry.state))return;setPendingId('');setEditor(null);setMessage(entry.state==='SYNCHRONIZED'?'Original supplier change confirmed.':entry.result?.error?.message||'The supplier change did not confirm. Reopen the current supplier to review it.');},[queue,pendingId]);
 const open=(record?:BusinessRecord)=>{setEditor({id:record?.id||crypto.randomUUID(),version:record?.version??0,values:{...Object.fromEntries(fields.map(([key])=>[key,String(record?.data[key]||'')])),paymentTermsDays:String(record?.data.paymentTermsDays??0)}});setReason('');setMessage('');};
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!editor||disabled||inFlight.current||unresolved||pendingId||!manage)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const terms=Number(editor.values.paymentTermsDays);if(!/^\d+$/.test(editor.values.paymentTermsDays)||!Number.isInteger(terms)||terms>365)throw new Error('Payment terms must be 0 to 365 days.');
   const data={...Object.fromEntries(fields.map(([key])=>[key,editor.values[key].trim()])),paymentTermsDays:terms};
   const outcome=await command('supplier.save','suppliers',editor.id,{id:editor.id,data,reason:reason.trim(),expectedVersions:[{collection:'suppliers',id:editor.id,version:editor.version}]});
   if(outcome.kind==='CONFIRMED'){setEditor(null);setMessage('Supplier saved and confirmed.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPendingId(outcome.commandId);setMessage('message' in outcome?outcome.message:'Recover the original supplier change in Activity before submitting again.');}
  }catch(error){setMessage(error instanceof Error?error.message:'Cannot save supplier.');}finally{inFlight.current=false;setBusy(false);}
 };
 const matches=records.filter(row=>row.collection==='suppliers'&&`${row.data.name} ${row.data.code} ${row.data.contactName||''}`.toLowerCase().includes(search.toLowerCase()));
 const blocked=disabled||busy||unresolved||Boolean(pendingId);
 return <section className="space-y-4" aria-label="API procurement suppliers">
  <h2 className="text-xl font-bold">Suppliers</h2>
  <div className="flex flex-wrap gap-3"><label className="text-sm">Find supplier<input className="ml-2 rounded bg-slate-950 p-2" value={search} onChange={event=>setSearch(event.target.value)}/></label>{manage&&<button disabled={blocked} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" onClick={()=>open()}>Add supplier</button>}</div>
  {unresolved&&<p role="status">Recover the original supplier action in Activity before another supplier change.</p>}
  <div className="grid gap-3 md:grid-cols-2">{matches.map(row=><article key={row.id} className="space-y-2 rounded-xl border border-slate-700 p-4"><h3 className="font-bold">{String(row.data.name)}</h3><p className="text-sm">{String(row.data.code)} ? {row.archived?'Archived':`${row.data.paymentTermsDays} day payment terms`}</p><p className="break-words text-sm">{String(row.data.contactName||'')} {String(row.data.phone||'')} {String(row.data.email||'')}</p>{manage&&!row.archived&&<button disabled={blocked} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40" onClick={()=>open(row)}>Edit supplier</button>}</article>)}</div>
  {!matches.length&&<p className="text-sm">No matching suppliers.</p>}
  {editor&&<form role="dialog" aria-label="Edit supplier" onSubmit={event=>void save(event)} className="space-y-3 rounded-xl border border-slate-700 p-4">
   <div className="grid gap-3 md:grid-cols-2">{fields.map(([key,label,max])=><label key={key} className="block text-sm">{label}{['address','notes'].includes(key)?<textarea maxLength={max} disabled={blocked} className="mt-1 w-full rounded bg-slate-950 p-2" value={editor.values[key]} onChange={event=>setEditor({...editor,values:{...editor.values,[key]:event.target.value}})}/>:<input required={key==='name'||key==='code'} type={key==='email'?'email':'text'} maxLength={max} disabled={blocked} className="mt-1 w-full rounded bg-slate-950 p-2" value={editor.values[key]} onChange={event=>setEditor({...editor,values:{...editor.values,[key]:event.target.value}})}/>}</label>)}</div>
   <label className="block text-sm">Payment terms (days)<input type="number" min={0} max={365} step={1} required disabled={blocked} className="ml-2 rounded bg-slate-950 p-2" value={editor.values.paymentTermsDays} onChange={event=>setEditor({...editor,values:{...editor.values,paymentTermsDays:event.target.value}})}/></label>
   <label className="block text-sm">Change reason<textarea required minLength={3} maxLength={500} disabled={blocked} className="mt-1 w-full rounded bg-slate-950 p-2" value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button disabled={blocked||reason.trim().length<3} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Save supplier</button><button type="button" disabled={busy} className="ml-2 rounded border border-slate-600 px-3 py-2" onClick={()=>setEditor(null)}>Close</button>
  </form>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
