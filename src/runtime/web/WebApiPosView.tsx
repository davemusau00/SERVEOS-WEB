import {WebApiPaymentPanel} from './WebApiPaymentPanel';
import {WebApiTillPanel} from './WebApiTillPanel';
import type {QueuedCommand} from './BusinessStore';
import React,{useEffect,useRef,useState} from 'react';
import {allowed,type BusinessRecord,type WebSession} from './session';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {inventoryRevisions} from './inventoryRevisions';
import {useBarcodeScanner,barcodeEquals} from '../../hooks/useBarcodeScanner';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const list=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.map(obj):[];
const money=(value:unknown)=>(Number(value||0)/100).toLocaleString('en-KE',{style:'currency',currency:'KES'});
type Editor={kind:'CREATE'|'ADD'|'EDIT'|'FIRE';id:string;reviewed:BusinessRecord[];order?:BusinessRecord;product?:BusinessRecord;line?:Record<string,unknown>};
const baseline=(row:BusinessRecord)=>({collection:row.collection,id:row.id,version:row.version});

export function WebApiPosView({records,session,disabled,command,queue,deviceId}:{records:BusinessRecord[];session:WebSession;disabled:boolean;command:Command;queue:QueuedCommand[];deviceId:string}){
 const outlets=records.filter(row=>row.collection==='outlets'&&!row.archived);
 const orders=records.filter(row=>row.collection==='orders'&&!row.archived);
 const [outletId,setOutletId]=useState(outlets[0]?.id||''),[orderId,setOrderId]=useState(''),[query,setQuery]=useState('');
 const [editor,setEditor]=useState<Editor|null>(null),[name,setName]=useState(''),[quantity,setQuantity]=useState('1'),[portion,setPortion]=useState(''),[destination,setDestination]=useState('COUNTER');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState('');
 const [pendingCommandId,setPendingCommandId]=useState('');
 const inFlight=useRef(false);
 useEffect(()=>{
  if(!pendingCommandId)return;const saved=queue.find(entry=>entry.id===pendingCommandId);
  if(!saved||['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(saved.state))return;
  setPending(false);setPendingCommandId('');
  if(saved.state==='SYNCHRONIZED'){if(saved.command.operation==='order.create')setOrderId(String(saved.command.payload.id));setEditor(null);setMessage('The original order action confirmed after recovery.');}
  else setMessage(saved.result?.error?.message||'The original action did not confirm. Close this review and reopen it using current order information.');
 },[queue,pendingCommandId]);
 const order=orders.find(row=>row.id===orderId);
 const products=records.filter(row=>row.collection==='products'&&!row.archived&&(!Array.isArray(row.data.outletIds)||!row.data.outletIds.length||row.data.outletIds.includes(outletId)));
 const visible=products.filter(row=>`${row.data.name||''} ${row.data.code||''}`.toLowerCase().includes(query.toLowerCase()));
 const canSell=allowed(session,'pos.sell'),canFire=allowed(session,'order.fire');
 const editable=order&&['OPEN','FIRED'].includes(String(order.data.state));
 const begin=(kind:Editor['kind'],product?:BusinessRecord,line?:Record<string,unknown>)=>{
  if(disabled||busy||pending||kind!=='CREATE'&&!editable)return;
  if(window.document.querySelector('[role="dialog"]')){setMessage('Finish the open review before starting another order action.');return;}
  setEditor({kind,id:crypto.randomUUID(),reviewed:records,order,product,line});setName('');setDestination('COUNTER');setQuantity(String(line?.quantity||1));setPortion('');setMessage('');
 };
 useBarcodeScanner({enabled:canSell&&!disabled&&!editor&&!busy&&!pending,onScan:code=>{
  const matches=products.filter(row=>barcodeEquals(String(row.data.barcode||''),code)||barcodeEquals(String(row.data.code||''),code));
  if(matches.length!==1){setMessage(matches.length?'Resolve duplicate barcode assignments before selling.':'No product matches this barcode in the selected outlet.');return;}
  if(!editable){setMessage('Open or select an editable order before scanning items.');return;}begin('ADD',matches[0]);
 },allowTabTerminator:true,maxInterKeyDelayMs:150});
 const submit=async(event:React.FormEvent,remove=false)=>{
  event.preventDefault();if(!editor||disabled||inFlight.current||pending)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const reviewed=editor.reviewed,settings=reviewed.find(row=>row.collection==='businessSettings'&&row.id===session.businessId);
   let operation:string,id:string,payload:Record<string,unknown>;
   if(editor.kind==='CREATE'){
    const outlet=reviewed.find(row=>row.collection==='outlets'&&row.id===outletId&&!row.archived);
    const storage=reviewed.find(row=>row.collection==='stockLocations'&&row.id===outlet?.data.defaultStockLocationId&&!row.archived);
    if(!settings||!outlet||!storage)throw new Error('Business settings and an outlet with an active storage place are required.');
    operation='order.create';id=editor.id;payload={id,name:name.trim(),outletId,serviceDestination:destination,expectedVersions:[{collection:'orders',id,version:0},baseline(outlet),baseline(storage),baseline(settings)]};
   }else{
    const reviewedOrder=editor.order;if(!reviewedOrder)throw new Error('The reviewed order is missing.');id=reviewedOrder.id;
    if(editor.kind==='ADD'){
     if(!editor.product||!settings)throw new Error('Refresh the selected product and business tax settings.');
     operation='order.addItem';payload={orderId:id,itemId:editor.id,productId:editor.product.id,quantity:Number(quantity),portionId:portion||undefined,modifierIds:[],expectedVersions:[baseline(reviewedOrder),baseline(editor.product),baseline(settings)]};
    }else if(editor.kind==='EDIT'){
     operation=remove?'order.removeItem':'order.updateItem';payload={orderId:id,itemId:editor.line?.id,...(remove?{}:{quantity:Number(quantity)}),expectedVersions:[baseline(reviewedOrder)]};
    }else{
     const stockIds=[...new Set(list(reviewedOrder.data.items).filter(line=>line.state==='DRAFT').flatMap(line=>list(obj(line.productSnapshot).ingredientSnapshot).map(ingredient=>String(ingredient.stockItemId))))];
     const revisions=inventoryRevisions(reviewed,stockIds,[String(reviewedOrder.data.stockLocationId)]);
     operation='order.fire';payload={orderId:id,...revisions,expectedVersions:[baseline(reviewedOrder),...revisions.expectedVersions]};
    }
   }
   const outcome=await command(operation,'orders',id,payload);
   if(isCommandConfirmed(outcome)){if(editor.kind==='CREATE')setOrderId(id);setEditor(null);setMessage('Order action confirmed.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN'){setPending(true);setPendingCommandId(outcome.commandId);}setMessage('message' in outcome?outcome.message:'The original order action is saved. Recover its outcome in Activity before submitting again.');}
  }catch(error){setMessage(error instanceof Error?error.message:String(error))}finally{inFlight.current=false;setBusy(false)}
 };
 const field='mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2';
 const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
 return <section className="space-y-4">
  <div className="flex flex-wrap items-end gap-3"><label className="min-w-48 text-sm">Outlet<select className={field} value={outletId} disabled={busy||Boolean(editor)} onChange={event=>{setOutletId(event.target.value);setOrderId('')}}><option value="">Select outlet…</option>{outlets.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label><button disabled={disabled||busy||pending||!canSell||!outletId} className={button} onClick={()=>begin('CREATE')}>Open order</button></div>
  <WebApiTillPanel records={records} session={session} deviceId={deviceId} outletId={outletId} disabled={disabled||busy||pending||Boolean(editor)} command={command} queue={queue}/>
  <WebApiPaymentPanel records={records} order={order} session={session} deviceId={deviceId} disabled={disabled||busy||pending||Boolean(editor)} command={command} queue={queue}/>
  <div className="grid gap-4 lg:grid-cols-[200px_1fr_350px]">
   <aside className="space-y-2"><h3 className="font-bold">Orders</h3>{orders.filter(row=>row.data.outletId===outletId).map(row=><button className={`${button} block w-full text-left ${orderId===row.id?'border-amber-400':''}`} key={row.id} disabled={busy||Boolean(editor)} onClick={()=>setOrderId(row.id)}>{String(row.data.name)}<span className="block text-xs text-slate-400">{String(row.data.state)} · {money(row.data.grandTotalMinor)}</span></button>)}</aside>
   <section><label className="block text-sm">Find product<input className={field} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Name or code"/></label><div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-3">{visible.map(row=><button key={row.id} disabled={disabled||busy||pending||!editable||!canSell||Boolean(editor)} onClick={()=>begin('ADD',row)} className={`${button} min-h-20 text-left`}><b>{String(row.data.name)}</b><span className="block text-sm">{money(row.data.priceMinor)}</span></button>)}</div></section>
   <aside className="rounded-xl border border-slate-700 p-3">{order?<><h3 className="font-bold">{String(order.data.name)}</h3><p className="text-xs text-slate-400">{String(order.data.state)} · revision {order.version}</p><div className="my-3 space-y-2">{list(order.data.items).filter(line=>line.state!=='VOIDED').map(line=><div className="rounded bg-slate-950 p-2 text-sm" key={String(line.id)}><b>{String(line.name||obj(line.productSnapshot).name)}</b><p>{Number(line.quantity)} × {money(line.unitPriceMinor)} = {money(line.lineTotalMinor)}</p><p className="text-xs text-slate-400">{String(line.state)}</p>{line.state==='DRAFT'&&canSell&&<button className={button} disabled={disabled||busy||pending||Boolean(editor)} onClick={()=>begin('EDIT',undefined,line)}>Edit quantity / remove</button>}</div>)}</div><p className="font-bold">Total {money(order.data.grandTotalMinor)}</p><p>Paid {money(order.data.amountPaidMinor)}</p><p>Balance {money(Number(order.data.grandTotalMinor)-Number(order.data.amountPaidMinor))}</p>{canFire&&<button className={`${button} mt-3`} disabled={disabled||busy||pending||!editable||Boolean(editor)||!list(order.data.items).some(line=>line.state==='DRAFT')} onClick={()=>begin('FIRE')}>Review and fire order</button>}</>:<p>Select or open an order.</p>}</aside>
  </div>
  {editor&&<form role="dialog" aria-label="Review order action" onSubmit={event=>void submit(event)} className="space-y-3 rounded-xl border border-amber-700 p-4">
   <h3 className="font-bold">{editor.kind==='CREATE'?'Open order':editor.kind==='ADD'?String(editor.product?.data.name):editor.kind==='EDIT'?'Edit unfired line':'Fire reviewed order'}</h3>
   {editor.kind==='CREATE'&&<><label className="block text-sm">Order name<input required maxLength={120} disabled={busy||pending} className={field} value={name} onChange={event=>setName(event.target.value)}/></label><label className="block text-sm">Service<select className={field} value={destination} disabled={busy||pending} onChange={event=>setDestination(event.target.value)}><option value="COUNTER">Counter</option><option value="TAKEAWAY">Takeaway</option></select></label></>}
   {['ADD','EDIT'].includes(editor.kind)&&<label className="block text-sm">Quantity<input required type="number" min="0.000001" max="1000000" step="0.000001" className={field} disabled={busy||pending} value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>}
   {editor.kind==='ADD'&&list(editor.product?.data.portions).length>0&&<label className="block text-sm">Portion<select className={field} value={portion} disabled={busy||pending} onChange={event=>setPortion(event.target.value)}><option value="">Standard</option>{list(editor.product?.data.portions).map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name)} · {money(row.priceMinor)}</option>)}</select></label>}
   {editor.kind==='FIRE'&&<p className="text-sm">Confirm the unfired lines in {String(editor.order?.data.name)}. Stock will be consumed and kitchen/bar tickets will be issued using the reviewed balance revisions.</p>}
   <button className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" disabled={disabled||busy||pending}>Confirm</button>{editor.kind==='EDIT'&&<button type="button" className={`${button} ml-2`} disabled={disabled||busy||pending} onClick={event=>void submit(event,true)}>Remove unfired line</button>}<button type="button" className={`${button} ml-2`} disabled={busy} onClick={()=>setEditor(null)}>Close review</button>
  </form>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
