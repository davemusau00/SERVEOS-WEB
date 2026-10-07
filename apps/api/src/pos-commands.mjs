import {queueDocumentPrint} from './print-commands.mjs';
import {receiptSettings,productTaxSnapshot,splitInclusiveTax} from './business-tax.mjs';
import {randomUUID} from 'node:crypto';
import {documentHash} from './business-documents.mjs';
import {consumptionSnapshot,consumePhysical} from './pos-inventory.mjs';
import {ApiProblem} from './command-kernel.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const expected=(command,collection,id)=>{
 const version=command.expectedVersions[`${collection}:${id}`];
 if(!Number.isSafeInteger(version)||version<0)fail(`Reviewed ${collection} version is required.`);
 return version;
};
const quantity=value=>{
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1_000_000||Math.abs(value*1_000_000-Math.round(value*1_000_000))>0.0001)fail('Order quantity must be positive with at most six decimals.');
 return value;
};
const total=(count,price)=>{
 const amount=Math.round(count*price);
 if(!Number.isSafeInteger(amount)||amount<0)fail('Order line total exceeds the supported amount.');
 return amount;
};

export async function orderProjections(db,businessId,ids=null){
 const {rows}=await db.query(`SELECT id,outlet_id AS "outletId",stock_location_id AS "stockLocationId",name,business_snapshot AS "businessSnapshot",receipt_document_id AS "receiptDocumentId",service_destination AS "serviceDestination",service_reference AS "serviceReference",state,currency,grand_total_minor AS "grandTotalMinor",amount_paid_minor AS "amountPaidMinor",version,created_by AS "createdBy",device_id AS "deviceId",created_at AS "createdAt",updated_at AS "updatedAt" FROM pos_orders WHERE business_id=$1 AND ($2::uuid[] IS NULL OR id=ANY($2)) ORDER BY updated_at DESC,id LIMIT 1000`,[businessId,ids]);
 if(!rows.length)return [];
 const lines=await db.query(`SELECT order_id AS "orderId",id,product_id AS "productId",product_version AS "productVersion",product_snapshot AS "productSnapshot",portion_snapshot AS "portionSnapshot",modifier_snapshots AS "modifierSnapshots",tax_snapshot AS "taxSnapshot",net_minor AS "netMinor",vat_minor AS "vatMinor",levy_minor AS "levyMinor",quantity,unit_price_minor AS "unitPriceMinor",line_total_minor AS "lineTotalMinor",state FROM pos_order_lines WHERE business_id=$1 AND order_id=ANY($2::uuid[]) ORDER BY created_at,id`,[businessId,rows.map(row=>row.id)]);
 const grouped=new Map();
 for(const line of lines.rows){const list=grouped.get(line.orderId)||[];list.push(line);grouped.set(line.orderId,list)}
 return rows.map(row=>{
 const items=(grouped.get(row.id)||[]).map(line=>({...line,productVersion:Number(line.productVersion),netMinor:line.netMinor===null?null:Number(line.netMinor),vatMinor:line.vatMinor===null?null:Number(line.vatMinor),levyMinor:line.levyMinor===null?null:Number(line.levyMinor),quantity:Number(line.quantity),unitPriceMinor:Number(line.unitPriceMinor),lineTotalMinor:Number(line.lineTotalMinor),ingredientSnapshot:line.productSnapshot.ingredientSnapshot,portionSnapshot:line.portionSnapshot,name:line.productSnapshot.name,routeTo:line.productSnapshot.routeTo,stockFired:line.state==='FIRED'}));
 return {collection:'orders',id:row.id,version:Number(row.version),archived:false,data:{...row,version:Number(row.version),grandTotalMinor:Number(row.grandTotalMinor),amountPaidMinor:Number(row.amountPaidMinor),createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),items}};
 });
}
export async function orderProjection(db,businessId,id){return (await orderProjections(db,businessId,[id]))[0]??null;}

