import {reviewedBalance} from './inventory-review.mjs';
import {postInventoryReceipt} from './inventory-receipt-posting.mjs';
import {normalizeModifiers} from './product-modifiers.mjs';
import {ApiProblem} from './command-kernel.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {costRate,weightedCostRate} from './inventory-costs.mjs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = value => typeof value === 'string' && uuidPattern.test(value);
const text = (value, label, max = 160) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new ApiProblem(400, 'VALIDATION_FAILED', `${label} must contain 1 to ${max} characters.`);
  return value.trim();
};
const optionalText = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const safeQuantity = (value, label, {allowZero = false} = {}) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new ApiProblem(400, 'VALIDATION_FAILED', `${label} must be a ${allowZero ? 'non-negative' : 'positive'} finite quantity.`);
  return value;
};
const expectedVersion = (command, type, id) => {
  const value = command.expectedVersions[`${type}:${id}`];
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiProblem(400, 'VALIDATION_FAILED', `Expected version for ${type}:${id} is required.`);
  return value;
};
const duplicateCheck = async (tx, table, businessId, code, barcode, id) => {
  if (await tx.findBusinessCode(table, businessId, code, id)) throw new ApiProblem(409, 'DUPLICATE_REFERENCE', 'That code is already assigned to an active record.');
  if (barcode && await tx.findBusinessBarcode(table, businessId, barcode, id)) throw new ApiProblem(409, 'DUPLICATE_REFERENCE', 'That barcode is already assigned to an active record.');
};

