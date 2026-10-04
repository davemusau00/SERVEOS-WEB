import type { RecordVersion } from '../types/transactions';

export type SellingMode = 'BOTTLE_ONLY' | 'BOTTLE_AND_PORTIONS';
export type CountEntry = { quantity: string; sealed: string; open: string; measurement: 'EXACT' | 'ESTIMATED' };
export type BottleStock = { id: string; name?: string; baseUnit?: string; sealedContainerSize?: number; scanUnitQuantity?: number; currentStock?: Record<string, number>; sealedOpenStock?: Record<string, { sealedContainers: number; openQuantity: number }>; purchasePackages?: Array<{ id: string; barcode?: string; baseQuantity: number; unitsPerPackage: number }> };
export const emptyCountEntry = (): CountEntry => ({ quantity: '', sealed: '', open: '', measurement: 'EXACT' });
export const bottleSize = (stock: BottleStock) => stock.baseUnit === 'ml' && Number.isFinite(stock.sealedContainerSize) && Number(stock.sealedContainerSize) > 0 ? Number(stock.sealedContainerSize) : null;
export function parseCount(value: string, label = 'Quantity'): number {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error(`${label} is required and must be non-negative with at most six decimals.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number > 1e9) throw new Error(`${label} is outside the supported range.`);
  return number;
}
export function bottleQuantity(sealed: number, size: number, open: number): number {
  if (!Number.isInteger(sealed) || sealed < 0 || !Number.isFinite(size) || size <= 0 || size > 100000 || !Number.isFinite(open) || open < 0 || open >= size) throw new Error('Enter whole sealed bottles and open ml below one bottle. Only one open bottle is supported.');
  const total = sealed * size + open;
  if (!Number.isFinite(total) || total > 1e9) throw new Error('Bottle total is outside the supported range.');
  return Number(total.toFixed(6));
}
export function countRow(stock: BottleStock, expectedQuantity: number, entry: CountEntry) {
  const size = bottleSize(stock);
  if (!size) return { stockItemId: stock.id, expectedQuantity, countedQuantity: parseCount(entry.quantity), measurementMethod: entry.measurement };
  const sealed = parseCount(entry.sealed, 'Sealed bottles');
  const open = parseCount(entry.open, 'Open ml');
  return { stockItemId: stock.id, expectedQuantity, countedQuantity: bottleQuantity(sealed, size, open), countedSealedContainers: sealed, countedOpenQuantity: open, containerSize: size, measurementMethod: entry.measurement };
}
export function adjustmentPayload(stock: BottleStock, locationId: string, entry: CountEntry, reason: string) {
  if (!reason.trim() || reason.trim().length > 500) throw new Error('Explain the correction in up to 500 characters.');
  const row = countRow(stock, Number(stock.currentStock?.[locationId] || 0), entry);
  return { stockItemId: stock.id, locationId, reason: reason.trim(), countedQty: row.countedQuantity, expectedQuantity: row.expectedQuantity, ...(bottleSize(stock) ? { sealedContainers: row.countedSealedContainers, openQuantity: row.countedOpenQuantity } : {}), measurementMethod: entry.measurement };
}
export function scannedEntry(stock: BottleStock, entry: CountEntry, scanQuantity: number, scans = 1): CountEntry {
  if (!Number.isFinite(scanQuantity) || scanQuantity <= 0 || !Number.isInteger(scans) || scans < 1) throw new Error('Set a valid barcode conversion before counting this package.');
  const size = bottleSize(stock);
  if (size) {
    const bottles = scanQuantity / size;
    if (!Number.isInteger(bottles)) throw new Error('Barcode conversion must represent whole sealed bottles. Review the package size.');
    const next = { ...entry, sealed: String(parseCount(entry.sealed || '0') + bottles * scans) };
    bottleQuantity(parseCount(next.sealed),size,next.open===''?0:parseCount(next.open));
    return next;
  }
  const next = { ...entry, quantity: String(Number((parseCount(entry.quantity || '0') + scanQuantity * scans).toFixed(6))) };
  countRow(stock, 0, next); return next;
}
export function physicalStock(stock: BottleStock, locationId?: string): string {
  const ids = locationId ? [locationId] : Object.keys(stock.currentStock || {});
  const total = ids.reduce((sum, id) => sum + Number(stock.currentStock?.[id] || 0), 0);
  const size = bottleSize(stock);
  if (!size) return `${total.toLocaleString()} ${stock.baseUnit || 'units'}`;
  let sealed = 0; let open = 0; let inferred = false;
  for (const id of ids) {
    const state = stock.sealedOpenStock?.[id]; const quantity = Number(stock.currentStock?.[id] || 0);
    if (state) { sealed += state.sealedContainers; open += state.openQuantity; }
    else { inferred = true; sealed += Math.floor(quantity / size); open += quantity % size; }
  }
  return `${sealed.toLocaleString()} sealed${open ? ` + ${Number(open.toFixed(6)).toLocaleString()} ml open` : ''}${inferred ? ' (inferred)' : ''}`;
}
export function selectedCountIds(selected: string[], rowIds: string[]) {
  if (!selected.length || selected.length > 5000 || new Set(selected).size !== selected.length || new Set(rowIds).size !== rowIds.length || selected.length !== rowIds.length || selected.some(id => !id.trim() || !rowIds.includes(id))) throw new Error('Quick count rows must exactly match the selected stock items.');
  return [...selected].sort();
}
export function movementPayload(stock: BottleStock, disposition: 'SEALED'|'OPEN', entered: string, reason: string) {
  const size=bottleSize(stock);const amount=parseCount(entered,'Movement quantity');
  if(amount<=0)throw new Error('Enter a positive movement quantity.');
  if(!reason.trim()||reason.length>500)throw new Error('Explain this movement in up to 500 characters.');
  if(!size)return {quantity:amount,reason:reason.trim()};
  if(disposition==='SEALED'&&!Number.isInteger(amount))throw new Error('Enter whole sealed bottles.');
  const quantity=disposition==='SEALED'?bottleQuantity(amount,size,0):amount;
  return {quantity,disposition,reason:reason.trim()};
}
export function frozenDependencies(records: Array<RecordVersion & {data?: Record<string,any>}>, stockIds: string[], locationId: string): RecordVersion[] {
  const keys = new Set([`stockLocations:${locationId}`, ...stockIds.map(id => `stockItems:${id}`)]);
  for (const record of records) if (record.collection === 'products' && record.data && stockIds.some(id => record.data!.stockItemId === id || [...(record.data!.recipeIngredients || []), ...(record.data!.modifiers || []).flatMap((m:any)=>m.ingredientAdjustments||[])].some((line:any)=>line.stockItemId===id))) keys.add(`products:${record.id}`);
  return records.filter(record => keys.has(`${record.collection}:${record.id}`)).map(({ collection, id, version }) => ({ collection, id, version })).sort((a,b) => `${a.collection}:${a.id}`.localeCompare(`${b.collection}:${b.id}`));
}
export function classifyBottleStock(stock: BottleStock, products: Array<Record<string, any>>) {
  const linked = products.filter(product => product.active !== false && product.stockItemId === stock.id);
  const consumers = products.filter(product => product.active !== false && ([...(product.recipeIngredients || []), ...(product.modifiers || []).flatMap((modifier: any) => modifier.ingredientAdjustments || [])].some((line: any) => line.stockItemId === stock.id)));
  const size = bottleSize(stock);
  const measured = linked.some(product => (product.portions || []).some((portion: any) => !portion.wholeContainerSale && Number(portion.volume) !== size) || Number(product.portionVolume || 1) !== size);
  const problems = [!size && 'Set the size of one bottle.', !linked.length && 'No sellable product link.', size && Number(stock.scanUnitQuantity || 1) % size !== 0 && 'Review bottle scan conversion.', consumers.length > 0 && 'Recipe or modifier consumption requires review.'].filter(Boolean);
  const open = Object.values(stock.sealedOpenStock || {}).some(state => state.openQuantity > 0) || (size !== null && size > 0 && Object.values(stock.currentStock || {}).some(quantity => Math.abs(Number(quantity) % size) > 0.000001));
  return { stockItemId: stock.id, containerSize: size, linkedProductIds: linked.map(product => product.id), consumerProductIds: consumers.map(product => product.id), classification: problems.length ? 'REQUIRES_REVIEW' : measured || open ? 'MIXED_SALE_CANDIDATE' : 'BOTTLE_ONLY_CANDIDATE', problems, sealedOnly: !!size && linked.length > 0 && linked.every(product => product.sellingMode === 'BOTTLE_ONLY') && consumers.length === 0 && !open };
}
