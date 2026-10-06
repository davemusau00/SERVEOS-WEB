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
export type CommandAuthority='SUPABASE'|'API';
const request=<T>(value:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error||new Error('Storage request failed'))});
const stableJson=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${stableJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
const sensitiveKey=/password|secret|token|credential|pin/i;
const safeDraftText=(value:string)=>value.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,'Bearer [redacted]').replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted token]');
export const redactSensitiveData=(value:unknown):unknown=>Array.isArray(value)?value.map(redactSensitiveData):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([name])=>!sensitiveKey.test(name)).map(([name,item])=>[name,redactSensitiveData(item)])):typeof value==='string'?safeDraftText(value):value;

/** Staged v2 store. Enqueuing master edits does not claim an offline sale commit. */
export class BusinessStore {
  private constructor(private db:IDBDatabase,readonly scope:string,readonly deviceId:string,readonly actorId:string,readonly commandAuthority:CommandAuthority){}
  static async open(scope:string,deviceId:string,actorId:string,serverSequence=0,commandAuthority:CommandAuthority='SUPABASE'):Promise<BusinessStore>{
    if(!scope||!deviceId||!actorId||!Number.isSafeInteger(serverSequence)||serverSequence<0)throw new Error('Valid business, device, actor and sequence are required');
    const databaseName=commandAuthority==='API'?`servos-api-v1:${scope}:${deviceId}:${actorId}`:`servos-v2:${scope}:${deviceId}:${actorId}`;
    const opening=indexedDB.open(databaseName,3);
    opening.onupgradeneeded=()=>{
      const db=opening.result;
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');
      if(!db.objectStoreNames.contains('queue')){const queue=db.createObjectStore('queue',{keyPath:'id'});queue.createIndex('sequence','sequence',{unique:true});}
      if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:['collection','id']});
      if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});
      if(!db.objectStoreNames.contains('offlineGrants'))db.createObjectStore('offlineGrants',{keyPath:'grantId'});
      if(!db.objectStoreNames.contains('documents'))db.createObjectStore('documents',{keyPath:'id'});
      if(!db.objectStoreNames.contains('printJobs')){const jobs=db.createObjectStore('printJobs',{keyPath:'id'});jobs.createIndex('state','state',{unique:false});jobs.createIndex('createdAt','createdAt',{unique:false});}
    };
    const db=await request(opening);db.onversionchange=()=>db.close();
    if(!['SUPABASE','API'].includes(commandAuthority)){db.close();throw new Error('Unsupported command authority')}
    const store=new BusinessStore(db,scope,deviceId,actorId,commandAuthority);
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
  async saveVerifiedOfflineGrant(grant:OfflineGrantEnvelope,verify:(grant:OfflineGrantEnvelope)=>Promise<boolean>):Promise<void>{
    if(grant.businessId!==this.scope||grant.deviceId!==this.deviceId||grant.staffId!==this.actorId)throw new Error('Offline grant is scoped to a different business, device, or staff member');
    if(Date.parse(grant.expiresAt)<=Date.now()||Date.parse(grant.issuedAt)>Date.now()||!Number.isSafeInteger(grant.maxCommands)||grant.maxCommands<1||grant.maxCommands>100||!Array.isArray(grant.allowedCommands)||!grant.allowedCommands.length||new Set(grant.allowedCommands).size!==grant.allowedCommands.length)throw new Error('Offline grant is expired or invalid');
    if(!(await verify(grant)))throw new Error('Offline grant signature could not be verified');
    await this.transaction(['offlineGrants'],'readwrite',async tx=>{await request(tx.objectStore('offlineGrants').put(grant))});
  }
  async hasOfflineAuthorization(operation:string):Promise<boolean>{
    if(this.commandAuthority!=='API')return false;
    const grants=await this.offlineGrants();const now=Date.now();return grants.some(grant=>grant.businessId===this.scope&&grant.deviceId===this.deviceId&&grant.staffId===this.actorId&&Date.parse(grant.issuedAt)<=now&&Date.parse(grant.expiresAt)>now&&grant.allowedCommands.includes(operation)&&(grant.usedCommands||0)<grant.maxCommands);
  }
  async offlineGrants():Promise<OfflineGrantEnvelope[]>{return this.transaction(['offlineGrants'],'readonly',tx=>request(tx.objectStore('offlineGrants').getAll()))}
  private async consumeLocalGrant(tx:IDBTransaction,operation:string):Promise<string>{
    const grants=tx.objectStore('offlineGrants');const candidates=await request(grants.getAll()) as OfflineGrantEnvelope[];
    const now=Date.now();const grant=candidates.filter(item=>item.businessId===this.scope&&item.deviceId===this.deviceId&&item.staffId===this.actorId&&Date.parse(item.issuedAt)<=now&&Date.parse(item.expiresAt)>now&&item.allowedCommands.includes(operation)&&(item.usedCommands||0)<item.maxCommands).sort((a,b)=>Date.parse(a.expiresAt)-Date.parse(b.expiresAt))[0];
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
    return this.transaction(['printJobs','documents'],'readwrite',async tx=>{
      if(!await request(tx.objectStore('documents').get(job.documentId)))throw new Error('Print job must reference an issued BusinessDocument');
      const jobs=tx.objectStore('printJobs');const old=await request(jobs.get(job.id)) as LocalPrintJob|undefined;
      if(old){if(old.documentId!==job.documentId||old.printerRole!==job.printerRole||old.copies!==job.copies)throw new Error('Print job ID is already bound to a different document request');return old;}
      const now=new Date().toISOString();const next:LocalPrintJob={...job,state:'QUEUED',createdAt:now,updatedAt:now,attempt:0};await request(jobs.add(next));return next;
    });
  }
  async transitionPrintJob(id:string,state:LocalPrintState,confirmedPossibleDuplicate=false,errorCode?:string):Promise<LocalPrintJob>{
    return this.transaction(['printJobs'],'readwrite',async tx=>{
      const jobs=tx.objectStore('printJobs');const current=await request(jobs.get(id)) as LocalPrintJob|undefined;if(!current)throw new Error('Print job was not found');
      const allowed:Record<LocalPrintState,LocalPrintState[]>={QUEUED:['SENDING','CANCELLED'],SENDING:['SENT_TO_SPOOLER','DELIVERY_UNCERTAIN','FAILED'],SENT_TO_SPOOLER:[],DELIVERY_UNCERTAIN:['SENDING','CANCELLED'],FAILED:['SENDING','CANCELLED'],CANCELLED:[]};
      if(!allowed[current.state].includes(state))throw new Error(`Invalid print transition ${current.state} to ${state}`);
      if(current.state==='DELIVERY_UNCERTAIN'&&state==='SENDING'&&!confirmedPossibleDuplicate)throw new Error('Confirm the document may already have printed before retrying');
      const next={...current,state,updatedAt:new Date().toISOString(),attempt:current.attempt+(state==='SENDING'?1:0),...(errorCode?{errorCode}:{})};await request(jobs.put(next));return next;
    });
  }
  async printJobs():Promise<LocalPrintJob[]>{return this.transaction(['printJobs'],'readonly',tx=>request(tx.objectStore('printJobs').getAll()))}
  async storageDiagnostics(){
    const estimate=await navigator.storage?.estimate?.().catch(()=>undefined);const persisted=await navigator.storage?.persisted?.().catch(()=>false)??false;
    const [queue,grants,jobs,documents]=await Promise.all([this.queue(),this.offlineGrants(),this.printJobs(),this.businessDocuments()]);
    return {persisted,usageBytes:estimate?.usage??null,quotaBytes:estimate?.quota??null,pendingCommands:queue.filter(row=>row.state==='PENDING_SYNC'||row.state==='OUTCOME_UNKNOWN').length,unknownCommands:queue.filter(row=>row.state==='OUTCOME_UNKNOWN').length,offlineGrants:grants.filter(grant=>Date.parse(grant.expiresAt)>Date.now()).length,pendingPrintJobs:jobs.filter(job=>['QUEUED','SENDING','DELIVERY_UNCERTAIN'].includes(job.state)).length,documents:documents.length};
  }
}
