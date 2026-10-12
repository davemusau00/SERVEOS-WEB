import type {BusinessRecord} from './session';
import type {QueuedCommand} from './BusinessStore';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const inventoryName=(records:BusinessRecord[],collection:string,id:unknown,fallback:string)=>{
 const name=records.find(record=>record.collection===collection&&record.id===id)?.data.name;
 return typeof name==='string'&&name.trim()&&!uuid.test(name.trim())?name:fallback;
};
export const inventoryQuantity=(value:unknown):string=>{const number=Number(value);return value!==null&&value!==undefined&&Number.isFinite(number)?number.toLocaleString('en-KE',{maximumFractionDigits:6}):'Unavailable';};
export function scopedStockQuantity(stock:BusinessRecord,location='ALL'):number|null {
 const balances=object(stock.data.currentStock);
 const values=location==='ALL'?Object.values(balances):[balances[location]??0];
 if(values.some(value=>value===null||!Number.isFinite(Number(value))))return null;
 return values.reduce<number>((sum,value)=>sum+Number(value),0);
}
export function scopedStockState(stock:BusinessRecord,location='ALL'):'OUT'|'LOW'|'HEALTHY'|'UNKNOWN' {
 const quantity=scopedStockQuantity(stock,location);if(quantity===null)return 'UNKNOWN';
 const reorder=Number(stock.data.reorderLevel||0);
 return quantity<=0?'OUT':reorder>0&&quantity<=reorder?'LOW':'HEALTHY';
}

/** Display estimate only: quantity at six decimals and weighted rate at twelve decimals. */
export function stockValuationMinor(stocks:BusinessRecord[],location='ALL'):number|null {
 let scaledTotal=0n;
 for(const stock of stocks){
  const quantity=scopedStockQuantity(stock,location),rate=Number(stock.data.averageUnitCostMinor);
  if(quantity===null||!Number.isFinite(rate)||rate<0||Math.abs(quantity)>1e9||rate>1e12)return null;
  const quantityUnits=BigInt(quantity.toFixed(6).replace('.',''));
  const costUnits=BigInt(rate.toFixed(12).replace('.',''));
  scaledTotal+=quantityUnits*costUnits;
 }
 const scale=1_000_000_000_000_000_000n;
 const rounded=scaledTotal<0n?-((-scaledTotal+scale/2n)/scale):(scaledTotal+scale/2n)/scale;
 return rounded>BigInt(Number.MAX_SAFE_INTEGER)||rounded<BigInt(Number.MIN_SAFE_INTEGER)?null:Number(rounded);
}

export function inventoryCommandInFlight(queue:QueuedCommand[],stockIds:readonly string[]):QueuedCommand|undefined {
 return queue.find(entry=>{
  if(!['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(entry.state))return false;
  const operation=entry.command.operation;
  if(operation==='inventory.policy.save')return true;
  if(!operation.startsWith('inventory.')&&!['procurement.receive','supplierReturn.dispatch','order.fire'].includes(operation))return false;
  const payload=object(entry.command.payload);
  const versions=Array.isArray(payload.expectedVersions)?payload.expectedVersions.map(object):[];
  return stockIds.includes(String(payload.stockItemId||payload.id||''))||versions.some(row=>row.collection==='stockItems'&&stockIds.includes(String(row.id)));
 });
}

export function stockMovementSources(records:BusinessRecord[],movement:BusinessRecord):BusinessRecord[] {
 const commandId=movement.data.sourceId;
 if(typeof commandId!=='string')return [];
 const collections=['inventoryReceipts','goodsReceipts','supplierReturns','stockCounts','inventoryAdjustments','inventoryBatchPreparations','movementCorrections'];
 return records.filter(record=>collections.includes(record.collection)&&record.data.sourceCommandId===commandId&&(record.collection!=='inventoryReceipts'||record.data.stockItemId===movement.data.stockItemId&&record.data.locationId===movement.data.locationId));
}

export function stockSourceLabel(record:BusinessRecord,records:BusinessRecord[]):string {
 const type=({inventoryReceipts:'Stock receipt',goodsReceipts:'Goods receipt',supplierReturns:'Supplier return',stockCounts:'Stock count',inventoryAdjustments:'Stock correction',inventoryBatchPreparations:'Batch preparation',movementCorrections:'Movement reversal'} as Record<string,string>)[record.collection]||'Source record';
 const source=object(record.data.sourceDocument);
 const reference=record.data.documentNumber||record.data.returnNumber||source.reference;
 if(typeof reference==='string'&&reference.trim())return `${type}: ${reference}`;
 const location=inventoryName(records,'stockLocations',record.data.locationId,'storage place');
 return `${type} · ${location}`;
}

export function supplierPayableLabel(records:BusinessRecord[],id:unknown):string {
 const payable=records.find(row=>row.collection==='supplierPayables'&&row.id===id);
 if(typeof payable?.data.invoiceNumber==='string'&&payable.data.invoiceNumber.trim())return `Invoice ${payable.data.invoiceNumber}`;
 const receipt=records.find(row=>row.collection==='goodsReceipts'&&row.id===payable?.data.goodsReceiptId);
 return typeof receipt?.data.documentNumber==='string'?`Goods receipt ${receipt.data.documentNumber}`:'Supplier payable';
}
