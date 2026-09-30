import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const store = read('../src/runtime/web/BusinessStore.ts');
const app = read('../src/runtime/web/WebBusinessApp.tsx');

test('Web v2 command promotion and enqueue fail closed when the browser is offline', () => {
  assert.match(store, /private requireOnline\(\).*navigator\.onLine/);
  assert.match(store, /async promoteDraftToCommand\(id:string\).*\n\s*this\.requireOnline\(\)/);
  assert.match(store, /async enqueue\(operation:string[\s\S]*?\n\s*this\.requireOnline\(\)/);
  assert.match(app, /if\(!navigator\.onLine\)\{await store\.current\.saveDraft/);
});
