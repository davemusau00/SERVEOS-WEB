import type {BusinessCommandV2,ChangePage,RecordVersion,TransactionResult} from '../../types/transactions';

export interface QueuedCommand {id:string; sequence:number; command:BusinessCommandV2; state:'PENDING_SYNC'|'OUTCOME_UNKNOWN'|'SYNCHRONIZED'|'CONFLICT'|'REJECTED'; result?:TransactionResult; firstAttemptAt?:string}
export interface WorkflowDraftField {key:string;label:string;type?:'text'|'number'|'money'|'datetime-local'|'select';options?:Array<{value:string;label:string}>;value?:string;optional?:boolean}
export interface WorkflowDraft {
  id:string; schemaVersion:2; contractVersion:2; operation:string; collection:string; targetId:string;
  editorKind:string; inputValues:Record<string,string>; payload:Record<string,unknown>; expectedVersions:RecordVersion[]; fields?:WorkflowDraftField[];
  supersedes?:string; policyVersion?:string; validationSummary:string[]; requiresReview:boolean; createdAt:string; updatedAt:string;
}
const request=<T>(value:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error||new Error('Storage request failed'))});
const sensitiveKey=/password|secret|token|credential|pin/i;
const safeDraftText=(value:string)=>value.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,'Bearer [redacted]').replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted token]');
export const redactSensitiveData=(value:unknown):unknown=>Array.isArray(value)?value.map(redactSensitiveData):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([name])=>!sensitiveKey.test(name)).map(([name,item])=>[name,redactSensitiveData(item)])):typeof value==='string'?safeDraftText(value):value;

