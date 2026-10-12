import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';

const stableJson=(value:unknown):string=>value===null||typeof value!=='object'?JSON.stringify(value)??'null':Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${stableJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
const sha256=(value:unknown)=>createHash('sha256').update(stableJson(value)).digest('hex');

for(const role of ['waiter','cashier','preparation','manager'] as const){
 test(`role mobile navigation and alerts: ${role}`,async({page})=>{
 const permissions=role==='manager'?['*']:role==='cashier'?['pos.sell','payment.record','ticket.approve','ticket.view_outlet','mpesa.record']:role==='waiter'?['ticket.create','ticket.view_own','floorplan.view']:['kds.view','kds.update'];
 permissions.push('devices.register');
 const capabilities={'operations.inbox':true,'operations.references':true,'operations.push':false,'pos2.simpleCashier':true,'pos2.waiterTickets':true};
 const outletId='a1000000-0000-4000-8000-000000000011',ticketId='a1000000-0000-4000-8000-000000000012',orderId='a1000000-0000-4000-8000-000000000013',productId='a1000000-0000-4000-8000-000000000014',alertId='a1000000-0000-4000-8000-000000000015';
 let read=false;const calls:any[]=[];
 const businessId='a1000000-0000-4000-8000-000000000001';
 const staffId='a1000000-0000-4000-8000-000000000002';
 let deviceId='a1000000-0000-4000-8000-000000000003';
 const stockId='a1000000-0000-4000-8000-000000000004';
 const outcomes=new Map<string,unknown>();const snapshots=new Map<string,{expiresAt:string;cursor:number;manifest:Record<string,unknown>;records:unknown[]}>();
 let cursor=1;let stockVersion=1;let stockName='Coffee beans';let feed:any[]=[];let offline=false;
 await page.route('**/health/ready',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'http://127.0.0.1:3010','access-control-allow-credentials':'true'},body:JSON.stringify({status:'ready'})}));
 await page.route('**/v1/**',async route=>{
  const request=route.request();const url=new URL(request.url());
  if(offline){await route.abort('internetdisconnected');return}
  const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/v1/auth/login')return respond({accessToken:'test-session-token-00000000000000000000000000000000',sessionId:'a1000000-0000-4000-8000-000000000005',businessId,staffId,displayName:'API Test Admin',permissions,expiresAt:new Date(Date.now()+3600000).toISOString(),mustChangePassword:false,capabilities});
  if(url.pathname==='/v1/auth/session')return respond({businessId,staffId,displayName:'API Test Admin',permissions,mustChangePassword:false,capabilities});
  if(url.pathname==='/v1/devices/enrollment-challenges')return respond({challengeId:'a1000000-0000-4000-8000-000000000006',challenge:'challenge',issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()});
  if(url.pathname==='/v1/devices/enroll'){deviceId=JSON.parse(request.postData()||'{}').deviceId;return respond({deviceId,businessId,createdAt:new Date().toISOString()},201);}
  const bootstrapRecords=[
   {collection:'outlets',id:outletId,version:1,data:{name:'Dining',defaultStockLocationId:stockId},archived:false},
   {collection:'products',id:productId,version:1,data:{name:'Coffee',priceMinor:90000,category:'Drinks',routeTo:'COUNTER'},archived:false},
   {collection:'posTickets',id:ticketId,version:2,data:{createdByStaffId:staffId,outletId,status:'APPROVED',payload:{name:'Table 4',lines:[]},approvalOrderId:orderId,submittedAt:new Date().toISOString()},archived:false},
   {collection:'orders',id:orderId,version:1,data:{name:'Table 4',outletId,state:'COMPLETED',grandTotalMinor:90000,amountPaidMinor:90000,items:[]},archived:false}
  ];
  const bootstrapPath='/v1/bootstrap/catalog';
  if(url.pathname===bootstrapPath){
   const snapshotId='a1000000-0000-4000-8000-000000000008',expiresAt=new Date(Date.now()+600000).toISOString(),pageSize=25,pageHashes=[sha256({afterOrdinal:0,nextOrdinal:bootstrapRecords.length,records:bootstrapRecords})],core={protocolVersion:2,snapshotId,expiresAt,schemaVersion:2,highWaterCursor:cursor,recordCount:bootstrapRecords.length,collectionCounts:{outlets:1,products:1,posTickets:1,orders:1},pageSize,pageCount:pageHashes.length,pageHashes},manifest={...core,sha256:sha256(core)};
   snapshots.set(snapshotId,{expiresAt,cursor,manifest,records:bootstrapRecords});return respond({protocolVersion:2,snapshotId,expiresAt,cursor,manifest});
  }
  const bootstrapPage=url.pathname.match(/^\/v1\/bootstrap\/catalog\/([0-9a-f-]{36})\/pages$/i);
  if(bootstrapPage){const snapshot=snapshots.get(bootstrapPage[1]);if(!snapshot)return respond({error:{code:'BOOTSTRAP_SNAPSHOT_EXPIRED',message:'Snapshot expired'}},404);const afterOrdinal=Number(url.searchParams.get('after')||0);return respond({protocolVersion:2,snapshotId:bootstrapPage[1],afterOrdinal,nextOrdinal:snapshot.records.length,hasMore:false,pageIndex:0,sha256:(snapshot.manifest.pageHashes as string[])[0],records:snapshot.records});}
  const bootstrapResume=url.pathname.match(/^\/v1\/bootstrap\/catalog\/([0-9a-f-]{36})$/i);
  if(bootstrapResume){const snapshot=snapshots.get(bootstrapResume[1]);return snapshot?respond({protocolVersion:2,snapshotId:bootstrapResume[1],expiresAt:snapshot.expiresAt,cursor:snapshot.cursor,manifest:snapshot.manifest}):respond({error:{code:'BOOTSTRAP_SNAPSHOT_EXPIRED',message:'Snapshot expired'}},404);}
  if(url.pathname==='/v1/sync/changes')return respond({protocolVersion:1,cursor,highWater:cursor,hasMore:false,changes:feed.filter(change=>change.sequence>Number(url.searchParams.get('after')||0))});
  if(url.pathname==='/v1/operations/inbox')return respond({items:[{id:alertId,kind:'ticket.approve',targetType:'ticket',targetId:ticketId,summary:'Ticket approved: Table 4',createdAt:new Date().toISOString(),readAt:read?new Date().toISOString():null,resolvedAt:new Date().toISOString()}],references:[],publicKey:null});
  if(url.pathname==='/v1/operations/read'){read=true;return respond({read:true});}
  if(url.pathname==='/v1/operations/push')return respond({removed:true});
  if(url.pathname==='/v1/commands'&&request.method()==='POST'){
   const command=JSON.parse(request.postData()||'{}');calls.push(command);cursor++;
   const outcome={kind:'CONFIRMED',commandId:command.commandId,cursor,result:{submission:{id:command.payload.id,status:'SUBMITTED'}}};outcomes.set(command.commandId,outcome);return respond(outcome);
  }
  if(url.pathname.startsWith('/v1/commands/')){const commandId=url.pathname.split('/').at(-1)!;return outcomes.has(commandId)?respond({commandId,status:'CONFIRMED',outcome:outcomes.get(commandId)}):respond({error:{code:'COMMAND_NOT_FOUND',message:'No command with this ID exists.'}},404);}
  if(url.pathname==='/v1/setup/status')return respond({available:false});
  if(url.pathname==='/v1/auth/logout')return respond({revoked:true});
  return respond({error:{code:'NOT_FOUND',message:'Unknown fixture path'}},404);
 });

 await page.goto('/');await page.getByLabel('Staff login').fill('staff');await page.getByLabel('Password',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('button',{name:'Alerts (1)'}).first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});const nav=page.getByRole('navigation',{name:'Mobile tasks'});await expect(nav).toBeVisible();
 const expected=role==='waiter'?'Orders':role==='cashier'?'Sale':role==='preparation'?'Preparation':'Overview';await expect(nav.getByRole('button',{name:expected,exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Alerts (1)'}).click();const inbox=page.getByRole('dialog',{name:'Operational alerts'});await expect(inbox).toBeVisible();await expect(inbox).toContainText('Reading an alert does not approve');await expect(inbox.getByRole('button',{name:'Enable alerts',exact:true})).toBeDisabled();await inbox.getByRole('button',{name:'Close',exact:true}).click();
 await nav.getByRole('button',{name:'More',exact:true}).click();const more=page.getByRole('dialog',{name:'All permitted workspaces'});await expect(more.getByRole('button',{name:'Activity',exact:true})).toBeVisible();await more.getByRole('button',{name:'Close More'}).click();
 if(role==='waiter'){
  await nav.getByRole('button',{name:'Orders',exact:true}).click();await page.getByText('Send M-Pesa reference',{exact:true}).click();await page.getByLabel('Transaction code',{exact:true}).fill('QAZ1234567');await page.getByLabel('Claimed amount (KES)',{exact:true}).fill('900.25');await page.getByLabel('Received time (Nairobi)',{exact:true}).fill('2026-10-12T12:30');
  const form=page.locator('details form');await form.getByRole('button',{name:'Send to cashier',exact:true}).click();await expect(page.getByText('Sent to cashier for verification. Payment is not confirmed.',{exact:true})).toBeVisible();expect(calls).toHaveLength(1);expect(calls[0].name).toBe('mpesaReference.submit');expect(calls[0].payload.amountMinor).toBe(90025);expect(calls[0].payload.receivedAt).toBe('2026-10-12T09:30:00.000Z');
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 });
}
