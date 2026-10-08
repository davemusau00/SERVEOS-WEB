import type {BusinessCommandV2,ChangePage,RecordVersion,TransactionResult} from '../../types/transactions';

export interface QueuedCommand {id:string; sequence:number; command:BusinessCommandV2; state:'PENDING_SYNC'|'OUTCOME_UNKNOWN'|'SYNCHRONIZED'|'CONFLICT'|'REJECTED'; result?:TransactionResult; firstAttemptAt?:string}
export interface WorkflowDraftField {key:string;label:string;type?:'text'|'number'|'money'|'datetime-local'|'select';options?:Array<{value:string;label:string}>;value?:string;optional?:boolean}
export interface WorkflowDraft {
  id:string; schemaVersion:2; contractVersion:2; operation:string; collection:string; targetId:string;
  editorKind:string; inputValues:Record<string,string>; payload:Record<string,unknown>; expectedVersions:RecordVersion[]; fields?:WorkflowDraftField[];
  supersedes?:string; policyVersion?:string; validationSummary:string[]; requiresReview:boolean; createdAt:string; updatedAt:string;
}
export interface LocalBusinessDocument {id:string;type:string;documentNumber:string;layoutVersion:number;hash:string;snapshot:Record<string,unknown>;issuedAt:string}
export type LocalPrintState='QUEUED'|'SENDING'|'SENT_TO_SPOOLER'|'DELIVERY_UNCERTAIN'|'FAILED'|'CANCELLED';
export interface LocalPrintJob {id:string;documentId:string;printerRole:string;copies:number;state:LocalPrintState;createdAt:string;updatedAt:string;attempt:number;errorCode?:string}
export interface OfflineGrantEnvelope {grantId:string;businessId:string;deviceId:string;staffId:string;issuedAt:string;expiresAt:string;policyVersion:number;allowedCommands:string[];maxCommands:number;usedCommands?:number;keyVersion:string;signature:string;scope?:Record<string,unknown>}
export interface BootstrapManifest {protocolVersion:2;snapshotId:string;expiresAt:string;schemaVersion:2;highWaterCursor:number;recordCount:number;collectionCounts:Record<string,number>;pageSize:number;pageCount:number;pageHashes:string[];sha256:string}
export interface BootstrapStageState {snapshotId:string;expiresAt:string;policyVersion:string;manifest:BootstrapManifest;nextOrdinal:number;collectionCounts:Record<string,number>}
export type CommandAuthority='SUPABASE'|'API';
const request=<T>(value:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error||new Error('Storage request failed'))});
const stableJson=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${stableJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
const sensitiveKey=/password|secret|token|credential|pin/i;
const safeDraftText=(value:string)=>value.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,'Bearer [redacted]').replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted token]');
export const redactSensitiveData=(value:unknown):unknown=>Array.isArray(value)?value.map(redactSensitiveData):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([name])=>!sensitiveKey.test(name)).map(([name,item])=>[name,redactSensitiveData(item)])):typeof value==='string'?safeDraftText(value):value;

