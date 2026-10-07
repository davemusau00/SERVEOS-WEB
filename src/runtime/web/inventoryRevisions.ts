import type {BusinessRecord} from './session';

/** Freeze the exact stock, locations, and balance revisions reviewed by an editor. */
export function inventoryRevisions(records:BusinessRecord[],stockIds:string[],locationIds:string[],productIds:string[]=[]){
 const stocks=[...new Set(stockIds)],locations=[...new Set(locationIds)];
 const expectedVersions=records.filter(record=>record.collection==='stockItems'&&stocks.includes(record.id)||record.collection==='stockLocations'&&locations.includes(record.id)||record.collection==='products'&&productIds.includes(record.id)).map(({collection,id,version})=>({collection,id,version}));
 for(const [collection,ids] of [['stockItems',stocks],['stockLocations',locations],['products',productIds]] as const)for(const id of ids){
  if(!expectedVersions.some(record=>record.collection===collection&&record.id===id))throw new Error('A reviewed inventory resource is missing. Refresh before submitting.');
 }
 const expectedBalanceVersions:Record<string,number>={};
 for(const stockId of stocks){
  const stock=records.find(record=>record.collection==='stockItems'&&record.id===stockId);
  for(const locationId of locations){
   const versions=stock?.data.balanceVersions as Record<string,number>|undefined;
   // Missing metadata means an older projection needs a rebuild, never revision zero.
   if(!versions)throw new Error('Refresh this API inventory projection before reviewing stock movements.');
   const version=versions[locationId]??0;
   if(!Number.isSafeInteger(version)||version<0)throw new Error('Invalid stock-location balance revision. Refresh before submitting.');
   expectedBalanceVersions[`${stockId}:${locationId}`]=version;
  }
 }
 return {expectedVersions,expectedBalanceVersions};
}
