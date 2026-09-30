export type MeasurementMode = 'COUNT' | 'WEIGHT' | 'VOLUME';
export type CanonicalUnit = 'piece' | 'g' | 'ml';
export type SmartItemType = 'DRINK' | 'SPIRIT' | 'WINE' | 'KEG' | 'WEIGHT_INGREDIENT' | 'COUNT_INGREDIENT' | 'DISH' | 'BATCH' | 'RETAIL' | 'SERVICE';

export const SMART_ITEM_PRESETS: Record<SmartItemType, { label: string; mode?: MeasurementMode; purchaseUnit: string; baseUnit?: CanonicalUnit; saleUnit?: string; requiresStock: boolean; recipeEligible: boolean }> = {
  DRINK: { label: 'Beer, soda, or bottled drink', mode: 'COUNT', purchaseUnit: 'case', baseUnit: 'piece', saleUnit: 'each', requiresStock: true, recipeEligible: false },
  SPIRIT: { label: 'Spirit or liquor', mode: 'VOLUME', purchaseUnit: 'bottle', baseUnit: 'ml', saleUnit: 'shot', requiresStock: true, recipeEligible: true },
  WINE: { label: 'Wine', mode: 'VOLUME', purchaseUnit: 'bottle', baseUnit: 'ml', saleUnit: 'glass', requiresStock: true, recipeEligible: true },
  KEG: { label: 'Keg or dispenser drink', mode: 'VOLUME', purchaseUnit: 'keg', baseUnit: 'ml', saleUnit: 'glass', requiresStock: true, recipeEligible: true },
  WEIGHT_INGREDIENT: { label: 'Ingredient bought by weight', mode: 'WEIGHT', purchaseUnit: 'kg', baseUnit: 'g', saleUnit: 'portion', requiresStock: true, recipeEligible: true },
  COUNT_INGREDIENT: { label: 'Ingredient bought by count', mode: 'COUNT', purchaseUnit: 'packet', baseUnit: 'piece', saleUnit: 'portion', requiresStock: true, recipeEligible: true },
  DISH: { label: 'Menu dish', mode: 'COUNT', purchaseUnit: 'portion', baseUnit: 'piece', saleUnit: 'portion', requiresStock: false, recipeEligible: true },
  BATCH: { label: 'Batch recipe', mode: 'COUNT', purchaseUnit: 'batch', baseUnit: 'piece', saleUnit: 'portion', requiresStock: false, recipeEligible: true },
  RETAIL: { label: 'Retail or packaged product', mode: 'COUNT', purchaseUnit: 'case', baseUnit: 'piece', saleUnit: 'each', requiresStock: true, recipeEligible: false },
  SERVICE: { label: 'Service or non-stock item', purchaseUnit: 'service', saleUnit: 'service', requiresStock: false, recipeEligible: false },
};

const unitAliases: Record<MeasurementMode, Record<string, number>> = {
  COUNT: { piece: 1, pieces: 1, unit: 1, units: 1, bottle: 1, bottles: 1, can: 1, cans: 1, packet: 1, packets: 1, tray: 1, trays: 1 },
  WEIGHT: { g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000 },
  VOLUME: { ml: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1, l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000 },
};
const canonical: Record<MeasurementMode, CanonicalUnit> = { COUNT: 'piece', WEIGHT: 'g', VOLUME: 'ml' };

