import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

const read=(file)=>readFileSync(file,'utf8');

test('11F canonical permissions cover established staged backend and web permission contracts',()=>{
  const migration=read('supabase/expansion/016_staff_devices_approvals.sql');
  const start=migration.indexOf('create function servos_v2.canonical_permissions()');
  const end=migration.indexOf('create function servos_v2.role_permissions',start);
  assert.notEqual(start,-1,'canonical_permissions function is missing');
  assert.notEqual(end,-1,'role_permissions function is missing');

  const canonicalBody=migration.slice(start,end);
  const canonical=new Set([...canonicalBody.matchAll(/'([^']+\.[^']+)'/g)].map(match=>match[1]));
  const consumed=new Set();

  for(const name of readdirSync('supabase/expansion').filter(name=>name.endsWith('.sql'))){
    const sql=read(path.join('supabase/expansion',name));
    for(const match of sql.matchAll(/require_permission\('([^']+)'\)/g))consumed.add(match[1]);
    for(const match of sql.matchAll(/require_any_permission\(array\[([^\]]+)\]\)/g)){
      for(const permission of match[1].matchAll(/'([^']+)'/g))consumed.add(permission[1]);
    }
  }

  for(const name of readdirSync('src/runtime/web').filter(name=>name.endsWith('.tsx')||name.endsWith('.ts'))){
    const source=read(path.join('src/runtime/web',name));
    for(const match of source.matchAll(/allowed\(session,'([^']+)'\)/g))consumed.add(match[1]);
  }

  for(const permission of ['customers.manage','suppliers.manage','assetCategories.manage','roomTypes.manage']){
    consumed.add(permission);
  }

  const missing=[...consumed].filter(permission=>!canonical.has(permission)).sort();
  assert.deepEqual(missing,[],`canonical_permissions is missing consumed permissions: ${missing.join(', ')}`);
  assert.equal(canonical.has('till.cash_movement'),false,'deprecated till.cash_movement spelling must not remain canonical');
  assert.equal(canonical.has('till.cashMovement'),true,'till.cashMovement is the established backend/UI contract');
});

test('transactional browser waits for authorized snapshot before permission-gated Settings controls',()=>{
  const spec=read('tests/browser/transactions.spec.ts');
  const signInStart=spec.indexOf('const signIn=async(page:Page,email:string)=>');
  const firstTest=spec.indexOf("test('two operators",signInStart);
  assert.notEqual(signInStart,-1,'signIn helper missing');
  assert.notEqual(firstTest,-1,'transactional browser test missing');
  const signIn=spec.slice(signInStart,firstTest);
  assert.match(signIn,/getByRole\('button',\{name:'POS',exact:true\}\)\.click\(\)/);
  assert.match(signIn,/heading',\{name:'Service workspace',exact:true\}/);
  assert.match(signIn,/String\.raw/);
  assert.match(signIn,/getByRole\('button',\{name:'POS',exact:true\}\)/);
  assert.match(spec,/getByRole\('heading',\{name:'Master Data',exact:true\}\)/);
});


test('transactional PostgreSQL bridge accepts booleans objects and arrays',()=>{
  const spec=read('tests/browser/transactions.spec.ts');
  assert.match(spec,/line==='true'/);
  assert.match(spec,/line==='false'/);
  assert.match(spec,/line\.startsWith\('\{'\)/);
  assert.match(spec,/line\.startsWith\('\['\)/);
  assert.match(spec,/servos_v2_list_devices/);
});
