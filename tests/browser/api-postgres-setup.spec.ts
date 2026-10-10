import {test,expect} from '@playwright/test';
import type {IncomingMessage} from 'node:http';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createApiServer,authenticateSession} from '../../apps/api/src/server.mjs';
import {PostgresStore} from '../../apps/api/src/postgres-store.mjs';
import {migrate} from '../../apps/api/src/migrate.mjs';
import {createApiCommandRegistry} from '../../apps/api/src/command-registry.mjs';

test('fresh PostgreSQL setup completes in the browser and resumes after refresh',async({page},testInfo)=>{
 test.skip(!process.env.TEST_DATABASE_URL||testInfo.project.name!=='api-postgres','Requires the dedicated API browser project and a disposable TEST_DATABASE_URL.');
 const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
 const {Pool}=requireApi('pg');
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:2});
 const schema=`browser_setup_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:10,options:`-c search_path=${schema},public`});
 const priorSetupSecret=process.env.INITIAL_ADMIN_SETUP_SECRET;
 const businessId=randomUUID(),staffId=randomUUID(),loginName=`setup-${staffId}@example.invalid`;
 const password='Disposable-Setup-Owner-2026';
 const setupSecret=`disposable-${randomUUID()}-${randomUUID()}`;
 let server:ReturnType<typeof createApiServer>|undefined;
 try{
  await migrate(pool);
  const store=new PostgresStore(pool);
  process.env.INITIAL_ADMIN_SETUP_SECRET=setupSecret;
  server=createApiServer({store,registry:createApiCommandRegistry(),authenticate:(request:IncomingMessage)=>authenticateSession(request,store),origin:'http://127.0.0.1:3020'});
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(4317,'127.0.0.1',resolve)});
  const initialAdmin=await fetch('http://127.0.0.1:4317/v1/setup/initial-admin',{method:'POST',headers:{'content-type':'application/json','x-serveos-setup-secret':setupSecret},body:JSON.stringify({businessId,staffId,businessName:'Disposable Cafe Setup',displayName:'Setup Owner',loginName,password})});
  expect(initialAdmin.status,await initialAdmin.text()).toBe(201);
  expect(process.env.INITIAL_ADMIN_SETUP_SECRET).toBeUndefined();

  await page.goto('/');
  await page.getByLabel('Staff login',{exact:true}).fill(loginName);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Business identity',exact:true})).toBeVisible();
  await page.getByLabel('Registered business name').fill('Kijani Cafe');
  await page.getByLabel('Business category').selectOption('FOOD_AND_BEVERAGE');
  await page.getByLabel('Receipt display name').fill('Kijani Cafe');
  await page.getByRole('radio').first().check();
  await page.getByRole('button',{name:'Save and continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Business type',exact:true})).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading',{name:'Business type',exact:true})).toBeVisible();
  await page.getByRole('radio',{name:/Restaurant/}).check();
  await page.getByLabel('Outlet name').fill('Dining Room');
  await page.getByRole('button',{name:'Save and continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Outlets and payments',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save and review',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Finish',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save business defaults',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Business settings, outlet, storage, and selected payment accounts are saved.');
  await expect(page.getByRole('button',{name:'Finish and open workspace',exact:true})).toBeEnabled();

  const beforeFinish=(await pool.query(`SELECT s.status,s.current_step,s.configuration->>'businessType' AS business_type,
    r.business_name,r.vat_rate_basis_points,o.name AS outlet_name,p.method,
    (SELECT count(*)::int FROM stock_locations l WHERE l.business_id=s.business_id) AS location_count
    FROM business_setup s
    JOIN business_receipt_settings r ON r.business_id=s.business_id
    JOIN business_outlets o ON o.business_id=s.business_id
    JOIN payment_accounts p ON p.business_id=s.business_id AND p.method='CASH'
    WHERE s.business_id=$1`,[businessId])).rows[0];
  expect(beforeFinish).toMatchObject({status:'IN_PROGRESS',current_step:3,business_type:'RESTAURANT_CAFE',business_name:'Kijani Cafe',vat_rate_basis_points:0,outlet_name:'Dining Room',method:'CASH',location_count:1});
  await page.getByRole('button',{name:'Finish and open workspace',exact:true}).click();
  await expect(page.getByRole('button',{name:'Catalog',exact:true})).toBeVisible();
  const completed=(await pool.query('SELECT status,current_step FROM business_setup WHERE business_id=$1',[businessId])).rows[0];
  expect(completed).toMatchObject({status:'COMPLETED',current_step:3});
 }finally{
  if(!page.isClosed())await page.goto('about:blank').catch(()=>undefined);
  if(server){const closingServer=server;closingServer.closeAllConnections();await new Promise<void>(resolve=>closingServer.close(()=>resolve()))}
  await pool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await adminPool.end();
  if(priorSetupSecret===undefined)delete process.env.INITIAL_ADMIN_SETUP_SECRET;else process.env.INITIAL_ADMIN_SETUP_SECRET=priorSetupSecret;
 }
});
