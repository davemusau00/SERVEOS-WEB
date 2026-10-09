import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {ApiAuthenticatedDeviceSession} from './apiAuth';
import type {BusinessStore,QueuedCommand} from './BusinessStore';
import {acquireOfflineGrant} from './offlineGrant';
import {inventoryRevisions} from './inventoryRevisions';
import {allowed,type BusinessRecord,type WebSession} from './session';
import {parseMoneyToMinor} from '../../utils/fiscal';
import type {CommandOutcome} from '../../types/transactions';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
type SaleLine={id:string;productId:string;quantity:string;portionId:string;modifierIds:string[]};
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const list=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.map(obj):[];
const baseline=(row:BusinessRecord)=>({collection:row.collection,id:row.id,version:row.version});
const uuid=()=>crypto.randomUUID();
const hasSalePermission=(session:WebSession)=>['pos.sell','order.fire','payment.record'].every(permission=>allowed(session,permission));
const productStockIds=(product:BusinessRecord,modifierIds:string[])=>{
 const data=product.data,ingredients=list(data.recipeIngredients),ids=new Set<string>();
 if(data.inventoryType==='BATCH'){if(typeof data.stockItemId==='string')ids.add(data.stockItemId)}
 else if(ingredients.length){for(const ingredient of ingredients)if(typeof ingredient.stockItemId==='string')ids.add(ingredient.stockItemId)}
 else if(typeof data.stockItemId==='string')ids.add(data.stockItemId);
 for(const modifier of list(data.modifiers))if(modifierIds.includes(String(modifier.id)))for(const adjustment of list(modifier.ingredientAdjustments))if(typeof adjustment.stockItemId==='string')ids.add(adjustment.stockItemId);
 return [...ids];
};
const field='mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2';
const button='min-h-11 rounded border border-slate-600 px-3 py-2 disabled:opacity-40';

