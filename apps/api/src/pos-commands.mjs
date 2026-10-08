import {selectModifiers,modifierPrice} from './product-modifiers.mjs';
import {queueDocumentPrint,cancelUnsentOrderTickets} from './print-commands.mjs';
import {receiptSettings,productTaxSnapshot} from './business-tax.mjs';
import {randomUUID} from 'node:crypto';
import {documentHash} from './business-documents.mjs';
import {consumptionSnapshot,consumePhysical} from './pos-inventory.mjs';
import {ApiProblem} from './command-kernel.mjs';
import {weightedCostRate} from './inventory-costs.mjs';
import {priceLine} from './pos-pricing.mjs';
import {requireManagerApproval} from './manager-approvals.mjs';
import {postPosRoomCharge} from './hospitality-commands.mjs';
import {allocationDelta,remainingPaymentBasis} from './financial-journals.mjs';
import {floorplanProjections,readFloorplanTable} from './floorplan-commands.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const expected=(command,collection,id)=>{
 const version=command.expectedVersions[`${collection}:${id}`];
 if(!Number.isSafeInteger(version)||version<0)fail(`Reviewed ${collection} version is required.`);
 return version;
};
const courseName=value=>{if(value===undefined||value===null)return '';if(typeof value!=='string'||value.trim().length>80||/[\u0000-\u001f\u007f]/u.test(value))fail('Course names must be text of at most 80 characters without control codes.');return value.trim();};
const preparationNote=value=>{
 if(value===undefined)return '';
 if(typeof value!=='string'||value.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail('Preparation notes must be text of at most 500 characters without control codes.');
 return value.trim();
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
 const {rows}=await db.query(`WITH recent_closed AS (SELECT id FROM pos_orders WHERE business_id=$1 AND state IN ('COMPLETED','VOIDED','MERGED') ORDER BY updated_at DESC,id LIMIT 1000), pending_preparation AS (SELECT DISTINCT order_id FROM pos_order_lines WHERE business_id=$1 AND state='FIRED' AND preparation_status IN ('FIRED','PREPARING','READY')) SELECT id,current_round_no AS "currentRoundNo",outlet_id AS "outletId",stock_location_id AS "stockLocationId",name,business_snapshot AS "businessSnapshot",receipt_document_id AS "receiptDocumentId",service_destination AS "serviceDestination",service_reference AS "serviceReference",customer_id AS "customerId",customer_name_snapshot AS "customerName",state,merged_into_order_id AS "mergedIntoOrderId",currency,grand_total_minor AS "grandTotalMinor",amount_paid_minor AS "amountPaidMinor",amount_credited_minor AS "amountCreditedMinor",room_charge_minor AS "roomChargeMinor",refunded_amount_minor AS "refundedAmountMinor",void_reason AS "voidReason",void_disposition AS "voidDisposition",voided_by AS "voidedBy",voided_at AS "voidedAt",version,created_by AS "createdBy",device_id AS "deviceId",created_at AS "createdAt",updated_at AS "updatedAt" FROM pos_orders WHERE business_id=$1 AND (($2::uuid[] IS NOT NULL AND id=ANY($2)) OR ($2::uuid[] IS NULL AND (state IN ('OPEN','FIRED') OR (state NOT IN ('VOIDED','MERGED') AND id IN (SELECT order_id FROM pending_preparation)) OR id IN (SELECT id FROM recent_closed)))) ORDER BY updated_at DESC,id`,[businessId,ids]);
 if(!rows.length)return [];
 const lines=await db.query(`SELECT order_id AS "orderId",id,round_no AS "roundNo",product_id AS "productId",product_version AS "productVersion",product_snapshot AS "productSnapshot",portion_snapshot AS "portionSnapshot",modifier_snapshots AS "modifierSnapshots",notes,preparation_status AS "preparationStatus",preparation_updated_at AS "preparationUpdatedAt",preparation_updated_by AS "preparationUpdatedBy",course_name AS "courseName",fired_at AS "firedAt",tax_snapshot AS "taxSnapshot",net_minor AS "netMinor",vat_minor AS "vatMinor",levy_minor AS "levyMinor",quantity,unit_price_minor AS "unitPriceMinor",line_total_minor AS "lineTotalMinor",gross_minor AS "grossMinor",discount_basis_points AS "discountBasisPoints",discount_minor AS "discountMinor",comped,comp_reason AS "compReason",pricing_reason AS "pricingReason",void_previous_state AS "voidPreviousState",state FROM pos_order_lines WHERE business_id=$1 AND order_id=ANY($2::uuid[]) ORDER BY created_at,id`,[businessId,rows.map(row=>row.id)]);
 const grouped=new Map();
 for(const line of lines.rows){const list=grouped.get(line.orderId)||[];list.push(line);grouped.set(line.orderId,list)}
 return rows.map(row=>{
 const items=(grouped.get(row.id)||[]).map(line=>({...line,productVersion:Number(line.productVersion),firedAt:line.firedAt?.toISOString()??null,preparationUpdatedAt:line.preparationUpdatedAt?.toISOString()??null,netMinor:line.netMinor===null?null:Number(line.netMinor),vatMinor:line.vatMinor===null?null:Number(line.vatMinor),levyMinor:line.levyMinor===null?null:Number(line.levyMinor),quantity:Number(line.quantity),grossMinor:Number(line.grossMinor),discountMinor:Number(line.discountMinor),unitPriceMinor:Number(line.unitPriceMinor),lineTotalMinor:Number(line.lineTotalMinor),ingredientSnapshot:line.productSnapshot.ingredientSnapshot,portionSnapshot:line.portionSnapshot,name:line.productSnapshot.name,routeTo:line.productSnapshot.routeTo,stockFired:line.state==='FIRED'||line.voidPreviousState==='FIRED'}));
 const serviceReference=row.serviceReference&&typeof row.serviceReference==='object'?row.serviceReference:{};
 return {collection:'orders',id:row.id,version:Number(row.version),archived:false,data:{...row,tableId:typeof serviceReference.tableId==='string'?serviceReference.tableId:null,tableName:typeof serviceReference.tableName==='string'?serviceReference.tableName:null,version:Number(row.version),grandTotalMinor:Number(row.grandTotalMinor),amountPaidMinor:Number(row.amountPaidMinor),amountCreditedMinor:Number(row.amountCreditedMinor),roomChargeMinor:Number(row.roomChargeMinor),refundedAmountMinor:Number(row.refundedAmountMinor),voidedAt:row.voidedAt?.toISOString()??null,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),items}};
 });
}
export async function orderProjection(db,businessId,id){return (await orderProjections(db,businessId,[id]))[0]??null;}

