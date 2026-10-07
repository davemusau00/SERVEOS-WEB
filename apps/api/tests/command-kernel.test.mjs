import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiProblem, executeCommand, validateCommandEnvelope} from '../src/command-kernel.mjs';

const actor = {businessId: 'business-1', staffId: 'staff-1', deviceId: 'device-1', permissions: ['catalog.create']};
const command = {commandId: '123e4567-e89b-42d3-a456-426614174000', name: 'catalog.item.create', payload: {name: 'Tea'}, expectedVersions: {}};
const handlerResult=value=>({value,records:[]});
const registry = new Map([['catalog.item.create', {permission: 'catalog.create', offlinePolicy: 'ONLINE_ONLY', handler: async () => handlerResult({itemId: 'item-1'})}]]);

function memoryStore() {
  const commands = new Map();
  const writes = [];
  let cursor = 0;
  const tx = {
    getCommand: async (businessId, commandId) => commands.get(`${businessId}:${commandId}`) ?? null,
    consumeOfflineGrant: async () => { throw new ApiProblem(403,'OFFLINE_GRANT_INVALID','No valid offline grant.'); },
    assertExpectedVersions: async () => {},
    nextChangeCursor: async () => ++cursor,
    updateCommandOutcome: async entry => { commands.set(`${entry.businessId}:${entry.commandId}`, {payloadHash:entry.payloadHash,status:'CONFIRMED',outcome:entry.outcome}); writes.push('command'); },
    insertAudit: async () => writes.push('audit'),
    insertChange: async () => writes.push('change'),
  };
  return {
    transaction: work => work(tx), commands, writes,
    persistCommandReceived: async entry => {
      const key=`${entry.businessId}:${entry.commandId}`;
      const existing=commands.get(key);
      if(existing)return existing;
      const received={payloadHash:entry.payloadHash,status:'RECEIVED',outcome:null};
      commands.set(key,received);writes.push('received');return received;
    },
    setCommandProcessing: async (_businessId,id) => {const entry=commands.get(`business-1:${id}`);if(entry)entry.status='PROCESSING';},
    finalizeCommandFailure: async entry => {
      const key=`${entry.businessId}:${entry.commandId}`;
      const outcome={kind:entry.status,commandId:entry.commandId,error:entry.error};
      commands.set(key,{...commands.get(key),status:entry.status,error:entry.error,outcome});writes.push(entry.status.toLowerCase());return outcome;
    },
  };
}

test('command envelope validates stable command identity and payload shape', () => {
  assert.deepEqual(validateCommandEnvelope(command), command);
  assert.throws(() => validateCommandEnvelope({...command, commandId: 'not-a-uuid'}), {code: 'VALIDATION_FAILED'});
  assert.throws(() => validateCommandEnvelope({...command, payload: []}), {code: 'VALIDATION_FAILED'});
});

test('commits outcome, audit, and ordered change as one transaction', async () => {
  const db = memoryStore();
  const result = await executeCommand({db, command, actor, registry});
  assert.equal(result.kind, 'CONFIRMED');
  assert.equal(result.cursor, 1);
  assert.deepEqual(db.writes, ['received', 'command', 'audit', 'change']);
});

test('replays the same ID and payload without executing the handler twice', async () => {
  const db = memoryStore();
  let calls = 0;
  const counted = new Map([['catalog.item.create', {...registry.get('catalog.item.create'), handler: async () => handlerResult({call: ++calls})}]]);
  const first = await executeCommand({db, command, actor, registry: counted});
  const replay = await executeCommand({db, command, actor, registry: counted});
  assert.deepEqual(replay, first);
  assert.equal(calls, 1);
  assert.deepEqual(db.writes, ['received', 'command', 'audit', 'change']);
});

test('rejects command ID reuse with a different payload', async () => {
  const db = memoryStore();
  await executeCommand({db, command, actor, registry});
  await assert.rejects(() => executeCommand({db, command: {...command, payload: {name: 'Coffee'}}, actor, registry}), {code: 'COMMAND_ID_REUSED'});
});

test('idempotency hash treats object key order as the same request', async () => {
  const db = memoryStore();
  const first = {...command, payload: {name: 'Tea', price: 100}};
  const replay = {...command, payload: {price: 100, name: 'Tea'}};
  const saved = await executeCommand({db, command: first, actor, registry});
  assert.deepEqual(await executeCommand({db, command: replay, actor, registry}), saved);
});

test('persists permission rejection and requires a grant only when an offline attempt is declared', async () => {
  const db = memoryStore();
  const rejected=await executeCommand({db, command, actor: {...actor, permissions: []}, registry});
  assert.equal(rejected.kind,'REJECTED');
  assert.equal(db.commands.get(`business-1:${command.commandId}`).status,'REJECTED');
  const offline = new Map([['catalog.item.create', {...registry.get('catalog.item.create'), offlinePolicy: 'GRANTED_ONLY'}]]);
  const online=await executeCommand({db, command:{...command,commandId:'123e4567-e89b-42d3-a456-426614174001'},actor,registry:offline});
  assert.equal(online.kind,'CONFIRMED');
  const ungranted=await executeCommand({db,command:{...command,commandId:'123e4567-e89b-42d3-a456-426614174002',offlineGrantId:'123e4567-e89b-42d3-a456-426614174003'},actor,registry:offline});
  assert.equal(ungranted.kind,'REJECTED');
  assert.equal(ungranted.error.code,'OFFLINE_GRANT_INVALID');
  assert.equal(db.commands.get(`business-1:${ungranted.commandId}`).status,'REJECTED');
});

