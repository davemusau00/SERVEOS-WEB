import {test,expect,type Page} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

// Test-only authentication/HTTP bridge; all business RPCs run in real PostgreSQL.
// This does not claim hosted Supabase Auth/PostgREST or production deployment proof.
test.describe('transactional browser with PostgreSQL',()=>{
 let container='';let running=false;let loseResponse=true;
 const docker=(args:string[],input?:string)=>{const result=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:8*1024*1024});if(result.status!==0)throw new Error(result.stderr||result.error?.message||'Docker command failed');return result.stdout};
 const sql=(source:string)=>docker(['exec','-i',container,'psql','-U','postgres','-At','-v','ON_ERROR_STOP=1'],source);
 test.beforeAll(async()=>{
  test.setTimeout(120000);container=`servos-browser-${randomUUID()}`;
  docker(['run','--rm','-d','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:18.6-bookworm']);running=true;
  let databaseReady=false;
  for(let i=0;i<60;i++){
   const logs=spawnSync('docker',['logs',container],{encoding:'utf8'});
   const initialized=`${logs.stdout||''}${logs.stderr||''}`.includes('PostgreSQL init process complete; ready for start up.');
   if(initialized&&spawnSync('docker',['exec',container,'psql','-U','postgres','-Atqc','select 1'],{stdio:'ignore'}).status===0){databaseReady=true;break}
   await new Promise(r=>setTimeout(r,1000));
  }
  if(!databaseReady)throw new Error('Disposable PostgreSQL did not accept SQL connections within 60 seconds.');
   const files=['tests/supabase/bootstrap.sql',...['supabase/migrations','supabase/expansion'].flatMap(dir=>readdirSync(dir).filter(f=>f.endsWith('.sql')).sort().map(f=>`${dir}/${f}`)),'tests/supabase/financial-controls.sql'];
  sql(files.map(f=>readFileSync(f,'utf8')).join('\n'));
   sql(`
   reset role;
   insert into servos_private.managers(user_id,role) values('00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000002','manager') on conflict(user_id) do update set role=excluded.role;
   insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']),('00000000-0000-4000-8000-000000000002',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
   insert into servos_v2.staff_profiles(auth_user_id,staff_id,name,role,created_by,updated_by) values
    ('00000000-0000-4000-8000-000000000001','browser-owner','Browser Owner','Admin','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
    ('00000000-0000-4000-8000-000000000002','browser-manager','Browser Manager','Manager','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001') on conflict(auth_user_id) do update set active=true;
   select servos_v2.put_record('organization','business','{"name":"Browser Test Business"}');
   select servos_v2.put_record('property','property','{"address":"Test Street","phone":"0700000000","currency":"KES","timezone":"Africa/Nairobi","receiptFooter":"Thank you","roomStayRoomTypeId":"timezone-room-type","roomStayRatePlanId":"timezone-rate"}');
   select servos_v2.put_record('roomTypes','timezone-room-type','{"name":"Standard","maxGuests":2}');
   select servos_v2.put_record('ratePlans','timezone-rate','{"name":"Nightly Standard","roomTypeId":"timezone-room-type","mode":"NIGHTLY","priceMinor":500000,"currency":"KES"}');
   select servos_v2.put_record('customers','front-desk-guest','{"name":"Timezone Guest","phone":"0700000099"}');
   select servos_v2.put_record('rooms','front-desk-room','{"number":"TZ-1","roomTypeId":"timezone-room-type","capacity":2,"turnaroundMinutes":30,"housekeepingState":"DIRTY","maintenanceState":"AVAILABLE"}');
   select servos_v2.put_record('rooms','quick-reservation-room','{"number":"TZ-2","roomTypeId":"timezone-room-type","capacity":2,"turnaroundMinutes":30,"housekeepingState":"CLEAN","maintenanceState":"AVAILABLE"}');
   select servos_v2.put_record('rooms','checkout-room','{"number":"TZ-3","roomTypeId":"timezone-room-type","capacity":2,"turnaroundMinutes":30,"housekeepingState":"CLEAN","maintenanceState":"AVAILABLE"}');
   select servos_v2.put_record('roomReservations','front-desk-reservation','{"customerId":"front-desk-guest","roomId":"front-desk-room","status":"RESERVED","guests":1,"startsAt":"2025-01-01T22:00:00Z","endsAt":"2025-01-02T19:00:00Z","blockedUntil":"2025-01-02T19:30:00Z"}');
   select servos_v2.put_record('customers','checkout-blocked-guest','{"name":"Blocked Checkout Guest"}');
   select servos_v2.put_record('roomReservations','checkout-blocked','{"customerId":"checkout-blocked-guest","roomId":"checkout-room","status":"CHECKED_IN","units":2,"guests":1,"startsAt":"2030-01-01T07:00:00Z","endsAt":"2030-01-03T07:00:00Z"}');
   select servos_v2.put_record('stays','checkout-blocked','{"roomId":"checkout-room","status":"CHECKED_IN"}');
   select servos_v2.put_record('folios','checkout-blocked','{"status":"OPEN","balanceMinor":0,"depositMinor":0}');
   select servos_v2.put_record('customers','checkout-ready-guest','{"name":"Ready Checkout Guest"}');
   select servos_v2.put_record('roomReservations','checkout-ready','{"customerId":"checkout-ready-guest","roomId":"checkout-room","status":"CHECKED_IN","units":1,"guests":1,"startsAt":"2030-01-01T07:00:00Z","endsAt":"2030-01-02T07:00:00Z"}');
   select servos_v2.put_record('stays','checkout-ready','{"roomId":"checkout-room","status":"CHECKED_IN"}');
   select servos_v2.put_record('folios','checkout-ready','{"status":"OPEN","balanceMinor":0,"depositMinor":0}');
   select servos_v2.put_record('folioEntries','checkout-ready-accommodation','{"sourceType":"ACCOMMODATION","reservationId":"checkout-ready","period":0}');
   select servos_v2.put_record('posPolicy','policy','{"vatBasisPoints":0,"cateringLevyBasisPoints":0,"taxInclusive":true,"currency":"KES"}');
   select servos_v2.put_record('stockLocations','web-pos-stock','{"name":"Web POS Stock","code":"WEBPOS","type":"BAR"}');
   select servos_v2.put_record('stockItems','web-count-a','{"name":"Counted Water","code":"COUNT-WATER","baseUnit":"bottle","scanUnitQuantity":1,"currentStock":{"web-pos-stock":5},"reorderLevel":0,"averageUnitCostMinor":100}');
   select servos_v2.put_record('stockItems','web-count-b','{"name":"Counted Juice","code":"COUNT-JUICE","baseUnit":"bottle","scanUnitQuantity":2,"currentStock":{"web-pos-stock":0},"reorderLevel":0,"averageUnitCostMinor":100}');
   select servos_v2.put_record('outlets','web-pos-outlet','{"name":"Browser Bar","code":"WEBPOS","defaultStockLocationId":"web-pos-stock"}');
   select servos_v2.put_record('products','web-pos-soda','{"name":"Test Soda","code":"TESTSODA","priceMinor":1250,"category":"DRINKS","portions":[],"modifiers":[],"recipeIngredients":[],"outletIds":[]}');
   select servos_v2.put_record('paymentAccounts','web-pos-cash','{"name":"Cash","method":"CASH","accountCode":"CASH"}');
   update servos_v2.control set enabled=true;
   `);
 });
 test.afterAll(()=>{if(running)docker(['stop',container])});
 const bridge=async(page:Page)=>{
  await page.route('https://servos-cloud.test/**',async route=>{
   const request=route.request();const path=new URL(request.url()).pathname;
   const payload=request.postDataJSON()||{};
   if(path==='/auth/v1/token')return route.fulfill({json:{access_token:payload.email?.startsWith('second')?'second-test-token':'first-test-token',refresh_token:'test-only',expires_in:3600}});
   const actor=request.headers().authorization?.includes('second-test-token')?'00000000-0000-4000-8000-000000000002':'00000000-0000-4000-8000-000000000001';
   const encoded=Buffer.from(JSON.stringify(payload)).toString('hex');const body=`convert_from(decode('${encoded}','hex'),'UTF8')::jsonb`;
   const calls:Record<string,string>={
    servos_is_manager:'to_jsonb(public.servos_is_manager())',
    servos_v2_session:'public.servos_v2_session()',
    servos_v2_register_device:`public.servos_v2_register_device((p->>'device_id')::uuid,p->>'label',p->>'kind')`,
    servos_v2_snapshot:`public.servos_v2_snapshot(p->>'after_collection',p->>'after_id',(p->>'expected_cursor')::bigint,p->>'expected_policy',(p->>'page_size')::integer)`,
    servos_v2_execute:`public.servos_v2_execute(p->'command')`,
    servos_v2_pull:`public.servos_v2_pull((p->>'after_sequence')::bigint,(p->>'page_size')::integer)`,
    servos_v2_list_devices:'public.servos_v2_list_devices()',
   };
   const name=path.split('/').pop()||'';if(!calls[name])return route.fulfill({status:404,json:{message:'Unsupported test route'}});
   try{
    const output=sql(`begin;select set_config('request.jwt.claim.sub','${actor}',true);set local role authenticated;select ${calls[name]} from (select ${body} p) input;commit;`);
    const result=JSON.parse(output.split(/\r?\n/).find(line=>line==='true'||line==='false'||line.startsWith('{')||line.startsWith('['))!);
    if(name==='servos_v2_execute'&&loseResponse){loseResponse=false;return route.abort('connectionreset')}
    return route.fulfill({json:result});
   }catch(error){return route.fulfill({status:String(error).includes('PERMISSION_DENIED')?403:400,json:{message:String(error)}})}
  });
 };
 const signIn=async(page:Page,email:string)=>{
  await bridge(page);await page.goto('/');
  const remoteEntry=page.getByRole('button',{name:'Remote management',exact:true});
  if(await remoteEntry.count()) await remoteEntry.click();
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('test-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'POS',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'POS',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Service workspace',exact:true})).toBeVisible();
  await expect(page.locator('body')).not.toContainText(String.raw`\n`);
 };
 test('authenticated workspace mounts Procurement, Master Data, Refunds, Settings, and KDS without blank panels or page errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await signIn(page,'first@example.test');
  await page.getByRole('button',{name:'Procurement',exact:true}).click();
  await expect(page.locator('main')).not.toBeEmpty();
   for(const tab of ['Front Desk','Guest Accounts','Housekeeping']){
    await expect(page.getByRole('button',{name:tab,exact:true})).toBeVisible();
    await page.getByRole('button',{name:tab,exact:true}).click();
    await expect(page.locator('main')).not.toBeEmpty();
   }
   await page.getByRole('button',{name:'Procurement',exact:true}).click();
  await expect(page.locator('main').getByRole('heading',{name:'Purchasing',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Master data',exact:true}).click();
   await expect(page.locator('main')).not.toBeEmpty();
   await expect(page.locator('main').getByRole('heading',{name:'Master Data',exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Refunds',exact:true}).click();
   await expect(page.locator('main')).not.toBeEmpty();
   await expect(page.locator('main').getByRole('heading',{name:'Payments & refunds',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.locator('main')).not.toBeEmpty();
  await expect(page.locator('main').getByRole('heading',{name:'Business master records',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'KDS',exact:true}).click();
  await expect(page.locator('main')).not.toBeEmpty();
  await expect(page.locator('main').getByRole('region',{name:'Kitchen and bar pass'}).getByRole('heading',{name:'Bar / Kitchen Pass',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 });
 test('Front Desk renders property-local stay times and explains check-in readiness blockers',async({page})=>{
  await signIn(page,'front-desk@example.test');
  await page.getByRole('button',{name:'Front Desk',exact:true}).click();
  await expect(page.getByText(/Africa\/Nairobi/)).toBeVisible();
  await expect(page.getByText('Timezone Guest',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('2 Jan 2025').first()).toBeVisible();
  await expect(page.getByText('Room must be clean and in service before check-in.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Check in',exact:true})).toBeDisabled();
 });
 test('Front Desk explains checkout blockers and prevents known-incomplete checkout submissions',async({page})=>{
  await signIn(page,'checkout@example.test');
  await page.getByRole('button',{name:'Front Desk',exact:true}).click();
  const readiness=page.getByRole('region',{name:'Checkout readiness'});
  await expect(readiness.getByText('Post all booked accommodation periods in Guest Accounts before checkout.')).toBeVisible();
  await expect(readiness.getByText(/Ready for checkout\. Accommodation is posted/)).toBeVisible();
  const blocked=page.locator('article').filter({has:page.getByText('Blocked Checkout Guest',{exact:true})});
  await blocked.getByRole('button',{name:'Check out',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Post all booked accommodation periods');
  expect(sql("select count(*) from servos_v2.commands where request->>'operation'='stay.checkOut';").trim()).toBe('0');
 });
 test('Quick Reservation creates a guest and reservation through queued business commands',async({page})=>{
  loseResponse=false;
  await signIn(page,'reservation@example.test');
  await page.getByRole('button',{name:'Front Desk',exact:true}).click();
  await page.getByRole('button',{name:'Quick reservation',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Quick reservation'});
  await dialog.getByLabel('Room').selectOption('quick-reservation-room');
  await dialog.getByRole('button',{name:/New guest/}).click();
  await dialog.getByLabel('Guest name').fill('Quick Booking Guest');
  await dialog.getByLabel('Phone (optional)').fill('0700000101');
  await expect(dialog.getByText(/estimated accommodation/)).toBeVisible();
  await dialog.getByRole('button',{name:'Create reservation',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(sql("select count(*) from servos_v2.records where collection='customers' and data->>'name'='Quick Booking Guest';").trim()).toBe('1');
  expect(sql("select count(*) from servos_v2.records where collection='roomReservations' and data->>'roomId'='quick-reservation-room';").trim()).toBe('1');
  expect(sql("select count(*) from servos_v2.commands where request->'payload'->>'collection'='customers';").trim()).toBe('1');
  expect(sql("select count(*) from servos_v2.commands where request->>'operation'='roomReservation.create' and result->>'status'='SYNCHRONIZED';").trim()).toBe('1');
  loseResponse=true;
 });
 test('Housekeeping queues room blocks, explicit release inspection, and maintenance reports',async({page})=>{
  loseResponse=false;
  await signIn(page,'housekeeping@example.test');
  await page.getByRole('button',{name:'Housekeeping',exact:true}).click();
  const room=page.locator('article').filter({has:page.getByText('Room TZ-2',{exact:true})});
  await room.getByRole('button',{name:'Block room',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Block room TZ-2'});
  await dialog.getByLabel('Block starts').fill('2035-05-01T10:00');
  await dialog.getByLabel('Block ends').fill('2035-05-01T11:00');
  await dialog.getByLabel('Reason').fill('Planned maintenance');
  await dialog.getByRole('button',{name:'Block room',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(sql("select count(*) from servos_v2.records where collection='roomBlocks' and data->>'roomId'='quick-reservation-room' and data->>'status'='ACTIVE';").trim()).toBe('1');
  await room.getByRole('button',{name:'Release block',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Release room block'});
  await dialog.getByLabel('Inspection and release note').fill('Inspected; room is safe to return to inventory.');
  await dialog.getByRole('button',{name:'Release block',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(sql("select count(*) from servos_v2.records where collection='roomBlocks' and data->>'status'='RELEASED' and data->>'inspection' like 'Inspected%';").trim()).toBe('1');
  await room.getByRole('button',{name:'Report maintenance',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Report maintenance · TZ-2'});
  await dialog.getByLabel('What needs attention?').fill('Bathroom tap is leaking.');
  await dialog.getByLabel('Priority').selectOption('HIGH');
  await dialog.getByRole('button',{name:'Report problem',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(sql("select count(*) from servos_v2.records where collection='maintenanceOrders' and data->>'roomId'='quick-reservation-room' and data->>'description'='Bathroom tap is leaking.' and data->>'priority'='HIGH';").trim()).toBe('1');
  loseResponse=true;
 });
 test('two operators see committed room and asset records; response-loss retry preserves one command',async({page,browser},info)=>{
  loseResponse=true;
  test.setTimeout(120000);const context2=await browser.newContext({viewport:info.project.use.viewport});const other=await context2.newPage();
  await signIn(page,'first@example.test');await signIn(other,'second@example.test');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Business master records',exact:true})).toBeVisible();await page.getByRole('button',{name:'Add room type',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.getByLabel('Room type',{exact:true}).fill('Double');await dialog.getByLabel('Maximum guests').fill('2');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('retained for retry');await page.getByLabel('Synchronize').click();loseResponse=false;
  await expect(page.getByText('Double',{exact:true})).toBeVisible();
  expect(sql("select count(*) from servos_v2.commands where request->'payload'->>'collection'='roomTypes';").trim()).toBe('1');
  await page.getByRole('button',{name:'Rooms & rates',exact:true}).click();await page.getByRole('button',{name:'Add room',exact:true}).click();dialog=page.getByRole('dialog');
   await dialog.getByLabel('Room number').fill('101');const roomType=dialog.getByRole('combobox',{name:'Room type',exact:true});await roomType.fill('Double');await dialog.getByRole('option',{name:'Double',exact:true}).click();await dialog.getByLabel('Guest capacity').fill('2');await dialog.getByLabel('Turnaround minutes').fill('30');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Room 101',exact:true})).toBeVisible();
  await other.getByLabel('Synchronize').click();await other.getByRole('button',{name:'Rooms & rates',exact:true}).click();await expect(other.getByRole('heading',{name:'Room 101',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Add asset category',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Category name').fill('Equipment');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByText('Equipment',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Assets',exact:true}).click();await page.getByRole('button',{name:'Add asset',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Asset name').fill('Guest television');await dialog.getByLabel('Unique asset tag').fill('TV-101');const category=dialog.getByRole('combobox',{name:'Category',exact:true});await category.fill('Equipment');await dialog.getByRole('option',{name:'Equipment',exact:true}).click();const room=dialog.getByRole('combobox',{name:'Room',exact:true});await room.fill('101');await dialog.getByRole('option',{name:'101',exact:true}).click();await dialog.getByLabel('Acquisition cost (KES)').fill('25000');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Guest television · TV-101'})).toBeVisible();await other.getByLabel('Synchronize').click();await other.getByRole('button',{name:'Assets',exact:true}).click();await expect(other.getByRole('heading',{name:'Guest television · TV-101'})).toBeVisible();
  expect(sql("select data->>'purchaseCostMinor' from servos_v2.records where collection='assets';").trim()).toBe('2500000');
  await page.screenshot({path:info.outputPath('transactional-assets.png'),fullPage:true});
  await page.reload();const remoteEntry=page.getByRole('button',{name:'Remote management',exact:true});if(await remoteEntry.count())await remoteEntry.click();await page.getByLabel('Email',{exact:true}).fill('first@example.test');await page.getByLabel('Password',{exact:true}).fill('test-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Rooms & rates',exact:true}).click();await expect(page.getByRole('heading',{name:'Room 101',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Staff & devices',exact:true}).click();await expect(page.getByRole('heading',{name:'Staff, approvals and devices'})).toBeVisible();await expect(page.getByText('Browser Owner',{exact:true})).toBeVisible();await expect(page.getByText('Browser Manager',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Trusted devices'})).toBeVisible();expect(await page.getByText('Browser workstation',{exact:true}).count()).toBeGreaterThanOrEqual(2);
  await context2.close();
 });
 test('web inventory count retains every row, blocks unknown scans, and commits one reviewed location count',async({page})=>{
  await signIn(page,'inventory@example.test');
  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Stock',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Count stock',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Physical stock count'});
  await dialog.locator('select').nth(0).selectOption('web-count-a');
  await dialog.getByLabel('Physical quantity').fill('4');
  await dialog.locator('select').nth(0).selectOption('web-count-b');
  await dialog.getByLabel('Physical quantity').fill('0');
  await page.reload();
  await signIn(page,'inventory@example.test');
  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await expect(page.getByRole('button',{name:'Resume count',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Resume count',exact:true}).click();
  const resumed=page.getByRole('dialog',{name:'Physical stock count'});
  await resumed.locator('select').nth(0).selectOption('web-count-b');
  await expect(resumed.getByLabel('Physical quantity')).toHaveValue('0');
  await resumed.locator('select').nth(0).selectOption('web-count-a');
  await expect(resumed.getByLabel('Physical quantity')).toHaveValue('4');
  const dialogAfterReload=resumed;
  await dialogAfterReload.getByLabel('Scan barcode / SKU').fill('UNKNOWN-000');
  await dialogAfterReload.getByRole('button',{name:'Apply typed barcode',exact:true}).click();
  await expect(dialogAfterReload.getByRole('button',{name:/Review and confirm/})).toBeDisabled();
  await dialogAfterReload.getByRole('button',{name:'Remove UNKNOWN-000',exact:true}).click();
  await expect(dialogAfterReload.getByRole('button',{name:/Review and confirm/})).toBeEnabled();
  await dialogAfterReload.getByRole('button',{name:'Review and confirm',exact:true}).click();
  await expect(dialogAfterReload).toBeVisible();
  await dialogAfterReload.getByRole('button',{name:'Close dialog',exact:true}).click();
  const synchronize=page.getByLabel('Synchronize').first();
  await expect(synchronize).toBeEnabled();
  await synchronize.dispatchEvent('click');
  await expect.poll(()=>sql("select count(*) from servos_v2.records where collection='stockCounts';").trim(),{timeout:15000}).toBe('1');
  await expect.poll(()=>sql("select count(*) from servos_v2.records where collection='stockCounts';").trim()).toBe('1');
  await expect(page.getByRole('button',{name:'Resume count',exact:true})).toHaveCount(0);
  expect(sql("select data->'currentStock'->>'web-pos-stock' from servos_v2.records where collection='stockItems' and id='web-count-a';").trim()).toBe('4');
  expect(sql("select count(*) from servos_v2.records where collection='stockMovements' and data->>'movementType'='COUNT_ADJUSTMENT';").trim()).toBe('1');
 });
 test('web POS opens a till, settles cash online and retains the immutable receipt',async({page})=>{
  await signIn(page,'pos@example.test');
  await page.getByRole('button',{name:'POS',exact:true}).click();
  await page.getByLabel('Opening float in KES').fill('100');
  await page.getByRole('button',{name:'Open till',exact:true}).click();
  await expect.poll(async()=>{
   const result=sql("select coalesce((select case when result ? 'error' then result->'error'->>'message' else 'NO_ERROR' end from servos_v2.commands where request->>'operation'='till.open' order by created_at desc limit 1),'NO_COMMAND');").trim();
   if(result==='NO_COMMAND')return `NO_COMMAND online=${await page.evaluate(()=>navigator.onLine)} status=${await page.getByRole('status').allTextContents()} alert=${await page.getByRole('alert').allTextContents()}`;
   return result;
  }).toBe('NO_ERROR');
  await expect.poll(()=>sql("select count(*) from servos_v2.records where collection='tillSessions' and data->>'status'='OPEN';").trim()).toBe('1');
  await page.getByLabel('Synchronize').click();
  await expect(page.getByText('No open till')).toHaveCount(0);
  await page.getByRole('button',{name:'Quick tab',exact:true}).click();
  await page.getByRole('button',{name:/Test Soda/}).click();
  await page.getByRole('button',{name:/Take payment/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Payment account').selectOption('web-pos-cash');
  await dialog.getByRole('button',{name:'Record payment'}).click();
  await expect(page.getByText('Receipt history (1)')).toBeVisible();
  await page.getByText('Receipt history (1)').click();
  await expect(page.getByText('V2-00000001')).toBeVisible();
  expect(sql("select count(*) from servos_v2.records where collection='payments' and data->>'method'='CASH' and data->>'amountMinor'='1250';").trim()).toBe('1');
  expect(sql("select count(*) from servos_v2.records where collection='receiptDocuments' and data->>'paidMinor'='1250' and data->>'balanceMinor'='0';").trim()).toBe('1');
  expect(sql("select count(*) from servos_v2.records where collection='journalEntries' and data->>'sourceType'='PAYMENT' and data->>'totalDebitMinor'=data->>'totalCreditMinor';").trim()).toBe('1');
  await page.getByRole('button',{name:'Refund',exact:true}).click();
  const refundDialog=page.getByRole('dialog');
  await refundDialog.getByLabel('Refund amount in KES').fill('2.50');
  await refundDialog.getByLabel('Reason').fill('Browser test partial refund');
  await refundDialog.getByRole('button',{name:'Record refund'}).click();
  await expect.poll(()=>sql("select count(*) from servos_v2.records where collection='refunds' and data->>'amountMinor'='250';").trim()).toBe('1');
  await page.getByRole('button',{name:'Finance',exact:true}).click();
  await page.getByRole('button',{name:'Close till',exact:true}).click();
  await expect.poll(()=>sql("select data->>'status' from servos_v2.records where collection='tillSessions' and data->>'status'='CLOSED';").trim()).toBe('CLOSED');
  await page.getByRole('button',{name:'Generate close-day snapshot',exact:true}).click();
  await expect.poll(()=>sql("select count(*) from servos_v2.records where collection='closeDayReports' and data->'sales'->>'refundsMinor'='250';").trim()).toBe('1');
  expect(sql("select data->'cash'->>'varianceMinor' from servos_v2.records where collection='closeDayReports';").trim()).toBe('0');
 });
});
