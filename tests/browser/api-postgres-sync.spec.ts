import {test,expect,type Page} from '@playwright/test';
import type {IncomingMessage} from 'node:http';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,scryptSync,createHash} from 'node:crypto';
import {createApiServer,authenticateSession} from '../../apps/api/src/server.mjs';
import {PostgresStore} from '../../apps/api/src/postgres-store.mjs';
import {migrate} from '../../apps/api/src/migrate.mjs';
import {executeCommand} from '../../apps/api/src/command-kernel.mjs';
import {catalogCommandRegistry} from '../../apps/api/src/catalog-commands.mjs';

const instrumentRefreshLocks=()=>{
 const state=window as typeof window & {__serveosRefreshLockCalls?:number};state.__serveosRefreshLockCalls=0;
 const locks=navigator.locks,original=locks.request.bind(locks) as (...args:any[])=>Promise<unknown>;
 Object.defineProperty(locks,'request',{configurable:true,value:(name:string,...args:any[])=>{
  if(name==='serveos-api-refresh')state.__serveosRefreshLockCalls=(state.__serveosRefreshLockCalls||0)+1;
  return original(name,...args);
 }});
};

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
  let secondaryPage:Page|undefined;
  const observedCredentials:Array<{sessionId:string;accessToken:string;refreshToken:string}>=[];
 try{
  await migrate(pool);const store=new PostgresStore(pool);
  await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Browser acceptance']);
  await pool.query("INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password) VALUES($1,$2,$3,'Browser Admin','Admin',$4,false)",[businessId,staffId,loginName,hash]);
  for(const permission of ['*','catalog.view','catalog.manage','devices.register','inventory.view','inventory.count'])await pool.query('INSERT INTO api_staff_permissions(business_id,staff_id,permission) VALUES($1,$2,$3)',[businessId,staffId,permission]);
  await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[deviceId,businessId,staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'test',y:'test'})]);
  const locationId=randomUUID();
  const actor={businessId,staffId,deviceId,permissions:['catalog.manage']};
  const data={name:'Real coffee beans',code:'REAL-COF',baseUnit:'kg',barcode:'616000010',barcodeAliases:['616000011'],scanUnitQuantity:1,reorderLevel:2,averageUnitCostMinor:900,purchasePackages:[{id:randomUUID(),name:'Case',baseQuantity:12,unitCostMinor:10800,barcode:'616000012'}]};
  const command=(name:string,version:number)=>({commandId:randomUUID(),name:'stockItem.save',expectedVersions:{[`stockItems:${stockId}`]:version},payload:{id:stockId,data:{...data,name}}});
  expect((await executeCommand({db:store,command:command(data.name,0),actor,registry:catalogCommandRegistry})).kind).toBe('CONFIRMED');
  expect((await executeCommand({db:store,command:{commandId:randomUUID(),name:'stockLocation.save',expectedVersions:{[`stockLocations:${locationId}`]:0},payload:{id:locationId,data:{name:'Real store',code:'REAL',type:'STORE'}}},actor,registry:catalogCommandRegistry})).kind).toBe('CONFIRMED');
  const outletId=randomUUID();
  await pool.query('INSERT INTO business_outlets(business_id,id,name,default_stock_location_id,version) VALUES($1,$2,$3,$4,1)',[businessId,outletId,'Main outlet',locationId]);
  server=createApiServer({store,registry:catalogCommandRegistry,authenticate:(req:IncomingMessage)=>authenticateSession(req,store),origin:'http://127.0.0.1:3020'});
  const listeningServer=server;
  await new Promise<void>((resolve,reject)=>{listeningServer.once('error',reject);listeningServer.listen(4317,'127.0.0.1',resolve)});
  const legacyRequests:string[]=[];
  page.on('request',request=>{if(request.url().includes('servos_v2'))legacyRequests.push(request.url())});
  const signIn=async()=>{
   const login=page.getByLabel('Staff login',{exact:true});
   if(await login.isVisible().catch(()=>false)){
    await login.fill(loginName);
    await page.getByLabel('Password',{exact:true}).fill(password);
    const loginResponsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/v1/auth/login');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    const loginResponse=await loginResponsePromise,loginBody=await loginResponse.json() as {sessionId:string;accessToken:string};
    const refreshCookie=(await page.context().cookies()).find(cookie=>cookie.name===`servos_refresh_${loginBody.sessionId}`);
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.path).toBe(`/v1/auth/sessions/${loginBody.sessionId}/refresh`);
    observedCredentials.push({sessionId:loginBody.sessionId,accessToken:loginBody.accessToken,refreshToken:refreshCookie!.value});
   }
   await expect(page.getByRole('button',{name:'Catalog',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Catalog',exact:true}).click();
  };
  await page.addInitScript(instrumentRefreshLocks);
  await page.goto('/');await signIn();
  const bootstrapOwner=(await pool.query(`SELECT snapshot_id::text,business_id::text,staff_id::text,device_id::text,session_id::text,authorization_hash,record_count FROM api_business_bootstrap_snapshots WHERE business_id=$1 AND session_id=$2 ORDER BY created_at DESC LIMIT 1`,[businessId,observedCredentials[0].sessionId])).rows[0];
  expect(bootstrapOwner).toBeTruthy();expect(Number(bootstrapOwner.record_count)).toBeGreaterThan(0);
  const bootstrapScope={snapshotId:bootstrapOwner.snapshot_id,businessId:bootstrapOwner.business_id,staffId:bootstrapOwner.staff_id,deviceId:bootstrapOwner.device_id,sessionId:bootstrapOwner.session_id,authorizationHash:bootstrapOwner.authorization_hash,at:new Date()};
  expect(await store.catalogBootstrapManifest(bootstrapScope)).toBeTruthy();
  expect(await store.catalogBootstrapPage({...bootstrapScope,after:0})).toBeTruthy();
  const changedAuthorizationHash=createHash('sha256').update(JSON.stringify(['*','catalog.manage','devices.register','inventory.view'].sort())).digest('hex');
  for(const wrongScope of [
   {...bootstrapScope,businessId:randomUUID()},
   {...bootstrapScope,staffId:randomUUID()},
   {...bootstrapScope,deviceId:randomUUID()},
   {...bootstrapScope,sessionId:randomUUID()},
   {...bootstrapScope,authorizationHash:changedAuthorizationHash},
   {...bootstrapScope,at:new Date(Date.now()+11*60_000)},
  ])expect(await store.catalogBootstrapManifest(wrongScope)).toBeNull();
  expect(await store.catalogBootstrapPage({...bootstrapScope,deviceId:randomUUID(),after:0})).toBeNull();
  const storedAuth=await page.evaluate(async()=>{
   const local=Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]);
   const indexed:Array<unknown>=[];
   for(const entry of await indexedDB.databases()){
    if(!entry.name)continue;
    const opening=indexedDB.open(entry.name);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>resolve(opening.result)});
    const values=await new Promise<Record<string,unknown[]>>((resolve,reject)=>{
     const tx=db.transaction([...db.objectStoreNames],'readonly'),result:Record<string,unknown[]>={};
     for(const name of [...db.objectStoreNames]){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{result[name]=request.result};request.onerror=()=>reject(request.error)}
     tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);
    });
    indexed.push(values);db.close();
   }
   return {local,indexed};
  });
  const persistedAuthText=JSON.stringify(storedAuth);
  expect(persistedAuthText).not.toContain(observedCredentials[0].accessToken);
  expect(persistedAuthText).not.toContain(observedCredentials[0].refreshToken);
  await expect(page.getByText(data.name,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit',exact:true}).first().click();
  await page.getByLabel('Name',{exact:true}).fill('Real coffee updated');
  await page.getByLabel('Package 1 name',{exact:true}).fill('Case twelve');
  await page.getByLabel('Package cost (KES)',{exact:true}).fill('115.50');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Saved and synchronized.',{exact:true})).toBeVisible();
  expect((await pool.query('SELECT name,version FROM stock_items WHERE business_id=$1 AND id=$2',[businessId,stockId])).rows[0]).toMatchObject({name:'Real coffee updated',version:'2'});
  const editedStockProjection=(await store.catalogBootstrap(businessId)).records.find(record=>record.collection==='stockItems'&&record.id===stockId);
  expect(editedStockProjection?.data.barcodeAliases).toEqual(['616000011']);
  expect(editedStockProjection?.data.purchasePackages[0]).toMatchObject({name:'Case twelve',baseQuantity:12,unitCostMinor:11550,barcode:'616000012'});
  await page.getByRole('button',{name:'New product',exact:true}).click();
  const productForm=page.getByRole('dialog',{name:'New product',exact:true});
  await productForm.getByLabel('Name',{exact:true}).fill('Real brewed coffee');
  await productForm.getByLabel('Code / SKU',{exact:true}).fill('REAL-BREW');
  await productForm.getByLabel('Price (KES)',{exact:true}).fill('150.25');
  await productForm.getByRole('combobox',{name:'Tax class',exact:true}).selectOption('B_0');
  await productForm.getByLabel('Recipe stock ingredient',{exact:true}).selectOption(stockId);
  await productForm.getByLabel('Recipe ingredient quantity',{exact:true}).fill('0.25');
  await productForm.getByRole('button',{name:'Add',exact:true}).click();
  await productForm.locator('select').nth(5).selectOption('RECIPE');
  const selling=productForm.locator('fieldset').nth(1);
  await selling.locator('input').nth(0).fill('0.25');
  await selling.locator('button').filter({hasText:'Add portion'}).click();
  await selling.locator('input').nth(2).fill('Cup');
  await selling.locator('input').nth(3).fill('150.25');
  await selling.locator('input').nth(4).fill('0.25');
  await selling.locator('input[type="checkbox"]').nth(1).check();
  const modifiers=productForm.locator('fieldset').nth(0);
  await modifiers.locator('button').filter({hasText:'Add modifier'}).click();
  await modifiers.locator('input').nth(0).fill('Extra coffee');
  await modifiers.locator('input').nth(1).fill('0.50');
  await modifiers.locator('button').filter({hasText:'Add ingredient change'}).click();
  await modifiers.locator('select').selectOption(stockId);
  await modifiers.locator('input').nth(2).fill('0.125');
  await productForm.getByRole('button',{name:'Save',exact:true}).click();
  await expect(productForm).toHaveCount(0);
  await expect(page.getByText('Real brewed coffee',{exact:true})).toBeVisible();
  const product=(await pool.query('SELECT id,name,price_minor::text,version::text FROM products WHERE business_id=$1 AND code=$2',[businessId,'REAL-BREW'])).rows[0];
  expect(product).toMatchObject({name:'Real brewed coffee',price_minor:'15025',version:'1'});
  const createdProduct=(await store.catalogBootstrap(businessId)).records.find(record=>record.collection==='products'&&record.id===product.id);
  expect(createdProduct?.data).toMatchObject({inventoryType:'RECIPE',portionVolume:'0.250000',taxClassId:'B_0',outletIds:[outletId],recipeIngredients:[{productId:product.id,stockItemId:stockId,quantity:0.25}],portions:[{name:'Cup',priceMinor:15025,volume:0.25}],modifiers:[{name:'Extra coffee',priceDeltaMinor:50,ingredientAdjustments:[{stockItemId:stockId,quantityDelta:0.125}]}]});

  const productCard=page.locator('article').filter({hasText:'REAL-BREW'});
  await productCard.getByRole('button',{name:'Archive',exact:true}).click();
  const archiveDialog=page.getByRole('dialog',{name:'Archive Real brewed coffee?',exact:true});
  await archiveDialog.getByLabel('Reason',{exact:true}).fill('Reviewed catalog lifecycle acceptance');
  const archiveResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/v1/commands'&&response.request().method()==='POST');
  await archiveDialog.getByRole('button',{name:'Archive record',exact:true}).click();
  const archiveOutcome=await (await archiveResponse).json() as {kind:string};
  expect(archiveOutcome.kind).toBe('CONFIRMED');
  await expect(productCard).toHaveCount(0);
  const archivedProductState=(await pool.query('SELECT version::text,archived_at FROM products WHERE business_id=$1 AND id=$2',[businessId,product.id])).rows[0];
  expect(archivedProductState).toMatchObject({version:'2'});expect(archivedProductState.archived_at).not.toBeNull();
  await page.getByText('Archived masters',{exact:true}).click();
  await expect(page.getByText('Real brewed coffee',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reactivate',exact:true}).click();
  const reactivateDialog=page.getByRole('dialog',{name:'Reactivate Real brewed coffee?',exact:true});
  await reactivateDialog.getByLabel('Reason',{exact:true}).fill('Reviewed catalog lifecycle acceptance');
  const reactivateResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/v1/commands'&&response.request().method()==='POST');
  await reactivateDialog.getByRole('button',{name:'Reactivate record',exact:true}).click();
  const reactivateOutcome=await (await reactivateResponse).json() as {kind:string};
  expect(reactivateOutcome.kind).toBe('CONFIRMED');
  await expect(page.getByText('Real brewed coffee',{exact:true})).toBeVisible();
  expect((await pool.query('SELECT version::text,archived_at FROM products WHERE business_id=$1 AND id=$2',[businessId,product.id])).rows[0]).toMatchObject({version:'3',archived_at:null});

  // The identity database and HttpOnly session survive while the disposable
  // business projection is deliberately deleted. A fresh page must rebuild
  // the projection from the API bootstrap before showing catalog data.
  const apiDatabaseName=(await page.evaluate(async()=>
   (await indexedDB.databases()).find(entry=>entry.name?.startsWith('servos-api-v1:'))?.name||null
  ));
  expect(apiDatabaseName).toBeTruthy();
  await page.route('**/storage-maintenance.html',route=>route.fulfill({
   status:200,contentType:'text/html',body:'<!doctype html><title>Storage maintenance</title><body>ready</body>',
  }));
  await page.goto('/storage-maintenance.html');
  const deletedProjection=await page.evaluate(async(name)=>{
   const request=indexedDB.deleteDatabase(name as string);
   await new Promise<void>((resolve,reject)=>{request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('API projection database remained open after leaving the workspace.'))});
   return !(await indexedDB.databases()).some(entry=>entry.name===name);
  },apiDatabaseName);
  expect(deletedProjection).toBe(true);
  await page.goto('/');
  await expect(page.getByText('Workspace ready',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Catalog',exact:true}).click();
  await expect(page.getByText('Real coffee updated',{exact:true})).toBeVisible();
  await expect(page.getByText('Real brewed coffee',{exact:true})).toBeVisible();

  await page.reload();
  await expect(page.getByText('Workspace ready',{exact:true})).toBeVisible();
  await expect(page.getByText('Real coffee updated',{exact:true})).toBeVisible();
  await expect(page.getByText('Real brewed coffee',{exact:true})).toBeVisible();

  const sessionId=observedCredentials.at(-1)!.sessionId;
  const tokensBeforeSecondary=Number((await pool.query('SELECT count(*)::int AS count FROM api_refresh_tokens t JOIN api_refresh_families f ON f.id=t.family_id WHERE f.session_id=$1',[sessionId])).rows[0].count);
  let streamAttempts=0;
  secondaryPage=await page.context().newPage();
  await secondaryPage.addInitScript(instrumentRefreshLocks);
  await secondaryPage.route('http://127.0.0.1:4317/v1/sync/stream**',async route=>{
   streamAttempts++;
   if(streamAttempts===1)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'AUTH_REQUIRED',message:'Expired stream token'}})});
   await route.continue();
  });
  await secondaryPage.goto('/');
  await expect(secondaryPage.getByText('Workspace ready',{exact:true})).toBeVisible();
  await secondaryPage.getByRole('button',{name:'Catalog',exact:true}).click();
  await expect(secondaryPage.getByText('Real coffee updated',{exact:true})).toBeVisible();
  await expect.poll(()=>streamAttempts,{timeout:30_000}).toBeGreaterThanOrEqual(2);
  await expect.poll(async()=>Number((await pool.query('SELECT count(*)::int AS count FROM api_refresh_tokens t JOIN api_refresh_families f ON f.id=t.family_id WHERE f.session_id=$1',[sessionId])).rows[0].count),{timeout:30_000}).toBeGreaterThanOrEqual(tokensBeforeSecondary+2);

  const lockCallsBefore=await Promise.all([page.evaluate(()=>((window as any).__serveosRefreshLockCalls||0)),secondaryPage.evaluate(()=>((window as any).__serveosRefreshLockCalls||0))]);
  await pool.query("UPDATE api_access_tokens SET issued_at=now()-interval '16 minutes',expires_at=now()-interval '1 second' WHERE session_id=$1 AND revoked_at IS NULL",[sessionId]);
  const tokensBeforeCrossTab=Number((await pool.query('SELECT count(*)::int AS count FROM api_refresh_tokens t JOIN api_refresh_families f ON f.id=t.family_id WHERE f.session_id=$1',[sessionId])).rows[0].count);
  await Promise.all([
   page.getByRole('button',{name:'Synchronize',exact:true}).first().click(),
   secondaryPage.getByRole('button',{name:'Synchronize',exact:true}).first().click(),
  ]);
  await expect.poll(async()=>Number((await pool.query('SELECT count(*)::int AS count FROM api_refresh_tokens t JOIN api_refresh_families f ON f.id=t.family_id WHERE f.session_id=$1',[sessionId])).rows[0].count),{timeout:30_000}).toBeGreaterThanOrEqual(tokensBeforeCrossTab+2);
  expect(await page.evaluate(()=>((window as any).__serveosRefreshLockCalls||0))).toBeGreaterThan(lockCallsBefore[0]);
  expect(await secondaryPage.evaluate(()=>((window as any).__serveosRefreshLockCalls||0))).toBeGreaterThan(lockCallsBefore[1]);
  await expect(page.getByText('Real coffee updated',{exact:true})).toBeVisible();
  await expect(secondaryPage.getByText('Real coffee updated',{exact:true})).toBeVisible();
  await secondaryPage.close();secondaryPage=undefined;

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
  await count.getByRole('button',{name:'Continuous scanner session',exact:true}).click();
  await count.getByLabel('Scan a barcode',{exact:true}).focus();
  await page.keyboard.type('616000012',{delay:10});
  await page.keyboard.press('Enter');
  await expect(count.getByLabel('Counted quantity for Real remote change',{exact:true})).toHaveValue('12');
  await count.getByRole('button',{name:'Review count',exact:true}).click();
  await count.getByRole('button',{name:'Confirm Count',exact:true}).click();
  await expect(count).toHaveCount(0);
  expect((await pool.query('SELECT quantity::text,version::text FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND location_id=$3',[businessId,stockId,locationId])).rows[0]).toMatchObject({quantity:'12.000000',version:'1'});
  await page.getByRole('button',{name:'Quick count',exact:true}).click();
  const quickCount=page.getByRole('dialog',{name:'Quick count',exact:true});
  await quickCount.getByRole('button',{name:'Real store',exact:true}).click();
  await quickCount.getByRole('checkbox',{name:'Real remote change',exact:true}).check();
  await quickCount.getByRole('button',{name:'Start selected count',exact:true}).click();
  await quickCount.getByLabel('Counted quantity for Real remote change',{exact:true}).fill('12');
  await quickCount.getByRole('button',{name:'Review count',exact:true}).click();
  await quickCount.getByRole('button',{name:'Confirm Count',exact:true}).click();
  await expect(quickCount).toHaveCount(0);
  expect((await pool.query("SELECT scope,item_count FROM inventory_stock_counts WHERE business_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[businessId])).rows[0]).toMatchObject({scope:'SELECTED',item_count:1});
  const persisted=await page.evaluate(async()=>{
   const entry=(await indexedDB.databases()).find(db=>db.name?.startsWith('servos-api-v1:'))!;
   return new Promise<any>((resolve,reject)=>{const opening=indexedDB.open(entry.name!);opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{const db=opening.result,tx=db.transaction(['records','queue'],'readonly');const records=tx.objectStore('records').getAll(),queue=tx.objectStore('queue').getAll();tx.oncomplete=()=>{resolve({records:records.result,queue:queue.result});db.close()};tx.onabort=()=>reject(tx.error)}});
  });
  expect(persisted.records.find((record:{id:string})=>record.id===stockId)).toMatchObject({version:4,data:{name:'Real remote change',balanceVersions:{[locationId]:1}}});
  expect(persisted.records.find((record:{id:string})=>record.id===product.id)).toMatchObject({collection:'products',version:3,data:{name:'Real brewed coffee',priceMinor:15025,inventoryType:'RECIPE'}});
  // The local acknowledged-command history is intentionally disposable with
  // this projection database; the API projection and authoritative catalog
  // survive, while the two post-recovery count commands are the only local rows.
  expect(persisted.queue).toHaveLength(2);expect(persisted.queue.every((entry:{state:string})=>entry.state==='SYNCHRONIZED')).toBe(true);
  expect(legacyRequests).toEqual([]);
  expect((await pool.query('SELECT count(*)::int AS total FROM api_commands WHERE business_id=$1 AND status=$2',[businessId,'CONFIRMED'])).rows[0].total).toBe(9);
 }finally{
  if(secondaryPage&&!secondaryPage.isClosed())await secondaryPage.close();
  try{if(!page.isClosed())await page.goto('about:blank')}finally{
   if(server){const closingServer=server;closingServer.closeAllConnections();await new Promise<void>(resolve=>closingServer.close(()=>resolve()))}
   await pool.end();
  }
 }
});
