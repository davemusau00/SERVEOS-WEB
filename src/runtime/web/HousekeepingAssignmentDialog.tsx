import React,{useEffect,useRef,useState} from 'react';
import {Dialog} from '../../design-system/controls';
import {ds} from '../../design-system/tokens';
import type {ApiClient} from './apiClient';
import type {BusinessRecord} from './session';
import type {QueuedCommand} from './BusinessStore';
import type {CommandOutcome} from '../../types/transactions';
import {operationalText} from './reservationWorkspace';

export function HousekeepingAssignmentDialog({room,client,queue,disabled,command,onClose}:{room:BusinessRecord;client:ApiClient;queue:QueuedCommand[];disabled:boolean;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;onClose:()=>void}){
 const [reviewed,setReviewed]=useState(room),[staff,setStaff]=useState<Array<{id:string;name:string;version:number}>>([]),[staffId,setStaffId]=useState(String(room.data.housekeepingAssignedStaffId||'')),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[heldId,setHeldId]=useState('');
 const latch=useRef(false),request=useRef(0);
 const pending=queue.find(entry=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state)&&entry.command.expectedVersions.some(version=>version.collection==='rooms'&&version.id===room.id));
 const held=Boolean(heldId||pending),changed=room.version!==reviewed.version;
 const refresh=async()=>{if(latch.current||held)return;const generation=++request.current;setLoading(true);setNotice('');try{const result=await client.housekeepingAssignees();if(generation!==request.current)return;setStaff(result.items);setReviewed(room);}catch{if(generation===request.current)setNotice('Staff choices could not be refreshed. Reconnect and retry.');}finally{if(generation===request.current)setLoading(false);}};
 useEffect(()=>{void refresh();return()=>{request.current++;};},[client,room.id]);
 useEffect(()=>{if(!heldId)return;const original=queue.find(entry=>entry.id===heldId);if(original?.state==='SYNCHRONIZED'){onClose();}else if(original&&['REJECTED','CONFLICT'].includes(original.state)){setHeldId('');setLoading(true);setNotice('The original assignment was not applied. Refresh and review the room and staff choices before submitting again.');}},[heldId,queue,onClose]);
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(latch.current||disabled||held||changed||loading||reason.trim().length<3)return;
  const target=staff.find(member=>member.id===staffId);if(staffId&&!target){setNotice('Choose a currently available staff member or leave this room unassigned.');return;}
  latch.current=true;setBusy(true);setNotice('');
  try{const outcome=await command('room.housekeeping.assign','rooms',room.id,{id:room.id,staffId:staffId||null,reason:reason.trim(),expectedVersions:[{collection:'rooms',id:reviewed.id,version:reviewed.version},...(target?[{collection:'employees',id:target.id,version:target.version}]:[])]});
   if(outcome.kind==='CONFIRMED')onClose();
   else if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN'){setHeldId(outcome.commandId);setNotice('The original assignment is awaiting confirmation. Recover it in Activity before submitting another.');}
   else {setLoading(true);setNotice(outcome.kind==='DRAFT_SAVED'?'This is a draft; the room has not been assigned. Refresh before continuing.':outcome.message);}
  }catch{setLoading(true);setNotice('The assignment could not be confirmed. Inspect the original command in Activity before retrying.');}
  finally{latch.current=false;setBusy(false);}
 };
 return <Dialog title={`Housekeeping · Room ${operationalText(room.data.number,'unavailable')}`} onClose={()=>{if(!busy)onClose();}}>
  <form className="space-y-3" onSubmit={event=>void save(event)}>
   <p className="text-sm text-slate-300">Current assignment: {operationalText(room.data.housekeepingAssignedName,'Unassigned')}. Changing the assignment does not mark the room clean or ready.</p>
   {changed&&<p role="alert" className="text-sm text-amber-200">Room state changed. Refresh and review the current assignment.</p>}
   {notice&&<p role="status" className="text-sm text-amber-200">{notice}</p>}{held&&<p className="text-sm text-amber-200">Original room update pending. Use Activity for recovery.</p>}
   <label className="block text-sm">Responsible staff<select className={`${ds.input} mt-1 min-h-11`} value={staffId} disabled={busy||held||loading} onChange={event=>setStaffId(event.target.value)}><option value="">Unassigned</option>{staff.map(member=><option key={member.id} value={member.id}>{operationalText(member.name,'Staff name unavailable')}</option>)}</select></label>
   <label className="block text-sm">Assignment or handover reason<textarea className={`${ds.input} mt-1`} required minLength={3} maxLength={500} value={reason} disabled={busy||held} onChange={event=>setReason(event.target.value)}/></label>
   <div className="flex flex-wrap justify-end gap-2"><button type="button" className={`${ds.button} min-h-11`} disabled={busy||held} onClick={()=>void refresh()}>Refresh choices</button><button type="button" className={`${ds.button} min-h-11`} disabled={busy} onClick={onClose}>Close</button><button className={`${ds.primaryButton} min-h-11`} disabled={disabled||busy||held||loading||changed||reason.trim().length<3}>{busy?'Saving…':'Save assignment'}</button></div>
  </form>
 </Dialog>;
}
