import {operatorError} from './operatorError';
import React,{useState} from 'react';
import type {BusinessRecord} from './session';
import type {CommandOutcome} from '../../types/transactions';
import {inventoryRevisions} from './inventoryRevisions';
import {isCommandConfirmed} from '../../types/transactions';

export function WebMovementReversalDialog({records,movement,command,onClose}:{
 records:BusinessRecord[];movement:BusinessRecord;onClose:()=>void;
 command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
}){
 const [reviewed]=useState(()=>records);
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const source=movement.data.sourceId;
 const affected=reviewed.filter(record=>record.collection==='stockMovements'&&record.data.sourceId===source);
 const alreadyReversed=reviewed.some(record=>record.collection==='movementCorrections'&&record.data.originalCommandId===source);
 const incomplete=affected.length!==(movement.data.movementType==='WASTE'?1:2);
 const missingEvidence=affected.some(record=>!record.data.restorationEvidence);
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(busy||pending||reason.trim().length<3||alreadyReversed||missingEvidence||incomplete)return;
  setBusy(true);setError('');
  try{
   // Transfer sides belong to one command and must restore together.
   const stocks=[...new Set(affected.map(record=>String(record.data.stockItemId)))];
   const locations=[...new Set(affected.map(record=>String(record.data.locationId)))];
   const outcome=await command('inventory.reverseMovement','movementCorrections',movement.id,{movementId:movement.id,reason:reason.trim(),...inventoryRevisions(reviewed,stocks,locations)});
   if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(true);
   if(isCommandConfirmed(outcome))onClose();else setError('message' in outcome?outcome.message:'The reversal is saved for outcome checking. Synchronize the original command before starting another correction.');
  }catch(cause){setError(operatorError(cause))}finally{setBusy(false)}
 };
 return <form onSubmit={event=>void submit(event)} className="space-y-4">
  <p className="text-sm text-slate-300">Reverse a recording mistake only when the physical movement did not happen. Both sides of a transfer restore together. The original history is retained.</p>
  <ul className="space-y-2 text-sm">{affected.map(record=>{
   const evidence=record.data.restorationEvidence as {before?:{quantity:number};after?:{quantity:number}}|undefined;
   return <li key={record.id} className="rounded border border-slate-700 p-3">{String(record.data.locationName||record.data.locationId)}: {evidence?.after?.quantity??'?'} → {evidence?.before?.quantity??'?'} {String(record.data.baseUnit||'')}</li>;
  })}</ul>
  {alreadyReversed&&<p role="alert">This recording has already been reversed.</p>}
  {incomplete&&<p role="alert">The complete original recording is not available in this view. Synchronize before reviewing the reversal.</p>}
  {missingEvidence&&<p role="alert">This recording has no exact restoration evidence. Review a current balance correction instead.</p>}
  <label className="block text-sm">Manager reason<textarea required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-3"/></label>
  {error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}
  <div className="flex gap-2"><button type="submit" disabled={busy||pending||incomplete||alreadyReversed||missingEvidence||!affected.length||reason.trim().length<3} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">{busy?'Checking original recording…':'Confirm exact reversal'}</button><button type="button" disabled={busy} onClick={onClose} className="rounded border border-slate-700 px-4 py-2">Cancel</button></div>
 </form>;
}
