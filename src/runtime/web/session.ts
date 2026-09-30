import { BusinessStore } from './BusinessStore';
import type { RecordVersion } from '../../types/transactions';

export type WebLifecycleStage='INTAKE'|'SETUP'|'READY_FOR_GO_LIVE'|'LIVE';
export interface WebReadinessCheck {id:string;label:string;complete:boolean}
export interface WebSession {
 businessId:string;actorId:string;enabled:boolean;permissions:string[];policyVersion:string;
 propertyContext?:{timeZone:string;nightlyCheckoutTime:string;dayStayCutoffTime:string};
 lifecycleStage?:WebLifecycleStage;intakeProfile?:Record<string,unknown>;setupState?:Record<string,unknown>;
 readiness?:{ready:boolean;checks:WebReadinessCheck[]};
}
export interface WebGuidanceProgress {guideId:string;guideVersion:number;state:'IN_PROGRESS'|'COMPLETED'|'DISMISSED';currentStepId:string|null;completedStepIds:string[];updatedAt?:string}
export type BusinessRecord=RecordVersion & {data:Record<string,unknown>;archived:boolean};
export type Rpc=(path:string,body?:unknown)=>Promise<any>;
interface SnapshotPage {cursor:number;policyVersion:string;records:BusinessRecord[];hasMore:boolean;afterCollection:string;afterId:string}
export const allowed=(session:WebSession,permission:string)=>session.permissions.includes('*')||session.permissions.includes(permission);

export async function openWebDevice(session:WebSession,rpc:Rpc){
  const storageKey=`servos-device:${session.businessId}:${session.actorId}`;
  let id=localStorage.getItem(storageKey);
  if(!id){id=crypto.randomUUID();localStorage.setItem(storageKey,id)}
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
