import {WebDocumentQueue} from './WebDocumentQueue';
import type {ApiAuthenticatedDeviceSession} from './apiAuth';
import React,{useEffect,useRef,useState} from 'react';
import {allowed,type BusinessRecord,type WebSession} from './session';
import type {QueuedCommand} from './BusinessStore';
import type {CommandOutcome} from '../../types/transactions';
import {parseMoneyToMinor} from '../../utils/fiscal';
type Line={id:string;stockItemId:string;purchasePackageId:string;quantity:string;price:string};
type Editor={id:string;version:number;reviewed:BusinessRecord[];supplierId:string;delivery:string;notes:string;lines:Line[]};
const obj=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const list=(value:unknown)=>Array.isArray(value)?value.map(obj):[];
const blank=():Line=>({id:crypto.randomUUID(),stockItemId:'',purchasePackageId:'',quantity:'1',price:'0.00'});
const input='mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2';
const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
export function WebApiPurchaseOrders({records,session,queue,disabled,command,apiAuth,readRecords}:{apiAuth?:ApiAuthenticatedDeviceSession;readRecords?:()=>Promise<BusinessRecord[]>;records:BusinessRecord[];session:WebSession;queue:QueuedCommand[];disabled:boolean;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>}){
 const [editor,setEditor]=useState<Editor|null>(null),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pendingId,setPendingId]=useState('');const inFlight=useRef(false);
 const [review,setReview]=useState<{record:BusinessRecord;action:'approve'|'issue'}|null>(null),[acknowledged,setAcknowledged]=useState(false),[documentPo,setDocumentPo]=useState('');
 const manage=allowed(session,'procurement.manage');
 const unresolved=queue.some(row=>['procurement.saveDraft','procurement.approve','procurement.issue'].includes(row.command.operation)&&['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(row.state));
 const blocked=disabled||busy||unresolved||Boolean(pendingId);
 useEffect(()=>{if(!pendingId)return;const entry=queue.find(row=>row.id===pendingId);if(!entry||!['SYNCHRONIZED','REJECTED','CONFLICT'].includes(entry.state))return;setPendingId('');setEditor(null);setReview(null);setMessage(entry.state==='SYNCHRONIZED'?'Original purchase draft saved and confirmed.':entry.result?.error?.message||'Reopen the latest draft to review the original unsuccessful action.');},[queue,pendingId]);
 const open=(record?:BusinessRecord)=>{setReview(null);setEditor({id:record?.id||crypto.randomUUID(),version:record?.version??0,reviewed:records,supplierId:String(record?.data.supplierId||''),delivery:String(record?.data.expectedDeliveryDate||''),notes:String(record?.data.notes||''),lines:record?list(record.data.items).map(line=>({id:String(line.id),stockItemId:String(line.stockItemId),purchasePackageId:String(obj(line.purchasePackageSnapshot).id||''),quantity:String(line.quantityOrdered),price:(Number(line.unitPriceMinor)/100).toFixed(2)})):[blank()]});setReason('');setMessage('');};
 const patch=(id:string,change:Partial<Line>)=>setEditor(current=>current?{...current,lines:current.lines.map(line=>line.id===id?{...line,...change}:line)}:null);
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(!editor||blocked||inFlight.current||!manage)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const supplier=editor.reviewed.find(row=>row.collection==='suppliers'&&row.id===editor.supplierId&&!row.archived);if(!supplier)throw new Error('Choose a reviewed active supplier.');
   const expectedVersions=[{collection:'purchaseOrders',id:editor.id,version:editor.version},{collection:'suppliers',id:supplier.id,version:supplier.version}];
   const stockIds=new Set<string>();const items=editor.lines.map(line=>{
    const stock=editor.reviewed.find(row=>row.collection==='stockItems'&&row.id===line.stockItemId&&!row.archived);if(!stock||stockIds.has(stock.id))throw new Error('Each purchase line needs a different reviewed stock item.');stockIds.add(stock.id);
    if(!/^\d+(?:\.\d{1,6})?$/.test(line.quantity)||Number(line.quantity)<=0||Number(line.quantity)>1e9)throw new Error('Enter positive quantities with at most six decimal places.');
    if(line.purchasePackageId&&!Number.isInteger(Number(line.quantity)))throw new Error('Purchase packages require whole package counts.');
    expectedVersions.push({collection:'stockItems',id:stock.id,version:stock.version});
    return {id:line.id,stockItemId:stock.id,purchasePackageId:line.purchasePackageId||null,treatment:'STOCK',quantityOrdered:Number(line.quantity),unitPriceMinor:parseMoneyToMinor(line.price)};
   });
   const outcome=await command('procurement.saveDraft','purchaseOrders',editor.id,{id:editor.id,supplierId:supplier.id,expectedDeliveryDate:editor.delivery||null,notes:editor.notes,items,reason:reason.trim(),expectedVersions});
   if(outcome.kind==='CONFIRMED'){setEditor(null);setMessage('Purchase order draft saved and confirmed. No stock was received.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPendingId(outcome.commandId);setMessage('message' in outcome?outcome.message:'Recover the original purchase draft action in Activity.');}
  }catch(error){setMessage(error instanceof Error?error.message:'Cannot save purchase draft.');}finally{inFlight.current=false;setBusy(false);}
 };
 const beginReview=(record:BusinessRecord,action:'approve'|'issue')=>{setEditor(null);setReview({record,action});setReason('');setAcknowledged(false);setMessage('');};
 const transition=async(event:React.FormEvent)=>{
  event.preventDefault();if(!review||blocked||inFlight.current||!manage||!acknowledged)return;inFlight.current=true;setBusy(true);setMessage('');
  try{const outcome=await command(`procurement.${review.action}`,'purchaseOrders',review.record.id,{id:review.record.id,reason:reason.trim(),expectedVersions:[{collection:'purchaseOrders',id:review.record.id,version:review.record.version}]});
   if(outcome.kind==='CONFIRMED'){setReview(null);setMessage(review.action==='approve'?'Purchase order approved. Its content is now frozen.':'Purchase order issued and print job queued. Supplier delivery is not confirmed.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPendingId(outcome.commandId);setMessage('message' in outcome?outcome.message:'Recover the original purchase order transition in Activity.');}
  }catch(error){setMessage(error instanceof Error?error.message:'Cannot change purchase order status.');}finally{inFlight.current=false;setBusy(false);}
 };
 const printedPo=records.find(row=>row.collection==='purchaseOrders'&&row.id===documentPo);
 const printDocumentId=printedPo?.data.documentId;
 const printRecords=records.filter(row=>row.collection==='businessDocuments'&&row.id===printDocumentId||row.collection==='printJobs'&&row.data.documentId===printDocumentId);
 const suppliers=(editor?.reviewed||records).filter(row=>row.collection==='suppliers'&&!row.archived),stocks=(editor?.reviewed||records).filter(row=>row.collection==='stockItems'&&!row.archived);
 return <section className="space-y-4" aria-label="Purchase order drafts">
  <h2 className="text-xl font-bold">Purchase orders</h2>{manage&&<button className={button} disabled={blocked||!suppliers.length} onClick={()=>open()}>New purchase order draft</button>}
  {unresolved&&<p role="status">Recover the original procurement action in Activity before another draft change.</p>}
  <div className="grid gap-3 md:grid-cols-2">{records.filter(row=>row.collection==='purchaseOrders').map(row=><article key={row.id} className="space-y-2 rounded-xl border border-slate-700 p-4"><h3 className="break-all font-bold">{String(row.data.documentNumber)}</h3><p>{String(obj(row.data.supplierSnapshot).name)} ? {String(row.data.status)}</p><p>KES {(Number(row.data.subtotalMinor)/100).toFixed(2)} ? {list(row.data.items).length} lines</p><details><summary>Reviewed purchase lines</summary>{list(row.data.items).map(line=><p key={String(line.id)} className="text-sm">{String(obj(line.stockSnapshot).name)}: {String(line.quantityOrdered)} {String(obj(line.purchasePackageSnapshot).name||obj(line.stockSnapshot).baseUnit)} ? KES {(Number(line.lineTotalMinor)/100).toFixed(2)}</p>)}</details>{manage&&row.data.status==='DRAFT'&&<><button className={button} disabled={blocked} onClick={()=>open(row)}>Edit draft</button><button className={`${button} ml-2`} disabled={blocked} onClick={()=>beginReview(row,'approve')}>Review approval</button></>}{manage&&row.data.status==='APPROVED'&&<button className={button} disabled={blocked} onClick={()=>beginReview(row,'issue')}>Review issue</button>}{typeof row.data.documentId==='string'&&<button className={`${button} ml-2`} disabled={busy} onClick={()=>setDocumentPo(row.id)}>Issued document and printing</button>}</article>)}</div>
  {review&&<form role="dialog" aria-label="Review purchase order transition" onSubmit={event=>void transition(event)} className="space-y-3 rounded-xl border border-slate-700 p-4">
   <h3 className="font-bold">{review.action==='approve'?'Approve purchase order':'Issue purchase order'}</h3><p className="break-all">{String(review.record.data.documentNumber)} - {String(obj(review.record.data.supplierSnapshot).name)}</p><p>KES {(Number(review.record.data.subtotalMinor)/100).toFixed(2)} - {list(review.record.data.items).length} lines</p>
   {list(review.record.data.items).map(line=><p key={String(line.id)} className="text-sm">{String(obj(line.stockSnapshot).name)}: {String(line.quantityOrdered)} {String(obj(line.purchasePackageSnapshot).name||obj(line.stockSnapshot).baseUnit)} - KES {(Number(line.lineTotalMinor)/100).toFixed(2)}</p>)}
   <label className="block text-sm"><input type="checkbox" disabled={blocked} checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/> {review.action==='approve'?'I reviewed the supplier, quantities and costs; approval freezes this content.':'I reviewed this approved order. Issue creates an immutable document and does not confirm it was sent or received.'}</label>
   <label className="block text-sm">Review reason<textarea required minLength={3} maxLength={500} className={input} disabled={blocked} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button disabled={blocked||!acknowledged||reason.trim().length<3} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">{review.action==='approve'?'Approve reviewed order':'Issue reviewed order'}</button><button type="button" className={`${button} ml-2`} disabled={busy} onClick={()=>setReview(null)}>Close</button>
  </form>}
  {printedPo&&apiAuth&&readRecords&&<WebDocumentQueue key={printedPo.id} records={printRecords} actorId={session.actorId} deviceId={apiAuth.identity.deviceId} disabled={disabled||busy||Boolean(editor)||Boolean(review)} command={command} readRecords={readRecords} queue={queue} apiAuth={apiAuth}/>}
  {editor&&<form role="dialog" aria-label="Edit purchase order draft" onSubmit={event=>void save(event)} className="space-y-4 rounded-xl border border-slate-700 p-4">
   <label className="block text-sm">Supplier<select className={input} required disabled={blocked} value={editor.supplierId} onChange={event=>setEditor({...editor,supplierId:event.target.value})}><option value="">Choose supplier</option>{suppliers.map(row=><option key={row.id} value={row.id}>{String(row.data.code)} - {String(row.data.name)}</option>)}</select></label>
   <label className="block text-sm">Expected delivery date<input className={input} type="date" disabled={blocked} value={editor.delivery} onChange={event=>setEditor({...editor,delivery:event.target.value})}/></label>
   {editor.lines.map((line,index)=>{const stock=stocks.find(row=>row.id===line.stockItemId),packages=list(stock?.data.purchasePackages);return <fieldset className="space-y-2 rounded border border-slate-700 p-3" key={line.id}><legend>Line {index+1}</legend>
    <label className="block text-sm">Stock item<select required className={input} disabled={blocked} value={line.stockItemId} onChange={event=>patch(line.id,{stockItemId:event.target.value,purchasePackageId:''})}><option value="">Choose stock item</option>{stocks.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label>
    <label className="block text-sm">Purchase unit<select className={input} disabled={blocked||!stock} value={line.purchasePackageId} onChange={event=>{const pack=packages.find(row=>row.id===event.target.value);patch(line.id,{purchasePackageId:event.target.value,...(pack?{price:(Number(pack.unitCostMinor)/100).toFixed(2)}:{})});}}><option value="">Base unit: {String(stock?.data.baseUnit||'choose item')}</option>{packages.map(pack=><option key={String(pack.id)} value={String(pack.id)}>{String(pack.name)} ({String(pack.baseQuantity)} base units)</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Quantity<input required inputMode="decimal" className={input} disabled={blocked} value={line.quantity} onChange={event=>patch(line.id,{quantity:event.target.value})}/></label><label className="text-sm">Price per purchase unit (KES)<input required inputMode="decimal" className={input} disabled={blocked} value={line.price} onChange={event=>patch(line.id,{price:event.target.value})}/></label></div>
    <button type="button" className={button} disabled={blocked||editor.lines.length===1} onClick={()=>setEditor({...editor,lines:editor.lines.filter(row=>row.id!==line.id)})}>Remove line</button>
   </fieldset>;})}
   <button type="button" className={button} disabled={blocked||editor.lines.length>=100} onClick={()=>setEditor({...editor,lines:[...editor.lines,blank()]})}>Add purchase line</button>
   <label className="block text-sm">Notes<textarea className={input} maxLength={2000} disabled={blocked} value={editor.notes} onChange={event=>setEditor({...editor,notes:event.target.value})}/></label>
   <label className="block text-sm">Change reason<textarea required minLength={3} maxLength={500} className={input} disabled={blocked} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button disabled={blocked||reason.trim().length<3} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Save purchase draft</button><button type="button" disabled={busy} className={`${button} ml-2`} onClick={()=>setEditor(null)}>Close</button>
  </form>}{message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
