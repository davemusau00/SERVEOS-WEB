import React,{useEffect,useRef,useState} from 'react';
import type {QueuedCommand} from './BusinessStore';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {CommandOutcome} from '../../types/transactions';
import {operatorError} from './operatorError';
import {ds} from '../../design-system/tokens';

type Minutes=Record<'BAR'|'KITCHEN'|'ROOMS',string>;
type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const stations=['BAR','KITCHEN','ROOMS'] as const;
const names={BAR:'Bar',KITCHEN:'Kitchen',ROOMS:'Room service'};
export function PreparationSettingsPanel({records,session,queue,disabled,command}:{records:BusinessRecord[];session:WebSession;queue:QueuedCommand[];disabled:boolean;command:Command}){
 const current=records.find(row=>row.collection==='preparationSettings'&&row.id===session.businessId&&!row.archived);
 const [editor,setEditor]=useState<{version:number;minutes:Minutes}|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[pending,setPending]=useState<string|null>(null);
 const inFlight=useRef(false);
 const held=queue.find(entry=>entry.state!=='SYNCHRONIZED'&&entry.state!=='REJECTED'&&entry.state!=='CONFLICT'&&entry.command.operation==='preparation.settings.save');
 const changed=editor!==null&&editor.version!==(current?.version??0);
 useEffect(()=>{
  if(!pending||pending==='unknown')return;
  const original=queue.find(entry=>entry.id===pending);
  if(original?.state==='SYNCHRONIZED'&&current&&(!editor||current.version>editor.version)){setPending(null);setEditor(null);setMessage('The original thresholds change is confirmed and the current settings are loaded.');}
  else if(original?.state==='REJECTED'||original?.state==='CONFLICT'){setPending(null);setMessage('The original settings change was not applied. Close this review and inspect the latest thresholds before submitting a new change.');}
 },[pending,queue,current,editor]);
 const open=()=>{const thresholds=current?.data.overdueMinutes as Record<string,unknown>|undefined;setEditor({version:current?.version??0,minutes:Object.fromEntries(stations.map(station=>[station,String(thresholds?.[station]??15)])) as Minutes});setReason('');setMessage('');setPending(null);};
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!editor||disabled||busy||inFlight.current||held||pending||changed)return;
  const values=Object.fromEntries(stations.map(station=>[station,Number(editor.minutes[station])]));
  if(stations.some(station=>!Number.isInteger(values[station])||values[station]<1||values[station]>240)||reason.trim().length<3){setMessage('Enter whole minutes from 1 to 240 and a change reason.');return;}
  inFlight.current=true;setBusy(true);setMessage('');
  try{const result=await command('preparation.settings.save','preparationSettings',session.businessId,{overdueMinutes:values,reason:reason.trim(),expectedVersions:[{collection:'preparationSettings',id:session.businessId,version:editor.version}]});
   if(result.kind==='CONFIRMED'){setEditor(null);setMessage('Preparation thresholds recorded by the server.');}
   else if(result.kind==='PENDING'||result.kind==='OUTCOME_UNKNOWN'){setPending(result.commandId);setMessage('The original settings change awaits confirmation. Recover it in Activity before submitting again.');}
   else setMessage(result.kind==='DRAFT_SAVED'?'These settings were saved as an unsent draft. Review them online.':result.message);
  }catch(error){setPending('unknown');setMessage(`${operatorError(error)} Check Activity for the original change before retrying.`);}finally{inFlight.current=false;setBusy(false);}
 };
 return <section className={`${ds.panel} space-y-3 p-4`} aria-label="Preparation timing settings">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Preparation timing</h3><p className="mt-1 text-sm text-slate-400">Highlight waiting items after the selected station time. This changes display thresholds; it does not cancel, re-fire or print orders.</p></div>{allowed(session,'business.configure')&&<button className={`${ds.button} min-h-11`} disabled={disabled||busy||Boolean(held)||Boolean(pending)} onClick={open}>Review thresholds</button>}</div>
  <div className="flex flex-wrap gap-4 text-sm">{stations.map(station=><span key={station}>{names[station]}: {String((current?.data.overdueMinutes as Record<string,unknown>|undefined)?.[station]??15)} min</span>)}</div>
  {editor&&<form onSubmit={event=>void save(event)} className="space-y-3"><div className="grid gap-3 sm:grid-cols-3">{stations.map(station=><label key={station} className="text-sm">{names[station]} (minutes)<input className={`${ds.input} mt-1 min-h-11`} type="number" min="1" max="240" step="1" required value={editor.minutes[station]} disabled={busy||Boolean(held)||Boolean(pending)} onChange={event=>setEditor({...editor,minutes:{...editor.minutes,[station]:event.target.value}})}/></label>)}</div><label className="block text-sm">Change reason<textarea className={`${ds.input} mt-1`} minLength={3} maxLength={500} required value={reason} disabled={busy||Boolean(held)||Boolean(pending)} onChange={event=>setReason(event.target.value)}/></label>{changed&&<p role="status" className="text-sm text-amber-200">Settings changed during this review. Close and review the latest thresholds.</p>}<button className={`${ds.primaryButton} min-h-11`} disabled={disabled||busy||Boolean(held)||Boolean(pending)||changed}>Save reviewed thresholds</button><button className={`${ds.button} ml-2 min-h-11`} type="button" disabled={busy} onClick={()=>setEditor(null)}>Close review</button></form>}
  {(message||held||pending)&&<p role="status" className="text-sm text-amber-200">{message||'A settings change awaits its original server outcome. Open Activity for recovery.'}</p>}
 </section>;
}