async function event(tx,command,actor,at,id,version,data){
 await tx.client.query(`INSERT INTO pos_order_events(business_id,id,order_id,order_version,event_type,event_data,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,[actor.businessId,randomUUID(),id,version,command.name,JSON.stringify(data),command.commandId,actor.staffId,actor.deviceId,at]);
}
async function result(tx,businessId,id){const value=await orderProjection(tx.client,businessId,id);return {value,records:[value]};}
async function editable(tx,command,actor,id,{allowPaid=false}={}){
 if(!uuid(id))fail('Choose an order.');
 const baseline=expected(command,'orders',id);
 const {rows}=await tx.client.query('SELECT state,version,current_round_no AS "currentRoundNo",amount_paid_minor AS "amountPaidMinor",amount_credited_minor AS "amountCreditedMinor",outlet_id AS "outletId" FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,id]);
 if(!rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The order is missing.');
 if(Number(rows[0].version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','This order changed. Refresh and review your edit.');
 if(!allowPaid&&(Number(rows[0].amountPaidMinor)>0||Number(rows[0].amountCreditedMinor)>0))throw new ApiProblem(409,'PAID_ORDER_NOT_EDITABLE','Partly paid or credited orders cannot be edited or repriced. Complete or reverse their money workflow first.');
 if(!['OPEN','FIRED'].includes(rows[0].state))throw new ApiProblem(409,'ORDER_NOT_EDITABLE','This order is closed.');
 return rows[0];
}
async function finish(tx,command,actor,at,id,data){
 const {rows}=await tx.client.query(`SELECT COALESCE(sum(line_total_minor),0) AS total,count(*)::integer AS count,bool_and(state='FIRED') AS "allFired" FROM pos_order_lines WHERE business_id=$1 AND order_id=$2 AND state<>'VOIDED'`,[actor.businessId,id]);
 const amount=Number(rows[0].total);if(!Number.isSafeInteger(amount)||amount<0)fail('Order total exceeds the supported amount.');
 const zeroCompleted=amount===0&&rows[0].count>0&&rows[0].allFired===true;
 const version=await tx.bumpEntityVersion(actor.businessId,'orders',id,expected(command,'orders',id));
 await tx.client.query(`UPDATE pos_orders SET grand_total_minor=$3,version=$4,updated_at=$5,state=CASE WHEN $6 THEN 'COMPLETED' ELSE state END WHERE business_id=$1 AND id=$2`,[actor.businessId,id,amount,version,at,zeroCompleted]);
 const receipt=zeroCompleted?await zeroReceipt(tx,command,actor,at,id):null;
 await event(tx,command,actor,at,id,version,{...data,zeroCompleted,...(receipt?{receiptDocumentId:receipt.id}:{})});
 const output=await result(tx,actor.businessId,id);
 return {...output,records:[...output.records,...(receipt?.records??[])]};
}

async function zeroReceipt(tx,command,actor,at,orderId){
 const order=await orderProjection(tx.client,actor.businessId,orderId),items=order.data.items.filter(line=>line.state!=='VOIDED');
 if(!order.data.businessSnapshot||!items.length||items.some(line=>!line.taxSnapshot||line.lineTotalMinor!==0||line.netMinor!==0||line.vatMinor!==0||line.levyMinor!==0)||order.data.amountPaidMinor!==0||order.data.amountCreditedMinor!==0)throw new ApiProblem(409,'ZERO_RECEIPT_RECONCILIATION_FAILED','Zero-value sale needs original identity/tax evidence and no recorded payments or credit.');
 const tills=await tx.client.query(`SELECT id FROM till_sessions WHERE business_id=$1 AND outlet_id=$2 AND operator_id=$3 AND device_id=$4 AND status='OPEN' FOR SHARE`,[actor.businessId,order.data.outletId,actor.staffId,actor.deviceId]);
 const cashier=await tx.client.query('SELECT display_name FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[actor.businessId,actor.staffId]);
 const discountTotalMinor=items.reduce((sum,line)=>sum+line.discountMinor,0);
 if(!Number.isSafeInteger(discountTotalMinor))fail('Discount totals exceed the supported amount.');
 const id=randomUUID(),documentNumber=`SALE-${command.commandId}`,snapshot={business:order.data.businessSnapshot,cashier:{id:actor.staffId,name:cashier.rows[0]?.display_name??actor.staffId},orderId,orderName:order.data.name,receiptNumber:documentNumber,currency:order.data.currency,tillSessionId:tills.rows[0]?.id??null,tillAttribution:tills.rows.length?'OWNED_OPEN_TILL':'NO_OWNED_OPEN_TILL',items,taxes:{netMinor:0,vatMinor:0,levyMinor:0},discountTotalMinor,totalMinor:0,payments:[],noPaymentRequired:true,staffId:actor.staffId,deviceId:actor.deviceId,issuedAt:at.toISOString(),footer:order.data.businessSnapshot.footer};
 const hash=documentHash(snapshot);
 await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'SALES_RECEIPT',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,id,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
 await tx.client.query('UPDATE pos_orders SET receipt_document_id=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,orderId,id]);
 return {id,records:[{collection:'businessDocuments',id,version:1,archived:false,data:{id,type:'SALES_RECEIPT',documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},await queueDocumentPrint(tx,{businessId:actor.businessId,documentId:id,printerRole:'RECEIPT',staffId:actor.staffId,at})]};
}

const create=async({tx,command,actor,at})=>{
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`till-policy:${actor.businessId}`]);
 const p=command.payload,id=p.id;
 if(!uuid(id)||!uuid(p.outletId)||typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>120)fail('Order ID, outlet and a name of up to 120 characters are required.');
 if(expected(command,'orders',id)!==0)fail('A new order must have version zero.');
 if(p.roomId||p.serviceReference)fail('Room references and caller-supplied service snapshots are not accepted by the POS API.');
 let customer=null;
 if(p.customerId){
  if(!uuid(p.customerId))fail('Choose a valid named customer.');
  if(!actor.permissions.includes('*')&&!actor.permissions.includes('pos.open_tab'))throw new ApiProblem(403,'PERMISSION_DENIED','Opening an order for a named customer requires `pos.open_tab`.');
  const customerVersion=expected(command,'customers',p.customerId);
  const found=await tx.client.query(`SELECT name,version FROM business_customers WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,p.customerId]);
  if(!found.rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected customer is missing or archived. Refresh the customer list.');
  if(Number(found.rows[0].version)!==customerVersion)throw new ApiProblem(409,'VERSION_CONFLICT','The selected customer changed. Refresh and review the order again.');
  customer=found.rows[0];
 }
 const destination=p.tableId?'TABLE':p.serviceDestination??'COUNTER';if(!['COUNTER','TAKEAWAY','TABLE'].includes(destination)||destination==='TABLE'&&!p.tableId||destination!=='TABLE'&&p.tableId)fail('Choose counter, takeaway, or one available table.');
 let serviceReference={},tableId=null;
 if(destination==='TABLE'){
  if(!uuid(p.tableId))fail('Choose a valid service table.');
  const tableVersion=expected(command,'tables',p.tableId);
  const table=await tx.client.query(`SELECT id,outlet_id AS "outletId",label,state,version,archived_at AS "archivedAt",EXISTS(SELECT 1 FROM pos_orders active WHERE active.business_id=t.business_id AND active.service_destination='TABLE' AND active.service_reference->>'tableId'=t.id::text AND active.state IN ('OPEN','FIRED')) AS occupied FROM business_floor_tables t WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.tableId]);
  if(!table.rows.length||table.rows[0].archivedAt)throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected table is no longer active.');
  const row=table.rows[0];if(row.outletId!==p.outletId)throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected table belongs to another outlet.');
  if(Number(row.version)!==tableVersion)throw new ApiProblem(409,'VERSION_CONFLICT','The selected table changed. Refresh and review the order.');
  if(row.state!=='AVAILABLE'||row.occupied)throw new ApiProblem(409,'TABLE_NOT_AVAILABLE','The selected table is cleaning or already has an active order.');
  const nextTableVersion=await tx.bumpEntityVersion(actor.businessId,'tables',p.tableId,tableVersion);
  await tx.client.query('UPDATE business_floor_tables SET version=$3,updated_at=$4 WHERE business_id=$1 AND id=$2',[actor.businessId,p.tableId,nextTableVersion,at]);
  tableId=p.tableId;
  serviceReference={tableId:row.id,tableName:row.label};
 }
 const {rows}=await tx.client.query(`SELECT o.default_stock_location_id AS "locationId" FROM business_outlets o JOIN stock_locations l ON l.business_id=o.business_id AND l.id=o.default_stock_location_id AND l.archived_at IS NULL WHERE o.business_id=$1 AND o.id=$2 AND o.archived_at IS NULL FOR SHARE OF o,l`,[actor.businessId,p.outletId]);
 if(!rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The outlet needs an active stock location before opening an order.');
 expected(command,'outlets',p.outletId);expected(command,'stockLocations',rows[0].locationId);
 const settings=await receiptSettings(tx.client,actor.businessId);
 if(!settings)throw new ApiProblem(409,'TAX_CONFIGURATION_REQUIRED','Configure business identity and tax rates before trading.');
 if(expected(command,'businessSettings',actor.businessId)!==settings.version)throw new ApiProblem(409,'VERSION_CONFLICT','Business settings changed. Review them before opening the order.');
 const version=await tx.bumpEntityVersion(actor.businessId,'orders',id,0);
 await tx.client.query(`INSERT INTO pos_orders(business_id,id,outlet_id,stock_location_id,name,service_destination,service_reference,version,created_by,device_id,created_at,updated_at,business_snapshot,customer_id,customer_name_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$11,$12::jsonb,$13,$14)`,[actor.businessId,id,p.outletId,rows[0].locationId,p.name.trim(),destination,JSON.stringify(serviceReference),version,actor.staffId,actor.deviceId,at,JSON.stringify(settings),p.customerId??null,customer?.name??null]);
 await event(tx,command,actor,at,id,version,{outletId:p.outletId,name:p.name.trim(),serviceDestination:destination,serviceReference,customerId:p.customerId??null});
 const output=await result(tx,actor.businessId,id);return tableId?{...output,records:[...output.records,...(await floorplanProjections(tx.client,actor.businessId)).filter(record=>record.id===tableId)]}:output;
};

const assignCustomer=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('pos.open_tab'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer assignment requires `pos.open_tab`.');
 const p=command.payload;if(!uuid(p.orderId)||!uuid(p.customerId))fail('Choose a valid order and named customer.');
 const version=expected(command,'orders',p.orderId),customerVersion=expected(command,'customers',p.customerId);
 const customer=await tx.client.query(`SELECT name,version FROM business_customers WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,p.customerId]);
 if(!customer.rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected customer is missing or archived. Refresh the customer list.');
 if(Number(customer.rows[0].version)!==customerVersion)throw new ApiProblem(409,'VERSION_CONFLICT','The selected customer changed. Refresh and review the order again.');
 const {rows}=await tx.client.query(`SELECT state,version,amount_paid_minor AS "amountPaidMinor",amount_credited_minor AS "amountCreditedMinor" FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.orderId]);
 if(!rows.length||!['OPEN','FIRED'].includes(rows[0].state))throw new ApiProblem(409,'RESOURCE_CONFLICT','Only an open order can change customer.');
 if(Number(rows[0].version)!==version)throw new ApiProblem(409,'VERSION_CONFLICT','The order changed. Refresh and review it.');
 if(Number(rows[0].amountPaidMinor)>0||Number(rows[0].amountCreditedMinor)>0)throw new ApiProblem(409,'ORDER_ALREADY_SETTLED','Choose a customer before accepting payment or credit.');
 const next=await tx.bumpEntityVersion(actor.businessId,'orders',p.orderId,version);
 await tx.client.query(`UPDATE pos_orders SET customer_id=$3,customer_name_snapshot=$4,version=$5,updated_at=$6 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId,p.customerId,customer.rows[0].name,next,at]);
 await event(tx,command,actor,at,p.orderId,next,{customerId:p.customerId,customerName:customer.rows[0].name});
 return result(tx,actor.businessId,p.orderId);
};

