import {operatorError} from './operatorError';
import React,{useEffect,useRef,useState} from 'react';
import type {BusinessRecord} from './session';
import type {CommandOutcome} from '../../types/transactions';
import {inventoryRevisions} from './inventoryRevisions';
import {isCommandConfirmed} from '../../types/transactions';
import type {QueuedCommand} from './BusinessStore';
import {inventoryCommandInFlight,inventoryName,inventoryQuantity} from './inventoryPresentation';

export function WebMovementReversalDialog({records,movement,queue=[],command,onClose,onBusyChange}:{
 records:BusinessRecord[];movement:BusinessRecord;queue?:QueuedCommand[];onClose:()=>void;onBusyChange?:(busy:boolean)=>void;
 command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
}){
 const [reviewed]=useState(()=>records);
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(''),[requiresReview,setRequiresReview]=useState(false);
 const inFlight=useRef(false),callbacks=useRef({onClose,onBusyChange});callbacks.current={onClose,onBusyChange};
 const source=movement.data.sourceId;
 const affected=reviewed.filter(record=>record.collection==='stockMovements'&&record.data.sourceId===source);
 const alreadyReversed=records.some(record=>record.collection==='movementCorrections'&&record.data.originalCommandId===source);
 const incomplete=affected.length!==(movement.data.movementType==='WASTE'?1:2);
 const missingEvidence=affected.some(record=>!record.data.restorationEvidence);
 const unresolved=inventoryCommandInFlight(queue,affected.map(row=>String(row.data.stockItemId)));
 useEffect(()=>{callbacks.current.onBusyChange?.(busy);return()=>callbacks.current.onBusyChange?.(false);},[busy]);
 useEffect(()=>{if(!pending)return;const entry=queue.find(row=>row.id===pending);if(!entry||!['SYNCHRONIZED','REJECTED','CONFLICT'].includes(entry.state))return;setPending('');if(entry.state==='SYNCHRONIZED')callbacks.current.onClose();else{setRequiresReview(true);setError(entry.result?.error?.message||'The original reversal was not accepted. Close and review the current evidence before another correction.');}},[queue,pending]);
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(inFlight.current||busy||pending||unresolved||requiresReview||reason.trim().length<3||alreadyReversed||missingEvidence||incomplete)return;
  inFlight.current=true;setBusy(true);setError('');
  try{
   // Transfer sides belong to one command and must restore together.
   const stocks=[...new Set(affected.map(record=>String(record.data.stockItemId)))];
   const locations=[...new Set(affected.map(record=>String(record.data.locationId)))];
   const outcome=await command('inventory.reverseMovement','movementCorrections',movement.id,{movementId:movement.id,reason:reason.trim(),...inventoryRevisions(reviewed,stocks,locations)});
   if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(outcome.commandId);
   if(outcome.kind==='REJECTED'||outcome.kind==='CONFLICT')setRequiresReview(true);
   if(isCommandConfirmed(outcome))onClose();else setError('message' in outcome?outcome.message:'The reversal is saved for outcome checking. Synchronize the original command before starting another correction.');
  }catch(cause){setRequiresReview(true);setError(operatorError(cause))}finally{inFlight.current=false;setBusy(false)}
 };
 return <form onSubmit={event=>void submit(event)} className="space-y-4">
  <p className="text-sm text-slate-300">Reverse a recording mistake only when the physical movement did not happen. Both sides of a transfer restore together. The original history is retained.</p>
  <ul className="space-y-2 text-sm">{affected.map(record=>{
   const evidence=record.data.restorationEvidence as {before?:{quantity:number};after?:{quantity:number}}|undefined;
   return <li key={record.id} className="rounded border border-slate-700 p-3">{String(record.data.locationName||inventoryName(reviewed,'stockLocations',record.data.locationId,'Storage place unavailable'))}: {inventoryQuantity(evidence?.after?.quantity)} → {inventoryQuantity(evidence?.before?.quantity)} {String(record.data.baseUnit||'')}</li>;
  })}</ul>
  {alreadyReversed&&<p role="alert">This recording has already been reversed.</p>}
  {incomplete&&<p role="alert">The complete original recording is not available in this view. Synchronize before reviewing the reversal.</p>}
  {missingEvidence&&<p role="alert">This recording has no exact restoration evidence. Review a current balance correction instead.</p>}
  {(pending||unresolved)&&<p role="status">Recover the original inventory action in Activity before submitting another reversal.</p>}
  <label className="block text-sm">Manager reason<textarea disabled={busy||Boolean(pending)||Boolean(unresolved)||requiresReview} required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-3"/></label>
  {error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}
  <div className="flex gap-2"><button type="submit" disabled={busy||Boolean(pending)||Boolean(unresolved)||requiresReview||incomplete||alreadyReversed||missingEvidence||!affected.length||reason.trim().length<3} className="min-h-11 rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">{busy?'Checking original recording…':'Confirm exact reversal'}</button><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded border border-slate-700 px-4 py-2">Close</button></div>
 </form>;
}
