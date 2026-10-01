import {expect,test} from '@playwright/test';

test('0.2.0 Simple Operations flows stay task-first and commit only on confirmation',async({page})=>{
  await page.addInitScript(()=>{
    const state=window as any;
    state.__SERVOS_COMMANDS=[];
    state.__SERVOS_IMPORT_STAGES=[];
    const record=(collection:string,id:string,data:any)=>({collection,id,version:1,archived:false,data});
    const permissions=[
      'business.view','staff.view','pos.sell','payment.record',
      'catalog.view','catalog.manage','inventory.view','inventory.count','inventory.transfer','inventory.waste',
      'procurement.view','procurement.manage','procurement.receive','procurement.over_receive',
      'rooms.view','rooms.manage','rooms.operate','assets.view','assets.manage','assets.operate',
      'maintenance.view','maintenance.manage','data.import.view','data.import.stage','data.import.execute',
      'backup.create','help.view'
    ];
    const snapshot:any={
      terminalId:'terminal-rc',installationStage:'LIVE',pendingCount:0,lastSync:null,lastBackup:null,
      actor:{id:'staff-1',name:'Mary',role:'Admin',permissions},
      records:[
        record('organization','business',{name:'RC Test Business'}),
        record('property','property',{name:'RC Test Business',currency:'KES',timezone:'Africa/Nairobi'}),
        record('suppliers','supplier-1',{id:'supplier-1',name:'EABL',active:true}),
        record('stockLocations','main',{id:'main',name:'Main Store',code:'MAIN',active:true}),
        record('stockItems','tusker-stock',{id:'tusker-stock',name:'Tusker 500ml stock',code:'TUSKER500',barcode:'6161100000001',baseUnit:'bottle',scanUnitQuantity:1,averageUnitCost:165,currentStock:{main:10},active:true}),
        record('products','tusker-product',{id:'tusker-product',name:'Tusker 500ml',code:'TUSKER500',barcode:'6161100000001',stockItemId:'tusker-stock',active:true})
      ]
    };
    const addRecord=(collection:string,id:string,data:any)=>{
      const i=snapshot.records.findIndex((row:any)=>row.collection===collection&&row.id===id);
      const next=record(collection,id,data);
      if(i>=0)snapshot.records[i]=next;else snapshot.records.push(next);
    };
    state.__TAURI_INTERNALS__={invoke:async(command:string,args?:any)=>{
      if(command==='runtime_status')return {enrolled:true,installationStage:'LIVE',staff:[{id:'staff-1',name:'Mary',role:'Admin'}]};
      if(command==='runtime_login')return {token:'session-rc',staffId:'staff-1',name:'Mary',role:'Admin'};
      if(command==='runtime_login_offline')return {token:'session-rc',staffId:'staff-1',name:'Mary',role:'Admin'};
      if(command==='runtime_snapshot')return snapshot;
      if(command==='runtime_guidance_progress')return [];
      if(command==='runtime_guidance_save_progress')return args?.progress||{};
      if(command==='runtime_printer_jobs')return [];
      if(command==='runtime_sync')return {};
      if(command==='runtime_import_list')return [];
      if(command==='runtime_import_stage'){
        state.__SERVOS_IMPORT_STAGES.push(args);
        return {id:'batch-1',templateKey:args.templateKey,fileName:args.fileName,sourceHash:'0123456789abcdef0123456789abcdef',status:'READY',rowCount:1,validCount:1,invalidCount:0,createdAt:'2026-09-28T00:00:00Z',rows:[{rowNumber:2,externalId:'001',errors:[]}]};
      }
      if(command==='runtime_command'){
        const request=args?.command; state.__SERVOS_COMMANDS.push(request);
        if(request?.operation==='room.quickCreate'){
          const typeId=request.payload.roomTypeId||'type-standard';
          if(request.payload.newType)addRecord('roomTypes',typeId,{id:typeId,name:request.payload.newType.name,capacity:request.payload.newType.capacity});
          for(const number of request.payload.numbers)addRecord('rooms',`room-${number}`,{id:`room-${number}`,number,roomTypeId:typeId,capacity:request.payload.newType?.capacity||2,turnaroundMinutes:request.payload.details?.turnaroundMinutes||30,housekeepingState:'CLEAN',maintenanceState:'AVAILABLE'});
        }
        if(request?.operation==='asset.quickCreate')addRecord('assets','asset-tv',{id:'asset-tv',name:request.payload.name,roomId:request.payload.roomId,locationId:request.payload.locationId,status:'ACTIVE',permanentTag:'PROP-TEST'});
        return {commandId:request?.id||'cmd-rc',recordIds:[],auditReference:'audit-rc',sequence:1};
      }
      throw new Error(`Unexpected native command: ${command}`);
    }};
  });

  await page.goto('/');
  await page.getByLabel('PIN').fill('123456');
  await page.getByRole('button',{name:'Continue with local PIN'}).click();

  await expect(page.getByRole('region',{name:'Staff welcome'})).toBeVisible();
  await expect(page.getByText('Welcome, Mary')).toBeVisible();
  await page.getByRole('button',{name:'Dismiss welcome'}).click();
  await expect(page.getByRole('heading',{name:'What are you working on?'})).toBeVisible();

  await page.getByRole('button',{name:/Receive a delivery/}).first().click();
  const receive=page.getByRole('dialog',{name:'Receive Delivery'});
  await receive.getByLabel('Supplier').selectOption('supplier-1');
  await receive.getByLabel('Invoice / delivery reference').fill('INV-3482');
  await receive.getByLabel('Search delivery items').fill('Tusker');
  await receive.getByRole('button',{name:'Tusker 500ml stock'}).click();
  expect(await page.evaluate(()=>((window as any).__SERVOS_COMMANDS||[]).filter((c:any)=>c.operation==='procurement.receiveDelivery').length)).toBe(0);
  await receive.getByRole('button',{name:'Review Delivery'}).click();
  expect(await page.evaluate(()=>((window as any).__SERVOS_COMMANDS||[]).filter((c:any)=>c.operation==='procurement.receiveDelivery').length)).toBe(0);
  await receive.getByRole('button',{name:'Confirm Delivery'}).click();
  await expect.poll(()=>page.evaluate(()=>((window as any).__SERVOS_COMMANDS||[]).filter((c:any)=>c.operation==='procurement.receiveDelivery').length)).toBe(1);

  await page.evaluate(()=>{window.location.hash='/home';});
  await expect(page.getByRole('heading',{name:'What are you working on?'})).toBeVisible();
  await page.getByRole('button',{name:'Quick Add'}).click();
  await page.getByRole('dialog',{name:'What do you need to add?'}).getByRole('button',{name:/Room/}).click();
  const room=page.getByRole('dialog',{name:'Add Room'});
  await room.getByLabel('Room number').fill('104');
  await room.getByLabel('Type name').fill('Standard');
  await room.getByLabel('Normal nightly price (KES)').fill('3500');
  await room.getByRole('button',{name:'Review rooms'}).click();
  expect(await page.evaluate(()=>((window as any).__SERVOS_COMMANDS||[]).filter((c:any)=>c.operation==='room.quickCreate').length)).toBe(0);
  await room.getByRole('button',{name:'Add Room'}).click();
  await expect.poll(()=>page.evaluate(()=>((window as any).__SERVOS_COMMANDS||[]).filter((c:any)=>c.operation==='room.quickCreate').length)).toBe(1);

  await page.evaluate(()=>{window.location.hash='/home';});
  await expect(page.getByRole('heading',{name:'What are you working on?'})).toBeVisible();
  await page.getByRole('button',{name:'Quick Add'}).click();
  await page.getByRole('dialog',{name:'What do you need to add?'}).getByRole('button',{name:/Property item/}).click();
  const property=page.getByRole('dialog',{name:'Add Property'});
  await property.getByLabel('Property name').fill('Samsung 43" TV');
  await property.getByLabel('Where is it?').selectOption('room:room-104');
  await property.getByRole('button',{name:'Add Property'}).click();
  await expect.poll(()=>page.evaluate(()=>((window as any).__SERVOS_COMMANDS||[]).filter((c:any)=>c.operation==='asset.quickCreate').length)).toBe(1);

  await page.evaluate(()=>{window.location.hash='/imports';});
  await expect(page.getByRole('heading',{name:'Bring In Existing Data'})).toBeVisible();
  await page.getByLabel('Paste from Excel').fill('external_id\tcode\tname\tselling_price\n001\tCOKE300\tCoke 300ml\t100');
  await expect(page.getByText(/1 rows · 0 duplicate external IDs · 0 rows missing required values/)).toBeVisible();
  await page.getByRole('button',{name:'Validate mapped data'}).click();
  await expect.poll(()=>page.evaluate(()=>((window as any).__SERVOS_IMPORT_STAGES||[]).length)).toBe(1);
  const staged=await page.evaluate(()=>((window as any).__SERVOS_IMPORT_STAGES||[])[0]);
  expect(staged.csvText).toContain('001');
});
