import {consumptionSnapshot,consumePhysical} from '../../../../contracts/pos-inventory.mjs';
import type {BusinessRecord} from '../session';

export type PhysicalStock={quantity:number;sealedContainers:number|null;openQuantity:number|null};
type Ingredient={stockItemId:string;quantity:number;baseUnit:string;containerSize:number|null;wholeContainerSale:boolean};
export type CashierStockBalance={stockItemId:string;name:string;unit:string;locationId:string;cached:PhysicalStock;provisional:PhysicalStock;localDeductionFixed:string;pendingMovements:number;error?:string;stock:BusinessRecord};
export type CashierProductStock={available:boolean;requiresOptions:boolean;remainingUnits:number|null;label:string;reason?:string;ingredients:Ingredient[];balances:CashierStockBalance[];afterBasket:Map<string,PhysicalStock>;portions:Array<{id:string;name:string;available:boolean;remainingUnits:number|null;reason?:string}>};
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value:[];
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const number=(value:unknown)=>typeof value==='number'?value:Number(value);
const physical=(value:unknown):PhysicalStock|null=>{const row=object(value),quantity=number(row.quantity),sealed=row.sealedContainers==null?null:number(row.sealedContainers),open=row.openQuantity==null?null:number(row.openQuantity);return Number.isFinite(quantity)&&quantity>=0&&(sealed===null||Number.isSafeInteger(sealed)&&sealed>=0)&&(open===null||Number.isFinite(open)&&open>=0)?{quantity,sealedContainers:sealed,openQuantity:open}:null;};
const samePhysical=(left:PhysicalStock,right:PhysicalStock)=>Math.abs(left.quantity-right.quantity)<=0.000001&&left.sealedContainers===right.sealedContainers&&(left.openQuantity===right.openQuantity||left.openQuantity!==null&&right.openQuantity!==null&&Math.abs(left.openQuantity-right.openQuantity)<=0.000001);

/** Confirmed effects are already in the central projection; never deduct them a second time. */
export function pendingCashStockSales(records:BusinessRecord[],sales:Record<string,unknown>[]){
 return sales.filter(sale=>{
  const confirmed=sale.state==='SERVER_CONFIRMED'||records.some(record=>record.collection==='offlineCashReconciliations'&&!record.archived&&record.id===sale.id&&record.data.status==='SERVER_CONFIRMED'&&record.data.deviceId===sale.deviceId&&record.data.staffId===sale.staffId&&record.data.reference===sale.reference);
  if(confirmed){
   // The local receipt may update before React receives its central stock projection.
   // Retain the absolute after-snapshot only until all corresponding balance versions arrive.
   const input=object(sale.input),expected=object(input.expectedBalanceVersions);
   if(rows(input.stockMovements).every(movement=>{const stock=records.find(record=>record.collection==='stockItems'&&record.id===movement.stockItemId&&!record.archived),baseline=number(expected[`${movement.stockItemId}:${movement.locationId}`]),current=number(object(stock?.data.balanceVersions)[String(movement.locationId)]);return stock&&Number.isSafeInteger(baseline)&&Number.isSafeInteger(current)&&current>=baseline+1;}))return false;
  }
  return true;
 }).sort((left,right)=>Number(left.sequence)-Number(right.sequence));
}
export function cashierStockBalances(records:BusinessRecord[],sales:Record<string,unknown>[],outletId:string){
 const locationId=String(records.find(record=>record.collection==='outlets'&&!record.archived&&record.id===outletId)?.data.defaultStockLocationId||'');
 const pending=pendingCashStockSales(records,sales),balances=new Map<string,CashierStockBalance>();
 for(const stock of records.filter(record=>record.collection==='stockItems'&&!record.archived)){
  const current=object(stock.data.currentStock),bottles=object(object(stock.data.sealedOpenStock)[locationId]);
  const cached={quantity:number(current[locationId]||0),sealedContainers:bottles.sealedContainers==null?null:number(bottles.sealedContainers),openQuantity:bottles.openQuantity==null?null:number(bottles.openQuantity)};
  const entry:CashierStockBalance={stockItemId:stock.id,name:String(stock.data.name||'Stock item'),unit:String(stock.data.baseUnit||''),locationId,cached,provisional:cached,localDeductionFixed:'0',pendingMovements:0,stock};
  if(!locationId||!physical(cached)||!entry.unit)entry.error='The cached stock balance is unavailable. Refresh this outlet before selling tracked items.';
  let deduction=0n;
  for(const sale of pending)for(const movement of rows(object(sale.input).stockMovements)){
   if(movement.stockItemId!==stock.id||movement.locationId!==locationId)continue;
   const after=physical(movement.after),before=physical(movement.before),expected=number(object(object(sale.input).expectedBalanceVersions)[`${stock.id}:${locationId}`]);
   const cachedVersion=number(object(stock.data.balanceVersions)[locationId]??0);
   if(!Number.isSafeInteger(expected)||expected!==cachedVersion+entry.pendingMovements)entry.error='Central stock changed while local cash was pending. Review the original stock evidence before selling this item.';
   if(!after||!before||movement.unit!==entry.unit||!/^-[0-9]+$/.test(String(movement.quantityFixed)))entry.error='A local stock snapshot needs recovery. Review local cash evidence before selling this item.';
   else{if(!samePhysical(before,entry.provisional))entry.error='Local stock snapshots no longer match the cached balance. Reconcile the original cash evidence before selling this item.';entry.provisional=after;deduction+=-BigInt(String(movement.quantityFixed));}
   entry.pendingMovements++;
  }
  entry.localDeductionFixed=String(deduction);balances.set(stock.id,entry);
 }
 return {locationId,balances,pendingSales:pending.filter(sale=>sale.state!=='SERVER_CONFIRMED').length,projectionAwaitingSales:pending.filter(sale=>sale.state==='SERVER_CONFIRMED').length};
}
export function formatStockQuantity(quantity:number,unit:string){return `${quantity.toLocaleString('en-KE',{maximumFractionDigits:6})} ${unit}`;}
export function formatStockDeduction(fixed:string,unit:string){return formatStockQuantity(Number(BigInt(fixed))/1_000_000,unit);}
export function physicalStockLabel(value:PhysicalStock,unit:string){return value.sealedContainers===null||value.openQuantity===null?formatStockQuantity(value.quantity,unit):`${value.sealedContainers} sealed + ${formatStockQuantity(value.openQuantity,unit)} open`;}

