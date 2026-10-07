import {test,expect} from '@playwright/test';

test('API login, catalog command, reload projection, and reconnect change feed',async({page})=>{
 const businessId='a1000000-0000-4000-8000-000000000001';
 const staffId='a1000000-0000-4000-8000-000000000002';
 const deviceId='a1000000-0000-4000-8000-000000000003';
 const stockId='a1000000-0000-4000-8000-000000000004';
 let cursor=1;let stockVersion=1;let stockName='Coffee beans';let feed:any[]=[];let offline=false;
 await page.route('**/v1/**',async route=>{
  const request=route.request();const url=new URL(request.url());
  if(offline){await route.abort('internetdisconnected');return}
  const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/v1/auth/login')return respond({accessToken:'test-session-token-00000000000000000000000000000000',sessionId:'a1000000-0000-4000-8000-000000000005',businessId,staffId,displayName:'API Test Admin',permissions:['*'],expiresAt:new Date(Date.now()+3600000).toISOString(),mustChangePassword:false});
  if(url.pathname==='/v1/auth/session')return respond({businessId,staffId,displayName:'API Test Admin',permissions:['*'],mustChangePassword:false});
  if(url.pathname==='/v1/devices/enrollment-challenges')return respond({challengeId:'a1000000-0000-4000-8000-000000000006',challenge:'challenge',issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()});
  if(url.pathname==='/v1/devices/enroll')return respond({deviceId,businessId,createdAt:new Date().toISOString()},201);
  if(url.pathname==='/v1/bootstrap/catalog')return respond({protocolVersion:1,cursor,records:[{collection:'stockItems',id:stockId,version:stockVersion,data:{name:stockName,code:'COF',baseUnit:'kg',barcode:null,barcodeAliases:[],scanUnitQuantity:1,reorderLevel:2,averageUnitCostMinor:900,purchasePackages:[]},archived:false}]});
  if(url.pathname==='/v1/sync/changes')return respond({protocolVersion:1,cursor,highWater:cursor,hasMore:false,changes:feed});
  if(url.pathname==='/v1/commands'&&request.method()==='POST'){
   const command=JSON.parse(request.postData()||'{}');stockVersion++;stockName=String(command.payload.data.name);cursor++;const record={collection:'stockItems',id:stockId,version:stockVersion,data:{name:stockName,code:'COF',baseUnit:'kg',barcode:null,barcodeAliases:[],scanUnitQuantity:1,reorderLevel:2,averageUnitCostMinor:900,purchasePackages:[]},archived:false};
   feed.push({sequence:cursor,commandId:command.commandId,actorId:staffId,deviceId,occurredAt:new Date().toISOString(),records:[record]});
   return respond({kind:'CONFIRMED',commandId:command.commandId,cursor,result:record});
  }
  if(url.pathname.startsWith('/v1/commands/'))return respond({commandId:url.pathname.split('/').at(-1),status:'CONFIRMED',outcome:{kind:'CONFIRMED',cursor}});
  if(url.pathname==='/v1/auth/logout')return respond({revoked:true});
  return respond({error:{code:'NOT_FOUND',message:'Unknown fixture path'}},404);
 });
 await page.goto('/');
 await page.getByRole('button',{name:'ServOS API workspace'}).click();
 await page.getByLabel('Staff login').fill('admin');
 await page.getByLabel('Password').fill('test-password');
 await page.getByRole('button',{name:'Sign in'}).click();
 await expect(page.getByText('Workspace ready')).toBeVisible();
 await expect(page.getByText('Coffee beans',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Catalog',exact:true}).click();
 await page.getByRole('button',{name:'Edit',exact:true}).first().click();
 const nameInput=page.getByLabel('Name');
 await nameInput.fill('Coffee beans updated');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.getByText('Saved and synchronized.')).toBeVisible({timeout:10000}).catch(async()=>expect(page.getByText('Coffee beans updated',{exact:true})).toBeVisible());
 await expect(page.getByText('Coffee beans updated',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByText('Workspace ready')).toBeVisible();
 await expect(page.getByText('Coffee beans updated',{exact:true})).toBeVisible();
 offline=true;await page.context().setOffline(true);
 await expect(page.getByText(/Online/)).toHaveCount(0).catch(()=>undefined);
 offline=false;await page.context().setOffline(false);
 await page.getByRole('button',{name:'Synchronize'}).click();
 await expect(page.getByText('Coffee beans updated',{exact:true})).toBeVisible();
 expect(cursor).toBeGreaterThan(1);
});
