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
   select servos_v2.put_record('property','property','{"address":"Test Street","phone":"0700000000","currency":"KES","timezone":"Africa/Nairobi","receiptFooter":"Thank you"}');
   select servos_v2.put_record('posPolicy','policy','{"vatBasisPoints":0,"cateringLevyBasisPoints":0,"taxInclusive":true,"currency":"KES"}');
   select servos_v2.put_record('stockLocations','web-pos-stock','{"name":"Web POS Stock","code":"WEBPOS","type":"BAR"}');
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
  await bridge(page);await page.goto('/');await page.getByRole('button',{name:'Remote management',exact:true}).click();
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
  await expect(page.locator('main').getByRole('heading',{name:'Master Data',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'KDS',exact:true}).click();
  await expect(page.locator('main')).not.toBeEmpty();
  await expect(page.locator('main').getByRole('region',{name:'Kitchen and bar pass'}).getByRole('heading',{name:'Bar / Kitchen Pass',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 });
 test('two operators see committed room and asset records; response-loss retry preserves one command',async({page,browser},info)=>{
  test.setTimeout(120000);const context2=await browser.newContext({viewport:info.project.use.viewport});const other=await context2.newPage();
  await signIn(page,'first@example.test');await signIn(other,'second@example.test');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Business master records',exact:true})).toBeVisible();await page.getByRole('button',{name:'Add room type',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.getByLabel('Room type',{exact:true}).fill('Double');await dialog.getByLabel('Maximum guests').fill('2');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('retained for retry');await page.getByLabel('Synchronize').click();
  await expect(page.getByText('Double',{exact:true})).toBeVisible();
  expect(sql("select count(*) from servos_v2.commands where request->'payload'->>'collection'='roomTypes';").trim()).toBe('1');
  await page.getByRole('button',{name:'Rooms',exact:true}).click();await page.getByRole('button',{name:'Add room',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByLabel('Room number').fill('101');await dialog.locator('select').selectOption({label:'Double'});await dialog.getByLabel('Guest capacity').fill('2');await dialog.getByLabel('Turnaround minutes').fill('30');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Room 101',exact:true})).toBeVisible();
  await other.getByLabel('Synchronize').click();await other.getByRole('button',{name:'Rooms',exact:true}).click();await expect(other.getByRole('heading',{name:'Room 101',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Add asset category',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Category name').fill('Equipment');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByText('Equipment',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Assets',exact:true}).click();await page.getByRole('button',{name:'Add asset',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Asset name').fill('Guest television');await dialog.getByLabel('Unique asset tag').fill('TV-101');await dialog.locator('select').nth(0).selectOption({label:'Equipment'});await dialog.locator('select').nth(1).selectOption({label:'101'});await dialog.getByLabel('Acquisition cost (KES)').fill('25000');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Guest television · TV-101'})).toBeVisible();await other.getByLabel('Synchronize').click();await other.getByRole('button',{name:'Assets',exact:true}).click();await expect(other.getByRole('heading',{name:'Guest television · TV-101'})).toBeVisible();
  expect(sql("select data->>'purchaseCostMinor' from servos_v2.records where collection='assets';").trim()).toBe('2500000');
  await page.screenshot({path:info.outputPath('transactional-assets.png'),fullPage:true});
  await page.reload();await page.getByRole('button',{name:'Remote management',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('first@example.test');await page.getByLabel('Password',{exact:true}).fill('test-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Rooms',exact:true}).click();await expect(page.getByRole('heading',{name:'Room 101',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Staff',exact:true}).click();await expect(page.getByRole('heading',{name:'Staff, approvals and devices'})).toBeVisible();await expect(page.getByText('Browser Owner',{exact:true})).toBeVisible();await expect(page.getByText('Browser Manager',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Trusted devices'})).toBeVisible();expect(await page.getByText('Browser workstation',{exact:true}).count()).toBeGreaterThanOrEqual(2);
  await context2.close();
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
