import React from 'react';
import type {BusinessRecord} from './session';
type Row=Record<string,any>;
const field='mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2';
const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
export function WebProductModifiers({value,onChange,stocks,disabled}:{value:Row[];onChange:(rows:Row[])=>void;stocks:BusinessRecord[];disabled:boolean}){
 const change=(id:string,patch:Row)=>onChange(value.map(row=>row.id===id?{...row,...patch}:row));
 return <fieldset disabled={disabled} className="space-y-3 rounded border border-slate-700 p-3"><legend>Optional product modifiers</legend><p className="text-sm">Signed prices are in KES. Ingredient changes are per sold item, in each stock item's base unit. Negative changes remove ingredients; total consumption cannot become negative.</p>{value.map((row,index)=>{
  const adjustments:Row[]=row.ingredientAdjustments||[];
  return <section key={row.id} className="space-y-2 rounded bg-slate-950 p-3"><label className="block text-sm">Modifier {index+1} name<input className={field} maxLength={100} value={row.name} onChange={event=>change(row.id,{name:event.target.value})}/></label><label className="block text-sm">Price change (KES)<input className={field} inputMode="text" value={row.priceDeltaText??'0'} onChange={event=>change(row.id,{priceDeltaText:event.target.value})}/></label>
   {adjustments.map((item,i)=><div key={i} className="space-y-2 rounded border border-slate-700 p-2"><label className="block text-sm">Ingredient {i+1}<select className={field} value={item.stockItemId} onChange={event=>change(row.id,{ingredientAdjustments:adjustments.map((entry,j)=>j===i?{...entry,stockItemId:event.target.value}:entry)})}><option value="">Choose stock</option>{stocks.map(stock=><option key={stock.id} value={stock.id}>{String(stock.data.name)} ({String(stock.data.baseUnit)})</option>)}</select></label><label className="block text-sm">Signed base-unit quantity change<input className={field} value={item.quantityDelta} onChange={event=>change(row.id,{ingredientAdjustments:adjustments.map((entry,j)=>j===i?{...entry,quantityDelta:event.target.value}:entry)})}/></label><button type="button" className={button} onClick={()=>change(row.id,{ingredientAdjustments:adjustments.filter((_,j)=>j!==i)})}>Remove ingredient change</button></div>)}
   <button type="button" className={button} disabled={adjustments.length>=50} onClick={()=>change(row.id,{ingredientAdjustments:[...adjustments,{stockItemId:'',quantityDelta:''}]})}>Add ingredient change</button><button type="button" className={button} onClick={()=>onChange(value.filter(item=>item.id!==row.id))}>Remove modifier {index+1}</button>
  </section>;
 })}<button type="button" className={button} disabled={value.length>=50} onClick={()=>onChange([...value,{id:crypto.randomUUID(),name:'',priceDeltaText:'0',ingredientAdjustments:[]}])}>Add modifier</button></fieldset>;
}