async function event(tx,command,actor,at,id,version,data){
 await tx.client.query(`INSERT INTO pos_order_events(business_id,id,order_id,order_version,event_type,event_data,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),id,version,command.name,JSON.stringify(data),command.commandId,actor.staffId,actor.deviceId,at]);
}
async function result(tx,businessId,id){const value=await orderProjection(tx.client,businessId,id);return {value,records:[value]};}
async function editable(tx,command,actor,id){
 if(!uuid(id))fail('Choose an order.');
 const baseline=expected(command,'orders',id);
 const {rows}=await tx.client.query('SELECT state,version,outlet_id AS "outletId" FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,id]);
 if(!rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The order is missing.');
 if(Number(rows[0].version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','This order changed. Refresh and review your edit.');
 if(!['OPEN','FIRED'].includes(rows[0].state))throw new ApiProblem(409,'ORDER_NOT_EDITABLE','This order is closed.');
 return rows[0];
}
async function finish(tx,command,actor,at,id,data){
 const {rows}=await tx.client.query(`SELECT COALESCE(sum(line_total_minor),0) AS total FROM pos_order_lines WHERE business_id=$1 AND order_id=$2 AND state<>'VOIDED'`,[actor.businessId,id]);
 const amount=Number(rows[0].total);if(!Number.isSafeInteger(amount)||amount<0)fail('Order total exceeds the supported amount.');
 const version=await tx.bumpEntityVersion(actor.businessId,'orders',id,expected(command,'orders',id));
 await tx.client.query('UPDATE pos_orders SET grand_total_minor=$3,version=$4,updated_at=$5 WHERE business_id=$1 AND id=$2',[actor.businessId,id,amount,version,at]);
 await event(tx,command,actor,at,id,version,data);return result(tx,actor.businessId,id);
}

const create=async({tx,command,actor,at})=>{
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`till-policy:${actor.businessId}`]);
 const p=command.payload,id=p.id;
 if(!uuid(id)||!uuid(p.outletId)||typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>120)fail('Order ID, outlet and a name of up to 120 characters are required.');
 if(expected(command,'orders',id)!==0)fail('A new order must have version zero.');
 // Service references will be enabled with their canonical table/customer/room registries.
 if(p.tableId||p.customerId||p.roomId||p.serviceReference)fail('Referenced service destinations are not yet available through the API.');
 const destination=p.serviceDestination??'COUNTER';if(!['COUNTER','TAKEAWAY'].includes(destination))fail('Choose counter or takeaway for an unassigned order.');
 const {rows}=await tx.client.query(`SELECT o.default_stock_location_id AS "locationId" FROM business_outlets o JOIN stock_locations l ON l.business_id=o.business_id AND l.id=o.default_stock_location_id AND l.archived_at IS NULL WHERE o.business_id=$1 AND o.id=$2 AND o.archived_at IS NULL FOR SHARE OF o,l`,[actor.businessId,p.outletId]);
 if(!rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The outlet needs an active stock location before opening an order.');
 expected(command,'outlets',p.outletId);expected(command,'stockLocations',rows[0].locationId);
 const settings=await receiptSettings(tx.client,actor.businessId);
 if(!settings)throw new ApiProblem(409,'TAX_CONFIGURATION_REQUIRED','Configure business identity and tax rates before trading.');
 if(expected(command,'businessSettings',actor.businessId)!==settings.version)throw new ApiProblem(409,'VERSION_CONFLICT','Business settings changed. Review them before opening the order.');
 const version=await tx.bumpEntityVersion(actor.businessId,'orders',id,0);
 await tx.client.query(`INSERT INTO pos_orders(business_id,id,outlet_id,stock_location_id,name,service_destination,version,created_by,device_id,created_at,updated_at,business_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11::jsonb)`,[actor.businessId,id,p.outletId,rows[0].locationId,p.name.trim(),destination,version,actor.staffId,actor.deviceId,at,JSON.stringify(settings)]);
 await event(tx,command,actor,at,id,version,{outletId:p.outletId,name:p.name.trim(),serviceDestination:destination});return result(tx,actor.businessId,id);
};

const add=async({tx,command,actor,at})=>{
 await tx.lockInventoryCatalog(actor.businessId);
 const p=command.payload,order=await editable(tx,command,actor,p.orderId);
 if(!uuid(p.itemId)||!uuid(p.productId))fail('Product and line IDs are required.');
 const count=quantity(p.quantity);
 const countResult=await tx.client.query('SELECT count(*) AS count FROM pos_order_lines WHERE business_id=$1 AND order_id=$2',[actor.businessId,p.orderId]);
 if(Number(countResult.rows[0].count)>=500)throw new ApiProblem(409,'ORDER_LINE_LIMIT','This order has reached its line limit. Open a separate order.');
 if(p.modifierIds!==undefined&&(!Array.isArray(p.modifierIds)||p.modifierIds.length))fail('Modifier selections require the API modifier catalog.');
 const {rows}=await tx.client.query(`SELECT id,name,code,price_minor AS "priceMinor",category,route_to AS "routeTo",tax_class_id AS "taxClassId",stock_item_id AS "stockItemId",inventory_type AS "inventoryType",recipe_yield AS "recipeYield",portion_volume AS "portionVolume",selling_mode AS "sellingMode",portions,version FROM products WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,p.productId]);
 if(!rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The product is missing or archived.');
 const product=rows[0];if(expected(command,'products',p.productId)!==Number(product.version))throw new ApiProblem(409,'VERSION_CONFLICT','Product pricing changed. Review the current product.');
 const outlets=await tx.client.query('SELECT outlet_id FROM product_outlets WHERE business_id=$1 AND product_id=$2',[actor.businessId,p.productId]);
 if(outlets.rows.length&&!outlets.rows.some(row=>row.outlet_id===order.outletId))throw new ApiProblem(409,'PRODUCT_NOT_AVAILABLE','This product is not available in the order outlet.');
 const portion=p.portionId?product.portions.find(row=>row.id===p.portionId):null;
 if(p.portionId&&!portion)throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected portion is no longer available.');
 const price=Number(portion?.priceMinor??product.priceMinor);if(!Number.isSafeInteger(price)||price<0)throw new ApiProblem(409,'INVALID_PRODUCT_PRICE','Review this product price before selling.');
 const lineTotal=total(count,price);
 const ingredients=await tx.client.query('SELECT stock_item_id AS "stockItemId",quantity,unit FROM product_recipe_ingredients WHERE business_id=$1 AND product_id=$2 ORDER BY stock_item_id',[actor.businessId,p.productId]);
 const recipeIngredients=ingredients.rows.map(row=>({...row,quantity:Number(row.quantity)}));
 const settings=await receiptSettings(tx.client,actor.businessId);
 if(!settings)throw new ApiProblem(409,'TAX_CONFIGURATION_REQUIRED','Configure business tax rates before adding order lines.');
 if(expected(command,'businessSettings',actor.businessId)!==settings.version)throw new ApiProblem(409,'VERSION_CONFLICT','Tax settings changed. Review the current policy.');
 const taxSnapshot=productTaxSnapshot(settings,product.taxClassId),tax=splitInclusiveTax(lineTotal,taxSnapshot);
 const ingredientSnapshot=await consumptionSnapshot(tx.client,actor.businessId,product,portion,recipeIngredients);
 const snapshot={...product,recipeIngredients,ingredientSnapshot,version:Number(product.version),priceMinor:Number(product.priceMinor),portionVolume:product.portionVolume===null?null:Number(product.portionVolume)};
 await tx.client.query(`INSERT INTO pos_order_lines(business_id,order_id,id,product_id,product_version,product_snapshot,portion_snapshot,quantity,unit_price_minor,line_total_minor,created_at,updated_at,tax_snapshot,net_minor,vat_minor,levy_minor) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$11,$12::jsonb,$13,$14,$15)`,[actor.businessId,p.orderId,p.itemId,p.productId,product.version,JSON.stringify(snapshot),portion?JSON.stringify(portion):null,count,price,lineTotal,at,JSON.stringify(taxSnapshot),tax.netMinor,tax.vatMinor,tax.levyMinor]);
 return finish(tx,command,actor,at,p.orderId,{itemId:p.itemId,productId:p.productId,quantity:count,unitPriceMinor:price,portion});
};

