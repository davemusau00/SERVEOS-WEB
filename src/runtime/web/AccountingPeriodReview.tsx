import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {BusinessRecord,WebSession} from './session';
import type {createServOSApiClient} from './apiClient';
import type {AccountingPeriodPolicyRecord,AccountingPeriodRecord,AccountingPeriodReviewRecord,ApiAccountingPeriodState} from './accountingPeriodTypes';
import type {CommandOutcome} from '../../types/transactions';
import {isCommandConfirmed} from '../../types/transactions';
import {businessDate} from '../../utils/businessTime';
import {formatFinancialMoney} from '../../utils/financialMoney';
import {WebActionDialog} from './WebActionDialog';

type Client=ReturnType<typeof createServOSApiClient>;
type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
type Action='ENABLE'|'DISABLE'|'REVIEW'|'CLOSE_REQUEST'|'REOPEN';
const control='min-h-11 rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm disabled:opacity-50';
const statusLabel=(status:string)=>status==='CLOSED'?'Closed':status==='REVIEW_REQUIRED'?'Review required':'Open';
const safeDate=(value:string,timeZone:string)=>{try{return new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone}).format(new Date(value))}catch{return value}};
const merge=<T extends BusinessRecord>(collection:string,cached:BusinessRecord[],fresh:T[]=[])=>{
 const map=new Map<string,T>();for(const row of [...cached.filter(item=>item.collection===collection),...fresh]){const old=map.get(row.id);if(!old||row.version>=old.version)map.set(row.id,row as T)}return [...map.values()];
};

