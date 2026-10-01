import {expect,test} from '@playwright/test';

test('customer account workspace and POS credit action are wired on desktop and mobile',async({page})=>{
  await page.addInitScript(()=>{
    const state=window as any;
    const record=(collection:string,id:string,data:any)=>({collection,id,version:1,archived:false,data});
    const snapshot:any={
      terminalId:'terminal-credit',installationStage:'LIVE',pendingCount:0,lastSync:null,lastBackup:null,
      actor:{id:'staff-1',name:'Mary',role:'Admin',permissions:[
        'business.view','pos.sell','pos.open_tab','payment.record','mpesa.record',
        'credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off','credit.override_limit',
        'catalog.view','help.view'
      ]},
      records:[
        record('organization','business',{name:'Credit Test Business'}),
        record('property','property',{name:'Credit Test Business',currency:'KES',timezone:'Africa/Nairobi'}),
        record('outlets','main',{id:'main',name:'Main Bar',active:true}),
        record('customers','kamau',{id:'kamau',name:'John Kamau',phone:'0712345678'}),
        record('customerCreditAccounts','kamau',{id:'kamau',customerId:'kamau',customerName:'John Kamau',status:'ACTIVE',limitMinor:10000000,limit:100000,termsDays:30}),
        record('customerCreditEntries','charge-1',{id:'charge-1',customerId:'kamau',customerName:'John Kamau',kind:'CHARGE',balanceDeltaMinor:250000,amountMinor:250000,occurredAt:'2026-09-28T10:00:00+03:00',dueAt:'2026-10-28T10:00:00+03:00',reference:'ORD-OLD'}),
        record('orders','order-1',{id:'order-1',orderNumber:'ORD-1',outletId:'main',customerId:'kamau',customerName:'John Kamau',tabName:'Kamau',state:'OPEN',items:[],subtotal:500,taxTotal:0,cateringLevyTotal:0,grandTotal:500,amountPaid:0,amountCredited:0}),
        record('paymentConfig','main',{id:'main',methods:['CASH','MPESA','CARD'],mpesaAccounts:[{label:'Primary',number:'123456'}]})
      ]
    };
    state.__TAURI_INTERNALS__={invoke:async(command:string,args?:any)=>{
      if(command==='runtime_status')return {enrolled:true,installationStage:'LIVE',staff:[{id:'staff-1',name:'Mary',role:'Admin'}]};
      if(command==='runtime_login')return {token:'session-credit',staffId:'staff-1',name:'Mary',role:'Admin'};
      if(command==='runtime_login_offline')return {token:'session-credit',staffId:'staff-1',name:'Mary',role:'Admin'};
      if(command==='runtime_snapshot')return snapshot;
      if(command==='runtime_guidance_progress')return [];
      if(command==='runtime_guidance_save_progress')return args?.progress||{};
      if(command==='runtime_printer_jobs')return [];
      if(command==='runtime_sync')return {};
      if(command==='runtime_command')return {commandId:args?.command?.id||'credit-cmd',recordIds:[],auditReference:'audit-credit',sequence:1};
      throw new Error(`Unexpected native command: ${command}`);
    }};
  });

  await page.goto('/#/credit');
  await page.getByLabel('PIN').fill('123456');
  await page.getByRole('button',{name:'Continue with local PIN'}).click();
  const welcome=page.getByRole('region',{name:'Staff welcome'});
  if(await welcome.isVisible().catch(()=>false))await page.getByRole('button',{name:'Dismiss welcome'}).click();

  await expect(page.getByRole('heading',{name:'Customer Accounts'})).toBeVisible();
  await expect(page.getByText('John Kamau').first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Receive Payment'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reconcile'})).toBeVisible();

  await page.evaluate(()=>{window.location.hash='/pos';});
  await expect(page.getByText('Customer account: ACTIVE')).toBeVisible();
  await expect(page.getByRole('button',{name:'Charge to account'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Change customer'})).toBeVisible();
});