/** Staged v2 store. Enqueuing master edits does not claim an offline sale commit. */
export class BusinessStore {
  private closed=false;
  private constructor(private db:IDBDatabase,readonly scope:string,readonly deviceId:string,readonly actorId:string,readonly commandAuthority:CommandAuthority){}
  static async open(scope:string,deviceId:string,actorId:string,serverSequence=0,commandAuthority:CommandAuthority='SUPABASE'):Promise<BusinessStore>{
    if(!scope||!deviceId||!actorId||!Number.isSafeInteger(serverSequence)||serverSequence<0)throw new Error('Valid business, device, actor and sequence are required');
    const databaseName=commandAuthority==='API'?`servos-api-v1:${scope}:${deviceId}:${actorId}`:`servos-v2:${scope}:${deviceId}:${actorId}`;
    const opening=indexedDB.open(databaseName,5);
    opening.onupgradeneeded=()=>{
      const db=opening.result;
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');
      if(!db.objectStoreNames.contains('queue')){const queue=db.createObjectStore('queue',{keyPath:'id'});queue.createIndex('sequence','sequence',{unique:true});}
      if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:['collection','id']});
      if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});
      if(!db.objectStoreNames.contains('offlineGrants'))db.createObjectStore('offlineGrants',{keyPath:'grantId'});
      if(!db.objectStoreNames.contains('documents'))db.createObjectStore('documents',{keyPath:'id'});
      if(!db.objectStoreNames.contains('printJobs')){const jobs=db.createObjectStore('printJobs',{keyPath:'id'});jobs.createIndex('state','state',{unique:false});jobs.createIndex('createdAt','createdAt',{unique:false});}
      if(!db.objectStoreNames.contains('printEvents')){const events=db.createObjectStore('printEvents',{keyPath:'id'});events.createIndex('jobId','jobId',{unique:false});}
      if(!db.objectStoreNames.contains('bootstrapStage')){const stage=db.createObjectStore('bootstrapStage',{keyPath:['snapshotId','ordinal']});stage.createIndex('snapshotIdentity',['snapshotId','record.collection','record.id'],{unique:true});}
    };
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      let abandoned=false;
      opening.onblocked=()=>{abandoned=true;reject(new Error('A ServOS tab is blocking the browser storage upgrade. Finish its work, close other ServOS tabs, and reopen this workspace. Do not clear browser data.'))};
      opening.onerror=()=>reject(opening.error||new Error('Browser storage could not be opened'));
      opening.onsuccess=()=>{if(abandoned){opening.result.close();return}resolve(opening.result)};
    });
    if(!['SUPABASE','API'].includes(commandAuthority)){db.close();throw new Error('Unsupported command authority')}
    const store=new BusinessStore(db,scope,deviceId,actorId,commandAuthority);
    db.onversionchange=()=>{store.close();if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('servos:storage-closed',{detail:{reason:'UPGRADE'}}))};
    db.onclose=()=>{store.closed=true;if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('servos:storage-closed',{detail:{reason:'INTERRUPTED'}}))};
    try{await store.transaction(['meta','queue'],'readwrite',async tx=>{
      const saved=await request(tx.objectStore('meta').get('sequence')) as number|undefined;
      if(saved===undefined)await request(tx.objectStore('meta').put(serverSequence,'sequence'));
      else if(serverSequence>saved)throw new Error('Device history is ahead of this browser. Reconcile storage before queueing changes.');
    });return store;}catch(error){db.close();throw error;}
  }
  close(){this.closed=true;this.db.close();}
  private async transaction<T>(stores:string[],mode:IDBTransactionMode,run:(tx:IDBTransaction)=>Promise<T>):Promise<T>{
    if(this.closed)throw new Error('Browser storage is closed. Reopen this ServOS workspace before continuing; do not clear browser data.');
    const tx=this.db.transaction(stores,mode);
    const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('Storage transaction aborted'));tx.onerror=()=>{ /* onabort owns transaction rejection */ }});
    // Attach immediately so a request failure cannot leave an unhandled abort promise.
    void done.catch(()=>undefined);
    try{const result=await run(tx);await done;return result;}catch(error){try{tx.abort()}catch{/* already completed/aborted */}await done.catch(()=>undefined);throw error;}
  }
  async saveDraft(input:Omit<WorkflowDraft,'schemaVersion'|'contractVersion'|'createdAt'|'updatedAt'> & {createdAt?:string}){
    const now=new Date().toISOString();
    const safeFields=input.fields?.map(field=>sensitiveKey.test(field.key)?{...field,value:''}:redactSensitiveData(field) as WorkflowDraftField);
    const safeInputs=Object.fromEntries(Object.entries(input.inputValues).filter(([key])=>!sensitiveKey.test(key)).map(([key,value])=>[key,safeDraftText(value)]));
    const draft:WorkflowDraft={...input,inputValues:safeInputs,fields:safeFields,validationSummary:input.validationSummary.map(safeDraftText),schemaVersion:2,contractVersion:2,payload:redactSensitiveData(input.payload) as Record<string,unknown>,createdAt:input.createdAt||now,updatedAt:now};
    await this.transaction(['drafts'],'readwrite',async tx=>{await request(tx.objectStore('drafts').put(draft))});
  }
  async resumeDraft(id:string):Promise<WorkflowDraft|undefined>{return this.transaction(['drafts'],'readonly',tx=>request(tx.objectStore('drafts').get(id)))}
  async discardDraft(id:string):Promise<void>{await this.transaction(['drafts'],'readwrite',async tx=>{await request(tx.objectStore('drafts').delete(id))})}
  async promoteDraftToCommand(id:string):Promise<BusinessCommandV2>{
    if(typeof navigator!=='undefined'&&!navigator.onLine&&this.commandAuthority!=='API')throw new Error('Offline command execution is available only in an API-authorized workspace. Save the workflow as a draft and reconnect.');
    return this.transaction(['drafts','queue','meta','offlineGrants'],'readwrite',async tx=>{
      const drafts=tx.objectStore('drafts');const draft=await request(drafts.get(id)) as WorkflowDraft|undefined;
      if(!draft)throw new Error('Draft is no longer available; refresh saved work before submitting.');
      const meta=tx.objectStore('meta');const previous=await request(meta.get('sequence')) as number;
      if(!Number.isSafeInteger(previous+1))throw new Error('Device sequence exhausted');
      const offlineGrantId=typeof navigator!=='undefined'&&!navigator.onLine?await this.consumeLocalGrant(tx,draft.operation):undefined;
      const command:BusinessCommandV2={id:crypto.randomUUID(),schemaVersion:2,deviceId:this.deviceId,actorId:this.actorId,operation:draft.operation,...(draft.supersedes?{supersedes:draft.supersedes}:{}),...(offlineGrantId?{offlineGrantId}:{}),payload:draft.payload,expectedVersions:draft.expectedVersions,allocationRefs:[],clientSequence:previous+1,occurredAt:new Date().toISOString()};
      await request(tx.objectStore('queue').add({id:command.id,sequence:command.clientSequence,command,state:'PENDING_SYNC'} satisfies QueuedCommand));
      await request(meta.put(command.clientSequence,'sequence'));await request(drafts.delete(id));return command;
    });
  }
  async enqueue(operation:string,payload:Record<string,unknown>,expectedVersions:RecordVersion[],supersedes?:string,reviewCommandId?:string):Promise<BusinessCommandV2>{
    if(typeof navigator!=='undefined'&&!navigator.onLine&&this.commandAuthority!=='API')throw new Error('Offline command execution is available only in an API-authorized workspace. Save the workflow as a draft and reconnect.');
    return this.transaction(['queue','meta','offlineGrants'],'readwrite',async tx=>{
      if(reviewCommandId){const existing=await request(tx.objectStore('queue').get(reviewCommandId)) as QueuedCommand|undefined;if(existing){if(existing.command.operation!==operation||JSON.stringify(existing.command.payload)!==JSON.stringify(payload)||JSON.stringify(existing.command.expectedVersions)!==JSON.stringify(expectedVersions))throw new Error('Reviewed command changed; recover its original outcome');return existing.command;}}
      const meta=tx.objectStore('meta');const previous=await request(meta.get('sequence')) as number;
      if(!Number.isSafeInteger(previous+1))throw new Error('Device sequence exhausted');
      const offlineGrantId=typeof navigator!=='undefined'&&!navigator.onLine?await this.consumeLocalGrant(tx,operation):undefined;
      const command:BusinessCommandV2={id:reviewCommandId||crypto.randomUUID(),schemaVersion:2,deviceId:this.deviceId,actorId:this.actorId,operation,...(supersedes?{supersedes}:{}),...(offlineGrantId?{offlineGrantId}:{}),payload,expectedVersions,allocationRefs:[],clientSequence:previous+1,occurredAt:new Date().toISOString()};
      await request(tx.objectStore('queue').add({id:command.id,sequence:command.clientSequence,command,state:'PENDING_SYNC'} satisfies QueuedCommand));
      await request(meta.put(command.clientSequence,'sequence'));return command;
    });
  }
  async queue():Promise<QueuedCommand[]>{return this.transaction(['queue'],'readonly',tx=>request(tx.objectStore('queue').index('sequence').getAll()))}
  async acknowledge(result:TransactionResult){
    if(!['SYNCHRONIZED','CONFLICT','REJECTED'].includes(result.status))throw new Error('Invalid server acknowledgement');
    await this.transaction(['queue'],'readwrite',async tx=>{
      const entries=tx.objectStore('queue');const entry=await request(entries.get(result.commandId)) as QueuedCommand|undefined;
      if(!entry)throw new Error('Acknowledgement has no matching command');
      if(entry.result&&stableJson(entry.result)!==stableJson(result))throw new Error('Server changed an acknowledged result');
      const command={...entry.command,payload:redactSensitiveData(entry.command.payload) as Record<string,unknown>};
      await request(entries.put({...entry,command,state:result.status,result}));
    });
  }
  async markOutcomeUnknown(id:string){
    await this.transaction(['queue'],'readwrite',async tx=>{
      const entries=tx.objectStore('queue');const entry=await request(entries.get(id)) as QueuedCommand|undefined;
      if(!entry)throw new Error('Cannot mark an unknown command without its durable queue entry');
      if(entry.state==='PENDING_SYNC'||entry.state==='OUTCOME_UNKNOWN')await request(entries.put({...entry,state:'OUTCOME_UNKNOWN',firstAttemptAt:entry.firstAttemptAt||new Date().toISOString()}));
    });
  }
  async cursor():Promise<number>{return this.transaction(['meta'],'readonly',async tx=>(await request(tx.objectStore('meta').get('cursor')) as number|undefined)||0)}
  async policyVersion():Promise<string|undefined>{return this.transaction(['meta'],'readonly',tx=>request(tx.objectStore('meta').get('policyVersion')))}
  async pendingBootstrap():Promise<BootstrapStageState|undefined>{return this.transaction(['meta'],'readonly',tx=>request(tx.objectStore('meta').get('bootstrapStage')))}
  async beginBootstrap(snapshotId:string,expiresAt:string,policyVersion:string,manifest:BootstrapManifest):Promise<number>{
    if(this.commandAuthority!=='API'||snapshotId!==manifest.snapshotId||expiresAt!==manifest.expiresAt||!policyVersion)throw new Error('Invalid API bootstrap staging request');
    return this.transaction(['meta','queue','bootstrapStage'],'readwrite',async tx=>{
      const queued=await request(tx.objectStore('queue').getAll()) as QueuedCommand[];
      if(queued.some(entry=>entry.state==='PENDING_SYNC'||entry.state==='OUTCOME_UNKNOWN'))throw new Error('Recover saved API command outcomes before rebuilding this projection.');
      const meta=tx.objectStore('meta'),previous=await request(meta.get('bootstrapStage')) as BootstrapStageState|undefined;
      if(previous&&previous.snapshotId===snapshotId&&previous.policyVersion===policyVersion&&previous.manifest.sha256===manifest.sha256&&previous.expiresAt===expiresAt)return previous.nextOrdinal;
      await request(tx.objectStore('bootstrapStage').clear());
      const state:BootstrapStageState={snapshotId,expiresAt,policyVersion,manifest,nextOrdinal:0,collectionCounts:{}};
      await request(meta.put(state,'bootstrapStage'));return 0;
    });
  }
  async stageBootstrapPage(snapshotId:string,afterOrdinal:number,records:Array<RecordVersion & {data:Record<string,unknown>;archived:boolean}>):Promise<number>{
    if(!Array.isArray(records))throw new Error('Invalid API bootstrap page');
    return this.transaction(['meta','bootstrapStage'],'readwrite',async tx=>{
      const meta=tx.objectStore('meta'),state=await request(meta.get('bootstrapStage')) as BootstrapStageState|undefined;
      if(!state||state.snapshotId!==snapshotId||state.nextOrdinal!==afterOrdinal||Date.parse(state.expiresAt)<=Date.now())throw new Error('API bootstrap staging state changed or expired.');
      const expected=Math.min(state.manifest.pageSize,state.manifest.recordCount-afterOrdinal);
      if(afterOrdinal<0||afterOrdinal>=state.manifest.recordCount||records.length!==expected)throw new Error('API bootstrap page length does not match the manifest.');
      const stage=tx.objectStore('bootstrapStage'),counts={...state.collectionCounts};
      for(let index=0;index<records.length;index++){
        const record=records[index];
        if(!record.collection||!record.id||!Number.isSafeInteger(record.version)||record.version<1||!record.data||typeof record.data!=='object'||Array.isArray(record.data)||typeof record.archived!=='boolean')throw new Error('API bootstrap page contains an invalid record.');
        await request(stage.add({snapshotId,ordinal:afterOrdinal+index,record}));counts[record.collection]=(counts[record.collection]||0)+1;
      }
      const nextOrdinal=afterOrdinal+records.length;await request(meta.put({...state,nextOrdinal,collectionCounts:counts},'bootstrapStage'));return nextOrdinal;
    });
  }
  async stagedBootstrapPage(snapshotId:string,afterOrdinal:number,pageSize:number):Promise<Array<RecordVersion & {data:Record<string,unknown>;archived:boolean}>>{
    return this.transaction(['meta','bootstrapStage'],'readonly',async tx=>{
      const state=await request(tx.objectStore('meta').get('bootstrapStage')) as BootstrapStageState|undefined;
      if(!state||state.snapshotId!==snapshotId||!Number.isSafeInteger(afterOrdinal)||afterOrdinal<0||!Number.isSafeInteger(pageSize)||pageSize<1||afterOrdinal>=state.nextOrdinal)throw new Error('API bootstrap staged page is unavailable.');
      const end=Math.min(afterOrdinal+pageSize,state.nextOrdinal),rows=await request(tx.objectStore('bootstrapStage').getAll(IDBKeyRange.bound([snapshotId,afterOrdinal],[snapshotId,end-1]))) as Array<{snapshotId:string;ordinal:number;record:RecordVersion & {data:Record<string,unknown>;archived:boolean}}>;
      if(rows.length!==end-afterOrdinal||rows.some((row,index)=>row.snapshotId!==snapshotId||row.ordinal!==afterOrdinal+index))throw new Error('API bootstrap staged page is incomplete.');
      return rows.map(row=>row.record);
    });
  }
  async clearBootstrapStage(snapshotId?:string):Promise<void>{
    await this.transaction(['meta','bootstrapStage'],'readwrite',async tx=>{
      const meta=tx.objectStore('meta'),state=await request(meta.get('bootstrapStage')) as BootstrapStageState|undefined;
      if(snapshotId&&state?.snapshotId!==snapshotId)return;
      await request(tx.objectStore('bootstrapStage').clear());await request(meta.delete('bootstrapStage'));
    });
  }
  async activateBootstrap(snapshotId:string):Promise<void>{
    await this.transaction(['records','meta','queue','bootstrapStage'],'readwrite',async tx=>{
      const meta=tx.objectStore('meta'),state=await request(meta.get('bootstrapStage')) as BootstrapStageState|undefined;
      if(!state||state.snapshotId!==snapshotId||state.nextOrdinal!==state.manifest.recordCount||Date.parse(state.expiresAt)<=Date.now())throw new Error('API bootstrap snapshot is incomplete or expired.');
      const queued=await request(tx.objectStore('queue').getAll()) as QueuedCommand[];
      if(queued.some(entry=>entry.state==='PENDING_SYNC'||entry.state==='OUTCOME_UNKNOWN'))throw new Error('Recover saved API command outcomes before rebuilding this projection.');
      const keys=Object.keys(state.collectionCounts),expectedKeys=Object.keys(state.manifest.collectionCounts);
      if(keys.length!==expectedKeys.length||keys.some(key=>state.collectionCounts[key]!==state.manifest.collectionCounts[key]))throw new Error('API bootstrap collection counts do not match the manifest.');
      const currentCursor=(await request(meta.get('cursor')) as number|undefined)||0;
      if(state.manifest.highWaterCursor<currentCursor)throw new Error('API bootstrap snapshot is older than this browser projection.');
      const stage=tx.objectStore('bootstrapStage');
      const rows=await request(stage.getAll(IDBKeyRange.bound([snapshotId,0],[snapshotId,Number.MAX_SAFE_INTEGER]))) as Array<{snapshotId:string;ordinal:number;record:RecordVersion & {data:Record<string,unknown>;archived:boolean}}>
      if(rows.length!==state.manifest.recordCount||rows.some((row,index)=>row.snapshotId!==snapshotId||row.ordinal!==index))throw new Error('API bootstrap staged record sequence is incomplete.');
      const target=tx.objectStore('records');await request(target.clear());
      for(const row of rows)await request(target.put(row.record));
      await request(meta.put(state.manifest.highWaterCursor,'cursor'));await request(meta.put(state.policyVersion,'policyVersion'));
      await request(stage.clear());await request(meta.delete('bootstrapStage'));
    });
  }
  async replaceSnapshot(records:Array<RecordVersion & {data:Record<string,unknown>;archived:boolean}>,cursor:number,policyVersion:string){
    if(!Array.isArray(records)||!Number.isSafeInteger(cursor)||cursor<0||!policyVersion)throw new Error('Invalid authorized snapshot');
    await this.transaction(['records','meta','queue'],'readwrite',async tx=>{
      const currentCursor=(await request(tx.objectStore('meta').get('cursor')) as number|undefined)||0;
      if(cursor<currentCursor)throw new Error('Snapshot is older than this browser projection. Refresh from the current API authority.');
      if(this.commandAuthority==='API'){
        const queued=await request(tx.objectStore('queue').getAll()) as QueuedCommand[];
        if(queued.some(entry=>entry.state==='PENDING_SYNC'||entry.state==='OUTCOME_UNKNOWN'))throw new Error('Recover saved API command outcomes before rebuilding this projection.');
      }
      const target=tx.objectStore('records');await request(target.clear());
      for(const record of records){
        if(!record.collection||!record.id||!Number.isSafeInteger(record.version)||record.version<1||!record.data||typeof record.data!=='object'||Array.isArray(record.data)||typeof record.archived!=='boolean')throw new Error('Invalid snapshot record');
        await request(target.add(record));
      }
      await request(tx.objectStore('meta').put(cursor,'cursor'));
      await request(tx.objectStore('meta').put(policyVersion,'policyVersion'));
    });
  }
  async drafts():Promise<WorkflowDraft[]>{return this.transaction(['drafts'],'readonly',tx=>request(tx.objectStore('drafts').getAll()))}
  async applyPage(page:ChangePage){
    if(!page||!Array.isArray(page.changes)||typeof page.hasMore!=='boolean')throw new Error('Invalid change page');
    if(page.highWater!==undefined&&(!Number.isSafeInteger(page.highWater)||page.highWater<page.cursor))throw new Error('Change page exceeds its authoritative high-water cursor');
    if(page.highWater!==undefined&&page.hasMore!==(page.cursor<page.highWater))throw new Error('Change page continuation disagrees with its high-water cursor');
    await this.transaction(['records','meta'],'readwrite',async tx=>{
      const meta=tx.objectStore('meta');let cursor=(await request(meta.get('cursor')) as number|undefined)||0;
      if(!Number.isSafeInteger(page.cursor)||page.cursor<0)throw new Error('Invalid change cursor');
      if(page.cursor<cursor)return;
      const records=tx.objectStore('records');
      for(const change of page.changes){
        if(!Number.isSafeInteger(change.sequence)||change.sequence<1||!Array.isArray(change.records)||typeof change.commandId!=='string'||!change.commandId)throw new Error('Invalid ordered change entry');
        if(change.sequence<=cursor)continue;
        if(change.sequence!==cursor+1)throw new Error('Change-feed sequence gap; page retained for retry');
        for(const record of change.records){
          if(!record.collection||!record.id||!Number.isSafeInteger(record.version)||record.version<1||!record.data||typeof record.data!=='object'||Array.isArray(record.data)||typeof record.archived!=='boolean')throw new Error('Invalid record version or projection');
          const previous=await request(records.get([record.collection,record.id]));
          if(previous&&previous.version>=record.version)throw new Error('Non-increasing record version');
          await request(records.put(record));
        }
        cursor=change.sequence;
      }
      if(cursor!==page.cursor)throw new Error('Cursor does not match received changes');
      await request(meta.put(cursor,'cursor'));
    });
  }
  async records():Promise<Array<RecordVersion & {data:Record<string,unknown>;archived:boolean}>>{return this.transaction(['records'],'readonly',tx=>request(tx.objectStore('records').getAll()))}
  async hasPending():Promise<boolean>{return (await this.queue()).some(entry=>entry.state==='PENDING_SYNC'||entry.state==='OUTCOME_UNKNOWN')}
  async recoveryEvidence(){
    return this.transaction(['records','queue','drafts','meta','documents','printJobs','printEvents'],'readonly',async tx=>{
      const read=(name:string)=>request(tx.objectStore(name).getAll());
      const [records,commands,drafts,documents,printJobs,printEvents,cursor,sequence]=await Promise.all([
        read('records'),read('queue'),read('drafts'),read('documents'),read('printJobs'),read('printEvents'),
        request(tx.objectStore('meta').get('cursor')),request(tx.objectStore('meta').get('sequence')),
      ]);
      return redactSensitiveData({format:'servos-recovery-evidence',version:1,exportedAt:new Date().toISOString(),
        businessId:this.scope,deviceId:this.deviceId,staffId:this.actorId,authority:this.commandAuthority,
        purpose:'Reconciliation evidence only. Redacted payloads must not be replayed or imported as commands.',
        cursor:cursor||0,sequence:sequence||0,records,commands,drafts,documents,printJobs,printEvents});
    });
  }
  async guidanceProgress():Promise<import('./session').WebGuidanceProgress[]>{
    return this.transaction(['meta'],'readonly',async tx=>(await request(tx.objectStore('meta').get('guidanceProgress')))||[]);
  }
  async saveGuidanceProgress(progress:import('./session').WebGuidanceProgress){
    return this.transaction(['meta'],'readwrite',async tx=>{
      const meta=tx.objectStore('meta');const rows=(await request(meta.get('guidanceProgress'))||[]) as import('./session').WebGuidanceProgress[];
      const saved={...progress,updatedAt:new Date().toISOString()};
      await request(meta.put([saved,...rows.filter(row=>row.guideId!==progress.guideId)],'guidanceProgress'));
      return saved;
    });
  }
  async saveVerifiedOfflineGrant(grant:OfflineGrantEnvelope,verify:(grant:OfflineGrantEnvelope)=>Promise<boolean>):Promise<void>{
    const issued=Date.parse(grant.issuedAt),expires=Date.parse(grant.expiresAt);
    if(!grant.grantId||grant.policyVersion!==1||!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued||!Number.isSafeInteger(grant.usedCommands??0)||(grant.usedCommands??0)<0||(grant.usedCommands??0)>grant.maxCommands)throw new Error('Offline grant metadata is invalid');
    if(grant.businessId!==this.scope||grant.deviceId!==this.deviceId||grant.staffId!==this.actorId)throw new Error('Offline grant is scoped to a different business, device, or staff member');
    if(Date.parse(grant.expiresAt)<=Date.now()||Date.parse(grant.issuedAt)>Date.now()||!Number.isSafeInteger(grant.maxCommands)||grant.maxCommands<1||grant.maxCommands>100||!Array.isArray(grant.allowedCommands)||!grant.allowedCommands.length||new Set(grant.allowedCommands).size!==grant.allowedCommands.length)throw new Error('Offline grant is expired or invalid');
    if(!(await verify(grant)))throw new Error('Offline grant signature could not be verified');
    await this.transaction(['offlineGrants'],'readwrite',async tx=>{
      const grants=tx.objectStore('offlineGrants');const existing=await request(grants.get(grant.grantId)) as OfflineGrantEnvelope|undefined;
      if(existing){
        const signed=(value:OfflineGrantEnvelope)=>{const {usedCommands,...rest}=value;return stableJson(rest)};
        if(signed(existing)!==signed(grant))throw new Error('Offline grant ID is already bound to different authorization');
      }
      const usedCommands=Math.max(existing?.usedCommands??0,grant.usedCommands??0);
      if(!Number.isSafeInteger(usedCommands)||usedCommands<0||usedCommands>grant.maxCommands)throw new Error('Offline grant quota requires reconciliation');
      await request(grants.put({...grant,usedCommands}));
    });
  }
  async hasOfflineAuthorization(operation:string):Promise<boolean>{
    if(this.commandAuthority!=='API')return false;
    const grants=await this.offlineGrants();const now=Date.now();return grants.some(grant=>this.offlineGrantEligible(grant,operation,now));
  }
  private offlineGrantEligible(grant:OfflineGrantEnvelope,operation:string,now:number):boolean{
    if(this.commandAuthority!=='API'||!['product.save','stockItem.save','stockLocation.save','order.offlineCashSale'].includes(operation))return false;
    if(!grant||grant.policyVersion!==1||typeof grant.grantId!=='string'||!grant.grantId||typeof grant.signature!=='string'||!grant.signature||typeof grant.keyVersion!=='string'||!grant.keyVersion)return false;
    const issued=Date.parse(grant.issuedAt),expires=Date.parse(grant.expiresAt),used=grant.usedCommands??0;
    return grant.businessId===this.scope&&grant.deviceId===this.deviceId&&grant.staffId===this.actorId
      &&Number.isFinite(issued)&&Number.isFinite(expires)&&issued<=now&&expires>now&&expires>issued
      &&Number.isSafeInteger(grant.maxCommands)&&grant.maxCommands>=1&&grant.maxCommands<=100
      &&Number.isSafeInteger(used)&&used>=0&&used<grant.maxCommands
      &&Array.isArray(grant.allowedCommands)&&grant.allowedCommands.every(name=>typeof name==='string')
      &&new Set(grant.allowedCommands).size===grant.allowedCommands.length&&grant.allowedCommands.includes(operation);
  }
  async offlineGrants():Promise<OfflineGrantEnvelope[]>{return this.transaction(['offlineGrants'],'readonly',tx=>request(tx.objectStore('offlineGrants').getAll()))}
  private async consumeLocalGrant(tx:IDBTransaction,operation:string):Promise<string>{
    const grants=tx.objectStore('offlineGrants');const candidates=await request(grants.getAll()) as OfflineGrantEnvelope[];
    const now=Date.now();const grant=candidates.filter(item=>this.offlineGrantEligible(item,operation,now)).sort((a,b)=>Date.parse(a.expiresAt)-Date.parse(b.expiresAt))[0];
    if(!grant)throw new Error(`No active offline grant authorizes ${operation}. Save this workflow as a draft and reconnect.`);
    await request(grants.put({...grant,usedCommands:(grant.usedCommands||0)+1}));return grant.grantId;
  }
  async saveBusinessDocument(document:LocalBusinessDocument):Promise<void>{
    if(!document.id||!document.type||!document.documentNumber||!Number.isSafeInteger(document.layoutVersion)||document.layoutVersion<1||!document.hash||!document.issuedAt)throw new Error('Business document snapshot is incomplete');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson({id:document.id,type:document.type,documentNumber:document.documentNumber,layoutVersion:document.layoutVersion,snapshot:document.snapshot,issuedAt:document.issuedAt})));
    const actualHash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(document.hash!==actualHash)throw new Error('Business document hash does not match its immutable snapshot');
    await this.transaction(['documents'],'readwrite',async tx=>{
      const documents=tx.objectStore('documents');const existing=await request(documents.get(document.id)) as LocalBusinessDocument|undefined;
      if(existing&&(existing.hash!==document.hash||existing.layoutVersion!==document.layoutVersion||stableJson(existing.snapshot)!==stableJson(document.snapshot)))throw new Error('Issued business documents are immutable');
      if(!existing)await request(documents.add(document));
    });
  }
  async businessDocuments():Promise<LocalBusinessDocument[]>{return this.transaction(['documents'],'readonly',tx=>request(tx.objectStore('documents').getAll()))}
  async enqueuePrintJob(job:Omit<LocalPrintJob,'state'|'createdAt'|'updatedAt'|'attempt'>):Promise<LocalPrintJob>{
    if(!job.id||!job.documentId||!job.printerRole||!Number.isSafeInteger(job.copies)||job.copies<1||job.copies>5)throw new Error('Print job request is invalid');
    return this.transaction(['printJobs','documents','printEvents'],'readwrite',async tx=>{
      if(!await request(tx.objectStore('documents').get(job.documentId)))throw new Error('Print job must reference an issued BusinessDocument');
      const jobs=tx.objectStore('printJobs');const old=await request(jobs.get(job.id)) as LocalPrintJob|undefined;
      if(old){if(old.documentId!==job.documentId||old.printerRole!==job.printerRole||old.copies!==job.copies)throw new Error('Print job ID is already bound to a different document request');return old;}
      const now=new Date().toISOString();const next:LocalPrintJob={...job,state:'QUEUED',createdAt:now,updatedAt:now,attempt:0};await request(jobs.add(next));
      await request(tx.objectStore('printEvents').add({id:crypto.randomUUID(),jobId:job.id,documentId:job.documentId,fromState:null,toState:'QUEUED',attempt:0,actorId:this.actorId,deviceId:this.deviceId,occurredAt:now}));return next;
    });
  }
  async transitionPrintJob(id:string,state:LocalPrintState,confirmedPossibleDuplicate=false,errorCode?:string):Promise<LocalPrintJob>{
    return this.transaction(['printJobs','printEvents'],'readwrite',async tx=>{
      const jobs=tx.objectStore('printJobs');const current=await request(jobs.get(id)) as LocalPrintJob|undefined;if(!current)throw new Error('Print job was not found');
      const allowed:Record<LocalPrintState,LocalPrintState[]>={QUEUED:['SENDING','CANCELLED'],SENDING:['SENT_TO_SPOOLER','DELIVERY_UNCERTAIN','FAILED'],SENT_TO_SPOOLER:[],DELIVERY_UNCERTAIN:['SENDING','CANCELLED'],FAILED:['SENDING','CANCELLED'],CANCELLED:[]};
      if(!allowed[current.state].includes(state))throw new Error(`Invalid print transition ${current.state} to ${state}`);
      if(current.state==='DELIVERY_UNCERTAIN'&&state==='SENDING'&&!confirmedPossibleDuplicate)throw new Error('Confirm the document may already have printed before retrying');
      const next={...current,state,updatedAt:new Date().toISOString(),attempt:current.attempt+(state==='SENDING'?1:0),...(errorCode?{errorCode}:{})};await request(jobs.put(next));
      await request(tx.objectStore('printEvents').add({id:crypto.randomUUID(),jobId:id,documentId:current.documentId,fromState:current.state,toState:state,attempt:next.attempt,actorId:this.actorId,deviceId:this.deviceId,occurredAt:next.updatedAt,confirmedPossibleDuplicate,errorCode:errorCode||null}));return next;
    });
  }
  async hasUnresolvedPrintDelivery():Promise<boolean>{
    return this.transaction(['printJobs','records'],'readonly',async tx=>{
      const local=await request(tx.objectStore('printJobs').getAll()) as LocalPrintJob[];
      const records=await request(tx.objectStore('records').getAll()) as Array<RecordVersion & {data:Record<string,unknown>}>;
      return local.some(job=>job.state==='SENDING'||job.state==='DELIVERY_UNCERTAIN')||records.some(record=>record.collection==='printJobs'&&record.data.claimedDeviceId===this.deviceId&&['SENDING','SENT_TO_SPOOLER','DELIVERY_UNCERTAIN'].includes(String(record.data.state)));
    });
  }
  async printJobs():Promise<LocalPrintJob[]>{return this.transaction(['printJobs'],'readonly',tx=>request(tx.objectStore('printJobs').getAll()))}
  async storageDiagnostics(){
    const estimate=await navigator.storage?.estimate?.().catch(()=>undefined);const persisted=await navigator.storage?.persisted?.().catch(()=>null)??null;
    const [queue,grants,jobs,documents]=await Promise.all([this.queue(),this.offlineGrants(),this.printJobs(),this.businessDocuments()]);
    return {persisted,usageBytes:estimate?.usage??null,quotaBytes:estimate?.quota??null,pendingCommands:queue.filter(row=>row.state==='PENDING_SYNC'||row.state==='OUTCOME_UNKNOWN').length,unknownCommands:queue.filter(row=>row.state==='OUTCOME_UNKNOWN').length,offlineGrants:grants.filter(grant=>Date.parse(grant.expiresAt)>Date.now()).length,pendingPrintJobs:jobs.filter(job=>['QUEUED','SENDING','DELIVERY_UNCERTAIN'].includes(job.state)).length,documents:documents.length};
  }
}
