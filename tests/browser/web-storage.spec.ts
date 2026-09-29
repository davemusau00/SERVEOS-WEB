import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';

const harness=buildSync({stdin:{contents:"export {BusinessStore} from './src/runtime/web/BusinessStore'; export {synchronizeStore} from './src/runtime/web/sync';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'ServOSQueue',platform:'browser',target:'es2022'}).outputFiles[0].text;

test('offline shell reloads without caching business API responses',async({page,context})=>{
  await page.goto('/');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.route('**/private-business-response',route=>route.fulfill({contentType:'application/json',body:'{"private":true}'}));
  await page.evaluate(()=>fetch('/private-business-response',{headers:{Authorization:'Bearer test-only'}}));
  const cached=await page.evaluate(async()=>{const keys=await caches.keys();return(await Promise.all(keys.map(async key=>(await(await caches.open(key)).keys()).map(r=>r.url)))).flat()});
  expect(cached.some(url=>url.includes('private-business-response'))).toBe(false);
  await context.setOffline(true);await page.reload();await expect(page.getByRole('button',{name:'Open UI preview'})).toBeVisible();
  await context.setOffline(false);
});

test('IndexedDB queue preserves identity across reload and rolls back incomplete pull pages',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:harness});
  const ids=await page.evaluate(async()=>{
    const {BusinessStore}=(window as any).ServOSQueue;
    const one=await BusinessStore.open('storage-test','device','actor');const two=await BusinessStore.open('storage-test','device','actor');
    const commands=await Promise.all([one.enqueue('record.save',{name:'One'},[]),two.enqueue('record.save',{name:'Two'},[])]);
    one.close();two.close();return commands.map((c:any)=>({id:c.id,sequence:c.clientSequence}));
  });
  expect(ids.map(x=>x.sequence).sort()).toEqual([1,2]);
  await page.reload();await page.addScriptTag({content:harness});
  const result=await page.evaluate(async()=>{
    const {BusinessStore,synchronizeStore}=(window as any).ServOSQueue;const store=await BusinessStore.open('storage-test','device','actor');
    const pending=await store.queue();let calls:string[]=[];
    const transport={execute:async(command:any)=>{calls.push(command.id);if(calls.length===1)throw new Error('Response lost');return{commandId:command.id,status:'SYNCHRONIZED',recordVersions:[]}},pull:async()=>({cursor:0,hasMore:false,changes:[]})};
    try{await synchronizeStore(store,transport)}catch{}
    const retained=await store.hasPending();await synchronizeStore(store,transport);
    let gap=false;try{await store.applyPage({cursor:3,hasMore:false,changes:[{sequence:1,records:[{collection:'customers',id:'c1',version:1,data:{name:'One'},archived:false}]},{sequence:3,records:[]}]})}catch{gap=true}
    const afterGap=await store.records();const cursorAfterGap=await store.cursor();
    await store.applyPage({cursor:1,hasMore:false,changes:[{sequence:1,records:[{collection:'customers',id:'c1',version:1,data:{name:'One'},archived:false}]}]});
    await store.applyPage({cursor:2,hasMore:false,changes:[{sequence:2,records:[{collection:'customers',id:'c1',version:2,data:{name:'One'},archived:true}]}]});
    const records=await store.records();const queue=await store.queue();store.close();
    return{ids:pending.map((p:any)=>p.id),retained,calls,gap,afterGap,cursorAfterGap,records,states:queue.map((q:any)=>q.state)};
  });
  expect(result.ids.sort()).toEqual(ids.map(x=>x.id).sort());expect(result.retained).toBe(true);expect(result.calls[0]).toBe(result.calls[1]);
  expect(result.states).toEqual(['SYNCHRONIZED','SYNCHRONIZED']);expect(result.gap).toBe(true);expect(result.afterGap).toEqual([]);expect(result.cursorAfterGap).toBe(0);expect(result.records[0].archived).toBe(true);
});
