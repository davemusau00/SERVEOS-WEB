import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {BusinessRecord,WebSession} from './session';
import type {createServOSApiClient} from './apiClient';
import type {ApiHistoricalCostSource,ApiHistoricalCostState,HistoricalCostKind,HistoricalCostPolicyRecord,HistoricalCostSourceRecord} from './historicalCostTypes';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {formatFinancialMoney} from '../../utils/financialMoney';
import {WebActionDialog} from './WebActionDialog';

type Client=ReturnType<typeof createServOSApiClient>;
type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
type Action='ENABLE'|'DISABLE'|'REVIEW';
const control='min-h-11 rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm disabled:opacity-50';
const kinds:Array<HistoricalCostKind|'ALL'>=['ALL','POS_BILL','POS_CONSUMPTION','PHYSICAL_RETURN','VOID_LOSS','WASTE','WASTE_REVERSAL'];
const kindLabel=(kind:HistoricalCostKind|'ALL')=>({ALL:'All sources',POS_BILL:'Issued bills',POS_CONSUMPTION:'Preparation consumption',PHYSICAL_RETURN:'Unopened physical returns',VOID_LOSS:'Voided preparation losses',WASTE:'Stock waste',WASTE_REVERSAL:'Waste corrections'})[kind];
const stateLabel=(state:string)=>state==='RECONCILIATION_REQUIRED'?'Reconciliation required':'Evidence recorded';
const safeDate=(value:string,timeZone:string)=>{try{return new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone}).format(new Date(value))}catch{return value}};
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const readable=(value:unknown,fallback:string)=>typeof value==='string'&&value.trim()&&!/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(value)?value:fallback;
// Original unit costs can contain fractional cents. Preserve their decimal
// strings; rounding these rates to cash cents would change historical costing.
const originalRate=(value:unknown)=>{
 if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value))return 'Unavailable';
 const [integral,fraction='']=value.split('.'),minor=BigInt(integral);
 const decimals=(String(minor%100n).padStart(2,'0')+fraction).replace(/0+$/,'').padEnd(2,'0');
 return `KES ${(minor/100n).toLocaleString('en-KE')}.${decimals}`;
};
const integerCost=(value:unknown)=>{
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>=0?parsed:null;
};

function OriginalCostEvidence({source}:{source:HistoricalCostSourceRecord}){
 const evidence=source.data.sourceSnapshot?.evidence;if(!evidence)return null;
 const consumptionRows=Array.isArray(evidence.consumptions)?evidence.consumptions.map(object).filter((row):row is Record<string,unknown>=>row!==null):[];
 const values=consumptionRows.length?consumptionRows:[evidence];
 return <div className="space-y-2"><h5 className="font-medium">Original source valuation</h5><p className="text-xs text-slate-400">Quantities and rates use the captured source values. No current inventory rate is substituted.</p><ol className="space-y-2">{values.map((row,index)=>{
  const quantity=row.originalQuantity??row.quantity,rate=row.originalUnitCostMinor??row.unitCostMinor,cost=row.originalCostMinor??row.costMinor;
  return <li key={index} className="rounded border border-slate-800 p-3 text-sm"><p className="font-medium">{readable(row.itemName,consumptionRows.length?`Source line ${index+1}`:source.data.description)}</p><dl className="mt-2 grid gap-2 sm:grid-cols-3"><div><dt className="text-slate-400">Original quantity</dt><dd className="break-words">{typeof quantity==='string'?quantity:'Unavailable'} {typeof row.baseUnit==='string'?row.baseUnit:''}</dd></div><div><dt className="text-slate-400">Original unit cost</dt><dd className="break-words tabular-nums">{originalRate(rate)}</dd></div><div><dt className="text-slate-400">Source cost</dt><dd className="tabular-nums">{formatFinancialMoney(integerCost(cost))}</dd></div></dl>{row.returnedCostMinor!==undefined&&<p className="mt-2">Confirmed returned cost: {formatFinancialMoney(integerCost(row.returnedCostMinor))}</p>}</li>;
 })}</ol></div>;
}

