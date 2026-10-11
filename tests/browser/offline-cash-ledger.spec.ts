import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';
const harness=buildSync({stdin:{contents:`export {BusinessStore} from './src/runtime/web/BusinessStore';export {canonicalCashJson} from './src/runtime/web/offlineCashLedger';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'CashLedger',platform:'browser'}).outputFiles[0].text;
test('100 atomic cash commits survive reopen, dedupe by ID, and abort all evidence on storage failure',async({page})=>{
 await page.goto('/');await page.addScriptTag({content:harness});
 const result=await page.evaluate(async()=>{
  const {BusinessStore,canonicalCashJson}=(window as any).CashLedger,scope=crypto.randomUUID(),device=crypto.randomUUID(),staff=crypto.randomUUID(),outlet=crypto.randomUUID(),till=crypto.randomUUID(),account=crypto.randomUUID();
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);
  const unsigned={leaseId:crypto.randomUUID(),version:2,businessId:scope,deviceId:device,staffId:staff,outletId:outlet,tillSessionId:till,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+4*3600000).toISOString(),deviceLabel:'POS01',permissions:['pos.offlineSale.commitV2'],keyVersion:'test'};
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(canonicalCashJson(unsigned))),lease={...unsigned,signature:btoa(String.fromCharCode(...new Uint8Array(signature)))};
  let store=await BusinessStore.open(scope,device,staff);const inputs:any[]=[],sales:any[]=[];
  const make=()=>({id:crypto.randomUUID(),outletId:outlet,tillSessionId:till,cashAccountId:account,cashTenderedMinor:100000,lines:[{id:crypto.randomUUID(),productId:crypto.randomUUID(),name:'Bar product',routeTo:'BAR',quantity:1,unitPriceMinor:90000,discountBasisPoints:0,comped:false,taxSnapshot:{vatRateBasisPoints:1600,levyRateBasisPoints:200}}],stockMovements:[{id:crypto.randomUUID(),stockItemId:crypto.randomUUID(),locationId:crypto.randomUUID(),quantityFixed:'-750000000',unit:'ml/1000000'}]});
  for(let i=0;i<100;i++){const input=make();inputs.push(input);sales.push(await store.recordLocalCash(input,lease,publicKey));if([24,49,74].includes(i)){store.close();store=await BusinessStore.open(scope,device,staff);}}
  const replay=await store.recordLocalCash(inputs[0],lease,publicKey);let mutation=false;try{await store.recordLocalCash({...inputs[0],cashTenderedMinor:100001},lease,publicKey)}catch{mutation=true;}
  const broken=make();broken.stockMovements[0].id=inputs[0].stockMovements[0].id;let aborted=false;try{await store.recordLocalCash(broken,lease,publicKey)}catch{aborted=true;}
  let forged=false;try{await store.recordLocalCash(make(),{...lease,deviceLabel:'POS02'},publicKey)}catch{forged=true;}
  store.close();
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('servos-web-v1:'+scope+':'+device+':'+staff);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const counts:any={};for(const name of ['cashSales','cashEntries','localStockMovements','localOrderTickets','outboxV2','localPrintEvidence','localShiftLedger'])counts[name]=await new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
  return {counts,replayed:replay.reference===sales[0].reference,mutation,aborted,forged,sequences:sales.map(s=>s.sequence),received:sales.reduce((sum,s)=>sum+s.totalMinor,0),states:[...new Set(sales.map(s=>s.state))]};
 });
 expect(Object.values(result.counts)).toEqual(Array(7).fill(100));expect(result.sequences).toEqual(Array.from({length:100},(_,i)=>i+1));expect(result.received).toBe(9000000);expect(result.states).toEqual(['RECORDED_LOCALLY']);expect(result.replayed&&result.mutation&&result.aborted&&result.forged).toBe(true);
});