/** Staged v2 store. Enqueuing master edits does not claim an offline sale commit. */
export class BusinessStore {
  private constructor(private db:IDBDatabase,readonly scope:string,readonly deviceId:string,readonly actorId:string){}
  static async open(scope:string,deviceId:string,actorId:string,serverSequence=0):Promise<BusinessStore>{
    if(!scope||!deviceId||!actorId||!Number.isSafeInteger(serverSequence)||serverSequence<0)throw new Error('Valid business, device, actor and sequence are required');
    const opening=indexedDB.open(`servos-v2:${scope}:${deviceId}:${actorId}`,2);
    opening.onupgradeneeded=()=>{
      const db=opening.result;
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');
      if(!db.objectStoreNames.contains('queue')){const queue=db.createObjectStore('queue',{keyPath:'id'});queue.createIndex('sequence','sequence',{unique:true});}
      if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:['collection','id']});
      if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});
    };
    const db=await request(opening);db.onversionchange=()=>db.close();
    const store=new BusinessStore(db,scope,deviceId,actorId);
    try{await store.transaction(['meta','queue'],'readwrite',async tx=>{
      const saved=await request(tx.objectStore('meta').get('sequence')) as number|undefined;
      if(saved===undefined)await request(tx.objectStore('meta').put(serverSequence,'sequence'));
      else if(serverSequence>saved)throw new Error('Device history is ahead of this browser. Reconcile storage before queueing changes.');
    });return store;}catch(error){db.close();throw error;}
  }
  close(){this.db.close();}
  private async transaction<T>(stores:string[],mode:IDBTransactionMode,run:(tx:IDBTransaction)=>Promise<T>):Promise<T>{
    const tx=this.db.transaction(stores,mode);
    const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('Storage transaction aborted'));tx.onerror=()=>{ /* onabort owns transaction rejection */ }});
    // Attach immediately so a request failure cannot leave an unhandled abort promise.
    void done.catch(()=>undefined);
    try{const result=await run(tx);await done;return result;}catch(error){try{tx.abort()}catch{/* already completed/aborted */}await done.catch(()=>undefined);throw error;}
  }
  private requireOnline(){if(typeof navigator==='undefined'||!navigator.onLine)throw new Error('Business v2 submission requires an online connection. Save the workflow as a draft to continue offline.')}
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
    this.requireOnline();
    return this.transaction(['drafts','queue','meta'],'readwrite',async tx=>{
      const drafts=tx.objectStore('drafts');const draft=await request(drafts.get(id)) as WorkflowDraft|undefined;
      if(!draft)throw new Error('Draft is no longer available; refresh saved work before submitting.');
      const meta=tx.objectStore('meta');const previous=await request(meta.get('sequence')) as number;
      this.requireOnline();
      if(!Number.isSafeInteger(previous+1))throw new Error('Device sequence exhausted');
      const command:BusinessCommandV2={id:crypto.randomUUID(),schemaVersion:2,deviceId:this.deviceId,actorId:this.actorId,operation:draft.operation,...(draft.supersedes?{supersedes:draft.supersedes}:{}),payload:draft.payload,expectedVersions:draft.expectedVersions,allocationRefs:[],clientSequence:previous+1,occurredAt:new Date().toISOString()};
      await request(tx.objectStore('queue').add({id:command.id,sequence:command.clientSequence,command,state:'PENDING_SYNC'} satisfies QueuedCommand));
      await request(meta.put(command.clientSequence,'sequence'));await request(drafts.delete(id));return command;
    });
  }
  async enqueue(operation:string,payload:Record<string,unknown>,expectedVersions:RecordVersion[],supersedes?:string):Promise<BusinessCommandV2>{
    this.requireOnline();
    return this.transaction(['queue','meta'],'readwrite',async tx=>{
      const meta=tx.objectStore('meta');const previous=await request(meta.get('sequence')) as number;
      this.requireOnline();
      if(!Number.isSafeInteger(previous+1))throw new Error('Device sequence exhausted');
      const command:BusinessCommandV2={id:crypto.randomUUID(),schemaVersion:2,deviceId:this.deviceId,actorId:this.actorId,operation,...(supersedes?{supersedes}:{}),payload,expectedVersions,allocationRefs:[],clientSequence:previous+1,occurredAt:new Date().toISOString()};
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
      if(entry.result&&JSON.stringify(entry.result)!==JSON.stringify(result))throw new Error('Server changed an acknowledged result');
      await request(entries.put({...entry,state:result.status,result}));
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
  async replaceSnapshot(records:Array<RecordVersion & {data:Record<string,unknown>;archived:boolean}>,cursor:number,policyVersion:string){
    if(!Number.isSafeInteger(cursor)||cursor<0||!policyVersion)throw new Error('Invalid authorized snapshot');
    await this.transaction(['records','meta'],'readwrite',async tx=>{
      const target=tx.objectStore('records');await request(target.clear());
      for(const record of records){
        if(!record.collection||!record.id||!Number.isSafeInteger(record.version)||record.version<1)throw new Error('Invalid snapshot record');
        await request(target.add(record));
      }
      await request(tx.objectStore('meta').put(cursor,'cursor'));
      await request(tx.objectStore('meta').put(policyVersion,'policyVersion'));
    });
  }
  async drafts():Promise<WorkflowDraft[]>{return this.transaction(['drafts'],'readonly',tx=>request(tx.objectStore('drafts').getAll()))}
  async applyPage(page:ChangePage){
    await this.transaction(['records','meta'],'readwrite',async tx=>{
      const meta=tx.objectStore('meta');let cursor=(await request(meta.get('cursor')) as number|undefined)||0;
      if(!Number.isSafeInteger(page.cursor)||page.cursor<0)throw new Error('Invalid change cursor');
      if(page.cursor<cursor)return;
      const records=tx.objectStore('records');
      for(const change of page.changes){
        if(change.sequence<=cursor)continue;
        if(change.sequence!==cursor+1)throw new Error('Change-feed sequence gap; page retained for retry');
        for(const record of change.records){
          if(!record.collection||!record.id||!Number.isSafeInteger(record.version)||record.version<1)throw new Error('Invalid record version');
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
}
