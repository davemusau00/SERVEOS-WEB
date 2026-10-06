import type {BusinessCommandV2,ChangePage,TransactionResult} from '../../types/transactions';
import {BusinessStore} from './BusinessStore';
import {ApiHttpError,ApiOutcomeUnknown,createServOSApiClient,type ApiCommandOutcome} from './apiClient';

export interface CloudTransport {execute(command:BusinessCommandV2):Promise<TransactionResult>;pull(cursor:number):Promise<ChangePage>}

export function createApiTransport(client:ReturnType<typeof createServOSApiClient>):CloudTransport{
 return {
  async execute(command){
   let outcome:ApiCommandOutcome|undefined;
   try{
    const status=await client.commandStatus(command.id);
    if(status.outcome&&(status.status==='CONFIRMED'||status.status==='REJECTED'||status.status==='CONFLICT'))outcome=status.outcome;
    else if(status.status==='RECEIVED'||status.status==='PROCESSING'){
     for(let attempt=0;attempt<6;attempt++){
      await new Promise(resolve=>setTimeout(resolve,500));const current=await client.commandStatus(command.id);
      if(current.outcome&&(current.status==='CONFIRMED'||current.status==='REJECTED'||current.status==='CONFLICT')){outcome=current.outcome;break}
     }
     if(!outcome)throw new ApiOutcomeUnknown(command.id);
    }
   }catch(error){if(!(error instanceof ApiHttpError&&error.status===404))throw error}
   outcome??=await client.submitCommand({commandId:command.id,name:command.operation,payload:command.payload,expectedVersions:Object.fromEntries(command.expectedVersions.map(item=>[`${item.collection}:${item.id}`,item.version])),...(command.offlineGrantId?{offlineGrantId:command.offlineGrantId}:{})});
   if(outcome.kind==='CONFIRMED')return {commandId:command.id,status:'SYNCHRONIZED',recordVersions:[],serverSequence:outcome.cursor};
   return {commandId:command.id,status:outcome.kind==='CONFLICT'?'CONFLICT':'REJECTED',recordVersions:[],error:outcome.error||{code:outcome.kind,message:'The API did not confirm this command.',retryable:false}};
  },
  pull(cursor){return client.changes(cursor,200)}
 };
}
export type SyncUpdate={type:'SYNC_STARTED'|'SYNC_FINISHED'|'SYNC_FAILED';at:string};
const syncChannel=(scope:string,deviceId:string,actorId:string)=>`servos-v2-sync:${scope}:${deviceId}:${actorId}:updates`;
export function subscribeSyncUpdates(scope:string,deviceId:string,actorId:string,onUpdate:(update:SyncUpdate)=>void){
 if(typeof BroadcastChannel==='undefined')return()=>{};
 const channel=new BroadcastChannel(syncChannel(scope,deviceId,actorId));channel.onmessage=event=>{if(event.data&&['SYNC_STARTED','SYNC_FINISHED','SYNC_FAILED'].includes(event.data.type))onUpdate(event.data as SyncUpdate)};
 return()=>channel.close();
}
export async function synchronizeStore(store:BusinessStore,transport:CloudTransport):Promise<void>{
  if(!navigator.locks)throw new Error('This browser cannot safely coordinate device synchronization');
  const channel=typeof BroadcastChannel==='undefined'?undefined:new BroadcastChannel(`${syncChannel(store.scope,store.deviceId,store.actorId)}:${store.commandAuthority}`);
  const publish=(type:SyncUpdate['type'])=>channel?.postMessage({type,at:new Date().toISOString()});
  try{
   await navigator.locks.request(`servos-v2-sync:${store.scope}:${store.deviceId}:${store.actorId}:${store.commandAuthority}`,async()=>{
    publish('SYNC_STARTED');
    const pending=(await store.queue()).filter(row=>row.state==='PENDING_SYNC'||row.state==='OUTCOME_UNKNOWN');
    for(const row of pending){
      await store.markOutcomeUnknown(row.id);
      const result=await transport.execute(row.command);
      if(result.commandId!==row.id)throw new Error('Server acknowledged a different command');
      await store.acknowledge(result);
    }
    for(let pages=0;pages<100;pages++){
      const cursor=await store.cursor();const page=await transport.pull(cursor);
      if(page.hasMore&&page.cursor<=cursor)throw new Error('Change feed made no progress');
      await store.applyPage(page);if(!page.hasMore){publish('SYNC_FINISHED');return}
    }
    throw new Error('Change feed exceeded the per-cycle page limit');
   });
  }catch(error){publish('SYNC_FAILED');throw error}finally{channel?.close()}
}

export function createCloudTransport(url:string,publishableKey:string,accessToken:()=>Promise<string>):CloudTransport{
  const endpoint=new URL(url);if(endpoint.protocol!=='https:'&&endpoint.hostname!=='localhost'&&endpoint.hostname!=='127.0.0.1')throw new Error('Cloud endpoint requires HTTPS');
  const rpc=async<T>(name:string,payload:Record<string,unknown>):Promise<T>=>{
    const token=await accessToken();if(!token)throw new Error('Online sign-in required');
    const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`Cloud request failed (${response.status}); queued command retained`);
    return response.json() as Promise<T>;
  };
  return {execute:command=>rpc('servos_v2_execute',{command}),pull:cursor=>rpc('servos_v2_pull',{after_sequence:cursor,page_size:100})};
}

export function startAutomaticSync(run:()=>Promise<void>,onError:(error:unknown)=>void){
  let stopped=false;let busy=false;let failures=0;let next=0;
  const tick=async()=>{if(stopped||busy||!navigator.onLine||document.visibilityState!=='visible'||Date.now()<next)return;busy=true;
    try{await run();failures=0;next=Date.now()+15000}catch(error){failures++;next=Date.now()+Math.min(300000,5000*2**Math.min(failures-1,6));onError(error)}finally{busy=false}
  };
  const resume=()=>{next=0;void tick()};
  const interval=window.setInterval(()=>void tick(),1000);
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);void tick();
  return {request:resume,stop:()=>{stopped=true;clearInterval(interval);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume)}};
}
