import React, { useMemo, useState } from 'react';
import { ActionDialog } from './ActionDialog';
import { fieldClass, primaryButtonClass, buttonClass, money } from './records';
import { canonicalizeMeasurement } from '../utils/inventoryUnits';

type Serving = { id: string; name: string; quantity: number; price: number };
type Props = {
  stocks: any[];
  products: any[];
  outlets: any[];
  locations: any[];
  variantOnly?: boolean;
  onSave: (value: any) => Promise<void>;
  onCreateWithStock: (value: any) => Promise<void>;
  onClose: () => void;
};

const packages = ['Bottle', 'Can', 'PET Bottle', 'Carton', 'Packet', 'Keg', 'Box', 'Bag', 'Piece', 'Other'];
const canonicalSize = (quantity: number, unit: string) => {
  try { return canonicalizeMeasurement(quantity, unit); }
  catch { return { quantity: Number.NaN, unit: '' }; }
};

export function QuickProductDialog({ stocks, products, outlets, locations, variantOnly = false, onSave, onCreateWithStock, onClose }: Props) {
  const [kind, setKind] = useState('DRINK');
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [category, setCategory] = useState('Drinks');
  const [routeTo, setRouteTo] = useState('BAR');
  const [taxClassId, setTaxClassId] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [physical, setPhysical] = useState(variantOnly);
  const [familyId, setFamilyId] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [packageType, setPackageType] = useState('Bottle');
  const [containerQuantity, setContainerQuantity] = useState(750);
  const [containerUnit, setContainerUnit] = useState('ml');
  const [tracked, setTracked] = useState(false);
  const [createStock, setCreateStock] = useState(false);
  const [stockName, setStockName] = useState('');
  const [stockCode, setStockCode] = useState('');
  const [stockLocationId, setStockLocationId] = useState(String(outlets[0]?.defaultStockLocationId || locations[0]?.id || ''));
  const [openingContainers, setOpeningContainers] = useState(0);
  const [averageUnitCost, setAverageUnitCost] = useState(0);
  const [stockItemId, setStockItemId] = useState('');
  const [wholeContainerQuantity, setWholeContainerQuantity] = useState(1);
  const [servings, setServings] = useState<Serving[]>([]);
  const [servingName, setServingName] = useState('Single');
  const [servingQuantity, setServingQuantity] = useState(30);
  const [servingPrice, setServingPrice] = useState(0);

  const families = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const product of products) {
      if (!product.productFamilyId) continue;
      const rows = grouped.get(product.productFamilyId) || [];
      rows.push(product);
      grouped.set(product.productFamilyId, rows);
    }
    return [...grouped.entries()].map(([id, rows]) => ({ id, rows, name: rows[0].productFamilyName || rows[0].name }));
  }, [products]);
  const selectedFamily = families.find(family => family.id === familyId);
  const reservedStockIds = selectedFamily?.rows.map((product: any) => product.stockItemId).filter(Boolean) || [];
  const normalizedSize = canonicalSize(containerQuantity, containerUnit);
  const variantLabel = `${normalizedSize.quantity} ${normalizedSize.unit} ${packageType.toLowerCase()}`;
  const duplicateVariant = Boolean(selectedFamily?.rows.some((product: any) => String(product.variantLabel || '').toLowerCase() === variantLabel.toLowerCase()));
  const selectedStock = stocks.find(stock => stock.id === stockItemId);
  const stockBaseUnit = physical ? normalizedSize.unit : 'piece';
  const stockQuantityPerContainer = physical ? Number(wholeContainerQuantity) : 1;
  const openingStockQuantity = Number(openingContainers) * stockQuantityPerContainer;

  const updateName = (value: string) => {
    setName(value);
    if (!codeEdited) {
      const slug = value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 20);
      setCode(slug ? `${slug}-${crypto.randomUUID().slice(0, 4).toUpperCase()}` : '');
    }
  };
  const configureKind = (next: string) => {
    setKind(next);
    if (next === 'FOOD') { setCategory('Food'); setRouteTo('KITCHEN'); }
    else if (next === 'RETAIL') { setCategory('Retail'); setRouteTo('SERVICE'); }
    else if (next === 'SERVICE') { setCategory('Services'); setRouteTo('SERVICE'); }
    else { setCategory('Drinks'); setRouteTo('BAR'); }
  };
  const chooseFamily = (id: string) => {
    setFamilyId(id);
    const family = families.find(item => item.id === id);
    if (!family) return;
    const source = family.rows[0];
    const displayName = String(source.productFamilyName || source.name);
    setPhysical(true); setFamilyName(displayName); setName(displayName);
    setCategory(source.category || 'Drinks'); setRouteTo(source.routeTo || 'BAR');
    setPackageType(source.packageType || 'Bottle'); setKind(source.routeTo === 'KITCHEN' ? 'FOOD' : 'DRINK');
    if (!codeEdited) { const slug = displayName.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 20); setCode(slug ? `${slug}-${crypto.randomUUID().slice(0, 4).toUpperCase()}` : ''); }
  };
  const addServing = () => {
    if (!servingName.trim() || !Number.isFinite(servingQuantity) || servingQuantity <= 0 || servingPrice < 0) return;
    setServings(rows => [...rows, { id: crypto.randomUUID(), name: servingName.trim(), quantity: servingQuantity, price: servingPrice }]);
    setServingName('');
  };
  const submit = () => {
    const productName = physical ? `${familyName.trim() || name.trim()} ${variantLabel}` : name.trim();
    const portions = physical ? [
      { id: crypto.randomUUID(), name: `Whole ${packageType.toLowerCase()}`, volume: Number(wholeContainerQuantity), price: Number(price) },
      ...servings.map(serving => ({ id: serving.id, name: serving.name, volume: Number(serving.quantity), price: Number(serving.price) })),
    ] : [];
    const product = {
      id: '', name: productName, code: code.trim(), price: Number(price), category, routeTo,
      stockItemId: tracked ? stockItemId : '', outletIds: outlets.map(outlet => outlet.id),
      taxClassId, favorite: false, barcode: barcode.trim(),
      productFamilyId: physical ? familyId || crypto.randomUUID() : undefined,
      productFamilyName: physical ? (familyName.trim() || name.trim()) : undefined,
      packageType: physical ? packageType : undefined,
      containerQuantity: physical ? Number(containerQuantity) : undefined,
      containerUnit: physical ? normalizedSize.unit : undefined,
      variantLabel: physical ? variantLabel : undefined,
      portionVolume: physical ? Number(wholeContainerQuantity) : undefined,
      portions, modifiers: [], recipeIngredients: [],
    };
    if (createStock) {
      const normalizedStockName = stockName.trim() || (physical ? `${familyName.trim() || name.trim()} ${variantLabel}` : name.trim());
      void onCreateWithStock({ product, stockItem: { name: normalizedStockName, code: stockCode.trim(), barcode: barcode.trim(), baseUnit: stockBaseUnit, scanUnitQuantity: stockQuantityPerContainer, averageUnitCost: Number(averageUnitCost), reorderLevel: 0 }, locationId: stockLocationId, startingQuantity: openingStockQuantity });
    } else void onSave(product);
  };
  const physicalValid = !physical || (familyName.trim() && packageType.trim() && Number.isFinite(containerQuantity) && containerQuantity > 0 && Number.isFinite(normalizedSize.quantity) && normalizedSize.quantity > 0 && Number.isFinite(wholeContainerQuantity) && wholeContainerQuantity > 0 && !duplicateVariant);
  const linkedStockAvailable = !tracked || (stockItemId && (!familyId || !reservedStockIds.includes(stockItemId)));
  const atomicStockValid = !createStock || (stockName.trim() && stockCode.trim() && stockLocationId && Number.isInteger(openingContainers) && openingContainers >= 0 && Number.isFinite(openingStockQuantity) && openingStockQuantity <= 1_000_000_000 && Number.isFinite(averageUnitCost) && averageUnitCost >= 0 && !(physical && servings.length > 0 && stockBaseUnit !== 'ml'));

  return <ActionDialog title={variantOnly ? 'Add another size' : 'Add product or menu item'} onClose={onClose}>
    <div className="space-y-4">
      {!variantOnly && <label className="block text-sm font-semibold">What are you adding?<select className={fieldClass + ' mt-1'} value={kind} onChange={event => configureKind(event.target.value)}><option value="DRINK">Drink</option><option value="FOOD">Food / kitchen item</option><option value="RETAIL">Retail / packaged item</option><option value="SERVICE">Service</option></select></label>}
      <label className="block text-sm font-semibold">{physical ? 'Product family name' : 'Name'}<input autoFocus className={fieldClass + ' mt-1'} value={physical ? familyName : name} onChange={event => { const value = event.target.value; setFamilyName(value); updateName(value); }} placeholder={kind === 'FOOD' ? 'e.g. Chicken and chips' : 'e.g. Jameson'}/></label>
      {!physical && <label className="block text-sm font-semibold">Selling price (KES)<input className={fieldClass + ' mt-1'} type="number" min="0" step="0.01" value={price} onChange={event => setPrice(Number(event.target.value))}/></label>}
      <label className="block text-sm font-semibold">Tax class<select required className={fieldClass + ' mt-1'} value={taxClassId} onChange={event => setTaxClassId(event.target.value)}><option value="">Select tax class…</option><option value="A_16">Standard · 16%</option><option value="B_0">Zero-rated · 0%</option><option value="C_EXEMPT">Exempt</option></select></label>
      <label className="block text-sm font-semibold">Send order to<select className={fieldClass + ' mt-1'} value={routeTo} onChange={event => setRouteTo(event.target.value)}><option value="BAR">Bar</option><option value="KITCHEN">Kitchen</option><option value="SERVICE">Service</option></select></label>
      {physical && <>
        <label className="block text-sm">Product family<select className={fieldClass + ' mt-1'} value={familyId} onChange={event => chooseFamily(event.target.value)}><option value="">{variantOnly?'Choose product family':'Create a new family'}</option>{families.map(family => <option key={family.id} value={family.id}>{family.name} · {family.rows.length} size(s)</option>)}</select></label>
        <div className="rounded-xl border border-slate-800 p-3"><h3 className="font-semibold">Physical size</h3><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-sm">Container<select className={fieldClass + ' mt-1'} value={packageType} onChange={event => setPackageType(event.target.value)}>{packages.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">Size<input className={fieldClass + ' mt-1'} type="number" min="0.001" step="any" value={containerQuantity} onChange={event => setContainerQuantity(Number(event.target.value))}/></label><label className="text-sm">Size unit<input className={fieldClass + ' mt-1'} value={containerUnit} onChange={event => setContainerUnit(event.target.value)}/></label><label className="text-sm">Whole-container stock quantity<input className={fieldClass + ' mt-1'} type="number" min="0.000001" step="any" value={wholeContainerQuantity} onChange={event => setWholeContainerQuantity(Number(event.target.value))}/></label></div><div className="mt-3 flex flex-wrap gap-2">{[200,250,330,350,500,700,750,1000].map(size => <button type="button" key={size} className={buttonClass} onClick={() => { setContainerQuantity(size); setContainerUnit('ml'); setWholeContainerQuantity(selectedStock?.baseUnit?.toLowerCase() === 'ml' ? size : 1); }}>{size === 1000 ? '1L' : `${size}ml`}</button>)}</div><p className="mt-2 text-xs text-slate-400">The stock quantity must use the linked stock item's count unit. A 750 ml bottle tracked in ml uses 750 here; tracked as whole bottles, use 1.</p></div>
        <div className="rounded-xl border border-slate-800 p-3"><h3 className="font-semibold">How do you sell this size?</h3><label className="mt-3 block text-sm">Whole-container selling price (KES)<input className={fieldClass + ' mt-1'} type="number" min="0" step="0.01" value={price} onChange={event => setPrice(Number(event.target.value))}/></label><div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><input aria-label="Serving name" className={fieldClass} value={servingName} onChange={event => setServingName(event.target.value)} placeholder="Single"/><input aria-label="Serving stock quantity" className={fieldClass} type="number" min="0.000001" step="any" value={servingQuantity} onChange={event => setServingQuantity(Number(event.target.value))}/><input aria-label="Serving price" className={fieldClass} type="number" min="0" step="0.01" value={servingPrice} onChange={event => setServingPrice(Number(event.target.value))}/><button type="button" className={buttonClass} onClick={addServing}>Add serving</button></div>{servings.length>0&&<ul className="mt-3 space-y-1 text-sm">{servings.map(serving=><li key={serving.id} className="flex justify-between"><span>{serving.name} · {serving.quantity} stock units</span><span>{money(serving.price)}</span></li>)}</ul>}<p className="mt-2 text-xs text-slate-400">Serving quantities must use the linked stock item's base unit (for example, 30 ml). Sale choices reuse the current audited portion and order-fire inventory path.</p></div>
      </>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={physical} disabled={variantOnly} onChange={event => setPhysical(event.target.checked)}/>This item has physical package sizes</label>
      <details className="rounded-xl border border-slate-800 p-3"><summary className="cursor-pointer text-sm font-semibold">More setup</summary><div className="mt-3 space-y-3"><label className="block text-sm">Category<input className={fieldClass + ' mt-1'} value={category} onChange={event => setCategory(event.target.value)}/></label><label className="block text-sm">Item code (generated; editable)<input className={fieldClass + ' mt-1 font-mono'} value={code} onChange={event => { setCode(event.target.value); setCodeEdited(true); }}/></label><label className="block text-sm">Variant barcode<input data-barcode-capture="true" className={fieldClass + ' mt-1 font-mono'} value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Scan or enter this size's barcode"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tracked} onChange={event => { const next=event.target.checked; setTracked(next); if(next)setCreateStock(false); }}/>Track sales against an existing stock item</label>{tracked&&<select aria-label="Stock item" className={fieldClass} value={stockItemId} onChange={event => { setStockItemId(event.target.value); const stock = stocks.find(item => item.id === event.target.value); if (stock?.baseUnit?.toLowerCase() === 'ml') setWholeContainerQuantity(Number(containerQuantity)); else setWholeContainerQuantity(1); }}><option value="">Choose stock item</option>{stocks.map(stock => <option key={stock.id} value={stock.id} disabled={Boolean(familyId && reservedStockIds.includes(stock.id) && stock.id !== stockItemId)}>{stock.name} · {stock.baseUnit}</option>)}</select>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createStock} onChange={event => {const next=event.target.checked;setCreateStock(next);if(next){setTracked(false);setStockName(physical?`${familyName.trim()||name.trim()} ${variantLabel}`:name.trim());setStockCode(code);if(physical)setWholeContainerQuantity(normalizedSize.quantity);}}}/>Create a stock item and starting quantity</label>{createStock&&<div className="space-y-3 rounded-xl border border-slate-800 p-3"><p className="text-xs text-slate-400">Product, stock record, link, and starting balance commit together. Starting quantity is entered as whole saleable containers and converted to {stockBaseUnit}.</p><label className="block text-sm">Stock item name<input className={fieldClass+' mt-1'} value={stockName} onChange={event=>{const value=event.target.value;setStockName(value);if(!stockCode){const slug=value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,20);setStockCode(slug?`${slug}-${crypto.randomUUID().slice(0,4).toUpperCase()}`:'');}}}/></label><label className="block text-sm">Storage place<select className={fieldClass+' mt-1'} value={stockLocationId} onChange={event=>setStockLocationId(event.target.value)}><option value="">Choose storage place</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="block text-sm">Starting containers<input className={fieldClass+' mt-1'} type="number" min="0" step="1" value={openingContainers} onChange={event=>setOpeningContainers(Number(event.target.value))}/></label><label className="block text-sm">Average cost per {stockBaseUnit} (KES)<input className={fieldClass+' mt-1'} type="number" min="0" step="0.01" value={averageUnitCost} onChange={event=>setAverageUnitCost(Number(event.target.value))}/></label><label className="block text-sm">Stock item code<input className={fieldClass+' mt-1 font-mono'} value={stockCode} onChange={event=>setStockCode(event.target.value)}/></label>{physical&&servings.length>0&&stockBaseUnit!=='ml'&&<p role="alert" className="text-sm text-amber-200">Measured servings require a stock item counted in ml.</p>}</div>}{physical&&familyId&&<p className="text-xs text-slate-400">Each size is a separate sellable product. Choose a different stock item for each size so inventory stays separate.</p>}</div></details>
      {duplicateVariant&&<p role="alert" className="text-sm text-rose-200">This family already has a {variantLabel} variant.</p>}
      {physical&&tracked&&selectedStock&&servings.length>0&&selectedStock.baseUnit?.toLowerCase()!=='ml'&&<p role="alert" className="text-sm text-amber-200">This stock item is counted in {selectedStock.baseUnit}. Use a stock item counted in ml for measured serving quantities.</p>}
      <button className={primaryButtonClass + ' w-full'} disabled={!name.trim()||!code.trim()||!taxClassId||price<0||outlets.length===0||!physicalValid||!linkedStockAvailable||!atomicStockValid||(variantOnly&&!familyId)||(tracked&&!stockItemId)||(physical&&tracked&&servings.length>0&&selectedStock?.baseUnit?.toLowerCase()!=='ml')} onClick={submit}>{createStock?'Add item and starting stock':physical?'Add size':'Add item'}</button>
      {outlets.length===0&&<p role="status" className="text-sm text-amber-200">Add a service area in setup before creating sellable items.</p>}
    </div>
  </ActionDialog>;
}
