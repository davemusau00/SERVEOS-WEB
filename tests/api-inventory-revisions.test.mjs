import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const {code}=transformSync(readFileSync('src/runtime/web/inventoryRevisions.ts','utf8'),{loader:'ts',format:'esm'});
const {inventoryRevisions}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('API inventory review pins stock, location, recipe and independent balance versions',()=>{
 const records=[{collection:'stockItems',id:'stock',version:4,data:{balanceVersions:{source:7}}},{collection:'stockLocations',id:'source',version:2,data:{}},{collection:'stockLocations',id:'destination',version:3,data:{}},{collection:'products',id:'recipe',version:5,data:{}}];
 const reviewed=inventoryRevisions(records,['stock'],['source','destination'],['recipe']);
 assert.deepEqual(reviewed.expectedBalanceVersions,{'stock:source':7,'stock:destination':0});
 assert.deepEqual(reviewed.expectedVersions.map(record=>record.version),[4,2,3,5]);
 records[0].data.balanceVersions.source=9;
 assert.equal(reviewed.expectedBalanceVersions['stock:source'],7,'reviewed revisions must not track later projection changes');
});

test('API inventory review refuses missing metadata and missing reviewed resources',()=>{
 const stock={collection:'stockItems',id:'stock',version:1,data:{}};
 const location={collection:'stockLocations',id:'location',version:1,data:{}};
 assert.throws(()=>inventoryRevisions([stock,location],['stock'],['location']),/Refresh this API inventory projection/);
 assert.throws(()=>inventoryRevisions([stock],['stock'],['location']),/resource is missing/);
 assert.throws(()=>inventoryRevisions([{...stock,data:{balanceVersions:{location:-1}}},location],['stock'],['location']),/Invalid stock-location balance revision/);
});
