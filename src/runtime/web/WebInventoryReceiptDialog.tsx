import React,{useState} from 'react';
import type {BusinessRecord} from './session';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import {inventoryRevisions} from './inventoryRevisions';

type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const field='mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2';

export function WebInventoryReceiptDialog({records,businessId,policyEditor=false,command,onClose}:{records:BusinessRecord[];businessId:string;policyEditor?:boolean;command:Command;onClose:()=>void}){
 const [reviewed]=useState(()=>records);
 const policy=reviewed.find(row=>row.collection==='inventoryPolicy'&&row.id===businessId);
 const stocks=reviewed.filter(row=>row.collection==='stockItems'&&!row.archived);
 const locations=reviewed.filter(row=>row.collection==='stockLocations'&&!row.archived);
 const [stockId,setStockId]=useState(stocks[0]?.id||''),[locationId,setLocationId]=useState(locations[0]?.id||'');
 const [packageId,setPackageId]=useState(''),[quantity,setQuantity]=useState('1'),[total,setTotal]=useState('');
 const [sealed,setSealed]=useState('0'),[open,setOpen]=useState('0');
 const [sourceType,setSourceType]=useState('DELIVERY_NOTE'),[reference,setReference]=useState(''),[supplier,setSupplier]=useState(''),[line,setLine]=useState('');
 const [allow,setAllow]=useState(policy?.data.allowDirectReceipts===true),[requireSupplier,setRequireSupplier]=useState(policy?.data.requireSupplierReference!==false),[requirePO,setRequirePO]=useState(policy?.data.requirePurchaseOrder!==false),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const stock=stocks.find(row=>row.id===stockId);
 const packages=(stock?.data.purchasePackages||[]) as {id:string;name:string;baseQuantity:number}[];
 const pack=packages.find(row=>row.id===packageId);
 const baseQuantity=Number(quantity)*(pack?.baseQuantity??1);
 const permitted=policy?.data.allowDirectReceipts===true&&policy.data.requirePurchaseOrder===false;
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(busy||pending)return;setBusy(true);setError('');
  try{
   const policyVersion={collection:'inventoryPolicy',id:businessId,version:policy?.version??0};
   let outcome:CommandOutcome;
   if(policyEditor)outcome=await command('inventory.policy.save','inventoryPolicy',businessId,{allowDirectReceipts:allow,requireSupplierReference:requireSupplier,requirePurchaseOrder:requirePO,reason:reason.trim(),expectedVersions:[policyVersion]});
   else{
    if(!permitted)throw new Error('Business policy requires purchase-order receiving.');
    const amount=Number(total)*100;
    if(!Number.isFinite(amount)||amount<0||Math.abs(amount-Math.round(amount))>0.000001||!Number.isSafeInteger(Math.round(amount)))throw new Error('Enter a receipt total with at most two currency decimals.');
    const revisions=inventoryRevisions(reviewed,[stockId],[locationId]);
    outcome=await command('inventory.receive','stockItems',stockId,{stockItemId:stockId,locationId,quantity:Number(quantity),purchasePackageId:packageId||undefined,totalCostMinor:Math.round(amount),sourceDocument:{type:sourceType,reference:reference.trim(),supplierReference:supplier.trim()||undefined,lineReference:line.trim()||undefined},...(stock?.data.sealedContainerSize?{sealedContainers:Number(sealed),openQuantity:Number(open)}:{}),...revisions,expectedVersions:[...revisions.expectedVersions,policyVersion]});
   }
   if(isCommandConfirmed(outcome))onClose();
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(true);setError('message' in outcome?outcome.message:'Check Activity for the saved command outcome before submitting another receipt.');}
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}
 };
 return <form onSubmit={event=>void submit(event)} className="space-y-3">
  {policyEditor?<>
   <p className="text-sm text-slate-300">Direct receipts record physical stock and valuation. Supplier payments and purchase-order receiving use separate workflows.</p>
   <label className="block"><input type="checkbox" checked={allow} onChange={event=>setAllow(event.target.checked)}/> Allow direct stock receipts</label>
   <label className="block"><input type="checkbox" checked={requireSupplier} onChange={event=>setRequireSupplier(event.target.checked)}/> Require supplier reference</label>
   <label className="block"><input type="checkbox" checked={requirePO} onChange={event=>setRequirePO(event.target.checked)}/> Require an approved purchase order</label>
   <label className="block">Policy change reason<textarea required minLength={3} maxLength={500} className={field} value={reason} onChange={event=>setReason(event.target.value)}/></label>
  </>:<>
   {!permitted&&<p role="alert">Direct receiving is disabled by business policy. An administrator must review the receiving policy.</p>}
   <label className="block">Stock item<select required className={field} value={stockId} onChange={event=>{setStockId(event.target.value);setPackageId('')}}>{stocks.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label>
   <label className="block">Receiving storage place<select required className={field} value={locationId} onChange={event=>setLocationId(event.target.value)}>{locations.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label>
   <label className="block">Purchase package<select className={field} value={packageId} onChange={event=>setPackageId(event.target.value)}><option value="">Base units</option>{packages.map(row=><option key={row.id} value={row.id}>{row.name} · {row.baseQuantity} {String(stock?.data.baseUnit)}</option>)}</select></label>
   <label className="block">Received quantity<input required type="number" min="0.000001" step={packageId?'1':'0.000001'} className={field} value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>
   <p className="text-sm">Receive {baseQuantity.toLocaleString()} {String(stock?.data.baseUnit||'base units')}.</p>
   {Boolean(stock?.data.sealedContainerSize)&&<div><label className="block">Sealed bottles<input required type="number" min="0" step="1" className={field} value={sealed} onChange={event=>setSealed(event.target.value)}/></label><label className="block">Open liquid (ml)<input required type="number" min="0" step="0.000001" className={field} value={open} onChange={event=>setOpen(event.target.value)}/></label></div>}
   <label className="block">Receipt total (KES)<input required type="number" min="0" step="0.01" className={field} value={total} onChange={event=>setTotal(event.target.value)}/></label>
   <label className="block">Source document<select className={field} value={sourceType} onChange={event=>setSourceType(event.target.value)}><option value="DELIVERY_NOTE">Delivery note</option><option value="INVOICE">Invoice</option><option value="RECEIPT">Receipt</option></select></label>
   <label className="block">Document reference<input required maxLength={160} className={field} value={reference} onChange={event=>setReference(event.target.value)}/></label>
   <label className="block">Supplier reference<input required={policy?.data.requireSupplierReference!==false} maxLength={160} className={field} value={supplier} onChange={event=>setSupplier(event.target.value)}/></label>
   <label className="block">Source line reference (optional)<input maxLength={160} className={field} value={line} onChange={event=>setLine(event.target.value)}/></label>
   <p className="text-xs text-slate-400">Use the original supplier and document references. A repeated source line is rejected even with a new command ID. This does not record a supplier payment.</p>
  </>}
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  <div className="flex gap-2"><button disabled={busy||pending||(!policyEditor&&(!permitted||!stockId||!locationId))} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">{busy?'Saving…':policyEditor?'Save receiving policy':'Post stock receipt'}</button><button type="button" disabled={busy} className="rounded border border-slate-700 px-4 py-2" onClick={onClose}>Close</button></div>
 </form>;
}