export function AccountingPeriodReview({records,session,client,command,disabled,timeZone}:{records:BusinessRecord[];session:WebSession;client:Client;command:Command;disabled:boolean;timeZone:string}){
 const canManage=session.permissions.includes('*')||session.permissions.includes('accounting.manage');
 const cohort=session.capabilities?.['accounting.periods']===true,canTechnical=session.permissions.includes('*')||session.permissions.includes('audit.view');
 const [state,setState]=useState<ApiAccountingPeriodState|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [selectedId,setSelectedId]=useState(''),[draftId,setDraftId]=useState(()=>crypto.randomUUID()),[from,setFrom]=useState(()=>`${businessDate(new Date(),timeZone).slice(0,7)}-01`),[to,setTo]=useState(()=>businessDate(new Date(),timeZone));
 const [action,setAction]=useState<Action|null>(null),[selectedReviewId,setSelectedReviewId]=useState(''),[fetchedReview,setFetchedReview]=useState<AccountingPeriodReviewRecord|null>(null),[reviewLoading,setReviewLoading]=useState(false);
 const [recovery,setRecovery]=useState<{commandId:string|null}|null>(null),[recovering,setRecovering]=useState(false);
 const request=useRef(0),reviewRequest=useRef(0),inFlight=useRef(false);
 const periods=useMemo(()=>merge<AccountingPeriodRecord>('accountingPeriods',records,state?.periods).sort((a,b)=>b.data.to.localeCompare(a.data.to)),[records,state]);
 const reviews=useMemo(()=>merge<AccountingPeriodReviewRecord>('accountingPeriodReviews',records,[...(state?.reviews??[]),...(fetchedReview?[fetchedReview]:[])]).sort((a,b)=>b.data.recordedAt.localeCompare(a.data.recordedAt)),[records,state,fetchedReview]);
 const policies=merge<AccountingPeriodPolicyRecord>('accountingPeriodPolicy',records,state?.policy?[state.policy]:[]),policy=policies[0]??null;
 const selected=periods.find(row=>row.id===selectedId)??null,currentReview=reviews.find(row=>row.id===(selectedReviewId||selected?.data.currentReviewId))??null;
 const relevantReviews=reviews.filter(row=>row.data.periodId===selectedId);
 const mutationDisabled=disabled||loading||!state||!canManage||!cohort||recovery!==null;
 const periodActionsDisabled=mutationDisabled||!policy?.data.enabled;
 const load=async()=>{
  if(disabled)return;const serial=++request.current;setLoading(true);setError('');
  try{const data=await client.accountingPeriods();if(serial===request.current)setState(data)}
  catch(cause){if(serial===request.current)setError(cause instanceof Error?cause.message:'Period records could not be loaded. Existing evidence is retained.')}
  finally{if(serial===request.current)setLoading(false)}
 };
 useEffect(()=>{void load();return()=>{request.current++;reviewRequest.current++}},[client,disabled]);
 const choose=(value:string)=>{setSelectedId(value);setSelectedReviewId('');setFetchedReview(null);setReviewLoading(false);reviewRequest.current++;if(!value){setDraftId(crypto.randomUUID());return}const period=periods.find(row=>row.id===value);if(period){setFrom(period.data.from);setTo(period.data.to)}};
 const selectReview=async(id:string)=>{
  setSelectedReviewId(id);setFetchedReview(null);const serial=++reviewRequest.current;
  if(reviews.some(row=>row.id===id&&row.data.statementSnapshot))return;
  if(disabled){setError('This historical review is not cached. Reconnect to load its original snapshot.');return}
  setReviewLoading(true);try{const row=await client.accountingPeriodReview(id);if(serial===reviewRequest.current)setFetchedReview(row)}catch(cause){if(serial===reviewRequest.current)setError(cause instanceof Error?cause.message:'The review could not be loaded.')}finally{if(serial===reviewRequest.current)setReviewLoading(false)}
 };
 const snapshotId=selectedReviewId||selected?.data.currentReviewId||'',hasSnapshot=Boolean(currentReview?.data.statementSnapshot);
 useEffect(()=>{if(snapshotId&&!hasSnapshot&&!disabled)void selectReview(snapshotId)},[snapshotId,hasSnapshot,disabled,client]);
 const submit=async(values:Record<string,string>)=>{
  if(!action||inFlight.current||mutationDisabled)throw new Error('Refresh the period record and recover any original request before making another change.');
  if(!['ENABLE','DISABLE','REOPEN'].includes(action)&&!policy?.data.enabled)throw new Error('Enable this business period-review policy first.');
  const policyAction=action==='ENABLE'||action==='DISABLE',collection=policyAction?'accountingPeriodPolicy':'accountingPeriods',key=policyAction?session.businessId:selected?.id??draftId;
  const operation=policyAction?'accountingPeriod.policy.save':action==='REOPEN'?'accountingPeriod.reopen':action==='CLOSE_REQUEST'?'accountingPeriod.close':'accountingPeriod.review';
  const payload={id:key,reason:values.reason,expectedVersions:[{collection,id:key,version:policyAction?policy?.version??0:selected?.version??0}],...(policyAction?{enabled:action==='ENABLE'}:action==='REOPEN'?{}:{from,to})};
  inFlight.current=true;setNotice('');setError('');let outcomeReceived=false;
  try{
   const outcome=await command(operation,collection,key,payload);
   outcomeReceived=true;
   if(!isCommandConfirmed(outcome)){
    if(outcome.kind==='OUTCOME_UNKNOWN'||outcome.kind==='PENDING'){setRecovery({commandId:outcome.commandId});throw new Error('The original request needs recovery. Do not submit a replacement request; inspect Activity & Sync.')}
    throw new Error('message' in outcome?outcome.message:'The period request was not confirmed.');
   }
   if(!policyAction){setSelectedId(key);setSelectedReviewId('')}
   setNotice(action==='CLOSE_REQUEST'?'Close request recorded by the server. Authoritative closure is unavailable; read the saved review requirements.':action==='REVIEW'?'Review recorded by the server. It does not close the ledger or post an adjustment.':action==='REOPEN'?'The period was reopened with an audit reason. Its previous report snapshots remain unchanged.':action==='ENABLE'?'Period reviews enabled for this business. Authoritative ledger close remains unavailable.':'New period reviews disabled. History and existing closed-date protection are retained.');
   await load();
  }catch(cause){
   // The command helper normally returns explicit unknown outcomes. A thrown
   // infrastructure error has no safe new-ID retry path in this component.
   if(!outcomeReceived){const original=cause as {commandId?:unknown}|null;setRecovery({commandId:typeof original?.commandId==='string'?original.commandId:null})}
   throw cause;
  }finally{inFlight.current=false}
 };
 const recover=async()=>{
  if(!recovery?.commandId||disabled||recovering)return;setRecovering(true);setError('');
  try{const saved=await client.commandStatus(recovery.commandId);if(['CONFIRMED','REJECTED','CONFLICT'].includes(saved.status)&&saved.outcome){setRecovery(null);setAction(null);setNotice(saved.status==='CONFIRMED'?'The original request is server-confirmed. Refreshing the current period and its saved assessment.':saved.error?.message||'The original request was rejected. Refresh and review the current period before a new request.');await load()}else setNotice('The original request still has an unresolved outcome. Recover that same request in Activity & Sync.')}catch(cause){setError(cause instanceof Error?cause.message:'The original request could not be recovered. No replacement was submitted.')}finally{setRecovering(false)}
 };
 const review=currentReview?.data,statement=review?.statementSnapshot?.statement;
 const events=merge('accountingPeriodEvents',records,state?.events).filter(row=>row.data.periodId===selectedId).sort((a,b)=>String(b.data.occurredAt).localeCompare(String(a.data.occurredAt)));
 const description=action==='ENABLE'?'Enable review snapshots for this business and authorised pilot devices. This does not activate authoritative ledger closing.':action==='DISABLE'?'Disable new review creation without deleting records or removing any existing closed-date posting protection.':action==='REOPEN'?'Allow postings dated within this previously closed period. Preserve the earlier closed report and record why recovery is necessary. Never silently re-date received cash.':action==='CLOSE_REQUEST'?'Record an immutable close review. Unresolved commands, cash, shifts and incomplete accounting coverage prevent authoritative closing. No financial adjustment is posted.':'Preserve the current statement and source controls as an immutable review. Postings remain allowed; this is not ledger closing.';
 return <section data-guide-anchor="web.accounting-periods" className="space-y-4 rounded-xl border border-slate-800 p-4">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Accounting period review</h3><p className="mt-1 max-w-3xl text-sm text-slate-400">Review immutable statement snapshots, outstanding cash and unposted sources. This candidate cannot certify or close the ledger while accounting and terminal-queue coverage remain incomplete.</p></div><button type="button" className={control} disabled={disabled||loading} onClick={()=>void load()}>{loading?'Loading...':'Refresh periods'}</button></div>
  {disabled&&<p role="status" className="text-sm text-amber-200">API unavailable. Cached history is retained; review and reopening require a confirmed online request.</p>}
  {state&&<p className="text-xs text-slate-400">Server review records refreshed {safeDate(state.generatedAt,timeZone)}. New reviews: {policy?.data.enabled?'enabled':'disabled'}. Authoritative close: unavailable.</p>}
  {!cohort&&<p className="text-sm text-slate-400">Period actions are outside this staff/device pilot. Authorised historical evidence remains readable.</p>}
  {!canManage&&<p className="text-sm text-slate-400">Accounting management permission is required to save review policy, record reviews or reopen a closed period.</p>}
  {error&&<p role="alert" className="rounded border border-rose-800 bg-rose-950/20 p-3 text-sm text-rose-200">{error}</p>}
  {notice&&<p role="status" className="rounded border border-slate-700 p-3 text-sm text-slate-200">{notice}</p>}
  {recovery&&<div role="alert" className="space-y-2 rounded border border-amber-700 p-3"><p className="text-sm text-amber-200">An original period request is unresolved. Further changes are held until its outcome is recovered; no request is replaced.</p>{recovery.commandId&&<button className={control} disabled={disabled||recovering} onClick={()=>void recover()}>{recovering?'Checking original request...':'Check original request'}</button>}{canTechnical&&recovery.commandId&&<details className="text-xs"><summary>Technical request reference</summary><code className="break-all">{recovery.commandId}</code></details>}</div>}
  {canManage&&cohort&&<button className={control} disabled={mutationDisabled} onClick={()=>setAction(policy?.data.enabled?'DISABLE':'ENABLE')}>{policy?.data.enabled?'Disable new period reviews':'Enable period reviews'}</button>}
  <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Accounting period<select className={`${control} mt-1 w-full`} value={selectedId} onChange={event=>choose(event.target.value)} disabled={action!==null}><option value="">New period review</option>{periods.map(row=><option key={row.id} value={row.id}>{row.data.from} to {row.data.to} ({statusLabel(row.data.status)})</option>)}</select></label><label className="text-sm">From<input className={`${control} mt-1 w-full`} type="date" required value={from} readOnly={selected!==null} disabled={action!==null} onChange={event=>setFrom(event.target.value)}/></label><label className="text-sm">To<input className={`${control} mt-1 w-full`} type="date" required value={to} readOnly={selected!==null} disabled={action!==null} onChange={event=>setTo(event.target.value)}/></label></div>
  {selected&&<p className="text-sm">{statusLabel(selected.data.status)} in {selected.data.timeZone}. {selected.data.status==='REVIEW_REQUIRED'?'Postings remain allowed; this review is not a closed ledger.':selected.data.status==='CLOSED'?'Original posting dates are protected until authorised reopening.':'Postings remain allowed.'}</p>}
  <div className="flex flex-wrap gap-2"><button className={control} disabled={periodActionsDisabled||selected?.data.status==='CLOSED'||!from||!to||from>to} onClick={()=>setAction('REVIEW')}>Save review snapshot</button><button className={control} disabled={periodActionsDisabled||selected?.data.status==='CLOSED'||!from||!to||from>to} onClick={()=>setAction('CLOSE_REQUEST')}>Review close requirements</button>{selected?.data.status==='CLOSED'&&<button className={control} disabled={mutationDisabled} onClick={()=>setAction('REOPEN')}>Reopen with reason</button>}</div>
  {selected&&<div className="space-y-3"><label className="block text-sm">Saved review<select className={`${control} mt-1 w-full`} value={selectedReviewId||selected.data.currentReviewId||''} onChange={event=>void selectReview(event.target.value)}><option value="">Choose a saved review</option>{relevantReviews.map(row=><option value={row.id} key={row.id}>{safeDate(row.data.recordedAt,selected.data.timeZone)} - {row.data.purpose==='CLOSE_REQUEST'?'Close requirements':row.data.purpose==='CLOSED'?'Closed report':'Review'} - {row.data.recordedByName}</option>)}{selected.data.currentReviewId&&!relevantReviews.some(row=>row.id===selected.data.currentReviewId)&&<option value={selected.data.currentReviewId}>Load the current saved review</option>}{selected.data.lastClosedReviewId&&!relevantReviews.some(row=>row.id===selected.data.lastClosedReviewId)&&selected.data.lastClosedReviewId!==selected.data.currentReviewId&&<option value={selected.data.lastClosedReviewId}>Load the original closed report</option>}</select></label>{!currentReview&&selected.data.currentReviewId&&<button className={control} disabled={disabled||reviewLoading} onClick={()=>void selectReview(selected.data.currentReviewId!)}>Load saved snapshot</button>}{reviewLoading&&<p role="status">Loading immutable review...</p>}
   {review&&statement&&<article className="space-y-3 rounded border border-slate-700 bg-slate-950/50 p-3"><h4 className="font-medium">Saved statement: {statement.from} to {statement.to}</h4><p className="text-sm text-slate-300">Recorded by {review.recordedByName}, {safeDate(review.recordedAt,statement.timeZone)}. Reason: {review.reason}</p><p className="text-xs text-slate-400">Report version {statement.reportVersion}; generated {safeDate(statement.generatedAt,statement.timeZone)}. Saved figures and coverage are preserved even after later postings or reopening.</p><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt>Recorded net revenue</dt><dd className="font-semibold">{formatFinancialMoney(statement.totals.netRevenueMinor)}</dd></div><div><dt>Recorded POS cost of sales</dt><dd>{formatFinancialMoney(statement.totals.recordedPosCogsMinor)}</dd></div><div><dt>Posted operating expenses</dt><dd>{formatFinancialMoney(statement.totals.postedOperatingExpensesMinor)}</dd></div><div><dt>Whole-business profit</dt><dd>Unavailable - accounting coverage incomplete</dd></div></dl><div><h5 className="font-medium">Outstanding close requirements</h5><ul className="mt-2 space-y-2 text-sm text-amber-100">{review.assessment.blockers.map(item=><li key={item.code} className="rounded border border-amber-900/60 p-2">{item.count===null?'':`${item.count} - `}{item.message}</li>)}</ul></div>{canTechnical&&<details className="text-xs text-slate-400"><summary className="cursor-pointer">Technical snapshot evidence</summary><p className="mt-2 break-all">Snapshot SHA-256: {review.snapshotHash}</p><p className="break-all">Original command: {review.sourceCommandId}</p></details>}</article>}
   {!!events.length&&<details><summary className="cursor-pointer text-sm">Period audit history ({events.length} loaded events)</summary><ol className="mt-2 space-y-2 text-sm">{events.map(row=><li key={row.id} className="rounded border border-slate-800 p-2"><b>{String(row.data.eventType)==='REOPENED'?'Reopened':String(row.data.eventType)==='CLOSE_REQUIRES_REVIEW'?'Close request requires review':String(row.data.eventType)==='CLOSED'?'Closed':'Review recorded'}</b><p>{safeDate(String(row.data.occurredAt),selected.data.timeZone)} - {String(row.data.reason)}</p></li>)}</ol></details>}
  </div>}
  {state&&(state.totalPeriods>periods.length||state.totalReviews>reviews.length)&&<p className="text-xs text-slate-400">This view loads the latest {state.periods.length} periods and {state.reviews.length} reviews. Original selected-period and closed-review links remain available; complete paginated historical reporting is pending.</p>}
  {!periods.length&&!loading&&<p className="text-sm text-slate-400">No accounting periods are recorded. This does not certify that accounting or offline queues are complete.</p>}
  {action&&<WebActionDialog title={action==='ENABLE'?'Enable accounting reviews?':action==='DISABLE'?'Disable new reviews?':action==='REOPEN'?`Reopen ${from} to ${to}?`:action==='CLOSE_REQUEST'?`Review close requirements for ${from} to ${to}`:`Save period review: ${from} to ${to}`} description={description} fields={[{name:'reason',label:'Accounting review reason',multiline:true,minLength:3,maxLength:500}]} confirmLabel={action==='REOPEN'?'Reopen with reason':action==='ENABLE'||action==='DISABLE'?'Save review policy':action==='CLOSE_REQUEST'?'Record close requirements':'Save review snapshot'} danger={action==='REOPEN'} disabled={mutationDisabled} onClose={()=>setAction(null)} onConfirm={submit}/>}
 </section>;
}
