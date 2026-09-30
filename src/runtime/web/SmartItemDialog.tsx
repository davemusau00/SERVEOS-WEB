import React, { useMemo, useState } from 'react';
import {
  calculateRecipeCost,
  canonicalizeMeasurement,
  costPerCanonicalUnit,
  definePurchasePackage,
  type MeasurementMode,
} from '../../utils/inventoryUnits';
import { Dialog } from '../../design-system/controls';
import type { BusinessRecord, WebSession } from './session';
import { operatorError } from './operatorError';

type Command = (operation: string, collection: string, id: string, payload: Record<string, unknown>) => Promise<unknown>;
type SetupKind = 'STOCKED' | 'RECIPE' | 'STOCK_ONLY';
type RecipeLine = { stockItemId: string; quantity: number; tracked: true };

const input = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';
const button = 'rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40';
const primary = 'rounded-lg bg-amber-400 px-3 py-2 font-bold text-slate-950 disabled:opacity-40';
const cash = (value: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value || 0);
const fields = (records: BusinessRecord[], collection: string) => records.filter(record => record.collection === collection && !record.archived);

export function SmartItemDialog({ records, session, disabled, command, onClose }: { records: BusinessRecord[]; session: WebSession; disabled: boolean; command: Command; onClose: () => void }) {
  const locations = fields(records, 'stockLocations');
  const outlets = fields(records, 'outlets');
  const stocks = fields(records, 'stockItems');
  const canCatalog = session.permissions.includes('*') || session.permissions.includes('catalog.manage');
  const canInventory = session.permissions.includes('*') || session.permissions.includes('inventory.adjust');
  const canRecipe = canCatalog && (session.permissions.includes('*') || session.permissions.includes('inventory.view'));
  const [step, setStep] = useState(0);
  const [setupKind, setSetupKind] = useState<SetupKind>(canCatalog && canInventory ? 'STOCKED' : canRecipe ? 'RECIPE' : 'STOCK_ONLY');
  const [itemType, setItemType] = useState(setupKind === 'RECIPE' ? 'DISH' : 'DRINK');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [price, setPrice] = useState(0);
  const [routeTo, setRouteTo] = useState('BAR');
  const [category, setCategory] = useState('GENERAL');
  const [locationId, setLocationId] = useState('');
  const [purchaseName, setPurchaseName] = useState('Case');
  const [unitsPerPackage, setUnitsPerPackage] = useState(24);
  const [contents, setContents] = useState(1);
  const [unit, setUnit] = useState('piece');
  const [packageCost, setPackageCost] = useState(0);
  const [openingPackages, setOpeningPackages] = useState(0);
  const [saleQuantity, setSaleQuantity] = useState(1);
  const [barcode, setBarcode] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeLine[]>([]);
  const [recipeStockId, setRecipeStockId] = useState('');
  const [recipeQuantity, setRecipeQuantity] = useState(1);
  const [recipeUnit, setRecipeUnit] = useState('piece');
  const [error, setError] = useState('');
  const [recipeError, setRecipeError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingReview, setPendingReview] = useState(false);

  const mode: MeasurementMode = unit === 'g' || unit === 'kg' ? 'WEIGHT' : unit === 'ml' || unit === 'l' ? 'VOLUME' : 'COUNT';
  const baseUnit = mode === 'WEIGHT' ? 'g' : mode === 'VOLUME' ? 'ml' : 'piece';
  const calculation = useMemo(() => {
    try {
      const pkg = definePurchasePackage({ id: 'preview', name: purchaseName || 'Package', unitsPerPackage, contentsPerSaleUnit: contents, unit, mode, barcode });
      const unitCost = costPerCanonicalUnit(Math.round(packageCost * 100), pkg.baseQuantity, baseUnit);
      return { pkg, unitCost, opening: pkg.baseQuantity * openingPackages, sale: canonicalizeMeasurement(saleQuantity, unit, mode).quantity };
    } catch {
      return null;
    }
  }, [purchaseName, unitsPerPackage, contents, unit, mode, barcode, packageCost, openingPackages, saleQuantity, baseUnit]);

  const selectedRecipeStock = stocks.find(stock => stock.id === recipeStockId);
  const selectedRecipeBase = String(selectedRecipeStock?.data.baseUnit || 'piece').toLowerCase();
  const selectedRecipeMode: MeasurementMode = selectedRecipeBase === 'g' || selectedRecipeBase === 'kg' ? 'WEIGHT' : selectedRecipeBase === 'ml' || selectedRecipeBase === 'l' ? 'VOLUME' : 'COUNT';
  const recipeUnits = selectedRecipeMode === 'WEIGHT' ? ['g', 'kg'] : selectedRecipeMode === 'VOLUME' ? ['ml', 'l'] : [selectedRecipeBase === 'unit' ? 'piece' : selectedRecipeBase];
  const recipeCostMinor = useMemo(() => {
    try {
      return calculateRecipeCost(recipeIngredients.map(line => {
        const stock = stocks.find(item => item.id === line.stockItemId);
        if (!stock) throw new Error('Recipe stock item is no longer available.');
        const averageCostMinor = Number(stock.data.averageUnitCostMinor || 0);
        if (!Number.isSafeInteger(averageCostMinor)) throw new Error('Recipe stock cost is invalid.');
        return { quantity: line.quantity, averageCostMinor };
      }));
    } catch {
      return Number.NaN;
    }
  }, [recipeIngredients, stocks]);

  const addRecipeIngredient = () => {
    setRecipeError('');
    if (!selectedRecipeStock) return;
    if (recipeIngredients.some(line => line.stockItemId === selectedRecipeStock.id)) {
      setRecipeError('This ingredient is already in the recipe.');
      return;
    }
    try {
      const entered = canonicalizeMeasurement(recipeQuantity, recipeUnit, selectedRecipeMode);
      const base = canonicalizeMeasurement(1, selectedRecipeBase, selectedRecipeMode);
      const quantity = Number((entered.quantity / base.quantity).toFixed(6));
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Invalid recipe quantity.');
      setRecipeIngredients(lines => [...lines, { stockItemId: selectedRecipeStock.id, quantity, tracked: true }]);
      setRecipeStockId('');
      setRecipeQuantity(1);
    } catch {
      setRecipeError(`Enter a positive quantity compatible with ${selectedRecipeBase}.`);
    }
  };

  const sellable = async (productId: string) => {
    if (!session.permissions.includes('*') && !session.permissions.includes('catalog.manage')) throw new Error('This role cannot create sellable catalog items. Ask an Admin for catalog access.');
    if (!outlets.length) throw new Error('Add a service area before creating a sellable item.');
    return {
      id: productId,
      name: name.trim(),
      code: code.trim(),
      price: Number(price),
      category: category.trim() || 'GENERAL',
      inventoryType: itemType,
      routeTo,
      stockItemId: '',
      outletIds: outlets.map(outlet => outlet.id),
      taxClassId: 'A_STANDARD',
      favorite: false,
      barcode: barcode.trim(),
      portionVolume: calculation?.sale || 1,
      portions: [{ id: 'each', name: mode === 'VOLUME' ? 'Each serving' : 'Each', volume: calculation?.sale || 1, priceMinor: Math.round(Number(price) * 100) }],
      recipeIngredients: [] as RecipeLine[],
      modifiers: [],
    };
  };

  const save = async () => {
    setError('');
    if (busy || pendingReview) return;
    if (setupKind === 'RECIPE') {
      if (!canRecipe) {
        setError('Recipe setup requires catalog management and inventory viewing access. Ask an Admin to review your role.');
        return;
      }
      if (!session.permissions.includes('*') && !session.permissions.includes('catalog.manage')) {
        setError('This role cannot create sellable catalog items. Ask an Admin for catalog access.');
        return;
      }
      if (!name.trim() || !code.trim() || !outlets.length || !Number.isFinite(price) || price < 0 || recipeIngredients.length === 0) {
        setError('Complete the item identity, selling price, service area, and at least one recipe ingredient.');
        return;
      }
    } else {
      if (!session.permissions.includes('*') && !session.permissions.includes('inventory.adjust')) {
        setError('This role cannot create a stock master. Ask an Admin to grant inventory adjustment access.');
        return;
      }
      if (setupKind === 'STOCKED' && !session.permissions.includes('*') && !session.permissions.includes('catalog.manage')) {
        setError('This role cannot create the sellable item. Ask an Admin for catalog access.');
        return;
      }
      if (!name.trim() || !code.trim() || !locationId || !calculation || setupKind === 'STOCKED' && (!Number.isFinite(price) || price < 0)) {
        setError('Complete the required item, package, price, and storage details with valid quantities.');
        return;
      }
    }
    setBusy(true);
    try {
      let result: unknown;
      if (setupKind === 'RECIPE') {
        const productId = crypto.randomUUID();
        result = await command('product.save', 'products', productId, {
          id: productId,
          data: {
            id: productId,
            name: name.trim(),
            code: code.trim(),
            priceMinor: Math.round(Number(price) * 100),
            category: category.trim() || 'GENERAL',
            inventoryType: itemType,
            routeTo,
            outletIds: outlets.map(outlet => outlet.id),
            taxClassId: 'A_STANDARD',
            favorite: false,
            barcode: barcode.trim() || undefined,
            recipeIngredients,
          },
        });
      } else {
        const stockItemId = crypto.randomUUID();
        const productId = crypto.randomUUID();
        const openingMovementId = crypto.randomUUID();
        const stockItem = {
          id: stockItemId,
          name: name.trim(),
          code: code.trim(),
          baseUnit,
          scanUnitQuantity: calculation!.pkg.baseQuantity,
          purchasePackages: [calculation!.pkg],
          averageUnitCost: calculation!.unitCost / 100,
          reorderLevel: 0,
        };
        result = await command('catalog.createWithOpeningStock', 'stockItems', stockItemId, {
          ...(setupKind === 'STOCKED' ? { product: await sellable(productId) } : {}),
          stockItem,
          locationId,
          startingQuantity: calculation!.opening,
          openingMovementId,
        });
      }
      if (result !== true) {
        setPendingReview(true);
        setError('The save was not confirmed. Check workspace status and Saved Changes before retrying; this form is locked to avoid a duplicate item.');
        return;
      }
      onClose();
    } catch (cause) {
      setError(operatorError(cause));
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setError('');
    if (step === 0 && (!name.trim() || !code.trim())) {
      setError('Enter an item name and code.');
      return;
    }
    if (step === 1 && setupKind !== 'STOCK_ONLY' && (!Number.isFinite(price) || price < 0)) {
      setError('Enter a valid selling price.');
      return;
    }
    if (step === 1 && setupKind === 'RECIPE' && (!outlets.length || recipeIngredients.length === 0)) {
      setError('A recipe item needs a service area and at least one recipe ingredient.');
      return;
    }
    if (step === 2 && setupKind !== 'RECIPE' && (!locationId || !calculation)) {
      setError('Choose a storage place and enter a valid package conversion.');
      return;
    }
    setStep(value => Math.min(3, value + 1));
  };

  const stepTitle = ['Identity', 'Selling', setupKind === 'RECIPE' ? 'Recipe' : 'Package & stock', 'Review'][step];
  return <Dialog title={`Smart item setup - ${stepTitle}`} onClose={busy ? () => undefined : onClose}>
    <div aria-disabled={pendingReview} className={`max-h-[min(70vh,620px)] space-y-4 overflow-y-auto pr-1 ${pendingReview ? 'pointer-events-none opacity-60' : ''}`}>
      {step === 0 && <div className="space-y-3">
        <label className="block text-sm">What are you setting up?
          <select className={input} value={setupKind} onChange={event => { const nextKind = event.target.value as SetupKind; setSetupKind(nextKind); if (nextKind === 'RECIPE') setItemType('DISH'); else if (nextKind === 'STOCKED') setItemType('DRINK'); }}>
            {canInventory && canCatalog && <option value="STOCKED">Sellable item with linked stock</option>}
            {canRecipe && <option value="RECIPE">Menu item made from a recipe</option>}
            {canInventory && <option value="STOCK_ONLY">Stock-only ingredient or supply</option>}
          </select>
        </label>
        <label className="block text-sm">Item name<input autoFocus className={input} value={name} onChange={event => {
          const value = event.target.value;
          setName(value);
          if (!codeEdited && !code) {
            const slug = value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 18);
            if (slug) setCode(`${slug}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`);
          }
        }}/></label>
        <label className="block text-sm">Item code<input className={input} value={code} onChange={event => { setCode(event.target.value.toUpperCase()); setCodeEdited(true); }}/></label>
        <label className="block text-sm">Barcode (optional)<input className={input} value={barcode} onChange={event => setBarcode(event.target.value.trim())}/></label>
      </div>}
      {step === 1 && setupKind !== 'STOCK_ONLY' && <div className="space-y-3">
        <label className="block text-sm">Item type
          <select className={input} value={itemType} onChange={event => setItemType(event.target.value)}>
            {setupKind === 'RECIPE' ? <><option value="DISH">Prepared dish</option><option value="COCKTAIL">Mixed drink</option></> : <><option value="DRINK">Drink / retail sale</option><option value="SPIRIT">Spirit bottle</option><option value="WINE">Wine bottle</option><option value="RETAIL">Packaged retail</option></>}
          </select>
        </label>
        <label className="block text-sm">Selling price (KES)<input className={input} type="number" min="0" step="0.01" value={price} onChange={event => setPrice(Number(event.target.value))}/></label>
        <label className="block text-sm">Category<input className={input} value={category} onChange={event => setCategory(event.target.value)}/></label>
        <label className="block text-sm">Preparation station<select className={input} value={routeTo} onChange={event => setRouteTo(event.target.value)}><option>BAR</option><option>KITCHEN</option><option>SERVICE</option></select></label>
        {setupKind === 'RECIPE' && <section className="space-y-3 rounded-lg border border-slate-700 p-3">
          <div><b>Recipe ingredients</b><p className="text-xs text-slate-400">Enter the amount used for one sale. ServOS converts it to the ingredient's stock unit; POS deducts the recipe instead of a linked item balance.</p></div>
          <div className="grid gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
            <select aria-label="Recipe stock ingredient" className={input} value={recipeStockId} onChange={event => {
              const id = event.target.value;
              const stock = stocks.find(item => item.id === id);
              const stockUnit = String(stock?.data.baseUnit || 'piece').toLowerCase();
              setRecipeStockId(id);
              setRecipeUnit(stockUnit === 'kg' ? 'kg' : stockUnit === 'g' ? 'g' : stockUnit === 'l' ? 'l' : stockUnit === 'ml' ? 'ml' : stockUnit === 'unit' ? 'piece' : stockUnit);
            }}>
              <option value="">Choose ingredient stock</option>
              {stocks.filter(stock => !recipeIngredients.some(line => line.stockItemId === stock.id)).map(stock => <option key={stock.id} value={stock.id}>{String(stock.data.name || stock.id)} - {String(stock.data.baseUnit || 'piece')}</option>)}
            </select>
            <input aria-label="Recipe ingredient quantity" className={input} type="number" min="0.000001" step="any" value={recipeQuantity} onChange={event => setRecipeQuantity(Number(event.target.value))}/>
            <select aria-label="Recipe amount unit" className={input} value={recipeUnit} onChange={event => setRecipeUnit(event.target.value)}>{recipeUnits.map(value => <option key={value} value={value}>{value}</option>)}</select>
            <button type="button" className={button} disabled={!selectedRecipeStock || !Number.isFinite(recipeQuantity) || recipeQuantity <= 0} onClick={addRecipeIngredient}>Add</button>
          </div>
          {recipeIngredients.map(line => {
            const stock = stocks.find(item => item.id === line.stockItemId);
            return <div key={line.stockItemId} className="flex items-center justify-between rounded bg-slate-950 p-2 text-sm"><span>{String(stock?.data.name || line.stockItemId)} - {line.quantity} {String(stock?.data.baseUnit || 'piece')} per sale</span><button type="button" className="text-rose-300" onClick={() => setRecipeIngredients(lines => lines.filter(item => item.stockItemId !== line.stockItemId))}>Remove</button></div>;
          })}
          {recipeIngredients.length > 0 && <p className="rounded bg-slate-950 p-2 text-sm">Estimated recipe cost per sale: <b>{Number.isFinite(recipeCostMinor) ? cash(recipeCostMinor / 100) : 'Review ingredient stock costs'}</b></p>}
          {recipeError && <p role="alert" className="text-sm text-rose-200">{recipeError}</p>}
        </section>}
      </div>}
      {step === 1 && setupKind === 'STOCK_ONLY' && <p className="rounded-lg border border-slate-700 p-3 text-sm text-slate-300">This item will be created as stock only and will not appear at the point of sale.</p>}
      {step === 2 && setupKind !== 'RECIPE' && <div className="space-y-3">
        <label className="block text-sm">Purchase package name<input className={input} value={purchaseName} onChange={event => setPurchaseName(event.target.value)}/></label>
        <label className="block text-sm">Number of units per package<input className={input} type="number" min="1" step="1" value={unitsPerPackage} onChange={event => setUnitsPerPackage(Number(event.target.value))}/></label>
        <div className="grid grid-cols-2 gap-2"><label className="block text-sm">Stock quantity in one unit<input className={input} type="number" min="0.000001" step="any" value={contents} onChange={event => setContents(Number(event.target.value))}/></label><label className="block text-sm">Measurement unit<select className={input} value={unit} onChange={event => setUnit(event.target.value)}>{['piece', 'g', 'kg', 'ml', 'l'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <label className="block text-sm">Purchase price per {purchaseName || 'package'} (KES)<input className={input} type="number" min="0" step="0.01" value={packageCost} onChange={event => setPackageCost(Number(event.target.value))}/></label>
        <label className="block text-sm">Opening packages on hand<input className={input} type="number" min="0" step="1" value={openingPackages} onChange={event => setOpeningPackages(Number(event.target.value))}/></label>
        <label className="block text-sm">Storage place<select className={input} value={locationId} onChange={event => setLocationId(event.target.value)}><option value="">Choose storage place</option>{locations.map(location => <option key={location.id} value={location.id}>{String(location.data.name || location.id)}</option>)}</select></label>
        {setupKind === 'STOCKED' && <label className="block text-sm">Stock quantity used for each sale<input className={input} type="number" min="0.000001" step="any" value={saleQuantity} onChange={event => setSaleQuantity(Number(event.target.value))}/></label>}
        {calculation && <div className="rounded-lg bg-slate-950 p-3 text-sm">One {purchaseName || 'package'} = {calculation.pkg.baseQuantity.toLocaleString()} {baseUnit} - opening stock {calculation.opening.toLocaleString()} {baseUnit} - cost {cash(calculation.unitCost / 100)} per {baseUnit}</div>}
      </div>}
      {step === 2 && setupKind === 'RECIPE' && <div className="space-y-2 rounded-lg border border-slate-700 p-4 text-sm"><h3 className="font-bold">Recipe check</h3><p>{recipeIngredients.length} ingredient(s) will be deducted for each sale.</p><p>Estimated cost per sale: {Number.isFinite(recipeCostMinor) ? cash(recipeCostMinor / 100) : 'Unavailable until valid ingredient costs are loaded.'}</p><p className="text-xs text-slate-400">The product is saved with its recipe and has no separate linked stock balance.</p></div>}
      {step === 3 && <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <h3 className="font-bold">Review before saving</h3><p>{name} - {code}</p>
        <p>{setupKind === 'STOCK_ONLY' ? 'Stock-only item' : `${setupKind === 'RECIPE' ? 'Recipe item' : 'Sellable at ' + cash(price)} - ${routeTo}`}</p>
        {setupKind === 'RECIPE' ? <p>{recipeIngredients.length} recipe ingredient(s); estimated cost {Number.isFinite(recipeCostMinor) ? cash(recipeCostMinor / 100) : 'unavailable'} per sale.</p> : <p>{calculation ? `${purchaseName}: ${calculation.pkg.baseQuantity} ${baseUnit} per package; ${openingPackages} packages opened as ${calculation.opening} ${baseUnit}.` : 'Package details are incomplete.'}</p>}
        <p className="text-xs text-slate-400">{setupKind === 'RECIPE' ? 'The validated product.save command records the menu item and recipe. Ingredient stock is consumed when the order is fired.' : 'The server creates the catalog record, stock master, link, and optional opening movement atomically. A rejection leaves all of them unchanged.'}</p>
      </div>}
      {error && <p role="alert" className="rounded-lg border border-rose-800 p-3 text-sm text-rose-200">{error}</p>}
    </div>
    <div className="mt-4 flex justify-between gap-2 border-t border-slate-800 pt-3">
      <button type="button" className={button} disabled={busy || pendingReview || step === 0} onClick={() => setStep(value => Math.max(0, value - 1))}>Back</button>
      {step < 3 ? <button type="button" className={primary} disabled={disabled || busy || pendingReview} onClick={next}>Continue</button> : <button type="button" className={primary} disabled={disabled || busy || pendingReview || setupKind === 'RECIPE' && (!outlets.length || !recipeIngredients.length) || setupKind !== 'RECIPE' && (!calculation || !locationId || setupKind === 'STOCKED' && !outlets.length)} onClick={() => void save()}>{busy ? 'Saving item...' : pendingReview ? 'Check save status' : setupKind === 'RECIPE' ? 'Save recipe item' : 'Save item and opening stock'}</button>}
    </div>
  </Dialog>;
}
