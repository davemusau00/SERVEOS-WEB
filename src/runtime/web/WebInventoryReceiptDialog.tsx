import {operatorError} from './operatorError';
import React,{useEffect,useRef,useState} from 'react';
import type {BusinessRecord} from './session';
import type {QueuedCommand} from './BusinessStore';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {inventoryRevisions} from './inventoryRevisions';
import {parseMoneyToMinor,parseQuantity} from '../../utils/fiscal';
import {inventoryCommandInFlight,inventoryName,inventoryQuantity} from './inventoryPresentation';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const field='mt-1 block min-h-11 w-full rounded border border-slate-700 bg-slate-950 p-2';
const button='min-h-11 rounded border border-slate-700 px-4 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40';
const micro=(number:number)=>BigInt(number.toFixed(6).replace('.',''));
type Review={payload:Record<string,unknown>;baseQuantity:number;totalMinor:number;count:number;conversion:number;sealed:number|null;open:number|null};

export function WebInventoryReceiptDialog({records,businessId,policyEditor=false,queue=[],command,onClose,onBusyChange}:{records:BusinessRecord[];businessId:string;policyEditor?:boolean;queue?:QueuedCommand[];command:Command;onClose:()=>void;onBusyChange?:(busy:boolean)=>void}){
 const [reviewed,setReviewed]=useState(()=>records);
 const policy=reviewed.find(row=>row.collection==='inventoryPolicy'&&row.id===businessId);
 const stocks=reviewed.filter(row=>row.collection==='stockItems'&&!row.archived);
 const locations=reviewed.filter(row=>row.collection==='stockLocations'&&!row.archived);
 const [stockId,setStockId]=useState(stocks[0]?.id||''),[locationId,setLocationId]=useState(locations[0]?.id||'');
 const [packageId,setPackageId]=useState(''),[quantity,setQuantity]=useState('1'),[total,setTotal]=useState('');
 const [sealed,setSealed]=useState('0'),[open,setOpen]=useState('0');
 const [sourceType,setSourceType]=useState('DELIVERY_NOTE'),[reference,setReference]=useState(''),[supplier,setSupplier]=useState(''),[line,setLine]=useState('');
 const [allow,setAllow]=useState(policy?.data.allowDirectReceipts===true),[requireSupplier,setRequireSupplier]=useState(policy?.data.requireSupplierReference!==false),[requirePO,setRequirePO]=useState(policy?.data.requirePurchaseOrder!==false),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(''),[error,setError]=useState(''),[review,setReview]=useState<Review|null>(null),[ack,setAck]=useState(false),[zeroCostAck,setZeroCostAck]=useState(false);
 const submitting=useRef(false),callbacks=useRef({onClose,onBusyChange});callbacks.current={onClose,onBusyChange};
 const stock=stocks.find(row=>row.id===stockId);
 const packages=(stock?.data.purchasePackages||[]) as {id:string;name:string;baseQuantity:number}[];
 const pack=packages.find(row=>row.id===packageId);
 const baseQuantity=Number(quantity)*(pack?.baseQuantity??1);
 const permitted=policy?.data.allowDirectReceipts===true&&policy.data.requirePurchaseOrder===false;
 const otherPending=inventoryCommandInFlight(queue,[stockId]);const blocked=busy||Boolean(pending)||Boolean(otherPending);
 useEffect(()=>{callbacks.current.onBusyChange?.(busy);return()=>callbacks.current.onBusyChange?.(false);},[busy]);
 useEffect(()=>{if(!pending)return;const entry=queue.find(row=>row.id===pending);if(!entry||!['SYNCHRONIZED','REJECTED','CONFLICT'].includes(entry.state))return;setPending('');if(entry.state==='SYNCHRONIZED'){callbacks.current.onClose();return;}setReview(null);setAck(false);setError(entry.result?.error?.message||'The original receipt was not accepted. Review current evidence before trying again.');},[queue,pending]);
 const buildReview=():Review=>{
  if(!permitted)throw new Error('Receive this delivery against an issued purchase order in Procurement.');
  if(!stock||!locations.some(row=>row.id===locationId))throw new Error('Choose a reviewed stock item and receiving place.');
  if(packageId&&!pack)throw new Error('The selected purchase package is unavailable. Review the catalog.');
  const count=parseQuantity(quantity,{min:Number.MIN_VALUE,max:1e9,maxDecimals:6,integer:Boolean(pack)}),conversion=pack?parseQuantity(pack.baseQuantity,{min:Number.MIN_VALUE,max:1e9,maxDecimals:6}):1;
  const units=micro(count)*micro(conversion);if(units%1_000_000n!==0n)throw new Error('The package conversion exceeds six-decimal stock precision.');
  const received=Number(units/1_000_000n)/1_000_000;if(!Number.isFinite(received)||received<=0||received>1e9)throw new Error('Converted quantity exceeds the supported stock range.');
  const totalMinor=parseMoneyToMinor(total);
  if(!reference.trim()||policy?.data.requireSupplierReference!==false&&!supplier.trim())throw new Error('Enter the original document and required supplier references.');
  const size=Number(stock.data.sealedContainerSize||0),sealedCount=size>0?parseQuantity(sealed,{max:1e9,integer:true,maxDecimals:0}):null,openQuantity=size>0?parseQuantity(open,{max:1e9,maxDecimals:6}):null;
  if(size>0&&(stock.data.baseUnit!=='ml'||openQuantity!>=size||micro(sealedCount!)*micro(size)+micro(openQuantity!)*1_000_000n!==units))throw new Error('Received quantity must equal whole sealed bottles plus open liquid below one bottle.');
  const revisions=inventoryRevisions(reviewed,[stockId],[locationId]);
  return {baseQuantity:received,totalMinor,count,conversion,sealed:sealedCount,open:openQuantity,payload:{stockItemId:stockId,locationId,quantity:count,purchasePackageId:packageId||undefined,totalCostMinor:totalMinor,sourceDocument:{type:sourceType,reference:reference.trim(),supplierReference:supplier.trim()||undefined,lineReference:line.trim()||undefined},...(size>0?{sealedContainers:sealedCount,openQuantity:openQuantity}:{}),...revisions,expectedVersions:[...revisions.expectedVersions,{collection:'inventoryPolicy',id:businessId,version:policy?.version??0}]}};
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(blocked||submitting.current)return;setError('');
  if(!policyEditor&&!review){try{setReview(buildReview());setAck(false);setZeroCostAck(false);}catch(cause){setError(operatorError(cause));}return;}
  if(!policyEditor&&(!review||!ack||review.totalMinor===0&&!zeroCostAck))return;
  submitting.current=true;setBusy(true);
  try{
   const policyVersion={collection:'inventoryPolicy',id:businessId,version:policy?.version??0};
   let outcome:CommandOutcome;
   if(policyEditor)outcome=await command('inventory.policy.save','inventoryPolicy',businessId,{allowDirectReceipts:allow,requireSupplierReference:requireSupplier,requirePurchaseOrder:requirePO,reason:reason.trim(),expectedVersions:[policyVersion]});
   else outcome=await command('inventory.receive','stockItems',stockId,review!.payload);
   if(isCommandConfirmed(outcome))onClose();
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(outcome.commandId);if(outcome.kind==='REJECTED'||outcome.kind==='CONFLICT'){setReview(null);setAck(false);}setError('message' in outcome?outcome.message:'Check Activity for the saved command outcome before submitting another receipt.');}
  }catch(cause){setError(operatorError(cause))}finally{submitting.current=false;setBusy(false)}
 };
 return <form onSubmit={event=>void submit(event)} className="max-h-[72vh] space-y-3 overflow-y-auto"><fieldset disabled={blocked||Boolean(review)} className="space-y-3">
  {policyEditor?<>
   <p className="text-sm text-slate-300">Direct receipts record physical stock and valuation. Supplier payments and purchase-order receiving use separate workflows.</p>
   <label className="block"><input type="checkbox" checked={allow} onChange={event=>setAllow(event.target.checked)}/> Allow direct stock receipts</label>
   <label className="block"><input type="checkbox" checked={requireSupplier} onChange={event=>setRequireSupplier(event.target.checked)}/> Require supplier reference</label>
   <label className="block"><input type="checkbox" checked={requirePO} onChange={event=>setRequirePO(event.target.checked)}/> Require an approved purchase order</label>
   <label className="block">Policy change reason<textarea required minLength={3} maxLength={500} className={field} value={reason} onChange={event=>setReason(event.target.value)}/></label>
  </>:<>
   {!permitted&&<p role="status">Direct receiving is unavailable under this business policy. Receive against an issued purchase order in Procurement.</p>}
   <label className="block">Stock item<select required className={field} value={stockId} onChange={event=>{setStockId(event.target.value);setPackageId('')}}>{stocks.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label>
   <label className="block">Receiving storage place<select required className={field} value={locationId} onChange={event=>setLocationId(event.target.value)}>{locations.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label>
   <label className="block">Purchase package<select className={field} value={packageId} onChange={event=>setPackageId(event.target.value)}><option value="">Base units</option>{packages.map(row=><option key={row.id} value={row.id}>{row.name} · {row.baseQuantity} {String(stock?.data.baseUnit)}</option>)}</select></label>
   <label className="block">Received quantity<input required type="number" min="0.000001" step={packageId?'1':'0.000001'} className={field} value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>
   <p className="text-sm">Receive {baseQuantity.toLocaleString()} {String(stock?.data.baseUnit||'base units')}.</p>
   {Boolean(stock?.data.sealedContainerSize)&&<div><label className="block">Sealed bottles<input required type="number" min="0" step="1" className={field} value={sealed} onChange={event=>setSealed(event.target.value)}/></label><label className="block">Open liquid (ml)<input required type="number" min="0" step="0.000001" className={field} value={open} onChange={event=>setOpen(event.target.value)}/></label></div>}
   <label className="block">Total purchase cost for this received quantity (KES)<input required inputMode="decimal" className={field} value={total} onChange={event=>setTotal(event.target.value)}/></label>
   <label className="block">Source document<select className={field} value={sourceType} onChange={event=>setSourceType(event.target.value)}><option value="DELIVERY_NOTE">Delivery note</option><option value="INVOICE">Invoice</option><option value="RECEIPT">Receipt</option></select></label>
   <label className="block">Document reference<input required maxLength={160} className={field} value={reference} onChange={event=>setReference(event.target.value)}/></label>
   <label className="block">Supplier reference<input required={policy?.data.requireSupplierReference!==false} maxLength={160} className={field} value={supplier} onChange={event=>setSupplier(event.target.value)}/></label>
   <label className="block">Source line reference (optional)<input maxLength={160} className={field} value={line} onChange={event=>setLine(event.target.value)}/></label>
   <p className="text-xs text-slate-400">Use the original supplier and document references. A repeated source line is rejected even with a new command ID. This does not record a supplier payment.</p>
  </>}</fieldset>
  {review&&!policyEditor&&<section className="space-y-3 rounded border border-amber-500/40 p-3" aria-label="Reviewed stock receipt"><h3 className="font-bold">Review the physical delivery</h3><p>{String(stock?.data.name)} · {inventoryName(reviewed,'stockLocations',locationId,'Storage place')}</p><p>{inventoryQuantity(review.count)} {pack?.name||String(stock?.data.baseUnit)} × {inventoryQuantity(review.conversion)} {String(stock?.data.baseUnit)} = <b>{inventoryQuantity(review.baseQuantity)} {String(stock?.data.baseUnit)} received</b>.</p><p>Total purchase cost: <b>KES {(review.totalMinor/100).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}</b>. Estimated cost per {String(stock?.data.baseUnit)}: KES {(review.totalMinor/100/review.baseQuantity).toLocaleString('en-KE',{maximumFractionDigits:6})}.</p><p className="break-words">Source: {reference} · Supplier: {supplier||'Not required by policy'} · Line: {line||'This stock item on the source document'}</p>{review.sealed!==null&&<p>{review.sealed} sealed containers + {inventoryQuantity(review.open)} ml open.</p>}<p className="text-sm text-slate-300">Posting updates physical stock and moving weighted-average valuation. It does not create a supplier invoice or record payment.</p>{review.totalMinor===0&&<label className="block text-sm"><input disabled={blocked} type="checkbox" checked={zeroCostAck} onChange={event=>setZeroCostAck(event.target.checked)}/> I confirm this delivery is free; zero does not stand for an unknown cost.</label>}<label className="block text-sm"><input disabled={blocked} type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/> I checked quantities, pack conversion, storage place, cost and source references against the delivery.</label><button disabled={blocked} type="button" className={button} onClick={()=>{setReview(null);setAck(false);}}>Edit receipt</button></section>}
  {(pending||otherPending)&&<p role="status" className="text-sm text-amber-200">Recover the original pending or uncertain inventory action in Activity before receiving this stock again.</p>}
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  <div className="flex flex-wrap gap-2"><button disabled={blocked||(!policyEditor&&(!permitted||!stockId||!locationId||Boolean(review)&&(!ack||review!.totalMinor===0&&!zeroCostAck)))} className={`${button} bg-amber-400 text-slate-950`}>{busy?'Saving...':policyEditor?'Save receiving policy':review?'Post reviewed stock receipt':'Review receipt'}</button>{!busy&&!pending&&<button type="button" className={button} onClick={()=>{setReviewed(records);setReview(null);setAck(false);setError('Current stock and catalog evidence loaded. Review before posting.');}}>Review current evidence</button>}{!policyEditor&&!permitted&&<button type="button" className={button} onClick={()=>{onClose();window.dispatchEvent(new CustomEvent('servos:web-navigate',{detail:{tab:'Procurement'}}));}}>Open purchase receiving</button>}{(pending||otherPending)&&<button type="button" className={button} onClick={()=>window.dispatchEvent(new CustomEvent('servos:web-navigate',{detail:{tab:'Activity'}}))}>Open recovery</button>}<button type="button" disabled={busy} className={button} onClick={onClose}>Close</button></div>
 </form>;
}