const add=async({tx,command,actor,at},{deferFinish=false}={})=>{
 await tx.lockInventoryCatalog(actor.businessId);
 const p=command.payload,order=await editable(tx,command,actor,p.orderId);
 if(!uuid(p.itemId)||!uuid(p.productId))fail('Product and line IDs are required.');
 const count=quantity(p.quantity),notes=preparationNote(p.note),course=courseName(p.courseName);
 const countResult=await tx.client.query('SELECT count(*) AS count FROM pos_order_lines WHERE business_id=$1 AND order_id=$2',[actor.businessId,p.orderId]);
 if(Number(countResult.rows[0].count)>=500)throw new ApiProblem(409,'ORDER_LINE_LIMIT','This order has reached its line limit. Open a separate order.');
 const {rows}=await tx.client.query(`SELECT id,name,code,price_minor AS "priceMinor",category,route_to AS "routeTo",tax_class_id AS "taxClassId",stock_item_id AS "stockItemId",inventory_type AS "inventoryType",recipe_yield AS "recipeYield",portion_volume AS "portionVolume",selling_mode AS "sellingMode",portions,modifiers,version FROM products WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,[actor.businessId,p.productId]);
 if(!rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The product is missing or archived.');
 const product=rows[0];if(expected(command,'products',p.productId)!==Number(product.version))throw new ApiProblem(409,'VERSION_CONFLICT','Product pricing changed. Review the current product.');
 const outlets=await tx.client.query('SELECT outlet_id FROM product_outlets WHERE business_id=$1 AND product_id=$2',[actor.businessId,p.productId]);
 if(outlets.rows.length&&!outlets.rows.some(row=>row.outlet_id===order.outletId))throw new ApiProblem(409,'PRODUCT_NOT_AVAILABLE','This product is not available in the order outlet.');
 const portion=p.portionId?product.portions.find(row=>row.id===p.portionId):null;
 if(p.portionId&&!portion)throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected portion is no longer available.');
 const modifiers=selectModifiers(product.modifiers,p.modifierIds);
 const basePrice=Number(portion?.priceMinor??product.priceMinor);
 if(!Number.isSafeInteger(basePrice)||basePrice<0)throw new ApiProblem(409,'INVALID_PRODUCT_PRICE','Review this product price before selling.');
 const price=modifierPrice(basePrice,modifiers);if(!Number.isSafeInteger(price)||price<0)throw new ApiProblem(409,'INVALID_PRODUCT_PRICE','Review this product price before selling.');
 const ingredients=await tx.client.query('SELECT stock_item_id AS "stockItemId",quantity,unit FROM product_recipe_ingredients WHERE business_id=$1 AND product_id=$2 ORDER BY stock_item_id',[actor.businessId,p.productId]);
 const recipeIngredients=ingredients.rows.map(row=>({...row,quantity:Number(row.quantity)}));
 const settings=await receiptSettings(tx.client,actor.businessId);
 if(!settings)throw new ApiProblem(409,'TAX_CONFIGURATION_REQUIRED','Configure business tax rates before adding order lines.');
 if(expected(command,'businessSettings',actor.businessId)!==settings.version)throw new ApiProblem(409,'VERSION_CONFLICT','Tax settings changed. Review the current policy.');
 const taxSnapshot=productTaxSnapshot(settings,product.taxClassId),tax=priceLine(count,price,0,false,taxSnapshot),lineTotal=tax.lineTotalMinor;
 const ingredientSnapshot=await consumptionSnapshot(tx.client,actor.businessId,product,portion,recipeIngredients,modifiers);
 const snapshot={...product,recipeIngredients,ingredientSnapshot,version:Number(product.version),priceMinor:Number(product.priceMinor),portionVolume:product.portionVolume===null?null:Number(product.portionVolume)};
 await tx.client.query(`INSERT INTO pos_order_lines(business_id,order_id,id,product_id,product_version,product_snapshot,portion_snapshot,quantity,unit_price_minor,line_total_minor,created_at,updated_at,tax_snapshot,net_minor,vat_minor,levy_minor,gross_minor,notes,modifier_snapshots,course_name,round_no) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$11,$12::jsonb,$13,$14,$15,$10,$16,$17::jsonb,$18,$19)`,[actor.businessId,p.orderId,p.itemId,p.productId,product.version,JSON.stringify(snapshot),portion?JSON.stringify(portion):null,count,price,lineTotal,at,JSON.stringify(taxSnapshot),tax.netMinor,tax.vatMinor,tax.levyMinor,notes,JSON.stringify(modifiers),course,order.currentRoundNo]);
 const evidence={itemId:p.itemId,productId:p.productId,quantity:count,unitPriceMinor:price,baseUnitPriceMinor:basePrice,portion,modifiers,note:notes,courseName:course,roundNo:order.currentRoundNo};
 return deferFinish?evidence:finish(tx,command,actor,at,p.orderId,evidence);
};

const edit=remove=>async({tx,command,actor,at})=>{
 const p=command.payload;await editable(tx,command,actor,p.orderId);if(!uuid(p.itemId))fail('Choose an order line.');
 const {rows}=await tx.client.query('SELECT state,quantity,notes,course_name AS "courseName",unit_price_minor AS price,tax_snapshot AS "taxSnapshot",discount_basis_points AS "discountBasisPoints",comped FROM pos_order_lines WHERE business_id=$1 AND order_id=$2 AND id=$3 FOR UPDATE',[actor.businessId,p.orderId,p.itemId]);
 if(!rows.length||rows[0].state!=='DRAFT')throw new ApiProblem(409,'LINE_NOT_EDITABLE','Only an unfired draft line can be changed or removed.');
 const course=remove||p.courseName===undefined?rows[0].courseName:courseName(p.courseName);
 const notes=remove?rows[0].notes:p.note===undefined?rows[0].notes:preparationNote(p.note);
 if(remove)await tx.client.query(`UPDATE pos_order_lines SET state='VOIDED',updated_at=$4 WHERE business_id=$1 AND order_id=$2 AND id=$3`,[actor.businessId,p.orderId,p.itemId,at]);
 else{const count=quantity(p.quantity),tax=priceLine(count,Number(rows[0].price),rows[0].discountBasisPoints,rows[0].comped,rows[0].taxSnapshot);await tx.client.query('UPDATE pos_order_lines SET quantity=$4,line_total_minor=$5,updated_at=$6,net_minor=$7,vat_minor=$8,levy_minor=$9,gross_minor=$10,discount_minor=$11,notes=$12,course_name=$13 WHERE business_id=$1 AND order_id=$2 AND id=$3',[actor.businessId,p.orderId,p.itemId,count,tax.lineTotalMinor,at,tax.netMinor,tax.vatMinor,tax.levyMinor,tax.grossMinor,tax.discountMinor,notes,course]);}
 return finish(tx,command,actor,at,p.orderId,{itemId:p.itemId,before:{quantity:Number(rows[0].quantity),note:rows[0].notes,courseName:rows[0].courseName},...(remove?{removed:true}:{quantity:p.quantity,note:notes,courseName:course})});
};

const fire=async({tx,command,actor,at})=>{
 await tx.lockInventoryCatalog(actor.businessId);
 const p=command.payload;await editable(tx,command,actor,p.orderId,{allowPaid:true});
 if(p.itemIds!==undefined&&(!Array.isArray(p.itemIds)||p.itemIds.length<1||p.itemIds.length>500||p.itemIds.some(id=>!uuid(id))||new Set(p.itemIds).size!==p.itemIds.length))fail('Select unique draft lines to fire.');
 const selectedCourse=p.courseName===undefined?null:courseName(p.courseName);
 const order=await orderProjection(tx.client,actor.businessId,p.orderId);
 const locationId=order.data.stockLocationId;
 expected(command,'stockLocations',locationId);
 if(!await tx.requireStockLocation(actor.businessId,locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','The order stock location is archived.');
 const lines=order.data.items.filter(line=>line.state==='DRAFT'&&(selectedCourse===null||line.courseName===selectedCourse)&&(!p.itemIds||p.itemIds.includes(line.id)));
 if(p.itemIds&&lines.length!==p.itemIds.length)throw new ApiProblem(409,'FIRE_SELECTION_CHANGED','A selected line is no longer a held draft in the reviewed course. Refresh and review the selection.');
 if(!lines.length)throw new ApiProblem(409,'NOTHING_TO_FIRE','This order has no unfired lines.');
 const usage=new Map();
 for(const line of lines){
  const snapshot=line.productSnapshot.ingredientSnapshot;
  if(!Array.isArray(snapshot))throw new ApiProblem(409,'STOCK_SNAPSHOT_REQUIRED','This order line needs a reviewed stock consumption snapshot.');
  for(const ingredient of snapshot){
   const amount=ingredient.quantity*line.quantity;
   if(!Number.isFinite(amount)||amount<=0||amount>1_000_000_000||Math.abs(amount*1_000_000-Math.round(amount*1_000_000))>0.0001)fail('Line stock consumption exceeds supported quantity or precision.');
   if(ingredient.wholeContainerSale&&(!Number.isFinite(ingredient.containerSize)||ingredient.containerSize<=0||Math.abs(amount/ingredient.containerSize-Math.round(amount/ingredient.containerSize))>0.000001))fail('Each whole-bottle line must consume whole sealed containers.');
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
 await tx.client.query(`UPDATE pos_order_lines SET state='FIRED',preparation_status='FIRED',preparation_updated_at=$3,preparation_updated_by=$5,fired_at=$3,updated_at=$3 WHERE business_id=$1 AND order_id=$2 AND state='DRAFT' AND id=ANY($4::uuid[])`,[actor.businessId,p.orderId,at,lines.map(line=>line.id),actor.staffId]);
 const completesRound=selectedCourse===null&&lines.some(line=>line.roundNo===order.data.currentRoundNo)&&!order.data.items.some(line=>line.state==='DRAFT'&&line.roundNo===order.data.currentRoundNo&&!lines.some(selected=>selected.id===line.id));
 if(completesRound&&order.data.currentRoundNo>=1000000)fail('This order has reached its round limit. Open another order.');
 await tx.client.query(`UPDATE pos_orders SET state='FIRED',current_round_no=current_round_no+CASE WHEN $3 THEN 1 ELSE 0 END WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId,completesRound]);
 const documents=[];
 for(const route of ['KITCHEN','BAR']){
  const routed=lines.filter(line=>line.routeTo===route);if(!routed.length)continue;
  const id=randomUUID(),type=route==='KITCHEN'?'KOT':'BOT',documentNumber=`${type}-${command.commandId}`;
  const snapshot={orderId:p.orderId,orderName:order.data.name,outletId:order.data.outletId,serviceDestination:order.data.serviceDestination,serviceReference:order.data.serviceReference,staffId:actor.staffId,deviceId:actor.deviceId,issuedAt:at.toISOString(),items:routed.map(line=>({...line,state:'FIRED',preparationStatus:'FIRED',stockFired:true,firedAt:at.toISOString()})),courseName:selectedCourse};
  const hash=documentHash(snapshot);
  await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,$3,$4,1,$5::jsonb,$6,$7,$8,$9)`,[actor.businessId,id,type,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
  const printJob=await queueDocumentPrint(tx,{businessId:actor.businessId,documentId:id,printerRole:route,staffId:actor.staffId,at});
  records.push({collection:'businessDocuments',id,version:1,archived:false,data:{id,type,documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},printJob);
  documents.push(id);
 }
 const outcome=await finish(tx,command,actor,at,p.orderId,{firedLineIds:lines.map(line=>line.id),courseName:selectedCourse,roundAdvanced:completesRound,previousRoundNo:order.data.currentRoundNo,heldLineIds:order.data.items.filter(line=>line.state==='DRAFT'&&!lines.some(selected=>selected.id===line.id)).map(line=>line.id),documentIds:documents});
 if(outcome.value.data.receiptDocumentId)documents.push(outcome.value.data.receiptDocumentId);
 return {value:{order:outcome.value,documentIds:documents},records:[...outcome.records,...records]};
};

const transferTable=async({tx,command,actor,at})=>{
 const p=command.payload;if(!uuid(p.orderId)||!uuid(p.targetTableId))fail('Choose a valid table order and destination table.');
 await editable(tx,command,actor,p.orderId);const order=await orderProjection(tx.client,actor.businessId,p.orderId),sourceId=order.data.tableId;
 if(order.data.serviceDestination!=='TABLE'||!uuid(sourceId)||sourceId===p.targetTableId)fail('Choose an order assigned to a different table.');
 if(Number(order.data.amountPaidMinor)||Number(order.data.amountCreditedMinor)||Number(order.data.roomChargeMinor)||Number(order.data.refundedAmountMinor))throw new ApiProblem(409,'SETTLED_ORDER_CANNOT_TRANSFER','Orders with recorded tenders or receivables cannot be transferred.');
 if(order.data.items.some(line=>line.state==='FIRED'&&line.preparationStatus!=='SERVED'))throw new ApiProblem(409,'PREPARATION_IN_PROGRESS','Finish or cancel active kitchen/bar preparation before transferring the table order.');
 const sourceVersion=expected(command,'tables',sourceId),targetVersion=expected(command,'tables',p.targetTableId),ids=[sourceId,p.targetTableId].sort();
 const locked=new Map();for(const id of ids)locked.set(id,await readFloorplanTable(tx.client,actor.businessId,id,true));
 const source=locked.get(sourceId),target=locked.get(p.targetTableId);
 if(!source||source.archivedAt||!target||target.archivedAt)throw new ApiProblem(409,'RESOURCE_CONFLICT','The source or destination table is no longer active.');
 if(Number(source.version)!==sourceVersion||Number(target.version)!==targetVersion)throw new ApiProblem(409,'VERSION_CONFLICT','A table changed. Review the source order and destination again.');
 if(source.currentOrderId!==p.orderId)throw new ApiProblem(409,'TABLE_ORDER_CHANGED','The source table no longer owns this order.');
 if(source.outletId!==target.outletId||source.outletId!==order.data.outletId)throw new ApiProblem(409,'CROSS_OUTLET_TRANSFER','Move the order only to an available table in the same outlet.');
 if(target.state!=='AVAILABLE'||target.currentOrderId)throw new ApiProblem(409,'TABLE_NOT_AVAILABLE','The destination table is occupied or needs cleaning.');
 const tableVersions=new Map();
 for(const id of ids){const row=locked.get(id),baseline=id===sourceId?sourceVersion:targetVersion;tableVersions.set(id,await tx.bumpEntityVersion(actor.businessId,'tables',id,baseline));}
 await tx.client.query(`UPDATE business_floor_tables SET state='CLEANING',version=$3,updated_at=$4 WHERE business_id=$1 AND id=$2`,[actor.businessId,sourceId,tableVersions.get(sourceId),at]);
 await tx.client.query(`UPDATE business_floor_tables SET version=$3,updated_at=$4 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.targetTableId,tableVersions.get(p.targetTableId),at]);
 const nextOrderVersion=await tx.bumpEntityVersion(actor.businessId,'orders',p.orderId,expected(command,'orders',p.orderId)),serviceReference={tableId:target.id,tableName:target.label};
 await tx.client.query(`UPDATE pos_orders SET service_reference=$3::jsonb,version=$4,updated_at=$5 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId,JSON.stringify(serviceReference),nextOrderVersion,at]);
 await event(tx,command,actor,at,p.orderId,nextOrderVersion,{sourceTableId:sourceId,targetTableId:target.id,sourceLabel:source.label,targetLabel:target.label});
 const updated=await orderProjection(tx.client,actor.businessId,p.orderId),tableRecords=(await floorplanProjections(tx.client,actor.businessId)).filter(row=>ids.includes(row.id));
 return {value:updated,records:[updated,...tableRecords]};
};

const mergeTableOrders=async({tx,command,actor,at})=>{
 const p=command.payload;
 if(!uuid(p.orderId)||!uuid(p.targetOrderId)||!uuid(p.targetTableId)||p.orderId===p.targetOrderId)fail('Choose two different table orders and a destination table.');
 const orderIds=[p.orderId,p.targetOrderId].sort();
 const lockedOrders=await tx.client.query(`SELECT id,outlet_id AS "outletId",service_destination AS "serviceDestination",service_reference AS "serviceReference",customer_id AS "customerId",state,version,amount_paid_minor AS "amountPaidMinor",amount_credited_minor AS "amountCreditedMinor",room_charge_minor AS "roomChargeMinor",refunded_amount_minor AS "refundedAmountMinor",grand_total_minor AS "grandTotalMinor" FROM pos_orders WHERE business_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,[actor.businessId,orderIds]);
 if(lockedOrders.rows.length!==2)throw new ApiProblem(409,'RESOURCE_CONFLICT','One of the reviewed orders no longer exists.');
 const orderById=new Map(lockedOrders.rows.map(row=>[row.id,row])),sourceOrder=orderById.get(p.orderId),targetOrder=orderById.get(p.targetOrderId);
 for(const row of [sourceOrder,targetOrder]){
  if(Number(row.version)!==expected(command,'orders',row.id))throw new ApiProblem(409,'VERSION_CONFLICT','An order changed. Refresh both checks before merging.');
  if(!['OPEN','FIRED'].includes(row.state))throw new ApiProblem(409,'ORDER_NOT_MERGEABLE','Both table orders must still be open.');
  if(Number(row.amountPaidMinor)||Number(row.amountCreditedMinor)||Number(row.roomChargeMinor)||Number(row.refundedAmountMinor))throw new ApiProblem(409,'SETTLED_ORDER_CANNOT_MERGE','Reverse every tender and receivable before merging table orders.');
  if(row.serviceDestination!=='TABLE')fail('Only table-service orders can be merged.');
 }
 const sourceTableId=sourceOrder.serviceReference?.tableId,targetTableId=targetOrder.serviceReference?.tableId;
 if(!uuid(sourceTableId)||!uuid(targetTableId)||sourceTableId===targetTableId||targetTableId!==p.targetTableId)throw new ApiProblem(409,'TABLE_ORDER_CHANGED','The reviewed table assignment changed. Refresh both tables.');
 if(sourceOrder.outletId!==targetOrder.outletId)throw new ApiProblem(409,'CROSS_OUTLET_MERGE','Merge table orders only within one outlet.');
 if(sourceOrder.customerId!==targetOrder.customerId)throw new ApiProblem(409,'CUSTOMER_MISMATCH','Merge orders only when both have the same customer assignment.');
 const sourceTableVersion=expected(command,'tables',sourceTableId),targetTableVersion=expected(command,'tables',targetTableId),tableIds=[sourceTableId,targetTableId].sort(),tablesById=new Map();
 for(const id of tableIds)tablesById.set(id,await readFloorplanTable(tx.client,actor.businessId,id,true));
 const sourceTable=tablesById.get(sourceTableId),targetTable=tablesById.get(targetTableId);
 if(!sourceTable||sourceTable.archivedAt||!targetTable||targetTable.archivedAt)throw new ApiProblem(409,'RESOURCE_CONFLICT','A reviewed table is no longer active.');
 if(Number(sourceTable.version)!==sourceTableVersion||Number(targetTable.version)!==targetTableVersion)throw new ApiProblem(409,'VERSION_CONFLICT','A table changed. Review both orders and tables again.');
 if(sourceTable.outletId!==sourceOrder.outletId||targetTable.outletId!==targetOrder.outletId||sourceTable.currentOrderId!==p.orderId||targetTable.currentOrderId!==p.targetOrderId)throw new ApiProblem(409,'TABLE_ORDER_CHANGED','One of the tables no longer owns its reviewed order.');
 const sourceLines=await tx.client.query(`SELECT id,state,line_total_minor AS "lineTotalMinor" FROM pos_order_lines WHERE business_id=$1 AND order_id=$2 ORDER BY created_at,id FOR UPDATE`,[actor.businessId,p.orderId]);
 if(sourceLines.rows.some(line=>line.state==='FIRED'))throw new ApiProblem(409,'FIRED_SOURCE_ORDER_CANNOT_MERGE','The source order has already fired items. Transfer it after preparation finishes, or settle the checks separately.');
 const draftLines=sourceLines.rows.filter(line=>line.state==='DRAFT');
 if(!draftLines.length)fail('The source table has no held items to move.');
 const priorConsumption=await tx.client.query('SELECT 1 FROM pos_stock_consumptions WHERE business_id=$1 AND order_id=$2 LIMIT 1',[actor.businessId,p.orderId]);
 if(priorConsumption.rows.length)throw new ApiProblem(409,'SOURCE_STOCK_HISTORY_CANNOT_MERGE','The source order has stock-consumption history and cannot be merged safely.');
 const lines=await tx.client.query(`UPDATE pos_order_lines SET order_id=$3,updated_at=$4 WHERE business_id=$1 AND order_id=$2 AND id=ANY($5::uuid[]) RETURNING id,line_total_minor AS "lineTotalMinor"`,[actor.businessId,p.orderId,p.targetOrderId,at,draftLines.map(line=>line.id)]);
 if(lines.rows.length!==draftLines.length)throw new ApiProblem(409,'ORDER_LINES_CHANGED','The source lines changed while the merge was being reviewed.');
 const amountResult=await tx.client.query(`SELECT COALESCE(sum(line_total_minor),0)::text AS total FROM pos_order_lines WHERE business_id=$1 AND order_id=$2 AND state<>'VOIDED'`,[actor.businessId,p.targetOrderId]);
 const amount=Number(amountResult.rows[0].total);if(!Number.isSafeInteger(amount)||amount<0)fail('Merged order total exceeds the supported amount.');
 const sourceVersion=await tx.bumpEntityVersion(actor.businessId,'orders',p.orderId,expected(command,'orders',p.orderId));
 const targetVersion=await tx.bumpEntityVersion(actor.businessId,'orders',p.targetOrderId,expected(command,'orders',p.targetOrderId));
 await tx.client.query(`UPDATE pos_orders SET state='MERGED',merged_into_order_id=$3,grand_total_minor=0,version=$4,updated_at=$5 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId,p.targetOrderId,sourceVersion,at]);
 await tx.client.query(`UPDATE pos_orders SET grand_total_minor=$3,version=$4,updated_at=$5 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.targetOrderId,amount,targetVersion,at]);
 const tableVersions=new Map();
 for(const id of tableIds){const baseline=id===sourceTableId?sourceTableVersion:targetTableVersion;tableVersions.set(id,await tx.bumpEntityVersion(actor.businessId,'tables',id,baseline));}
 await tx.client.query(`UPDATE business_floor_tables SET state='CLEANING',version=$3,updated_at=$4 WHERE business_id=$1 AND id=$2`,[actor.businessId,sourceTableId,tableVersions.get(sourceTableId),at]);
 await tx.client.query(`UPDATE business_floor_tables SET version=$3,updated_at=$4 WHERE business_id=$1 AND id=$2`,[actor.businessId,targetTableId,tableVersions.get(targetTableId),at]);
 await event(tx,command,actor,at,p.targetOrderId,targetVersion,{sourceOrderId:p.orderId,sourceOrderVersion:sourceVersion,sourceTableId,targetTableId,sourceTableLabel:sourceTable.label,targetTableLabel:targetTable.label,movedLineIds:lines.rows.map(row=>row.id),movedLineTotalMinor:lines.rows.reduce((sum,row)=>sum+Number(row.lineTotalMinor),0)});
 const updated=await orderProjection(tx.client,actor.businessId,p.targetOrderId),merged=await orderProjection(tx.client,actor.businessId,p.orderId),tableRecords=(await floorplanProjections(tx.client,actor.businessId)).filter(row=>tableIds.includes(row.id));
 return {value:{order:updated,mergedOrder:merged},records:[updated,merged,...tableRecords]};
};

