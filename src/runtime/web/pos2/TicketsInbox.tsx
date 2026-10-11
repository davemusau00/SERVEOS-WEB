import React,{useEffect,useRef,useState} from 'react';
import type {WebApiPosProps} from '../WebApiPosView';
import {allowed,type BusinessRecord} from '../session';
import {inventoryRevisions} from '../inventoryRevisions';
import {formatDocumentMoney} from '../documentPaperProfiles';
import {operatorError} from '../operatorError';

const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value:[];
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
const version=(row:BusinessRecord)=>({collection:row.collection,id:row.id,version:row.version});
type Line={id:string;productId:string;quantity:number;productVersion:number;unitPriceMinor:number;portionId?:string;modifierIds?:string[];note?:string};
export function TicketsInbox({records,session,store,command,disabled,queue}:WebApiPosProps){
 const outlets=records.filter(row=>row.collection==='outlets'&&!row.archived),products=records.filter(row=>row.collection==='products'&&!row.archived);
 const [ticketId,setTicket]=useState<string>(()=>crypto.randomUUID()),[revision,setRevision]=useState(0),[outletId,setOutlet]=useState(outlets[0]?.id||''),[tableId,setTable]=useState(''),[name,setName]=useState(''),[lines,setLines]=useState<Line[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const inFlight=useRef(false);
 useEffect(()=>{let mounted=true;void store.drafts().then(drafts=>{const draft=drafts.find(row=>row.operation==='ticket.submit'&&row.editorKind==='Waiter ticket');if(!draft||!mounted)return;const p=draft.payload;setTicket(draft.id);setOutlet(String(p.outletId||''));setTable(String(p.tableId||''));setName(String(p.name||''));setLines(Array.isArray(p.lines)?p.lines as Line[]:[]);setMessage('Unsent draft restored on this device. It has not reached the cashier.');});return()=>{mounted=false};},[store]);
 const payload=()=>({ticketId,outletId,tableId:tableId||undefined,name:name.trim()||'Waiter order',lines});
 const chooseOptions=(lineId:string,patch:Partial<Line>)=>{
  setLines(current=>current.map(line=>{
   if(line.id!==lineId)return line;
   const product=products.find(row=>row.id===line.productId),next={...line,...patch};
   if(!product)return line;
   const portion=rows(product.data.portions).find(row=>row.id===next.portionId);
   let price=BigInt(Number(portion?.priceMinor??product.data.priceMinor));
   for(const modifier of rows(product.data.modifiers))if(next.modifierIds?.includes(String(modifier.id)))price+=BigInt(Number(modifier.priceDeltaMinor));
   if(price>BigInt(Number.MAX_SAFE_INTEGER)){setMessage('This option price exceeds the supported amount.');return line;}
   return {...next,productVersion:product.version,unitPriceMinor:Number(price<0n?0n:price)};
  }));
 };
 const saveDraft=async()=>{await store.saveDraft({id:ticketId,operation:'ticket.submit',collection:'posTickets',targetId:ticketId,editorKind:'Waiter ticket',inputValues:{},payload:payload(),expectedVersions:[],validationSummary:[],requiresReview:false});setMessage('Draft saved on this device. It has not reached the cashier.');};
 const send=async()=>{
  if(inFlight.current||disabled||busy||!lines.length)return;inFlight.current=true;setBusy(true);
  try{
   if(!navigator.onLine){await saveDraft();return;}
   const operation=revision?'ticket.revise':'ticket.submit';
   const outcome=await command(operation,'posTickets',ticketId,{...payload(),expectedVersions:[{collection:'posTickets',id:ticketId,version:revision}]});
   if(outcome.kind==='CONFIRMED'){await store.discardDraft(ticketId);setLines([]);setName('');setRevision(0);setTicket(crypto.randomUUID());setMessage('Acknowledged by server. Waiting for cashier approval.');}
   else setMessage('message' in outcome?outcome.message:'Delivery is not confirmed. Check Activity for the original submission before sending again.');
  }catch(error){setMessage(operatorError(error));}finally{inFlight.current=false;setBusy(false);}
 };
 const act=async(ticket:BusinessRecord,operation:string)=>{
  if(inFlight.current||disabled||busy)return;inFlight.current=true;setBusy(true);
  try{
   const base={ticketId:ticket.id,expectedVersions:[version(ticket)]};
   let payload:Record<string,unknown>=base;
   if(operation==='ticket.approve'){
    const proposal=object(ticket.data.payload),proposalLines=rows(proposal.lines);
    const outlet=outlets.find(row=>row.id===ticket.data.outletId),storage=records.find(row=>row.collection==='stockLocations'&&row.id===outlet?.data.defaultStockLocationId&&!row.archived),settings=records.find(row=>row.collection==='businessSettings'&&row.id===session.businessId);
    if(!outlet||!storage||!settings)throw new Error('Refresh outlet, stock location and tax policy before approval.');
    const selected=proposalLines.map(line=>products.find(product=>product.id===line.productId));
    if(selected.some(product=>!product))throw new Error('A proposed product is unavailable. Ask the author to revise the ticket.');
    const stockIds=[...new Set(selected.flatMap(product=>rows(product?.data.recipeIngredients).map(ingredient=>String(ingredient.stockItemId)).concat(product?.data.stockItemId?[String(product.data.stockItemId)]:[])))];
    for(const product of selected)for(const modifier of rows(product?.data.modifiers))for(const adjustment of rows(modifier.ingredientAdjustments))if(!stockIds.includes(String(adjustment.stockItemId)))stockIds.push(String(adjustment.stockItemId));
    const inventories=inventoryRevisions(records,stockIds,[storage.id]);
    const existing=ticket.data.tableId?records.find(row=>row.collection==='orders'&&row.data.tableId===ticket.data.tableId&&['OPEN','FIRED'].includes(String(row.data.state))):undefined;
    const orderId=existing?.id||crypto.randomUUID(),table=records.find(row=>row.collection==='tables'&&row.id===ticket.data.tableId);
    payload={ticketId:ticket.id,orderId,...inventories,expectedVersions:[version(ticket),version(outlet),version(storage),version(settings),...selected.map(product=>version(product!)),...inventories.expectedVersions,...(table?[version(table)]:[]),existing?version(existing):{collection:'orders',id:orderId,version:0}]};
   }else{const reason=window.prompt(operation==='ticket.reject'?'Reason for rejecting the ticket':'Reason for cancelling the proposal');if(!reason)return;payload={...base,reason};}
   const result=await command(operation,'posTickets',ticket.id,payload);
   setMessage(result.kind==='CONFIRMED'?'Decision recorded. Check the ticket status; stock or price discrepancies require review.':'message' in result?result.message:'Decision not yet acknowledged. Recover its original command in Activity.');
  }catch(error){setMessage(operatorError(error));}finally{inFlight.current=false;setBusy(false);}
 };
 const tickets=records.filter(row=>row.collection==='posTickets'&&(allowed(session,'ticket.view_outlet')||allowed(session,'ticket.approve')||row.data.createdByStaffId===session.actorId));
 const pending=queue.some(row=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(row.state)&&row.command.payload.ticketId===ticketId);
 const button='min-h-11 rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
 return <section aria-label="Waiter tickets" className="space-y-4">
  <h2 className="text-xl font-bold">Tickets ({tickets.filter(row=>['SUBMITTED','NEEDS_REVIEW'].includes(String(row.data.status))).length})</h2>
  {allowed(session,'business.configure')&&<button className={button} disabled={disabled||busy||!navigator.onLine} onClick={()=>void command('pos.checkoutEnroll','posTickets',session.businessId,{outletId,deviceId:store.deviceId}).then(result=>setMessage(result.kind==='CONFIRMED'?'This device is enrolled as the checkout terminal.':'message' in result?result.message:'Enrollment pending; check Activity.'))}>Enroll this checkout device for selected outlet</button>}
  {allowed(session,'ticket.create')&&<form className="space-y-2 rounded-xl border border-slate-700 p-3" onSubmit={event=>{event.preventDefault();void send();}}>
   <label>Outlet<select className={button} value={outletId} disabled={busy||revision>0} onChange={event=>{setOutlet(event.target.value);setTable('');}}>{outlets.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label>
   <label>Table / takeaway<select className={button} value={tableId} disabled={busy||revision>0} onChange={event=>setTable(event.target.value)}><option value="">Takeaway / counter</option>{records.filter(row=>row.collection==='tables'&&row.data.outletId===outletId&&!row.archived).map(row=><option key={row.id} value={row.id}>{String(row.data.label)}</option>)}</select></label>
   <label>Order name<input className={button} maxLength={120} value={name} onChange={event=>setName(event.target.value)}/></label>
   <label>Search products<input className={button} value={search} onChange={event=>setSearch(event.target.value)}/></label>
   <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">{products.filter(product=>(!Array.isArray(product.data.outletIds)||!product.data.outletIds.length||product.data.outletIds.includes(outletId))&&String(product.data.name).toLowerCase().includes(search.toLowerCase())).map(product=><button type="button" key={product.id} className={button} disabled={busy||pending} onClick={()=>{setLines(current=>[...current,{id:crypto.randomUUID(),productId:product.id,productVersion:product.version,unitPriceMinor:Number(product.data.priceMinor),quantity:1}]);}}>{String(product.data.name)}</button>)}</div>
   {lines.map(line=><div key={line.id} className="flex flex-wrap gap-2"><span>{String(products.find(product=>product.id===line.productId)?.data.name||'Unavailable product')}</span><label>Quantity<input className={button} type="number" min="0.000001" max="1000000" step="0.000001" value={line.quantity} onChange={event=>setLines(current=>current.map(row=>row.id===line.id?{...row,quantity:Number(event.target.value)}:row))}/></label>{(()=>{const product=products.find(row=>row.id===line.productId);return <><label>Portion<select className={button} value={line.portionId||''} onChange={event=>chooseOptions(line.id,{portionId:event.target.value||undefined})}><option value="">Standard</option>{rows(product?.data.portions).map(portion=><option key={String(portion.id)} value={String(portion.id)}>{String(portion.name)} {formatDocumentMoney(Number(portion.priceMinor))}</option>)}</select></label>{rows(product?.data.modifiers).map(modifier=><label key={String(modifier.id)}><input type="checkbox" checked={line.modifierIds?.includes(String(modifier.id))||false} onChange={event=>chooseOptions(line.id,{modifierIds:event.target.checked?[...(line.modifierIds||[]),String(modifier.id)]:(line.modifierIds||[]).filter(id=>id!==modifier.id)})}/>{String(modifier.name)}</label>)}</>;})()}<label>Preparation note<input className={button} maxLength={500} value={line.note||''} onChange={event=>setLines(current=>current.map(row=>row.id===line.id?{...row,note:event.target.value}:row))}/></label><button type="button" className={button} onClick={()=>setLines(current=>current.filter(row=>row.id!==line.id))}>Remove</button></div>)}
   <button className={`${button} bg-amber-400 text-slate-950`} disabled={disabled||busy||pending||!lines.length}>Send to cashier</button><button type="button" className={button} disabled={busy||pending} onClick={()=>void saveDraft().catch(error=>setMessage(operatorError(error)))}>Save unsent draft</button>
   <p>Only server acknowledgement delivers this proposal. The cashier must approve before preparation or stock movement.</p>
  </form>}
  {tickets.map(ticket=><article key={ticket.id} className="space-y-2 rounded-xl border border-slate-700 p-3"><h3 className="font-bold">{String(object(ticket.data.payload).name)} · {String(ticket.data.status)}</h3><p>{new Date(String(ticket.data.submittedAt)).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})}</p>{rows(object(ticket.data.payload).lines).map(line=><p key={String(line.id)}>{String(products.find(product=>product.id===line.productId)?.data.name||'Unavailable product')} × {String(line.quantity)} · reviewed unit {formatDocumentMoney(Number(line.unitPriceMinor))}{line.note?` · ${String(line.note)}`:''}</p>)}{Boolean(ticket.data.reason)&&<p>{String(ticket.data.reason)}</p>}{['SUBMITTED','NEEDS_REVIEW'].includes(String(ticket.data.status))&&<div className="flex flex-wrap gap-2">{allowed(session,'ticket.approve')&&<button className={button} disabled={disabled||busy||!navigator.onLine} onClick={()=>void act(ticket,'ticket.approve')}>Approve & send</button>}{allowed(session,'ticket.reject')&&<button className={button} disabled={disabled||busy||!navigator.onLine} onClick={()=>void act(ticket,'ticket.reject')}>Reject with reason</button>}{ticket.data.createdByStaffId===session.actorId&&<><button className={button} disabled={disabled||busy||pending} onClick={()=>{setTicket(ticket.id);setRevision(ticket.version);setOutlet(String(ticket.data.outletId));setTable(String(ticket.data.tableId||''));setName(String(object(ticket.data.payload).name));setLines(rows(object(ticket.data.payload).lines).map(line=>({...line,productVersion:products.find(product=>product.id===line.productId)?.version||Number(line.productVersion),unitPriceMinor:Number(products.find(product=>product.id===line.productId)?.data.priceMinor??line.unitPriceMinor)})) as Line[]);setMessage('Review the current product prices and options before re-submitting.');}}>Revise pending ticket</button><button className={button} disabled={disabled||busy||!navigator.onLine} onClick={()=>void act(ticket,'ticket.cancel')}>Cancel proposal</button></>}</div>}</article>)}
  {message&&<p role="status">{message}</p>}
 </section>;
}
