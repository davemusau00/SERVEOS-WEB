import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';

const stableJson=(value:unknown):string=>value===null||typeof value!=='object'?JSON.stringify(value)??'null':Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${stableJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
const sha256=(value:unknown)=>createHash('sha256').update(stableJson(value)).digest('hex');

test('API login, catalog command, reload projection, and reconnect change feed',async({page})=>{
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
  if(url.pathname==='/v1/auth/login')return respond({accessToken:'test-session-token-00000000000000000000000000000000',sessionId:'a1000000-0000-4000-8000-000000000005',businessId,staffId,displayName:'API Test Admin',permissions:['*'],expiresAt:new Date(Date.now()+3600000).toISOString(),mustChangePassword:false});
  if(url.pathname==='/v1/auth/session')return respond({businessId,staffId,displayName:'API Test Admin',permissions:['*'],mustChangePassword:false});
  if(url.pathname==='/v1/devices/enrollment-challenges')return respond({challengeId:'a1000000-0000-4000-8000-000000000006',challenge:'challenge',issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()});
  if(url.pathname==='/v1/devices/enroll'){deviceId=JSON.parse(request.postData()||'{}').deviceId;return respond({deviceId,businessId,createdAt:new Date().toISOString()},201);}
  const bootstrapRecords=[{collection:'stockItems',id:stockId,version:stockVersion,data:{name:stockName,code:'COF',baseUnit:'kg',barcode:null,barcodeAliases:[],scanUnitQuantity:1,reorderLevel:2,averageUnitCostMinor:900,purchasePackages:[]},archived:false}];
  const bootstrapPath='/v1/bootstrap/catalog';
  if(url.pathname===bootstrapPath){
   const snapshotId='a1000000-0000-4000-8000-000000000008',expiresAt=new Date(Date.now()+600000).toISOString(),pageSize=25,pageHashes=[sha256({afterOrdinal:0,nextOrdinal:bootstrapRecords.length,records:bootstrapRecords})],core={protocolVersion:2,snapshotId,expiresAt,schemaVersion:2,highWaterCursor:cursor,recordCount:bootstrapRecords.length,collectionCounts:{stockItems:bootstrapRecords.length},pageSize,pageCount:pageHashes.length,pageHashes},manifest={...core,sha256:sha256(core)};
   snapshots.set(snapshotId,{expiresAt,cursor,manifest,records:bootstrapRecords});return respond({protocolVersion:2,snapshotId,expiresAt,cursor,manifest});
  }
  const bootstrapPage=url.pathname.match(/^\/v1\/bootstrap\/catalog\/([0-9a-f-]{36})\/pages$/i);
  if(bootstrapPage){const snapshot=snapshots.get(bootstrapPage[1]);if(!snapshot)return respond({error:{code:'BOOTSTRAP_SNAPSHOT_EXPIRED',message:'Snapshot expired'}},404);const afterOrdinal=Number(url.searchParams.get('after')||0);return respond({protocolVersion:2,snapshotId:bootstrapPage[1],afterOrdinal,nextOrdinal:snapshot.records.length,hasMore:false,pageIndex:0,sha256:(snapshot.manifest.pageHashes as string[])[0],records:snapshot.records});}
  const bootstrapResume=url.pathname.match(/^\/v1\/bootstrap\/catalog\/([0-9a-f-]{36})$/i);
  if(bootstrapResume){const snapshot=snapshots.get(bootstrapResume[1]);return snapshot?respond({protocolVersion:2,snapshotId:bootstrapResume[1],expiresAt:snapshot.expiresAt,cursor:snapshot.cursor,manifest:snapshot.manifest}):respond({error:{code:'BOOTSTRAP_SNAPSHOT_EXPIRED',message:'Snapshot expired'}},404);}
  if(url.pathname==='/v1/sync/changes')return respond({protocolVersion:1,cursor,highWater:cursor,hasMore:false,changes:feed.filter(change=>change.sequence>Number(url.searchParams.get('after')||0))});
  if(url.pathname==='/v1/commands'&&request.method()==='POST'){
   const command=JSON.parse(request.postData()||'{}');stockVersion++;stockName=String(command.payload.data.name);cursor++;const record={collection:'stockItems',id:stockId,version:stockVersion,data:{name:stockName,code:'COF',baseUnit:'kg',barcode:null,barcodeAliases:[],scanUnitQuantity:1,reorderLevel:2,averageUnitCostMinor:900,purchasePackages:[]},archived:false};
   feed.push({sequence:cursor,commandId:command.commandId,actorId:staffId,deviceId,occurredAt:new Date().toISOString(),records:[record]});
   const outcome={kind:'CONFIRMED',commandId:command.commandId,cursor,result:record};outcomes.set(command.commandId,outcome);return respond(outcome);
  }
  if(url.pathname.startsWith('/v1/commands/')){const commandId=url.pathname.split('/').at(-1)!;return outcomes.has(commandId)?respond({commandId,status:'CONFIRMED',outcome:outcomes.get(commandId)}):respond({error:{code:'COMMAND_NOT_FOUND',message:'No command with this ID exists.'}},404);}
  if(url.pathname==='/v1/auth/logout')return respond({revoked:true});
  return respond({error:{code:'NOT_FOUND',message:'Unknown fixture path'}},404);
 });
 const signIn=async()=>{
  const login=page.getByLabel('Staff login');
  if(await login.isVisible().catch(()=>false)){
   await login.fill('admin');
   await page.getByLabel('Password',{exact:true}).fill('test-password');
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
  }
  await expect(page.getByRole('button',{name:'Catalog',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Catalog',exact:true}).click();
 };
 await page.goto('/');await signIn();
 const workspaceNav=page.locator('nav[aria-label="Business workspace"]:visible');
 await expect(workspaceNav).toHaveCount(1);
 const workspaceLabels=(await workspaceNav.getByRole('button').allTextContents()).map(label=>label.trim());
 expect(workspaceLabels.length).toBeGreaterThan(1);
 await workspaceNav.getByRole('button',{name:'Home',exact:true}).click();
 await page.getByRole('button',{name:/Add a product/}).click();
 const tour=page.getByRole('dialog',{name:'Add a product: Set up an item'});
 await expect(tour).toBeVisible();
 await page.getByRole('button',{name:'Smart item setup',exact:true}).click();
 const smartItem=page.getByRole('dialog',{name:/Smart item setup/});
 await expect(smartItem).toBeVisible();
 await smartItem.getByRole('button',{name:'Close dialog',exact:true}).click();
 await tour.getByRole('button',{name:'Close',exact:true}).click();
 for(const label of workspaceLabels){
  const workspaceButton=workspaceNav.getByRole('button',{name:label,exact:true});
  await workspaceButton.click();
  await expect(workspaceButton).toHaveAttribute('aria-current','page');
  await expect(page.locator('main h1')).toHaveText(label);
  if(label==='Settings'){
   const health=page.getByRole('region',{name:'System health'});
   await expect(health).toContainText('Ready');
   await expect(health).toContainText('Not reported to this workspace.');
   await expect(health).not.toContainText('Print Bridge');
  }
  const layout=await page.evaluate(()=>({viewport:window.innerWidth,documentWidth:document.documentElement.scrollWidth}));
  expect(layout.documentWidth,`${label} causes horizontal document overflow at ${layout.viewport}px`).toBeLessThanOrEqual(layout.viewport);
 }
 await workspaceNav.getByRole('button',{name:'Catalog',exact:true}).click();
 await expect(page.getByText('Coffee beans',{exact:true})).toBeVisible();
 const responsiveLayout=await page.evaluate(()=>({viewport:window.innerWidth,documentWidth:document.documentElement.scrollWidth}));
 expect(responsiveLayout.documentWidth).toBeLessThanOrEqual(responsiveLayout.viewport);
 await expect(page.locator('nav[aria-label="Business workspace"]:visible')).toHaveCount(1);
 await page.getByRole('button',{name:'Edit',exact:true}).first().click();
 const nameInput=page.getByLabel('Name');
 await nameInput.fill('Coffee beans updated');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.getByText('Saved and synchronized.',{exact:true})).toBeVisible({timeout:10000});
 await expect(page.getByText('Coffee beans updated',{exact:true})).toBeVisible();
 await page.reload();await signIn();
 await expect(page.getByText('Coffee beans updated',{exact:true})).toBeVisible();
 offline=true;await page.context().setOffline(true);
 await expect(page.getByText(/^Offline .* saved changes only/)).toBeVisible();
 stockName='Coffee beans from another device';stockVersion++;cursor++;
 feed.push({sequence:cursor,commandId:'a1000000-0000-4000-8000-000000000007',actorId:staffId,deviceId,occurredAt:new Date().toISOString(),records:[{collection:'stockItems',id:stockId,version:stockVersion,data:{name:stockName,code:'COF',baseUnit:'kg'},archived:false}]});
 offline=false;await page.context().setOffline(false);
 await page.getByRole('button',{name:'Synchronize',exact:true}).first().click();
 await expect(page.getByText('Coffee beans from another device',{exact:true})).toBeVisible();
 expect(cursor).toBeGreaterThan(1);
});

