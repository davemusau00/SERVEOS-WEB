import React from 'react';
import type {BusinessRecord} from './session';

type Form=Record<string,any>;
const field='mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2';
const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
/** API catalog options. Prices remain decimal text until the save boundary. */
export function WebProductSellingOptions({form,onChange,outlets,disabled}:{form:Form;onChange:(next:Form)=>void;outlets:BusinessRecord[];disabled:boolean}){
 const portions:Array<Form>=Array.isArray(form.portions)?form.portions:[];
 const update=(id:string,patch:Form)=>onChange({...form,portions:portions.map(row=>row.id===id?{...row,...patch}:row)});
 return <fieldset disabled={disabled} className="space-y-3 rounded border border-slate-700 p-3"><legend>Selling and stock options</legend>
  <label className="block text-sm">Inventory type<select className={field} value={form.inventoryType||'STANDARD'} onChange={event=>onChange({...form,inventoryType:event.target.value})}>{['STANDARD','STOCKED','RECIPE','BATCH','WINE','SPIRIT','COUNT','WEIGHT'].map(value=><option key={value}>{value}</option>)}</select></label>
  <label className="block text-sm">Selling mode<select className={field} value={form.sellingMode||''} onChange={event=>onChange({...form,sellingMode:event.target.value||undefined})}><option value="">Standard</option><option value="SERVING_AND_BOTTLE">Serving and whole bottle</option><option value="BOTTLE_ONLY">Whole bottles only</option></select></label>
  <label className="block text-sm">Default stock quantity per sale<input className={field} inputMode="decimal" value={form.portionVolume??''} onChange={event=>onChange({...form,portionVolume:event.target.value})}/><span>In linked stock base units; blank uses the standard quantity.</span></label>
  <label className="block text-sm">Recipe batch yield<input className={field} inputMode="numeric" value={form.recipeYield??''} onChange={event=>onChange({...form,recipeYield:event.target.value})}/><span>Required for batch production; whole finished units per recipe.</span></label>
  <section className="space-y-2"><h4 className="font-bold">Portions</h4><p className="text-sm">Each portion freezes its price and stock quantity when added to an order. Whole-bottle quantities must match the linked container size.</p>
   {portions.map((row,index)=><div key={row.id} className="space-y-2 rounded bg-slate-950 p-2"><label className="block text-sm">Portion {index+1} name<input className={field} maxLength={100} value={row.name||''} onChange={event=>update(row.id,{name:event.target.value})}/></label><label className="block text-sm">Price (KES)<input className={field} inputMode="decimal" value={row.priceText??''} onChange={event=>update(row.id,{priceText:event.target.value})}/></label><label className="block text-sm">Stock quantity<input className={field} inputMode="decimal" value={row.volume??''} onChange={event=>update(row.id,{volume:event.target.value})}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.wholeContainerSale===true} onChange={event=>update(row.id,{wholeContainerSale:event.target.checked})}/>Whole sealed container</label><button type="button" className={button} onClick={()=>onChange({...form,portions:portions.filter(item=>item.id!==row.id)})}>Remove portion {index+1}</button></div>)}
   <button type="button" className={button} disabled={portions.length>=50} onClick={()=>onChange({...form,portions:[...portions,{id:crypto.randomUUID(),name:'',priceText:'',volume:'',wholeContainerSale:false}]})}>Add portion</button>
  </section>
  <section className="space-y-2"><h4 className="font-bold">Available outlets</h4><p className="text-sm">No selection means all outlets.</p>{outlets.map(row=><label key={row.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Array.isArray(form.outletIds)&&form.outletIds.includes(row.id)} onChange={event=>onChange({...form,outletIds:event.target.checked?[...(form.outletIds||[]),row.id]:(form.outletIds||[]).filter((id:string)=>id!==row.id)})}/>{String(row.data.name)}</label>)}</section>
 </fieldset>;
}