const edit=remove=>async({tx,command,actor,at})=>{
 const p=command.payload;await editable(tx,command,actor,p.orderId);if(!uuid(p.itemId))fail('Choose an order line.');
 const {rows}=await tx.client.query('SELECT state,unit_price_minor AS price,tax_snapshot AS "taxSnapshot" FROM pos_order_lines WHERE business_id=$1 AND order_id=$2 AND id=$3 FOR UPDATE',[actor.businessId,p.orderId,p.itemId]);
 if(!rows.length||rows[0].state!=='DRAFT')throw new ApiProblem(409,'LINE_NOT_EDITABLE','Only an unfired draft line can be changed or removed.');
 if(remove)await tx.client.query(`UPDATE pos_order_lines SET state='VOIDED',updated_at=$4 WHERE business_id=$1 AND order_id=$2 AND id=$3`,[actor.businessId,p.orderId,p.itemId,at]);
 else{const count=quantity(p.quantity),lineTotal=total(count,Number(rows[0].price)),tax=splitInclusiveTax(lineTotal,rows[0].taxSnapshot);await tx.client.query('UPDATE pos_order_lines SET quantity=$4,line_total_minor=$5,updated_at=$6,net_minor=$7,vat_minor=$8,levy_minor=$9 WHERE business_id=$1 AND order_id=$2 AND id=$3',[actor.businessId,p.orderId,p.itemId,count,lineTotal,at,tax.netMinor,tax.vatMinor,tax.levyMinor]);}
 return finish(tx,command,actor,at,p.orderId,{itemId:p.itemId,...(remove?{removed:true}:{quantity:p.quantity})});
};

