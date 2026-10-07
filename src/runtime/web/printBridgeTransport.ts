import {parseBridgeResponse,type BridgeResponse} from './printBridgeResponses';
import type {BridgeAction} from './printBridgeActions';
import {signPrintBridgeRequest} from './printBridgeSigning';
import type {WebDeviceIdentity} from './deviceIdentity';

export interface ApprovedBridge {bridgeId:string;businessId:string;origin:string}
export interface BridgeRequestEvidence {
 requestId:string;bridgeId:string;businessId:string;deviceId:string;bridgeOrigin:string;
 action:BridgeAction['action'];apiJobId?:string;createdAt:string;
 state:'UNRESOLVED'|'RESPONSE_RECORDED';response?:BridgeResponse;
}
function originOf(value:string):string{
 const url=new URL(value);
 if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw new Error('Configure an exact trusted HTTPS bridge origin.');
 return url.origin;
}
function openEvidence():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const request=indexedDB.open('servos-print-bridge-evidence',2);
 request.onupgradeneeded=()=>{const store=request.result.objectStoreNames.contains('requests')?request.transaction!.objectStore('requests'):request.result.createObjectStore('requests',{keyPath:'requestId'});if(!store.indexNames.contains('scopeTime'))store.createIndex('scopeTime',['businessId','deviceId','bridgeId','bridgeOrigin','createdAt','requestId']);};
 request.onerror=()=>reject(request.error||new Error('Cannot open print recovery storage.'));
 request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
});}
async function save(record:BridgeRequestEvidence,create:boolean):Promise<void>{
 const db=await openEvidence();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('requests','readwrite');
  if(create)tx.objectStore('requests').add(record);else tx.objectStore('requests').put(record);
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('Cannot save print recovery evidence.'));tx.onerror=()=>{};
 });}finally{db.close();}
}
export async function readBridgeRequestEvidence(requestId:string):Promise<BridgeRequestEvidence|undefined>{
 const db=await openEvidence();
 try{return await new Promise((resolve,reject)=>{
  const request=db.transaction('requests','readonly').objectStore('requests').get(requestId);
  request.onsuccess=()=>resolve(request.result as BridgeRequestEvidence|undefined);
  request.onerror=()=>reject(request.error||new Error('Cannot read print recovery evidence.'));
 });}finally{db.close();}
}
async function boundedResponse(response:Response):Promise<BridgeResponse>{
 if(!response.ok||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new Error('Bridge response was not confirmed. Recover the original request.');
 const reader=response.body?.getReader();if(!reader)throw new Error('Bridge response is missing. Recover the original request.');
 const decoder=new TextDecoder('utf-8',{fatal:true});let text='',size=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
  if(size>256*1024){await reader.cancel();throw new Error('Bridge response exceeds supported bounds.');}
  text+=decoder.decode(chunk.value,{stream:true});
 }text+=decoder.decode();}finally{reader.releaseLock();}
 return parseBridgeResponse(JSON.parse(text));
}
/** One HTTP attempt only. No staff bearer, cookie, automatic retry or redirect. */
export async function sendBridgeAction(bridge:ApprovedBridge,identity:WebDeviceIdentity,action:BridgeAction):Promise<BridgeRequestEvidence>{
 const origin=originOf(bridge.origin);
 const signed=await signPrintBridgeRequest(identity,bridge.bridgeId,bridge.businessId,action);
 const evidence:BridgeRequestEvidence={requestId:signed.requestId,bridgeId:bridge.bridgeId,businessId:bridge.businessId,
  deviceId:identity.deviceId,bridgeOrigin:origin,action:action.action,
  ...(action.action==='SUBMIT'?{apiJobId:action.jobId}:{}),createdAt:new Date().toISOString(),state:'UNRESOLVED'};
 // Commit before fetch. No claim token, document snapshot or private key is stored here.
 await save(evidence,true);
 try{
  const response=await fetch(`${origin}/v1/requests`,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
   headers:{'content-type':'application/json'},body:JSON.stringify(signed),signal:AbortSignal.timeout(15000)});
  const body=await boundedResponse(response);
  const recorded:BridgeRequestEvidence={...evidence,state:'RESPONSE_RECORDED',response:body};
  await save(recorded,false);return recorded;
 }catch{
  // Timeout, response loss and local completion-write failure are all unresolved delivery.
  throw new Error(`Print outcome unresolved. Recover request ${signed.requestId} before retrying or using another print method.`);
 }
}
/** Fresh status authority never resends the original SUBMIT or extends its claim. */
export async function recoverBridgeRequest(bridge:ApprovedBridge,identity:WebDeviceIdentity,originalRequestId:string):Promise<BridgeRequestEvidence>{
 const original=await readBridgeRequestEvidence(originalRequestId);
 if(!original||original.bridgeId!==bridge.bridgeId||original.businessId!==bridge.businessId||original.deviceId!==identity.deviceId||original.bridgeOrigin!==originOf(bridge.origin))throw new Error('Original print request does not match this approved bridge/device.');
 return sendBridgeAction(bridge,identity,{action:'REQUEST_STATUS',originalRequestId});
}

/** Scoped, newest-first recovery list; retain evidence rather than clearing it on logout. */
export async function listBridgeRequestEvidence(bridge:ApprovedBridge,identity:WebDeviceIdentity,limit=100):Promise<BridgeRequestEvidence[]>{
 if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('Recovery list limit must be 1 to 500.');
 const scope=[bridge.businessId,identity.deviceId,bridge.bridgeId,originOf(bridge.origin)];
 const db=await openEvidence();
 try{return await new Promise((resolve,reject)=>{
  const rows:BridgeRequestEvidence[]=[];
  const range=IDBKeyRange.bound([...scope,'',''],[...scope,'\uffff','\uffff']);
  const cursor=db.transaction('requests','readonly').objectStore('requests').index('scopeTime').openCursor(range,'prev');
  cursor.onerror=()=>reject(cursor.error||new Error('Cannot list print recovery evidence.'));
  cursor.onsuccess=()=>{const entry=cursor.result;if(!entry||rows.length>=limit){resolve(rows);return;}rows.push(entry.value as BridgeRequestEvidence);entry.continue();};
 });}finally{db.close();}
}

/** Discover retained requests for this enrolled device without contacting any saved origin. */
export async function listDeviceBridgeEvidence(businessId:string,identity:WebDeviceIdentity):Promise<BridgeRequestEvidence[]>{
 const db=await openEvidence();
 try{return await new Promise((resolve,reject)=>{
  const rows:BridgeRequestEvidence[]=[];
  const range=IDBKeyRange.bound([businessId,identity.deviceId],[businessId,identity.deviceId,[]]);
  const cursor=db.transaction('requests','readonly').objectStore('requests').index('scopeTime').openCursor(range);
  cursor.onerror=()=>reject(cursor.error||new Error('Cannot read retained print requests.'));
  cursor.onsuccess=()=>{const entry=cursor.result;if(!entry){resolve(rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));return;}rows.push(entry.value as BridgeRequestEvidence);entry.continue();};
 });}finally{db.close();}
}
