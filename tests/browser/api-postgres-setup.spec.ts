import {test,expect} from '@playwright/test';
import type {IncomingMessage} from 'node:http';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createApiServer,authenticateSession} from '../../apps/api/src/server.mjs';
import {PostgresStore} from '../../apps/api/src/postgres-store.mjs';
import {migrate} from '../../apps/api/src/migrate.mjs';
import {createApiCommandRegistry} from '../../apps/api/src/command-registry.mjs';

test('fresh-browser onboarding covers stocked sale, printer recovery, refund and close-day reconciliation',async({page},testInfo)=>{
 test.skip(!process.env.TEST_DATABASE_URL||!['api-postgres','api-postgres-mobile'].includes(testInfo.project.name),'Requires a real API browser project and a disposable TEST_DATABASE_URL.');
 const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
 const {Pool}=requireApi('pg');
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:2});
 const schema=`browser_setup_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:10,options:`-c search_path=${schema},public`});
 const priorSetupSecret=process.env.INITIAL_ADMIN_SETUP_SECRET;
 let businessId='',staffId='';
 let restoreDatabase='';
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
  await page.addInitScript(()=>{
   (window as unknown as {__serveosTestPrintCount:number}).__serveosTestPrintCount=0;
   window.addEventListener('message',event=>{if(event.data?.type==='serveos-test-print'){
    const testWindow=window as unknown as {__serveosTestPrintCount:number};testWindow.__serveosTestPrintCount++;
   }});
   const srcdoc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');
   if(srcdoc?.set&&srcdoc.configurable)Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{...srcdoc,set(value:string){
    const printStub='<script>window.print=function(){window.top.postMessage({type:"serveos-test-print"},"*")};</script>';
    srcdoc.set!.call(this,value.replace('<body>','<body>'+printStub));
   }});
  });
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
  await page.getByRole('button',{name:'New stock item',exact:true}).click();
  const stockForm=page.getByRole('dialog',{name:'New stock',exact:true});
  await stockForm.getByLabel('Name',{exact:true}).fill('Acceptance tea stock');
  await stockForm.getByLabel('Code / SKU',{exact:true}).fill('ACCEPTANCE-TEA-STOCK');
  await stockForm.getByLabel('Base unit',{exact:true}).fill('g');
  await stockForm.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Acceptance tea stock',{exact:true}).first()).toBeVisible();
  const stock=(await pool.query('SELECT id FROM stock_items WHERE business_id=$1 AND code=$2',[businessId,'ACCEPTANCE-TEA-STOCK'])).rows[0];

  await page.getByRole('button',{name:'New product',exact:true}).click();
  const productForm=page.getByRole('dialog',{name:'New product',exact:true});
  await productForm.getByLabel('Name',{exact:true}).fill('First sale tea');
  await productForm.getByLabel('Code / SKU',{exact:true}).fill('FIRST-SALE-TEA');
  await productForm.getByLabel('Price (KES)',{exact:true}).fill('100.00');
  await page.getByRole('combobox',{name:'Tax class',exact:true}).selectOption('B_0');
  await productForm.getByLabel('Recipe stock ingredient',{exact:true}).selectOption(stock.id);
  await productForm.getByLabel('Recipe ingredient quantity',{exact:true}).fill('10');
  await productForm.getByRole('button',{name:'Add',exact:true}).click();
  await productForm.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('First sale tea',{exact:true})).toBeVisible();
  const product=(await pool.query('SELECT id,price_minor FROM products WHERE business_id=$1 AND code=$2',[businessId,'FIRST-SALE-TEA'])).rows[0];
  expect(product).toMatchObject({price_minor:'10000'});

  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await page.getByRole('button',{name:'Count stock',exact:true}).click();
  const stockCount=page.getByRole('dialog',{name:'Count stock at a location',exact:true});
  await stockCount.getByLabel('Physical quantity (g)',{exact:true}).fill('500');
  await stockCount.getByLabel('Count note',{exact:true}).fill('Initial disposable acceptance stock count');
  await stockCount.getByRole('button',{name:'Review and record count',exact:true}).click();
  await expect(stockCount).toBeHidden();
  const startingStock=(await pool.query('SELECT quantity::text AS quantity FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2',[businessId,stock.id])).rows[0];
  expect(startingStock.quantity).toBe('500.000000');

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
  const consumedStock=(await pool.query(`SELECT b.quantity::text AS quantity,COUNT(*)::int AS consumption_count,
    SUM(c.quantity)::text AS consumed_quantity,COUNT(m.id)::int AS movement_count,MAX(m.movement_type) AS movement_type
    FROM inventory_location_balances b
    JOIN pos_stock_consumptions c ON c.business_id=b.business_id AND c.stock_item_id=b.stock_item_id AND c.order_id=$3
    JOIN inventory_movements m ON m.business_id=c.business_id AND m.id=c.movement_id
    WHERE b.business_id=$1 AND b.stock_item_id=$2 GROUP BY b.quantity`,[businessId,stock.id,order.id])).rows[0];
  expect(consumedStock).toMatchObject({quantity:'490.000000',consumption_count:1,consumed_quantity:'10.000000',movement_count:1,movement_type:'SALE_CONSUMPTION'});

  const receiptJob=(await pool.query(`SELECT j.id,j.state,d.document_number,d.snapshot
    FROM document_print_jobs j JOIN business_documents d ON d.business_id=j.business_id AND d.id=j.document_id
    WHERE j.business_id=$1 AND d.document_type='SALES_RECEIPT' AND d.snapshot->>'orderId'=$2`,[businessId,order.id])).rows[0];
  expect(receiptJob).toMatchObject({state:'QUEUED'});
  expect(receiptJob.snapshot).toMatchObject({orderName:'Counter sale',totalMinor:10000,payments:[{method:'CASH',amountMinor:10000}]});
  const printing=page.locator('[data-guide-anchor="documents.printing"]');
  const receiptOption=printing.locator('option').filter({hasText:receiptJob.document_number});
  await expect(receiptOption).toHaveCount(1);
  const receiptJobOptionId=await receiptOption.getAttribute('value');
  expect(receiptJobOptionId).toBe(receiptJob.id);
  await printing.locator('select').selectOption(receiptJobOptionId!);
  await printing.getByText('Preview issued document',{exact:true}).click();
  const receiptPreview=printing.locator('article[aria-label="Sales receipt"]');
  await expect(receiptPreview).toHaveAttribute('data-paper-profile','thermal-80mm');
  await expect(receiptPreview).toContainText('Kijani Cafe');
  await expect(receiptPreview).toContainText('ISSUED');
  await expect(receiptPreview).toContainText('Copy status: ORIGINAL');
  await expect(receiptPreview).toContainText('Developed By Kingsforge, 0746157440');
  await expect(receiptPreview).toContainText('Payment status: Settled when issued; tender recorded KES 100.00.');
  await expect(receiptPreview).toContainText('First sale tea');
  await expect(receiptPreview).toContainText('100.00');
  await expect(receiptPreview).toContainText('CASH');
  await printing.getByRole('button',{name:'Print with browser',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>((window as unknown as {__serveosTestPrintCount:number}).__serveosTestPrintCount))).toBe(1);
  await expect.poll(async()=>(await pool.query('SELECT state FROM document_print_jobs WHERE business_id=$1 AND id=$2',[businessId,receiptJob.id])).rows[0]?.state).toBe('DELIVERY_UNCERTAIN');
  await expect(printing.getByRole('status')).toContainText('browser print dialog cannot confirm paper delivery');
  await printing.getByLabel('Delivery review reason',{exact:true}).fill('Headless browser cannot verify paper delivery');
  await printing.getByLabel('I checked the printer and accept that retrying may print a duplicate',{exact:true}).check();
  await printing.getByRole('button',{name:'Requeue after review',exact:true}).click();
  await expect.poll(async()=>(await pool.query('SELECT state FROM document_print_jobs WHERE business_id=$1 AND id=$2',[businessId,receiptJob.id])).rows[0]?.state).toBe('QUEUED');
  const retryEvent=(await pool.query(`SELECT event_type,reason,possible_duplicate_acknowledged
    FROM document_print_events WHERE business_id=$1 AND job_id=$2 ORDER BY job_version DESC LIMIT 1`,[businessId,receiptJob.id])).rows[0];
  expect(retryEvent).toMatchObject({event_type:'print.retry',reason:'Headless browser cannot verify paper delivery',possible_duplicate_acknowledged:true});

  await page.getByRole('button',{name:'Refunds',exact:true}).click();
  const refundView=page.getByRole('heading',{name:'Refunds and payment reversals',exact:true}).locator('..');
  await refundView.getByRole('button',{name:'Review return',exact:true}).click();
  const refundReview=page.getByRole('dialog',{name:'Review payment return',exact:true});
  await refundReview.getByLabel('Amount returned (KES)',{exact:true}).fill('100.00');
  await refundReview.getByLabel('Reason',{exact:true}).fill('Cash returned in disposable acceptance');
  await refundReview.getByLabel('I confirm that these funds were actually returned',{exact:true}).check();
  await refundReview.getByRole('button',{name:'Confirm refund',exact:true}).click();
  await expect(refundView.getByRole('status')).toContainText('Return confirmed.');
  const recordedRefund=(await pool.query(`SELECT amount_minor,method FROM payment_refunds
    WHERE business_id=$1 AND order_id=$2`,[businessId,order.id])).rows[0];
  expect(recordedRefund).toMatchObject({amount_minor:'10000',method:'CASH'});
  const refundDrawer=(await pool.query("SELECT count(*)::int AS count FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2 AND kind='REFUND' AND amount_delta_minor=-10000",[businessId,till.id])).rows[0];
  expect(refundDrawer.count).toBe(1);
  const postReturnStock=(await pool.query('SELECT quantity::text AS quantity FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2',[businessId,stock.id])).rows[0];
  expect(postReturnStock.quantity).toBe('490.000000');

  await page.getByRole('button',{name:'POS',exact:true}).click();
  const shiftPanel=page.locator('[data-guide-anchor="pos.shift"]');
  await shiftPanel.getByRole('button',{name:'Count and close shift',exact:true}).click();
  const closeReview=page.getByRole('dialog',{name:'Review till action',exact:true});
  await closeReview.getByLabel('Counted drawer cash (KES)',{exact:true}).fill('500.00');
  await closeReview.getByLabel('Count / variance explanation',{exact:true}).fill('Counted disposable acceptance shift');
  await closeReview.getByRole('button',{name:'Submit cash count',exact:true}).click();
  await expect(closeReview).toBeHidden();
  const closedTill=(await pool.query(`SELECT status,opening_float_minor,counted_cash_minor,expected_cash_minor,variance_minor
    FROM till_sessions WHERE business_id=$1 AND id=$2`,[businessId,till.id])).rows[0];
  expect(closedTill).toMatchObject({status:'CLOSED',opening_float_minor:'50000',counted_cash_minor:'50000',expected_cash_minor:'50000',variance_minor:'0'});

  await page.getByRole('button',{name:'Activity & sync',exact:true}).click();
  const closeDay=page.locator('[data-guide-anchor="finance.close-day"]');
  await closeDay.getByRole('button',{name:new RegExp(`Review report for till ${till.id}`)}).click();
  const reportReview=page.getByRole('dialog',{name:'Issue immutable close-day report',exact:true});
  await reportReview.getByRole('button',{name:'Issue report',exact:true}).click();
  await expect(closeDay.getByRole('status')).toContainText('Close-day report issued.');
  const closeReport=(await pool.query(`SELECT d.snapshot FROM close_day_reports r
    JOIN business_documents d ON d.business_id=r.business_id AND d.id=r.document_id
    WHERE r.business_id=$1 AND r.till_session_id=$2`,[businessId,till.id])).rows[0];
  expect(closeReport.snapshot).toMatchObject({
   settledSales:{grossMinor:10000,netMinor:10000,vatMinor:0,levyMinor:0},
   sales:{receivedMinor:10000,returnedMinor:10000,netReceivedMinor:0},
   cash:{openingFloatMinor:50000,salesMinor:10000,refundsMinor:10000,expectedMinor:50000,countedMinor:50000,varianceMinor:0},
  });
  const closeDayPreview=closeDay.locator('article[aria-label="Close-day report"]');
  await expect(closeDayPreview).toHaveAttribute('data-paper-profile','a4-landscape');
  await expect(closeDayPreview).toContainText('Shift / report period');
  await expect(closeDayPreview).toContainText('Developed By Kingsforge, 0746157440');
  if(process.env.TEST_PG_CONTAINER){
   restoreDatabase=`serveos_restore_${randomUUID().replaceAll('-','')}`;
   await adminPool.query(`CREATE DATABASE "${restoreDatabase}"`);
   const databaseUrl=new URL(process.env.TEST_DATABASE_URL!);
   const pgUser=decodeURIComponent(databaseUrl.username),sourceDatabase=decodeURIComponent(databaseUrl.pathname.slice(1));
   const restoreReport=execFileSync('docker',[
    'exec','-i','--env','PGHOST=/var/run/postgresql','--env',`PGUSER=${pgUser}`,'--env',`PGDATABASE=${sourceDatabase}`,
    '--env',`RESTORE_DATABASE=${restoreDatabase}`,'--env',`PGOPTIONS=-c search_path=${schema},public`,process.env.TEST_PG_CONTAINER,'sh','-s',
   ],{input:readFileSync(new URL('../../apps/backup/rehearse-local.sh',import.meta.url)),encoding:'utf8',maxBuffer:1_000_000});
   expect(restoreReport).toContain('"financialAndInventoryTotalsMatch":true');
  }
 }finally{
  if(!page.isClosed())await page.goto('about:blank').catch(()=>undefined);
  if(server){const closingServer=server;closingServer.closeAllConnections();await new Promise<void>(resolve=>closingServer.close(()=>resolve()))}
  await pool.end();
  if(restoreDatabase)await adminPool.query(`DROP DATABASE IF EXISTS "${restoreDatabase}" WITH (FORCE)`).catch(()=>undefined);
  await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await adminPool.end();
  if(priorSetupSecret===undefined)delete process.env.INITIAL_ADMIN_SETUP_SECRET;else process.env.INITIAL_ADMIN_SETUP_SECRET=priorSetupSecret;
 }
});

test('hotel first use creates a room, checks in a guest and settles the first stay',async({page},testInfo)=>{
 test.setTimeout(180_000);
 test.skip(!process.env.TEST_DATABASE_URL||!['api-postgres','api-postgres-mobile'].includes(testInfo.project.name),'Requires a real API browser project and a disposable TEST_DATABASE_URL.');
 const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
 const {Pool}=requireApi('pg');
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:2});
 const schema=`browser_hotel_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:10,options:`-c search_path=${schema},public`});
 const priorSetupSecret=process.env.INITIAL_ADMIN_SETUP_SECRET;
 const loginName=`hotel-${randomUUID()}@example.invalid`;
 const password='Disposable-Hotel-Owner-2026';
 const setupSecret=`disposable-${randomUUID()}-${randomUUID()}`;
 let businessId='';
 let server:ReturnType<typeof createApiServer>|undefined;
 try{
  await migrate(pool);
  const store=new PostgresStore(pool);
  process.env.INITIAL_ADMIN_SETUP_SECRET=setupSecret;
  server=createApiServer({store,registry:createApiCommandRegistry(),authenticate:(request:IncomingMessage)=>authenticateSession(request,store),origin:'http://127.0.0.1:3020'});
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(4317,'127.0.0.1',resolve)});
  await page.goto('/');
  await page.getByRole('button',{name:'Set up a new business',exact:true}).click();
  await page.getByLabel('Business name',{exact:true}).fill('Disposable Hotel Setup');
  await page.getByLabel('Administrator name',{exact:true}).fill('Hotel Setup Owner');
  await page.getByLabel('Login name',{exact:true}).fill(loginName);
  await page.getByLabel('One-time setup key',{exact:true}).fill(setupSecret);
  await page.getByLabel('Administrator password',{exact:true}).fill(password);
  await page.getByLabel('Confirm administrator password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Create administrator',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('The initial administrator was created.');
  businessId=(await pool.query('SELECT id FROM businesses WHERE name=$1',['Disposable Hotel Setup'])).rows[0].id;

  await page.getByLabel('Staff login',{exact:true}).fill(loginName);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Business identity',exact:true})).toBeVisible({timeout:30_000});
  await page.getByLabel('Registered business name').fill('Kijani Lodge');
  await page.getByLabel('Business category').selectOption('ACCOMMODATION');
  await page.getByLabel('Receipt display name').fill('Kijani Lodge');
  await page.getByRole('radio').first().check();
  await page.getByRole('button',{name:'Save and continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Business type',exact:true})).toBeVisible();
  await page.getByRole('radio',{name:/Hotel \/ Resort/}).check();
  await page.getByLabel('Storage location').fill('Property Store');
  await page.getByLabel('Outlet name').nth(0).fill('Main Property');
  await page.getByLabel('Outlet name').nth(1).fill('Front Desk');
  await page.getByRole('button',{name:'Save and continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Outlets and payments',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save and review',exact:true}).click();
  await page.getByRole('button',{name:'Save business defaults',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Business settings, outlet, storage, and selected payment accounts are saved. Review the checklist, then finish setup.',{timeout:30_000});
  await expect(page.getByRole('button',{name:'Finish and open workspace',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Finish and open workspace',exact:true}).click();
  await page.getByRole('button',{name:'Rooms & rates',exact:true}).click();

  const typeForm=page.getByRole('heading',{name:'Room types',exact:true}).locator('xpath=..');
  await typeForm.getByLabel('Name',{exact:true}).fill('Standard Room');
  await typeForm.getByLabel('Code',{exact:true}).fill('STANDARD');
  await typeForm.getByLabel('Maximum guests',{exact:true}).fill('2');
  await typeForm.getByRole('button',{name:'Add room type',exact:true}).click();
  await expect(typeForm.getByText('Standard Room · up to 2',{exact:true})).toBeVisible();

  const roomForm=page.getByRole('heading',{name:'Add room',exact:true}).locator('xpath=..');
  await roomForm.getByLabel('Room number',{exact:true}).fill('101');
  const roomTypeSelect=roomForm.locator('select');
  const roomTypeOption=roomTypeSelect.locator('option').filter({hasText:'Standard Room'});
  await expect(roomTypeOption).toHaveCount(1);
  await roomTypeSelect.selectOption(await roomTypeOption.getAttribute('value')||'');
  await roomForm.getByLabel('Guest capacity',{exact:true}).fill('2');
  await roomForm.getByLabel('Turnaround minutes',{exact:true}).fill('30');
  await roomForm.getByRole('button',{name:'Add room',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Room 101',exact:true})).toBeVisible();

  const rateForm=page.getByRole('heading',{name:'Add rate plan',exact:true}).locator('xpath=..');
  await rateForm.getByLabel('Name',{exact:true}).fill('Standard nightly');
  const rateTypeSelect=rateForm.locator('select').first();
  const rateTypeOption=rateTypeSelect.locator('option').filter({hasText:'Standard Room'});
  await expect(rateTypeOption).toHaveCount(1);
  await rateTypeSelect.selectOption(await rateTypeOption.getAttribute('value')||'');
  await rateForm.locator('select').nth(1).selectOption('NIGHTLY');
  await rateForm.getByLabel('Rate (KES)',{exact:true}).fill('2500.00');
  await rateForm.getByLabel('Tax rate (%)',{exact:true}).fill('0');
  await rateForm.getByRole('button',{name:'Add rate plan',exact:true}).click();
  await expect(rateForm.getByText(/Standard nightly.*2,500\.00 \(nightly\)/)).toBeVisible();

  await page.getByRole('button',{name:'Master data',exact:true}).click();
  const customersView=page.locator('section[aria-label="API customers"]');
  await page.getByRole('button',{name:'Add customer',exact:true}).click();
  const customerForm=page.getByRole('dialog',{name:'Edit API customer',exact:true});
  await customerForm.getByLabel('Name',{exact:true}).fill('Amina Hotel Guest');
  await customerForm.getByLabel('Change reason',{exact:true}).fill('Disposable hotel onboarding acceptance');
  await customerForm.getByRole('button',{name:'Save customer',exact:true}).click();
  await expect(customersView.getByText('Customer saved and confirmed.',{exact:true})).toBeVisible({timeout:15_000});

  await page.getByRole('button',{name:'Rooms & rates',exact:true}).click();
  const reservationForm=page.locator('[data-guide-anchor="rooms.reservation"]');
  await expect(reservationForm.getByRole('status')).toContainText('1 room(s) available');
  const reservationSelects=reservationForm.locator('select');
  await reservationSelects.nth(0).selectOption({label:'Room 101'});
  const reservationRateOption=reservationSelects.nth(1).locator('option').filter({hasText:'Standard nightly'});
  await expect(reservationRateOption).toHaveCount(1);
  await reservationSelects.nth(1).selectOption(await reservationRateOption.getAttribute('value')||'');
  await reservationSelects.nth(2).selectOption({label:'Amina Hotel Guest'});
  await reservationForm.getByRole('button',{name:'Walk in and check in',exact:true}).click();
  await expect(page.getByText('Walk-in checked in.',{exact:true})).toBeVisible();
  const stay=(await pool.query(`SELECT r.id,r.status AS reservation_status,s.status AS stay_status,r.quoted_amount_minor
    FROM business_room_reservations r JOIN business_stays s ON s.business_id=r.business_id AND s.id=r.id
    WHERE r.business_id=$1`,[businessId])).rows[0];
  expect(stay).toMatchObject({reservation_status:'CHECKED_IN',stay_status:'CHECKED_IN',quoted_amount_minor:'250000'});

  await page.getByRole('button',{name:'Guest Accounts',exact:true}).click();
  const guestAccounts=page.locator('[data-guide-anchor="web.guest-accounts"]');
  await guestAccounts.getByLabel('Select a guest account',{exact:true}).selectOption(stay.id);
  await guestAccounts.getByRole('button',{name:'Post booked accommodation',exact:true}).click();
  await expect(guestAccounts.getByRole('status')).toContainText('Guest account action confirmed and synchronized.');
  const cash=(await pool.query("SELECT id FROM payment_accounts WHERE business_id=$1 AND method='CASH' AND archived_at IS NULL",[businessId])).rows[0];
  await guestAccounts.getByRole('combobox',{name:'Payment account',exact:true}).selectOption(cash.id);
  await guestAccounts.getByLabel('Amount (KES)',{exact:true}).fill('2500.00');
  await guestAccounts.getByLabel('Cash tendered (KES)',{exact:true}).fill('2500.00');
  await guestAccounts.getByRole('button',{name:'Settle balance',exact:true}).click();
  await expect(guestAccounts.getByRole('status')).toContainText('Guest account action confirmed and synchronized.');
  page.on('response',async response=>{if(response.url().endsWith('/v1/commands')&&response.status()>=400){const request=response.request();console.log('HOTEL_COMMAND_FAILURE',response.status(),JSON.stringify({command:request.postDataJSON(),error:await response.json()}));}});
  const feedDump=await pool.query(`SELECT cursor,command_id,change_type,projection->'records' AS records FROM business_changes WHERE business_id=$1 ORDER BY cursor`,[businessId]);
  for(const row of feedDump.rows){const recs=(row.records||[]).filter((r:any)=>['folios','stays','roomReservations','rooms','folioEntries'].includes(r.collection));if(recs.length)console.log('FEED_DUMP',row.cursor,row.change_type,JSON.stringify(recs.map((r:any)=>({c:r.collection,id:String(r.id).slice(0,8),v:r.version}))));}
  await guestAccounts.getByRole('button',{name:'Check out guest',exact:true}).click();
  await expect(guestAccounts.getByRole('status')).toContainText('Guest account action confirmed and synchronized.');

  const result=(await pool.query(`SELECT s.configuration->>'businessType' AS business_type,
    (SELECT count(*)::int FROM business_room_types WHERE business_id=$1) AS room_types,
    (SELECT count(*)::int FROM business_rooms WHERE business_id=$1 AND number='101') AS rooms,
    (SELECT count(*)::int FROM business_room_rate_plans WHERE business_id=$1 AND price_minor=250000) AS rates,
    r.status AS reservation_status,st.status AS stay_status,f.status AS folio_status,
    f.balance_minor,he.accommodation_count,he.accommodation_minor,hp.payment_count,hp.payment_minor,hp.cash_tendered_minor
    FROM business_setup s
    JOIN business_room_reservations r ON r.business_id=s.business_id
    JOIN business_stays st ON st.business_id=r.business_id AND st.id=r.id
    JOIN business_folios f ON f.business_id=r.business_id AND f.id=r.id
    CROSS JOIN LATERAL (SELECT count(*)::int AS accommodation_count,COALESCE(sum(amount_minor),0)::text AS accommodation_minor
      FROM business_folio_entries WHERE business_id=s.business_id AND folio_id=r.id AND source_type='ACCOMMODATION') he
    CROSS JOIN LATERAL (SELECT count(*)::int AS payment_count,COALESCE(sum(amount_minor),0)::text AS payment_minor,COALESCE(sum(cash_tendered_minor),0)::text AS cash_tendered_minor
      FROM business_hospitality_payments WHERE business_id=s.business_id AND folio_id=r.id AND purpose='SETTLEMENT') hp
    WHERE s.business_id=$1`,[businessId])).rows[0];
  expect(result).toMatchObject({business_type:'HOTEL_RESORT',room_types:1,rooms:1,rates:1,reservation_status:'CHECKED_OUT',stay_status:'CHECKED_OUT',folio_status:'CLOSED',balance_minor:'0',accommodation_count:1,accommodation_minor:'250000',payment_count:1,payment_minor:'250000',cash_tendered_minor:'250000'});
 }finally{
  if(!page.isClosed())await page.goto('about:blank').catch(()=>undefined);
  if(server){const closingServer=server;closingServer.closeAllConnections();await new Promise<void>(resolve=>closingServer.close(()=>resolve()))}
  await pool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await adminPool.end();
  if(priorSetupSecret===undefined)delete process.env.INITIAL_ADMIN_SETUP_SECRET;else process.env.INITIAL_ADMIN_SETUP_SECRET=priorSetupSecret;
 }
});
