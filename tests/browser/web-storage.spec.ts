import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';

const harness=buildSync({stdin:{contents:"export {BusinessStore} from './src/runtime/web/BusinessStore'; export {synchronizeStore} from './src/runtime/web/sync'; export {getOrCreateWebDeviceIdentity} from './src/runtime/web/deviceIdentity';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'ServOSQueue',platform:'browser',target:'es2022'}).outputFiles[0].text;

test('device identity keeps a non-exportable WebCrypto key in IndexedDB across reloads',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:harness});
  const first=await page.evaluate(async()=>{const identity=await (window as any).ServOSQueue.getOrCreateWebDeviceIdentity('identity-business');return{deviceId:identity.deviceId,extractable:identity.privateKey.extractable,algorithm:identity.privateKey.algorithm.name,publicKey:identity.publicKey.kid||identity.publicKey.crv}});
  await page.reload();await page.addScriptTag({content:harness});
  const second=await page.evaluate(async()=>{const identity=await (window as any).ServOSQueue.getOrCreateWebDeviceIdentity('identity-business');return{deviceId:identity.deviceId,extractable:identity.privateKey.extractable,algorithm:identity.privateKey.algorithm.name}});
  expect(second).toEqual({deviceId:first.deviceId,extractable:false,algorithm:'ECDSA'});expect(first.extractable).toBe(false);expect(first.publicKey).toBe('P-256');
});

test('reviewed inventory retry across browser connections preserves one sequence and rejects payload changes',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:harness});
  const result=await page.evaluate(async()=>{
    const {BusinessStore}=(window as any).ServOSQueue;
    const first=await BusinessStore.open('reviewed-count','device','actor');const second=await BusinessStore.open('reviewed-count','device','actor');
    const payload={locationId:'bar',rows:[{stockItemId:'wine',countedQuantity:6300}]};const versions=[{collection:'stockItems',id:'wine',version:3}];
    const commands=await Promise.all([first.enqueue('inventory.countSelected',payload,versions,undefined,'stable-review'),second.enqueue('inventory.countSelected',payload,versions,undefined,'stable-review')]);
    let changed=false;try{await second.enqueue('inventory.countSelected',{...payload,locationId:'other'},versions,undefined,'stable-review')}catch{changed=true;}
    const queue=await first.queue();first.close();second.close();return {commands,queue,changed};
  });
  expect(result.commands[0]).toEqual(result.commands[1]);expect(result.queue).toHaveLength(1);expect(result.queue[0].sequence).toBe(1);expect(result.changed).toBe(true);
});

test('offline shell reloads without caching business API responses',async({page,context})=>{
  await page.goto('/');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;await new Promise<void>(resolve=>{if(navigator.serviceWorker.controller){resolve();return}const onChange=()=>{navigator.serviceWorker.removeEventListener('controllerchange',onChange);resolve()};navigator.serviceWorker.addEventListener('controllerchange',onChange);setTimeout(resolve,1000)})});
  if(!(await page.evaluate(()=>!!navigator.serviceWorker.controller)))await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.route('**/private-business-response',route=>route.fulfill({contentType:'application/json',body:'{"private":true}'}));
  await page.evaluate(()=>fetch('/private-business-response',{headers:{Authorization:'Bearer test-only'}}));
  const cached=await page.evaluate(async()=>{const keys=await caches.keys();return(await Promise.all(keys.map(async key=>(await(await caches.open(key)).keys()).map(r=>r.url)))).flat()});
  expect(cached.some(url=>url.includes('private-business-response'))).toBe(false);
  await context.setOffline(true);await page.reload();
  const previewEntry=page.getByRole('button',{name:'Open UI preview'});
  if(await previewEntry.count()) await expect(previewEntry).toBeVisible();
  else await expect(page.getByRole('heading',{name:'Business control'})).toBeVisible();
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
    const retained=await store.hasPending();const afterLostResponse=(await store.queue()).map((entry:any)=>({id:entry.id,state:entry.state}));await synchronizeStore(store,transport);
    const change=(sequence:number,records:any[])=>({sequence,commandId:`change-${sequence}`,actorId:'actor',deviceId:'device',occurredAt:'2026-10-07T10:00:00Z',records});
    let gap=false;try{await store.applyPage({cursor:3,highWater:3,hasMore:false,changes:[change(1,[{collection:'customers',id:'c1',version:1,data:{name:'One'},archived:false}]),change(3,[])]})}catch{gap=true}
    const afterGap=await store.records();const cursorAfterGap=await store.cursor();
    await store.applyPage({cursor:1,highWater:1,hasMore:false,changes:[change(1,[{collection:'customers',id:'c1',version:1,data:{name:'One'},archived:false}])]});
    await store.applyPage({cursor:2,highWater:2,hasMore:false,changes:[change(2,[{collection:'customers',id:'c1',version:2,data:{name:'One'},archived:true}])]});
    const records=await store.records();const queue=await store.queue();store.close();
    return{ids:pending.map((p:any)=>p.id),retained,afterLostResponse,calls,gap,afterGap,cursorAfterGap,records,states:queue.map((q:any)=>q.state)};
  });
  expect(result.ids.sort()).toEqual(ids.map(x=>x.id).sort());expect(result.retained).toBe(true);expect(result.afterLostResponse[0].state).toBe('OUTCOME_UNKNOWN');expect(result.calls[0]).toBe(result.calls[1]);
  expect(result.states).toEqual(['SYNCHRONIZED','SYNCHRONIZED']);expect(result.gap).toBe(true);expect(result.afterGap).toEqual([]);expect(result.cursorAfterGap).toBe(0);expect(result.records[0].archived).toBe(true);
});

test('typed drafts survive storage upgrade and promote exactly once without retaining secrets',async({page})=>{
  await page.goto('/');await page.addScriptTag({content:harness});
  const result=await page.evaluate(async()=>{
    const {BusinessStore}=(window as any).ServOSQueue;
    const one=await BusinessStore.open('draft-test','device','actor');
    await one.saveDraft({id:'draft-1',operation:'payment.record',collection:'orders',targetId:'order-1',editorKind:'Take payment',inputValues:{amount:'10',approvalToken:'do-not-store'},fields:[{key:'amount',label:'Amount',value:'10'},{key:'approvalToken',label:'Approval token',value:'do-not-store'}],payload:{orderId:'order-1',amountMinor:100,approvalToken:'do-not-store'},expectedVersions:[{collection:'orders',id:'order-1',version:2}],policyVersion:'p2',validationSummary:['Bearer eyJheader.eyJpayload.signature'],requiresReview:true});
    const saved=await one.resumeDraft('draft-1');
    const two=await BusinessStore.open('draft-test','device','actor');
    const attempts=await Promise.allSettled([one.promoteDraftToCommand('draft-1'),two.promoteDraftToCommand('draft-1')]);
    const queue=await one.queue();const drafts=await one.drafts();one.close();two.close();
    return {attempts:attempts.map((attempt:any)=>attempt.status),queue,drafts,saved};
  });
  expect(result.attempts.filter((status:string)=>status==='fulfilled')).toHaveLength(1);
  expect(result.queue).toHaveLength(1);expect(result.queue[0].command.payload.approvalToken).toBeUndefined();expect(result.drafts).toHaveLength(0);
  expect(result.saved.inputValues.approvalToken).toBeUndefined();expect(result.saved.fields[1].value).toBe('');expect(result.saved.validationSummary[0]).toContain('[redacted]');
});
