import { BusinessStore } from './BusinessStore';
import type {BootstrapManifest} from './BusinessStore';
import type { RecordVersion } from '../../types/transactions';
import {ApiHttpError,createServOSApiClient} from './apiClient';

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
const stableSnapshotJson=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stableSnapshotJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${stableSnapshotJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
export async function apiAuthorizationPolicyVersion(permissions:string[]):Promise<string>{
 const normalized=[...new Set(permissions)].sort(),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableSnapshotJson(normalized)));
 const hash=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');return `api-catalog-v3:${hash}`;
}
export const allowed=(session:WebSession,permission:string)=>session.permissions.includes('*')||session.permissions.includes(permission);

/** Stage and atomically install a verified, paged API projection into the PWA IndexedDB store. */
export async function loadApiCatalogSnapshot(store:BusinessStore,client:ReturnType<typeof createServOSApiClient>,policyVersion='api-catalog-v3'){
  const localCursor=await store.cursor();
  const localPolicy=await store.policyVersion();
  const localRecords=await store.records();
  // replaceSnapshot writes this policy marker atomically with records/cursor.
  // Cursor zero and an empty catalog are both valid initialized projections.
  if(localPolicy===policyVersion)return {cursor:localCursor,records:localRecords.length,policyVersion,reused:true};
  const queued=await store.queue();
  if(queued.some(row=>row.state==='PENDING_SYNC'||row.state==='OUTCOME_UNKNOWN'))throw new Error('Saved API commands must be recovered before rebuilding this device projection.');
  const digest=async(value:unknown)=>{
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableSnapshotJson(value)));
    return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  };
  const validateManifest=async(value:unknown)=>{
    const bootstrap=value as {protocolVersion?:number;snapshotId?:string;expiresAt?:string;cursor?:number;manifest?:BootstrapManifest};
    const manifest=bootstrap?.manifest;
    if(
      bootstrap?.protocolVersion!==2 ||
      typeof bootstrap.snapshotId!=='string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bootstrap.snapshotId) ||
      typeof bootstrap.expiresAt!=='string' || !Number.isFinite(Date.parse(bootstrap.expiresAt)) || Date.parse(bootstrap.expiresAt)<=Date.now() ||
      !Number.isSafeInteger(bootstrap.cursor) || bootstrap.cursor===undefined || bootstrap.cursor<0 ||
      !manifest || manifest.protocolVersion!==2 || manifest.snapshotId!==bootstrap.snapshotId || manifest.expiresAt!==bootstrap.expiresAt ||
      manifest.schemaVersion!==2 || manifest.highWaterCursor!==bootstrap.cursor ||
      !Number.isSafeInteger(manifest.recordCount) || manifest.recordCount<0 ||
      !Number.isSafeInteger(manifest.pageSize) || manifest.pageSize<1 || manifest.pageSize>1000 ||
      manifest.pageCount!==Math.ceil(manifest.recordCount/manifest.pageSize) ||
      !Array.isArray(manifest.pageHashes) || manifest.pageHashes.length!==manifest.pageCount || manifest.pageHashes.some(hash=>typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)) ||
      !manifest.collectionCounts || typeof manifest.collectionCounts!=='object' || Array.isArray(manifest.collectionCounts) ||
      Object.entries(manifest.collectionCounts).some(([collection,count])=>!collection||!Number.isSafeInteger(count)||count<0) ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256)
    ) throw new Error('API catalog bootstrap manifest is invalid');
    if(Object.values(manifest.collectionCounts).reduce((total,count)=>total+count,0)!==manifest.recordCount)throw new Error('API catalog bootstrap collection counts do not match its total.');
    const {sha256,...core}=manifest;
    if(await digest(core)!==sha256)throw new Error('API catalog bootstrap manifest hash does not match');
    return {bootstrap:bootstrap as {protocolVersion:2;snapshotId:string;expiresAt:string;cursor:number;manifest:BootstrapManifest},manifest};
  };
  let bootstrapValue:unknown;
  const staged=await store.pendingBootstrap();
  if(staged&&Date.parse(staged.expiresAt)>Date.now()){
    try{bootstrapValue=await client.bootstrapCatalog(staged.snapshotId)}
    catch(error){if(!(error instanceof ApiHttpError)||error.code!=='BOOTSTRAP_SNAPSHOT_EXPIRED')throw error;await store.clearBootstrapStage(staged.snapshotId)}
  }else if(staged)await store.clearBootstrapStage(staged.snapshotId);
  if(!bootstrapValue)bootstrapValue=await client.bootstrapCatalog();
  const {bootstrap,manifest}=await validateManifest(bootstrapValue);
  let next=await store.beginBootstrap(bootstrap.snapshotId,bootstrap.expiresAt,policyVersion,manifest);
  while(next<manifest.recordCount){
    const page=await client.bootstrapCatalogPage(bootstrap.snapshotId,next),expectedNext=Math.min(next+manifest.pageSize,manifest.recordCount);
    if(page.protocolVersion!==2||page.snapshotId!==bootstrap.snapshotId||page.afterOrdinal!==next||page.nextOrdinal!==expectedNext||page.pageIndex!==next/manifest.pageSize||page.hasMore!==(expectedNext<manifest.recordCount)||!Array.isArray(page.records)||page.records.length!==expectedNext-next||page.sha256!==manifest.pageHashes[page.pageIndex])throw new Error('API catalog bootstrap page does not match its manifest');
    if(await digest({afterOrdinal:page.afterOrdinal,nextOrdinal:page.nextOrdinal,records:page.records})!==page.sha256)throw new Error('API catalog bootstrap page hash does not match');
    next=await store.stageBootstrapPage(bootstrap.snapshotId,next,page.records);
  }
  const stagedCounts:Record<string,number>={};
  for(let pageIndex=0;pageIndex<manifest.pageCount;pageIndex++){
    const afterOrdinal=pageIndex*manifest.pageSize,records=await store.stagedBootstrapPage(bootstrap.snapshotId,afterOrdinal,manifest.pageSize),nextOrdinal=afterOrdinal+records.length;
    if(await digest({afterOrdinal,nextOrdinal,records})!==manifest.pageHashes[pageIndex])throw new Error('API bootstrap staged page failed its integrity check.');
    for(const record of records)stagedCounts[record.collection]=(stagedCounts[record.collection]||0)+1;
  }
  if(Object.keys(stagedCounts).length!==Object.keys(manifest.collectionCounts).length||Object.entries(stagedCounts).some(([collection,count])=>manifest.collectionCounts[collection]!==count))throw new Error('API bootstrap staged collection counts do not match the manifest.');
  await store.activateBootstrap(bootstrap.snapshotId);
  return {cursor:bootstrap.cursor,records:manifest.recordCount,policyVersion,reused:false};
}