const roomCharge=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('pos.sell'))throw new ApiProblem(403,'PERMISSION_DENIED','POS selling permission is required to charge a guest room.');
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('folio.room_charge'))throw new ApiProblem(403,'PERMISSION_DENIED','Guest room-charge permission is required.');
 const p=command.payload;
 if(!uuid(p.orderId)||!uuid(p.folioId)||!Number.isSafeInteger(p.folioVersion)||p.folioVersion<1)fail('Choose an order and reviewed open guest folio.');
 const orderVersion=expected(command,'orders',p.orderId);
 const locked=await tx.client.query(`SELECT state,version,grand_total_minor AS "grandTotalMinor",amount_paid_minor AS "amountPaidMinor",amount_credited_minor AS "amountCreditedMinor",room_charge_minor AS "roomChargeMinor" FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.orderId]);
 if(!locked.rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The POS order is missing.');
 if(Number(locked.rows[0].version)!==orderVersion)throw new ApiProblem(409,'VERSION_CONFLICT','The order changed. Refresh and review before charging a room.');
 if(locked.rows[0].state!=='FIRED')throw new ApiProblem(409,'ORDER_NOT_READY_FOR_ROOM_CHARGE','Fire all order lines before charging a guest room.');
 const order=await orderProjection(tx.client,actor.businessId,p.orderId),items=order.data.items.filter(line=>line.state!=='VOIDED');
 if(!items.length||items.some(line=>line.state!=='FIRED')||order.data.items.some(line=>line.state==='DRAFT'))throw new ApiProblem(409,'UNFIRED_LINES','Fire or remove every held line before charging a guest room.');
 if(!order.data.businessSnapshot||items.some(line=>!line.taxSnapshot||!Number.isSafeInteger(line.netMinor)||!Number.isSafeInteger(line.vatMinor)||!Number.isSafeInteger(line.levyMinor)))throw new ApiProblem(409,'RECEIPT_SNAPSHOT_REQUIRED','The order needs its original business and tax snapshots before room settlement.');
 const lineTotal=items.reduce((sum,line)=>sum+line.lineTotalMinor,0),taxes=items.reduce((sum,line)=>({netMinor:sum.netMinor+line.netMinor,vatMinor:sum.vatMinor+line.vatMinor,levyMinor:sum.levyMinor+line.levyMinor}),{netMinor:0,vatMinor:0,levyMinor:0});
 if(lineTotal!==order.data.grandTotalMinor||taxes.netMinor+taxes.vatMinor+taxes.levyMinor!==order.data.grandTotalMinor||Object.values(taxes).some(value=>!Number.isSafeInteger(value)||value<0))throw new ApiProblem(409,'TAX_RECONCILIATION_FAILED','Order lines and tax allocations do not reconcile to the sale total.');
 const amountMinor=order.data.grandTotalMinor-order.data.amountPaidMinor-order.data.amountCreditedMinor-order.data.roomChargeMinor;
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new ApiProblem(409,'ROOM_CHARGE_BALANCE_INVALID','This order has no outstanding room-charge balance.');
 const basis=await remainingPaymentBasis(tx.client,actor.businessId,p.orderId,order.data),alreadyAllocated=order.data.amountCreditedMinor+order.data.roomChargeMinor;
 const allocation=allocationDelta(basis.remaining,alreadyAllocated,amountMinor);
 const posted=await postPosRoomCharge({tx,command,actor,at,order,folioId:p.folioId,amountMinor,allocation});
 const roomCharged=order.data.roomChargeMinor+amountMinor,complete=order.data.amountPaidMinor+order.data.amountCreditedMinor+roomCharged===order.data.grandTotalMinor;
 const version=await tx.bumpEntityVersion(actor.businessId,'orders',p.orderId,orderVersion);
 await tx.client.query(`UPDATE pos_orders SET room_charge_minor=$3,state=$4,version=$5,updated_at=$6 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId,roomCharged,complete?'COMPLETED':'FIRED',version,at]);
 const paymentsResult=await tx.client.query(`SELECT id,method AS "tenderType",amount_minor AS "amountMinor",external_reference AS reference,cash_tendered_minor AS "cashTenderedMinor",change_minor AS "changeMinor" FROM order_payments WHERE business_id=$1 AND order_id=$2 ORDER BY recorded_at,id`,[actor.businessId,p.orderId]);
 const payments=paymentsResult.rows.map(row=>({...row,amountMinor:Number(row.amountMinor),cashTenderedMinor:row.cashTenderedMinor===null?null:Number(row.cashTenderedMinor),changeMinor:row.changeMinor===null?null:Number(row.changeMinor)}));
 if(order.data.amountCreditedMinor>0)payments.push({id:`account-${p.orderId}`,tenderType:'CUSTOMER_ACCOUNT',amountMinor:order.data.amountCreditedMinor,reference:order.data.customerName??null});
 payments.push({id:posted.charge.id,tenderType:'ROOM_CHARGE',amountMinor,reference:p.folioId});
 const discountTotalMinor=items.reduce((sum,line)=>sum+line.discountMinor,0),receiptId=randomUUID(),documentNumber=`SALE-${command.commandId}`;
 if(!Number.isSafeInteger(discountTotalMinor))throw new ApiProblem(409,'PRICE_RECONCILIATION_FAILED','Order discount totals exceed supported amounts.');
 const cashier=await tx.client.query('SELECT display_name AS name FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[actor.businessId,actor.staffId]);
 const receiptSnapshot={discountTotalMinor,cashier:{id:actor.staffId,name:cashier.rows[0]?.name??actor.staffId},business:order.data.businessSnapshot,orderId:p.orderId,orderName:order.data.name,receiptNumber:documentNumber,currency:order.data.currency,items,taxes,totalMinor:order.data.grandTotalMinor,paidMinor:order.data.amountPaidMinor,creditedMinor:order.data.amountCreditedMinor,roomChargedMinor:roomCharged,balanceMinor:0,payments,staffId:actor.staffId,deviceId:actor.deviceId,issuedAt:at.toISOString(),footer:order.data.businessSnapshot.footer};
 const receiptHash=documentHash(receiptSnapshot);
 await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,'SALES_RECEIPT',$3,1,$4::jsonb,$5,$6,$7,$8)`,[actor.businessId,receiptId,documentNumber,JSON.stringify(receiptSnapshot),receiptHash,command.commandId,actor.staffId,at]);
 await tx.client.query('UPDATE pos_orders SET receipt_document_id=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,p.orderId,receiptId]);
 const document={collection:'businessDocuments',id:receiptId,version:1,archived:false,data:{id:receiptId,type:'SALES_RECEIPT',documentNumber,layoutVersion:1,hash:receiptHash,snapshot:receiptSnapshot,issuedAt:at.toISOString()}};
 const printJob=await queueDocumentPrint(tx,{businessId:actor.businessId,documentId:receiptId,printerRole:'RECEIPT',staffId:actor.staffId,at});
 await event(tx,command,actor,at,p.orderId,version,{folioId:p.folioId,folioEntryId:posted.entry.id,roomChargeId:posted.charge.id,amountMinor,allocation,completed:complete,receiptDocumentId:receiptId});
 const updated=await orderProjection(tx.client,actor.businessId,p.orderId);
 return {value:{order:updated,folio:posted.folio,folioEntry:posted.entry,roomCharge:posted.charge,documentId:receiptId},records:[updated,posted.folio,posted.entry,posted.journal,posted.charge,document,printJob]};
};

const voidOrder=async({tx,command,actor,at})=>{
 await tx.lockInventoryCatalog(actor.businessId);
 const p=command.payload;await editable(tx,command,actor,p.orderId,{allowPaid:true});
 const managerApproval=await requireManagerApproval({tx,actor,at,token:p.approvalToken,permission:'order.void',target:p.orderId,command});
 const order=await orderProjection(tx.client,actor.businessId,p.orderId);
 if(order.data.amountPaidMinor!==0||order.data.amountCreditedMinor!==0)throw new ApiProblem(409,'PAID_ORDER_CANNOT_VOID','A paid or credited order cannot be voided. Review its payment or credit reversal workflow.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>500)fail('Explain the void in 3 to 500 characters.');
 const reason=p.reason.trim(),fired=order.data.items.filter(line=>line.state==='FIRED');
 const disposition=fired.length?p.disposition:'NOT_FIRED';
 if(!['NOT_FIRED','RETURN_SEALED','WASTE','CONSUMED','MANAGER_ADJUSTMENT'].includes(disposition)||fired.length&&disposition==='NOT_FIRED')fail('Choose the actual stock disposition for fired items.');
 if(p.operatorConfirmedDisposition!==true)fail('Confirm the actual disposition of the fired items.');
 const plans=[],records=[],locationId=order.data.stockLocationId;
 if(disposition==='RETURN_SEALED'){
  if(p.confirmedUnopenedReturned!==true)fail('Confirm that the original unopened bottles physically returned.');
  if(!await tx.requireStockLocation(actor.businessId,locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','The original stock location is no longer active.');
  expected(command,'stockLocations',locationId);
  const consumed=await tx.client.query(`SELECT line_id AS "lineId",stock_item_id AS "stockItemId",location_id AS "locationId",movement_id AS "movementId",quantity,cost_minor AS "costMinor",physical_snapshot AS "physicalSnapshot" FROM pos_stock_consumptions WHERE business_id=$1 AND order_id=$2 ORDER BY stock_item_id,line_id`,[actor.businessId,p.orderId]);
  if(!consumed.rows.length)throw new ApiProblem(409,'SEALED_RETURN_NOT_APPLICABLE','This order has no recorded whole-bottle stock to return. Choose its actual disposition.');
  const grouped=new Map();
  for(const row of consumed.rows){
   const line=fired.find(item=>item.id===row.lineId),ingredients=line?.productSnapshot.ingredientSnapshot;
   const ingredient=Array.isArray(ingredients)?ingredients.find(item=>item.stockItemId===row.stockItemId):null;
   if(!line||!ingredient||row.locationId!==locationId||row.physicalSnapshot.wholeContainerSale!==true||ingredient.wholeContainerSale!==true)throw new ApiProblem(409,'SEALED_RETURN_NOT_APPLICABLE','Prepared recipe ingredients and opened/measured stock cannot be restored as sealed bottles. Use waste/consumed or an explicit reviewed inventory correction.');
   const group=grouped.get(row.stockItemId)??{rows:[],quantity:0,costMinor:0};
   group.rows.push({...row,ingredient,quantity:Number(row.quantity),costMinor:Number(row.costMinor)});
   group.quantity=Number((group.quantity+Number(row.quantity)).toFixed(6));group.costMinor+=Number(row.costMinor);
   if(!Number.isFinite(group.quantity)||group.quantity<=0||group.quantity>1_000_000_000||!Number.isSafeInteger(group.costMinor))fail('Return quantity or valuation exceeds the supported amount.');
   grouped.set(row.stockItemId,group);
  }
  for(const [stockId,group] of grouped){
   const stock=await tx.stockItemDetails(actor.businessId,stockId),size=stock.sealedContainerSize;
   if(expected(command,'stockItems',stockId)!==stock.version)throw new ApiProblem(409,'VERSION_CONFLICT','Stock configuration changed after return review.');
   if(stock.baseUnit!=='ml'||!Number.isFinite(size)||size<=0||group.rows.some(row=>row.ingredient.baseUnit!==stock.baseUnit||row.ingredient.containerSize!==size||Math.abs(row.quantity/size-Math.round(row.quantity/size))>0.000001))throw new ApiProblem(409,'STOCK_CONFIGURATION_CHANGED','The original bottle configuration or whole-container quantities require review. Use a reviewed inventory correction.');
   const before=await tx.stockBalance(actor.businessId,stockId,locationId),reviewed=p.expectedBalanceVersions?.[`${stockId}:${locationId}`];
   if(!Number.isSafeInteger(reviewed)||reviewed<0)fail('Reviewed stock balance revisions are required for a sealed return.');
   if(before.version!==reviewed)throw new ApiProblem(409,'VERSION_CONFLICT','Stock moved after return review. Refresh before returning bottles.');
   const containers=group.quantity/size;
   if(Math.abs(containers-Math.round(containers))>0.000001||!Number.isSafeInteger(before.sealedContainers)||before.sealedContainers<0||!Number.isFinite(before.openQuantity)||before.openQuantity===null||before.openQuantity<0||before.openQuantity>=size||!Number.isFinite(before.quantity)||before.quantity<0||Math.abs(before.sealedContainers*size+before.openQuantity-before.quantity)>0.000001)throw new ApiProblem(409,'PHYSICAL_STATE_REQUIRED','Original whole bottles and the current physical balance must reconcile before returning stock.');
   const after={quantity:Number((before.quantity+group.quantity).toFixed(6)),sealedContainers:before.sealedContainers+Math.round(containers),openQuantity:before.openQuantity};
   if(after.quantity>1_000_000_000||!Number.isSafeInteger(after.sealedContainers)||Math.abs(after.sealedContainers*size+after.openQuantity-after.quantity)>0.000001)fail('The returned balance exceeds supported stock amounts.');
   const averageCostMinor=weightedCostRate(await tx.totalStockQuantity(actor.businessId,stockId),stock.averageUnitCostMinor,group.quantity,group.costMinor);
   plans.push({stockId,stock,before,after,group,averageCostMinor});
  }
 }
 for(const plan of plans){
  const {stockId,stock,before,after,group,averageCostMinor}=plan;
  await tx.setInventoryBalance({businessId:actor.businessId,stockItemId:stockId,locationId,...after});
  const version=await tx.bumpEntityVersion(actor.businessId,'stockItems',stockId,stock.version);await tx.updateStockCostAndVersion(actor.businessId,stockId,averageCostMinor,version);
  const movementId=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id:movementId,stockItemId:stockId,locationId,quantityDelta:group.quantity,movementType:'VOID_RETURN',reason,commandId:command.commandId,staffId:actor.staffId,at});
  for(const row of group.rows)await tx.client.query(`INSERT INTO pos_void_stock_returns(business_id,order_id,line_id,stock_item_id,original_movement_id,return_movement_id,quantity,cost_minor,evidence,command_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,[actor.businessId,p.orderId,row.lineId,stockId,row.movementId,movementId,row.quantity,row.costMinor,JSON.stringify({before,after,originalConsumption:row.physicalSnapshot,averageCostBeforeMinor:stock.averageUnitCostMinor,averageCostAfterMinor:averageCostMinor,confirmedUnopenedReturned:true}),command.commandId]);
  records.push(await tx.stockRecordProjection(actor.businessId,stockId),await tx.inventoryMovementProjection(actor.businessId,movementId));
 }
 const version=await tx.bumpEntityVersion(actor.businessId,'orders',p.orderId,expected(command,'orders',p.orderId));
 await tx.client.query(`UPDATE pos_order_lines SET void_previous_state=state,state='VOIDED',updated_at=$3 WHERE business_id=$1 AND order_id=$2 AND state<>'VOIDED'`,[actor.businessId,p.orderId,at]);
 await tx.client.query(`UPDATE pos_orders SET state='VOIDED',void_reason=$3,void_disposition=$4,voided_by=$5,voided_at=$6,version=$7,updated_at=$6 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.orderId,reason,disposition,actor.staffId,at,version]);
 const tickets=await cancelUnsentOrderTickets(tx,{actor,command,at,orderId:p.orderId,reason});records.push(...tickets.records);
 await event(tx,command,actor,at,p.orderId,version,{reason,disposition,managerApproval,stockRestored:plans.length>0,inventoryCorrectionRequired:disposition==='MANAGER_ADJUSTMENT',originalTotalMinor:order.data.grandTotalMinor,unresolvedTicketIds:tickets.unresolvedTicketIds});
 const documentIds=[];
 const notices=[{type:'ORDER_VOID_NOTICE',role:'OFFICE',items:order.data.items.filter(line=>line.state!=='VOIDED')},...['KITCHEN','BAR'].map(route=>({type:route==='KITCHEN'?'KOT_CANCEL':'BOT_CANCEL',role:route,items:fired.filter(line=>line.routeTo===route)})).filter(notice=>notice.items.length)];
 for(const notice of notices){
  const id=randomUUID(),documentNumber=`${notice.type}-${command.commandId}`,snapshot={business:order.data.businessSnapshot,orderId:p.orderId,orderName:order.data.name,serviceDestination:order.data.serviceDestination,reason,disposition,stockRestored:plans.length>0,inventoryCorrectionRequired:disposition==='MANAGER_ADJUSTMENT',originalTotalMinor:order.data.grandTotalMinor,unresolvedTicketIds:tickets.unresolvedTicketIds,items:notice.items,staffId:actor.staffId,issuedAt:at.toISOString()},hash=documentHash(snapshot);
  await tx.client.query(`INSERT INTO business_documents(business_id,id,document_type,document_number,layout_version,snapshot,snapshot_hash,source_command_id,issued_by,issued_at) VALUES($1,$2,$3,$4,1,$5::jsonb,$6,$7,$8,$9)`,[actor.businessId,id,notice.type,documentNumber,JSON.stringify(snapshot),hash,command.commandId,actor.staffId,at]);
  records.push({collection:'businessDocuments',id,version:1,archived:false,data:{id,type:notice.type,documentNumber,layoutVersion:1,hash,snapshot,issuedAt:at.toISOString()}},await queueDocumentPrint(tx,{businessId:actor.businessId,documentId:id,printerRole:notice.role,staffId:actor.staffId,at}));documentIds.push(id);
 }
 const value=await orderProjection(tx.client,actor.businessId,p.orderId);
 return {value:{order:value,documentIds},records:[value,...records]};
};

const reprice=kind=>async({tx,command,actor,at})=>{
 const p=command.payload;await editable(tx,command,actor,p.orderId);
 const permission=kind==='discount'?'order.discount':'order.comp';
 const approval=await requireManagerApproval({tx,actor,at,token:p.approvalToken,permission,target:p.orderId,command});
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>500)fail('Explain the price adjustment in 3 to 500 characters.');
 if(kind==='discount'&&(!Number.isInteger(p.percentBasisPoints)||p.percentBasisPoints<1||p.percentBasisPoints>10000))fail('Discount must be greater than zero and at most 100 percent with two decimals.');
 if(kind==='compItem'&&!uuid(p.itemId))fail('Choose the exact line to comp.');
 const order=await orderProjection(tx.client,actor.businessId,p.orderId);
 const lines=order.data.items.filter(line=>line.state!=='VOIDED'&&(kind!=='compItem'||line.id===p.itemId)&&(kind!=='discount'||!line.comped)&&(!['comp','compItem'].includes(kind)||!line.comped));
 if(!lines.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','No eligible active lines remain for this adjustment.');
 const evidence=[];
 for(const line of lines){
  const comped=kind!=='discount',bps=comped?line.discountBasisPoints:p.percentBasisPoints;
  const price=priceLine(line.quantity,line.unitPriceMinor,bps,comped,line.taxSnapshot);
  await tx.client.query(`UPDATE pos_order_lines SET gross_minor=$4,discount_minor=$5,line_total_minor=$6,net_minor=$7,vat_minor=$8,levy_minor=$9,discount_basis_points=$10,comped=$11,comp_reason=$12,pricing_reason=$13,updated_at=$14 WHERE business_id=$1 AND order_id=$2 AND id=$3`,[actor.businessId,p.orderId,line.id,price.grossMinor,price.discountMinor,price.lineTotalMinor,price.netMinor,price.vatMinor,price.levyMinor,bps,comped,comped?p.reason.trim():null,p.reason.trim(),at]);
  evidence.push({lineId:line.id,before:{grossMinor:line.grossMinor,discountMinor:line.discountMinor,lineTotalMinor:line.lineTotalMinor,discountBasisPoints:line.discountBasisPoints,comped:line.comped},after:{...price,discountBasisPoints:bps,comped}});
 }
 return finish(tx,command,actor,at,p.orderId,{reason:p.reason.trim(),adjustments:evidence,managerApproval:approval,stockUnchanged:true});
};

const repeatRound=async({tx,command,actor,at})=>{
 await tx.lockInventoryCatalog(actor.businessId);
 const p=command.payload;await editable(tx,command,actor,p.orderId);
 const order=await orderProjection(tx.client,actor.businessId,p.orderId),sourceRound=Math.max(1,order.data.currentRoundNo-1);
 const sources=order.data.items.filter(line=>line.state==='FIRED'&&line.roundNo===sourceRound);
 if(!sources.length)throw new ApiProblem(409,'NO_TRACKED_ROUND','No fired round with recorded identity is available to repeat. Historical untracked lines cannot be guessed into a round.');
 if(order.data.items.length+sources.length>500)throw new ApiProblem(409,'ORDER_LINE_LIMIT','Repeating the round would exceed the order line limit.');
 const copies=[];
 for(const line of sources){
  const payload={orderId:p.orderId,itemId:randomUUID(),productId:line.productId,quantity:line.quantity,portionId:line.portionSnapshot?.id,modifierIds:line.modifierSnapshots.map(modifier=>modifier.id),note:line.notes,courseName:line.courseName};
  const evidence=await add({tx,actor,at,command:{...command,payload}},{deferFinish:true});
  copies.push({sourceLineId:line.id,...evidence});
 }
 return finish(tx,command,actor,at,p.orderId,{sourceRoundNo:sourceRound,targetRoundNo:order.data.currentRoundNo,copies,stockUnchanged:true,discountsCopied:false});
};

const preparation=async({tx,command,actor,at})=>{
 const p=command.payload;
 if(!uuid(p.orderId)||p.itemId!==undefined&&!uuid(p.itemId)||!['PREPARING','READY','SERVED'].includes(p.status)||p.station!==undefined&&!['BAR','KITCHEN','ROOMS'].includes(p.station))fail('Choose an order, line/station and supported preparation status.');
 const baseline=expected(command,'orders',p.orderId);
 const locked=await tx.client.query('SELECT state,version FROM pos_orders WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,p.orderId]);
 if(!locked.rows.length||locked.rows[0].state==='VOIDED')throw new ApiProblem(409,'ORDER_NOT_PREPARABLE','The order is missing or voided.');
 if(Number(locked.rows[0].version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','Preparation changed. Review the latest order.');
 const order=await orderProjection(tx.client,actor.businessId,p.orderId);
 const lines=order.data.items.filter(line=>line.state==='FIRED'&&(!p.itemId||line.id===p.itemId)&&(!p.station||line.routeTo===p.station));
 if(!lines.length)throw new ApiProblem(409,'NO_PREPARATION_LINES','No fired lines match the selected item/station.');
 const previous={PREPARING:'FIRED',READY:'PREPARING',SERVED:'READY'}[p.status];
 if(lines.some(line=>line.preparationStatus!==previous))throw new ApiProblem(409,'PREPARATION_CHANGED','Selected lines must advance FIRED to PREPARING to READY to SERVED. Review their current state.');
 await tx.client.query('UPDATE pos_order_lines SET preparation_status=$4,preparation_updated_at=$5,preparation_updated_by=$6 WHERE business_id=$1 AND order_id=$2 AND id=ANY($3::uuid[])',[actor.businessId,p.orderId,lines.map(line=>line.id),p.status,at,actor.staffId]);
 const version=await tx.bumpEntityVersion(actor.businessId,'orders',p.orderId,baseline);
 await tx.client.query('UPDATE pos_orders SET version=$3,updated_at=$4 WHERE business_id=$1 AND id=$2',[actor.businessId,p.orderId,version,at]);
 await event(tx,command,actor,at,p.orderId,version,{lineIds:lines.map(line=>line.id),station:p.station??null,before:previous,after:p.status,stockUnchanged:true,paymentsUnchanged:true});
 return result(tx,actor.businessId,p.orderId);
};

export const posCommandRegistry=new Map([
 ['order.create',create],['order.addItem',add],['order.updateItem',edit(false)],['order.removeItem',edit(true)],
].map(([name,handler])=>[name,{permission:'pos.sell',offlinePolicy:'ONLINE_ONLY',handler}]));
posCommandRegistry.set('order.fire',{permission:'order.fire',offlinePolicy:'ONLINE_ONLY',handler:fire});
posCommandRegistry.set('order.void',{permission:'order.void',approvalPermission:'order.void',offlinePolicy:'ONLINE_ONLY',handler:voidOrder});

posCommandRegistry.set('order.discount',{permission:'order.discount',approvalPermission:'order.discount',offlinePolicy:'ONLINE_ONLY',handler:reprice('discount')});
posCommandRegistry.set('order.compItem',{permission:'order.comp',approvalPermission:'order.comp',offlinePolicy:'ONLINE_ONLY',handler:reprice('compItem')});
posCommandRegistry.set('order.comp',{permission:'order.comp',approvalPermission:'order.comp',offlinePolicy:'ONLINE_ONLY',handler:reprice('comp')});

posCommandRegistry.set('order.kds',{permission:'kds.update',offlinePolicy:'ONLINE_ONLY',handler:preparation});

posCommandRegistry.set('order.repeatRound',{permission:'pos.sell',offlinePolicy:'ONLINE_ONLY',handler:repeatRound});
posCommandRegistry.set('order.assignCustomer',{permission:'pos.open_tab',offlinePolicy:'ONLINE_ONLY',handler:assignCustomer});
posCommandRegistry.set('pos.roomCharge',{permission:'folio.room_charge',offlinePolicy:'ONLINE_ONLY',handler:roomCharge});
posCommandRegistry.set('order.transfer',{permission:'order.transfer',offlinePolicy:'ONLINE_ONLY',handler:transferTable});
posCommandRegistry.set('order.merge',{permission:'order.merge',offlinePolicy:'ONLINE_ONLY',handler:mergeTableOrders});
