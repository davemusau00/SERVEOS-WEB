import {ApiProblem} from './command-kernel.mjs';
import {randomUUID} from 'node:crypto';

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
  const {id, data} = command.payload;
  if (!uuid(id) || !data || typeof data !== 'object' || Array.isArray(data)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Stock item payload is malformed.');
  const expected = expectedVersion(command, 'stockItems', id);
  const name = text(data.name, 'Name');
  const code = text(data.code, 'Code', 80);
  const baseUnit = text(data.baseUnit, 'Base unit', 40);
  const barcode = optionalText(data.barcode);
  const scanUnitQuantity = safeQuantity(data.scanUnitQuantity ?? 1, 'Scan unit quantity');
  const reorderLevel = safeQuantity(data.reorderLevel ?? 0, 'Reorder level', {allowZero: true});
  const averageUnitCostMinor = data.averageUnitCostMinor ?? 0;
  if (!Number.isSafeInteger(averageUnitCostMinor) || averageUnitCostMinor < 0) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Average unit cost must be a non-negative integer in minor currency units.');
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

const productSave = async ({tx, command, actor, at}) => {
  const {id, data} = command.payload;
  if (!uuid(id) || !data || typeof data !== 'object' || Array.isArray(data)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Product payload is malformed.');
  const expected = expectedVersion(command, 'products', id);
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
  const ids = [...recipeIngredients.map(item => item.stockItemId), ...(stockItemId ? [stockItemId] : [])];
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
  const portions = data.portions ?? [];
  if (!Array.isArray(portions) || portions.some(portion => !portion || typeof portion !== 'object' || typeof portion.id !== 'string' || typeof portion.name !== 'string' || !Number.isSafeInteger(portion.priceMinor) || portion.priceMinor < 0 || !Number.isFinite(portion.volume) || portion.volume <= 0)) throw new ApiProblem(400,'VALIDATION_FAILED','Product portions are malformed.');
  await tx.saveProduct({businessId:actor.businessId,staffId:actor.staffId,id,name,code,priceMinor,category,routeTo,stockItemId,barcode,favorite,taxClassId,inventoryType,recipeYield,portionVolume,sellingMode,portions,outletIds,recipe:recipeIngredients.length > 0,recipeIngredients,version});
  return {collection:'products',id,version,data:{name,code,priceMinor,category,routeTo,stockItemId,barcode,favorite,taxClassId,inventoryType,recipeIngredients,recipeYield,portionVolume,sellingMode,portions,outletIds,updatedAt:at.toISOString()}};
};

const catalogCreateWithOpeningStock = async ({tx, command, actor, at}) => {
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
  if (!Number.isSafeInteger(averageUnitCostMinor) || averageUnitCostMinor < 0) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Average unit cost must be a non-negative integer.');
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
  let productResult = null;
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
  }
  return {collection:'stockItems',id:stockId,version:stockVersion,data:{name,code,baseUnit,barcode,scanUnitQuantity,reorderLevel,averageUnitCostMinor,sealedContainerSize,purchasePackages},product:productResult,openingQuantity:startingQuantity};
};

export const catalogCommandRegistry = new Map([
  ['stockItem.save', {permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:stockItemSave}],
  ['product.save', {permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:productSave}],
  ['catalog.createWithOpeningStock', {permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:catalogCreateWithOpeningStock}],
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
      return item;
    },
  }],
]);
