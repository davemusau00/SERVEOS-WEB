import {operatorError} from './operatorError';
import React,{useRef,useState} from 'react';
import type {BusinessRecord} from './session';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';

export function WebOutletSettings({records,disabled,command}:{records:BusinessRecord[];disabled:boolean;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>}){
 const [editor,setEditor]=useState<{id:string;version:number;reviewed:BusinessRecord[]}|null>(null);
 const [name,setName]=useState(''),[location,setLocation]=useState(''),[archived,setArchived]=useState(false),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(false);
 const inFlight=useRef(false);
 const open=(record?:BusinessRecord)=>{
  setEditor({id:record?.id||crypto.randomUUID(),version:record?.version??0,reviewed:records});setName(String(record?.data.name||''));setLocation(String(record?.data.defaultStockLocationId||''));setArchived(record?.archived===true);setReason('');setMessage('');setPending(false);
 };
 const locations=(editor?.reviewed||records).filter(row=>row.collection==='stockLocations'&&!row.archived);
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!editor||inFlight.current||disabled||pending)return;
  const storage=locations.find(row=>row.id===location);if(!storage){setMessage('Choose an active storage place.');return;}
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const outcome=await command('outlet.save','outlets',editor.id,{id:editor.id,data:{name:name.trim(),defaultStockLocationId:location,archived},reason:reason.trim(),expectedVersions:[{collection:'outlets',id:editor.id,version:editor.version},{collection:'stockLocations',id:location,version:storage.version}]});
   if(isCommandConfirmed(outcome)){setEditor(null);setMessage('Outlet saved and confirmed.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(true);setMessage('message' in outcome?outcome.message:'The original outlet action is saved. Recover its outcome in Activity before submitting another change.');}
  }catch(error){setMessage(operatorError(error))}finally{inFlight.current=false;setBusy(false)}
 };
 const field='mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2';
 const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
  return <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/40 p-4 sm:p-5">
  <h3 className="font-bold">Outlets and stock locations</h3>
  <p className="text-sm text-slate-400">Each outlet needs a receiving/consumption storage place. Resolve its open orders and tills before changing the storage place or archiving the outlet.</p>
  <button className={button} disabled={disabled||busy||pending} onClick={()=>open()}>Add outlet</button>
  <div className="flex flex-wrap gap-2">{records.filter(row=>row.collection==='outlets').map(row=><button key={row.id} className={button} disabled={disabled||busy||pending} onClick={()=>open(row)}>{String(row.data.name)}{row.archived?' · Archived':''}</button>)}</div>
  {editor&&<form aria-label="Edit outlet settings" onSubmit={event=>void save(event)} className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4 sm:p-5">
   <label className="block text-sm">Outlet name<input required maxLength={120} disabled={busy||pending} className={field} value={name} onChange={event=>setName(event.target.value)}/></label>
   <label className="block text-sm">Default stock location<select required disabled={busy||pending} className={field} value={location} onChange={event=>setLocation(event.target.value)}><option value="">Choose storage place…</option>{locations.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label>
   <label className="block text-sm"><input type="checkbox" disabled={busy||pending} checked={archived} onChange={event=>setArchived(event.target.checked)}/> Archive this outlet</label>
   <label className="block text-sm">Change reason<textarea required minLength={3} maxLength={500} disabled={busy||pending} className={field} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" disabled={disabled||busy||pending||!name.trim()||!location||reason.trim().length<3}>Save outlet</button><button type="button" disabled={busy} className={`${button} ml-2`} onClick={()=>setEditor(null)}>Close</button>
  </form>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