export function WebApiOfflinePosPanel({records,session,deviceId,disabled,command,queue,apiAuth,store,onConfirmedOrder}:{records:BusinessRecord[];session:WebSession;deviceId:string;disabled:boolean;command:Command;queue:QueuedCommand[];apiAuth:ApiAuthenticatedDeviceSession;store:BusinessStore;onConfirmedOrder:(id:string)=>void}){
 const [online,setOnline]=useState(typeof navigator==='undefined'?true:navigator.onLine);
 const [grantReady,setGrantReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [name,setName]=useState('Offline sale'),[destination,setDestination]=useState('COUNTER'),[cashTendered,setCashTendered]=useState('');
 const [lines,setLines]=useState<SaleLine[]>([{id:uuid(),productId:'',quantity:'1',portionId:'',modifierIds:[]}]);
 const onConfirmedOrderRef=useRef(onConfirmedOrder);onConfirmedOrderRef.current=onConfirmedOrder;
 const saleCommands=useMemo(()=>queue.filter(entry=>entry.command.operation==='order.offlineCashSale').sort((a,b)=>b.sequence-a.sequence),[queue]);
 const outlets=records.filter(row=>row.collection==='outlets'&&!row.archived);
 const [outletId,setOutletId]=useState('');
 const products=records.filter(row=>row.collection==='products'&&!row.archived&&!['KITCHEN','BAR'].includes(String(row.data.routeTo||''))&&(!Array.isArray(row.data.outletIds)||!row.data.outletIds.length||row.data.outletIds.includes((outlets.find(candidate=>candidate.id===outletId)||outlets[0])?.id)));
 const locations=records.filter(row=>row.collection==='stockLocations'&&!row.archived);
 const settings=records.find(row=>row.collection==='businessSettings'&&row.id===session.businessId);
 const selectedOutlet=outlets.find(row=>row.id===outletId)||outlets[0];
 const location=locations.find(row=>row.id===selectedOutlet?.data.defaultStockLocationId);
 const tills=records.filter(row=>row.collection==='tillSessions'&&!row.archived);
 const till=tills.find(row=>row.data.status==='OPEN'&&row.data.operatorId===session.actorId&&row.data.deviceId===deviceId&&row.data.outletId===selectedOutlet?.id);
 const accounts=records.filter(row=>row.collection==='paymentAccounts'&&!row.archived&&row.data.method==='CASH'&&row.data.currency===(settings?.data.currency||'KES'));
 const [cashAccountId,setCashAccountId]=useState('');
 const cashAccount=accounts.find(row=>row.id===cashAccountId)||accounts[0];
 const pendingEntry=saleCommands.find(entry=>entry.state==='PENDING_SYNC'||entry.state==='OUTCOME_UNKNOWN');
 const setupSteps=[
  {label:'Business settings',ready:Boolean(settings),tab:'Settings' as const,permission:'business.configure',action:'Open settings'},
  {label:'Stock location linked to the outlet',ready:Boolean(selectedOutlet&&location),tab:locations.length?'Settings' as const:'Catalog' as const,permission:locations.length?'business.configure':'inventory.adjust',action:locations.length?'Configure outlet':'Add stock location'},
  {label:'Cash payment account',ready:Boolean(cashAccount),tab:'Settings' as const,permission:'business.configure',action:'Configure payments'},
  {label:'Eligible counter product',ready:products.length>0,tab:'Catalog' as const,permission:'catalog.manage',action:'Configure catalog'},
  {label:'Your device till is open at this outlet',ready:Boolean(till),tab:'POS' as const,permission:'till.open',action:'Open POS / till'},
 ];
 const navigateTo=(tab:string)=>window.dispatchEvent(new CustomEvent('servos:web-navigate',{detail:{tab}}));

 useEffect(()=>{const onlineNow=()=>setOnline(true),offlineNow=()=>setOnline(false);window.addEventListener('online',onlineNow);window.addEventListener('offline',offlineNow);return()=>{window.removeEventListener('online',onlineNow);window.removeEventListener('offline',offlineNow)}},[]);
 useEffect(()=>{let current=true;void store.hasOfflineAuthorization('order.offlineCashSale').then(value=>{if(current)setGrantReady(value)}).catch(()=>{if(current)setGrantReady(false)});return()=>{current=false}},[store,online,queue.length]);
 useEffect(()=>{
  const terminal=saleCommands[0];
  if(!terminal||!['SYNCHRONIZED','CONFLICT','REJECTED'].includes(terminal.state))return;
  if(terminal.state==='SYNCHRONIZED'){const id=String(terminal.command.payload.id||'');if(id)onConfirmedOrderRef.current(id);setMessage('The API confirmed this sale after reconnection. Review the synchronized order and receipt before printing.');}
  else setMessage('The API did not commit this sale. If cash or goods changed hands, stop and reconcile the drawer and stock with a supervisor before entering another sale.');
 },[saleCommands]);

 const grantOffline=async()=>{
  if(!online||busy||grantReady)return;
  setBusy(true);setMessage('');
  try{
   const publicJwk=import.meta.env.VITE_API_OFFLINE_GRANT_PUBLIC_JWK;
   if(!publicJwk)throw new Error('This PWA release has no trusted offline-grant verification key configured.');
   const keys=JSON.parse(publicJwk) as Record<string,JsonWebKey>;
   await acquireOfflineGrant(apiAuth.client,store,keys,{allowedCommands:['order.offlineCashSale'],maxCommands:1,durationMinutes:30});
   setGrantReady(true);setMessage('One offline cash sale is authorized on this device for up to 30 minutes.');
  }catch(error){setMessage(error instanceof Error?error.message:'Offline sale authorization was not saved.')}finally{setBusy(false)}
 };
 const changeLine=(id:string,change:Partial<SaleLine>)=>setLines(current=>current.map(line=>line.id===id?{...line,...change}:line));
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(!hasSalePermission(session)||disabled||busy||!grantReady||pendingEntry)return;
  if(online){setMessage('Disconnect from the network before using the bounded offline sale workflow. Use the regular POS for online sales.');return}
  setBusy(true);setMessage('');
  try{
   if(!selectedOutlet||!location||!settings||!till||!cashAccount)throw new Error('The saved workspace needs an active outlet, default stock location, current business settings, your open device till, and an active cash account. Reconnect and refresh before authorizing offline sales.');
   if(!name.trim()||name.trim().length>120||!['COUNTER','TAKEAWAY'].includes(destination))throw new Error('Enter a short sale name and choose counter or takeaway.');
   if(lines.length<1||lines.length>20)throw new Error('An offline sale must contain 1 to 20 lines.');
   const reviewed=lines.map(line=>{
    const product=products.find(row=>row.id===line.productId);const quantity=Number(line.quantity);
    if(!product||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||Math.abs(quantity*1000000-Math.round(quantity*1000000))>0.0001)throw new Error('Choose an active product and a positive quantity with at most six decimals for every line.');
    if(line.portionId&&!list(product.data.portions).some(portion=>portion.id===line.portionId))throw new Error('A selected product portion is no longer available.');
    const modifiers=list(product.data.modifiers),selected=new Set(line.modifierIds);
    if([...selected].some(id=>!modifiers.some(modifier=>modifier.id===id)))throw new Error('A selected product modifier is no longer available.');
    return {id:line.id,productId:product.id,quantity,portionId:line.portionId||undefined,modifierIds:line.modifierIds};
   });
   const stockIds=[...new Set(lines.flatMap(line=>{const product=products.find(row=>row.id===line.productId);return product?productStockIds(product,line.modifierIds):[]}))];
   const inventory=inventoryRevisions(records,stockIds,[location.id],[...new Set(reviewed.map(line=>line.productId))]);
   const orderId=uuid(),expected=[{collection:'orders',id:orderId,version:0},baseline(selectedOutlet),baseline(location),baseline(settings),baseline(till),baseline(cashAccount),...inventory.expectedVersions];
   const deduped=[...new Map(expected.map(item=>[`${item.collection}:${item.id}`,item])).values()];
   const payload={id:orderId,name:name.trim(),outletId:selectedOutlet.id,serviceDestination:destination,tillSessionId:till.id,cashAccountId:cashAccount.id,cashTenderedMinor:parseMoneyToMinor(cashTendered),lines:reviewed,expectedBalanceVersions:inventory.expectedBalanceVersions,expectedVersions:deduped};
   const outcome=await command('order.offlineCashSale','orders',orderId,payload);
   if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN'){
    setGrantReady(false);
    setMessage('Sale saved locally under the one-sale device grant. It is not API-confirmed yet; do not print or report it as a confirmed sale. Keep this device data and synchronize when the connection returns.');
   }else if(outcome.kind==='CONFIRMED'){
    onConfirmedOrderRef.current(orderId);setMessage('The API confirmed this sale. Review the synchronized order and receipt before printing.');
   }else if(outcome.kind==='REJECTED'||outcome.kind==='CONFLICT'){
    setGrantReady(false);setMessage('The sale was not committed by the API. If cash or goods changed hands, stop and reconcile the drawer and stock with a supervisor before entering another sale.');
   }else if(outcome.kind==='DRAFT_SAVED'){
    setGrantReady(false);setMessage('The device could not authorize this offline command. The form was saved as a draft; do not hand over cash or goods until connected.');
   }else if('message' in outcome)setMessage(outcome.message);
  }catch(error){setMessage(error instanceof Error?error.message:String(error))}finally{setBusy(false)}
 };
 const canUse=hasSalePermission(session);
 if(!canUse)return null;
 return <section className="space-y-3 rounded-xl border border-amber-700/60 bg-amber-950/10 p-4">
  <div><h3 className="font-bold">Bounded offline cash sale</h3><p className="mt-1 text-sm text-slate-300">This queues one cash-only sale of counter items while disconnected. Preparation-routed kitchen and bar items need the connected workflow. The API validates and commits the sale after reconnection; no receipt or authoritative sale is created on this device.</p></div>
  {!online&&<p className="rounded border border-amber-600/50 p-2 text-sm text-amber-200">Offline mode · pending sales must synchronize before another sale can be submitted.</p>}
  {online&&!grantReady&&<button type="button" className={button} disabled={busy||disabled||Boolean(pendingEntry)||!till||!cashAccount||!selectedOutlet||!location||!settings||products.length===0} onClick={()=>void grantOffline()}>{busy?'Authorizing…':'Authorize one offline cash sale (30 minutes)'}</button>}
  {grantReady&&<p className="text-sm text-emerald-200">A signed one-sale grant is saved on this device. It is consumed atomically with the local command.</p>}
  {(!till||!cashAccount||!selectedOutlet||!location||!settings||products.length===0)&&<div className="space-y-2 rounded-lg border border-amber-700/50 p-3" role="status">
   <div><h4 className="font-semibold text-amber-100">Finish setup while online</h4><p className="text-sm text-slate-300">Complete each item, then synchronize this workspace. Offline sales use the saved outlet, till, cash account, product, and stock versions; the API checks them again when the device reconnects.</p></div>
   <ol className="space-y-2">{setupSteps.map(step=><li key={step.label} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-950/70 p-2 text-sm"><span className={step.ready?'text-emerald-200':'text-amber-100'}>{step.ready?'✓':'○'} {step.label}</span>{!step.ready&&(allowed(session,step.permission)?<button type="button" className={button} onClick={()=>navigateTo(step.tab)}>{step.action}</button>:<span className="text-xs text-slate-400">Requires {step.permission}; ask a business administrator.</span>)}</li>)}</ol>
   {!selectedOutlet&&<p className="text-sm text-amber-100">Create an active outlet in Settings, then choose it here.</p>}
   {selectedOutlet&&!location&&<p className="text-sm text-amber-100">Add a stock location in Catalog, then set it as this outlet’s default in Settings.</p>}
   {online&&<p className="text-xs text-slate-400">After setup, use Synchronize in the workspace header. A grant is available only after setup is complete.</p>}
  </div>}
  <form className="space-y-3" onSubmit={event=>void submit(event)}>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-sm">Outlet<select className={field} value={selectedOutlet?.id||''} disabled={!online||busy||Boolean(pendingEntry)} onChange={event=>setOutletId(event.target.value)}><option value="">Select outlet</option>{outlets.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label>
    <label className="text-sm">Order name<input className={field} maxLength={120} value={name} disabled={busy||Boolean(pendingEntry)} onChange={event=>setName(event.target.value)}/></label>
    <label className="text-sm">Service destination<select className={field} value={destination} disabled={busy||Boolean(pendingEntry)} onChange={event=>setDestination(event.target.value)}><option value="COUNTER">Counter</option><option value="TAKEAWAY">Takeaway</option></select></label>
    <label className="text-sm">Cash account<select className={field} value={cashAccount?.id||''} disabled={!online||busy||Boolean(pendingEntry)} onChange={event=>setCashAccountId(event.target.value)}><option value="">Select cash account</option>{accounts.map(row=><option key={row.id} value={row.id}>{String(row.data.name||row.data.code)} ({String(row.data.currency)})</option>)}</select></label>
   </div>
   <div className="space-y-3"><h4 className="font-semibold">Items</h4>{lines.map((line,index)=>{
    const product=products.find(row=>row.id===line.productId),portions=list(product?.data.portions),modifiers=list(product?.data.modifiers);
    return <div key={line.id} className="space-y-2 rounded border border-slate-700 p-3">
     <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
      <label className="text-sm">Item {index+1}<select required className={field} value={line.productId} disabled={busy||Boolean(pendingEntry)} onChange={event=>changeLine(line.id,{productId:event.target.value,portionId:'',modifierIds:[]})}><option value="">Select product</option>{products.map(row=><option key={row.id} value={row.id}>{String(row.data.name)} · {String(row.data.code||'')}</option>)}</select></label>
      <label className="text-sm">Quantity<input required type="number" min="0.000001" max="1000000" step="0.000001" inputMode="decimal" className={field} value={line.quantity} disabled={busy||Boolean(pendingEntry)} onChange={event=>changeLine(line.id,{quantity:event.target.value})}/></label>
      {lines.length>1&&<button type="button" className={`${button} self-end`} disabled={busy||Boolean(pendingEntry)} onClick={()=>setLines(current=>current.filter(item=>item.id!==line.id))}>Remove</button>}
     </div>
     {portions.length>0&&<label className="block text-sm">Portion<select className={field} value={line.portionId} disabled={busy||Boolean(pendingEntry)} onChange={event=>changeLine(line.id,{portionId:event.target.value})}><option value="">Standard portion</option>{portions.map(portion=><option key={String(portion.id)} value={String(portion.id)}>{String(portion.name||portion.id)} · KES {(Number(portion.priceMinor||0)/100).toFixed(2)}</option>)}</select></label>}
     {modifiers.length>0&&<fieldset className="flex flex-wrap gap-3" disabled={busy||Boolean(pendingEntry)}><legend className="text-sm">Options</legend>{modifiers.map(modifier=><label key={String(modifier.id)} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={line.modifierIds.includes(String(modifier.id))} onChange={event=>changeLine(line.id,{modifierIds:event.target.checked?[...line.modifierIds,String(modifier.id)]:line.modifierIds.filter(id=>id!==String(modifier.id))})}/>{String(modifier.name)}</label>)}</fieldset>}
    </div>;
   })}</div>
   <button type="button" className={button} disabled={busy||Boolean(pendingEntry)||lines.length>=20} onClick={()=>setLines(current=>[...current,{id:uuid(),productId:'',quantity:'1',portionId:'',modifierIds:[]}])}>Add item</button>
   <label className="block max-w-sm text-sm">Cash received (KES)<input required type="number" min="0.01" step="0.01" inputMode="decimal" className={field} value={cashTendered} disabled={busy||Boolean(pendingEntry)} onChange={event=>setCashTendered(event.target.value)}/></label>
   <button className="min-h-11 rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" disabled={disabled||busy||Boolean(pendingEntry)||online||!grantReady||!till||!cashAccount||!selectedOutlet||!location||!settings}>{busy?'Saving sale…':'Queue cash sale for API confirmation'}</button>
  </form>
  {saleCommands.length>0&&<div className="space-y-2" aria-live="polite">{saleCommands.slice(0,3).map(entry=><p key={entry.id} role={entry.state==='CONFLICT'||entry.state==='REJECTED'?'alert':'status'} className="rounded border border-slate-700 p-2 text-sm">{entry.state==='PENDING_SYNC'?'Saved offline; not yet confirmed by the API.':entry.state==='OUTCOME_UNKNOWN'?'Outcome is unknown; recover this original command before taking another action.':entry.state==='SYNCHRONIZED'?'API confirmed after synchronization.':entry.state==='CONFLICT'?'API conflict; reconcile physical cash and stock before continuing.':'API rejected the sale; reconcile physical cash and stock before continuing.'}</p>)}</div>}
  {message&&<p role="status" className="text-sm text-amber-100">{message}</p>}
 </section>;
}
