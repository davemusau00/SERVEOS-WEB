import React,{useEffect,useRef,useState} from 'react';
import type {WebApiPosProps} from '../WebApiPosView';
import {allowed,type BusinessRecord} from '../session';
import {WebApiPaymentPanel} from '../WebApiPaymentPanel';
import {inventoryRevisions} from '../inventoryRevisions';
import {operatorError} from '../operatorError';
import {formatDocumentMoney} from '../documentPaperProfiles';
import {useBarcodeScanner,barcodeEquals} from '../../../hooks/useBarcodeScanner';

const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value:[];
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
const revision=(row:BusinessRecord)=>({collection:row.collection,id:row.id,version:row.version});
const money=(value:unknown)=>formatDocumentMoney(Number(value||0));

export function CashierWorkspace({records,session,deviceId,queue,command,disabled,readRecords,onMore,initialOrderId='',onOrderChange}:WebApiPosProps&{onMore:()=>void;onOrderChange?:(id:string)=>void}){
 const outlets=records.filter(row=>row.collection==='outlets'&&!row.archived);
 const [outletId,setOutlet]=useState(String(records.find(row=>row.collection==='orders'&&row.id===initialOrderId)?.data.outletId||outlets[0]?.id||'')),[orderId,setOrder]=useState(initialOrderId),[query,setQuery]=useState(''),[category,setCategory]=useState('');
 useEffect(()=>onOrderChange?.(orderId),[orderId,onOrderChange]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[paymentRequest,setPaymentRequest]=useState(0);
 const [choice,setChoice]=useState<BusinessRecord|null>(null),[portionId,setPortion]=useState(''),[modifiers,setModifiers]=useState<string[]>([]),[note,setNote]=useState('');
 const inFlight=useRef(false);
 const order=records.find(row=>row.collection==='orders'&&row.id===orderId);
 const lines=rows(order?.data.items).filter(row=>row.state!=='VOIDED');
 const till=records.find(row=>row.collection==='tillSessions'&&row.data.status==='OPEN'&&row.data.operatorId===session.actorId&&row.data.deviceId===deviceId&&row.data.outletId===outletId);
 const products=records.filter(row=>row.collection==='products'&&!row.archived&&row.data.available!==false&&(!Array.isArray(row.data.outletIds)||row.data.outletIds.length===0||row.data.outletIds.includes(outletId)));
 const pending=queue.some(row=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(row.state)&&(row.command.payload.orderId===orderId&&Boolean(orderId)||row.command.payload.tillSessionId===till?.id&&Boolean(till)));
 const locked=disabled||busy||pending||!navigator.onLine;
 const balance=Number(order?.data.grandTotalMinor||0)-Number(order?.data.amountPaidMinor||0)-Number(order?.data.amountCreditedMinor||0)-Number(order?.data.roomChargeMinor||0);
 const editable=!order||['OPEN','FIRED'].includes(String(order.data.state))&&Number(order.data.amountPaidMinor||0)+Number(order.data.amountCreditedMinor||0)+Number(order.data.roomChargeMinor||0)===0;
 const run=async(operation:string,id:string,payload:Record<string,unknown>)=>{
  const result=await command(operation,'orders',id,payload);
  if(result.kind!=='CONFIRMED'){setMessage('message' in result?result.message:'Saved; check the original action in Activity before retrying.');return false;}return true;
 };
 const add=async(product:BusinessRecord,selectedPortion='',selectedModifiers:string[]=[],preparationNote='')=>{
  if(locked||inFlight.current||!editable||!allowed(session,'pos.sell'))return;
  if(orderId&&!order){setMessage('The original sale is updating. Recover it in Activity before adding more items.');return;}
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const settings=records.find(row=>row.collection==='businessSettings'&&row.id===session.businessId);
   if(!settings)throw new Error('Refresh business tax settings before starting a sale.');
   const same=lines.find(line=>line.state==='DRAFT'&&line.productId===product.id&&!selectedPortion&&!selectedModifiers.length&&!preparationNote&&!object(line.portionSnapshot).id&&!rows(line.modifierSnapshots).length&&!line.notes);
   if(order&&same){await run('order.updateItem',order.id,{orderId:order.id,itemId:same.id,quantity:Number(same.quantity)+1,note:lineNote(same),courseName:String(same.courseName||''),expectedVersions:[revision(order)]});}
   else if(order){await run('order.addItem',order.id,{orderId:order.id,itemId:crypto.randomUUID(),productId:product.id,quantity:1,portionId:selectedPortion||undefined,modifierIds:selectedModifiers,note:preparationNote,expectedVersions:[revision(order),revision(product),revision(settings)]});}
   else{
    const outlet=outlets.find(row=>row.id===outletId),storage=records.find(row=>row.collection==='stockLocations'&&row.id===outlet?.data.defaultStockLocationId&&!row.archived);
    if(!outlet||!storage)throw new Error('Choose an outlet with an active stock location.');
    const id=crypto.randomUUID();
    setOrder(id);
    await run('order.quickAdd',id,{orderId:id,itemId:crypto.randomUUID(),outletId,name:'Counter sale',productId:product.id,quantity:1,portionId:selectedPortion||undefined,modifierIds:selectedModifiers,note:preparationNote,expectedVersions:[{collection:'orders',id,version:0},revision(outlet),revision(storage),revision(settings),revision(product)]});
   }
   setChoice(null);
  }catch(error){setMessage(operatorError(error));}finally{inFlight.current=false;setBusy(false);}
 };
 const select=(product:BusinessRecord)=>{if(locked)return;if(rows(product.data.portions).length||rows(product.data.modifiers).length){setChoice(product);setPortion('');setModifiers([]);setNote('');}else void add(product);};
 useBarcodeScanner({enabled:!locked&&!choice,onScan:code=>{
  const matches=products.filter(product=>barcodeEquals(String(product.data.barcode||''),code)||(Array.isArray(product.data.barcodeAliases)&&product.data.barcodeAliases.some(alias=>barcodeEquals(String(alias),code))));
  if(matches.length===1)select(matches[0]);else{setQuery(code);setMessage(matches.length?'Several products match this barcode. Choose the correct item.':'No sellable product matches this barcode.');}
 }});
 const pay=async()=>{
  if(!order||locked||inFlight.current||!till||balance<=0)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const drafts=lines.filter(line=>line.state==='DRAFT');
   if(drafts.length){
    if(!allowed(session,'order.fire'))throw new Error('Your role cannot release preparation. Use the authorized checkout workflow.');
    const stockIds=[...new Set(drafts.flatMap(line=>rows(object(line.productSnapshot).ingredientSnapshot).map(ingredient=>String(ingredient.stockItemId))))];
    const revisions=inventoryRevisions(records,stockIds,[String(order.data.stockLocationId)]);
    if(!await run('order.fire',order.id,{orderId:order.id,itemIds:drafts.map(line=>line.id),...revisions,expectedVersions:[revision(order),...revisions.expectedVersions]}))return;
   }
   const fresh=(await readRecords()).find(row=>row.collection==='orders'&&row.id===order.id);
   if(fresh?.data.state==='FIRED')setPaymentRequest(value=>value+1);else setMessage('Recorded, updating display. Check Activity before retrying.');
  }catch(error){setMessage(operatorError(error));}finally{inFlight.current=false;setBusy(false);}
 };
 const button='min-h-11 rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
 const visible=products.filter(product=>(!category||product.data.category===category)&&`${product.data.name} ${product.data.code||''} ${product.data.barcode||''}`.toLowerCase().includes(query.toLowerCase()));
 return <section aria-label="Cashier workspace" className="flex min-h-0 flex-col gap-3 lg:h-[calc(100dvh-12rem)]">
  <header className="flex flex-wrap items-center gap-3"><label>Outlet <select className={button} value={outletId} disabled={busy||Boolean(order)} onChange={event=>setOutlet(event.target.value)}>{outlets.map(outlet=><option key={outlet.id} value={outlet.id}>{String(outlet.data.name)}</option>)}</select></label><span>{till?'Shift open':'Start a shift in More'}</span><span role="status">{navigator.onLine?'API status checked in Activity':'Offline — online checkout only until offline capability is provisioned'}</span><button className={button} onClick={onMore}>More / Shift / Activity</button></header>
  <nav className="flex gap-2" aria-label="Cashier orders"><button className={button} disabled={busy||pending} onClick={()=>{setOrder('');setPaymentRequest(0);setMessage('');}}>New sale</button><label>Held / History <select className={button} value={orderId} disabled={busy} onChange={event=>{setOrder(event.target.value);setPaymentRequest(0);}}><option value="">Choose sale</option>{records.filter(row=>row.collection==='orders'&&row.data.outletId===outletId).map(row=><option key={row.id} value={row.id}>{String(row.data.name)} · {String(row.data.state)}</option>)}</select></label></nav>
  <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
   <section className="flex min-h-0 flex-col gap-3"><label>Search products<input className="block min-h-11 w-full rounded border border-slate-600 bg-slate-950 p-2" value={query} onChange={event=>setQuery(event.target.value)}/></label><label>Category <select className={button} value={category} onChange={event=>setCategory(event.target.value)}><option value="">All</option>{[...new Set(products.map(product=>String(product.data.category||'')))].filter(Boolean).sort().map(value=><option key={value}>{value}</option>)}</select></label><div className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">{visible.map(product=><button key={product.id} className={`${button} min-h-20 text-left`} disabled={locked||!editable} onClick={()=>select(product)}><b className="block">{String(product.data.name)}</b>{money(product.data.priceMinor)}</button>)}</div></section>
   <aside aria-label="Current bill" className="sticky bottom-0 flex min-h-48 flex-col rounded-xl border border-slate-700 bg-slate-950 p-3 lg:static lg:min-h-0"><h3 className="font-bold">{String(order?.data.name||'New sale')}</h3><div className="min-h-0 flex-1 overflow-y-auto">{lines.map(line=><div key={String(line.id)} className="border-b border-slate-800 py-2"><b>{String(line.name)}</b><p>{String(line.quantity)} × {money(line.unitPriceMinor)} = {money(line.lineTotalMinor)}</p><small>{line.state==='DRAFT'?'Held':String(line.state)}</small></div>)}</div><p>Paid {money(order?.data.amountPaidMinor)}</p><p className="text-xl font-bold">Balance {money(balance)}</p><button className={`${button} bg-amber-400 font-bold text-slate-950`} disabled={locked||!till||!order||balance<=0||!allowed(session,'payment.record')} onClick={()=>void pay()}>Pay {money(balance)}</button>{!till&&<p>Open your shift in More before accepting payment.</p>}</aside>
  </div>
  <WebApiPaymentPanel key={orderId} records={records} order={order} session={session} deviceId={deviceId} queue={queue} command={command} disabled={disabled||busy} compact openRequest={paymentRequest}/>
  {choice&&<form role="dialog" aria-label="Choose product options" className="fixed inset-4 z-50 overflow-auto rounded-xl border border-slate-600 bg-slate-950 p-4 lg:inset-x-1/3" onSubmit={event=>{event.preventDefault();void add(choice,portionId,modifiers,note);}}><h3>{String(choice.data.name)}</h3><label>Portion<select className={button} value={portionId} onChange={event=>setPortion(event.target.value)}><option value="">Standard</option>{rows(choice.data.portions).map(portion=><option key={String(portion.id)} value={String(portion.id)}>{String(portion.name)} · {money(portion.priceMinor)}</option>)}</select></label>{rows(choice.data.modifiers).map(modifier=><label key={String(modifier.id)} className="block py-2"><input type="checkbox" checked={modifiers.includes(String(modifier.id))} onChange={event=>setModifiers(values=>event.target.checked?[...values,String(modifier.id)]:values.filter(id=>id!==modifier.id))}/> {String(modifier.name)} · {money(modifier.priceDeltaMinor)}</label>)}<label>Preparation note<input className={button} maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label><button className={button} disabled={busy}>Add item</button><button type="button" className={button} disabled={busy} onClick={()=>setChoice(null)}>Close</button></form>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
const lineNote=(line:Record<string,unknown>)=>String(line.notes||'');