async function productIngredients(records:BusinessRecord[],product:BusinessRecord,portionId='',modifierIds:string[]=[]):Promise<Ingredient[]>{
 const stocks=records.filter(record=>record.collection==='stockItems'&&!record.archived);
 const catalogue={query:async(_sql:string,args:unknown[])=>({rows:stocks.filter(stock=>(args[1] as string[]).includes(stock.id)).map(stock=>({id:stock.id,baseUnit:String(stock.data.baseUnit),containerSize:stock.data.sealedContainerSize??null}))})};
 const portion=rows(product.data.portions).find(row=>row.id===portionId);
 if(portionId&&!portion)throw Error('This portion changed. Refresh and choose an available portion.');
 const modifiers=rows(product.data.modifiers).filter(row=>modifierIds.includes(String(row.id)));
 if(modifiers.length!==new Set(modifierIds).size)throw Error('A selected modifier changed. Refresh the product options.');
 return consumptionSnapshot(catalogue,'local',{...product.data,stockItemId:product.data.stockItemId||null,portionVolume:product.data.portionVolume??null},portion,rows(product.data.recipeIngredients),modifiers.map(row=>({...row,ingredientAdjustments:rows(row.ingredientAdjustments)}))) as Promise<Ingredient[]>;
}
type Usage=Map<string,{whole:number;measured:number}>;
function addUsage(usage:Usage,ingredients:Ingredient[],quantity:number){
 if(!Number.isFinite(quantity)||quantity<=0)throw Error('Review the held quantity before selling.');
 for(const ingredient of ingredients){const current=usage.get(ingredient.stockItemId)||{whole:0,measured:0},amount=ingredient.quantity*quantity;if(ingredient.wholeContainerSale)current.whole+=amount;else current.measured+=amount;usage.set(ingredient.stockItemId,current);}
}
function consumeUsage(balances:Map<string,CashierStockBalance>,usage:Usage){
 const result=new Map([...balances].map(([id,balance])=>[id,balance.provisional]));
 for(const [id,amount] of usage){const balance=balances.get(id);if(!balance)throw Error('A linked stock item is unavailable. Refresh the catalogue.');if(balance.error)throw Error(balance.error);result.set(id,consumePhysical({sealedContainerSize:balance.stock.data.sealedContainerSize??null},balance.provisional,Number(amount.whole.toFixed(6)),Number(amount.measured.toFixed(6))) as PhysicalStock);}
 return result;
}
export async function cashierBasketStock(records:BusinessRecord[],lines:Record<string,unknown>[],balances:Map<string,CashierStockBalance>){
 const usage:Usage=new Map();
 for(const line of lines.filter(line=>line.state==='DRAFT')){
  const product=records.find(record=>record.collection==='products'&&!record.archived&&record.id===line.productId);
  const issuedSnapshot=object(line.productSnapshot),issued=Object.keys(issuedSnapshot).length>0;
  if(!issued&&(!product||product.data.available===false))throw Error('A held product is unavailable. Review the basket.');
  if(!issued&&product&&line.productVersion!=null&&line.productVersion!==product.version)throw Error('A held product changed. Review its price, portions and ingredients before checkout.');
  const frozen=Array.isArray(line.ingredientSnapshot)?line.ingredientSnapshot:Array.isArray(object(line.productSnapshot).ingredientSnapshot)?object(line.productSnapshot).ingredientSnapshot:undefined;
  if(!frozen&&!product)throw Error('The original held stock snapshot is unavailable. Recover the order before adding tracked products.');
  const ingredients=frozen as Ingredient[]|undefined||await productIngredients(records,product!,String(line.portionId||object(line.portionSnapshot).id||''),Array.isArray(line.modifierIds)?line.modifierIds as string[]:rows(line.modifierSnapshots).map(row=>String(row.id)));
  for(const ingredient of ingredients){const balance=balances.get(ingredient.stockItemId);if(!balance||ingredient.baseUnit!==balance.unit||ingredient.containerSize!==(balance.stock.data.sealedContainerSize??null))throw Error('A held stock configuration changed. Review its portion and ingredients before checkout.');}
  addUsage(usage,ingredients,Number(line.quantity));
 }
 return consumeUsage(balances,usage);
}
/** Stock presentation delegates physical consumption to the same contract used at fire/commit. */
export async function cashierProductStock(records:BusinessRecord[],product:BusinessRecord,balances:Map<string,CashierStockBalance>,afterBasket:Map<string,PhysicalStock>,portionId='',modifierIds:string[]=[],includePortions=true):Promise<CashierProductStock>{
 const requiresOptions=rows(product.data.portions).length>0||rows(product.data.modifiers).length>0;
 let ingredients:Ingredient[]=[],reason:string|undefined,remainingUnits:number|null=null;
 try{
  ingredients=await productIngredients(records,product,portionId,modifierIds);
  if(ingredients.length){
   const canServe=(quantity:number)=>{const usage:Usage=new Map();addUsage(usage,ingredients,quantity);for(const [id,amount] of usage){const balance=balances.get(id);if(!balance||balance.error)throw Error(balance?.error||'A linked stock item is unavailable.');const before=afterBasket.get(id);if(!before)throw Error('Refresh the stock balance before selling.');consumePhysical({sealedContainerSize:balance.stock.data.sealedContainerSize??null},before,Number(amount.whole.toFixed(6)),Number(amount.measured.toFixed(6)));}return true;};
   canServe(1);let lower=1,upper=1_000_000;
   while(lower<upper){const middle=Math.ceil((lower+upper)/2);try{canServe(middle);lower=middle;}catch{upper=middle-1;}}
   remainingUnits=lower;
  }
 }catch(error){remainingUnits=0;reason=error instanceof Error?error.message:'Stock availability needs review.';}
 const portions:CashierProductStock['portions']=[];
 if(includePortions)for(const portion of rows(product.data.portions)){const option=await cashierProductStock(records,product,balances,afterBasket,String(portion.id),modifierIds,false);portions.push({id:String(portion.id),name:String(portion.name||'Portion'),available:option.available,remainingUnits:option.remainingUnits,reason:option.reason});}
 const optionsMayFit=includePortions&&(portions.some(portion=>portion.available)||rows(product.data.modifiers).length>0),available=!reason||optionsMayFit;
 return {available,requiresOptions,remainingUnits,label:reason?optionsMayFit?'Choose a stock-valid option':'Stock unavailable':remainingUnits===null?'Not stock tracked':`${remainingUnits.toLocaleString('en-KE')} more ${portionId?'portions':'units'} fit this basket`,reason,ingredients,balances:ingredients.map(ingredient=>balances.get(ingredient.stockItemId)).filter((balance):balance is CashierStockBalance=>Boolean(balance)),afterBasket,portions};
}
