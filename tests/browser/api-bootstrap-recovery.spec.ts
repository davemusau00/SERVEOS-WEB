import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';

const harness=buildSync({stdin:{contents:"export {BusinessStore} from './src/runtime/web/BusinessStore'; export {loadApiCatalogSnapshot} from './src/runtime/web/session'; export {ApiHttpError} from './src/runtime/web/apiClient';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'ServOSBootstrap',platform:'browser',target:'es2022'}).outputFiles[0].text;

test('API bootstrap resumes an interrupted staged snapshot after reload',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:harness});
  const first=await page.evaluate(async()=>{
    const api=(window as any).ServOSBootstrap,scope=`bootstrap-resume-${crypto.randomUUID()}`;
    const digest=async(value:unknown)=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));return[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
    function stable(value:any):string{return value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`}
    const records=Array.from({length:5},(_,index)=>({collection:'stockItems',id:`resume-${index}`,version:1,data:{name:`Resumed item ${index}`},archived:false}));
    const pageSize=2,expiresAt=new Date(Date.now()+300_000).toISOString(),snapshotId=crypto.randomUUID(),pageHashes:string[]=[];
    for(let after=0;after<records.length;after+=pageSize)pageHashes.push(await digest({afterOrdinal:after,nextOrdinal:Math.min(after+pageSize,records.length),records:records.slice(after,after+pageSize)}));
    const core={protocolVersion:2,snapshotId,expiresAt,schemaVersion:2,highWaterCursor:9,recordCount:records.length,collectionCounts:{stockItems:records.length},pageSize,pageCount:pageHashes.length,pageHashes};
    const bootstrap={protocolVersion:2,snapshotId,expiresAt,cursor:9,manifest:{...core,sha256:await digest(core)}};
    const store=await api.BusinessStore.open(scope,'device','actor',0,'API');
    await store.replaceSnapshot([{collection:'stockItems',id:'old',version:4,data:{name:'Keep until activation'},archived:false}],5,'old-policy');
    let pageCalls:number[]=[];
    let interrupted=false;
    try{await api.loadApiCatalogSnapshot(store,{bootstrapCatalog:async()=>bootstrap,bootstrapCatalogPage:async(_id:string,after:number)=>{
      pageCalls.push(after);if(after===2&&!interrupted){interrupted=true;throw new Error('Simulated connection loss during page transfer')}
      const next=Math.min(after+pageSize,records.length);return{protocolVersion:2,snapshotId,afterOrdinal:after,nextOrdinal:next,hasMore:next<records.length,pageIndex:after/pageSize,sha256:pageHashes[after/pageSize],records:records.slice(after,next)};
    }});
    }catch(error){if(!String(error).includes('Simulated connection loss'))throw error;}
    const result={scope,bootstrap,records,pageSize,pageHashes,oldRecords:await store.records(),cursor:await store.cursor(),policy:await store.policyVersion(),stage:await store.pendingBootstrap(),pageCalls};
    store.close();return result;
  });
  expect(first.oldRecords).toEqual([{collection:'stockItems',id:'old',version:4,data:{name:'Keep until activation'},archived:false}]);
  expect(first.cursor).toBe(5);expect(first.policy).toBe('old-policy');expect(first.stage?.nextOrdinal).toBe(2);expect(first.pageCalls).toEqual([0,2]);

  await page.reload();await page.addScriptTag({content:harness});
  const resumed=await page.evaluate(async(input)=>{
    const api=(window as any).ServOSBootstrap,requested:string[]=[];
    const store=await api.BusinessStore.open(input.scope,'device','actor',0,'API');
    const result=await api.loadApiCatalogSnapshot(store,{bootstrapCatalog:async(snapshotId?:string)=>{requested.push(snapshotId||'new');return input.bootstrap},bootstrapCatalogPage:async(snapshotId:string,after:number)=>{
      const next=Math.min(after+input.pageSize,input.records.length);return{protocolVersion:2,snapshotId,afterOrdinal:after,nextOrdinal:next,hasMore:next<input.records.length,pageIndex:after/input.pageSize,sha256:input.pageHashes[after/input.pageSize],records:input.records.slice(after,next)};
    }});
    const resultRecords=await store.records(),cursor=await store.cursor(),policy=await store.policyVersion(),stage=await store.pendingBootstrap();store.close();
    return{result,resultRecords,cursor,policy,stage,requested};
  },first);
  expect(resumed.requested).toEqual([first.bootstrap.snapshotId]);
  expect(resumed.result).toMatchObject({cursor:9,records:5,reused:false});
  expect(resumed.resultRecords.map((record:any)=>record.id)).toEqual(first.records.map((record:any)=>record.id));
  expect(resumed.cursor).toBe(9);expect(resumed.policy).toBe('api-catalog-v3');expect(resumed.stage).toBeUndefined();
});

test('API bootstrap rejects corrupted manifests, pages, counts and stale cursors without replacing active data',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:harness});
  const outcomes=await page.evaluate(async()=>{
    const api=(window as any).ServOSBootstrap;
    const stable=(value:any):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    const digest=async(value:unknown)=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));return[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
    const cases=['manifest','high-water','page','counts','stale-cursor'];const output:any[]=[];
    for(const mode of cases){
      const records=[0,1,2].map(index=>({collection:'stockItems',id:`${mode}-${index}`,version:1,data:{name:`${mode} item ${index}`},archived:false}));
      const pageSize=2,expiresAt=new Date(Date.now()+300_000).toISOString(),snapshotId=crypto.randomUUID(),cursor=mode==='stale-cursor'?29:31,pageHashes:string[]=[];
      for(let after=0;after<records.length;after+=pageSize)pageHashes.push(await digest({afterOrdinal:after,nextOrdinal:Math.min(after+pageSize,records.length),records:records.slice(after,after+pageSize)}));
      const core:any={protocolVersion:2,snapshotId,expiresAt,schemaVersion:2,highWaterCursor:cursor,recordCount:records.length,collectionCounts:{stockItems:records.length},pageSize,pageCount:pageHashes.length,pageHashes};
      if(mode==='counts')core.collectionCounts={products:1,stockItems:2};
      if(mode==='high-water')core.highWaterCursor=cursor+1;
      const bootstrap:any={protocolVersion:2,snapshotId,expiresAt,cursor,manifest:{...core,sha256:await digest(core)}};
      if(mode==='manifest')bootstrap.manifest.sha256='0'.repeat(64);
      const store=await api.BusinessStore.open(`bootstrap-invalid-${mode}-${crypto.randomUUID()}`,'device','actor',0,'API');
      await store.replaceSnapshot([{collection:'stockItems',id:'retained',version:7,data:{name:'Active projection'},archived:false}],30,'old-policy');
      const failure=await Promise.allSettled([api.loadApiCatalogSnapshot(store,{bootstrapCatalog:async()=>bootstrap,bootstrapCatalogPage:async(_id:string,after:number)=>{
        const rows=records.slice(after,Math.min(after+pageSize,records.length));if(mode==='page'&&after===0)rows[0]={...rows[0],data:{name:'tampered'}};
        const next=after+rows.length;return{protocolVersion:2,snapshotId,afterOrdinal:after,nextOrdinal:next,hasMore:next<records.length,pageIndex:after/pageSize,sha256:pageHashes[after/pageSize],records:rows};
      }})]);
      const active=await store.records(),savedCursor=await store.cursor(),policy=await store.policyVersion();store.close();
      output.push({mode,status:failure[0].status,error:failure[0].status==='rejected'?String(failure[0].reason):'',active,savedCursor,policy});
    }
    return output;
  });
  expect(outcomes.every((item:any)=>item.status==='rejected')).toBe(true);
  expect(outcomes.map((item:any)=>item.mode)).toEqual(['manifest','high-water','page','counts','stale-cursor']);
  for(const item of outcomes){expect(item.active).toEqual([{collection:'stockItems',id:'retained',version:7,data:{name:'Active projection'},archived:false}]);expect(item.savedCursor).toBe(30);expect(item.policy).toBe('old-policy');}
});

test('API bootstrap protects unresolved commands and recovers expired or quota-failed transfers',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:harness});
  const result=await page.evaluate(async()=>{
    const api=(window as any).ServOSBootstrap;
    const stable=(value:any):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    const digest=async(value:unknown)=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));return[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
    const make=async()=>{
      const records=[{collection:'products',id:'fresh',version:1,data:{name:'Fresh'},archived:false}],snapshotId=crypto.randomUUID(),expiresAt=new Date(Date.now()+300_000).toISOString(),pageHashes=[await digest({afterOrdinal:0,nextOrdinal:1,records})],core={protocolVersion:2,snapshotId,expiresAt,schemaVersion:2,highWaterCursor:3,recordCount:1,collectionCounts:{products:1},pageSize:2,pageCount:1,pageHashes};
      const bootstrap={protocolVersion:2,snapshotId,expiresAt,cursor:3,manifest:{...core,sha256:await digest(core)}};return{records,snapshotId,expiresAt,bootstrap,pageHashes};
    };
    const serve=(fixture:any)=>({bootstrapCatalog:async()=>fixture.bootstrap,bootstrapCatalogPage:async(snapshotId:string)=>({protocolVersion:2,snapshotId,afterOrdinal:0,nextOrdinal:1,hasMore:false,pageIndex:0,sha256:fixture.pageHashes[0],records:fixture.records})});
    const fixture=await make(),pendingStore=await api.BusinessStore.open(`bootstrap-pending-${crypto.randomUUID()}`,'device','actor',0,'API');
    await pendingStore.replaceSnapshot([{collection:'products',id:'old',version:1,data:{name:'Old'},archived:false}],2,'old');
    const queued=await pendingStore.enqueue('product.save',{id:'pending'},[]);let networkCalls=0;
    const counted={bootstrapCatalog:async()=>{networkCalls++;return fixture.bootstrap},bootstrapCatalogPage:async()=>{networkCalls++;throw new Error('Unexpected bootstrap page request')}};
    const pendingAttempt=await Promise.allSettled([api.loadApiCatalogSnapshot(pendingStore,counted)]);await pendingStore.markOutcomeUnknown(queued.id);
    const unknownAttempt=await Promise.allSettled([api.loadApiCatalogSnapshot(pendingStore,counted)]);
    const pendingRows=await pendingStore.records(),pendingCursor=await pendingStore.cursor();pendingStore.close();

    const expiredStore=await api.BusinessStore.open(`bootstrap-expired-${crypto.randomUUID()}`,'device','actor',0,'API');
    const expiredAt=new Date(Date.now()-60_000).toISOString(),expiredId=crypto.randomUUID(),expiredCore={...fixture.bootstrap.manifest,snapshotId:expiredId,expiresAt:expiredAt};delete (expiredCore as any).sha256;
    const expiredManifest={...expiredCore,sha256:await digest(expiredCore)};
    await expiredStore.beginBootstrap(expiredId,expiredAt,'api-catalog-v3',expiredManifest);
    const expiredCalls:string[]=[];await api.loadApiCatalogSnapshot(expiredStore,{...serve(fixture),bootstrapCatalog:async(snapshotId?:string)=>{expiredCalls.push(snapshotId||'new');return fixture.bootstrap}});
    const expiredRows=await expiredStore.records(),expiredCursor=await expiredStore.cursor();expiredStore.close();

    const serverExpiredStore=await api.BusinessStore.open(`bootstrap-server-expired-${crypto.randomUUID()}`,'device','actor',0,'API');
    await serverExpiredStore.beginBootstrap(fixture.snapshotId,fixture.expiresAt,'api-catalog-v3',fixture.bootstrap.manifest);
    const serverExpiredCalls:string[]=[];await api.loadApiCatalogSnapshot(serverExpiredStore,{...serve(fixture),bootstrapCatalog:async(snapshotId?:string)=>{
      serverExpiredCalls.push(snapshotId||'new');if(snapshotId)throw new api.ApiHttpError(404,'BOOTSTRAP_SNAPSHOT_EXPIRED','Server snapshot expired');return fixture.bootstrap;
    }});
    const serverExpiredRows=await serverExpiredStore.records();serverExpiredStore.close();

    const quotaStore=await api.BusinessStore.open(`bootstrap-quota-${crypto.randomUUID()}`,'device','actor',0,'API');
    await quotaStore.replaceSnapshot([{collection:'products',id:'retained',version:2,data:{name:'Retained'},archived:false}],7,'old-policy');
    quotaStore.stageBootstrapPage=async()=>{throw new DOMException('Simulated browser storage quota exhaustion','QuotaExceededError')};
    const quotaAttempt=await Promise.allSettled([api.loadApiCatalogSnapshot(quotaStore,serve(fixture))]);
    const quotaRows=await quotaStore.records(),quotaCursor=await quotaStore.cursor(),quotaPolicy=await quotaStore.policyVersion();quotaStore.close();
    return{networkCalls,pendingAttempt:pendingAttempt[0].status,unknownAttempt:unknownAttempt[0].status,pendingRows,pendingCursor,expiredCalls,expiredRows,expiredCursor,expiredSnapshotId:fixture.snapshotId,serverExpiredCalls,serverExpiredRows,quotaAttempt:quotaAttempt[0].status,quotaError:quotaAttempt[0].status==='rejected'?String(quotaAttempt[0].reason):'',quotaRows,quotaCursor,quotaPolicy};
  });
  expect(result.pendingAttempt).toBe('rejected');expect(result.unknownAttempt).toBe('rejected');expect(result.networkCalls).toBe(0);
  expect(result.pendingRows).toEqual([{collection:'products',id:'old',version:1,data:{name:'Old'},archived:false}]);expect(result.pendingCursor).toBe(2);
  expect(result.expiredCalls).toEqual(['new']);expect(result.expiredRows).toEqual([{collection:'products',id:'fresh',version:1,data:{name:'Fresh'},archived:false}]);expect(result.expiredCursor).toBe(3);
  expect(result.serverExpiredCalls).toEqual([result.expiredSnapshotId,'new']);expect(result.serverExpiredRows).toEqual([{collection:'products',id:'fresh',version:1,data:{name:'Fresh'},archived:false}]);
  expect(result.quotaAttempt).toBe('rejected');expect(result.quotaError).toContain('QuotaExceededError');
  expect(result.quotaRows).toEqual([{collection:'products',id:'retained',version:2,data:{name:'Retained'},archived:false}]);expect(result.quotaCursor).toBe(7);expect(result.quotaPolicy).toBe('old-policy');
});

test('IndexedDB activation abort keeps the prior projection, and a large snapshot installs atomically',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:harness});
  const result=await page.evaluate(async()=>{
    const api=(window as any).ServOSBootstrap;
    const stable=(value:any):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    const digest=async(value:unknown)=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));return[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
    const scope=`bootstrap-abort-${crypto.randomUUID()}`,id='abort-snapshot',expiresAt=new Date(Date.now()+300_000).toISOString();
    const abortStore=await api.BusinessStore.open(scope,'device','actor',0,'API');
    await abortStore.replaceSnapshot([{collection:'products',id:'retained',version:8,data:{name:'Atomic predecessor'},archived:false}],12,'prior-policy');
    const row={collection:'products',id:'staged',version:1,data:{name:'Will fail target keyPath'},archived:false},hash=await digest({afterOrdinal:0,nextOrdinal:1,records:[row]}),core={protocolVersion:2,snapshotId:id,expiresAt,schemaVersion:2,highWaterCursor:13,recordCount:1,collectionCounts:{products:1},pageSize:2,pageCount:1,pageHashes:[hash]},manifest={...core,sha256:await digest(core)};
    await abortStore.beginBootstrap(id,expiresAt,'new-policy',manifest);await abortStore.stageBootstrapPage(id,0,[row]);
    const database=indexedDB.open(`servos-api-v1:${scope}:device:actor`);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{database.onsuccess=()=>resolve(database.result);database.onerror=()=>reject(database.error)});
    const tx=db.transaction('bootstrapStage','readwrite'),entry=await new Promise<any>((resolve,reject)=>{const request=tx.objectStore('bootstrapStage').get([id,0]);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    entry.record.id=undefined;tx.objectStore('bootstrapStage').put(entry);
    await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>{/* abort reports the transaction error */}});db.close();
    const abort=await Promise.allSettled([abortStore.activateBootstrap(id)]),afterAbort=await abortStore.records(),abortCursor=await abortStore.cursor(),abortPolicy=await abortStore.policyVersion();abortStore.close();

    const largeScope=`bootstrap-large-${crypto.randomUUID()}`,largeStore=await api.BusinessStore.open(largeScope,'device','actor',0,'API');
    const records=Array.from({length:1203},(_,index)=>({collection:'stockItems',id:`large-${String(index).padStart(4,'0')}`,version:1,data:{name:`Large ${index}`},archived:false})),pageSize=1000,largeId=crypto.randomUUID(),largeExpiry=new Date(Date.now()+300_000).toISOString(),pageHashes:string[]=[];
    for(let after=0;after<records.length;after+=pageSize)pageHashes.push(await digest({afterOrdinal:after,nextOrdinal:Math.min(after+pageSize,records.length),records:records.slice(after,after+pageSize)}));
    const counts={stockItems:records.length},largeCore={protocolVersion:2,snapshotId:largeId,expiresAt:largeExpiry,schemaVersion:2,highWaterCursor:77,recordCount:records.length,collectionCounts:counts,pageSize,pageCount:pageHashes.length,pageHashes},largeBootstrap={protocolVersion:2,snapshotId:largeId,expiresAt:largeExpiry,cursor:77,manifest:{...largeCore,sha256:await digest(largeCore)}};
    const largeResult=await api.loadApiCatalogSnapshot(largeStore,{bootstrapCatalog:async()=>largeBootstrap,bootstrapCatalogPage:async(snapshotId:string,after:number)=>{const next=Math.min(after+pageSize,records.length);return{protocolVersion:2,snapshotId,afterOrdinal:after,nextOrdinal:next,hasMore:next<records.length,pageIndex:after/pageSize,sha256:pageHashes[after/pageSize],records:records.slice(after,next)}}});
    const installed=await largeStore.records(),largeCursor=await largeStore.cursor(),largePolicy=await largeStore.policyVersion();largeStore.close();
    return{abort:abort[0].status,abortError:abort[0].status==='rejected'?String(abort[0].reason):'',afterAbort,abortCursor,abortPolicy,largeResult,largeLength:installed.length,first:installed[0],last:installed.at(-1),largeCursor,largePolicy};
  });
  expect(result.abort).toBe('rejected');expect(result.afterAbort).toEqual([{collection:'products',id:'retained',version:8,data:{name:'Atomic predecessor'},archived:false}]);expect(result.abortCursor).toBe(12);expect(result.abortPolicy).toBe('prior-policy');
  expect(result.largeResult).toMatchObject({cursor:77,records:1203,reused:false});expect(result.largeLength).toBe(1203);expect(result.first.id).toBe('large-0000');expect(result.last.id).toBe('large-1202');expect(result.largeCursor).toBe(77);expect(result.largePolicy).toBe('api-catalog-v3');
});
