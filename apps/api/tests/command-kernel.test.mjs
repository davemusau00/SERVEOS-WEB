import test from 'node:test';
import assert from 'node:assert/strict';
import {executeCommand, validateCommandEnvelope} from '../src/command-kernel.mjs';

const actor = {businessId: 'business-1', staffId: 'staff-1', deviceId: 'device-1', permissions: ['catalog.create']};
const command = {commandId: '123e4567-e89b-42d3-a456-426614174000', name: 'catalog.item.create', payload: {name: 'Tea'}, expectedVersions: {}};
const registry = new Map([['catalog.item.create', {permission: 'catalog.create', offlinePolicy: 'ONLINE_ONLY', handler: async () => ({itemId: 'item-1'})}]]);

function memoryStore() {
  const commands = new Map();
  const writes = [];
  let cursor = 0;
  const tx = {
    getCommand: async (businessId, commandId) => commands.get(`${businessId}:${commandId}`) ?? null,
    consumeOfflineGrant: async () => { throw new Error('not expected'); },
    assertExpectedVersions: async () => {},
    nextChangeCursor: async () => ++cursor,
    insertCommand: async entry => { commands.set(`${entry.businessId}:${entry.commandId}`, {payloadHash: entry.payloadHash, outcome: entry.outcome}); writes.push('command'); },
    insertAudit: async () => writes.push('audit'),
    insertChange: async () => writes.push('change'),
  };
  return {transaction: work => work(tx), commands, writes};
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
  assert.deepEqual(db.writes, ['command', 'audit', 'change']);
});

test('replays the same ID and payload without executing the handler twice', async () => {
  const db = memoryStore();
  let calls = 0;
  const counted = new Map([['catalog.item.create', {...registry.get('catalog.item.create'), handler: async () => ({call: ++calls})}]]);
  const first = await executeCommand({db, command, actor, registry: counted});
  const replay = await executeCommand({db, command, actor, registry: counted});
  assert.deepEqual(replay, first);
  assert.equal(calls, 1);
  assert.deepEqual(db.writes, ['command', 'audit', 'change']);
});

test('rejects command ID reuse with a different payload', async () => {
  const db = memoryStore();
  await executeCommand({db, command, actor, registry});
  await assert.rejects(() => executeCommand({db, command: {...command, payload: {name: 'Coffee'}}, actor, registry}), {code: 'COMMAND_ID_REUSED'});
});

test('enforces permission and offline grant policy before invoking a handler', async () => {
  const db = memoryStore();
  await assert.rejects(() => executeCommand({db, command, actor: {...actor, permissions: []}, registry}), {code: 'PERMISSION_DENIED'});
  const offline = new Map([['catalog.item.create', {...registry.get('catalog.item.create'), offlinePolicy: 'GRANTED_ONLY'}]]);
  await assert.rejects(() => executeCommand({db, command, actor, registry: offline}), {code: 'OFFLINE_GRANT_REQUIRED'});
});

test('checks expected versions before the domain handler runs', async () => {
  const db = memoryStore();
  let checked = false;
  db.transaction = work => work({
    ...{
      getCommand: async () => null,
      lockCommandKey: async () => {},
      nextChangeCursor: async () => 1,
      insertCommand: async () => {},
      insertAudit: async () => {},
      insertChange: async () => {},
      consumeOfflineGrant: async () => {},
    },
    assertExpectedVersions: async (_businessId, versions) => { checked = versions['items:tea'] === 3; },
  });
  const commandWithVersion = {...command, expectedVersions: {'items:tea': 3}};
  let handled = false;
  const versioned = new Map([['catalog.item.create', {permission: 'catalog.create', offlinePolicy: 'ONLINE_ONLY', handler: async () => { handled = true; return {}; }}]]);
  await executeCommand({db, command: commandWithVersion, actor, registry: versioned});
  assert.equal(checked, true);
  assert.equal(handled, true);
});
