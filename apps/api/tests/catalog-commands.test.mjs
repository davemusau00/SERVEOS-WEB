import test from 'node:test';
import assert from 'node:assert/strict';
import {executeCommand} from '../src/command-kernel.mjs';
import {catalogCommandRegistry} from '../src/catalog-commands.mjs';

const actor = {businessId: 'business', staffId: 'staff', deviceId: 'device', permissions: ['catalog.manage']};
const command = {
  commandId: '123e4567-e89b-42d3-a456-426614174000',
  name: 'catalog.item.create',
  expectedVersions: {'catalogItems:123e4567-e89b-42d3-a456-426614174001': 0},
  payload: {itemId: '123e4567-e89b-42d3-a456-426614174001', name: '  Chai  ', sku: ' CHAI ', basePriceMinor: 25000},
};

function memoryDatabase() {
  const state = {commands: new Map(), items: [], cursor: 0};
  const tx = {
    getCommand: async (businessId, id) => state.commands.get(`${businessId}:${id}`) ?? null,
    lockCommandKey: async () => {},
    assertExpectedVersions: async () => {},
    bumpEntityVersion: async (_businessId, _type, _id, expected) => { assert.equal(expected, 0); return 1; },
    findCatalogSku: async (_businessId, sku) => state.items.find(item => item.sku?.toLowerCase() === sku.toLowerCase()) ?? null,
    requireCatalogCategory: async () => true,
    insertCatalogItem: async item => state.items.push(item),
    nextChangeCursor: async () => ++state.cursor,
    updateCommandOutcome: async row => state.commands.set(`${row.businessId}:${row.commandId}`, {payloadHash:row.payloadHash,status:'CONFIRMED',outcome:row.outcome}),
    insertAudit: async () => {},
    insertChange: async () => {},
  };
  return {state, transaction: work => work(tx),
    persistCommandReceived:async row=>{const key=`${row.businessId}:${row.commandId}`;const current=state.commands.get(key);if(current)return current;const received={payloadHash:row.payloadHash,status:'RECEIVED',outcome:null};state.commands.set(key,received);return received;},
    setCommandProcessing:async(businessId,id)=>{const row=state.commands.get(`${businessId}:${id}`);if(row)row.status='PROCESSING';},
    finalizeCommandFailure:async row=>{const outcome={kind:row.status,commandId:row.commandId,error:row.error};state.commands.set(`${row.businessId}:${row.commandId}`,{...state.commands.get(`${row.businessId}:${row.commandId}`),status:row.status,error:row.error,outcome});return outcome;},
  };
}

test('catalog.item.create validates, versions, and stores a normalized item', async () => {
  const db = memoryDatabase();
  const outcome = await executeCommand({db, command:{...command,name:'catalog.item.create',payload:{...command.payload}}, actor, registry:catalogCommandRegistry});
  assert.equal(outcome.kind, 'CONFIRMED');
  assert.equal(outcome.result.data.name, 'Chai');
  assert.equal(outcome.result.data.sku, 'CHAI');
  assert.equal(outcome.result.version, 1);
  assert.equal(db.state.items.length, 1);
});

test('catalog.item.create refuses malformed prices and missing create versions', async () => {
  const db = memoryDatabase();
  const badPrice = {...command, commandId: '123e4567-e89b-42d3-a456-426614174002', payload: {...command.payload, basePriceMinor: 2.5}};
  assert.equal((await executeCommand({db, command:badPrice, actor, registry:catalogCommandRegistry})).error.code,'VALIDATION_FAILED');
  const missingVersion = {...command, commandId: '123e4567-e89b-42d3-a456-426614174003', expectedVersions: {}};
  assert.equal((await executeCommand({db, command:missingVersion, actor, registry:catalogCommandRegistry})).error.code,'VALIDATION_FAILED');
  assert.equal(db.state.items.length, 0);
});

test('catalog.item.create rejects active duplicate SKUs', async () => {
  const db = memoryDatabase();
  db.state.items.push({sku: 'chai'});
  const duplicate={...command,name:'catalog.item.create',payload:{...command.payload}};
  assert.equal((await executeCommand({db, command:duplicate, actor, registry:catalogCommandRegistry})).error.code,'DUPLICATE_REFERENCE');
  assert.equal(db.state.items.length, 1);
});