export function HistoricalCostReview({records,session,client,command,disabled,timeZone}:{records:BusinessRecord[];session:WebSession;client:Client;command:Command;disabled:boolean;timeZone:string}){
 const canManage=session.permissions.includes('*')||session.permissions.includes('accounting.manage'),canTechnical=session.permissions.includes('*')||session.permissions.includes('audit.view');
 const cohort=session.capabilities?.['accounting.costReview']===true;
 const [state,setState]=useState<ApiHistoricalCostState|null>(null),[kind,setKind]=useState<HistoricalCostKind|'ALL'>('ALL'),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [selectedId,setSelectedId]=useState(''),[detail,setDetail]=useState<ApiHistoricalCostSource|null>(null),[detailLoading,setDetailLoading]=useState(false),[action,setAction]=useState<Action|null>(null);
 const [recovery,setRecovery]=useState<{commandId:string|null}|null>(null),[recovering,setRecovering]=useState(false);
 const request=useRef(0),detailRequest=useRef(0),inFlight=useRef(false);
 const policy=useMemo(()=>{
  const candidates=[...records.filter(row=>row.collection==='historicalCostPolicy'),...(state?.policy?[state.policy]:[])];
  return candidates.sort((a,b)=>b.version-a.version)[0] as HistoricalCostPolicyRecord|undefined;
 },[records,state?.policy]);
 const sources=useMemo(()=>{
  if(state?.kind===kind)return state.items;
  return records.filter(row=>row.collection==='historicalCostSources'&&(kind==='ALL'||row.data.kind===kind)).sort((a,b)=>String(b.data.occurredAt).localeCompare(String(a.data.occurredAt))) as HistoricalCostSourceRecord[];
 },[records,state,kind]);
 const selected=detail?.source.id===selectedId?detail.source:sources.find(row=>row.id===selectedId)??null;
 const mutationDisabled=disabled||loading||!state||!canManage||!cohort||recovery!==null;
 const load=async(append=false)=>{
  if(disabled||append&&!state?.nextCursor)return;const serial=++request.current;setLoading(true);setError('');
  try{const next=await client.historicalCosts({kind,before:append?state?.nextCursor:null,limit:50});if(serial===request.current)setState(previous=>append&&previous?.kind===next.kind?{...next,items:[...previous.items,...next.items.filter(row=>!previous.items.some(old=>old.id===row.id))]}:next)}
  catch(cause){if(serial===request.current)setError(cause instanceof Error?cause.message:'Historical cost evidence could not be loaded. Previously loaded records are retained.')}
  finally{if(serial===request.current)setLoading(false)}
 };
 const loadDetail=async(sourceId:string)=>{
  const serial=++detailRequest.current;setDetailLoading(false);
  if(!sourceId||disabled)return;setDetailLoading(true);
  try{const next=await client.historicalCostSource(sourceId);if(serial===detailRequest.current)setDetail(next)}
  catch(cause){if(serial===detailRequest.current)setError(cause instanceof Error?cause.message:'The immutable cost source could not be loaded.')}
  finally{if(serial===detailRequest.current)setDetailLoading(false)}
 };
 useEffect(()=>{void load();return()=>{request.current++}},[client,disabled,kind]);
 useEffect(()=>{void loadDetail(selectedId);return()=>{detailRequest.current++}},[client,disabled,selectedId]);
 const chooseKind=(value:HistoricalCostKind|'ALL')=>{setKind(value);setSelectedId('');setDetail(null);detailRequest.current++};
 const submit=async(values:Record<string,string>)=>{
  if(!action||mutationDisabled||inFlight.current)throw new Error('Refresh the current cost evidence and recover the original request before another change.');
  const policyAction=action!=='REVIEW',key=policyAction?session.businessId:crypto.randomUUID(),collection=policyAction?'historicalCostPolicy':'historicalCostReviews';
  if(!policyAction&&(!selected||detail?.source.id!==selectedId))throw new Error('Load and inspect the immutable source before recording its review.');
  const payload=policyAction?{id:key,enabled:action==='ENABLE',reviewReference:values.reference,reason:values.reason,expectedVersions:[{collection,id:key,version:policy?.version??0}]}:{id:key,sourceId:selected!.id,disposition:selected!.data.state==='RECONCILIATION_REQUIRED'?'RECONCILIATION_REQUIRED':'EVIDENCE_REVIEWED',accountingReference:values.reference,reason:values.reason,expectedVersions:[{collection,id:key,version:0},{collection:'historicalCostSources',id:selected!.id,version:1}]};
  inFlight.current=true;setError('');setNotice('');let outcomeReceived=false;
  try{
   const outcome=await command(policyAction?'accountingCost.policy.save':'accountingCost.review',collection,key,payload);outcomeReceived=true;
   if(!isCommandConfirmed(outcome)){
    if(outcome.kind==='OUTCOME_UNKNOWN'||outcome.kind==='PENDING'){setRecovery({commandId:outcome.commandId});throw new Error('Recover the original request in Activity & Sync. A replacement must not be submitted.');}
    throw new Error('message' in outcome?outcome.message:'The accounting request was not confirmed.');
   }
   setNotice(policyAction?action==='ENABLE'?'New cost evidence enabled. Financial posting remains unavailable.':'New cost evidence disabled. Existing records and review history remain available.':'Review saved by the server. The original source remains unchanged; no journal, payment or stock movement was posted.');
   await load();if(!policyAction)await loadDetail(selectedId);
  }catch(cause){if(!outcomeReceived){const original=cause as {commandId?:unknown}|null;setRecovery({commandId:typeof original?.commandId==='string'?original.commandId:null})}throw cause}
  finally{inFlight.current=false}
 };
 const recover=async()=>{
  if(!recovery?.commandId||disabled||recovering)return;setRecovering(true);setError('');
  try{const saved=await client.commandStatus(recovery.commandId);if(['CONFIRMED','REJECTED','CONFLICT'].includes(saved.status)&&saved.outcome){setRecovery(null);setAction(null);setNotice(saved.status==='CONFIRMED'?'Original request confirmed. Refreshing the evidence and its review history.':saved.error?.message||'Original request rejected. Review current evidence before a new request.');await load();if(selectedId)await loadDetail(selectedId)}else setNotice('The original request remains unresolved. Recover that same command in Activity & Sync.')}
  catch(cause){setError(cause instanceof Error?cause.message:'The original request could not be recovered. No replacement was submitted.')}
  finally{setRecovering(false)}
 };
 return <section data-guide-anchor="web.historical-costs" className="space-y-4 rounded-xl border border-slate-800 p-4">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Historical cost evidence</h3><p className="mt-1 max-w-3xl text-sm text-slate-400">Inspect original preparation, bill, return and waste costs. This review foundation does not post a general-ledger cost journal or certify whole-business profit.</p></div><button className={control} disabled={disabled||loading} onClick={()=>{void load();if(selectedId)void loadDetail(selectedId)}}>{loading?'Loading...':'Refresh evidence'}</button></div>
  <p className="rounded border border-amber-900/60 p-3 text-sm text-amber-100">Cost posting is unavailable. An accountant must approve recognition timing, accounts and complete source-path coverage before financial activation. No historical data is automatically backfilled.</p>
  <p className="text-xs text-slate-400">New source capture: {policy?.data.enabled?'enabled':'disabled'}. Existing history remains readable. {state&&`Server evidence refreshed ${safeDate(state.generatedAt,timeZone)}.`}</p>
  {disabled&&<p role="status" className="text-sm text-amber-200">API unavailable. Previously loaded metadata is retained; full snapshots and accounting reviews require an online request.</p>}
  {!cohort&&<p className="text-sm text-slate-400">Accounting actions are outside this staff/device pilot. Authorised evidence remains readable.</p>}
  {!canManage&&<p className="text-sm text-slate-400">Accounting management permission is required to change capture policy or save a review.</p>}
  {notice&&<p role="status" className="rounded border border-slate-700 p-3 text-sm">{notice}</p>}
  {error&&<p role="alert" className="rounded border border-rose-800 p-3 text-sm text-rose-200">{error}</p>}
  {recovery&&<div role="alert" className="space-y-2 rounded border border-amber-700 p-3"><p className="text-sm text-amber-200">An accounting request has an unresolved outcome. Further changes are held; no request is replaced.</p>{recovery.commandId&&<button className={control} disabled={disabled||recovering} onClick={()=>void recover()}>{recovering?'Checking original request...':'Check original request'}</button>}{canTechnical&&recovery.commandId&&<details className="text-xs"><summary>Technical request reference</summary><code className="break-all">{recovery.commandId}</code></details>}</div>}
  {canManage&&cohort&&<button className={control} disabled={mutationDisabled} onClick={()=>setAction(policy?.data.enabled?'DISABLE':'ENABLE')}>{policy?.data.enabled?'Disable new cost evidence':'Enable new cost evidence'}</button>}
  <div className="flex flex-wrap items-end justify-between gap-3"><label className="text-sm">Source type<select className={`${control} mt-1 block w-full`} value={kind} disabled={action!==null} onChange={event=>chooseKind(event.target.value as HistoricalCostKind|'ALL')}>{kinds.map(value=><option key={value} value={value}>{kindLabel(value)}</option>)}</select></label>{state?.kind===kind&&<p className="text-sm text-slate-400">{state.total} sources; {state.exceptions} with reconciliation requirements. Unread alerts are separate from these accounting tasks.</p>}</div>
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"><div className="space-y-2">{sources.map(row=><button key={row.id} type="button" aria-pressed={selectedId===row.id} disabled={action!==null} className={`w-full rounded border p-3 text-left disabled:opacity-50 ${selectedId===row.id?'border-amber-400':'border-slate-800'}`} onClick={()=>{if(row.id===selectedId){void loadDetail(row.id);return}setSelectedId(row.id);setDetail(null)}}><span className="block font-medium break-words">{row.data.reference}</span><span className="mt-1 block text-sm text-slate-300">{kindLabel(row.data.kind)} - {formatFinancialMoney(row.data.amountMinor)}</span><span className="mt-1 block text-xs text-slate-400">{safeDate(row.data.occurredAt,timeZone)} - {stateLabel(row.data.state)} - Unposted</span></button>)}{!sources.length&&!loading&&<p className="text-sm text-slate-400">No sources are loaded for this filter. Absence of evidence does not imply zero cost or complete accounting.</p>}{state?.kind===kind&&state.hasMore&&<button className={control} disabled={disabled||loading} onClick={()=>void load(true)}>{loading?'Loading...':'Load earlier sources'}</button>}{!state&&sources.length>0&&<p className="text-xs text-slate-400">Showing cached recent metadata. Reconnect for complete pagination and immutable snapshots.</p>}</div>
   <div className="min-w-0">{detailLoading&&<p role="status" className="text-sm">Loading immutable source and review history...</p>}{selected&&<article className="space-y-4 rounded border border-slate-700 p-3"><div><h4 className="font-semibold break-words">{selected.data.reference}</h4><p className="mt-1 text-sm">{selected.data.description}</p><p className="mt-1 text-xs text-slate-400">Occurred {safeDate(selected.data.occurredAt,timeZone)}; evidence recorded {safeDate(selected.data.recordedAt,timeZone)}.</p></div><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt>Source cost</dt><dd className="font-semibold tabular-nums">{formatFinancialMoney(selected.data.amountMinor)}</dd></div><div><dt>Accounting status</dt><dd>{stateLabel(selected.data.state)} - Unposted</dd></div></dl>{selected.data.coverage.length>0&&<div><h5 className="font-medium">Unresolved source requirements</h5><ul className="mt-2 space-y-2 text-sm text-amber-100">{selected.data.coverage.map((value,index)=><li key={index} className="rounded border border-amber-900/60 p-2">{value}</li>)}</ul><p className="mt-2 text-xs text-slate-400">Recording a review preserves these issues. It cannot rewrite the original source or silently mark it reconciled.</p></div>}{!selected.data.sourceSnapshot&&!detailLoading&&<p className="text-sm text-slate-400">The full immutable snapshot is not loaded. Reconnect and refresh this source before reviewing it.</p>}{selected.data.sourceSnapshot&&<OriginalCostEvidence source={selected}/>}
    <button className={control} disabled={mutationDisabled||detailLoading||detail?.source.id!==selectedId} onClick={()=>setAction('REVIEW')}>{selected.data.state==='RECONCILIATION_REQUIRED'?'Record reconciliation review':'Record evidence review'}</button>
    {detail?.source.id===selectedId&&<div className="space-y-3"><h5 className="font-medium">Immutable review history ({detail.totalReviews})</h5>{detail.reviews.map(row=><div key={row.id} className="space-y-2 rounded border border-slate-800 p-3 text-sm"><p><b>{row.data.disposition==='RECONCILIATION_REQUIRED'?'Reconciliation required':'Evidence reviewed'}</b> - {row.data.reviewedByName} - {safeDate(row.data.reviewedAt,timeZone)}</p><p className="break-words">Accounting reference: {row.data.accountingReference}</p><p className="break-words">{row.data.reason}</p><p className="text-xs text-slate-400">{row.data.proposedJournal.note}</p>{row.data.proposedJournal.lines.length>0&&<details><summary className="cursor-pointer text-sm">Proposed balanced journal - unposted</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th scope="col">Proposed account</th><th scope="col">Debit</th><th scope="col">Credit</th></tr></thead><tbody>{row.data.proposedJournal.lines.map(line=><tr key={line.accountCode}><th scope="row" className="py-1 font-normal break-words">{line.accountCode.replaceAll('_',' ').toLowerCase()}</th><td className="p-1 tabular-nums">{formatFinancialMoney(line.debitMinor)}</td><td className="p-1 tabular-nums">{formatFinancialMoney(line.creditMinor)}</td></tr>)}</tbody></table></div><p className="mt-2 text-xs text-amber-200">These account classifications remain unapproved. No journal was created.</p></details>}</div>)}{!detail.reviews.length&&<p className="text-sm text-slate-400">No accountant review has been recorded.</p>}{detail.totalReviews>detail.reviews.length&&<p className="text-xs text-slate-400">Showing the latest {detail.reviews.length} reviews. Complete review-history pagination remains required.</p>}</div>}
    {canTechnical&&<details className="text-xs text-slate-400"><summary className="cursor-pointer">Technical source evidence</summary><p className="mt-2 break-all">Source: {selected.id}</p><p className="break-all">Original command: {selected.data.sourceCommandId}</p><p className="break-all">SHA-256: {selected.data.snapshotHash}</p>{selected.data.sourceSnapshot&&<pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-800 p-2">{JSON.stringify(selected.data.sourceSnapshot,null,2)}</pre>}</details>}
   </article>}{!selected&&!detailLoading&&<p className="text-sm text-slate-400">Choose a source to inspect its original valuation and review history.</p>}</div>
  </div>
  {action&&<WebActionDialog title={action==='ENABLE'?'Enable new cost evidence?':action==='DISABLE'?'Disable new cost evidence?':'Record historical cost review'} description={action==='ENABLE'?'Capture new canonical source evidence in the same business-command transaction. No history is backfilled; financial posting and profit certification remain unavailable.':action==='DISABLE'?'Stop capturing new sources without deleting historical evidence, reviews or original financial records.':'Preserve the original source and a reasoned accountant review. This records evidence only; no stock, settlement or financial journal is posted.'} fields={[{name:'reference',label:'Accounting review reference',minLength:3,maxLength:160},{name:'reason',label:'Review reason',multiline:true,minLength:3,maxLength:500}]} confirmLabel={action==='REVIEW'?'Save evidence review':'Save capture policy'} disabled={mutationDisabled||action==='REVIEW'&&detail?.source.id!==selectedId} onClose={()=>setAction(null)} onConfirm={submit}/>}
 </section>;
}
