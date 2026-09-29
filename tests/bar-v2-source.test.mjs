import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(f,'utf8');
const store=read('src-tauri/src/store.rs');
const app=read('src/App.tsx');
const runtime=read('src/runtime/RuntimeProvider.tsx');

test('native backend owns installation state and capability authorization',()=>{
  for(const token of ['ALL_PERMISSIONS','installation_stage','setup.completeStep','setup.goLive','create_approval','authorize(&tx','Complete business setup and approve Go Live before trading']) assert.ok(store.includes(token),token);
});

test('enrollment no longer seeds a restaurant outlet or stock location',()=>{
  const init=store.slice(store.indexOf('pub fn initialize'),store.indexOf('pub fn login'));
  assert.ok(init.includes('businessSetup'));
  assert.equal(init.includes('"outlets"'),false);
  assert.equal(init.includes('"stockLocations"'),false);
});

test('bar transaction commands are native and auditable',()=>{
  for(const op of ['order.updateItem','order.discount','order.compItem','payment.refund','inventory.receive','till.cashMovement','closeDay.generate']) assert.ok(store.includes(`"${op}"`),op);
  assert.ok(store.includes('ingredientSnapshot'));
  assert.ok(store.includes('priceRuleSnapshot'));
  assert.ok(store.includes('NO_AUTOMATIC_RESTOCK'));
});

test('installed app uses native production shell while browser remains explicit preview',()=>{
  assert.ok(app.includes('if (isNative) return <RuntimeProvider><NativeRoot'));
  assert.ok(app.includes('UI preview — sample data only'));
  assert.equal(app.includes('NativeServOSProvider'),false);
});

test('runtime exposes intake, approval and native snapshot permissions',()=>{
  for(const op of ['runtime_intake_save','runtime_intake_complete','runtime_manager_approve','runtime_snapshot']) assert.ok(runtime.includes(op),op);
});

test('native production source contains no legacy demo stock or SKU conventions',()=>{
  const files=fs.readdirSync('src/native').filter(f=>/\.tsx?$/.test(f)).map(f=>read(`src/native/${f}`)).join('\n');
  for(const forbidden of ['JAM-','loc-bar-store','loc-warehouse']) assert.equal(files.includes(forbidden),false,forbidden);
});
