import React, { useState } from 'react';
import { useRuntime } from '../runtime/RuntimeProvider';
import { resolveOperationDependencies } from '../runtime/web/dependencies';
import { ActionDialog } from './ActionDialog';
import { buttonClass, fieldClass, primaryButtonClass } from './records';

type LinkedCorrectionProps={receipt:any;movement?:boolean;onClose:()=>void};
export function ReceiptCorrectionDialog(props:LinkedCorrectionProps){const runtime=useRuntime();return <LinkedCorrectionDialog {...props} runtime={runtime}/>;}
export function LinkedCorrectionDialog({receipt,movement,onClose,runtime}:LinkedCorrectionProps&{runtime:{snapshot:ReturnType<typeof useRuntime>['snapshot'];command:(operation:string,payload:Record<string,unknown>,version?:number,id?:string)=>Promise<unknown>;correctionCommandStatus:(id:string)=>Promise<string>}}) {
  const snapshot = runtime.snapshot!;
  const operation=movement?'inventory.reverseMovement':'procurement.reverseUnusedReceipt';
  const target=movement?{movementId:receipt.id}:{goodsReceiptId:receipt.id};
  const key=`servos-linked-correction:${snapshot.terminalId}:${snapshot.actor.id}:${receipt.id}`;
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [reason,setReason]=useState('');const [confirmed,setConfirmed]=useState(false);const [review,setReview]=useState(false);
  const [baseline]=useState(()=>resolveOperationDependencies(operation,movement?'movementCorrections':'receiptCorrections','new',target,snapshot.records).filter(entry=>!(entry.id==='new')));
  const [pending,setPending]=useState<{id:string;payload:Record<string,unknown>}|null>(()=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}});
  const submit=async()=>{if(busy)return;setBusy(true);setError('');try{
    const request=pending||{id:crypto.randomUUID(),payload:{...target,reason:reason.trim(),...(movement?{confirmedRecordingMistake:true}:{confirmedUnusedDuplicate:true}),expectedVersions:baseline}};
    // Persist before dispatch. A failed refresh/restart retains the exact command identity.
    localStorage.setItem(key,JSON.stringify(request));setPending(request);
    await runtime.command(operation,request.payload,undefined,request.id);localStorage.removeItem(key);onClose();
  }catch(cause){setError(`${String(cause)}. Retry uses the original correction command.`)}finally{setBusy(false)}};
  const discardResolved=async()=>{if(!pending||busy)return;setBusy(true);try{const state=await runtime.correctionCommandStatus(pending.id);if(!['NOT_COMMITTED','REJECTED','CONFLICT'].includes(state))throw new Error('Retry this command to recover its committed or pending outcome');localStorage.removeItem(key);setPending(null);setReview(false);}catch(cause){setError(String(cause))}finally{setBusy(false)}};
  return <ActionDialog title="Correct mistake · Goods receipt" busy={busy} onClose={onClose}><div className="space-y-3"><b>{receipt.grnNumber||receipt.movementType}</b><p className="text-sm text-slate-400">{movement?'Reverse a mistaken transfer or waste recording only when no later stock or cost activity prevents exact restoration. Otherwise correct the current physical balance.':'Reverse an unused duplicate receipt only when stock, cost, purchase order and payable evidence permit exact restoration.'} Original records remain in history.</p><p className="rounded border border-amber-500/30 p-3 text-sm">Consumed stock, wrong prices, supplier returns and paid or matched invoices require the accounting correction design. These operations remain disabled until that design is approved.</p>
    {!pending&&!review&&<><label className="block text-sm">Reason<textarea className={fieldClass} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{movement?'This was a recording mistake; the goods have not physically moved or been wasted.':'This is a duplicate recording; no goods are being physically returned.'}</label><button className={primaryButtonClass} disabled={!confirmed||!reason.trim()} onClick={()=>setReview(true)}>Review full reversal</button></>}
    {(review||pending)&&<><p className="text-sm">{movement?'The original movement is preserved with a linked compensating correction.':'The entire supported receipt will be corrected together: stock and cost, PO fulfilment, supplier payable and a linked reversing journal.'}</p><p>{String(pending?.payload.reason||reason)}</p><button className={buttonClass} disabled={!!pending||busy} onClick={()=>setReview(false)}>Back</button><button className={primaryButtonClass} disabled={busy} onClick={()=>void submit()}>{pending?'Retry correction':movement?'Confirm movement reversal':'Confirm unused duplicate reversal'}</button></>}
    {pending&&<button className={buttonClass} disabled={busy} onClick={()=>void discardResolved()}>Discard resolved rejected review</button>}{error&&<p role="alert" className="text-sm text-rose-200">{error}</p>}
  </div></ActionDialog>;
}
