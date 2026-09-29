import React,{useState} from 'react';
import {ActionDialog} from './ActionDialog';
import {useRuntime} from '../runtime/RuntimeProvider';
import {buttonClass,fieldClass,money,recordsOf} from './records';

// SERVOS_PATCH_09_CLASSIFIED_PO
type Treatment='STOCK'|'EXPENSE'|'ASSET';

export function ClassifiedPurchaseOrderDialog({onClose,onCreated}:{onClose:()=>void;onCreated:(message:string)=>void}){
 const runtime=useRuntime();const s=runtime.snapshot!;const suppliers=recordsOf(s,'suppliers'),stocks=recordsOf(s,'stockItems'),categories=recordsOf(s,'assetCategories');
 const [supplierId,setSupplier]=useState(suppliers[0]?.id||'');const [treatment,setTreatment]=useState<Treatment>('STOCK');
 const [stockItemId,setStock]=useState(stocks[0]?.id||'');const [assetCategoryId,setCategory]=useState(categories[0]?.id||'');
 const [description,setDescription]=useState('');const [assetName,setAssetName]=useState('');const [expenseCategory,setExpenseCategory]=useState('GENERAL');
 const [quantity,setQuantity]=useState(1);const [unitPrice,setUnitPrice]=useState(0);const [lines,setLines]=useState<any[]>([]);const [error,setError]=useState('');

 const add=()=>{
   setError('');
   if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<0){setError('Enter a positive quantity and valid unit price.');return;}
   if(treatment==='STOCK'&&!stockItemId){setError('Choose a stock item.');return;}
   if(treatment==='ASSET'&&(!assetCategoryId||!assetName.trim()||Math.abs(quantity-Math.round(quantity))>0.000001)){setError('Asset lines need a category, name and whole-unit quantity.');return;}
   if(treatment==='EXPENSE'&&!description.trim()){setError('Describe the expense.');return;}
   const stock=stocks.find(x=>x.id===stockItemId),category=categories.find(x=>x.id===assetCategoryId);
   const line:any={lineId:crypto.randomUUID(),treatment,quantityOrdered:quantity,unitPrice,lineTotal:quantity*unitPrice};
   if(treatment==='STOCK'){line.stockItemId=stockItemId;line.displayName=stock?.name||stockItemId;}
   if(treatment==='EXPENSE'){line.description=description.trim();line.expenseCategory=expenseCategory;line.displayName=description.trim();}
   if(treatment==='ASSET'){line.assetCategoryId=assetCategoryId;line.assetName=assetName.trim();line.displayName=`${assetName.trim()} · ${category?.name||''}`;}
   setLines(v=>[...v,line]);setDescription('');setAssetName('');setQuantity(1);setUnitPrice(0);
 };
 const submit=async()=>{
   setError('');
   try{await runtime.command('purchaseOrder.create',{supplierId,items:lines});onCreated('Classified purchase order created. STOCK, EXPENSE and ASSET treatment is now fixed on each line.');onClose();}
   catch(e){setError(String(e))}
 };

 return <ActionDialog title="Create classified purchase order" onClose={onClose}><div className="space-y-4">
   {error&&<p className="rounded-lg bg-rose-950 p-3 text-sm text-rose-200">{error}</p>}
   <label>Supplier<select className={fieldClass} value={supplierId} onChange={e=>setSupplier(e.target.value)}>{suppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <div className="rounded-xl border border-slate-700 p-3"><div className="grid gap-3 sm:grid-cols-2"><label>Line treatment<select className={fieldClass} value={treatment} onChange={e=>setTreatment(e.target.value as Treatment)}><option>STOCK</option><option>EXPENSE</option><option>ASSET</option></select></label>
   {treatment==='STOCK'&&<label>Stock item<select className={fieldClass} value={stockItemId} onChange={e=>setStock(e.target.value)}>{stocks.map(x=><option key={x.id} value={x.id}>{x.name} · {x.code}</option>)}</select></label>}
   {treatment==='EXPENSE'&&<><label>Expense category<select className={fieldClass} value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)}><option value="GENERAL">General operating</option><option value="REPAIRS">Repairs / maintenance</option><option value="MARKETING">Marketing</option><option value="UTILITIES">Utilities</option></select></label><label className="sm:col-span-2">Description<input className={fieldClass} value={description} onChange={e=>setDescription(e.target.value)}/></label></>}
   {treatment==='ASSET'&&<><label>Asset category<select className={fieldClass} value={assetCategoryId} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="sm:col-span-2">Asset name / model<input className={fieldClass} placeholder="e.g. Samsung 55-inch Smart TV" value={assetName} onChange={e=>setAssetName(e.target.value)}/></label></>}
   <label>Quantity<input className={fieldClass} type="number" min="0.001" step={treatment==='ASSET'?'1':'0.001'} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><label>Unit price (KES)<input className={fieldClass} type="number" min="0" step="0.01" value={unitPrice} onChange={e=>setUnitPrice(Number(e.target.value))}/></label></div>
   <p className="mt-2 text-xs text-slate-500">{treatment==='STOCK'?'Accepted units increase inventory.':treatment==='EXPENSE'?'Accepted units post directly to the selected operating expense account.':'Accepted whole units post to Asset Clearing and create commissioning records. No stock is created.'}</p>
   <button className={buttonClass+' mt-3'} onClick={add}>Add classified line</button></div>
   <div className="space-y-2">{lines.map(line=><div key={line.lineId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-950 p-3 text-sm"><div><b>{line.treatment}</b> · {line.displayName}<div className="text-xs text-slate-500">{line.quantityOrdered} × {money(line.unitPrice)}</div></div><div className="flex items-center gap-3"><b>{money(line.lineTotal)}</b><button className="text-rose-300" onClick={()=>setLines(v=>v.filter(x=>x.lineId!==line.lineId))}>Remove</button></div></div>)}</div>
   <div className="flex items-center justify-between rounded-xl border border-slate-800 p-3"><span>Total</span><b>{money(lines.reduce((sum,x)=>sum+x.lineTotal,0))}</b></div>
   <button disabled={!supplierId||!lines.length} className="w-full rounded-xl bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40" onClick={()=>void submit()}>Create and approve classified PO</button>
 </div></ActionDialog>
}
