import React,{useEffect,useRef,useState} from 'react';
import type {BusinessRecord,WebSession} from './session';
import {allowed} from './session';
import type {QueuedCommand,LocalBusinessDocument} from './BusinessStore';
import {Dialog} from '../../design-system/controls';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {BusinessDocumentRenderer,businessDocumentPreviewStyles} from './BusinessDocumentRenderer';
import {buildVerifiedCloseDayReportCsv} from './closeDayReportCsv';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
export function WebApiCloseDayReports({records,session,queue,disabled,command}:{records:BusinessRecord[];session:WebSession;queue:QueuedCommand[];disabled:boolean;command:Command}){
 const reports=records.filter(row=>row.collection==='closeDayReports'&&!row.archived).sort((a,b)=>String(b.data.generatedAt).localeCompare(String(a.data.generatedAt)));
 const tills=records.filter(row=>row.collection==='tillSessions'&&row.data.status==='CLOSED'&&!reports.some(report=>report.data.tillSessionId===row.id));
 const [review,setReview]=useState<{till:BusinessRecord;id:string}|null>(null),[selected,setSelected]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pendingId,setPendingId]=useState('');
 const inFlight=useRef(false);
 useEffect(()=>{
  if(!pendingId)return;const saved=queue.find(row=>row.id===pendingId);
  if(!saved||['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(saved.state))return;
  setPendingId('');
  if(saved.state==='SYNCHRONIZED'){setSelected(String(saved.command.payload.id));setReview(null);setMessage('The original close-day report confirmed after recovery.');}
  else setMessage(saved.result?.error?.message||'The original report did not confirm. Review current records before trying again.');
 },[queue,pendingId]);
 const issue=async()=>{
  if(!review||disabled||inFlight.current||pendingId)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const outcome=await command('closeDay.generate','closeDayReports',review.id,{id:review.id,tillId:review.till.id,expectedVersions:[{collection:'closeDayReports',id:review.id,version:0},{collection:'tillSessions',id:review.till.id,version:review.till.version}]});
   if(isCommandConfirmed(outcome)){setSelected(review.id);setReview(null);setMessage('Close-day report issued. Use the document queue to print it.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPendingId(outcome.commandId);setMessage('message' in outcome?outcome.message:'Recover the original report action in Saved changes before generating another.');}
  }catch(error){setMessage(error instanceof Error?error.message:'The report outcome could not be confirmed. Check Saved changes before submitting again.');}
  finally{inFlight.current=false;setBusy(false);}
 };
 const report=reports.find(row=>row.id===selected),d=report?.data;
 const document:LocalBusinessDocument|null=d&&typeof d.documentId==='string'&&typeof d.documentNumber==='string'&&typeof d.hash==='string'&&typeof d.generatedAt==='string'&&typeof d.layoutVersion==='number'&&d.snapshot&&typeof d.snapshot==='object'&&!Array.isArray(d.snapshot)?{id:d.documentId,type:'CLOSE_DAY_REPORT',documentNumber:d.documentNumber,layoutVersion:d.layoutVersion,hash:d.hash,issuedAt:d.generatedAt,snapshot:d.snapshot as Record<string,unknown>}:null;
 const downloadCsv=async()=>{
  if(!document)return;
  try{
   const csv=await buildVerifiedCloseDayReportCsv(document),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),anchor=window.document.createElement('a');
   anchor.href=url;anchor.download=`${document.documentNumber.replace(/[^a-zA-Z0-9._-]/gu,'_')}.csv`;window.document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){setMessage(error instanceof Error?error.message:'The issued report could not be exported. Synchronize and review it before retrying.');}
 };
 return <section data-guide-anchor="finance.close-day" className="mt-5 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4" aria-label="Close-day reports">
  <h2 className="text-lg font-bold">Close-day reports</h2><p className="text-sm text-slate-400">One immutable report per closed till. Payment postings and refunds are reconciled to journals and drawer evidence. Customer-credit accruals and collections are reported separately from received tender; room and folio exposure remain unavailable.</p>
  {allowed(session,'reports.view')&&<div className="space-y-2">{!tills.length&&<p className="text-sm text-slate-400">No loaded closed till needs a report. Close and review a till before issuing one.</p>}{tills.map(till=><button key={till.id} disabled={disabled||busy||!!pendingId} className="block w-full rounded-lg border border-slate-600 p-3 text-left disabled:opacity-40" onClick={()=>{if(window.document.querySelector('[role="dialog"]')){setMessage('Finish the open review first.');return;}setReview({till,id:crypto.randomUUID()});setMessage('')}}>Review report for till {till.id}<span className="block text-xs text-slate-400">Closed {String(till.data.closedAt)} · Outlet {String(till.data.outletId)}</span></button>)}</div>}
  {message&&<p role="status" className="rounded bg-slate-950 p-3 text-sm">{message}</p>}
  <label className="block text-sm">Issued report<select className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Select a report</option>{reports.map(row=><option key={row.id} value={row.id}>{String(row.data.generatedAt)} · {String(row.data.tillSessionId)}</option>)}</select></label>
  {document&&<><div className="flex flex-wrap items-center gap-2"><button type="button" className="rounded border border-slate-600 px-3 py-2 text-sm" onClick={()=>void downloadCsv()}>Download verified CSV</button><p className="text-xs text-slate-400">Exports the immutable issued snapshot after hash verification; it does not recalculate report figures.</p></div><div className="servos-document-preview overflow-auto rounded bg-white p-3 text-black"><style>{businessDocumentPreviewStyles}</style><BusinessDocumentRenderer document={document}/></div></>}
  {review&&<Dialog title="Issue immutable close-day report" onClose={()=>{if(!busy&&!pendingId)setReview(null)}}><div className="space-y-3"><p>Till {review.till.id}</p><p className="text-sm text-slate-400">This freezes the server report for this closed till. Its figures cannot be edited or regenerated. Current business-wide open-order and unresolved-command diagnostics are identified separately from the till close period.</p><p className="text-sm text-slate-400">Historical money missing accounting journals must be reconciled before issue. Credit charges and reversals appear as separate accrued account sales; collections remain separate tender. PMS figures are not inferred.</p><button disabled={disabled||busy||!!pendingId} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" onClick={()=>void issue()}>Issue report</button></div></Dialog>}
 </section>;
}