const finiteNonNegative = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite, non-negative number.`);
  return value;
};

export function canonicalizeMeasurement(quantity: number, unit: string, mode?: MeasurementMode): { quantity: number; unit: CanonicalUnit; mode: MeasurementMode } {
  finiteNonNegative(quantity, 'Quantity');
  const normalized = unit.trim().toLowerCase();
  const match = (Object.keys(unitAliases) as MeasurementMode[]).find(candidate => (!mode || candidate === mode) && Object.hasOwn(unitAliases[candidate], normalized));
  if (!match) throw new Error(`'${unit}' is not a supported ${mode ? mode.toLowerCase() : 'inventory'} unit.`);
  const converted = quantity * unitAliases[match][normalized];
  if (!Number.isFinite(converted) || converted > 1_000_000_000_000) throw new Error('Converted quantity is outside the supported range.');
  return { quantity: Number(converted.toFixed(6)), unit: canonical[match], mode: match };
}

export function purchasePackageQuantity(packageCount: number, contentsPerPackage: number, contentUnit: string, mode?: MeasurementMode) {
  finiteNonNegative(packageCount, 'Package count');
  finiteNonNegative(contentsPerPackage, 'Package size');
  const contents = canonicalizeMeasurement(contentsPerPackage, contentUnit, mode);
  if (contents.quantity <= 0) throw new Error('Package size must be greater than zero.');
  const quantity = packageCount * contents.quantity;
  if (!Number.isFinite(quantity) || quantity > 1_000_000_000_000) throw new Error('Package total is outside the supported range.');
  return { quantity: Number(quantity.toFixed(6)), unit: contents.unit, mode: contents.mode };
}

export function costPerCanonicalUnit(packageCostMinor: number, contentsPerPackage: number, contentUnit: string, mode?: MeasurementMode) {
  if (!Number.isSafeInteger(packageCostMinor) || packageCostMinor < 0) throw new Error('Package cost must be a non-negative amount in minor currency units.');
  const contents = canonicalizeMeasurement(contentsPerPackage, contentUnit, mode);
  if (contents.quantity <= 0) throw new Error('Package size must be greater than zero.');
  return packageCostMinor / contents.quantity;
}

export function stockVariance(expected: number, counted: number) {
  finiteNonNegative(expected, 'Expected stock');
  finiteNonNegative(counted, 'Counted stock');
  return Number((counted - expected).toFixed(6));
}

export function calculateRecipeCost(ingredients: Array<{ quantity: number; averageCostMinor: number }>) {
  return ingredients.reduce((total, ingredient) => {
    finiteNonNegative(ingredient.quantity, 'Ingredient quantity');
    if (ingredient.quantity <= 0) throw new Error('Ingredient quantity must be greater than zero.');
    if (!Number.isSafeInteger(ingredient.averageCostMinor) || ingredient.averageCostMinor < 0) throw new Error('Ingredient cost must be a non-negative amount in minor currency units.');
    const next = total + ingredient.quantity * ingredient.averageCostMinor;
    if (!Number.isFinite(next) || next > Number.MAX_SAFE_INTEGER) throw new Error('Calculated recipe cost is outside the supported range.');
    return next;
  }, 0);
}

export function calculateBatchUnitCost(ingredients: Array<{ quantity: number; averageCostMinor: number }>, yieldQuantity: number) {
  finiteNonNegative(yieldQuantity, 'Batch yield');
  if (yieldQuantity <= 0) throw new Error('Batch yield must be greater than zero.');
  return calculateRecipeCost(ingredients) / yieldQuantity;
}

export function calculateSealedAndOpenStock(sealedContainers: number, containerContents: number, openContents: number, unit: string, mode?: MeasurementMode) {
  finiteNonNegative(sealedContainers, 'Sealed container count');
  if (!Number.isInteger(sealedContainers)) throw new Error('Sealed container count must be a whole number.');
  finiteNonNegative(openContents, 'Open quantity');
  const container = canonicalizeMeasurement(containerContents, unit, mode);
  if (container.quantity <= 0) throw new Error('Container size must be greater than zero.');
  const opened = canonicalizeMeasurement(openContents, unit, container.mode);
  if (opened.quantity >= container.quantity) throw new Error('Open quantity must be less than one full container.');
  const totalQuantity = sealedContainers * container.quantity + opened.quantity;
  if (!Number.isFinite(totalQuantity) || totalQuantity > 1_000_000_000_000) throw new Error('Combined stock is outside the supported range.');
  return { sealedContainers, openQuantity: opened.quantity, totalQuantity: Number(totalQuantity.toFixed(6)), unit: container.unit, mode: container.mode };
}

export function calculateTheoreticalServings(containerQuantity: number, servingQuantity: number, unit: string, mode?: MeasurementMode) {
  finiteNonNegative(servingQuantity, 'Serving size');
  if (servingQuantity <= 0) throw new Error('Serving size must be greater than zero.');
  const container = canonicalizeMeasurement(containerQuantity, unit, mode);
  const serving = canonicalizeMeasurement(servingQuantity, unit, container.mode);
  if (container.quantity <= 0) throw new Error('Container size must be greater than zero.');
  return { wholeServings: Math.floor(container.quantity / serving.quantity), remainder: Number((container.quantity % serving.quantity).toFixed(6)), unit: container.unit, mode: container.mode };
}