const fire=async({tx,command,actor,at})=>{
 await tx.lockInventoryCatalog(actor.businessId);
 const p=command.payload;await editable(tx,command,actor,p.orderId);
 if(p.courseName||p.itemIds)fail('Partial/course fire requires the API course workflow.');
 const order=await orderProjection(tx.client,actor.businessId,p.orderId);
 const locationId=order.data.stockLocationId;
 expected(command,'stockLocations',locationId);
 if(!await tx.requireStockLocation(actor.businessId,locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','The order stock location is archived.');
 const lines=order.data.items.filter(line=>line.state==='DRAFT');
 if(!lines.length)throw new ApiProblem(409,'NOTHING_TO_FIRE','This order has no unfired lines.');
 const usage=new Map();
 for(const line of lines){
  const snapshot=line.productSnapshot.ingredientSnapshot;
  if(!Array.isArray(snapshot))throw new ApiProblem(409,'STOCK_SNAPSHOT_REQUIRED','This order line needs a reviewed stock consumption snapshot.');
  for(const ingredient of snapshot){
   const amount=ingredient.quantity*line.quantity;
   if(!Number.isFinite(amount)||amount<=0||amount>1_000_000_000||Math.abs(amount*1_000_000-Math.round(amount*1_000_000))>0.0001)fail('Line stock consumption exceeds supported quantity or precision.');
   const group=usage.get(ingredient.stockItemId)||{ingredients:[],whole:0,measured:0};
   group.ingredients.push({lineId:line.id,ingredient,amount});
   if(ingredient.wholeContainerSale)group.whole+=amount;else group.measured+=amount;
   usage.set(ingredient.stockItemId,group);
  }
 }
 const plans=[];
 for(const stockId of [...usage.keys()].sort()){
  const group=usage.get(stockId),stock=await tx.stockItemDetails(actor.businessId,stockId);
  if(expected(command,'stockItems',stockId)!==stock.version)throw new ApiProblem(409,'VERSION_CONFLICT','Stock changed after this fire was reviewed. Refresh the order and stock.');
  for(const {ingredient} of group.ingredients)if(ingredient.baseUnit!==stock.baseUnit||ingredient.containerSize!==stock.sealedContainerSize)throw new ApiProblem(409,'STOCK_CONFIGURATION_CHANGED','Stock units changed after the line was added. Remove and review the draft line.');
  const before=await tx.stockBalance(actor.businessId,stockId,locationId),balanceVersion=p.expectedBalanceVersions?.[`${stockId}:${locationId}`];
  if(!Number.isSafeInteger(balanceVersion)||balanceVersion<0)fail('Reviewed stock balance revisions are required to fire.');
  if(before.version!==balanceVersion)throw new ApiProblem(409,'VERSION_CONFLICT','Stock moved after this fire was reviewed. Refresh before firing.');
  const after=consumePhysical(stock,before,Number(group.whole.toFixed(6)),Number(group.measured.toFixed(6)));
  const costs=group.ingredients.map(entry=>({...entry,costMinor:total(entry.amount,stock.averageUnitCostMinor)}));
  plans.push({stockId,stock,before,after,group,costs});
 }
 const records=[];
 for(const plan of plans){
  const {stockId,stock,before,after,group,costs}=plan;
  await tx.setInventoryBalance({businessId:actor.businessId,stockItemId:stockId,locationId,...after});
  const version=await tx.bumpEntityVersion(actor.businessId,'stockItems',stockId,stock.version);await tx.updateStockItemVersion(actor.businessId,stockId,version);
  const movementId=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id:movementId,stockItemId:stockId,locationId,quantityDelta:-Number((group.whole+group.measured).toFixed(6)),movementType:'SALE_CONSUMPTION',reason:`Order ${p.orderId} fired`,commandId:command.commandId,staffId:actor.staffId,at});
  for(const entry of costs)await tx.client.query(`INSERT INTO pos_stock_consumptions(business_id,order_id,line_id,stock_item_id,location_id,movement_id,quantity,unit_cost_minor,cost_minor,physical_snapshot,command_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,[actor.businessId,p.orderId,entry.lineId,stockId,locationId,movementId,entry.amount,stock.averageUnitCostMinor,entry.costMinor,JSON.stringify({before,after,wholeContainerSale:entry.ingredient.wholeContainerSale}),command.commandId]);
  records.push(await tx.stockRecordProjection(actor.businessId,stockId),await tx.inventoryMovementProjection(actor.businessId,movementId));
 }
 await tx.client.query(`UPDATE pos_order_lines SET state='FIRED',updated_at=$3 WHERE business_id=$1 AND order_id=$2 AND state='DRAFT'`,[actor.businessId,p.orderId,at]);
 await tx.client.query(`UPDATE pos_orders SET state='FIRED' WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId]);
 const documents=[];
 for(const route of ['KITCHEN','BAR']){
  const routed=lines.filter(line=>line.routeTo===route);if(!routed.length)continue;
  const id=randomUUID(),type=route==='KITCHEN'?'KOT':'BOT',documentNumber=`${type}-${command.commandId}`;
  const snapshot={orderId:p.orderId,orderName:order.data.name,outletId:order.data.outletId,serviceDestination:order.data.serviceDestination,serviceReference:order.data.serviceReference,staffId:actor.staffId,deviceId:actor.deviceId,issuedAt:at.toISOString(),items:routed};
  const hash=documentHash(snapshot);
  await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,$3,$4,1,$5::jsonb,$6,$7,$8,$9)`,[actor.businessId,id,type,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
  const printJob=await queueDocumentPrint(tx,{businessId:actor.businessId,documentId:id,printerRole:route,staffId:actor.staffId,at});
  records.push({collection:'businessDocuments',id,version:1,archived:false,data:{id,type,documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},printJob);
  documents.push(id);
 }
 const outcome=await finish(tx,command,actor,at,p.orderId,{firedLineIds:lines.map(line=>line.id),documentIds:documents});
 return {value:{order:outcome.value,documentIds:documents},records:[...outcome.records,...records]};
};

export const posCommandRegistry=new Map([
 ['order.create',create],['order.addItem',add],['order.updateItem',edit(false)],['order.removeItem',edit(true)],
].map(([name,handler])=>[name,{permission:'pos.sell',offlinePolicy:'ONLINE_ONLY',handler}]));
posCommandRegistry.set('order.fire',{permission:'order.fire',offlinePolicy:'ONLINE_ONLY',handler:fire});
