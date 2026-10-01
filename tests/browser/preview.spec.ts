import { expect, test } from '@playwright/test';

test('browser preview is explicit and all retained module routes render', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open UI preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Open UI preview' }).click();
  await expect(page.getByText(/UI preview.*sample data only/)).toBeVisible();
  for (const route of ['pos', 'catalog', 'kds', 'inventory', 'accounting', 'hotel', 'crm', 'events', 'host', 'procurement', 'batch', 'staff', 'reports', 'tender', 'control', 'settings', 'help']) {
    await page.evaluate(route => { window.location.hash = `/${route}`; }, route);
    await page.waitForTimeout(100);
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    // Preview screens use different semantic landmarks; verify the React app
    // remains mounted while the requested hash route settles.
    const rootMounted=await page.locator('#root').evaluate(element=>element.childElementCount>0);
    assertRootMounted(rootMounted,route,errors);
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

function assertRootMounted(mounted:boolean,route:string,errors:string[]) {
  if(!mounted) throw new Error(`Preview route ${route} unmounted the React app. Browser errors: ${errors.join(' | ') || 'none captured'}`);
}

test('native shell mounts its fresh-install intake without runtime provider errors', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        if (command === 'runtime_status') return { enrolled: false, installationStage: 'NEW', staff: [] };
        throw new Error(`Unexpected native command: ${command}`);
      },
    };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Configure the business and its first administrator' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('native checkout, location count, and resumable scanner draft', async ({ page }) => {
  await page.addInitScript(() => {
    const windowState = window as Window & { __SERVOS_CALLS?: string[]; __SERVOS_COMMANDS?: any[]; __SERVOS_COUNT_DRAFTS?: Record<string, any> };
    windowState.__SERVOS_CALLS = [];
    windowState.__SERVOS_COMMANDS = [];
    windowState.__SERVOS_COUNT_DRAFTS = {};
    window.print = () => undefined;
    const order = { id: 'order-1', outletId: 'outlet-1', state: 'OPEN', orderNumber: 'SO-1001', subtotal: 100, taxTotal: 0, cateringLevyTotal: 0, grandTotal: 100, amountPaid: 0, items: [{ id: 'item-1', productName: 'Test Lager', quantity: 1, lineTotal: 100, courseStatus: 'HELD' }] };
    const record = (collection: string, id: string, data: Record<string, unknown>) => ({ collection, id, version: 1, archived: false, data });
    const snapshot = {
      terminalId: 'terminal-test', installationStage: 'LIVE', pendingCount: 0, lastSync: null, lastBackup: null,
      actor: { id: 'staff-1', name: 'Test Owner', role: 'Admin', permissions: ['pos.sell','kds.view','inventory.view','inventory.count','catalog.view','catalog.manage','mpesa.reconcile','payment.record','floorplan.view','till.close','reports.view','backup.create','help.view','sync.manual'] },
      records: [record('organization','business',{name:'Test Bar'}),record('outlets','outlet-1',{name:'Main Bar',propertyId:'property-1',active:true}),record('orders','order-1',order),record('paymentConfig','main',{methods:['CASH']}),record('stockLocations','main',{id:'main',name:'Main Store',code:'MAIN'}),record('stockItems','whisky-350-stock',{id:'whisky-350-stock',name:'Whisky 350 stock',code:'WHISKY-350-STOCK',baseUnit:'ml',scanUnitQuantity:350,currentStock:{}}),record('stockItems','whisky-750-stock',{id:'whisky-750-stock',name:'Whisky 750 stock',code:'WHISKY-750-STOCK',baseUnit:'ml',scanUnitQuantity:750,currentStock:{}})],
    };
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: async (command: string, args?: any) => {
        windowState.__SERVOS_CALLS?.push(command);
        if (command === 'runtime_command') windowState.__SERVOS_COMMANDS?.push(args?.command);
        if (command === 'runtime_status') return { enrolled: true, installationStage: 'LIVE', staff: [{id:'staff-1',name:'Test Owner',role:'Admin'}] };
        if (command === 'runtime_login') return {token:'test-session',staffId:'staff-1',name:'Test Owner',role:'Admin'};
        if (command === 'runtime_login_offline') return {token:'test-session',staffId:'staff-1',name:'Test Owner',role:'Admin'};
        if (command === 'runtime_snapshot') return snapshot;
        if (command === 'runtime_guidance_progress') return [];
        if (command === 'runtime_guidance_save_progress') return args?.progress || {};
        if (command === 'runtime_inventory_count_draft') return windowState.__SERVOS_COUNT_DRAFTS?.[args?.locationId] || null;
        if (command === 'runtime_save_inventory_count_draft') { const saved={...args?.draft,updatedAt:new Date().toISOString()}; if(windowState.__SERVOS_COUNT_DRAFTS)windowState.__SERVOS_COUNT_DRAFTS[args?.locationId]=saved; return saved; }
        if (command === 'runtime_clear_inventory_count_draft') { if(windowState.__SERVOS_COUNT_DRAFTS)delete windowState.__SERVOS_COUNT_DRAFTS[args?.locationId]; return; }
        if (command === 'runtime_command') {
          const request=args?.command;
          if(request?.operation==='record.save'){
            const {collection,id,data}=request.payload;
            const index=snapshot.records.findIndex((row:any)=>row.collection===collection&&row.id===id);
            const saved={collection,id,version:index>=0?snapshot.records[index].version+1:1,archived:false,data};
            if(index>=0)snapshot.records[index]=saved;else snapshot.records.push(saved);
          }
          return {commandId:'cmd-test',recordIds:[],auditReference:'audit-test',sequence:1};
        }
        if (command === 'runtime_printer_jobs') return [];
        if (command === 'runtime_sync') return {};
        if (command === 'runtime_receipt') return {document:{id:'receipt-1',schemaVersion:2,orderId:'order-1',sourceCommandId:'command-1',number:'R-001001',orderNumber:'ORD-000001',issuedAt:'2026-09-26T10:00:00Z',currency:'KES',timezone:'Africa/Nairobi',business:{name:'Test Bar',address:'Nairobi',phone:'0700000000'},cashier:'Test Owner',outlet:'Main Bar',customerName:'Nia Kamau',message:'Thank you',brandingSnapshot:{version:1,footerLines:['Built By KINGSFORGE','info@kingsforge.co.ke','info@davemusau.co.ke','0746157440'],receiptLogoDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1xoAAAAASUVORK5CYII='},items:[{id:'item-1',description:'Test Lager',quantity:1,unitPriceMinor:10000,amountMinor:10000,modifiers:[]}],subtotalMinor:10000,discountMinor:0,netMinor:10000,taxMinor:0,levyMinor:0,totalMinor:10000,paidMinor:10000,balanceMinor:0,payments:[{id:'payment-1',tenderType:'CASH',amountMinor:10000,cashTenderedMinor:10000,changeMinor:0,currentPayment:true}]},customerLines:['CUSTOMER COPY'],businessLines:['BUSINESS RECORD COPY']};
        if (command === 'runtime_print_receipt') return {jobId:'print-test-1',orderId:'order-1',state:'QUEUED',message:'Printer offline; job retained.'};
        if (command === 'runtime_printer_retry') return {jobId:'print-test-1',orderId:'order-1',state:'SENT',message:'Test spooler accepted receipt.'};
        throw new Error(`Unexpected native command: ${command}`);
      },
    };
  });
  await page.goto('/');
  await page.getByLabel('PIN').fill('123456');
  await page.getByRole('button', {name:'Continue with local PIN'}).click();
  await expect(page.getByRole('heading', {name:'What are you working on?'})).toBeVisible();
  await page.getByRole('button', {name:'Take a quick tour'}).click();
  await expect(page.getByRole('dialog', {name:/Getting around ServOS/})).toBeVisible();
  await page.getByRole('button', {name:'Close',exact:true}).click();
  await page.getByRole('button', {name:'Quick Add'}).click();
  const quickAdd=page.getByRole('dialog', {name:'What do you need to add?'});
  await expect(quickAdd.getByRole('button', {name:/Item or menu product/})).toBeVisible();
  await expect(quickAdd.getByRole('button', {name:/Room/})).toHaveCount(0);
  await expect(quickAdd.getByRole('button', {name:/Property item/})).toHaveCount(0);
  await quickAdd.getByRole('button', {name:/Item or menu product/}).click();
  const addProduct=page.getByRole('dialog', {name:/Smart Item Wizard/});
  await expect(addProduct).toBeVisible();
  await expect(page).toHaveURL(/#\/catalog\?action=add-item$/);
  await addProduct.getByLabel('What are you adding?').selectOption('SPIRIT');
  await addProduct.getByLabel('Product family name').fill('Jameson');
  await addProduct.getByRole('button', {name:'Continue'}).click();
  await addProduct.getByRole('button', {name:'350ml'}).click();
  await addProduct.getByLabel('Whole-container selling price (KES)').fill('1200');
  await addProduct.getByLabel('Serving price').fill('250');
  await addProduct.getByLabel('Tax class').selectOption('A_16');
  await addProduct.getByRole('button', {name:'Add serving'}).click();
  await addProduct.getByRole('button', {name:'Continue'}).click();
  await addProduct.getByText('More setup').click();
  await addProduct.getByRole('checkbox', {name:'Track sales against an existing stock item'}).check();
  await addProduct.getByLabel('Stock item', {exact:true}).selectOption('whisky-350-stock');
  await addProduct.getByRole('button', {name:'Continue'}).click();
  await addProduct.getByRole('button', {name:'Save item size'}).click();
  await expect(addProduct).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Add another size'})).toBeVisible();
  await page.getByRole('button', {name:'Add another size'}).click();
  const addVariant=page.getByRole('dialog', {name:'Add another size'});
  await addVariant.getByLabel('Product family name').fill('Jameson');
  await addVariant.getByRole('button', {name:'Continue'}).click();
  await addVariant.getByRole('combobox',{name:/Product family/}).selectOption({index:1});
  await addVariant.getByRole('button', {name:'Continue'}).click();
  await addVariant.getByRole('button', {name:'750ml'}).click();
  await addVariant.getByLabel('Whole-container selling price (KES)').fill('1900');
  await addVariant.getByLabel('Tax class').selectOption('A_16');
  await addVariant.getByRole('button', {name:'Continue'}).click();
  await addVariant.getByText('More setup').click();
  await addVariant.getByRole('checkbox', {name:'Track sales against an existing stock item'}).check();
  await expect(addVariant.getByRole('combobox',{name:/Product family/})).not.toHaveValue('');
  await expect(addVariant.getByLabel('Stock item', {exact:true}).locator('option').nth(1)).toBeDisabled();

  await addVariant.getByLabel('Stock item', {exact:true}).selectOption('whisky-750-stock');
  await addVariant.getByRole('button', {name:'Continue'}).click();
  await addVariant.getByRole('button', {name:'Save item size'}).click();
  const variants=await page.evaluate(()=>((window as any).__SERVOS_COMMANDS||[]).filter((command:any)=>command.operation==='record.save'&&command.payload.collection==='products').map((command:any)=>command.payload.data));
  expect(variants).toHaveLength(2);
  expect(variants[0].productFamilyId).toBeTruthy();
  expect(variants[1].productFamilyId).toBe(variants[0].productFamilyId);
  expect(variants.map((variant:any)=>variant.variantLabel)).toEqual(['350 ml bottle','750 ml bottle']);
  expect(variants.map((variant:any)=>variant.stockItemId)).toEqual(['whisky-350-stock','whisky-750-stock']);
  expect(variants[0].portions.map((portion:any)=>portion.name)).toEqual(['Whole bottle','Single']);
  await page.getByRole('button', {name:'Add another size'}).click();
  const atomicVariant=page.getByRole('dialog', {name:'Add another size'});
  await atomicVariant.getByLabel('Product family name').fill('Jameson');
  await atomicVariant.getByRole('button', {name:'Continue'}).click();
  await atomicVariant.getByRole('combobox',{name:/Product family/}).selectOption({index:1});
  await atomicVariant.getByRole('button', {name:'Continue'}).click();
  await atomicVariant.getByRole('button', {name:'1L'}).click();
  await atomicVariant.getByLabel('Whole-container selling price (KES)').fill('2400');
  await atomicVariant.getByLabel('Tax class').selectOption('A_16');
  await atomicVariant.getByRole('button', {name:'Continue'}).click();
  await atomicVariant.getByRole('checkbox', {name:/Create stock and opening balance/}).check();
  await atomicVariant.getByLabel('Sale containers in one package').fill('1');
  await atomicVariant.getByLabel('Price per package (KES)').fill('250');
  await atomicVariant.getByLabel('Opening packages on hand').fill('12');
  await atomicVariant.getByRole('button', {name:'Continue'}).click();
  await atomicVariant.getByRole('button', {name:'Save item and opening stock'}).click();
  const atomicCalls=await page.evaluate(()=>((window as any).__SERVOS_COMMANDS||[]).filter((command:any)=>command.operation==='catalog.createWithOpeningStock'));
  expect(atomicCalls).toHaveLength(1);
  expect(atomicCalls[0].payload.product.productFamilyId).toBe(variants[0].productFamilyId);
  expect(atomicCalls[0].payload.product.variantLabel).toBe('1000 ml bottle');
  expect(atomicCalls[0].payload.stockItem.baseUnit).toBe('ml');
  expect(atomicCalls[0].payload.stockItem.scanUnitQuantity).toBe(1000);
  expect(atomicCalls[0].payload.startingQuantity).toBe(12000);
  await page.getByRole('button', {name:'Sell', exact:true}).click();
  await page.getByRole('button', {name:'Pay'}).click();
  await page.getByLabel('Cash tendered').fill('100');
  await page.getByRole('button', {name:'Record payment'}).click();
  const receipt = page.getByRole('dialog', {name:'Print receipts'});
  await expect(receipt).toBeVisible();
  await expect(receipt.locator('.native-receipt-copy')).toHaveCount(2);
  await expect(receipt.locator('.native-receipt-copy').nth(0).getByText('CUSTOMER COPY', {exact:true})).toBeVisible();
  await expect(receipt.locator('.native-receipt-copy').nth(1).getByText('BUSINESS RECORD COPY - RETAIN FOR RECONCILIATION', {exact:true})).toBeVisible();
  const customerCopy=receipt.locator('.native-receipt-copy').nth(0);
  const businessCopy=receipt.locator('.native-receipt-copy').nth(1);
  await expect(customerCopy.getByText('Customer: Nia Kamau')).toBeVisible();
  await expect(businessCopy.getByText('Customer: Nia Kamau')).toHaveCount(0);
  await expect(customerCopy.getByRole('img',{name:'Business receipt logo'})).toHaveCount(1);
  await expect(businessCopy.getByRole('img',{name:'Business receipt logo'})).toHaveCount(0);
  expect(await customerCopy.locator('footer').evaluate(el=>Array.from(el.children).indexOf(el.querySelector('.receipt-logo')!)>Array.from(el.children).indexOf(el.querySelector('.receipt-attribution')!))).toBe(true);
  await expect(receipt.getByText('Built By KINGSFORGE', {exact:true})).toHaveCount(2);
  await expect(receipt.getByText('info@kingsforge.co.ke', {exact:true})).toHaveCount(2);
  await expect(receipt.getByText(/eTIMS|ETR/)).toHaveCount(0);
  expect(await receipt.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('receipt-preview.png')});
  await page.emulateMedia({media:'print'});
  await expect(page.locator('#servos-receipt-print')).toBeVisible();
  await expect(page.locator('#servos-receipt-print .native-receipt-copy')).toHaveCount(2);
  expect(await page.locator('#servos-receipt-print').evaluate(el=>el.parentElement===document.body)).toBe(true);
  await page.emulateMedia({media:'screen'});
  await receipt.getByRole('button', {name:'Print both copies'}).click();
  await expect(receipt.getByRole('status')).toContainText('QUEUED');
  await receipt.getByRole('button', {name:'Retry queued print'}).click();
  await expect(receipt.getByRole('status')).toContainText('SENT');
  expect(await page.evaluate(() => (window as Window & {__SERVOS_CALLS?:string[]}).__SERVOS_CALLS)).toContain('runtime_print_receipt');
  expect(await page.evaluate(() => (window as Window & {__SERVOS_CALLS?:string[]}).__SERVOS_CALLS)).toContain('runtime_printer_retry');

  await page.evaluate(() => { window.location.hash = '/inventory'; });
  await expect(page.getByRole('heading', {name:'Inventory'})).toBeVisible();
  await page.getByRole('button', {name:'Count stock'}).click();
  const count = page.getByRole('dialog', {name:'Count stock by location'});
  await count.getByRole('button', {name:/Main Store/}).click();
  await count.getByLabel('Counted quantity for Whisky 350 stock').fill('0');
  await count.getByLabel('Counted quantity for Whisky 750 stock').fill('0');
  const countCalls = () => page.evaluate(() => ((window as any).__SERVOS_COMMANDS || []).filter((command:any) => command.operation === 'inventory.countLocation'));
  expect(await countCalls()).toHaveLength(0);
  await count.getByRole('button', {name:'Review Count'}).click();
  await expect(count.getByText('2 items at Main Store. Stock changes only after you confirm.')).toBeVisible();
  expect(await countCalls()).toHaveLength(0);
  await count.getByRole('button', {name:'Confirm Count'}).click();
  await expect(count).toHaveCount(0);
  const committedCounts = await countCalls();
  expect(committedCounts).toHaveLength(1);
  expect(committedCounts[0].payload.rows).toHaveLength(2);

  await page.getByRole('button', {name:'Count stock'}).click();
  const scannerCount = page.getByRole('dialog', {name:'Count stock by location'});
  await scannerCount.getByRole('button', {name:/Main Store/}).click();
  await scannerCount.getByRole('button', {name:/Continuous scanner session/}).click();
  const scannerInput = scannerCount.getByLabel('Scan a barcode or stock code');
  await scannerInput.pressSequentially('WHISKY-350-STOCK', {delay:8});
  await scannerInput.press('Enter');
  await expect(scannerCount.getByRole('status').filter({hasText:'Whisky 350 stock'})).toContainText('Whisky 350 stock +350 ml');
  await scannerInput.pressSequentially('UNKNOWN-BOTTLE-42', {delay:8});
  await scannerInput.press('Enter');
  await expect(scannerCount.getByRole('heading', {name:'Unknown barcodes'})).toBeVisible();
  await scannerCount.getByLabel('Assign UNKNOWN-BOTTLE-42 to stock item').selectOption('whisky-750-stock');
  await scannerCount.getByRole('button', {name:'Assign',exact:true}).click();
  await expect(scannerCount.getByRole('status').filter({hasText:'Assigned'})).toContainText('Assigned 1 scan to Whisky 750 stock');
  await page.waitForFunction(() => Boolean((window as any).__SERVOS_COUNT_DRAFTS?.main?.counts?.['whisky-350-stock'] === 350 && (window as any).__SERVOS_COUNT_DRAFTS?.main?.counts?.['whisky-750-stock'] === 750));
  await scannerCount.getByRole('button', {name:'Close count'}).click();

  await page.getByRole('button', {name:'Count stock'}).click();
  const resumedCount = page.getByRole('dialog', {name:'Count stock by location'});
  await resumedCount.getByRole('button', {name:/Main Store/}).click();
  await resumedCount.getByRole('button', {name:/Continuous scanner session/}).click();
  await expect(resumedCount.getByLabel('Scanner count for Whisky 350 stock')).toHaveValue('350');
  await expect(resumedCount.getByLabel('Scanner count for Whisky 750 stock')).toHaveValue('750');
  expect(await countCalls()).toHaveLength(1);
});

test('floorplan drafts are editable and preview cannot claim a saved layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open UI preview' }).click();
  await page.getByRole('button', { name: 'Floor Studio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Floorplan designer' });
  await dialog.getByRole('button', { name: 'Round 2-Seat' }).click();
  await dialog.getByLabel('Horizontal position (%)').fill('25');
  await dialog.getByLabel('Vertical position (%)').fill('35');
  await dialog.getByRole('button', { name: 'Save layout' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Saving requires the installed application');
  expect(await dialog.evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
});
