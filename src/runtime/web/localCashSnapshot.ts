import {consumptionSnapshot,consumePhysical} from '../../../contracts/pos-inventory.mjs';
import type {BusinessRecord} from './session';
import type {LocalCashInput,LocalCashLine} from './offlineCashLedger';
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value:[];
export async function buildLocalCashInput(records:BusinessRecord[],lines:Record<string,unknown>[],outletId:string,tillSessionId:string,cashAccountId:string,cashTenderedMinor:number,overlays:Record<string,unknown>[]=[]):Promise<LocalCashInput>{
 const outlet=records.find(row=>row.collection==='outlets'&&row.id===outletId&&!row.archived),locationId=String(outlet?.data.defaultStockLocationId||'');
 if(!outlet||!records.some(row=>row.collection==='stockLocations'&&row.id===locationId&&!row.archived))throw Error('A provisioned outlet and stock location are required.');
 const stocks=records.filter(row=>row.collection==='stockItems'&&!row.archived),usage=new Map<string,{whole:number;measured:number}>();
 const catalogue={query:async(_sql:string,args:unknown[])=>({rows:stocks.filter(row=>(args[1] as string[]).includes(row.id)).map(row=>({id:row.id,baseUnit:String(row.data.baseUnit),containerSize:row.data.sealedContainerSize??null}))})};
 const snapshots:LocalCashLine[]=[];
 for(const line of lines){
  const product=records.find(row=>row.collection==='products'&&row.id===line.productId&&!row.archived);if(!product||product.version!==line.productVersion)throw Error('Refresh this product before accepting cash.');
  const portion=rows(product.data.portions).find(row=>row.id===line.portionId),modifiers=rows(product.data.modifiers).filter(row=>Array.isArray(line.modifierIds)&&line.modifierIds.includes(String(row.id)));
  const ingredients=await consumptionSnapshot(catalogue,'local',{...product.data,stockItemId:product.data.stockItemId||null,portionVolume:product.data.portionVolume??null},portion,rows(product.data.recipeIngredients),modifiers.map(row=>({...row,ingredientAdjustments:rows(row.ingredientAdjustments)})));
  for(const ingredient of ingredients){const current=usage.get(ingredient.stockItemId)||{whole:0,measured:0};const amount=ingredient.quantity*Number(line.quantity);if(ingredient.wholeContainerSale)current.whole+=amount;else current.measured+=amount;usage.set(ingredient.stockItemId,current);}
  snapshots.push({...line,id:String(line.id),productId:product.id,name:String(product.data.name),routeTo:product.data.routeTo,quantity:Number(line.quantity),unitPriceMinor:Number(line.unitPriceMinor),discountBasisPoints:0,comped:false,taxSnapshot:line.taxSnapshot as LocalCashLine['taxSnapshot'],ingredientSnapshot:ingredients});
 }
 const expectedVersions:Record<string,number>=Object.fromEntries(records.filter(row=>['outlets','stockLocations','businessSettings','products','paymentAccounts','stockItems'].includes(row.collection)).map(row=>[`${row.collection}:${row.id}`,row.version])),expectedBalanceVersions:Record<string,number>={},stockMovements:LocalCashInput['stockMovements']=[];
 for(const [stockId,amount] of usage){
  const stock=stocks.find(row=>row.id===stockId)!;const balances=(stock.data.currentStock||{}) as Record<string,number>,physical=(stock.data.sealedOpenStock||{}) as Record<string,{sealedContainers:number;openQuantity:number}>;
  let before={quantity:Number(balances[locationId]||0),sealedContainers:physical[locationId]?.sealedContainers??null,openQuantity:physical[locationId]?.openQuantity??null};
  let count=0;for(const overlay of overlays)for(const movement of rows((overlay.input as Record<string,unknown>)?.stockMovements))if(movement.stockItemId===stockId&&movement.locationId===locationId){before=movement.after as typeof before;count++;}
  const after=consumePhysical({sealedContainerSize:stock.data.sealedContainerSize??null},before,amount.whole,amount.measured);
  const fixed=BigInt((amount.whole+amount.measured).toFixed(6).replace('.',''));
  expectedVersions[`stockItems:${stockId}`]=stock.version+count;expectedBalanceVersions[`${stockId}:${locationId}`]=Number((stock.data.balanceVersions as Record<string,number>)?.[locationId]||0)+count;
  stockMovements.push({id:crypto.randomUUID(),stockItemId:stockId,locationId,quantityFixed:String(-fixed),unit:String(stock.data.baseUnit),...{before,after}});
 }
 return {id:crypto.randomUUID(),outletId,tillSessionId,cashAccountId,cashTenderedMinor,lines:snapshots,stockMovements,expectedVersions,expectedBalanceVersions,serviceDestination:'COUNTER',businessSnapshot:records.find(row=>row.collection==='businessSettings')?.data};
}
