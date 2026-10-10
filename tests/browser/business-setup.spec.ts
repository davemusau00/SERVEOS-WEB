import {test,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';

const stableJson=(value:unknown):string=>value===null||typeof value!=='object'?JSON.stringify(value)??'null':Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${stableJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
const sha256=(value:unknown)=>createHash('sha256').update(stableJson(value)).digest('hex');

test('first-run setup saves server progress, resumes, provisions defaults, and gates workspace access',async({page})=>{
 const businessId=randomUUID(),staffId=randomUUID(),deviceIdSeed=randomUUID();
 const setupId=businessId;let locationId='',outletId='',cashId='';
 let deviceId=deviceIdSeed,cursor=1,setupVersion=1,settingsVersion=0,locationVersion=0,outletVersion=0,cashVersion=0;
 let setupData:Record<string,unknown>={status:'IN_PROGRESS',currentStep:0,configuration:{},updatedBy:staffId,updatedAt:new Date().toISOString(),completedAt:null};
 let settingsData:Record<string,unknown>|null=null,locationData:Record<string,unknown>|null=null,outletData:Record<string,unknown>|null=null,cashData:Record<string,unknown>|null=null;
 const outcomes=new Map<string,unknown>(),snapshots=new Map<string,{expiresAt:string;cursor:number;manifest:Record<string,unknown>;records:unknown[]}>(),feed:Array<Record<string,unknown>>=[],commandNames:string[]=[];
 const currentRecords=()=>[
  {collection:'businessSetup',id:setupId,version:setupVersion,data:setupData,archived:false},
  ...(settingsData?[{collection:'businessSettings',id:businessId,version:settingsVersion,data:settingsData,archived:false}]:[]),
  ...(locationData?[{collection:'stockLocations',id:locationId,version:locationVersion,data:locationData,archived:false}]:[]),
  ...(outletData?[{collection:'outlets',id:outletId,version:outletVersion,data:outletData,archived:false}]:[]),
  ...(cashData?[{collection:'paymentAccounts',id:cashId,version:cashVersion,data:cashData,archived:false}]:[]),
 ];
 await page.route('**/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/v1/auth/login')return respond({accessToken:'test-session-token-00000000000000000000000000000000',sessionId:randomUUID(),businessId,staffId,displayName:'Setup Owner',permissions:['*'],expiresAt:new Date(Date.now()+3600000).toISOString(),mustChangePassword:false});
  if(url.pathname==='/v1/auth/session')return respond({businessId,staffId,displayName:'Setup Owner',permissions:['*'],mustChangePassword:false});
  if(url.pathname==='/v1/devices/enrollment-challenges')return respond({challengeId:randomUUID(),challenge:'setup-challenge',issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()});
  if(url.pathname==='/v1/devices/enroll'){deviceId=JSON.parse(request.postData()||'{}').deviceId;return respond({deviceId,businessId,createdAt:new Date().toISOString()},201)}
  if(url.pathname==='/v1/bootstrap/catalog'){
   const records=currentRecords(),snapshotId=randomUUID(),expiresAt=new Date(Date.now()+600000).toISOString(),pageSize=25,pageHashes=[sha256({afterOrdinal:0,nextOrdinal:records.length,records})],core={protocolVersion:2,snapshotId,expiresAt,schemaVersion:2,highWaterCursor:cursor,recordCount:records.length,collectionCounts:{businessSetup:1},pageSize,pageCount:pageHashes.length,pageHashes},manifest={...core,sha256:sha256(core)};
   snapshots.set(snapshotId,{expiresAt,cursor,manifest,records});return respond({protocolVersion:2,snapshotId,expiresAt,cursor,manifest});
  }
  const bootstrapPage=url.pathname.match(/^\/v1\/bootstrap\/catalog\/([0-9a-f-]{36})\/pages$/i);
  if(bootstrapPage){const snapshot=snapshots.get(bootstrapPage[1]);if(!snapshot)return respond({error:{code:'BOOTSTRAP_SNAPSHOT_EXPIRED',message:'Snapshot expired'}},404);const afterOrdinal=Number(url.searchParams.get('after')||0);return respond({protocolVersion:2,snapshotId:bootstrapPage[1],afterOrdinal,nextOrdinal:snapshot.records.length,hasMore:false,pageIndex:0,sha256:(snapshot.manifest.pageHashes as string[])[0],records:snapshot.records})}
  const bootstrapResume=url.pathname.match(/^\/v1\/bootstrap\/catalog\/([0-9a-f-]{36})$/i);
  if(bootstrapResume){const snapshot=snapshots.get(bootstrapResume[1]);return snapshot?respond({protocolVersion:2,snapshotId:bootstrapResume[1],expiresAt:snapshot.expiresAt,cursor:snapshot.cursor,manifest:snapshot.manifest}):respond({error:{code:'BOOTSTRAP_SNAPSHOT_EXPIRED',message:'Snapshot expired'}},404)}
  if(url.pathname==='/v1/sync/changes')return respond({protocolVersion:1,cursor,highWater:cursor,hasMore:false,changes:feed.filter(change=>Number(change.sequence)>Number(url.searchParams.get('after')||0))});
  if(url.pathname==='/v1/commands'&&request.method()==='POST'){
   const command=JSON.parse(request.postData()||'{}'),payload=command.payload as Record<string,any>;commandNames.push(command.name);let record:any;
   if(command.name==='business.setup.configure'){
    setupVersion++;setupData={status:'IN_PROGRESS',currentStep:payload.currentStep,configuration:payload.configuration,updatedBy:staffId,updatedAt:new Date().toISOString(),completedAt:null};record=currentRecords()[0];
   }else if(command.name==='business.settings.save'){
    settingsVersion++;settingsData={...payload.data,version:settingsVersion};record=currentRecords().find(item=>item.collection==='businessSettings');
   }else if(command.name==='stockLocation.save'){
    locationId=String(payload.id);locationVersion++;locationData={...payload.data};record=currentRecords().find(item=>item.collection==='stockLocations');
   }else if(command.name==='outlet.save'){
    outletId=String(payload.id);outletVersion++;outletData={name:payload.data.name,defaultStockLocationId:payload.data.defaultStockLocationId};record=currentRecords().find(item=>item.collection==='outlets');
   }else if(command.name==='paymentAccount.save'){
    cashId=String(payload.id);cashVersion++;cashData={...payload.data};record=currentRecords().find(item=>item.collection==='paymentAccounts');
   }else if(command.name==='business.setup.complete'){
    setupVersion++;setupData={...setupData,status:'COMPLETED',updatedAt:new Date().toISOString(),completedAt:new Date().toISOString()};record=currentRecords()[0];
   }else return respond({error:{code:'UNKNOWN_COMMAND',message:`Unsupported test command ${command.name}`}},404);
   cursor++;feed.push({sequence:cursor,commandId:command.commandId,actorId:staffId,deviceId,occurredAt:new Date().toISOString(),records:[record]});
   const outcome={kind:'CONFIRMED',commandId:command.commandId,cursor,result:record};outcomes.set(command.commandId,outcome);return respond(outcome);
  }
  if(url.pathname.startsWith('/v1/commands/')){const commandId=url.pathname.split('/').at(-1)!;return outcomes.has(commandId)?respond({commandId,status:'CONFIRMED',outcome:outcomes.get(commandId)}):respond({error:{code:'COMMAND_NOT_FOUND',message:'No command with this ID exists.'}},404)}
  if(url.pathname==='/v1/auth/logout')return respond({revoked:true});
  return respond({error:{code:'NOT_FOUND',message:'Unknown fixture path'}},404);
 });
 const signIn=async()=>{
  const login=page.getByLabel('Staff login');
  if(await login.isVisible().catch(()=>false)){
   await login.fill('owner');await page.getByLabel('Password',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  }
 };
 await page.goto('/');await signIn();
 await expect(page.getByRole('heading',{name:'Business identity'})).toBeVisible();
 await page.getByLabel('Registered business name').fill('Kijani Cafe');
 await page.getByLabel('Business category').selectOption('FOOD_AND_BEVERAGE');
 await page.getByLabel('Receipt display name').fill('Kijani Cafe');
 await page.getByRole('radio').first().check();
 await page.getByRole('button',{name:'Save and continue'}).click();
 await expect(page.getByRole('heading',{name:'Business type'})).toBeVisible();
 await page.reload();await signIn();
 await expect(page.getByRole('heading',{name:'Business type'})).toBeVisible();
 await page.getByRole('button',{name:'Back'}).click();
 await expect(page.getByLabel('Registered business name')).toHaveValue('Kijani Cafe');
 await page.getByRole('button',{name:'Save and continue'}).click();
 await page.getByText('Restaurant / Café',{exact:true}).click();
 await page.getByLabel('Outlet name').fill('Dining Room');
 await page.getByRole('button',{name:'Save and continue'}).click();
 await expect(page.getByRole('heading',{name:'Outlets and payments'})).toBeVisible();
 await page.getByRole('button',{name:'Save and review'}).click();
 await expect(page.getByRole('heading',{name:'Finish'})).toBeVisible();
 await page.getByRole('button',{name:'Save business defaults'}).click();
 await expect(page.getByRole('button',{name:'Finish and open workspace'})).toBeEnabled();
 expect(commandNames).toContain('business.setup.configure');
 expect(commandNames).toContain('business.settings.save');
 expect(commandNames).toContain('stockLocation.save');
 expect(commandNames).toContain('outlet.save');
 expect(commandNames).toContain('paymentAccount.save');
 await page.getByRole('button',{name:'Finish and open workspace'}).click();
 await expect(page.getByRole('button',{name:'Catalog',exact:true})).toBeVisible();
 expect(setupData.status).toBe('COMPLETED');
 expect((setupData.configuration as Record<string,unknown>).businessType).toBe('RESTAURANT_CAFE');
 expect(commandNames.at(-1)).toBe('business.setup.complete');
 const finalCash=cashData as Record<string,unknown>|null;
 expect(finalCash?.method).toBe('CASH');
 expect(finalCash?.mpesaNumber).toBeUndefined();
 expect(locationId).toBeTruthy();expect(outletId).toBeTruthy();expect(cashId).toBeTruthy();
});