test('persists version conflicts and replays the same conflict after response loss', async () => {
  const db=memoryStore();let calls=0;
  const conflictRegistry=new Map([['catalog.item.create',{permission:'catalog.create',offlinePolicy:'ONLINE_ONLY',handler:async()=>{calls++;return handlerResult({});}}]]);
  db.transaction=async work=>work({...{
    getCommand:async(businessId,id)=>db.commands.get(`${businessId}:${id}`)??null,
    lockCommandKey:async()=>{},nextChangeCursor:async()=>1,updateCommandOutcome:async()=>{},insertAudit:async()=>{},insertChange:async()=>{},consumeOfflineGrant:async()=>{},
  },assertExpectedVersions:async()=>{const error=new Error('stale');error.status=409;error.code='VERSION_CONFLICT';throw error;}});
  const commandWithVersion={...command,commandId:'123e4567-e89b-42d3-a456-426614174004',expectedVersions:{'items:tea':3}};
  const first=await executeCommand({db,command:commandWithVersion,actor,registry:conflictRegistry});
  const replay=await executeCommand({db,command:commandWithVersion,actor,registry:conflictRegistry});
  assert.equal(first.kind,'CONFLICT');assert.deepEqual(replay,first);assert.equal(calls,0);
  assert.equal(db.commands.get(`business-1:${commandWithVersion.commandId}`).status,'CONFLICT');
});

test('checks expected versions before the domain handler runs', async () => {
  const db = memoryStore();
  let checked = false;
  db.transaction = work => work({
    ...{
      getCommand: async () => null,
      lockCommandKey: async () => {},
      nextChangeCursor: async () => 1,
      updateCommandOutcome: async () => {},
      insertAudit: async () => {},
      insertChange: async () => {},
      consumeOfflineGrant: async () => {},
    },
    assertExpectedVersions: async (_businessId, versions) => { checked = versions['items:tea'] === 3; },
  });
  const commandWithVersion = {...command, expectedVersions: {'items:tea': 3}};
  let handled = false;
  const versioned = new Map([['catalog.item.create', {permission: 'catalog.create', offlinePolicy: 'ONLINE_ONLY', handler: async () => { handled = true; return handlerResult({}); }}]]);
  await executeCommand({db, command: commandWithVersion, actor, registry: versioned});
  assert.equal(checked, true);
  assert.equal(handled, true);
});

for(const failure of [new Error('connection lost'),new ApiProblem(503,'DATABASE_UNAVAILABLE','Unavailable')]){
  test(`transient ${failure.code || 'infrastructure'} failure preserves command identity for recovery`,async()=>{
    const db=memoryStore();let calls=0;
    const recovering=new Map([['catalog.item.create',{...registry.get('catalog.item.create'),handler:async()=>{if(++calls===1)throw failure;return handlerResult({itemId:'recovered'});}}]]);
    await assert.rejects(executeCommand({db,command,actor,registry:recovering}),error=>error===failure);
    const unresolved=db.commands.get(`business-1:${command.commandId}`);
    assert.equal(unresolved.status,'PROCESSING');assert.equal(unresolved.outcome,null);
    assert.ok(!db.writes.includes('rejected'));
    const recovered=await executeCommand({db,command,actor,registry:recovering});
    assert.equal(recovered.kind,'CONFIRMED');
    assert.deepEqual(await executeCommand({db,command,actor,registry:recovering}),recovered);
    assert.equal(calls,2);assert.equal(db.writes.filter(write=>write==='change').length,1);
  });
}

test('change feed publishes only explicit records, never record-shaped business values',async()=>{
 const db=memoryStore();let change;
 const record={collection:'stockItems',id:'stock',version:1,data:{name:'Tea'},archived:false};
 const value={nested:{collection:'private',id:'hidden',version:1,data:{secret:'not a projection'}}};
 const baseTransaction=db.transaction;db.transaction=work=>baseTransaction(tx=>work({...tx,insertChange:async entry=>{change=entry}}));
 const explicit=new Map([[command.name,{...registry.get(command.name),handler:async()=>({value,records:[record]})}]]);
 const outcome=await executeCommand({db,command,actor,registry:explicit});
 assert.deepEqual(outcome.result,value);assert.deepEqual(change.result.records,[record]);
});
test('invalid handler record contract stays unresolved and does not confirm a command',async()=>{
 const db=memoryStore();const malformed=new Map([[command.name,{...registry.get(command.name),handler:async()=>({value:{},records:[{collection:'stockItems'}]})}]]);
 await assert.rejects(executeCommand({db,command,actor,registry:malformed}),{code:'INVALID_HANDLER_RECORD'});
 assert.equal(db.commands.get(`business-1:${command.commandId}`).status,'PROCESSING');
 assert.ok(!db.writes.includes('command'));assert.ok(!db.writes.includes('change'));
});
