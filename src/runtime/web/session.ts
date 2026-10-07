import { BusinessStore } from './BusinessStore';
import type { RecordVersion } from '../../types/transactions';
import {getOrCreateWebDeviceIdentity} from './deviceIdentity';
import {createServOSApiClient} from './apiClient';

export type WebLifecycleStage='INTAKE'|'SETUP'|'READY_FOR_GO_LIVE'|'LIVE';
export interface WebReadinessCheck {id:string;label:string;complete:boolean}
export interface WebSession {
 businessId:string;actorId:string;enabled:boolean;permissions:string[];policyVersion:string;
 propertyContext?:{timeZone:string;nightlyCheckoutTime:string;dayStayCutoffTime:string;roomTypeId:string|null;ratePlanId:string|null};
 lifecycleStage?:WebLifecycleStage;intakeProfile?:Record<string,unknown>;setupState?:Record<string,unknown>;
 readiness?:{ready:boolean;checks:WebReadinessCheck[]};
}
export interface WebGuidanceProgress {guideId:string;guideVersion:number;state:'IN_PROGRESS'|'COMPLETED'|'DISMISSED';currentStepId:string|null;completedStepIds:string[];updatedAt?:string}
export type BusinessRecord=RecordVersion & {data:Record<string,unknown>;archived:boolean};
export type Rpc=(path:string,body?:unknown)=>Promise<any>;
const stableSnapshotJson=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stableSnapshotJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${stableSnapshotJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
interface SnapshotPage {cursor:number;policyVersion:string;records:BusinessRecord[];hasMore:boolean;afterCollection:string;afterId:string}
export const allowed=(session:WebSession,permission:string)=>session.permissions.includes('*')||session.permissions.includes(permission);

export async function openWebDevice(session:WebSession,rpc:Rpc){
  const storageKey=`servos-device:${session.businessId}:${session.actorId}`;
  const identity=await getOrCreateWebDeviceIdentity(session.businessId,localStorage.getItem(storageKey)||undefined);
  const id=identity.deviceId;
  localStorage.removeItem(storageKey);
  const device=await rpc('rpc/servos_v2_register_device',{device_id:id,label:'Browser workstation',kind:'WEB'}) as {id:string;lastSequence:number};
  if(device.id!==id)throw new Error('The server returned a different device identity');
  const store=await BusinessStore.open(session.businessId,id,session.actorId,device.lastSequence);
  void navigator.storage?.persist?.().catch(()=>false);
  return store;
}

export async function loadAuthorizedSnapshot(store:BusinessStore,rpc:Rpc,session:WebSession){
  for(let attempt=0;attempt<3;attempt++){
    try{
      let cursor:number|undefined;let afterCollection='';let afterId='';const records:BusinessRecord[]=[];
      do{
        const page:SnapshotPage=await rpc('rpc/servos_v2_snapshot',{after_collection:afterCollection,after_id:afterId,expected_cursor:cursor??null,expected_policy:session.policyVersion,page_size:500});
        if(page.policyVersion!==session.policyVersion||(cursor!==undefined&&cursor!==page.cursor))throw new Error('SNAPSHOT_CHANGED');
        records.push(...page.records);cursor=page.cursor;
        if(!page.hasMore){await store.replaceSnapshot(records,cursor,session.policyVersion);return}
        if(page.afterCollection===afterCollection&&page.afterId===afterId)throw new Error('Snapshot pagination made no progress');
        afterCollection=page.afterCollection;afterId=page.afterId;
      }while(true);
    }catch(error){if(!String(error).includes('SNAPSHOT_CHANGED')||attempt===2)throw error}
  }
}

/** Install the API's records[] bootstrap into the same IndexedDB projection consumed by PWA workflows. */
export async function loadApiCatalogSnapshot(store:BusinessStore,client:ReturnType<typeof createServOSApiClient>,policyVersion='api-catalog-v2'){
  const localCursor=await store.cursor();
  const localPolicy=await store.policyVersion();
  const localRecords=await store.records();
  // replaceSnapshot writes this policy marker atomically with records/cursor.
  // Cursor zero and an empty catalog are both valid initialized projections.
  if(localPolicy===policyVersion)return {cursor:localCursor,records:localRecords.length,policyVersion,reused:true};
  const queued=await store.queue();
  if(queued.some(row=>row.state==='PENDING_SYNC'||row.state==='OUTCOME_UNKNOWN'))throw new Error('Saved API commands must be recovered before rebuilding this device projection.');
  const bootstrap=await client.bootstrapCatalog();
  if(bootstrap.protocolVersion!==1||!Number.isSafeInteger(bootstrap.cursor)||bootstrap.cursor<0||!Array.isArray(bootstrap.records)||!bootstrap.manifest||bootstrap.manifest.schemaVersion!==1||bootstrap.manifest.highWaterCursor!==bootstrap.cursor||bootstrap.manifest.recordCount!==bootstrap.records.length||!/^[a-f0-9]{64}$/.test(bootstrap.manifest.sha256)||!bootstrap.manifest.collectionCounts||typeof bootstrap.manifest.collectionCounts!=='object'||Array.isArray(bootstrap.manifest.collectionCounts))throw new Error('API catalog bootstrap manifest is invalid');
  const collectionCounts:Record<string,number>={},identities=new Set<string>();
  for(const record of bootstrap.records){
    if(!record||typeof record.collection!=='string'||!record.collection||typeof record.id!=='string'||!record.id||!Number.isSafeInteger(record.version)||record.version<1||!record.data||typeof record.data!=='object'||Array.isArray(record.data)||typeof record.archived!=='boolean')throw new Error('API catalog bootstrap contains an invalid record');
    const key=`${record.collection}\u0000${record.id}`;if(identities.has(key))throw new Error('API catalog bootstrap contains a duplicate record');identities.add(key);collectionCounts[record.collection]=(collectionCounts[record.collection]||0)+1;
  }
  const countsMatch=Object.keys(collectionCounts).length===Object.keys(bootstrap.manifest.collectionCounts).length&&Object.entries(collectionCounts).every(([collection,count])=>bootstrap.manifest.collectionCounts[collection]===count);
  if(!countsMatch)throw new Error('API catalog bootstrap collection counts do not match');
  const manifestPayload={protocolVersion:bootstrap.protocolVersion,schemaVersion:bootstrap.manifest.schemaVersion,highWaterCursor:bootstrap.manifest.highWaterCursor,recordCount:bootstrap.manifest.recordCount,collectionCounts:bootstrap.manifest.collectionCounts,records:bootstrap.records};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableSnapshotJson(manifestPayload)));
  const computedHash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');if(computedHash!==bootstrap.manifest.sha256)throw new Error('API catalog bootstrap hash does not match its manifest');
  await store.replaceSnapshot(bootstrap.records,bootstrap.cursor,policyVersion);
  return {cursor:bootstrap.cursor,records:bootstrap.records.length,policyVersion,reused:false};
}
