import type {BusinessRecord} from './session';

/** Freeze the exact stock, locations, and balance revisions reviewed by an editor. */
export function inventoryRevisions(records:BusinessRecord[],stockIds:string[],locationIds:string[]){
 const stocks=[...new Set(stockIds)],locations=[...new Set(locationIds)];
 const expectedVersions=records.filter(record=>record.collection==='stockItems'&&stocks.includes(record.id)||record.collection==='stockLocations'&&locations.includes(record.id)).map(({collection,id,version})=>({collection,id,version}));
 const expectedBalanceVersions:Record<string,number>={};
 for(const stockId of stocks){
  const stock=records.find(record=>record.collection==='stockItems'&&record.id===stockId);
  for(const locationId of locations){
   const versions=stock?.data.balanceVersions as Record<string,number>|undefined;
   // Missing metadata means an older projection needs a rebuild, never revision zero.
   if(!versions)throw new Error('Refresh this API inventory projection before reviewing stock movements.');
   expectedBalanceVersions[`${stockId}:${locationId}`]=versions[locationId]??0;
  }
 }
 return {expectedVersions,expectedBalanceVersions};
}
