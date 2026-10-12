import React,{useEffect,useRef,useState} from 'react';
import type {QueuedCommand} from './BusinessStore';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {CommandOutcome} from '../../types/transactions';
import {inventoryWhen} from './inventoryPresentation';
import {operatorError} from './operatorError';
import {ds} from '../../design-system/tokens';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
type Editor={id:string;policyVersion:number;stock:BusinessRecord;location:BusinessRecord;outlet:BusinessRecord|null;outletChoice:string;minimum:string;enabled:boolean};
type Pending={id:string|null;policyId:string;baseline:number;confirmed:boolean;stockItemId:string;locationId:string;startedAt:number};
type Props={records:BusinessRecord[];session:WebSession;queue:QueuedCommand[];disabled:boolean;command:Command};
const uuid=/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const human=(value:unknown,fallback:string)=>typeof value==='string'&&value.trim()&&!uuid.test(value)?value.trim():fallback;
const decimal=(value:unknown)=>typeof value==='string'&&/^\d{1,12}(\.\d{1,6})?$/.test(value.trim())?value.trim():null;
const quantityLabel=(value:unknown)=>{const parsed=decimal(value);if(parsed===null)return 'Unavailable';const [whole,fraction='']=parsed.split('.');const tail=fraction.replace(/0+$/,'');return `${BigInt(whole).toLocaleString('en-KE')}${tail?`.${tail}`:''}`;};
const unresolved=(entry:QueuedCommand)=>entry.state==='PENDING_SYNC'||entry.state==='OUTCOME_UNKNOWN';
const pair=(row:BusinessRecord,stockId:string,locationId:string)=>row.collection==='stockAlertPolicies'&&!row.archived&&row.data.stockItemId===stockId&&row.data.locationId===locationId;
const commandPair=(entry:QueuedCommand,stockId:string,locationId:string)=>entry.command.operation==='stockAlertPolicy.save'&&entry.command.payload.stockItemId===stockId&&entry.command.payload.locationId===locationId;
const input=`${ds.input} mt-1 min-h-11 w-full`;
const button=`${ds.button} min-h-11`;

