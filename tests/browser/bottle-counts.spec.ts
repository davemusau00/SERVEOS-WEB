import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/#/inventory');
  await page.getByLabel('PIN').fill('123456');
  await page.getByRole('button', { name: 'Continue with local PIN' }).click();
  const welcome=page.getByRole('region',{name:'Staff welcome'});
  if(await welcome.isVisible().catch(()=>false)) await page.getByRole('button',{name:'Dismiss welcome'}).click();
  await page.getByRole('button',{name:'Stock',exact:true}).click();
}

test('physical manual draft survives reload and retry keeps reviewed versions and command identity',async({page})=>{
  await page.addInitScript(()=>{
    const state=window as any;
    const record=(collection:string,id:string,data:any)=>({collection,id,version:1,archived:false,data});
    const snapshot={terminalId:'bottle-test',installationStage:'LIVE',pendingCount:0,actor:{id:'staff',name:'Operator',role:'Admin',permissions:['business.view','inventory.view','inventory.count','inventory.adjust','help.view','pos.sell']},records:[record('stockLocations','main',{name:'Main Store',code:'MAIN'}),record('stockItems','wine',{name:'Wine',code:'WINE',barcode:'616000001',baseUnit:'ml',sealedContainerSize:750,scanUnitQuantity:750,averageUnitCost:2,currentStock:{main:9000},sealedOpenStock:{main:{sealedContainers:12,openQuantity:0}}})]};
    state.requests=[];
    state.__TAURI_INTERNALS__={invoke:async(command:string,args:any)=>{
      if(command==='runtime_status')return {enrolled:true,installationStage:'LIVE',staff:[{id:'staff',name:'Operator',role:'Admin'}]};
      if(command==='runtime_login'||command==='runtime_login_offline')return {token:'session',staffId:'staff',name:'Operator',role:'Admin'};
      if(command==='runtime_snapshot')return snapshot;
      if(command==='runtime_guidance_progress'||command==='runtime_printer_jobs')return [];
      if(command==='runtime_sync')return {};
      if(command==='runtime_inventory_count_draft')return JSON.parse(localStorage.getItem('test-draft')||'null');
      if(command==='runtime_save_inventory_count_draft'){localStorage.setItem('test-draft',JSON.stringify(args.draft));return args.draft;}
      if(command==='runtime_clear_inventory_count_draft'){localStorage.removeItem('test-draft');return;}
      if(command==='runtime_command'){
        state.requests.push(args);
        if(state.requests.length===1)throw new Error('Connection interrupted');
        return {commandId:args.command.id,recordIds:[],auditReference:'audit',sequence:1};
      }
      throw new Error(`Unexpected command ${command}`);
    }};
  });
  await login(page);
  await page.getByRole('button',{name:'Count stock',exact:true}).click();
  await page.getByRole('button',{name:'Main Store',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Full stocktake'});
  await dialog.getByLabel('Sealed bottles for Wine').fill('8');
  await expect(dialog.getByRole('button',{name:'Review count'})).toBeDisabled();
  await dialog.getByLabel('Open ml for Wine').fill('300');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('test-draft')||'null')?.counts.wine)).toBe(6300);
  await page.reload(); await login(page);
  await page.getByRole('button',{name:'Count stock',exact:true}).click();
  await page.getByRole('button',{name:'Main Store',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Full stocktake'});
  await expect(dialog.getByLabel('Sealed bottles for Wine')).toHaveValue('8');
  await expect(dialog.getByLabel('Open ml for Wine')).toHaveValue('300');
  await dialog.getByRole('button',{name:'Review count',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).requests.length)).toBe(0);
  await dialog.getByRole('button',{name:'Confirm Count',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Retry Confirm Count'})).toBeVisible();
  await dialog.getByRole('button',{name:'Retry Confirm Count'}).click();
  await expect(dialog).toHaveCount(0);
  const requests=await page.evaluate(()=>(window as any).requests);
  expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
  expect(requests[0].command.payload.rows[0]).toMatchObject({countedQuantity:6300,countedSealedContainers:8,countedOpenQuantity:300});
  expect(requests[0].expectedVersions).toEqual(requests[0].command.payload.expectedVersions);
});
