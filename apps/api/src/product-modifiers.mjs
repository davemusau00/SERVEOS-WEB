import {ApiProblem} from './command-kernel.mjs';
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function normalizeModifiers(raw){
 if(!Array.isArray(raw)||raw.length>50)fail('Modifiers must be a list of at most 50 options.');
 const ids=new Set();
 return raw.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim()||row.id.length>100||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.trim().length>100||!Number.isSafeInteger(row.priceDeltaMinor))fail('Modifiers need unique IDs, names and signed minor-unit prices.');
  ids.add(row.id);const stockIds=new Set(),adjustments=row.ingredientAdjustments??[];
  if(!Array.isArray(adjustments)||adjustments.length>50)fail('Modifier ingredient adjustments must be a list of at most 50 stock items.');
  return {id:row.id,name:row.name.trim(),priceDeltaMinor:row.priceDeltaMinor,ingredientAdjustments:adjustments.map(item=>{
   if(!item||!uuid(item.stockItemId)||stockIds.has(item.stockItemId)||typeof item.quantityDelta!=='number'||!Number.isFinite(item.quantityDelta)||item.quantityDelta===0||Math.abs(item.quantityDelta)>1_000_000_000||Math.abs(item.quantityDelta*1_000_000-Math.round(item.quantityDelta*1_000_000))>0.0001)fail('Modifier stock changes must use unique stock IDs and nonzero base-unit quantities with at most six decimals.');
   stockIds.add(item.stockItemId);return {stockItemId:item.stockItemId,quantityDelta:item.quantityDelta};
  })};
 });
}
export function selectModifiers(definitions,ids=[]){
 if(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail('Select each modifier at most once.');
 const known=normalizeModifiers(definitions??[]);
 if(ids.some(id=>!known.some(row=>row.id===id)))throw new ApiProblem(409,'MODIFIER_CHANGED','A selected option is no longer available. Review the product.');
 return known.filter(row=>ids.includes(row.id));
}
export function modifierPrice(base,modifiers){
 const amount=modifiers.reduce((sum,row)=>sum+BigInt(row.priceDeltaMinor),BigInt(base));
 const bounded=amount<0n?0n:amount;
 if(bounded>BigInt(Number.MAX_SAFE_INTEGER))fail('The selected option price exceeds supported amounts.');
 return Number(bounded);
}
