import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../src/migrate.mjs';
import {PostgresStore} from '../src/postgres-store.mjs';
import {executeCommand} from '../src/command-kernel.mjs';
import {catalogCommandRegistry} from '../src/catalog-commands.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('PostgreSQL catalog lifecycle preserves recipes, scan identifiers, archive blockers and tombstones',{skip:!databaseUrl,timeout:120_000},async t=>{
  const adminPool=new Pool({connectionString:databaseUrl,max:2});
  const schema=`catalog_acceptance_${randomUUID().replaceAll('-','')}`;
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const pool=new Pool({connectionString:databaseUrl,max:8,options:`-c search_path=${schema},public`});
  t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end()});
  await migrate(pool);

  const store=new PostgresStore(pool),businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID();
  const actor={businessId,staffId,deviceId,permissions:['*']};
  await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Disposable Catalog Acceptance']);
  const run=(name,payload,expectedVersions={})=>executeCommand({db:store,actor,registry:catalogCommandRegistry,command:{commandId:randomUUID(),name,payload,expectedVersions}});
  const saveStock=async({id=randomUUID(),code=`ST-${randomUUID().slice(0,8)}`,name=code,barcode=null,barcodeAliases=[],purchasePackages=[]}={})=>{
    const result=await run('stockItem.save',{id,data:{name,code,baseUnit:'unit',barcode,barcodeAliases,scanUnitQuantity:1,reorderLevel:0,averageUnitCostMinor:100,purchasePackages}},{[`stockItems:${id}`]:0});
    assert.equal(result.kind,'CONFIRMED',JSON.stringify(result));return{id,record:result.result};
  };
  const saveLocation=async({id=randomUUID(),code=`LOC-${randomUUID().slice(0,8)}`,name=code}={})=>{
    const result=await run('stockLocation.save',{id,data:{name,code,type:'STORE'}},{[`stockLocations:${id}`]:0});
    assert.equal(result.kind,'CONFIRMED',JSON.stringify(result));return{id,record:result.result};
  };
  const saveProduct=async({id=randomUUID(),name='Catalog product',code=`PR-${randomUUID().slice(0,8)}`,barcode=null,data={}}={})=>{
    const result=await run('product.save',{id,data:{name,code,priceMinor:1250,category:'GENERAL',routeTo:'BAR',barcode,...data}},{[`products:${id}`]:0});
    return{id,result};
  };
  const operationPrefix={products:'product',stockItems:'stockItem',stockLocations:'stockLocation'};
  const archive=(name,id,version)=>run(`${operationPrefix[name]}.archive`,{id,reason:'Reviewed catalog retirement'},{[`${name}:${id}`]:version});
  const restore=(name,id,version)=>run(`${operationPrefix[name]}.reactivate`,{id,reason:'Reviewed catalog restoration'},{[`${name}:${id}`]:version});

  const location=await saveLocation(),outletId=randomUUID();
  await pool.query('INSERT INTO business_outlets(business_id,id,name,default_stock_location_id,version) VALUES($1,$2,$3,$4,1)',[businessId,outletId,'Main outlet',location.id]);
  const direct=await saveStock({code:'CAT-DIRECT',barcode:'616000010',barcodeAliases:[' 616000011 '],purchasePackages:[{id:randomUUID(),name:'Case',baseQuantity:12,unitCostMinor:1000,barcode:'616000012'}]});
  const ingredient=await saveStock({code:'CAT-RECIPE'});
  const modifierStock=await saveStock({code:'CAT-MODIFIER'});
  const richProduct=await saveProduct({code:'CAT-RICH',barcode:'616000020',data:{stockItemId:direct.id,inventoryType:'RECIPE',recipeYield:4,portionVolume:0.25,sellingMode:'SERVING_AND_BOTTLE',portions:[{id:'glass',name:'Glass',priceMinor:1250,volume:0.25},{id:'whole',name:'Whole',priceMinor:4000,volume:1,wholeContainerSale:true}],recipeIngredients:[{stockItemId:ingredient.id,quantity:0.5,unit:'kg'}],modifiers:[{id:'extra',name:'Extra ingredient',priceDeltaMinor:50,ingredientAdjustments:[{stockItemId:modifierStock.id,quantityDelta:0.125}]}],outletIds:[outletId],taxClassId:'A_16'}});
  assert.equal(richProduct.result.kind,'CONFIRMED',JSON.stringify(richProduct.result));
  const richRecord=(await store.catalogBootstrap(businessId)).records.find(row=>row.collection==='products'&&row.id===richProduct.id);
  assert.deepEqual(richRecord.data.portions.map(row=>row.id),['glass','whole']);
  assert.deepEqual(richRecord.data.recipeIngredients,[{productId:richProduct.id,stockItemId:ingredient.id,quantity:0.5,unit:'kg'}]);
  assert.deepEqual(richRecord.data.modifiers,[{id:'extra',name:'Extra ingredient',priceDeltaMinor:50,ingredientAdjustments:[{stockItemId:modifierStock.id,quantityDelta:0.125}]}]);
  assert.deepEqual(richRecord.data.outletIds,[outletId]);assert.equal(richRecord.data.taxClassId,'A_16');
  const directProjection=(await store.catalogBootstrap(businessId)).records.find(row=>row.collection==='stockItems'&&row.id===direct.id);
  assert.equal(directProjection.data.barcode,'616000010');assert.deepEqual(directProjection.data.barcodeAliases,['616000011']);
  assert.equal(directProjection.data.purchasePackages[0].barcode,'616000012','scanner lookup identifiers survive the API projection');

  for(const stock of [direct,ingredient,modifierStock]){
    const blocked=await archive('stockItems',stock.id,1);
    assert.equal(blocked.kind,'CONFLICT');assert.equal(blocked.error.code,'ACTIVE_PRODUCT_DEPENDENCY');
  }
  const staleSave=await run('stockItem.save',{id:ingredient.id,data:{name:'Stale',code:'CAT-RECIPE',baseUnit:'unit'}},{[`stockItems:${ingredient.id}`]:0});
  assert.equal(staleSave.kind,'CONFLICT');assert.equal(staleSave.error.code,'VERSION_CONFLICT');
  const invalidOutlet=await saveProduct({code:'CAT-BAD-OUTLET',data:{outletIds:[randomUUID()]}});
  assert.equal(invalidOutlet.result.kind,'CONFLICT');assert.equal(invalidOutlet.result.error.code,'RESOURCE_CONFLICT');
  const duplicatePackageId=randomUUID();
  const duplicatePackageBarcode=await run('stockItem.save',{id:duplicatePackageId,data:{name:'Duplicate package barcode',code:'CAT-DUP-PACK',baseUnit:'unit',purchasePackages:[{id:randomUUID(),name:'Duplicate scan code',baseQuantity:2,unitCostMinor:100,barcode:'616000012'}]}},{[`stockItems:${duplicatePackageId}`]:0});
  assert.equal(duplicatePackageBarcode.kind,'CONFLICT');assert.equal(duplicatePackageBarcode.error.code,'DUPLICATE_REFERENCE');

  const openOrderProduct=await saveProduct({code:'CAT-OPEN-ORDER'});assert.equal(openOrderProduct.result.kind,'CONFIRMED');
  const orderId=randomUUID();
  await pool.query(`INSERT INTO pos_orders(business_id,id,outlet_id,stock_location_id,name,service_destination,service_reference,state,currency,grand_total_minor,amount_paid_minor,version,created_by,device_id,created_at,updated_at)
    VALUES($1,$2,$3,$4,'Open catalog dependency','COUNTER','{}','OPEN','KES',1250,0,1,$5,$6,now(),now())`,[businessId,orderId,outletId,location.id,staffId,deviceId]);
  await pool.query(`INSERT INTO pos_order_lines(business_id,order_id,id,product_id,product_version,product_snapshot,quantity,unit_price_minor,gross_minor,line_total_minor,state,created_at,updated_at)
    VALUES($1,$2,$3,$4,1,'{"name":"Open catalog dependency"}',1,1250,1250,1250,'DRAFT',now(),now())`,[businessId,orderId,randomUUID(),openOrderProduct.id]);
  const draftBlocked=await archive('products',openOrderProduct.id,1);
  assert.equal(draftBlocked.kind,'CONFLICT');assert.equal(draftBlocked.error.code,'OPEN_ORDER_DEPENDENCY');
  await pool.query(`UPDATE pos_orders SET state='COMPLETED',version=version+1 WHERE business_id=$1 AND id=$2`,[businessId,orderId]);
  const archivedOrderProduct=await archive('products',openOrderProduct.id,1);
  assert.equal(archivedOrderProduct.kind,'CONFIRMED');
  let tombstone=(await store.catalogBootstrap(businessId)).records.find(row=>row.collection==='products'&&row.id===openOrderProduct.id);
  assert.equal(tombstone.archived,true,'archive events remain represented in a fresh bootstrap projection');
  const restoredOrderProduct=await restore('products',openOrderProduct.id,2);assert.equal(restoredOrderProduct.kind,'CONFIRMED');

  const codeRestore=await saveProduct({code:'CAT-RESTORE-CODE',barcode:'CAT-RESTORE-BAR'});assert.equal(codeRestore.result.kind,'CONFIRMED');
  assert.equal((await archive('products',codeRestore.id,1)).kind,'CONFIRMED');
  const codeCollision=await saveProduct({code:'CAT-RESTORE-CODE',barcode:'CAT-OTHER-BAR'});assert.equal(codeCollision.result.kind,'CONFIRMED');
  const restoreCodeConflict=await restore('products',codeRestore.id,2);assert.equal(restoreCodeConflict.kind,'CONFLICT');assert.equal(restoreCodeConflict.error.code,'DUPLICATE_REFERENCE');
  const renameCollision=await run('product.save',{id:codeCollision.id,data:{name:'Renamed code collision',code:'CAT-RESTORE-RENAMED',priceMinor:1250,category:'GENERAL',routeTo:'BAR'}},{[`products:${codeCollision.id}`]:1});assert.equal(renameCollision.kind,'CONFIRMED');
  const barcodeCollision=await saveProduct({code:'CAT-BARCODE-COLLISION',barcode:'CAT-RESTORE-BAR'});assert.equal(barcodeCollision.result.kind,'CONFIRMED');
  const restoreBarcodeConflict=await restore('products',codeRestore.id,2);assert.equal(restoreBarcodeConflict.kind,'CONFLICT');assert.equal(restoreBarcodeConflict.error.code,'DUPLICATE_REFERENCE');
  assert.equal((await archive('products',barcodeCollision.id,1)).kind,'CONFIRMED');
  assert.equal((await restore('products',codeRestore.id,2)).kind,'CONFIRMED');

  const stockRestore=await saveStock({code:'CAT-RESTORE-STOCK',barcode:'616000100',barcodeAliases:['616000101'],purchasePackages:[{id:randomUUID(),name:'Original pack',baseQuantity:2,unitCostMinor:100,barcode:'616000102'}]});
  assert.equal((await archive('stockItems',stockRestore.id,1)).kind,'CONFIRMED');
  const stockCodeCollision=await saveStock({code:'CAT-RESTORE-STOCK',barcode:'616000103'});
  const stockCodeBlocked=await restore('stockItems',stockRestore.id,2);assert.equal(stockCodeBlocked.kind,'CONFLICT');assert.equal(stockCodeBlocked.error.code,'DUPLICATE_REFERENCE');
  const renamedStock=await run('stockItem.save',{id:stockCodeCollision.id,data:{name:'Renamed stock',code:'CAT-RESTORE-RENAMED-STOCK',baseUnit:'unit',barcode:'616000103'}},{[`stockItems:${stockCodeCollision.id}`]:1});assert.equal(renamedStock.kind,'CONFIRMED');
  const stockBarcodeCollision=await saveStock({code:'CAT-RESTORE-BARCODE',barcode:'616000101'});
  const stockBarcodeBlocked=await restore('stockItems',stockRestore.id,2);assert.equal(stockBarcodeBlocked.kind,'CONFLICT');assert.equal(stockBarcodeBlocked.error.code,'DUPLICATE_REFERENCE');
  await archive('stockItems',stockBarcodeCollision.id,1);
  assert.equal((await restore('stockItems',stockRestore.id,2)).kind,'CONFIRMED');

  const locationRestore=await saveLocation({code:'CAT-RESTORE-LOCATION'});assert.equal((await archive('stockLocations',locationRestore.id,1)).kind,'CONFIRMED');
  const locationCollision=await saveLocation({code:'CAT-RESTORE-LOCATION'});
  const restoreLocationConflict=await restore('stockLocations',locationRestore.id,2);assert.equal(restoreLocationConflict.kind,'CONFLICT');assert.equal(restoreLocationConflict.error.code,'DUPLICATE_REFERENCE');
  await archive('stockLocations',locationCollision.id,1);assert.equal((await restore('stockLocations',locationRestore.id,2)).kind,'CONFIRMED');

  const stockOpenPo=await saveStock({code:'CAT-OPEN-PO'}),supplierId=randomUUID(),poId=randomUUID();
  await pool.query(`INSERT INTO procurement_suppliers(business_id,id,code,name,version,created_by,created_at,updated_by,updated_at) VALUES($1,$2,'SUP-CAT','Catalog Supplier',1,$3,now(),$3,now())`,[businessId,supplierId,staffId]);
  const insertPo=async({id=randomUUID(),stockId,status='ISSUED',documentNumber=`PO-${randomUUID()}`}={})=>{
    const lineId=randomUUID();
    await pool.query(`INSERT INTO procurement_purchase_orders(business_id,id,supplier_id,document_number,supplier_snapshot,status,subtotal_minor,version,created_by,created_at,updated_by,updated_at)
      VALUES($1,$2,$3,$4,'{"name":"Catalog Supplier"}','DRAFT',100,1,$5,now(),$5,now())`,[businessId,id,supplierId,documentNumber,staffId]);
    await pool.query(`INSERT INTO procurement_purchase_order_lines(business_id,po_id,id,line_no,stock_item_id,stock_snapshot,quantity_ordered,base_quantity_ordered,unit_price_minor,line_total_minor)
      VALUES($1,$2,$3,1,$4,'{"name":"Catalog stock"}',1,1,100,100)`,[businessId,id,lineId,stockId]);
    if(status!=='DRAFT')await pool.query('UPDATE procurement_purchase_orders SET status=$3 WHERE business_id=$1 AND id=$2',[businessId,id,status]);
    return{id,lineId};
  };
  await insertPo({id:poId,stockId:stockOpenPo.id});
  const poBlocked=await archive('stockItems',stockOpenPo.id,1);assert.equal(poBlocked.kind,'CONFLICT');assert.equal(poBlocked.error.code,'OPEN_PURCHASE_ORDER_DEPENDENCY');
  await pool.query(`UPDATE procurement_purchase_orders SET status='CANCELLED' WHERE business_id=$1 AND id=$2`,[businessId,poId]);
  assert.equal((await archive('stockItems',stockOpenPo.id,1)).kind,'CONFIRMED');

  const returnStock=await saveStock({code:'CAT-OPEN-RETURN'}),returnLocation=await saveLocation(),returnPo=await insertPo({stockId:returnStock.id,status:'RECEIVED'});
  const documentId=randomUUID(),receiptId=randomUUID(),grnId=randomUUID(),grnLineId=randomUUID(),returnId=randomUUID(),returnLineId=randomUUID(),sourceCommandId=randomUUID(),receiptCommandId=randomUUID(),grnCommandId=randomUUID();
  const now=new Date(),sourceKey=createHash('sha256').update(randomUUID()).digest('hex');
  await pool.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at)
    VALUES($1,$2,'GOODS_RECEIPT','GRN-CAT-DOC',1,'{}',$3,$4,$5,$6)`,[businessId,documentId,'0'.repeat(64),grnCommandId,staffId,now]);
  await pool.query(`INSERT INTO inventory_receipts(business_id,id,stock_item_id,location_id,source_key,source_document,quantity_received,base_quantity,total_cost_minor,unit_cost_minor,before_average_cost_minor,after_average_cost_minor,source_command_id,received_by,received_at)
    VALUES($1,$2,$3,$4,$5,'{"type":"INVOICE","reference":"CAT-RETURN"}',1,1,100,100,100,100,$6,$7,$8)`,[businessId,receiptId,returnStock.id,returnLocation.id,sourceKey,receiptCommandId,staffId,now]);
  await pool.query(`INSERT INTO procurement_goods_receipts(business_id,id,po_id,supplier_id,document_id,document_number,delivery_reference,location_id,accepted_total_minor,reason,source_command_id,received_by,device_id,received_at)
    VALUES($1,$2,$3,$4,$5,'GRN-CAT','DELIVERY-CAT',$6,100,'Reviewed catalog return fixture',$7,$8,$9,$10)`,[businessId,grnId,returnPo.id,supplierId,documentId,returnLocation.id,grnCommandId,staffId,deviceId,now]);
  await pool.query(`INSERT INTO procurement_goods_receipt_lines(business_id,grn_id,id,po_id,po_line_id,delivered_quantity,accepted_quantity,rejected_quantity,accepted_base_quantity,accepted_total_minor,inventory_receipt_id)
    VALUES($1,$2,$3,$4,$5,1,1,0,1,100,$6)`,[businessId,grnId,grnLineId,returnPo.id,returnPo.lineId,receiptId]);
  await pool.query(`INSERT INTO procurement_supplier_returns(business_id,id,return_number,supplier_id,grn_id,status,reason,version,source_command_id,created_by,created_at,updated_at)
    VALUES($1,$2,'SR-CAT',$3,$4,'DRAFT','Reviewed return fixture',1,$5,$6,$7,$7)`,[businessId,returnId,supplierId,grnId,sourceCommandId,staffId,now]);
  await pool.query(`INSERT INTO procurement_supplier_return_lines(business_id,return_id,id,grn_id,grn_line_id,inventory_receipt_id,stock_item_id,location_id,stock_snapshot,quantity,base_quantity,condition,reason,unit_cost_minor)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{"name":"Return stock"}',1,1,'SEALED','Reviewed return line',100)`,[businessId,returnId,returnLineId,grnId,grnLineId,receiptId,returnStock.id,returnLocation.id]);
  const returnBlocked=await archive('stockItems',returnStock.id,1);assert.equal(returnBlocked.kind,'CONFLICT');assert.equal(returnBlocked.error.code,'OPEN_SUPPLIER_RETURN_DEPENDENCY');

  const locationWithDefault=await saveLocation({code:'CAT-DEFAULT-LOCATION'}),defaultOutlet=randomUUID();
  await pool.query('INSERT INTO business_outlets(business_id,id,name,default_stock_location_id,version) VALUES($1,$2,$3,$4,1)',[businessId,defaultOutlet,'Default location outlet',locationWithDefault.id]);
  const outletBlocked=await archive('stockLocations',locationWithDefault.id,1);assert.equal(outletBlocked.kind,'CONFLICT');assert.equal(outletBlocked.error.code,'ACTIVE_OUTLET_DEPENDENCY');
  await pool.query('UPDATE business_outlets SET default_stock_location_id=NULL WHERE business_id=$1 AND id=$2',[businessId,defaultOutlet]);
  assert.equal((await archive('stockLocations',locationWithDefault.id,1)).kind,'CONFIRMED');

  const concurrent=await saveProduct({code:'CAT-CONCURRENT'});assert.equal(concurrent.result.kind,'CONFIRMED');
  const archiveCommand={commandId:randomUUID(),name:'product.archive',payload:{id:concurrent.id,reason:'Reviewed concurrent archive'},expectedVersions:{[`products:${concurrent.id}`]:1}};
  const editCommand={commandId:randomUUID(),name:'product.save',payload:{id:concurrent.id,data:{name:'Concurrent edit',code:'CAT-CONCURRENT',priceMinor:1250,category:'GENERAL',routeTo:'BAR'}},expectedVersions:{[`products:${concurrent.id}`]:1}};
  const raced=await Promise.all([executeCommand({db:store,actor,registry:catalogCommandRegistry,command:archiveCommand}),executeCommand({db:store,actor,registry:catalogCommandRegistry,command:editCommand})]);
  assert.equal(raced.filter(outcome=>outcome.kind==='CONFIRMED').length,1,JSON.stringify(raced));
  assert.equal(raced.filter(outcome=>outcome.kind==='CONFLICT').length,1,JSON.stringify(raced));

  const responseLoss=await saveStock({code:'CAT-RESPONSE-LOSS'}),replayCommand={commandId:randomUUID(),name:'stockItem.save',payload:{id:responseLoss.id,data:{name:'Recovered catalog write',code:'CAT-RESPONSE-LOSS',baseUnit:'unit',scanUnitQuantity:1,reorderLevel:0,averageUnitCostMinor:100,purchasePackages:[]}},expectedVersions:{[`stockItems:${responseLoss.id}`]:1}};
  let attempts=0;const recoveryRegistry=new Map(catalogCommandRegistry),definition=catalogCommandRegistry.get('stockItem.save');
  recoveryRegistry.set('stockItem.save',{...definition,handler:async context=>{const value=await definition.handler(context);if(++attempts===1)throw new Error('simulated response loss before commit');return value}});
  await assert.rejects(executeCommand({db:store,actor,registry:recoveryRegistry,command:replayCommand}),/simulated response loss/);
  assert.equal((await store.commandStatus(businessId,replayCommand.commandId)).status,'PROCESSING');
  const recovered=await executeCommand({db:store,actor,registry:recoveryRegistry,command:replayCommand});
  assert.equal(recovered.kind,'CONFIRMED');assert.deepEqual(await executeCommand({db:store,actor,registry:recoveryRegistry,command:replayCommand}),recovered);assert.equal(attempts,2);
});
