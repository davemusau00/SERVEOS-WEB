import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { transformSync } from 'esbuild';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const store = read('../src/runtime/web/BusinessStore.ts');
const app = read('../src/runtime/web/WebBusinessApp.tsx');

test('Web v2 command promotion and enqueue fail closed when the browser is offline', async () => {
  const { code } = transformSync(store, { loader: 'ts', format: 'esm', target: 'es2022' });
  const { BusinessStore } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let transactions = 0;
  const db = { transaction() { transactions++; throw new Error('Unexpected storage access'); } };
  const business = new BusinessStore(db, 'business', 'device', 'actor');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    await assert.rejects(business.promoteDraftToCommand('draft'), /requires an online connection/);
    await assert.rejects(business.enqueue('record.save', {}, []), /requires an online connection/);
    assert.equal(transactions, 0, 'offline submission must not consume a sequence or mutate storage');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
  assert.match(app, /if\(!navigator\.onLine\)\{await store\.current\.saveDraft/);
});
