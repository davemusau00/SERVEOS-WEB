import test from 'node:test';
import assert from 'node:assert/strict';
import * as inventory from '../src/utils/bottleInventory.ts';
const stock={id:'wine750',name:'Wine',baseUnit:'ml',sealedContainerSize:750,scanUnitQuantity:750,currentStock:{bar:9000}};
const exact=(sealed,open)=>({quantity:'',sealed:String(sealed),open:String(open),measurement:'EXACT'});
test('bottle count and adjustment builders conserve canonical ml and keep distinct contracts',()=>{
 assert.equal(inventory.countRow(stock,9000,exact(12,0)).countedQuantity,9000);
 const row=inventory.countRow(stock,9000,exact(8,300));assert.equal(row.countedQuantity,6300);assert.equal(row.countedSealedContainers,8);
 const adjustment=inventory.adjustmentPayload(stock,'bar',exact(8,300),'Physical recount');assert.equal(adjustment.countedQty,6300);assert.equal(adjustment.sealedContainers,8);assert.equal(adjustment.countedSealedContainers,undefined);
 assert.equal(inventory.countRow({...stock,sealedContainerSize:350},0,exact(12,0)).countedQuantity,4200);
});
test('blank, fractions, negative and unsupported multiple-open counts fail; explicit zero is valid',()=>{
 for(const entry of [exact('',0),exact(1.5,0),exact(-1,0),exact(1,750),exact(0,800),exact(1,'0.0000001')])assert.throws(()=>inventory.countRow(stock,0,entry));
 assert.equal(inventory.countRow(stock,0,exact(0,0)).countedQuantity,0);
 assert.equal(inventory.countRow(stock,0,{...exact(1,375),measurement:'ESTIMATED'}).countedQuantity,1125);
});
test('bottle and case scans increment sealed stock without changing measured open liquid',()=>{
 const bottle=inventory.scannedEntry(stock,exact(8,300),750);assert.equal(bottle.sealed,'9');assert.equal(bottle.open,'300');
 const caseCount=inventory.scannedEntry(stock,bottle,9000);assert.equal(caseCount.sealed,'21');assert.equal(caseCount.open,'300');
 assert.throws(()=>inventory.scannedEntry(stock,exact(0,0),1));assert.throws(()=>inventory.scannedEntry(stock,exact(0,0),0));
});
test('quick count scope is an exact set, independent of UI filters',()=>{
 assert.deepEqual(inventory.selectedCountIds(['wine750','gin'],['gin','wine750']),['gin','wine750']);
 for(const [ids,rows] of [[[],[]],[['wine750'],[]],[['wine750','wine750'],['wine750','wine750']],[['wine750'],['gin']]])assert.throws(()=>inventory.selectedCountIds(ids,rows));
});
test('classification is read-only, flags recipes and missing scan configuration, and labels inferred stock',()=>{
 const original=JSON.stringify(stock);const product={id:'bottle-product',stockItemId:stock.id,portionVolume:750,portions:[{volume:750,wholeContainerSale:true}],sellingMode:'BOTTLE_ONLY'};
 assert.equal(inventory.classifyBottleStock(stock,[product]).classification,'BOTTLE_ONLY_CANDIDATE');assert.equal(inventory.classifyBottleStock(stock,[product]).sealedOnly,true);
 assert.equal(inventory.classifyBottleStock(stock,[product,{id:'cocktail',recipeIngredients:[{stockItemId:stock.id}]}]).classification,'REQUIRES_REVIEW');
 assert.match(inventory.physicalStock(stock,'bar'),/12 sealed.*inferred/);assert.equal(JSON.stringify(stock),original);
});
test('frozen dependencies include selected stock and location only',()=>{
 const records=[{collection:'stockItems',id:'wine750',version:3},{collection:'stockItems',id:'other',version:8},{collection:'stockLocations',id:'bar',version:2}];
 const pinned=inventory.frozenDependencies(records,['wine750'],'bar');records[0].version=4;assert.equal(pinned[0].version,3);assert.equal(pinned.length,2);
});
