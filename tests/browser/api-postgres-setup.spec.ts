import {test,expect} from '@playwright/test';
import type {IncomingMessage} from 'node:http';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createApiServer,authenticateSession} from '../../apps/api/src/server.mjs';
import {PostgresStore} from '../../apps/api/src/postgres-store.mjs';
import {migrate} from '../../apps/api/src/migrate.mjs';
import {createApiCommandRegistry} from '../../apps/api/src/command-registry.mjs';

test('browser first-admin setup leads through onboarding to a complete first cash sale',async({page},testInfo)=>{
 test.skip(!process.env.TEST_DATABASE_URL||testInfo.project.name!=='api-postgres','Requires the dedicated API browser project and a disposable TEST_DATABASE_URL.');
 const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
 const {Pool}=requireApi('pg');
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:2});
 const schema=`browser_setup_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:10,options:`-c search_path=${schema},public`});
 const priorSetupSecret=process.env.INITIAL_ADMIN_SETUP_SECRET;
 let businessId='',staffId='';
 const loginName=`setup-${randomUUID()}@example.invalid`;
 const password='Disposable-Setup-Owner-2026';
 const setupSecret=`disposable-${randomUUID()}-${randomUUID()}`;
 let server:ReturnType<typeof createApiServer>|undefined;
 try{
  await migrate(pool);
  const store=new PostgresStore(pool);
  process.env.INITIAL_ADMIN_SETUP_SECRET=setupSecret;
  server=createApiServer({store,registry:createApiCommandRegistry(),authenticate:(request:IncomingMessage)=>authenticateSession(request,store),origin:'http://127.0.0.1:3020'});
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(4317,'127.0.0.1',resolve)});
  await page.goto('/');
  await page.getByRole('button',{name:'Set up a new business',exact:true}).click();
  await page.getByLabel('Business name',{exact:true}).fill('Disposable Cafe Setup');
  await page.getByLabel('Administrator name',{exact:true}).fill('Setup Owner');
  await page.getByLabel('Login name',{exact:true}).fill(loginName);
  await page.getByLabel('One-time setup key',{exact:true}).fill(setupSecret);
  await page.getByLabel('Administrator password',{exact:true}).fill(password);
  await page.getByLabel('Confirm administrator password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Create administrator',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('The initial administrator was created.');
  expect(process.env.INITIAL_ADMIN_SETUP_SECRET).toBeUndefined();
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain(setupSecret);
  businessId=(await pool.query('SELECT id FROM businesses WHERE name=$1',['Disposable Cafe Setup'])).rows[0].id;
  staffId=(await pool.query('SELECT staff_id AS id FROM api_staff_profiles WHERE business_id=$1 AND login_name=$2',[businessId,loginName])).rows[0].id;

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

  await page.getByRole('button',{name:'Catalog',exact:true}).click();
  await page.getByRole('button',{name:'New product',exact:true}).click();
  const productForm=page.getByRole('dialog',{name:'New product',exact:true});
  await productForm.getByLabel('Name',{exact:true}).fill('First sale tea');
  await productForm.getByLabel('Code / SKU',{exact:true}).fill('FIRST-SALE-TEA');
  await productForm.getByLabel('Price (KES)',{exact:true}).fill('100.00');
  await page.getByRole('combobox',{name:'Tax class',exact:true}).selectOption('B_0');
  await productForm.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('First sale tea',{exact:true})).toBeVisible();
  const product=(await pool.query('SELECT id,price_minor FROM products WHERE business_id=$1 AND code=$2',[businessId,'FIRST-SALE-TEA'])).rows[0];
  expect(product).toMatchObject({price_minor:'10000'});

  await page.getByRole('button',{name:'POS',exact:true}).click();
  await page.getByRole('button',{name:'Start shift',exact:true}).click();
  const shiftReview=page.getByRole('dialog',{name:'Review till action',exact:true});
  await shiftReview.getByLabel('Opening float (KES)',{exact:true}).fill('500.00');
  await shiftReview.getByRole('button',{name:'Start shift',exact:true}).click();
  await expect(shiftReview).toBeHidden();
  const till=(await pool.query("SELECT id,status,opening_float_minor FROM till_sessions WHERE business_id=$1 AND operator_id=$2 AND status='OPEN'",[businessId,staffId])).rows[0];
  expect(till).toMatchObject({status:'OPEN',opening_float_minor:'50000'});

  await page.getByRole('button',{name:/First sale tea/}).first().click();
  const saleReview=page.getByRole('dialog',{name:'Review order action',exact:true});
  await expect(saleReview.getByRole('heading',{name:'Start counter sale',exact:true})).toBeVisible();
  await saleReview.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('button',{name:/Counter sale/}).first()).toBeVisible();
  const order=(await pool.query('SELECT id,state,grand_total_minor FROM pos_orders WHERE business_id=$1 AND name=$2 ORDER BY created_at DESC LIMIT 1',[businessId,'Counter sale'])).rows[0];
  expect(order).toMatchObject({state:'OPEN',grand_total_minor:'10000'});

  await page.getByRole('button',{name:'Review and fire order',exact:true}).click();
  const fireReview=page.getByRole('dialog',{name:'Review order action',exact:true});
  await expect(fireReview.getByRole('heading',{name:'Fire reviewed order',exact:true})).toBeVisible();
  await fireReview.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.getByRole('button',{name:/Record payment for Counter sale/}).click();
  const paymentReview=page.getByRole('dialog',{name:'Review order payment',exact:true});
  await paymentReview.getByLabel('Allocated amount (KES)',{exact:true}).fill('100.00');
  await paymentReview.getByLabel('Cash physically tendered (KES)',{exact:true}).fill('100.00');
  await paymentReview.getByRole('button',{name:'Confirm received payment',exact:true}).click();
  await expect(page.locator('[data-guide-anchor="pos.payment"]').getByRole('status')).toContainText('Payment confirmed.');

  const settled=(await pool.query('SELECT state,grand_total_minor,amount_paid_minor FROM pos_orders WHERE business_id=$1 AND id=$2',[businessId,order.id])).rows[0];
  expect(settled).toMatchObject({state:'COMPLETED',grand_total_minor:'10000',amount_paid_minor:'10000'});
  const payment=(await pool.query('SELECT method,amount_minor,cash_tendered_minor,till_session_id FROM order_payments WHERE business_id=$1 AND order_id=$2',[businessId,order.id])).rows[0];
  expect(payment).toMatchObject({method:'CASH',amount_minor:'10000',cash_tendered_minor:'10000',till_session_id:till.id});
  const drawerSale=(await pool.query("SELECT count(*)::int AS count FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2 AND kind='SALE' AND amount_delta_minor=10000",[businessId,till.id])).rows[0];
  expect(drawerSale.count).toBe(1);
 }finally{
  if(!page.isClosed())await page.goto('about:blank').catch(()=>undefined);
  if(server){const closingServer=server;closingServer.closeAllConnections();await new Promise<void>(resolve=>closingServer.close(()=>resolve()))}
  await pool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await adminPool.end();
  if(priorSetupSecret===undefined)delete process.env.INITIAL_ADMIN_SETUP_SECRET;else process.env.INITIAL_ADMIN_SETUP_SECRET=priorSetupSecret;
 }
});