/** This editor changes reviewed thresholds only; it never acknowledges or resolves an alert. */
export function StockAlertSettings({records,session,queue,disabled,command}:Props){
 const scope=`${session.businessId}:${session.actorId}:${session.policyVersion}`;
 const currentScope=useRef(scope);currentScope.current=scope;
 const [stockId,setStockId]=useState(''),[locationId,setLocationId]=useState(''),[editor,setEditor]=useState<Editor|null>(null),[reason,setReason]=useState(''),[acknowledged,setAcknowledged]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[pending,setPending]=useState<Pending|null>(null),[reviewStopped,setReviewStopped]=useState(false);
 const inFlight=useRef(false),reviewRef=useRef<HTMLHeadingElement|null>(null),returnFocus=useRef<HTMLButtonElement|null>(null);
 const configure=session.enabled&&allowed(session,'business.configure');
 const enabled=session.capabilities?.['operations.stockAlerts']===true&&session.capabilities?.['operations.inbox']===true;
 const stocks=records.filter(row=>row.collection==='stockItems'&&!row.archived),locations=records.filter(row=>row.collection==='stockLocations'&&!row.archived),policies=records.filter(row=>row.collection==='stockAlertPolicies'&&!row.archived);
 const selectedStock=stocks.find(row=>row.id===stockId),selectedLocation=locations.find(row=>row.id===locationId);
 const currentPolicy=editor?policies.find(row=>pair(row,editor.stock.id,editor.location.id)):undefined;
 const outletOptions=editor?records.filter(row=>row.collection==='outlets'&&!row.archived&&row.data.defaultStockLocationId===editor.location.id):[];
 const changed=Boolean(editor&&(
  stocks.find(row=>row.id===editor.stock.id)?.version!==editor.stock.version||
  locations.find(row=>row.id===editor.location.id)?.version!==editor.location.version||
  (currentPolicy?.version??0)!==editor.policyVersion||currentPolicy&&currentPolicy.id!==editor.id||
  editor.outlet&&records.find(row=>row.collection==='outlets'&&row.id===editor.outlet?.id&&!row.archived)?.version!==editor.outlet.version
 ));
 const held=queue.find(entry=>unresolved(entry)&&commandPair(entry,editor?.stock.id||stockId,editor?.location.id||locationId));
 const blocked=disabled||busy||Boolean(pending)||Boolean(held)||!configure||!enabled;
 const timeZone=session.propertyContext?.timeZone||'Africa/Nairobi';
 useEffect(()=>{setStockId('');setLocationId('');setEditor(null);setReason('');setAcknowledged(false);setMessage('');setPending(null);setReviewStopped(false);setBusy(false);},[scope]);
 useEffect(()=>{
  if(!pending)return;
  const entry=pending.id?queue.find(row=>row.id===pending.id):queue.find(row=>commandPair(row,pending.stockItemId,pending.locationId)&&row.command.payload.id===pending.policyId&&Date.parse(row.command.occurredAt)>=pending.startedAt);
  if(entry?.state==='REJECTED'||entry?.state==='CONFLICT'){
   setPending(null);setReviewStopped(true);setAcknowledged(false);setMessage(entry.result?.error?.message||'The original change was not applied. Refresh the source records and start a new review.');return;
  }
  const policy=policies.find(row=>row.id===pending.policyId);
  if((pending.confirmed||entry?.state==='SYNCHRONIZED')&&policy&&policy.version>pending.baseline){setPending(null);setEditor(null);setAcknowledged(false);setMessage('The original thresholds change is confirmed by the server. The latest saved policy is shown below.');}
 },[pending,queue,policies]);

 const openReview=(requestedStock=stockId,requestedLocation=locationId,trigger?:HTMLButtonElement)=>{
  if(disabled||busy||pending||!configure||!enabled)return;
  const stock=stocks.find(row=>row.id===requestedStock),location=locations.find(row=>row.id===requestedLocation),policy=policies.find(row=>pair(row,requestedStock,requestedLocation));
  if(!stock||!location||!human(stock.data.baseUnit,'')||!Number.isSafeInteger(stock.version)||!Number.isSafeInteger(location.version)){setMessage('Active stock, its base unit and the location source revisions are required. Refresh records before reviewing.');return;}
  if(queue.some(entry=>unresolved(entry)&&commandPair(entry,requestedStock,requestedLocation))){setMessage('Recover the original policy change for this stock item and location in Activity before starting another review.');return;}
  try{
   const outletId=typeof policy?.data.outletId==='string'?policy.data.outletId:null;
   const outlet=outletId?records.find(row=>row.collection==='outlets'&&row.id===outletId&&!row.archived&&row.data.defaultStockLocationId===location.id)||null:null;
   const outletChoice=outlet?.id||(policy?.data.outletId===null?'SHARED':'UNREVIEWED');
   const unitChanged=Boolean(policy&&policy.data.baseUnit!==stock.data.baseUnit);
   setStockId(stock.id);setLocationId(location.id);setEditor({id:policy?.id||crypto.randomUUID(),policyVersion:policy?.version??0,stock,location,outlet,outletChoice,minimum:unitChanged?'':decimal(policy?.data.minimumQuantity)||'',enabled:policy?.data.enabled===true});
   setReason('');setMessage(unitChanged?'The stock base unit changed. Enter a new minimum in the current unit; existing alert evidence retains its original unit.':outletId&&!outlet?'The saved outlet no longer uses this stock location. Review its current routing explicitly.':'');setAcknowledged(false);setReviewStopped(false);
   if(trigger)returnFocus.current=trigger;
   window.requestAnimationFrame(()=>reviewRef.current?.focus());
  }catch(error){setMessage(operatorError(error));}
 };
 const closeReview=()=>{if(busy)return;setEditor(null);setAcknowledged(false);if(returnFocus.current?.isConnected)returnFocus.current.focus();};
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!editor||blocked||changed||reviewStopped||inFlight.current||!acknowledged)return;
  const minimum=decimal(editor.minimum),changeReason=reason.trim();
  if(minimum===null||changeReason.length<3||changeReason.length>500||editor.outletChoice==='UNREVIEWED'||editor.outletChoice!=='SHARED'&&!editor.outlet){setMessage('Enter an explicit non-negative base-unit minimum with up to six decimals, review the outlet routing and give a change reason.');return;}
  const versionRows=[{collection:'stockAlertPolicies',id:editor.id,version:editor.policyVersion},{collection:'stockItems',id:editor.stock.id,version:editor.stock.version},{collection:'stockLocations',id:editor.location.id,version:editor.location.version},...(editor.outlet?[{collection:'outlets',id:editor.outlet.id,version:editor.outlet.version}]:[])];
  const pendingEvidence={policyId:editor.id,baseline:editor.policyVersion,stockItemId:editor.stock.id,locationId:editor.location.id,startedAt:Date.now()};
  const requestScope=scope;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const result=await command('stockAlertPolicy.save','stockAlertPolicies',editor.id,{id:editor.id,stockItemId:editor.stock.id,locationId:editor.location.id,outletId:editor.outlet?.id??null,minimumQuantity:minimum,enabled:editor.enabled,reason:changeReason,expectedVersions:versionRows});
   if(currentScope.current!==requestScope)return;
   if(result.kind==='CONFIRMED'){setPending({...pendingEvidence,id:result.commandId,confirmed:true});setMessage('The server recorded the reviewed policy. Updating the saved settings display.');}
   else if(result.kind==='PENDING'||result.kind==='OUTCOME_UNKNOWN'){setPending({...pendingEvidence,id:result.commandId,confirmed:false});setMessage('The original policy change awaits its server outcome. Recover that same change in Activity; do not submit it again.');}
   else if(result.kind==='DRAFT_SAVED'){setReviewStopped(true);setAcknowledged(false);setMessage('This is an unsent settings draft. It has not activated alerts; review the draft in Activity while online.');}
   else{setReviewStopped(result.kind==='CONFLICT'||result.kind==='REJECTED');setAcknowledged(false);setMessage(result.message);}
  }catch(error){if(currentScope.current===requestScope){setPending({...pendingEvidence,id:null,confirmed:false});setMessage(`${operatorError(error)} Check Activity for the original policy change before retrying.`);}}
  finally{inFlight.current=false;if(currentScope.current===requestScope)setBusy(false);}
 };

 if(!configure)return null;
 if(!enabled)return <section className={`${ds.panel} p-4`} aria-label="Stock alert settings"><h3 className="font-bold">Stock alerts</h3><p className="mt-1 text-sm text-slate-400">Location stock alerts are disabled for this staff and device. No minimum is inferred or activated automatically.</p></section>;
 return <section className={`${ds.panel} space-y-4 p-4`} aria-labelledby="stock-alert-settings-heading" data-guide-anchor="stock.alert-settings">
  <div><h3 id="stock-alert-settings-heading" className="font-bold">Location stock alerts</h3><p className="mt-1 text-sm text-slate-400">Review each stock item and location in its base unit. Alerts use server-confirmed on-hand balances. Pending offline stock, reserved quantities and available-to-sell estimates do not trigger these alerts.</p><p className="mt-1 text-sm text-amber-200">Changing or disabling a minimum does not resolve existing alerts. They remain open until confirmed stock increases above the original episode minimum.</p></div>
  {!editor&&<div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Stock item<select className={input} value={stockId} disabled={blocked} onChange={event=>{setStockId(event.target.value);setMessage('');}}><option value="">Choose saved stock</option>{stocks.map(stock=><option key={stock.id} value={stock.id}>{human(stock.data.name,'Stock item')} · {human(stock.data.code,'Code unavailable')}</option>)}</select></label><label className="text-sm">Stock location<select className={input} value={locationId} disabled={blocked} onChange={event=>{setLocationId(event.target.value);setMessage('');}}><option value="">Choose saved location</option>{locations.map(location=><option key={location.id} value={location.id}>{human(location.data.name,'Stock location')}</option>)}</select></label><div className="flex items-end"><button type="button" className={button} disabled={blocked||!selectedStock||!selectedLocation} onClick={event=>openReview(stockId,locationId,event.currentTarget)}>Review location minimum</button></div></div>}
  {editor&&<form onSubmit={event=>void save(event)} className="space-y-3 rounded-lg border border-slate-700 p-3" onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.preventDefault();closeReview();}}}>
   <h4 ref={reviewRef} tabIndex={-1} className="font-semibold focus:outline-none">Review {human(editor.stock.data.name,'Stock item')} · {human(editor.location.data.name,'Stock location')}</h4>
   <p className="text-sm text-slate-400">Base unit: {human(editor.stock.data.baseUnit,'Unavailable')}. Minimums are separate from purchase packs and the item-wide reorder setting.</p>
   {changed&&<p role="alert" className="text-sm text-amber-200">A reviewed stock item, location, outlet or policy changed. Close this review and load the current sources before saving.</p>}
   {reviewStopped&&<p role="status" className="text-sm text-amber-200">The previous review stopped. Refresh the source records and start a new review.</p>}
   <fieldset disabled={blocked||changed||reviewStopped} className="space-y-3">
    <label className="block text-sm">Minimum on hand ({human(editor.stock.data.baseUnit,'base units')})<input className={input} inputMode="decimal" required pattern="[0-9]{1,12}(\.[0-9]{1,6})?" value={editor.minimum} placeholder="Enter a reviewed minimum" onChange={event=>{setAcknowledged(false);setEditor({...editor,minimum:event.target.value});}}/></label>
    <label className="block text-sm">Outlet routing<select className={input} value={editor.outletChoice} required onChange={event=>{setAcknowledged(false);setEditor({...editor,outletChoice:event.target.value,outlet:outletOptions.find(outlet=>outlet.id===event.target.value)||null});}}><option value="UNREVIEWED" disabled>Choose reviewed outlet routing</option><option value="SHARED">Shared stock location — no outlet assigned</option>{outletOptions.map(outlet=><option key={outlet.id} value={outlet.id}>{human(outlet.data.name,'Outlet')}</option>)}</select></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={editor.enabled} onChange={event=>{setAcknowledged(false);setEditor({...editor,enabled:event.target.checked});}}/>Enable new alerts for this stock item and location</label>
    <label className="block text-sm">Change reason<textarea className={input} minLength={3} maxLength={500} required value={reason} onChange={event=>{setAcknowledged(false);setReason(event.target.value);}}/></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/>I reviewed the base unit, minimum and outlet routing. Existing alerts retain their original threshold.</label>
    <button type="submit" className={`${ds.primaryButton} min-h-11`} disabled={!acknowledged||editor.outletChoice==='UNREVIEWED'}>{editor.enabled?'Save reviewed alert policy':'Save disabled alert policy'}</button>
   </fieldset>
   <button type="button" className={button} disabled={busy} onClick={closeReview}>Close review</button>
  </form>}
  {(message||held||pending)&&<p role="status" className="text-sm text-amber-200">{message||'The original settings change awaits confirmation. Open Activity for its outcome before submitting another change.'}</p>}
  <div className="space-y-2"><h4 className="text-sm font-semibold">Saved location policies</h4>{!policies.length&&<p className="text-sm text-slate-400">No reviewed location minimums are loaded. No alert policy is created from the global reorder level.</p>}{policies.map(policy=>{
   const stock=stocks.find(row=>row.id===policy.data.stockItemId),location=locations.find(row=>row.id===policy.data.locationId),outlet=records.find(row=>row.collection==='outlets'&&row.id===policy.data.outletId&&!row.archived);
   const originalUnit=human(policy.data.baseUnit,'Unit unavailable'),sourceChanged=!stock||!location||stock.data.baseUnit!==policy.data.baseUnit||policy.data.outletId!==null&&(!outlet||outlet.data.defaultStockLocationId!==policy.data.locationId);
   return <article key={policy.id} className="rounded-lg border border-slate-700 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{human(stock?.data.name,'Stock item unavailable')} · {human(location?.data.name,'Location unavailable')}</p><span className="text-xs">{policy.data.enabled===true?'New alerts enabled':'New alerts disabled'}</span></div><p className="mt-1 text-sm">Minimum {quantityLabel(policy.data.minimumQuantity)} {originalUnit} · {policy.data.outletId===null?'Shared location':human(outlet?.data.name,'Outlet routing unavailable')}</p><p className="mt-1 text-xs text-slate-400">Reviewed {inventoryWhen(policy.data.updatedAt,timeZone)}. {sourceChanged?'Current unit, location or outlet evidence needs review.':''}</p><button type="button" className={`${button} mt-2`} disabled={blocked||!stock||!location} onClick={event=>openReview(stock?.id||'',location?.id||'',event.currentTarget)}>Review saved policy</button></article>;
  })}</div>
 </section>;
}
