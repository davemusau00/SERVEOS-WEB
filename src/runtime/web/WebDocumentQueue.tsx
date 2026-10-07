import type {ApiAuthenticatedDeviceSession} from './apiAuth';
import {readBridgePreference} from './printBridgePreferences';
import {submitDocumentToBridge} from './printBridgeSubmission';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {BusinessRecord} from './session';
import type {QueuedCommand,LocalBusinessDocument} from './BusinessStore';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {BusinessDocumentRenderer,businessDocumentStyles,printBusinessDocument} from './BusinessDocumentRenderer';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const issuedDocument=(record:BusinessRecord|undefined):LocalBusinessDocument|null=>{
 if(!record)return null;const d=record.data;
 if(typeof d.type!=='string'||typeof d.documentNumber!=='string'||typeof d.hash!=='string'||typeof d.issuedAt!=='string'||typeof d.layoutVersion!=='number'||!d.snapshot||typeof d.snapshot!=='object'||Array.isArray(d.snapshot))return null;
 return {id:record.id,type:d.type,documentNumber:d.documentNumber,hash:d.hash,issuedAt:d.issuedAt,layoutVersion:d.layoutVersion,snapshot:d.snapshot as Record<string,unknown>};
};
export function WebDocumentQueue({records,actorId,deviceId,disabled,command,readRecords,queue,apiAuth}:{apiAuth?:ApiAuthenticatedDeviceSession;records:BusinessRecord[];actorId:string;deviceId:string;disabled:boolean;command:Command;readRecords:()=>Promise<BusinessRecord[]>;queue:QueuedCommand[]}){
 const jobs=useMemo(()=>records.filter(row=>row.collection==='printJobs'&&!row.archived),[records]);
 const [selected,setSelected]=useState(''),[reason,setReason]=useState(''),[duplicate,setDuplicate]=useState(false),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[pending,setPending]=useState<Record<string,string>>({});
 const inFlight=useRef(false);
 const job=jobs.find(row=>row.id===selected);
 const document=issuedDocument(records.find(row=>row.collection==='businessDocuments'&&row.id===job?.data.documentId));
 useEffect(()=>{
  const resolved=Object.entries(pending).filter(([,commandId])=>{const entry=queue.find(row=>row.id===commandId);return entry&&['SYNCHRONIZED','REJECTED','CONFLICT'].includes(entry.state)});
  if(!resolved.length)return;
  setPending(old=>{const next={...old};for(const [id,commandId] of resolved)if(next[id]===commandId)delete next[id];return next});
  const entry=queue.find(row=>row.id===resolved[resolved.length-1][1]);
  setMessage(entry?.state==='SYNCHRONIZED'?'Original print action confirmed after recovery. Review the current delivery state; no new print attempt was started.':entry?.result?.error?.message||'The original print action did not confirm. Review the latest job before another action.');
 },[queue,pending]);
 const send=async(target:BusinessRecord,action:string,extra:Record<string,unknown>={})=>{
  const outcome=await command(`print.${action}`,'printJobs',target.id,{jobId:target.id,reason:reason.trim(),...extra,expectedVersions:[{collection:'printJobs',id:target.id,version:target.version}]});
  if(!isCommandConfirmed(outcome)){if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(old=>({...old,[target.id]:outcome.commandId}));setMessage('message' in outcome?outcome.message:'The print action is saved. Synchronize its original outcome in Activity before another action.');return false;}
  return true;
 };
 const unresolvedJob=(id:string)=>queue.some(entry=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state)&&entry.command.operation.startsWith('print.')&&entry.command.payload.jobId===id);
 const act=async(action:string)=>{
  if(!job||!document||inFlight.current||disabled||pending[job.id]!==undefined||unresolvedJob(job.id))return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   if(action==='bridge'){
    if(!apiAuth)throw new Error('An API device session is required.');
    const bridge=readBridgePreference(apiAuth.profile.businessId,deviceId);
    if(!bridge)throw new Error('Select the locally approved bridge in Settings before printing.');
    const source=records.find(row=>row.collection==='businessDocuments'&&row.id===document.id);
    if(!source)throw new Error('Synchronize the issued document first.');
    const result=await submitDocumentToBridge({auth:apiAuth,bridge,job,document:source,command,readRecords});
    if(result.kind==='CLAIM_UNRESOLVED'){
     const outcome=result.outcome;if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(old=>({...old,[job.id]:outcome.commandId}));
     setMessage('message' in outcome?outcome.message:'Recover the original API claim in Activity before another attempt.');return;
    }
    const report=result.report;if(report&&(report.kind==='PENDING'||report.kind==='OUTCOME_UNKNOWN')){const commandId=report.commandId;setPending(old=>({...old,[job.id]:commandId}));}
    setMessage(`Bridge request ${result.evidence.requestId} recorded. Check paper delivery and the shared job state; use Print Bridge recovery after any uncertainty.`);
   }else if(action==='print'){
    if(!await send(job,'claim'))return;
    const fresh=(await readRecords()).find(row=>row.collection==='printJobs'&&row.id===job.id);
    if(!fresh||fresh.version!==job.version+1||fresh.data.state!=='SENDING'||fresh.data.claimedBy!==actorId||fresh.data.claimedDeviceId!==deviceId){setMessage('The claim confirmed but its shared view is not current. Synchronize before reviewing this attempt. Nothing was sent to the printer.');return;}
    try{await printBusinessDocument(document)}catch(error){
     const detail=error instanceof Error?error.message:'Document preparation failed.';
     await send(fresh,'report',{outcome:'PREPARATION_FAILED',transportStarted:false,reason:detail.slice(0,500)});setMessage(detail);return;
    }
    if(!await send(fresh,'report',{outcome:'DELIVERY_UNCERTAIN',reason:'Browser print dialog opened; physical delivery requires operator confirmation.'}))return;
    setMessage('The browser print dialog cannot confirm paper delivery. Check the printer, then confirm delivery or review a possible duplicate before retrying.');
   }else if(action==='confirm')await send(job,'confirm',{operatorConfirmedPrinted:confirmed});
   else if(action==='retry')await send(job,'retry',{possibleDuplicateAcknowledged:duplicate});
   else await send(job,'cancel');
  }catch(error){setMessage(error instanceof Error?error.message:String(error))}finally{inFlight.current=false;setBusy(false)}
 };
 const state=String(job?.data.state||'');
 const uncertain=['SENDING','SENT_TO_SPOOLER','DELIVERY_UNCERTAIN'].includes(state);
 const blocked=disabled||busy||Boolean(job&&(pending[job.id]!==undefined||unresolvedJob(job.id)));
 return <section className="space-y-3 rounded-xl border border-slate-700 p-4">
  <h2 className="text-lg font-bold">Documents and printing</h2>
  <p className="text-sm text-slate-400">Review issued documents and resolve printer delivery. A browser print dialog does not prove the document printed.</p>
  <label className="block text-sm">Print job<select className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2" value={selected} disabled={busy} onChange={event=>{setSelected(event.target.value);setReason('');setDuplicate(false);setConfirmed(false);setMessage('')}}><option value="">Select a document…</option>{jobs.map(row=>{const doc=issuedDocument(records.find(item=>item.collection==='businessDocuments'&&item.id===row.data.documentId));return <option key={row.id} value={row.id}>{doc?.documentNumber||'Document unavailable'} · {String(row.data.printerRole)} · {String(row.data.state)}</option>})}</select></label>
  {job&&unresolvedJob(job.id)&&<p role="status">Checking the original saved print action. Synchronize before starting another attempt for this document.</p>}
  {job&&<><p className="text-sm">Attempt {Number(job.data.attempt||0)} · {state}</p>{!document&&<p role="alert">The immutable document is not available. Synchronize before printing.</p>}
   {document&&<details><summary className="cursor-pointer">Preview issued document</summary><div className="mt-2 overflow-auto rounded bg-white p-3 text-black" style={{fontFamily:'Arial,sans-serif',fontSize:12}}><style>{businessDocumentStyles.replace(/^html,body\{[^}]*\}/,'').split('@media print')[0]}</style><BusinessDocumentRenderer document={document}/></div></details>}
   {state==='QUEUED'&&<button type="button" disabled={blocked||!document} onClick={()=>void act('print')} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Print with browser</button>}
   {state==='QUEUED'&&apiAuth&&document&&document.layoutVersion===1&&['SUPPLIER_RETURN_NOTE','SUPPLIER_PAYMENT_VOUCHER','GOODS_RECEIPT','PURCHASE_ORDER','CLOSE_DAY_REPORT','SALES_RECEIPT','PAYMENT_ACKNOWLEDGEMENT','REFUND_RECEIPT','KOT','BOT','KOT_CANCEL','BOT_CANCEL','ORDER_VOID_NOTICE'].includes(document.type)&&<button type="button" disabled={blocked} onClick={()=>void act('bridge')} className="ml-2 rounded border border-amber-500 px-4 py-2 disabled:opacity-40">Print with approved bridge</button>}
   {(uncertain||state==='FAILED'||state==='QUEUED')&&<label className="block text-sm">Delivery review reason<textarea maxLength={500} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2"/></label>}
   {uncertain&&<><label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> I checked that this document physically printed</label><button type="button" disabled={blocked||!confirmed||reason.trim().length<3} onClick={()=>void act('confirm')} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40">Confirm delivery</button><label className="block text-sm"><input type="checkbox" checked={duplicate} onChange={event=>setDuplicate(event.target.checked)}/> I checked the printer and accept that retrying may print a duplicate</label></>}
   {(uncertain||state==='FAILED')&&<button type="button" disabled={blocked||reason.trim().length<3||uncertain&&!duplicate} onClick={()=>void act('retry')} className="rounded border border-amber-600 px-3 py-2 disabled:opacity-40">Requeue after review</button>}
   {['QUEUED','FAILED'].includes(state)&&<button type="button" disabled={blocked||reason.trim().length<3} onClick={()=>void act('cancel')} className="ml-2 rounded border border-slate-600 px-3 py-2 disabled:opacity-40">Cancel unsent job</button>}
  </>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
