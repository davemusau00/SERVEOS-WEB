import {ApiProblem} from './command-kernel.mjs';

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
    return {id: uuid(pack.id) ? pack.id : randomUUID(), name: text(pack.name, 'Package name', 100), quantity: safeQuantity(pack.quantity ?? pack.baseQuantity, 'Package quantity'), unitCostMinor: pack.unitCostMinor ?? 0, barcode: optionalText(pack.barcode)};
  });
  if (normalizedPackages.some(pack => !Number.isSafeInteger(pack.unitCostMinor) || pack.unitCostMinor < 0)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Package cost must be a non-negative integer in minor currency units.');
  const sealedContainerSize = data.sealedContainerSize === undefined ? null : safeQuantity(data.sealedContainerSize, 'Sealed container size');
  await duplicateCheck(tx, 'stock_items', actor.businessId, code, barcode, id);
  for (const pack of normalizedPackages) if (pack.barcode && await tx.findBusinessBarcode('stock_items', actor.businessId, pack.barcode, id)) throw new ApiProblem(409, 'DUPLICATE_REFERENCE', 'A purchase package barcode is already assigned to another stock item.');
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
  const priceMinor = data.priceMinor;
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Price must be a non-negative integer in minor currency units.');
  const category = text(data.category ?? 'GENERAL', 'Category', 80);
  const routeTo = text(data.routeTo ?? 'BAR', 'Service area', 40).toUpperCase();
  if (!['BAR','KITCHEN','ROOMS'].includes(routeTo)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Service area must be BAR, KITCHEN, or ROOMS.');
  const stockItemId = data.stockItemId || null;
  if (stockItemId && !uuid(stockItemId)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Stock item reference must be a UUID.');
  const barcode = optionalText(data.barcode);
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
  if (stockItemId && recipeIngredients.length) throw new ApiProblem(400, 'VALIDATION_FAILED', 'A product cannot use both a linked stock item and recipe ingredients.');
  const ids = [...recipeIngredients.map(item => item.stockItemId), ...(stockItemId ? [stockItemId] : [])];
  if (!await tx.requireStockItems(actor.businessId, ids)) throw new ApiProblem(409, 'RESOURCE_CONFLICT', 'A referenced stock item is missing or archived.');
  await duplicateCheck(tx, 'products', actor.businessId, code, barcode, id);
  const version = await tx.bumpEntityVersion(actor.businessId, 'products', id, expected);
  await tx.saveProduct({businessId:actor.businessId,staffId:actor.staffId,id,name,code,priceMinor,category,routeTo,stockItemId,barcode,favorite,taxClassId,recipe:recipeIngredients.length > 0,recipeIngredients,version});
  return {collection:'products',id,version,data:{name,code,priceMinor,category,routeTo,stockItemId,barcode,favorite,taxClassId,recipeIngredients,updatedAt:at.toISOString()}};
};

export const catalogCommandRegistry = new Map([
  ['stockItem.save', {permission:'inventory.catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:stockItemSave}],
  ['product.save', {permission:'catalog.manage',offlinePolicy:'ONLINE_ONLY',handler:productSave}],
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
      const expected = command.expectedVersions[`catalog_items:${itemId}`];
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
