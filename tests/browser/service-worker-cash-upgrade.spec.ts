import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
const harness=buildSync({stdin:{contents:`export {BusinessStore} from './src/runtime/web/BusinessStore';export {canonicalCashJson} from './src/runtime/web/offlineCashLedger';export {safeCashUpdateBoundary} from './src/runtime/web/updateBoundary';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'CashUpgrade',platform:'browser'}).outputFiles[0].text;
test('waiting worker defers pending cash; upgrade and rollback retain the original ledger and both caches',async({page,context})=>{
 let version=1;
 const source=readFileSync('dist-production/sw.js','utf8');
 const html=()=>`<!doctype html><html><body><h1>Release ${version}</h1><script>${harness}</script><script>
 window.start=async()=>{let locator=JSON.parse(localStorage.getItem('locator')||'null');if(!locator){locator={business:crypto.randomUUID(),device:crypto.randomUUID(),staff:crypto.randomUUID()};localStorage.setItem('locator',JSON.stringify(locator));}window.locator=locator;window.store=await CashUpgrade.BusinessStore.open(locator.business,locator.device,locator.staff);navigator.serviceWorker.addEventListener('message',async event=>{if(event.data?.type==='SERVOS_CHECK_UPDATE_BOUNDARY'&&event.ports[0])event.ports[0].postMessage({safe:await CashUpgrade.safeCashUpdateBoundary(window.store,()=>false)});if(event.data?.type==='SERVOS_UPDATE_DEFERRED')window.deferred=true;});window.ready=true;};start();</script></body></html>`;
 const server=createServer((request,response)=>{response.setHeader('Cache-Control','no-store');if(request.url==='/sw.js'){response.setHeader('Content-Type','application/javascript');response.end(source.replace(/const CACHE=[^;]+;/,`const CACHE="cash-upgrade-${version}";`));}else if(request.url==='/'||request.url==='/index.html'){response.setHeader('Content-Type','text/html');response.end(html());}else{response.setHeader('Content-Type','application/javascript');response.end('');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};
 try{
  await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>(window as any).ready);
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});await page.reload();await page.waitForFunction(()=>(window as any).ready&&!!navigator.serviceWorker.controller);
  const original=await page.evaluate(async()=>{
   const w=window as any,{business:businessId,device:deviceId,staff:staffId}=w.locator,keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey),outletId=crypto.randomUUID(),tillSessionId=crypto.randomUUID();
   const unsigned={leaseId:crypto.randomUUID(),version:2,businessId,deviceId,staffId,outletId,tillSessionId,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),deviceLabel:'POS01',permissions:['pos.offlineSale.commitV2'],keyVersion:'test'};
   const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(w.CashUpgrade.canonicalCashJson(unsigned)));
   const sale=await w.store.recordLocalCash({id:crypto.randomUUID(),outletId,tillSessionId,cashAccountId:crypto.randomUUID(),cashTenderedMinor:100000,lines:[{id:crypto.randomUUID(),productId:crypto.randomUUID(),name:'Original cash sale',quantity:1,unitPriceMinor:90000,discountBasisPoints:0,comped:false,taxSnapshot:{vatRateBasisPoints:1600,levyRateBasisPoints:0}}],stockMovements:[]},{...unsigned,signature:btoa(String.fromCharCode(...new Uint8Array(signature)))},publicKey);
   return {id:sale.id,reference:sale.reference,totalMinor:sale.totalMinor};
  });
  version=2;await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration!.update();});await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await page.evaluate(async()=>{(await navigator.serviceWorker.getRegistration())!.waiting!.postMessage({type:'SERVOS_ACTIVATE_UPDATE'});});await page.waitForFunction(()=>(window as any).deferred===true);
  expect(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await page.reload();await page.waitForFunction(()=>(window as any).ready);
  expect(await page.evaluate(async()=>{const sales=await(window as any).store.localCashSales();return {id:sales[0].id,reference:sales[0].reference,totalMinor:sales[0].totalMinor};})).toEqual(original);
  await page.evaluate(async()=>{const w=window as any,sale=(await w.store.localCashSales())[0];await w.store.applyPage({cursor:1,hasMore:false,changes:[{sequence:1,commandId:sale.id,records:[{collection:'offlineCashReconciliations',id:sale.id,version:1,archived:false,data:{staffId:sale.staffId,deviceId:sale.deviceId,reference:sale.reference,status:'SERVER_CONFIRMED',documentIds:[]}}]}]});await w.store.applyLocalCashReconciliations();(await navigator.serviceWorker.getRegistration())!.waiting!.postMessage({type:'SERVOS_ACTIVATE_UPDATE'});});
  await expect.poll(()=>page.evaluate(async()=>!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  version=1;await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update();});await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await page.evaluate(async()=>{(await navigator.serviceWorker.getRegistration())!.waiting!.postMessage({type:'SERVOS_ACTIVATE_UPDATE'});});await expect.poll(()=>page.evaluate(async()=>!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>(window as any).ready);await expect(page.getByRole('heading')).toHaveText('Release 1');
  const recovered=await page.evaluate(async()=>({sales:await(window as any).store.localCashSales(),caches:await caches.keys()}));expect(recovered.sales).toHaveLength(1);expect(recovered.sales[0].id).toBe(original.id);expect(recovered.sales[0].totalMinor).toBe(90000);expect(recovered.caches).toEqual(expect.arrayContaining(['cash-upgrade-1','cash-upgrade-2']));
 }finally{await context.setOffline(false);await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
