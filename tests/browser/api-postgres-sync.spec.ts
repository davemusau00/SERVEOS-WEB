import {test,expect} from '@playwright/test';
import type {IncomingMessage} from 'node:http';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {createApiServer,authenticateSession} from '../../apps/api/src/server.mjs';
import {PostgresStore} from '../../apps/api/src/postgres-store.mjs';
import {migrate} from '../../apps/api/src/migrate.mjs';
import {executeCommand} from '../../apps/api/src/command-kernel.mjs';
import {catalogCommandRegistry} from '../../apps/api/src/catalog-commands.mjs';


test('real API catalog confirmation, IndexedDB reload and missed change recovery',async({page},testInfo)=>{
 test.skip(!process.env.TEST_DATABASE_URL||testInfo.project.name!=='api-postgres','Requires dedicated API config and disposable TEST_DATABASE_URL.');
 const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
 const {Pool}=requireApi('pg');
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:4});
 const businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID(),stockId=randomUUID();
 const loginName=`browser-${staffId}@example.invalid`,password='Disposable-browser-password-2026';
 const salt=randomBytes(16),derived=scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
 const hash=`scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
 let server:ReturnType<typeof createApiServer>|undefined;
 try{
  await migrate(pool);const store=new PostgresStore(pool);
  await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Browser acceptance']);
  await pool.query("INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password) VALUES($1,$2,$3,'Browser Admin','Admin',$4,false)",[businessId,staffId,loginName,hash]);
  for(const permission of ['*','catalog.view','catalog.manage','devices.register','inventory.view','inventory.count'])await pool.query('INSERT INTO api_staff_permissions(business_id,staff_id,permission) VALUES($1,$2,$3)',[businessId,staffId,permission]);
  await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[deviceId,businessId,staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'test',y:'test'})]);
  const locationId=randomUUID();
  const actor={businessId,staffId,deviceId,permissions:['catalog.manage']};
  const data={name:'Real coffee beans',code:'REAL-COF',baseUnit:'kg',scanUnitQuantity:1,reorderLevel:2,averageUnitCostMinor:900,purchasePackages:[]};
  const command=(name:string,version:number)=>({commandId:randomUUID(),name:'stockItem.save',expectedVersions:{[`stockItems:${stockId}`]:version},payload:{id:stockId,data:{...data,name}}});
  expect((await executeCommand({db:store,command:command(data.name,0),actor,registry:catalogCommandRegistry})).kind).toBe('CONFIRMED');
  expect((await executeCommand({db:store,command:{commandId:randomUUID(),name:'stockLocation.save',expectedVersions:{[`stockLocations:${locationId}`]:0},payload:{id:locationId,data:{name:'Real store',code:'REAL',type:'STORE'}}},actor,registry:catalogCommandRegistry})).kind).toBe('CONFIRMED');
  server=createApiServer({store,registry:catalogCommandRegistry,authenticate:(req:IncomingMessage)=>authenticateSession(req,store),origin:'http://127.0.0.1:3020'});
  const listeningServer=server;
  await new Promise<void>((resolve,reject)=>{listeningServer.once('error',reject);listeningServer.listen(4317,'127.0.0.1',resolve)});
  const legacyRequests:string[]=[];
  page.on('request',request=>{if(request.url().includes('servos_v2'))legacyRequests.push(request.url())});
  const signIn=async()=>{
   if(await page.getByRole('button',{name:'Remote management',exact:true}).isVisible())await page.getByRole('button',{name:'Remote management',exact:true}).click();
   await page.getByRole('button',{name:'ServOS API workspace',exact:true}).click();
   await page.getByLabel('Staff login',{exact:true}).fill(loginName);
   await page.getByLabel('Password',{exact:true}).fill(password);
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await expect(page.getByText('Workspace ready',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Catalog',exact:true}).click();
  };
  await page.goto('/');await signIn();
  await expect(page.getByText(data.name,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  await page.getByLabel('Name',{exact:true}).fill('Real coffee updated');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Saved and synchronized.',{exact:true})).toBeVisible();
  expect((await pool.query('SELECT name,version FROM stock_items WHERE business_id=$1 AND id=$2',[businessId,stockId])).rows[0]).toMatchObject({name:'Real coffee updated',version:'2'});
  await page.getByRole('button',{name:'New product',exact:true}).click();
  const productForm=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'New product',exact:true})});
  await productForm.getByLabel('Name',{exact:true}).fill('Real brewed coffee');
  await productForm.getByLabel('Code / SKU',{exact:true}).fill('REAL-BREW');
  await productForm.getByLabel('Price (KES)',{exact:true}).fill('150.25');
  await productForm.getByLabel('Tax class',{exact:true}).selectOption('B_0');
  await productForm.getByRole('button',{name:'Save',exact:true}).click();
  await expect(productForm).toHaveCount(0);
  await expect(page.getByText('Real brewed coffee',{exact:true})).toBeVisible();
  const product=(await pool.query('SELECT id,name,price_minor::text,version::text FROM products WHERE business_id=$1 AND code=$2',[businessId,'REAL-BREW'])).rows[0];
  expect(product).toMatchObject({name:'Real brewed coffee',price_minor:'15025',version:'1'});
  await page.reload();await signIn();
  await expect(page.getByText('Real coffee updated',{exact:true})).toBeVisible();
  await expect(page.getByText('Real brewed coffee',{exact:true})).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText(/^Offline .* saved changes only/)).toBeVisible();
  expect((await executeCommand({db:store,command:command('Real remote change',2),actor,registry:catalogCommandRegistry})).kind).toBe('CONFIRMED');
  await page.context().setOffline(false);
  await page.getByRole('button',{name:'Synchronize',exact:true}).first().click();
  await expect(page.getByText('Real remote change',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await page.getByRole('button',{name:'Count stock',exact:true}).click();
  const count=page.getByRole('dialog',{name:'Full stocktake',exact:true});
  await count.getByRole('button',{name:'Real store',exact:true}).click();
  await count.getByLabel('Counted quantity for Real remote change',{exact:true}).fill('3');
  await count.getByRole('button',{name:'Review count',exact:true}).click();
  await count.getByRole('button',{name:'Confirm Count',exact:true}).click();
  await expect(count).toHaveCount(0);
  expect((await pool.query('SELECT quantity::text,version::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0]).toMatchObject({quantity:'3.000000',version:'1'});
  const persisted=await page.evaluate(async()=>{
   const entry=(await indexedDB.databases()).find(db=>db.name?.startsWith('servos-api-v1:'))!;
   return new Promise<any>((resolve,reject)=>{const opening=indexedDB.open(entry.name!);opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{const db=opening.result,tx=db.transaction(['records','queue'],'readonly');const records=tx.objectStore('records').getAll(),queue=tx.objectStore('queue').getAll();tx.oncomplete=()=>{resolve({records:records.result,queue:queue.result});db.close()};tx.onabort=()=>reject(tx.error)}});
  });
  expect(persisted.records.find((record:{id:string})=>record.id===stockId)).toMatchObject({version:4,data:{name:'Real remote change',balanceVersions:{[locationId]:1}}});
  expect(persisted.records.find((record:{id:string})=>record.id===product.id)).toMatchObject({collection:'products',version:1,data:{name:'Real brewed coffee',priceMinor:15025}});
  expect(persisted.queue).toHaveLength(3);expect(persisted.queue.every((entry:{state:string})=>entry.state==='SYNCHRONIZED')).toBe(true);
  expect(legacyRequests).toEqual([]);
  expect((await pool.query('SELECT count(*)::int AS total FROM api_commands WHERE business_id=$1 AND status=$2',[businessId,'CONFIRMED'])).rows[0].total).toBe(6);
 }finally{
  try{if(!page.isClosed())await page.goto('about:blank')}finally{
   if(server){const closingServer=server;closingServer.closeAllConnections();await new Promise<void>(resolve=>closingServer.close(()=>resolve()))}
   await pool.end();
  }
 }
});
