import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {authenticateSession, createApiServer} from '../src/server.mjs';

test('server cannot be constructed without an explicit authenticator', () => {
  assert.throws(() => createApiServer({store: {}}), /explicit session authenticator/);
});

test('session authentication hashes bearer token and ignores caller identity headers', async () => {
  let received;
  const store = {authenticateSession: async (...args) => { received = args; return {businessId: 'business', staffId: 'staff', deviceId: 'device', permissions: ['pos.sell']}; }};
  const token = 'a'.repeat(48);
  const actor = await authenticateSession({headers: {authorization: `Bearer ${token}`, 'x-serveos-device-id': '123e4567-e89b-42d3-a456-426614174003'}}, store);
  assert.equal(received[0], createHash('sha256').update(token).digest('hex'));
  assert.equal(actor.businessId, 'business');
  await assert.rejects(() => authenticateSession({headers: {'x-serveos-business-id': 'attacker', 'x-serveos-staff-id': 'attacker', 'x-serveos-device-id': '123e4567-e89b-42d3-a456-426614174003'}}, store), {code: 'AUTH_REQUIRED'});
});

test('health routes are public and command routes require session authentication', async t => {
  const pool = {query: async () => ({rows: [{ready: true}]})};
  const store = {pool, commandStatus: async () => null, changesAfter: async (_businessId, after, limit) => ({fromCursor: after, toCursor: after, highWater: 0, hasMore: false, changes: [], limit})};
  const server = createApiServer({store, origin: 'https://serveos.example', authenticate: async req => {
    if (req.headers.authorization !== 'Bearer valid-session') throw Object.assign(new Error('Sign in required.'), {status: 401, code: 'AUTH_REQUIRED'});
    return {businessId: 'business', staffId: 'staff', deviceId: '123e4567-e89b-42d3-a456-426614174003', permissions: []};
  }});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/health/live`)).status, 200);
  assert.equal((await fetch(`${base}/health/ready`)).status, 200);
  const changes = await fetch(`${base}/v1/sync/changes?after=0&limit=40`, {headers: {authorization: 'Bearer valid-session', 'x-serveos-device-id': '123e4567-e89b-42d3-a456-426614174003'}});
  assert.equal(changes.status, 200);
  assert.equal((await changes.json()).protocolVersion, 1);
  const invalidLimit = await fetch(`${base}/v1/sync/changes?after=0&limit=501`, {headers: {authorization: 'Bearer valid-session', 'x-serveos-device-id': '123e4567-e89b-42d3-a456-426614174003'}});
  assert.equal(invalidLimit.status, 400);
  const unauthorized = await fetch(`${base}/v1/commands/${crypto.randomUUID()}`, {headers: {
    'x-serveos-business-id': 'attacker', 'x-serveos-staff-id': 'attacker', 'x-serveos-device-id': 'device', 'x-serveos-permissions': '*',
  }});
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error.code, 'AUTH_REQUIRED');
});

test('initial setup status reveals availability without exposing the setup key', async t => {
  const previous=process.env.INITIAL_ADMIN_SETUP_SECRET;
  process.env.INITIAL_ADMIN_SETUP_SECRET='one-time-secret-for-status-test';
  let complete=false;
  const store={initialSetupComplete:async()=>complete};
  const server=createApiServer({store,origin:'https://serveos.example',authenticate:async()=>{throw new Error('Authentication is not required for setup status.')}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.INITIAL_ADMIN_SETUP_SECRET;else process.env.INITIAL_ADMIN_SETUP_SECRET=previous;
  });
  const base=`http://127.0.0.1:${server.address().port}`;
  const first=await fetch(`${base}/v1/setup/status`);
  assert.deepEqual(await first.json(),{available:true});
  complete=true;
  const finished=await fetch(`${base}/v1/setup/status`);
  assert.deepEqual(await finished.json(),{available:false});
  delete process.env.INITIAL_ADMIN_SETUP_SECRET;
  const closed=await fetch(`${base}/v1/setup/status`);
  assert.deepEqual(await closed.json(),{available:false});
});