const stockItemSave = async ({tx, command, actor, at}) => {
  await tx.lockInventoryCatalog(actor.businessId);
  const {id, data} = command.payload;
  if (!uuid(id) || !data || typeof data !== 'object' || Array.isArray(data)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Stock item payload is malformed.');
  const expected = expectedVersion(command, 'stockItems', id);
  const existing=await tx.client.query('SELECT archived_at FROM stock_items WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,id]);
  if(existing.rows[0]?.archived_at)throw new ApiProblem(409,'MASTER_ARCHIVED','Restore this stock item before editing it.');
  const name = text(data.name, 'Name');
  const code = text(data.code, 'Code', 80);
  const baseUnit = text(data.baseUnit, 'Base unit', 40);
  const barcode = optionalText(data.barcode);
  const scanUnitQuantity = safeQuantity(data.scanUnitQuantity ?? 1, 'Scan unit quantity');
  const reorderLevel = safeQuantity(data.reorderLevel ?? 0, 'Reorder level', {allowZero: true});
  const averageUnitCostMinor = costRate(data.averageUnitCostMinor ?? 0);
  const aliases = data.barcodeAliases ?? [];
  if (!Array.isArray(aliases) || aliases.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 120)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Barcode aliases must be non-empty strings up to 120 characters.');
  const normalizedAliases = [...new Set(aliases.map(value => value.trim().toLowerCase()))];
  if (barcode && normalizedAliases.includes(barcode.toLowerCase())) throw new ApiProblem(400, 'VALIDATION_FAILED', 'The primary barcode cannot also be an alias.');
  const packages = data.purchasePackages ?? [];
  if (!Array.isArray(packages)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Purchase packages must be a list.');
  const normalizedPackages = packages.map((pack, index) => {
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new ApiProblem(400, 'VALIDATION_FAILED', `Purchase package ${index + 1} is malformed.`);
    return {id: uuid(pack.id) ? pack.id : randomUUID(), name: text(pack.name ?? pack.label ?? `Package ${index + 1}`, 'Package name', 100), baseQuantity: safeQuantity(pack.baseQuantity ?? pack.quantity, 'Package quantity'), unitCostMinor: pack.unitCostMinor ?? (Number.isFinite(pack.unitCost) ? Math.round(pack.unitCost * 100) : 0), barcode: optionalText(pack.barcode)};
  });
  if (normalizedPackages.some(pack => !Number.isSafeInteger(pack.unitCostMinor) || pack.unitCostMinor < 0)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Package cost must be a non-negative integer in minor currency units.');
  const sealedContainerSize = data.sealedContainerSize === undefined ? null : safeQuantity(data.sealedContainerSize, 'Sealed container size');
  await duplicateCheck(tx, 'stock_items', actor.businessId, code, barcode, id);
  const packageBarcodes = normalizedPackages.map(pack => pack.barcode?.toLowerCase()).filter(Boolean);
  if (new Set(packageBarcodes).size !== packageBarcodes.length || barcode && packageBarcodes.includes(barcode.toLowerCase())) throw new ApiProblem(400,'VALIDATION_FAILED','Stock and package barcodes must be unique within the item.');
  for (const packBarcode of packageBarcodes) if (await tx.findStockBarcode(actor.businessId, packBarcode, id)) throw new ApiProblem(409, 'DUPLICATE_REFERENCE', 'A purchase package barcode is already assigned to another stock item.');
  const version = await tx.bumpEntityVersion(actor.businessId, 'stockItems', id, expected);
  await tx.saveStockItem({businessId:actor.businessId,staffId:actor.staffId,id,name,code,baseUnit,barcode,barcodeAliases:normalizedAliases,scanUnitQuantity,reorderLevel,averageUnitCostMinor,sealedContainerSize,purchasePackages:normalizedPackages,version});
  return {collection:'stockItems',id,version,data:{name,code,baseUnit,barcode,barcodeAliases:normalizedAliases,scanUnitQuantity,reorderLevel,averageUnitCostMinor,sealedContainerSize,purchasePackages:normalizedPackages,updatedAt:at.toISOString()}};
};

const stockLocationSave=async({tx,command,actor})=>{
  await tx.lockInventoryCatalog(actor.businessId);
  const {id,data}=command.payload;
  if(!uuid(id)||!data||typeof data!=='object'||Array.isArray(data))throw new ApiProblem(400,'VALIDATION_FAILED','Stock location payload is malformed.');
  const name=text(data.name,'Location name',120);const code=text(data.code||id,'Location code',80).toUpperCase();const type=text(data.type||'STORE','Location type',20).toUpperCase();
  if(!['STORE','FRIDGE','BAR','KITCHEN','OTHER'].includes(type))throw new ApiProblem(400,'VALIDATION_FAILED','Location type is unsupported.');
  const existing=await tx.client.query('SELECT archived_at FROM stock_locations WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,id]);
  if(existing.rows[0]?.archived_at)throw new ApiProblem(409,'MASTER_ARCHIVED','Restore this stock location before editing it.');
  if(await tx.findBusinessCode('stock_locations',actor.businessId,code,id))throw new ApiProblem(409,'DUPLICATE_REFERENCE','That code is already assigned to an active stock location.');
  const version=await tx.bumpEntityVersion(actor.businessId,'stockLocations',id,expectedVersion(command,'stockLocations',id));
  await tx.saveStockLocation({businessId:actor.businessId,id,name,code,type,version});
  return {collection:'stockLocations',id,version,data:{name,code,type},archived:false};
};

const productSave = async ({tx, command, actor, at}) => {
  await tx.lockInventoryCatalog(actor.businessId);
  const {id, data} = command.payload;
  if (!uuid(id) || !data || typeof data !== 'object' || Array.isArray(data)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Product payload is malformed.');
  const expected = expectedVersion(command, 'products', id);
  const existing=await tx.client.query('SELECT archived_at FROM products WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,id]);
  if(existing.rows[0]?.archived_at)throw new ApiProblem(409,'MASTER_ARCHIVED','Restore this product before editing it.');
  const name = text(data.name, 'Name');
  const code = text(data.code, 'Code', 80);
  const priceMinor = data.priceMinor ?? (Number.isFinite(data.price) ? Math.round(data.price * 100) : undefined);
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Price must be a non-negative integer in minor currency units.');
  const category = text(data.category ?? 'GENERAL', 'Category', 80);
  const routeTo = text(data.routeTo ?? 'BAR', 'Service area', 40).toUpperCase();
  if (!['BAR','KITCHEN','ROOMS'].includes(routeTo)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Service area must be BAR, KITCHEN, or ROOMS.');
  const stockItemId = data.stockItemId || null;
  if (stockItemId && !uuid(stockItemId)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Stock item reference must be a UUID.');
  const barcode = optionalText(data.barcode);
  const outletIds = data.outletIds ?? [];
  if (!Array.isArray(outletIds) || outletIds.some(outletId => !uuid(outletId)) || new Set(outletIds).size !== outletIds.length) throw new ApiProblem(400,'VALIDATION_FAILED','Service areas must be unique valid IDs.');
  const favorite = data.favorite ?? false;
  if (typeof favorite !== 'boolean') throw new ApiProblem(400, 'VALIDATION_FAILED', 'Favorite must be a boolean.');
  const taxClassId = typeof data.taxClassId === 'string' ? data.taxClassId.trim() : '';
  const rawIngredients = data.recipeIngredients ?? [];
  if (!Array.isArray(rawIngredients)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Recipe ingredients must be a list.');
  const ingredientById = new Map();
  for (const ingredient of rawIngredients) {
    if (!ingredient || typeof ingredient !== 'object' || !uuid(ingredient.stockItemId)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Each recipe ingredient must reference a stock item.');
    if (ingredientById.has(ingredient.stockItemId)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Recipe ingredients cannot repeat a stock item.');
    ingredientById.set(ingredient.stockItemId, {stockItemId:ingredient.stockItemId,quantity:safeQuantity(ingredient.quantity,'Recipe quantity'),unit:typeof ingredient.unit === 'string' ? ingredient.unit.trim().slice(0,40) : ''});
  }
  const recipeIngredients = [...ingredientById.values()];
  const existingModifiers=data.modifiers===undefined?(await tx.client.query('SELECT modifiers FROM products WHERE business_id=$1 AND id=$2',[actor.businessId,id])).rows[0]?.modifiers??[]:data.modifiers;
  const modifiers=normalizeModifiers(existingModifiers);
  const ids = [...recipeIngredients.map(item => item.stockItemId), ...(stockItemId ? [stockItemId] : []),...modifiers.flatMap(row=>row.ingredientAdjustments.map(item=>item.stockItemId))];
  if (!await tx.requireStockItems(actor.businessId, ids)) throw new ApiProblem(409, 'RESOURCE_CONFLICT', 'A referenced stock item is missing or archived.');
  if(!await tx.requireOutlets(actor.businessId,outletIds))throw new ApiProblem(409,'RESOURCE_CONFLICT','A selected service area is missing or archived.');
  await duplicateCheck(tx, 'products', actor.businessId, code, barcode, id);
  const version = await tx.bumpEntityVersion(actor.businessId, 'products', id, expected);
  const recipeYield = data.recipeYield === undefined ? null : data.recipeYield;
  if (recipeYield !== null && (!Number.isSafeInteger(recipeYield) || recipeYield < 1 || recipeYield > 100000)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Recipe yield must be a whole number from 1 to 100000.');
  const inventoryType = typeof data.inventoryType === 'string' ? data.inventoryType : 'STANDARD';
  if (!['STANDARD','STOCKED','RECIPE','BATCH','WINE','SPIRIT','COUNT','WEIGHT'].includes(inventoryType)) throw new ApiProblem(400,'VALIDATION_FAILED','Product inventory type is unsupported.');
  const portionVolume = data.portionVolume === undefined ? null : safeQuantity(data.portionVolume,'Portion volume');
  const sellingMode = typeof data.sellingMode === 'string' ? data.sellingMode : null;
  if (sellingMode && !['SERVING_AND_BOTTLE','BOTTLE_ONLY'].includes(sellingMode)) throw new ApiProblem(400,'VALIDATION_FAILED','Selling mode is unsupported.');
  const rawPortions = data.portions ?? [];
  if (!Array.isArray(rawPortions) || rawPortions.length>50) throw new ApiProblem(400,'VALIDATION_FAILED','Product portions must be a list of at most 50 options.');
  const portionIds=new Set();
  const portions=rawPortions.map(portion=>{
    if(!portion||typeof portion!=='object'||Array.isArray(portion)||typeof portion.id!=='string'||!portion.id.trim()||portion.id.length>100||portionIds.has(portion.id)||!Number.isSafeInteger(portion.priceMinor)||portion.priceMinor<0||(portion.wholeContainerSale!==undefined&&typeof portion.wholeContainerSale!=='boolean'))throw new ApiProblem(400,'VALIDATION_FAILED','Portion IDs must be unique, prices must be safe minor units, and whole-container flags must be boolean.');
    portionIds.add(portion.id);
    const volume=safeQuantity(portion.volume,'Portion stock quantity');
    if(volume>1_000_000_000||Math.abs(volume*1_000_000-Math.round(volume*1_000_000))>0.0001)throw new ApiProblem(400,'VALIDATION_FAILED','Portion stock quantities support at most six decimals.');
    return {id:portion.id,name:text(portion.name,'Portion name',100),priceMinor:portion.priceMinor,volume,wholeContainerSale:portion.wholeContainerSale===true};
  });
  await tx.saveProduct({businessId:actor.businessId,staffId:actor.staffId,id,name,code,priceMinor,category,routeTo,stockItemId,barcode,favorite,taxClassId,inventoryType,recipeYield,portionVolume,sellingMode,portions,modifiers,outletIds,recipe:recipeIngredients.length > 0,recipeIngredients,version});
  return {collection:'products',id,version,data:{name,code,priceMinor,category,routeTo,stockItemId,barcode,favorite,taxClassId,inventoryType,recipeIngredients,recipeYield,portionVolume,sellingMode,portions,modifiers,outletIds,updatedAt:at.toISOString()}};
};

const masterArchive=({table,entityType,collection,archive,lockDependencies,blockers})=>async({tx,command,actor,at})=>{
  await tx.lockInventoryCatalog(actor.businessId);
  await lockDependencies?.(tx,actor.businessId);
  const {id}=command.payload;
  if(!uuid(id))throw new ApiProblem(400,'VALIDATION_FAILED','Choose a valid catalog record.');
  const reason=text(command.payload.reason,'Review reason',500);
  if(reason.length<3)throw new ApiProblem(400,'VALIDATION_FAILED','Explain why this catalog record is being archived or restored.');
  const found=await tx.client.query(`SELECT id,version,archived_at AS "archivedAt" FROM ${table} WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,id]);
  const row=found.rows[0];
  if(!row)throw new ApiProblem(404,'MASTER_NOT_FOUND','Catalog record was not found.');
  if(archive?row.archivedAt!==null:row.archivedAt===null)throw new ApiProblem(409,archive?'MASTER_ALREADY_ARCHIVED':'MASTER_ALREADY_ACTIVE',archive?'This catalog record is already archived.':'This catalog record is already active.');
  const version=await tx.bumpEntityVersion(actor.businessId,entityType,id,expectedVersion(command,collection,id));
  if(archive){
    const blocker=await blockers?.(tx,actor.businessId,id);
    if(blocker)throw new ApiProblem(409,blocker.code,blocker.message);
  }else if(table==='products'){
    const product=await tx.productRecordProjection(actor.businessId,id);
    const data=product?.data;
    if(!data)throw new ApiProblem(409,'MASTER_NOT_FOUND','Archived product details are unavailable.');
    const stockIds=[data.stockItemId,...(data.recipeIngredients||[]).map(item=>item.stockItemId),...(data.modifiers||[]).flatMap(modifier=>(modifier.ingredientAdjustments||[]).map(item=>item.stockItemId))].filter(Boolean);
    if(!await tx.requireStockItems(actor.businessId,stockIds))throw new ApiProblem(409,'RESOURCE_CONFLICT','Restore or replace every archived stock reference before restoring this product.');
    if(!await tx.requireOutlets(actor.businessId,data.outletIds||[]))throw new ApiProblem(409,'RESOURCE_CONFLICT','Restore or replace every archived service area before restoring this product.');
    await duplicateCheck(tx,'products',actor.businessId,String(data.code),data.barcode,id);
  }else if(table==='stock_items'){
    const stock=await tx.stockRecordProjection(actor.businessId,id);
    const data=stock?.data;
    if(!data)throw new ApiProblem(409,'MASTER_NOT_FOUND','Archived stock item details are unavailable.');
    await duplicateCheck(tx,'stock_items',actor.businessId,String(data.code),data.barcode,id);
    const barcodes=[data.barcode,...(data.barcodeAliases||[]),...(data.purchasePackages||[]).map(pack=>pack.barcode)].filter(Boolean);
    for(const barcode of barcodes)if(await tx.findStockBarcode(actor.businessId,barcode,id))throw new ApiProblem(409,'DUPLICATE_REFERENCE','A stock or package barcode is already assigned to another active item.');
  }else if(table==='stock_locations'){
    const location=await tx.client.query('SELECT code FROM stock_locations WHERE business_id=$1 AND id=$2',[actor.businessId,id]);
    if(location.rows[0]?.code&&await tx.findBusinessCode('stock_locations',actor.businessId,location.rows[0].code,id))throw new ApiProblem(409,'DUPLICATE_REFERENCE','That code is already assigned to an active stock location.');
  }
  if(table==='stock_locations')await tx.client.query('UPDATE stock_locations SET archived_at=$3,version=$4 WHERE business_id=$1 AND id=$2',[actor.businessId,id,archive?at:null,version]);
  else await tx.client.query(`UPDATE ${table} SET archived_at=$3,version=$4,updated_by=$5,updated_at=$6 WHERE business_id=$1 AND id=$2`,[actor.businessId,id,archive?at:null,version,actor.staffId,at]);
  return {collection,id,version,archived:archive,data:{reason,updatedBy:actor.staffId,updatedAt:at.toISOString()}};
};

const archiveProduct=masterArchive({table:'products',entityType:'products',collection:'products',archive:true,blockers:async(tx,businessId,id)=>{
  const open=await tx.client.query(`SELECT 1 FROM pos_order_lines l JOIN pos_orders o ON o.business_id=l.business_id AND o.id=l.order_id WHERE l.business_id=$1 AND l.product_id=$2 AND l.state='DRAFT' AND o.state='OPEN' LIMIT 1`,[businessId,id]);
  return open.rows.length?{code:'OPEN_ORDER_DEPENDENCY',message:'Remove this product from open orders before archiving it.'}:null;
}});
const reactivateProduct=masterArchive({table:'products',entityType:'products',collection:'products',archive:false});
const archiveStockItem=masterArchive({table:'stock_items',entityType:'stockItems',collection:'stockItems',archive:true,lockDependencies:async(tx,businessId)=>{
  await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement:${businessId}`]);
},blockers:async(tx,businessId,id)=>{
  const balance=await tx.client.query(`SELECT 1 FROM inventory_location_balances WHERE business_id=$1 AND stock_item_id=$2 AND (quantity<>0 OR COALESCE(sealed_containers,0)<>0 OR COALESCE(open_quantity,0)<>0) LIMIT 1`,[businessId,id]);
  if(balance.rows.length)return {code:'STOCK_BALANCE_REMAINS',message:'Bring every location balance, including sealed and open bottle quantities, to zero before archiving this stock item.'};
  if((await tx.productConsumptionIds(businessId,id)).length)return {code:'ACTIVE_PRODUCT_DEPENDENCY',message:'Remove this stock item from active product, recipe, and modifier consumption before archiving it.'};
  const po=await tx.client.query(`SELECT 1 FROM procurement_purchase_order_lines l JOIN procurement_purchase_orders p ON p.business_id=l.business_id AND p.id=l.po_id WHERE l.business_id=$1 AND l.stock_item_id=$2 AND p.status IN ('DRAFT','APPROVED','ISSUED','PARTIALLY_RECEIVED') LIMIT 1`,[businessId,id]);
  if(po.rows.length)return {code:'OPEN_PURCHASE_ORDER_DEPENDENCY',message:'Resolve open purchase orders for this stock item before archiving it.'};
  const returns=await tx.client.query(`SELECT 1 FROM procurement_supplier_return_lines l JOIN procurement_supplier_returns r ON r.business_id=l.business_id AND r.id=l.return_id WHERE l.business_id=$1 AND l.stock_item_id=$2 AND r.status IN ('DRAFT','APPROVED') LIMIT 1`,[businessId,id]);
  if(returns.rows.length)return {code:'OPEN_SUPPLIER_RETURN_DEPENDENCY',message:'Resolve draft or approved supplier returns for this stock item before archiving it.'};
  return null;
}});
const reactivateStockItem=masterArchive({table:'stock_items',entityType:'stockItems',collection:'stockItems',archive:false});
const archiveStockLocation=masterArchive({table:'stock_locations',entityType:'stockLocations',collection:'stockLocations',archive:true,lockDependencies:async(tx,businessId)=>{
  await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`till-policy:${businessId}`]);
  await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement:${businessId}`]);
},blockers:async(tx,businessId,id)=>{
  const balance=await tx.client.query(`SELECT 1 FROM inventory_location_balances WHERE business_id=$1 AND location_id=$2 AND (quantity<>0 OR COALESCE(sealed_containers,0)<>0 OR COALESCE(open_quantity,0)<>0) LIMIT 1`,[businessId,id]);
  if(balance.rows.length)return {code:'LOCATION_STOCK_REMAINS',message:'Move or reconcile stock at this location before archiving it.'};
  const outlet=await tx.client.query(`SELECT 1 FROM business_outlets WHERE business_id=$1 AND default_stock_location_id=$2 AND archived_at IS NULL LIMIT 1`,[businessId,id]);
  if(outlet.rows.length)return {code:'ACTIVE_OUTLET_DEPENDENCY',message:'Choose another default stock location for every active outlet before archiving this location.'};
  const order=await tx.client.query(`SELECT 1 FROM pos_orders WHERE business_id=$1 AND stock_location_id=$2 AND state='OPEN' LIMIT 1`,[businessId,id]);
  if(order.rows.length)return {code:'OPEN_ORDER_DEPENDENCY',message:'Close or move open orders that use this stock location before archiving it.'};
  const returns=await tx.client.query(`SELECT 1 FROM procurement_supplier_return_lines l JOIN procurement_supplier_returns r ON r.business_id=l.business_id AND r.id=l.return_id WHERE l.business_id=$1 AND l.location_id=$2 AND r.status IN ('DRAFT','APPROVED') LIMIT 1`,[businessId,id]);
  return returns.rows.length?{code:'OPEN_SUPPLIER_RETURN_DEPENDENCY',message:'Resolve draft or approved supplier returns at this location before archiving it.'}:null;
}});
const reactivateStockLocation=masterArchive({table:'stock_locations',entityType:'stockLocations',collection:'stockLocations',archive:false});

const catalogCreateWithOpeningStock = async ({tx, command, actor, at}) => {
  await tx.lockInventoryCatalog(actor.businessId);
  const {id, stockItem: stock, product, locationId, startingQuantity = 0, openingMovementId} = command.payload;
  const stockId = stock?.id ?? id;
  if (!uuid(id) || !stock || typeof stock !== 'object' || !uuid(stockId) || !uuid(locationId)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Opening stock setup requires valid stock item and location IDs.');
  if (!await tx.requireStockLocation(actor.businessId, locationId)) throw new ApiProblem(409, 'RESOURCE_CONFLICT', 'The selected stock location is missing or archived.');
  const stockExpected = expectedVersion(command, 'stockItems', stockId);
  if (stockExpected !== 0) throw new ApiProblem(400, 'VALIDATION_FAILED', 'A new stock item must include expected version 0.');
  const locationExpected = command.expectedVersions[`stockLocations:${locationId}`];
  const name = text(stock.name, 'Stock name');
  const code = text(stock.code, 'Stock code', 80);
  const barcode = optionalText(stock.barcode);
  const baseUnit = text(stock.baseUnit, 'Base unit', 40);
  const scanUnitQuantity = safeQuantity(stock.scanUnitQuantity ?? 1, 'Scan unit quantity');
  const reorderLevel = safeQuantity(stock.reorderLevel ?? 0, 'Reorder level', {allowZero:true});
  const averageUnitCostMinor = stock.averageUnitCostMinor ?? (Number.isFinite(stock.averageUnitCost) ? Math.round(stock.averageUnitCost * 100) : 0);
  costRate(averageUnitCostMinor);
  const sealedContainerSize = stock.sealedContainerSize === undefined ? null : safeQuantity(stock.sealedContainerSize, 'Sealed container size');
  const packs = stock.purchasePackages ?? [];
  if (!Array.isArray(packs)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Purchase packages must be a list.');
  const purchasePackages = packs.map((pack, index) => ({id:uuid(pack?.id)?pack.id:randomUUID(),name:text(pack?.name ?? pack?.label ?? `Package ${index+1}`,'Package name',100),baseQuantity:safeQuantity(pack?.baseQuantity ?? pack?.quantity,'Package quantity'),unitCostMinor:Number.isSafeInteger(pack?.unitCostMinor)?pack.unitCostMinor:Number.isFinite(pack?.unitCost)?Math.round(pack.unitCost*100):0,barcode:optionalText(pack?.barcode)}));
  if (purchasePackages.some(pack => pack.unitCostMinor < 0)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Package cost must be non-negative.');
  await duplicateCheck(tx, 'stock_items', actor.businessId, code, barcode, stockId);
  const packageBarcodes = purchasePackages.map(pack=>pack.barcode?.toLowerCase()).filter(Boolean);
  if(new Set(packageBarcodes).size!==packageBarcodes.length||barcode&&packageBarcodes.includes(barcode.toLowerCase()))throw new ApiProblem(400,'VALIDATION_FAILED','Stock and package barcodes must be unique within the item.');
  for(const packageBarcode of packageBarcodes)if(await tx.findStockBarcode(actor.businessId,packageBarcode,stockId))throw new ApiProblem(409,'DUPLICATE_REFERENCE','A package barcode is already assigned to another stock item.');
  const stockVersion = await tx.bumpEntityVersion(actor.businessId, 'stockItems', stockId, 0);
  await tx.saveStockItem({businessId:actor.businessId,staffId:actor.staffId,id:stockId,name,code,baseUnit,barcode,barcodeAliases:[],scanUnitQuantity,reorderLevel,averageUnitCostMinor,sealedContainerSize,purchasePackages,version:stockVersion});
  let productResult = null;const openingMovements=[];
  if (product && typeof product === 'object') {
    const productId = product.id ?? `${id}:product`;
    const productData = {...product, stockItemId: product.stockItemId || (product.inventoryType === 'BATCH' ? stockId : null)};
    if (!uuid(productId)) throw new ApiProblem(400,'VALIDATION_FAILED','Product ID must be a UUID.');
    const normalizedProductData = {...productData, priceMinor:productData.priceMinor ?? (Number.isFinite(productData.price)?Math.round(productData.price*100):undefined),portionVolume:productData.portionVolume,sellingMode:productData.sellingMode,portions:productData.portions,inventoryType:productData.inventoryType};
    for(const ingredient of normalizedProductData.recipeIngredients||[])if(ingredient&&uuid(ingredient.stockItemId))expectedVersion(command,'stockItems',ingredient.stockItemId);
    const productCommand = {...command,payload:{id:productId,data:normalizedProductData},expectedVersions:{...command.expectedVersions,[`products:${productId}`]:0}};
    productResult = await productSave({tx,command:productCommand,actor,at});
  }
  if (startingQuantity !== 0) {
    if(!Number.isSafeInteger(locationExpected)||locationExpected<1)throw new ApiProblem(409,'RESOURCE_CONFLICT','The stock location must have a current version before opening stock can be posted.');
    const quantity = safeQuantity(startingQuantity,'Opening quantity');
    const movementId = uuid(openingMovementId) ? openingMovementId : randomUUID();
    const movementVersion = expectedVersion(command,'stockMovements',movementId);
    if (movementVersion !== 0) throw new ApiProblem(400,'VALIDATION_FAILED','Opening movement must include expected version 0.');
    await tx.bumpEntityVersion(actor.businessId,'stockMovements',movementId,0);
    await tx.assertExpectedVersions(actor.businessId,{[`stockLocations:${locationId}`]:locationExpected});
    await tx.createOpeningStockMovement({businessId:actor.businessId,id:movementId,stockItemId:stockId,locationId,quantity,commandId:command.commandId,staffId:actor.staffId,at});
    await tx.upsertInventoryBalance({businessId:actor.businessId,stockItemId:stockId,locationId,quantityDelta:quantity});
    openingMovements.push(await tx.inventoryMovementProjection(actor.businessId,movementId));
  }
  return {collection:'stockItems',id:stockId,version:stockVersion,data:{name,code,baseUnit,barcode,scanUnitQuantity,reorderLevel,averageUnitCostMinor,sealedContainerSize,purchasePackages},product:productResult,openingQuantity:startingQuantity,openingMovements};
};

// Quantity equality cannot detect an A -> B -> A balance change.


const inventoryCount = async ({tx,command,actor,at})=>{
  await tx.lockInventoryCatalog(actor.businessId);
  const p=command.payload;const selected=command.name==='inventory.countSelected';const locationId=p.locationId;
  if(!uuid(locationId)||!await tx.requireStockLocation(actor.businessId,locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected stock location is missing or archived.');
  const rows=p.rows;if(!Array.isArray(rows)||rows.length<1||rows.length>5000)throw new ApiProblem(400,'VALIDATION_FAILED','A count must include between 1 and 5000 stock items.');
  if(Array.isArray(p.unknownScans)&&p.unknownScans.length)throw new ApiProblem(400,'UNKNOWN_BARCODES','Resolve or dismiss unknown barcode scans before confirming the count.');
  const reason=text(p.reason||'Physical stock count','Count note',500);const activeIds=await tx.activeStockItemIds(actor.businessId);const active=new Set(activeIds);const rowIds=rows.map(row=>row?.stockItemId);
  if(rowIds.some(id=>!uuid(id))||new Set(rowIds).size!==rowIds.length||rowIds.some(id=>!active.has(id)))throw new ApiProblem(409,'RESOURCE_CONFLICT','The count includes duplicate, missing, or archived stock items. Refresh and review it.');
  let selectedIds;
  if(selected){if(!Array.isArray(p.selectedStockItemIds)||!p.selectedStockItemIds.length||p.scope==='FULL')throw new ApiProblem(400,'VALIDATION_FAILED','Select stock items explicitly for a quick count.');selectedIds=p.selectedStockItemIds;if(new Set(selectedIds).size!==selectedIds.length||selectedIds.length!==rowIds.length||selectedIds.some(id=>!rowIds.includes(id)))throw new ApiProblem(400,'VALIDATION_FAILED','Quick count rows must exactly match the explicitly selected stock items.');}
  else{if(p.scope==='SELECTED'||rowIds.length!==activeIds.length||activeIds.some(id=>!rowIds.includes(id)))throw new ApiProblem(400,'VALIDATION_FAILED','A full location count must include every active stock item exactly once.');selectedIds=activeIds;}
  const countRows=[],changedStock=[],movementRecords=[];let matches=0,short=0,over=0;
  for(const row of rows.slice().sort((a,b)=>a.stockItemId.localeCompare(b.stockItemId))){
    const expected=Number(row.expectedQuantity),counted=Number(row.countedQuantity);if(!Number.isFinite(expected)||expected<0||!Number.isFinite(counted)||counted<0)throw new ApiProblem(400,'VALIDATION_FAILED','Expected and counted stock quantities must be non-negative numbers.');
    const balance=await reviewedBalance(tx,command,actor,row.stockItemId,locationId);if(Math.abs(balance.quantity-expected)>0.000001)throw new ApiProblem(409,'VERSION_CONFLICT','Stock changed while this count was open. Refresh the affected items and recount.');
    const consumption=await tx.productConsumptionIds(actor.businessId,row.stockItemId);const expectedConsumption=Array.isArray(row.consumptionProductIds)?row.consumptionProductIds.slice().sort():null;if(expectedConsumption&&JSON.stringify(expectedConsumption)!==JSON.stringify(consumption))throw new ApiProblem(409,'VERSION_CONFLICT','Product stock usage changed while this count was open. Recount the affected item.');
    const stock=await tx.stockItemDetails(actor.businessId,row.stockItemId);const delta=Number((counted-expected).toFixed(6));if(row.measurementMethod!==undefined&&!['EXACT','ESTIMATED'].includes(row.measurementMethod))throw new ApiProblem(400,'VALIDATION_FAILED','Count measurement method is invalid.');
    let sealed=null,open=null;const bottleSize=stock.sealedContainerSize;
    if(bottleSize!==null){sealed=Number(row.countedSealedContainers);open=Number(row.countedOpenQuantity);if(stock.baseUnit!=='ml'||!Number.isInteger(sealed)||sealed<0||!Number.isFinite(open)||open<0||open>=bottleSize||Math.abs(counted-sealed*bottleSize-open)>0.000001)throw new ApiProblem(400,'VALIDATION_FAILED','Counted liquid must equal whole sealed containers plus open quantity below one container.');}
    else if((row.countedSealedContainers!==undefined&&row.countedSealedContainers!==null)||(row.countedOpenQuantity!==undefined&&row.countedOpenQuantity!==null))throw new ApiProblem(400,'VALIDATION_FAILED','Bottle quantities require configured ml stock.');
    if(delta===0)matches++;else if(delta<0)short++;else over++;
    if(delta!==0||bottleSize!==null&&(balance.sealedContainers!==sealed||balance.openQuantity!==open)){await tx.setInventoryBalance({businessId:actor.businessId,stockItemId:row.stockItemId,locationId,quantity:counted,sealedContainers:sealed,openQuantity:open});const version=await tx.bumpEntityVersion(actor.businessId,'stockItems',row.stockItemId,stock.version);await tx.updateStockItemVersion(actor.businessId,row.stockItemId,version);if(delta!==0){const movementId=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id:movementId,stockItemId:row.stockItemId,locationId,quantityDelta:delta,reason,commandId:command.commandId,staffId:actor.staffId,at});movementRecords.push(await tx.inventoryMovementProjection(actor.businessId,movementId));}changedStock.push(await tx.stockRecordProjection(actor.businessId,row.stockItemId));}
    countRows.push({stockItemId:row.stockItemId,expectedQuantity:expected,countedQuantity:counted,variance:delta,countedSealedContainers:sealed,countedOpenQuantity:open,measurementMethod:row.measurementMethod||'EXACT',consumptionProductIds:consumption,name:stock.name,baseUnit:stock.baseUnit,identitySnapshotAvailable:true});
  }
  const id=`count-${command.commandId}`;await tx.insertStockCount({businessId:actor.businessId,id,scope:selected?'SELECTED':'FULL',locationId,selectedStockItemIds:selectedIds,rows:countRows,matches,short,over,reason,commandId:command.commandId,staffId:actor.staffId,at});
  return {count:{collection:'stockCounts',id,version:1,data:{scope:selected?'SELECTED':'FULL',locationId,selectedStockItemIds:selectedIds,itemCount:countRows.length,matches,short,over,reason,status:'COMMITTED',sourceCommandId:command.commandId,createdBy:actor.staffId,createdAt:at.toISOString(),rows:countRows},archived:false},stockItems:changedStock,stockMovements:movementRecords};
};

const inventoryMovement=async({tx,command,actor,at})=>{
  const p=command.payload;const isTransfer=command.name==='inventory.transfer';const stockItemId=p.stockItemId;const locationId=p.locationId;
  if(!uuid(stockItemId)||!uuid(locationId))throw new ApiProblem(400,'VALIDATION_FAILED','A stock item and source location are required.');
  const stock=await tx.stockItemDetails(actor.businessId,stockItemId);if(!await tx.requireStockLocation(actor.businessId,locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','The source stock location is missing or archived.');
  const reason=text(p.reason,isTransfer?'Transfer reason':'Waste reason',500);const quantity=safeQuantity(p.quantity,'Movement quantity');if(quantity>1_000_000_000||Math.abs(quantity*1_000_000-Math.round(quantity*1_000_000))>0.0001)throw new ApiProblem(400,'VALIDATION_FAILED','Movement quantity must be at most one billion with no more than six decimal places.');
  const size=stock.baseUnit==='ml'?stock.sealedContainerSize:null;let sealedMove=0;let openMove=quantity;
  if(size!==null){if(!['SEALED','OPEN'].includes(p.disposition))throw new ApiProblem(400,'VALIDATION_FAILED','Choose sealed bottles or open liquid.');if(p.disposition==='SEALED'){sealedMove=quantity/size;if(!Number.isInteger(sealedMove))throw new ApiProblem(400,'VALIDATION_FAILED','Sealed bottle movement must contain whole bottles.');openMove=0;}}
  const source=await reviewedBalance(tx,command,actor,stockItemId,locationId);const sourceState=size===null?null:source.sealedContainers===null?{sealed:Math.floor(source.quantity/size),open:Number((source.quantity-Math.floor(source.quantity/size)*size).toFixed(6))}:{sealed:source.sealedContainers,open:source.openQuantity};
  if(size===null){if(source.quantity+0.000001<quantity)throw new ApiProblem(409,'RESOURCE_CONFLICT','There is not enough stock at the source location.');}
  else if(p.disposition==='SEALED'&&sourceState.sealed*size+0.000001<quantity||p.disposition==='OPEN'&&sourceState.open+0.000001<quantity)throw new ApiProblem(409,'RESOURCE_CONFLICT','There is not enough stock in the selected physical state.');
  let destination=null;let destinationState=null;let destinationId=null;
  if(isTransfer){destinationId=p.toLocationId;if(!uuid(destinationId)||destinationId===locationId||!await tx.requireStockLocation(actor.businessId,destinationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','Choose a different active destination location.');destination=await reviewedBalance(tx,command,actor,stockItemId,destinationId);if(size!==null){destinationState=destination.sealedContainers===null?{sealed:Math.floor(destination.quantity/size),open:Number((destination.quantity-Math.floor(destination.quantity/size)*size).toFixed(6))}:{sealed:destination.sealedContainers,open:destination.openQuantity};if(p.disposition==='OPEN'&&destinationState.open+quantity>=size-0.000001)throw new ApiProblem(409,'RESOURCE_CONFLICT','The destination would contain more than one open bottle.');}}
  if(size===null){await tx.setInventoryBalance({businessId:actor.businessId,stockItemId,locationId,quantity:Number((source.quantity-quantity).toFixed(6))});if(isTransfer)await tx.setInventoryBalance({businessId:actor.businessId,stockItemId,locationId:destinationId,quantity:Number((destination.quantity+quantity).toFixed(6))});}
  else{const nextSource={sealed:sourceState.sealed-sealedMove,open:Number((sourceState.open-openMove).toFixed(6))};if(nextSource.sealed<0||nextSource.open< -0.000001)throw new ApiProblem(409,'RESOURCE_CONFLICT','Movement exceeds the available bottle state.');const sourceQuantity=Number((nextSource.sealed*size+Math.max(0,nextSource.open)).toFixed(6));await tx.setInventoryBalance({businessId:actor.businessId,stockItemId,locationId,quantity:sourceQuantity,sealedContainers:nextSource.sealed,openQuantity:Math.max(0,nextSource.open)});if(isTransfer){const nextDestination={sealed:destinationState.sealed+sealedMove,open:Number((destinationState.open+openMove).toFixed(6))};await tx.setInventoryBalance({businessId:actor.businessId,stockItemId,locationId:destinationId,quantity:Number((nextDestination.sealed*size+nextDestination.open).toFixed(6)),sealedContainers:nextDestination.sealed,openQuantity:nextDestination.open});}}
  const version=await tx.bumpEntityVersion(actor.businessId,'stockItems',stockItemId,stock.version);await tx.updateStockItemVersion(actor.businessId,stockItemId,version);
  const movementType=isTransfer?'TRANSFER':'WASTE';const movementRecords=[];const movementIds=isTransfer?[{locationId,delta:-quantity,type:'TRANSFER_OUT'},{locationId:destinationId,delta:quantity,type:'TRANSFER_IN'}]:[{locationId,delta:-quantity,type:'WASTE'}];
  for(const entry of movementIds){const movementId=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id:movementId,stockItemId,locationId:entry.locationId,quantityDelta:entry.delta,movementType:entry.type,reason,commandId:command.commandId,staffId:actor.staffId,at});movementRecords.push(await tx.inventoryMovementProjection(actor.businessId,movementId));}
  return {stockItem:await tx.stockRecordProjection(actor.businessId,stockItemId),stockMovements:movementRecords,operation:movementType};
};

const inventoryPolicySave=async({tx,command,actor,at})=>{
 await tx.lockInventoryCatalog(actor.businessId);
 const p=command.payload;
 for(const key of ['allowDirectReceipts','requireSupplierReference','requirePurchaseOrder'])if(typeof p[key]!=='boolean')throw new ApiProblem(400,'VALIDATION_FAILED','Receipt policy choices must be explicit.');
 const reason=text(p.reason,'Policy change reason',500);if(reason.length<3)throw new ApiProblem(400,'VALIDATION_FAILED','Explain the receipt policy change.');
 const version=await tx.bumpEntityVersion(actor.businessId,'inventoryPolicy',actor.businessId,expectedVersion(command,'inventoryPolicy',actor.businessId));
 await tx.saveInventoryPolicy({businessId:actor.businessId,...p,version,staffId:actor.staffId,at});
 return {collection:'inventoryPolicy',id:actor.businessId,version,archived:false,data:{allowDirectReceipts:p.allowDirectReceipts,requireSupplierReference:p.requireSupplierReference,requirePurchaseOrder:p.requirePurchaseOrder,updatedBy:actor.staffId,updatedAt:at.toISOString()}};
};

const inventoryReceive=async({tx,command,actor,at})=>{
 await tx.lockInventoryCatalog(actor.businessId);
 const p=command.payload,{stockItemId,locationId}=p;
 if(!uuid(stockItemId)||!uuid(locationId))throw new ApiProblem(400,'VALIDATION_FAILED','Choose a stock item and receiving storage place.');
 const policy=await tx.inventoryPolicy(actor.businessId);
 if(expectedVersion(command,'inventoryPolicy',actor.businessId)!==Number(policy.version))throw new ApiProblem(409,'VERSION_CONFLICT','Receipt policy changed. Review the current policy before receiving.');
 if(!policy.allowDirectReceipts||policy.requirePurchaseOrder)throw new ApiProblem(403,'PURCHASE_ORDER_REQUIRED','Business policy requires receiving through an approved purchase order.');
 if(p.purchaseOrderId||p.supplierId)throw new ApiProblem(400,'LINKED_RECEIPT_REQUIRED','Linked supplier or purchase-order receipts must use the procurement receiving workflow.');
 const source=p.sourceDocument;
 if(!source||typeof source!=='object'||Array.isArray(source)||!['DELIVERY_NOTE','INVOICE','RECEIPT'].includes(source.type))throw new ApiProblem(400,'VALIDATION_FAILED','Choose a source document type.');
 const reference=text(source.reference,'Source document reference',160);
 const supplierReference=optionalText(source.supplierReference);
 if(supplierReference&&supplierReference.length>160)throw new ApiProblem(400,'VALIDATION_FAILED','Supplier reference is too long.');
 if(policy.requireSupplierReference&&!supplierReference)throw new ApiProblem(400,'SUPPLIER_REFERENCE_REQUIRED','Business policy requires a supplier reference.');
 const lineReference=source.lineReference===undefined?stockItemId:text(source.lineReference,'Source line reference',160);
 const sourceDocument={type:source.type,reference,supplierReference,lineReference};
 const sourceKey=createHash('sha256').update(JSON.stringify([supplierReference?.trim().toLowerCase()||'',reference.trim().toLowerCase(),lineReference.trim().toLowerCase()])).digest('hex');
 const stock=await tx.stockItemDetails(actor.businessId,stockItemId);
 if(!stock)throw new ApiProblem(409,'RESOURCE_CONFLICT','The receiving stock item is missing or archived.');
 if(!await tx.requireStockLocation(actor.businessId,locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','The receiving storage place is missing or archived.');
 const before=await reviewedBalance(tx,command,actor,stockItemId,locationId);
 const quantity=safeQuantity(p.quantity,'Received quantity');
 const projection=await tx.stockRecordProjection(actor.businessId,stockItemId);
 let pack=null;if(p.purchasePackageId){pack=projection.data.purchasePackages.find(pack=>pack.id===p.purchasePackageId);if(!pack)throw new ApiProblem(409,'RESOURCE_CONFLICT','The reviewed purchase package is missing.');if(!Number.isSafeInteger(quantity))throw new ApiProblem(400,'VALIDATION_FAILED','Receive whole purchase packages.');}
 const rawQuantity=quantity*(pack?.baseQuantity??1),baseQuantity=Number(rawQuantity.toFixed(6));
 if(!Number.isFinite(rawQuantity)||baseQuantity<=0||baseQuantity>1_000_000_000||Math.abs(rawQuantity-baseQuantity)>0.0000001)throw new ApiProblem(400,'VALIDATION_FAILED','Received stock exceeds supported quantity or precision.');
 const totalCostMinor=p.totalCostMinor;if(!Number.isSafeInteger(totalCostMinor)||totalCostMinor<0)throw new ApiProblem(400,'VALIDATION_FAILED','Receipt total must be an integer amount in minor currency units.');
 return postInventoryReceipt({tx,command,actor,at,stockItemId,locationId,stock,before,quantity,baseQuantity,totalCostMinor,pack,sourceKey,sourceDocument,physical:p});
};

const inventoryReverseMovement=async({tx,command,actor,at})=>{
 const movementId=command.payload.movementId;
 if(!uuid(movementId))throw new ApiProblem(400,'VALIDATION_FAILED','Choose the original inventory movement.');
 const reason=text(command.payload.reason,'Reversal reason',500);
 if(reason.length<3)throw new ApiProblem(400,'VALIDATION_FAILED','Explain the recording mistake before reversing it.');
 const source=await tx.reversalSource(actor.businessId,movementId);
 if(!source)throw new ApiProblem(409,'RESOURCE_CONFLICT','The original movement no longer exists.');
 if(source.reversed)throw new ApiProblem(409,'ALREADY_REVERSED','The original inventory command has already been reversed.');
 const rows=source.movements;
 const waste=rows.length===1&&rows[0].movementType==='WASTE';
 const transfer=rows.length===2&&rows.some(row=>row.movementType==='TRANSFER_OUT')&&rows.some(row=>row.movementType==='TRANSFER_IN')&&rows[0].stockItemId===rows[1].stockItemId&&rows[0].locationId!==rows[1].locationId&&Math.abs(rows.reduce((total,row)=>total+Number(row.quantityDelta),0))<0.000001;
 if(!waste&&!transfer)throw new ApiProblem(400,'REVERSAL_UNSUPPORTED','This workflow needs its own correction process. Only complete transfers and waste recordings can be reversed here.');
 const stocks=new Map();for(const id of [...new Set(rows.map(row=>row.stockItemId))].sort())stocks.set(id,await tx.stockItemDetails(actor.businessId,id));
 const restored=[];
 for(const row of rows){
  if(!row.before||!row.after||!Number.isSafeInteger(row.before.version)||!Number.isSafeInteger(row.after.version))throw new ApiProblem(409,'RESTORATION_EVIDENCE_MISSING','This movement predates exact restoration evidence. Review a current balance correction instead.');
  const stock=stocks.get(row.stockItemId);
  if(stock.sealedContainerSize!==null&&(row.before.sealedContainers===null||row.before.openQuantity===null))throw new ApiProblem(409,'RESTORATION_EVIDENCE_MISSING','The original sealed/open bottle state was not recorded. Review a current balance correction instead.');
  if(stock.baseUnit!==row.baseUnit||stock.sealedContainerSize!==(row.containerSize===null?null:Number(row.containerSize))||stock.averageUnitCostMinor!==Number(row.unitCost))throw new ApiProblem(409,'VERSION_CONFLICT','Stock units or valuation changed after the original recording. Exact reversal is no longer available.');
  if(!await tx.requireStockLocation(actor.businessId,row.locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','An affected storage place is missing or archived.');
  const current=await reviewedBalance(tx,command,actor,row.stockItemId,row.locationId);
  if(['version','quantity','sealedContainers','openQuantity'].some(key=>current[key]!==row.after[key]))throw new ApiProblem(409,'LATER_STOCK_ACTIVITY','Later stock activity prevents exact restoration. Review the current balance instead.');
  if(!Number.isFinite(row.before.quantity)||row.before.quantity<0||Math.abs(row.after.quantity-row.before.quantity-Number(row.quantityDelta))>0.000001)throw new ApiProblem(409,'RESTORATION_EVIDENCE_INVALID','The original movement evidence does not reconcile.');
  restored.push({row,current});
 }
 await tx.insertInventoryReversal({businessId:actor.businessId,originalCommandId:source.originalCommandId,movementId,movementIds:rows.map(row=>row.id),commandId:command.commandId,reason,staffId:actor.staffId,at});
 const movements=[];
 for(const {row} of restored){
  await tx.setInventoryBalance({businessId:actor.businessId,stockItemId:row.stockItemId,locationId:row.locationId,quantity:row.before.quantity,sealedContainers:row.before.sealedContainers,openQuantity:row.before.openQuantity});
  const id=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id,stockItemId:row.stockItemId,locationId:row.locationId,quantityDelta:-Number(row.quantityDelta),movementType:'RECORDING_REVERSAL',reason,commandId:command.commandId,staffId:actor.staffId,at});
  movements.push(await tx.inventoryMovementProjection(actor.businessId,id));
 }
 const stockItems=[];
 for(const [id,stock] of stocks){const version=await tx.bumpEntityVersion(actor.businessId,'stockItems',id,stock.version);await tx.updateStockItemVersion(actor.businessId,id,version);stockItems.push(await tx.stockRecordProjection(actor.businessId,id));}
 return {reversal:{collection:'movementCorrections',id:command.commandId,version:1,archived:false,data:{originalCommandId:source.originalCommandId,movementId,sourceCommandId:command.commandId,reason,createdBy:actor.staffId,createdAt:at.toISOString(),movementIds:rows.map(row=>row.id)}},stockItems,stockMovements:movements};
};

const inventoryAdjust=async({tx,command,actor,at})=>{
  const p=command.payload;const stockItemId=p.stockItemId;const locationId=p.locationId;
  if(!uuid(stockItemId)||!uuid(locationId))throw new ApiProblem(400,'VALIDATION_FAILED','A stock item and location are required.');
  const reason=text(p.reason,'Correction reason',500);const stock=await tx.stockItemDetails(actor.businessId,stockItemId);
  if(!await tx.requireStockLocation(actor.businessId,locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected stock location is missing or archived.');
  const reviewedContainerSize=Number(p.expectedSealedContainerSize);if(p.expectedBaseUnit!==stock.baseUnit||!Number.isFinite(reviewedContainerSize)||Math.abs(reviewedContainerSize-(stock.sealedContainerSize??0))>0.000001)throw new ApiProblem(409,'VERSION_CONFLICT','Stock units changed since this correction was reviewed. Refresh and review it again.');
  const expected=Number(p.expectedQuantity);const counted=safeQuantity(p.countedQty,'Corrected quantity',{allowZero:true});
  if(!Number.isFinite(expected)||expected<0||counted>1_000_000_000||Math.abs(counted*1_000_000-Math.round(counted*1_000_000))>0.0001)throw new ApiProblem(400,'VALIDATION_FAILED','Provide valid quantities with no more than six decimal places.');
  const before=await reviewedBalance(tx,command,actor,stockItemId,locationId);if(Math.abs(before.quantity-expected)>0.000001)throw new ApiProblem(409,'VERSION_CONFLICT','Stock changed since this correction was reviewed. Refresh and review it again.');
  let beforeSealed=null,beforeOpen=null,afterSealed=null,afterOpen=null;
  if(stock.sealedContainerSize!==null){const size=stock.sealedContainerSize;if(stock.baseUnit!=='ml')throw new ApiProblem(409,'RESOURCE_CONFLICT','Configured bottle stock must use ml.');beforeSealed=before.sealedContainers===null?Math.floor(before.quantity/size):before.sealedContainers;beforeOpen=before.openQuantity===null?Number((before.quantity-beforeSealed*size).toFixed(6)):before.openQuantity;const expectedSealed=Number(p.expectedSealedContainers),expectedOpen=Number(p.expectedOpenQuantity);if(!Number.isInteger(expectedSealed)||!Number.isFinite(expectedOpen)||Math.abs(expectedSealed-beforeSealed)>0.000001||Math.abs(expectedOpen-beforeOpen)>0.000001)throw new ApiProblem(409,'VERSION_CONFLICT','Bottle state changed since this correction was reviewed. Refresh and review it again.');afterSealed=Number(p.sealedContainers);afterOpen=Number(p.openQuantity);if(!Number.isInteger(afterSealed)||afterSealed<0||!Number.isFinite(afterOpen)||afterOpen<0||afterOpen>=size||Math.abs(counted-afterSealed*size-afterOpen)>0.000001)throw new ApiProblem(400,'VALIDATION_FAILED','Corrected liquid must equal whole sealed bottles plus open ml below one bottle.');}
  else if(p.sealedContainers!==undefined||p.openQuantity!==undefined)throw new ApiProblem(400,'VALIDATION_FAILED','Bottle quantities require configured ml stock.');
  const variance=Number((counted-before.quantity).toFixed(6));if(variance===0&&(beforeSealed===null||beforeSealed===afterSealed&&beforeOpen===afterOpen))throw new ApiProblem(400,'NO_CHANGE','The corrected balance matches the current physical stock.');
  await tx.setInventoryBalance({businessId:actor.businessId,stockItemId,locationId,quantity:counted,sealedContainers:afterSealed,openQuantity:afterOpen});
  const version=await tx.bumpEntityVersion(actor.businessId,'stockItems',stockItemId,stock.version);await tx.updateStockItemVersion(actor.businessId,stockItemId,version);
  const adjustmentId=`adjustment-${command.commandId}`;await tx.insertStockAdjustment({businessId:actor.businessId,id:adjustmentId,stockItemId,locationId,beforeQuantity:before.quantity,afterQuantity:counted,beforeSealedContainers:beforeSealed,beforeOpenQuantity:beforeOpen,afterSealedContainers:afterSealed,afterOpenQuantity:afterOpen,reason,commandId:command.commandId,staffId:actor.staffId,at});
  const movementRecords=[];if(variance!==0){const movementId=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id:movementId,stockItemId,locationId,quantityDelta:variance,movementType:'MANAGER_ADJUSTMENT',reason,commandId:command.commandId,staffId:actor.staffId,at});movementRecords.push(await tx.inventoryMovementProjection(actor.businessId,movementId));}
  return {adjustment:{collection:'inventoryAdjustments',id:adjustmentId,version:1,data:{stockItemId,locationId,beforeQuantity:before.quantity,afterQuantity:counted,variance,beforeSealedContainers:beforeSealed,beforeOpenQuantity:beforeOpen,afterSealedContainers:afterSealed,afterOpenQuantity:afterOpen,reason,sourceCommandId:command.commandId,createdBy:actor.staffId,createdAt:at.toISOString()},archived:false},stockItem:await tx.stockRecordProjection(actor.businessId,stockItemId),stockMovements:movementRecords};
};

const inventoryProduceBatch=async({tx,command,actor,at})=>{
  await tx.lockInventoryCatalog(actor.businessId);
  const p=command.payload;const productId=p.recipeProductId;const outputId=p.outputStockItemId;const locationId=p.locationId;
  if(!uuid(productId)||!uuid(outputId)||!uuid(locationId))throw new ApiProblem(400,'VALIDATION_FAILED','A saved recipe, output stock item and location are required.');
  if(!await tx.requireStockLocation(actor.businessId,locationId))throw new ApiProblem(409,'RESOURCE_CONFLICT','The selected stock location is missing or archived.');
  const batchCount=p.batchCount;if(!Number.isSafeInteger(batchCount)||batchCount<1||batchCount>1000)throw new ApiProblem(400,'VALIDATION_FAILED','Batch count must be a whole number from 1 to 1000.');
  const reason=text(p.reason,'Preparation note',180);if(reason.length<3)throw new ApiProblem(400,'VALIDATION_FAILED','Preparation note must be at least 3 characters.');
  const product=await tx.batchRecipeDetails(actor.businessId,productId);
  if(product.inventoryType!=='BATCH'||product.stockItemId!==outputId||!Number.isSafeInteger(product.recipeYield)||product.recipeYield<1||product.recipeYield>100000||!product.ingredients.length||product.ingredients.length>100)throw new ApiProblem(409,'RESOURCE_CONFLICT','The saved batch recipe is incomplete or changed. Review it before preparing.');
  if(outputId===product.stockItemId&&product.ingredients.some(line=>line.stockItemId===outputId))throw new ApiProblem(400,'VALIDATION_FAILED','Finished stock cannot also be one of its ingredients.');
  const inputIds=[...new Set(product.ingredients.map(line=>line.stockItemId))].sort();
  if(inputIds.length!==product.ingredients.length||inputIds.includes(outputId))throw new ApiProblem(400,'VALIDATION_FAILED','Recipe ingredients must be unique and cannot include the finished stock item.');
  const stocksById=new Map();for(const stockId of [...inputIds,outputId].sort())stocksById.set(stockId,await tx.stockItemDetails(actor.businessId,stockId));
  for(const stockId of [...inputIds,outputId].sort())await reviewedBalance(tx,command,actor,stockId,locationId);
  const output=stocksById.get(outputId);
  if(!['piece','portion'].includes(output.baseUnit.toLowerCase()))throw new ApiProblem(409,'RESOURCE_CONFLICT','Finished batch stock must use piece or portion units.');
  const stockById=stocksById;
  if(expectedVersion(command,'products',productId)!==product.version)throw new ApiProblem(409,'VERSION_CONFLICT','The batch recipe changed. Review it before preparing.');
  if(expectedVersion(command,'stockItems',outputId)!==output.version)throw new ApiProblem(409,'VERSION_CONFLICT','Finished stock changed. Review the batch before preparing.');
  const locationVersion=command.expectedVersions[`stockLocations:${locationId}`];if(!Number.isSafeInteger(locationVersion))throw new ApiProblem(400,'VALIDATION_FAILED','The reviewed stock location version is required.');
  const outputQuantity=product.recipeYield*batchCount;if(!Number.isSafeInteger(outputQuantity)||outputQuantity<=0||outputQuantity>1_000_000_000)throw new ApiProblem(400,'VALIDATION_FAILED','Calculated batch output is invalid.');
  const consumption=[];let totalCostMinor=0;
  for(const line of product.ingredients){const stock=stockById.get(line.stockItemId);if(expectedVersion(command,'stockItems',line.stockItemId)!==stock.version)throw new ApiProblem(409,'VERSION_CONFLICT','An ingredient changed. Review the batch before preparing.');const quantity=line.quantity*product.recipeYield*batchCount;if(!Number.isFinite(quantity)||quantity<=0||quantity>1_000_000_000||Math.abs(quantity*1_000_000-Math.round(quantity*1_000_000))>0.0001)throw new ApiProblem(400,'VALIDATION_FAILED','Calculated ingredient usage is invalid.');const lineCost=Math.round(stock.averageUnitCostMinor*quantity);if(!Number.isSafeInteger(lineCost)||lineCost<0)throw new ApiProblem(400,'VALIDATION_FAILED','Ingredient cost is invalid; correct its stock cost before preparing.');totalCostMinor+=lineCost;consumption.push({stock,quantity,lineCost});}
  if(!Number.isSafeInteger(totalCostMinor))throw new ApiProblem(400,'VALIDATION_FAILED','Calculated batch cost is invalid.');
  const usage=[],movementRecords=[];const movementReason=`Batch preparation ${product.name} x ${batchCount}: ${reason}`;
  for(const entry of consumption){const {stock,quantity,lineCost}=entry;const balance=await tx.stockBalance(actor.businessId,stock.id,locationId);if(balance.quantity+0.000001<quantity)throw new ApiProblem(409,'RESOURCE_CONFLICT',`There is not enough ${stock.name} at the selected location.`);let sealed=null,open=null;const size=stock.sealedContainerSize;if(size!==null){if(stock.baseUnit.toLowerCase()!=='ml')throw new ApiProblem(409,'RESOURCE_CONFLICT','Configured bottle stock must use ml.');const currentSealed=balance.sealedContainers===null?Math.floor(balance.quantity/size):balance.sealedContainers;const currentOpen=balance.openQuantity===null?Number((balance.quantity-currentSealed*size).toFixed(6)):balance.openQuantity;let remaining=Math.max(0,quantity-currentOpen);sealed= currentSealed-Math.ceil(remaining/size);open=remaining===0?Number((currentOpen-quantity).toFixed(6)):Number((Math.ceil(remaining/size)*size-remaining).toFixed(6));if(sealed<0||open<0||open>=size)throw new ApiProblem(409,'RESOURCE_CONFLICT','The ingredient bottle balance cannot cover this recipe usage.');const nextQuantity=Number((sealed*size+open).toFixed(6));await tx.setInventoryBalance({businessId:actor.businessId,stockItemId:stock.id,locationId,quantity:nextQuantity,sealedContainers:sealed,openQuantity:open});}else await tx.setInventoryBalance({businessId:actor.businessId,stockItemId:stock.id,locationId,quantity:Number((balance.quantity-quantity).toFixed(6))});const version=await tx.bumpEntityVersion(actor.businessId,'stockItems',stock.id,stock.version);await tx.updateStockItemVersion(actor.businessId,stock.id,version);const movementId=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id:movementId,stockItemId:stock.id,locationId,quantityDelta:-quantity,movementType:'BATCH_PREPARATION_INGREDIENT',reason:movementReason,commandId:command.commandId,staffId:actor.staffId,at});movementRecords.push(await tx.inventoryMovementProjection(actor.businessId,movementId));usage.push({stockItemId:stock.id,name:stock.name,quantity,unitCostMinor:stock.averageUnitCostMinor,totalCostMinor:lineCost});}
  const outputBalance=await tx.stockBalance(actor.businessId,outputId,locationId);const existingTotal=await tx.totalStockQuantity(actor.businessId,outputId);const averageCostMinor=weightedCostRate(existingTotal,output.averageUnitCostMinor,outputQuantity,totalCostMinor);if(!Number.isFinite(averageCostMinor)||averageCostMinor<0)throw new ApiProblem(400,'VALIDATION_FAILED','Finished-stock cost calculation is invalid.');await tx.setInventoryBalance({businessId:actor.businessId,stockItemId:outputId,locationId,quantity:Number((outputBalance.quantity+outputQuantity).toFixed(6))});const outputVersion=await tx.bumpEntityVersion(actor.businessId,'stockItems',outputId,output.version);await tx.updateStockCostAndVersion(actor.businessId,outputId,averageCostMinor,outputVersion);
  const movementId=randomUUID();await tx.insertInventoryMovement({businessId:actor.businessId,id:movementId,stockItemId:outputId,locationId,quantityDelta:outputQuantity,movementType:'BATCH_PREPARATION_OUTPUT',reason:movementReason,commandId:command.commandId,staffId:actor.staffId,at});movementRecords.push(await tx.inventoryMovementProjection(actor.businessId,movementId));
  const id=command.commandId;await tx.insertBatchPreparation({businessId:actor.businessId,id,productId,outputStockItemId:outputId,locationId,batchCount,outputQuantity,ingredientUsage:usage,totalCostMinor,reason,commandId:command.commandId,staffId:actor.staffId,at});
  return {batch:{collection:'inventoryBatchPreparations',id,version:1,data:{productId,outputStockItemId:outputId,locationId,batchCount,outputQuantity,ingredientUsage:usage,totalCostMinor,reason,sourceCommandId:command.commandId,createdBy:actor.staffId,createdAt:at.toISOString()},archived:false},stockMovements:movementRecords,outputStockItem:await tx.stockRecordProjection(actor.businessId,outputId),ingredientStockItems:await Promise.all(inputIds.map(stockId=>tx.stockRecordProjection(actor.businessId,stockId)))};
};

export const catalogCommandRegistry = new Map([
  ['stockItem.save', {permission:'catalog.manage',offlinePolicy:'GRANTED_ONLY',handler:stockItemSave}],
  ['stockLocation.save', {permission:'catalog.manage',permissionAny:['catalog.manage','inventory.adjust'],offlinePolicy:'GRANTED_ONLY',handler:stockLocationSave}],
  ['product.save', {permission:'catalog.manage',offlinePolicy:'GRANTED_ONLY',handler:productSave}],
  ['product.archive',{permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:archiveProduct}],
  ['product.reactivate',{permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:reactivateProduct}],
  ['stockItem.archive',{permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:archiveStockItem}],
  ['stockItem.reactivate',{permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:reactivateStockItem}],
  ['stockLocation.archive',{permission:'inventory.adjust',offlinePolicy:'ONLINE_ONLY',handler:archiveStockLocation}],
  ['stockLocation.reactivate',{permission:'inventory.adjust',offlinePolicy:'ONLINE_ONLY',handler:reactivateStockLocation}],
  ['catalog.createWithOpeningStock', {permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:catalogCreateWithOpeningStock}],
  ['inventory.countLocation',{permission:'inventory.count',offlinePolicy:'ONLINE_ONLY',handler:inventoryCount}],
  ['inventory.countSelected',{permission:'inventory.count',offlinePolicy:'ONLINE_ONLY',handler:inventoryCount}],
  ['inventory.transfer',{permission:'inventory.transfer',offlinePolicy:'ONLINE_ONLY',handler:inventoryMovement}],
  ['inventory.waste',{permission:'inventory.waste',offlinePolicy:'ONLINE_ONLY',handler:inventoryMovement}],
  ['inventory.policy.save',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:inventoryPolicySave}],
  ['inventory.receive',{permission:'inventory.receive',offlinePolicy:'ONLINE_ONLY',handler:inventoryReceive}],
  ['inventory.reverseMovement',{permission:'inventory.adjust',offlinePolicy:'ONLINE_ONLY',handler:inventoryReverseMovement}],
  ['inventory.adjust',{permission:'inventory.adjust',offlinePolicy:'ONLINE_ONLY',handler:inventoryAdjust}],
  ['inventory.produceBatch',{permission:'inventory.adjust',offlinePolicy:'ONLINE_ONLY',handler:inventoryProduceBatch}],
  ['catalog.item.create', {
    permission: 'catalog.manage',
    offlinePolicy: 'ONLINE_ONLY',
    handler: async ({tx, command, actor, at}) => {
      const {itemId, name, sku = null, categoryId = null, basePriceMinor, currency = 'KES', trackInventory = false} = command.payload;
      const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      if (!isUuid(itemId) || typeof name !== 'string' || !name.trim() || name.trim().length > 160) {
        throw new ApiProblem(400, 'VALIDATION_FAILED', 'Provide a valid item ID and name (up to 160 characters).');
      }
      if (!Number.isSafeInteger(basePriceMinor) || basePriceMinor < 0) {
        throw new ApiProblem(400, 'VALIDATION_FAILED', 'basePriceMinor must be a non-negative integer.');
      }
      if (sku !== null && (typeof sku !== 'string' || !sku.trim() || sku.length > 80)) {
        throw new ApiProblem(400, 'VALIDATION_FAILED', 'SKU must be blank or contain up to 80 characters.');
      }
      if (categoryId !== null && !isUuid(categoryId)) {
        throw new ApiProblem(400, 'VALIDATION_FAILED', 'categoryId must be a UUID or null.');
      }
      if (!/^[A-Z]{3}$/.test(currency)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'currency must be a three-letter uppercase code.');
      if (typeof trackInventory !== 'boolean') throw new ApiProblem(400, 'VALIDATION_FAILED', 'trackInventory must be a boolean.');
      if (categoryId !== null && !await tx.requireCatalogCategory(actor.businessId, categoryId)) {
        throw new ApiProblem(409, 'RESOURCE_CONFLICT', 'The selected category no longer exists or is archived.');
      }
      const expected = command.expectedVersions[`catalogItems:${itemId}`] ?? command.expectedVersions[`catalog_items:${itemId}`];
      if (expected !== 0) throw new ApiProblem(400, 'VALIDATION_FAILED', 'A new item command must include expected version 0 for its item ID.');
      if (sku && await tx.findCatalogSku(actor.businessId, sku.trim())) {
        throw new ApiProblem(409, 'DUPLICATE_REFERENCE', 'That SKU is already assigned to an active item.');
      }
      const version = await tx.bumpEntityVersion(actor.businessId, 'catalog_items', itemId, 0);
      const item = {
        businessId: actor.businessId,
        staffId: actor.staffId,
        id: itemId,
        categoryId,
        name: name.trim(),
        sku: sku?.trim() || null,
        basePriceMinor,
        currency,
        trackInventory,
        version,
        createdAt: at.toISOString(),
      };
      await tx.insertCatalogItem(item);
      return {collection:'catalogItems',id:item.id,version:item.version,data:{categoryId:item.categoryId,name:item.name,sku:item.sku,basePriceMinor:item.basePriceMinor,currency:item.currency,trackInventory:item.trackInventory,createdAt:item.createdAt},archived:false};
    },
  }],
]);


// Every registered handler names its changed projections explicitly. Business value
// objects may contain arbitrary nested data without accidentally publishing records.
const changeRecords=new Map([
  ['stockItem.save',async(value,{tx,actor,command})=>[await tx.stockRecordProjection(actor.businessId,command.payload.id)]],
  ['stockLocation.save',async value=>[value]],
  ['product.save',async value=>[value]],
  ['product.archive',async(value,{tx,actor})=>[await tx.productRecordProjection(actor.businessId,value.id)]],
  ['product.reactivate',async(value,{tx,actor})=>[await tx.productRecordProjection(actor.businessId,value.id)]],
  ['stockItem.archive',async(value,{tx,actor})=>[await tx.stockRecordProjection(actor.businessId,value.id)]],
  ['stockItem.reactivate',async(value,{tx,actor})=>[await tx.stockRecordProjection(actor.businessId,value.id)]],
  ['stockLocation.archive',async(value,{tx,actor})=>[await tx.stockLocationProjection(actor.businessId,value.id)]],
  ['stockLocation.reactivate',async(value,{tx,actor})=>[await tx.stockLocationProjection(actor.businessId,value.id)]],
 ['catalog.item.create',async value=>[value]],
 ['catalog.createWithOpeningStock',async(value,{tx,actor})=>[await tx.stockRecordProjection(actor.businessId,value.id),...(value.product?[value.product]:[]),...value.openingMovements]],
 ['inventory.countLocation',async value=>[value.count,...value.stockItems,...value.stockMovements]],
 ['inventory.countSelected',async value=>[value.count,...value.stockItems,...value.stockMovements]],
 ['inventory.transfer',async value=>[value.stockItem,...value.stockMovements]],
 ['inventory.waste',async value=>[value.stockItem,...value.stockMovements]],
 ['inventory.policy.save',async value=>[value]],
 ['inventory.receive',async value=>[value.receipt,value.stockItem,value.stockMovement]],
 ['inventory.reverseMovement',async value=>[value.reversal,...value.stockItems,...value.stockMovements]],
 ['inventory.adjust',async value=>[value.adjustment,value.stockItem,...value.stockMovements]],
 ['inventory.produceBatch',async value=>[value.batch,value.outputStockItem,...value.ingredientStockItems,...value.stockMovements]],
]);
for(const [name,definition] of catalogCommandRegistry){
 const handler=definition.handler,project=changeRecords.get(name);
 if(!project)throw new Error(`Missing explicit change projection for ${name}`);
 definition.handler=async context=>{const value=await handler(context);const records=(await project(value,context)).map(record=>({...record,archived:record.archived===true}));return {value,records};};
}
