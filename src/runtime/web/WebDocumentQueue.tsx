import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {BusinessRecord} from './session';
import type {LocalBusinessDocument} from './BusinessStore';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {BusinessDocumentRenderer,businessDocumentStyles,printBusinessDocument} from './BusinessDocumentRenderer';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const issuedDocument=(record:BusinessRecord|undefined):LocalBusinessDocument|null=>{
 if(!record)return null;const d=record.data;
 if(typeof d.type!=='string'||typeof d.documentNumber!=='string'||typeof d.hash!=='string'||typeof d.issuedAt!=='string'||typeof d.layoutVersion!=='number'||!d.snapshot||typeof d.snapshot!=='object'||Array.isArray(d.snapshot))return null;
 return {id:record.id,type:d.type,documentNumber:d.documentNumber,hash:d.hash,issuedAt:d.issuedAt,layoutVersion:d.layoutVersion,snapshot:d.snapshot as Record<string,unknown>};
};
export function WebDocumentQueue({records,actorId,deviceId,disabled,command,readRecords}:{records:BusinessRecord[];actorId:string;deviceId:string;disabled:boolean;command:Command;readRecords:()=>Promise<BusinessRecord[]>}){
 const jobs=useMemo(()=>records.filter(row=>row.collection==='printJobs'&&!row.archived),[records]);
 const [selected,setSelected]=useState(''),[reason,setReason]=useState(''),[duplicate,setDuplicate]=useState(false),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[pending,setPending]=useState<Record<string,number>>({});
 const inFlight=useRef(false);
 const job=jobs.find(row=>row.id===selected);
 const document=issuedDocument(records.find(row=>row.collection==='businessDocuments'&&row.id===job?.data.documentId));
 useEffect(()=>{setPending(old=>{const next={...old};let changed=false;for(const [id,version] of Object.entries(old)){const current=jobs.find(row=>row.id===id);if(current&&current.version>version){delete next[id];changed=true}}return changed?next:old})},[jobs]);
 const send=async(target:BusinessRecord,action:string,extra:Record<string,unknown>={})=>{
  const outcome=await command(`print.${action}`,'printJobs',target.id,{jobId:target.id,reason:reason.trim(),...extra,expectedVersions:[{collection:'printJobs',id:target.id,version:target.version}]});
  if(!isCommandConfirmed(outcome)){if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(old=>({...old,[target.id]:target.version}));setMessage('message' in outcome?outcome.message:'The print action is saved. Synchronize its original outcome in Activity before another action.');return false;}
  return true;
 };
 const act=async(action:string)=>{
  if(!job||!document||inFlight.current||disabled||pending[job.id]!==undefined)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   if(action==='print'){
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
 const blocked=disabled||busy||Boolean(job&&pending[job.id]!==undefined);
 return <section className="space-y-3 rounded-xl border border-slate-700 p-4">
  <h2 className="text-lg font-bold">Documents and printing</h2>
  <p className="text-sm text-slate-400">Review issued documents and resolve printer delivery. A browser print dialog does not prove the document printed.</p>
  <label className="block text-sm">Print job<select className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2" value={selected} disabled={busy} onChange={event=>{setSelected(event.target.value);setReason('');setDuplicate(false);setConfirmed(false);setMessage('')}}><option value="">Select a document…</option>{jobs.map(row=>{const doc=issuedDocument(records.find(item=>item.collection==='businessDocuments'&&item.id===row.data.documentId));return <option key={row.id} value={row.id}>{doc?.documentNumber||'Document unavailable'} · {String(row.data.printerRole)} · {String(row.data.state)}</option>})}</select></label>
  {job&&<><p className="text-sm">Attempt {Number(job.data.attempt||0)} · {state}</p>{!document&&<p role="alert">The immutable document is not available. Synchronize before printing.</p>}
   {document&&<details><summary className="cursor-pointer">Preview issued document</summary><div className="mt-2 overflow-auto rounded bg-white p-3 text-black" style={{fontFamily:'Arial,sans-serif',fontSize:12}}><style>{businessDocumentStyles.replace(/^html,body\{[^}]*\}/,'').split('@media print')[0]}</style><BusinessDocumentRenderer document={document}/></div></details>}
   {state==='QUEUED'&&<button type="button" disabled={blocked||!document} onClick={()=>void act('print')} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Print with browser</button>}
   {(uncertain||state==='FAILED'||state==='QUEUED')&&<label className="block text-sm">Delivery review reason<textarea maxLength={500} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2"/></label>}
   {uncertain&&<><label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> I checked that this document physically printed</label><button type="button" disabled={blocked||!confirmed||reason.trim().length<3} onClick={()=>void act('confirm')} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-40">Confirm delivery</button><label className="block text-sm"><input type="checkbox" checked={duplicate} onChange={event=>setDuplicate(event.target.checked)}/> I checked the printer and accept that retrying may print a duplicate</label></>}
   {(uncertain||state==='FAILED')&&<button type="button" disabled={blocked||reason.trim().length<3||uncertain&&!duplicate} onClick={()=>void act('retry')} className="rounded border border-amber-600 px-3 py-2 disabled:opacity-40">Requeue after review</button>}
   {['QUEUED','FAILED'].includes(state)&&<button type="button" disabled={blocked||reason.trim().length<3} onClick={()=>void act('cancel')} className="ml-2 rounded border border-slate-600 px-3 py-2 disabled:opacity-40">Cancel unsent job</button>}
  </>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
