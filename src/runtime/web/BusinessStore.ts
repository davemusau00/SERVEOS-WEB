import type {BusinessCommandV2,ChangePage,RecordVersion,TransactionResult} from '../../types/transactions';

export interface QueuedCommand {id:string; sequence:number; command:BusinessCommandV2; state:'PENDING_SYNC'|'SYNCHRONIZED'|'CONFLICT'|'REJECTED'; result?:TransactionResult}
const request=<T>(value:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error||new Error('Storage request failed'))});

/** Staged v2 store. Enqueuing master edits does not claim an offline sale commit. */
export class BusinessStore {
  private constructor(private db:IDBDatabase,readonly scope:string,readonly deviceId:string,readonly actorId:string){}
  static async open(scope:string,deviceId:string,actorId:string,serverSequence=0):Promise<BusinessStore>{
    if(!scope||!deviceId||!actorId||!Number.isSafeInteger(serverSequence)||serverSequence<0)throw new Error('Valid business, device, actor and sequence are required');
    const opening=indexedDB.open(`servos-v2:${scope}:${deviceId}:${actorId}`,1);
    opening.onupgradeneeded=()=>{
      const db=opening.result;
      db.createObjectStore('meta');
      const queue=db.createObjectStore('queue',{keyPath:'id'});queue.createIndex('sequence','sequence',{unique:true});
      db.createObjectStore('records',{keyPath:['collection','id']});
      db.createObjectStore('drafts',{keyPath:'id'});
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
  async saveDraft(id:string,operation:string,payload:Record<string,unknown>){
    await this.transaction(['drafts'],'readwrite',async tx=>{await request(tx.objectStore('drafts').put({id,operation,payload,updatedAt:new Date().toISOString()}))});
  }
  async enqueue(operation:string,payload:Record<string,unknown>,expectedVersions:RecordVersion[]):Promise<BusinessCommandV2>{
    return this.transaction(['queue','meta'],'readwrite',async tx=>{
      const meta=tx.objectStore('meta');const previous=await request(meta.get('sequence')) as number;
      if(!Number.isSafeInteger(previous+1))throw new Error('Device sequence exhausted');
      const command:BusinessCommandV2={id:crypto.randomUUID(),schemaVersion:2,deviceId:this.deviceId,actorId:this.actorId,operation,payload,expectedVersions,allocationRefs:[],clientSequence:previous+1,occurredAt:new Date().toISOString()};
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
  async drafts():Promise<Array<{id:string;operation:string;payload:Record<string,unknown>;updatedAt:string}>>{return this.transaction(['drafts'],'readonly',tx=>request(tx.objectStore('drafts').getAll()))}
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
  async hasPending():Promise<boolean>{return (await this.queue()).some(entry=>entry.state==='PENDING_SYNC')}
}
