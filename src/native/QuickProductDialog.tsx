import React, { useEffect, useMemo, useState } from 'react';
import { ActionDialog } from './ActionDialog';
import { fieldClass, primaryButtonClass, buttonClass, money } from './records';
import { calculateBatchUnitCost, calculateRecipeCost, canonicalizeMeasurement, costPerCanonicalUnit, SMART_ITEM_PRESETS, type SmartItemType } from '../utils/inventoryUnits';

type Serving = { id: string; name: string; quantity: number; price: number };
type RecipeLine = { stockItemId: string; quantity: number };
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
  const [physical, setPhysical] = useState(!variantOnly);
  const [familyId, setFamilyId] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [packageType, setPackageType] = useState(variantOnly?'Bottle':'Can');
  const [containerQuantity, setContainerQuantity] = useState(variantOnly?750:330);
  const [containerUnit, setContainerUnit] = useState('ml');
  const [tracked, setTracked] = useState(false);
  const [createStock, setCreateStock] = useState(false);
  const [stockName, setStockName] = useState('');
  const [stockCode, setStockCode] = useState('');
  const [purchasePackageName, setPurchasePackageName] = useState('Case');
  const [unitsPerPackage, setUnitsPerPackage] = useState(variantOnly?1:24);
  const [purchasePackageCost, setPurchasePackageCost] = useState(0);
  const [stockLocationId, setStockLocationId] = useState(String(outlets[0]?.defaultStockLocationId || locations[0]?.id || ''));
  const [openingContainers, setOpeningContainers] = useState(0);
  const [averageUnitCost, setAverageUnitCost] = useState(0);
  const [stockItemId, setStockItemId] = useState('');
  const [wholeContainerQuantity, setWholeContainerQuantity] = useState(1);
  const [servings, setServings] = useState<Serving[]>([]);
  const [servingName, setServingName] = useState('Single');
  const [servingQuantity, setServingQuantity] = useState(30);
  const [servingPrice, setServingPrice] = useState(0);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeLine[]>([]);
  const [recipeStockId, setRecipeStockId] = useState('');
  const [recipeQuantity, setRecipeQuantity] = useState(1);
  const [batchYield, setBatchYield] = useState(1);
  const [wizardStep, setWizardStep] = useState(0);

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
  const stockBaseUnit = tracked&&selectedStock ? String(selectedStock.baseUnit||'piece') : SMART_ITEM_PRESETS[kind as SmartItemType].baseUnit || (physical?normalizedSize.unit:'piece');
  const stockQuantityPerContainer = physical ? Number(wholeContainerQuantity) : 1;
  const purchasePackageQuantity = stockQuantityPerContainer*Number(unitsPerPackage);
  const openingStockQuantity = Number(openingContainers) * purchasePackageQuantity;
  useEffect(()=>{if(createStock&&!tracked){try{setAverageUnitCost(costPerCanonicalUnit(Math.round(purchasePackageCost*100),purchasePackageQuantity,stockBaseUnit)/100)}catch{setAverageUnitCost(Number.NaN)}}},[createStock,tracked,purchasePackageCost,purchasePackageQuantity,stockBaseUnit]);
  useEffect(()=>{if(createStock&&physical&&!tracked)setWholeContainerQuantity(stockBaseUnit==='ml'?normalizedSize.quantity:1)},[createStock,physical,tracked,stockBaseUnit,normalizedSize.quantity]);

  const updateName = (value: string) => {
    setName(value);
    if (!codeEdited) {
      const slug = value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 20);
      setCode(slug ? `${slug}-${crypto.randomUUID().slice(0, 4).toUpperCase()}` : '');
    }
  };
  const configureKind = (next: SmartItemType) => {
    setKind(next);
    if (['FOOD','DISH','BATCH','WEIGHT_INGREDIENT','COUNT_INGREDIENT'].includes(next)) { setCategory('Food'); setRouteTo('KITCHEN'); }
    else if (next === 'RETAIL') { setCategory('Retail'); setRouteTo('SERVICE'); }
    else if (next === 'SERVICE') { setCategory('Services'); setRouteTo('SERVICE'); }
    else { setCategory('Drinks'); setRouteTo('BAR'); }
    setPhysical(['DRINK','SPIRIT','WINE','KEG','RETAIL'].includes(next));
    if(['FOOD','DISH','BATCH'].includes(next)){setCreateStock(false);setTracked(false)}
    if(next==='WEIGHT_INGREDIENT'){setCreateStock(true);setPurchasePackageName('Bag');setUnitsPerPackage(1000)}
    else if(next==='COUNT_INGREDIENT'){setCreateStock(true);setPurchasePackageName('Pack');setUnitsPerPackage(12)}
    else if(next==='DRINK'){setPurchasePackageName('Case');setUnitsPerPackage(24)}
    else if(next==='SPIRIT'||next==='WINE'){setPurchasePackageName('Case');setUnitsPerPackage(12)}
    if(next==='DRINK'){setPackageType('Can');setContainerQuantity(330);setContainerUnit('ml');setWholeContainerQuantity(1)}
    else if(next==='SPIRIT'||next==='WINE'){setPackageType('Bottle');setContainerQuantity(750);setContainerUnit('ml');setWholeContainerQuantity(750)}
    else if(next==='KEG'){setPackageType('Keg');setContainerQuantity(50000);setContainerUnit('ml');setWholeContainerQuantity(50000)}
    else if(next==='RETAIL'){setPackageType('Piece');setContainerQuantity(1);setContainerUnit('piece');setWholeContainerQuantity(1)}
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
  const recipeCosts = recipeIngredients.map(line => {
    const stock = stocks.find(item => item.id === line.stockItemId);
    const unitCost = Number(stock?.averageUnitCost);
    return { quantity: line.quantity, averageCostMinor: Number.isFinite(unitCost) ? Math.round(unitCost * 100) : Number.NaN };
  });
  const recipeCostMinor = (() => { try { if(recipeCosts.some(line=>!Number.isSafeInteger(line.averageCostMinor)))return Number.NaN;return calculateRecipeCost(recipeCosts); } catch { return Number.NaN; } })();
  const recipeUnitCostMinor = kind==='BATCH' ? (()=>{try{return calculateBatchUnitCost(recipeCosts,batchYield)}catch{return Number.NaN}})() : recipeCostMinor;
  const addRecipeIngredient = () => {
    if (!recipeStockId || !Number.isFinite(recipeQuantity) || recipeQuantity <= 0 || recipeIngredients.some(line => line.stockItemId === recipeStockId)) return;
    setRecipeIngredients(lines => [...lines, { stockItemId: recipeStockId, quantity: recipeQuantity }]);
    setRecipeStockId(''); setRecipeQuantity(1);
  };
  const submit = () => {
    const stockOnly = kind==='WEIGHT_INGREDIENT'||kind==='COUNT_INGREDIENT';
    const productName = physical ? `${familyName.trim() || name.trim()} ${variantLabel}` : name.trim();
    const portions = physical ? [
      { id: crypto.randomUUID(), name: `Whole ${packageType.toLowerCase()}`, volume: Number(wholeContainerQuantity), price: Number(price) },
      ...servings.map(serving => ({ id: serving.id, name: serving.name, volume: Number(serving.quantity), price: Number(serving.price) })),
    ] : [];
    const product = stockOnly ? undefined : {
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
      portions, modifiers: [], recipeIngredients: recipeIngredients.map(line => ({ ...line, quantity: kind==='BATCH'?line.quantity/batchYield:line.quantity, tracked: true })), ...(kind==='BATCH'?{recipeYield:batchYield,recipeBatchCostMinor:Number.isFinite(recipeCostMinor)?Math.round(recipeCostMinor):undefined}:{}),
    };
    if (createStock) {
      const normalizedStockName = stockName.trim() || (physical ? `${familyName.trim() || name.trim()} ${variantLabel}` : name.trim());
      void onCreateWithStock({ ...(product?{product}:{}), stockItem: { name: normalizedStockName, code: stockCode.trim()||code.trim(), barcode: barcode.trim(), baseUnit: stockBaseUnit, scanUnitQuantity: purchasePackageQuantity, averageUnitCost: Number(averageUnitCost), reorderLevel: 0 }, locationId: stockLocationId, startingQuantity: openingStockQuantity });
    } else if(product) void onSave(product);
  };
  const physicalValid = !physical || (familyName.trim() && packageType.trim() && Number.isFinite(containerQuantity) && containerQuantity > 0 && Number.isFinite(normalizedSize.quantity) && normalizedSize.quantity > 0 && Number.isFinite(wholeContainerQuantity) && wholeContainerQuantity > 0 && !duplicateVariant);
  const linkedStockAvailable = !tracked || (stockItemId && (!familyId || !reservedStockIds.includes(stockItemId)));
  const atomicStockValid = !createStock || ((stockName.trim()||name.trim()) && (stockCode.trim()||code.trim()) && purchasePackageName.trim() && Number.isInteger(unitsPerPackage)&&unitsPerPackage>0&&Number.isFinite(purchasePackageCost)&&purchasePackageCost>=0&&stockLocationId && Number.isInteger(openingContainers) && openingContainers >= 0 && Number.isFinite(openingStockQuantity) && openingStockQuantity <= 1_000_000_000 && Number.isFinite(averageUnitCost) && averageUnitCost >= 0 && !(physical && servings.length > 0 && stockBaseUnit !== 'ml'));

  const stepTitles = variantOnly ? ['Product size', 'Selling behavior', 'Stock setup', 'Review'] : ['Item identity', 'Selling behavior', 'Stock setup', 'Review'];
  const stockOnly = kind==='WEIGHT_INGREDIENT'||kind==='COUNT_INGREDIENT';
  const recipeItem = ['FOOD','DISH','BATCH'].includes(kind);
  const stepBlocked = wizardStep===0 ? !name.trim()||!code.trim() : wizardStep===1 ? (!stockOnly&&(!taxClassId||price<0||outlets.length===0||!physicalValid))||(recipeItem&&recipeIngredients.length===0)||(kind==='BATCH'&&(!Number.isInteger(batchYield)||batchYield<1)) : wizardStep===2 ? (stockOnly&&!createStock)||(recipeItem&&(createStock||tracked))||!linkedStockAvailable||!atomicStockValid||(tracked&&!stockItemId) : !name.trim()||!code.trim()||(!stockOnly&&(!taxClassId||price<0||outlets.length===0||!physicalValid))||!linkedStockAvailable||!atomicStockValid||(stockOnly&&!createStock)||(recipeItem&&(createStock||tracked))||(tracked&&!stockItemId)||(recipeItem&&recipeIngredients.length===0)||(kind==='BATCH'&&(!Number.isInteger(batchYield)||batchYield<1))||(variantOnly&&!familyId);
  const reviewName = physical ? `${familyName.trim()||name.trim()} ${variantLabel}` : name.trim();

  return <ActionDialog title={variantOnly ? 'Add another size' : `Smart Item Wizard · ${stepTitles[wizardStep]} (${wizardStep+1}/4)`} onClose={onClose}>
    <div className="space-y-4">
      <ol aria-label="Item setup progress" className="grid grid-cols-4 gap-1 text-center text-[10px] sm:text-xs">{stepTitles.map((title,index)=><li key={title} aria-current={wizardStep===index?'step':undefined} className={`rounded-lg px-1 py-2 ${wizardStep===index?'bg-amber-400 font-bold text-slate-950':'bg-slate-800 text-slate-400'}`}>{index+1}. {title}</li>)}</ol>
      <div hidden={wizardStep!==0}>
      {!variantOnly && <label className="block text-sm font-semibold">What are you adding?<select className={fieldClass + ' mt-1'} value={kind} onChange={event => configureKind(event.target.value as SmartItemType)}>{Object.entries(SMART_ITEM_PRESETS).map(([value,preset])=><option key={value} value={value}>{preset.label}</option>)}</select></label>}
      <label className="block text-sm font-semibold">{physical ? 'Product family name' : 'Name'}<input autoFocus className={fieldClass + ' mt-1'} value={physical ? familyName : name} onChange={event => { const value = event.target.value; setFamilyName(value); updateName(value); }} placeholder={recipeItem ? 'e.g. Chicken and chips' : 'e.g. Jameson'}/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={physical} disabled={variantOnly} onChange={event => setPhysical(event.target.checked)}/>This item has physical package sizes</label>
      </div>
      <div hidden={wizardStep!==1}>
      {stockOnly&&<p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">This is an ingredient stock item, not a sellable menu item. It will be stored in {stockBaseUnit}; set the supplier package and opening quantity in the next step. No sale price or tax class is needed.</p>}
      {!stockOnly&&!physical && <label className="block text-sm font-semibold">Selling price (KES)<input className={fieldClass + ' mt-1'} type="number" min="0" step="0.01" value={price} onChange={event => setPrice(Number(event.target.value))}/></label>}
      {!stockOnly&&<label className="block text-sm font-semibold">Tax class<select required className={fieldClass + ' mt-1'} value={taxClassId} onChange={event => setTaxClassId(event.target.value)}><option value="">Select tax class…</option><option value="A_16">Standard · 16%</option><option value="B_0">Zero-rated · 0%</option><option value="C_EXEMPT">Exempt</option></select></label>}
      {!stockOnly&&<label className="block text-sm font-semibold">Send order to<select className={fieldClass + ' mt-1'} value={routeTo} onChange={event => setRouteTo(event.target.value)}><option value="BAR">Bar</option><option value="KITCHEN">Kitchen</option><option value="SERVICE">Service</option></select></label>}
      {physical && <>
        <label className="block text-sm">Product family<select className={fieldClass + ' mt-1'} value={familyId} onChange={event => chooseFamily(event.target.value)}><option value="">{variantOnly?'Choose product family':'Create a new family'}</option>{families.map(family => <option key={family.id} value={family.id}>{family.name} · {family.rows.length} size(s)</option>)}</select></label>
      <div className="rounded-xl border border-slate-800 p-3"><h3 className="font-semibold">Physical size</h3><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-sm">Container<select className={fieldClass + ' mt-1'} value={packageType} onChange={event => setPackageType(event.target.value)}>{packages.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">Container contents<input className={fieldClass + ' mt-1'} type="number" min="0.001" step="any" value={containerQuantity} onChange={event => setContainerQuantity(Number(event.target.value))}/></label><label className="text-sm">Contents unit<input className={fieldClass + ' mt-1'} value={containerUnit} onChange={event => setContainerUnit(event.target.value)}/></label><label className="text-sm">Stock quantity per container ({stockBaseUnit})<input className={fieldClass + ' mt-1'} type="number" min="0.000001" step="any" value={wholeContainerQuantity} onChange={event => setWholeContainerQuantity(Number(event.target.value))}/></label></div><div className="mt-3 flex flex-wrap gap-2">{[200,250,330,350,500,700,750,1000].map(size => <button type="button" key={size} className={buttonClass} onClick={() => { setContainerQuantity(size); setContainerUnit('ml'); setWholeContainerQuantity(stockBaseUnit==='ml'?size:1); }}>{size === 1000 ? '1L' : `${size}ml`}</button>)}</div><p className="mt-2 text-xs text-slate-400">Physical contents are descriptive; stock deductions use {stockBaseUnit}. For example, a can may contain 330 ml while inventory tracks one can.</p></div>
        <div className="rounded-xl border border-slate-800 p-3"><h3 className="font-semibold">How do you sell this size?</h3><label className="mt-3 block text-sm">Whole-container selling price (KES)<input className={fieldClass + ' mt-1'} type="number" min="0" step="0.01" value={price} onChange={event => setPrice(Number(event.target.value))}/></label><div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><input aria-label="Serving name" className={fieldClass} value={servingName} onChange={event => setServingName(event.target.value)} placeholder="Single"/><input aria-label="Serving stock quantity" className={fieldClass} type="number" min="0.000001" step="any" value={servingQuantity} onChange={event => setServingQuantity(Number(event.target.value))}/><input aria-label="Serving price" className={fieldClass} type="number" min="0" step="0.01" value={servingPrice} onChange={event => setServingPrice(Number(event.target.value))}/><button type="button" className={buttonClass} onClick={addServing}>Add serving</button></div>{servings.length>0&&<ul className="mt-3 space-y-1 text-sm">{servings.map(serving=><li key={serving.id} className="flex justify-between"><span>{serving.name} · {serving.quantity} stock units</span><span>{money(serving.price)}</span></li>)}</ul>}<p className="mt-2 text-xs text-slate-400">Serving quantities must use the linked stock item's base unit (for example, 30 ml). Sale choices reuse the current audited portion and order-fire inventory path.</p></div>
      </>}
      {recipeItem&&<section className="rounded-xl border border-slate-800 p-3"><h3 className="font-semibold">Recipe ingredients</h3><p className="mt-1 text-xs text-slate-400">Choose the stock item and physical quantity used for one sale. ServOS totals ingredient cost; the server deducts these quantities when the order is accepted.</p>{kind==='BATCH'&&<label className="mt-3 block text-sm">Number of portions this batch makes<input className={fieldClass+' mt-1'} type="number" min="1" step="1" value={batchYield} onChange={event=>setBatchYield(Number(event.target.value))}/></label>}{stocks.length===0?<p className="mt-2 text-sm text-amber-200">Add ingredient stock items before creating a recipe-based item.</p>:<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto]"><label className="text-sm">Ingredient<select className={fieldClass+' mt-1'} value={recipeStockId} onChange={event=>setRecipeStockId(event.target.value)}><option value="">Select stock item</option>{stocks.filter(stock=>!recipeIngredients.some(line=>line.stockItemId===stock.id)).map(stock=><option key={stock.id} value={stock.id}>{String(stock.name)} · {String(stock.baseUnit||'piece')}</option>)}</select></label><label className="text-sm">Amount used{kind==='BATCH'?' in full batch':''}<input className={fieldClass+' mt-1'} type="number" min="0.000001" step="any" value={recipeQuantity} onChange={event=>setRecipeQuantity(Number(event.target.value))}/></label><button type="button" className={buttonClass+' self-end'} disabled={!recipeStockId||!Number.isFinite(recipeQuantity)||recipeQuantity<=0} onClick={addRecipeIngredient}>Add</button></div>}{recipeIngredients.length>0&&<ul className="mt-3 space-y-2">{recipeIngredients.map(line=>{const stock=stocks.find(item=>item.id===line.stockItemId);return <li key={line.stockItemId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 p-2 text-sm"><span>{String(stock?.name||line.stockItemId)} · {line.quantity} {String(stock?.baseUnit||'piece')}</span><button type="button" className="text-rose-300" onClick={()=>setRecipeIngredients(lines=>lines.filter(item=>item.stockItemId!==line.stockItemId))}>Remove</button></li>})}</ul>}<p className="mt-3 text-sm">{kind==='BATCH'?'Calculated ingredient cost per sale portion':'Calculated ingredient cost per sale'}: <b>{Number.isFinite(recipeUnitCostMinor)?money(recipeUnitCostMinor/100):'Review ingredient quantities and costs'}</b></p>{recipeIngredients.length===0&&<p role="status" className="mt-2 text-xs text-amber-200">Add at least one ingredient before continuing.</p>}</section>}
      </div>
      <div hidden={wizardStep!==2}>
      <label className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"><input className="mt-1" type="checkbox" checked={createStock} onChange={event=>{const next=event.target.checked;setCreateStock(next);if(next){setTracked(false);setStockName(physical?`${familyName.trim()||name.trim()} ${variantLabel}`:name.trim());setStockCode(code)}}}/><span><b>Create stock and opening balance</b><span className="mt-1 block text-xs text-slate-400">Uses one atomic native save for item, stock master, and opening movement.</span></span></label>
      {recipeItem&&<p className="rounded-lg border border-slate-700 p-3 text-xs text-slate-400">Recipe ingredients are the stock source for this menu item. Create or link stock on each ingredient instead of adding a separate stock master for the dish.</p>}
      {recipeItem&&(createStock||tracked)&&<p role="alert" className="text-sm text-amber-200">Disable the separate stock link for a recipe item; the recipe lines control its stock deductions.</p>}
      {createStock&&<section className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"><h3 className="font-semibold">Purchase package and opening stock</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">What do you buy?<input className={fieldClass+' mt-1'} value={purchasePackageName} onChange={event=>setPurchasePackageName(event.target.value)} placeholder="Case, bottle, sack"/></label><label className="text-sm">{stockOnly?`Stock units per package (${stockBaseUnit})`:'Sale containers in one package'}<input className={fieldClass+' mt-1'} type="number" min="1" step="1" value={unitsPerPackage} onChange={event=>setUnitsPerPackage(Number(event.target.value))}/></label><label className="text-sm">Price per package (KES)<input className={fieldClass+' mt-1'} type="number" min="0" step="0.01" value={purchasePackageCost} onChange={event=>setPurchasePackageCost(Number(event.target.value))}/></label><label className="text-sm">Opening packages on hand<input className={fieldClass+' mt-1'} type="number" min="0" step="1" value={openingContainers} onChange={event=>setOpeningContainers(Number(event.target.value))}/></label><label className="text-sm">Storage place<select className={fieldClass+' mt-1'} value={stockLocationId} onChange={event=>setStockLocationId(event.target.value)}><option value="">Choose storage place</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div><div className="rounded-lg bg-slate-950 p-3 text-sm"><p>{stockOnly?`${purchasePackageName||'Package'} contains ${purchasePackageQuantity.toLocaleString()} ${stockBaseUnit}`:`${unitsPerPackage} sale container(s) per ${purchasePackageName||'package'} · ${purchasePackageQuantity.toLocaleString()} ${stockBaseUnit} received per scan`}</p><p className="mt-1">Opening balance: {openingStockQuantity.toLocaleString()} {stockBaseUnit}</p><p className="mt-1">Derived average cost: {Number.isFinite(averageUnitCost)?money(averageUnitCost):'Enter a valid package size and price'} per {stockBaseUnit}</p></div></section>}
      <details className="rounded-xl border border-slate-800 p-3"><summary className="cursor-pointer text-sm font-semibold">More setup</summary><div className="mt-3 space-y-3"><label className="block text-sm">Category<input className={fieldClass + ' mt-1'} value={category} onChange={event => setCategory(event.target.value)}/></label><label className="block text-sm">Item code (generated; editable)<input className={fieldClass + ' mt-1 font-mono'} value={code} onChange={event => { setCode(event.target.value); setCodeEdited(true); }}/></label><label className="block text-sm">Variant barcode<input data-barcode-capture="true" className={fieldClass + ' mt-1 font-mono'} value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Scan or enter this size's barcode"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tracked} onChange={event => { const next=event.target.checked; setTracked(next); if(next)setCreateStock(false); }}/>Track sales against an existing stock item</label>{tracked&&<select aria-label="Stock item" className={fieldClass} value={stockItemId} onChange={event => { setStockItemId(event.target.value); const stock = stocks.find(item => item.id === event.target.value); if (stock?.baseUnit?.toLowerCase() === 'ml') setWholeContainerQuantity(Number(containerQuantity)); else setWholeContainerQuantity(1); }}><option value="">Choose stock item</option>{stocks.map(stock => <option key={stock.id} value={stock.id} disabled={Boolean(familyId && reservedStockIds.includes(stock.id) && stock.id !== stockItemId)}>{stock.name} · {stock.baseUnit}</option>)}</select>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createStock} onChange={event => {const next=event.target.checked;setCreateStock(next);if(next){setTracked(false);setStockName(physical?`${familyName.trim()||name.trim()} ${variantLabel}`:name.trim());setStockCode(code);if(physical)setWholeContainerQuantity(normalizedSize.quantity);}}}/>Create a stock item and starting quantity</label>{createStock&&<div className="space-y-3 rounded-xl border border-slate-800 p-3"><p className="text-xs text-slate-400">Product, stock record, link, and starting balance commit together. Starting quantity is entered as whole saleable containers and converted to {stockBaseUnit}.</p><label className="block text-sm">Stock item name<input className={fieldClass+' mt-1'} value={stockName} onChange={event=>{const value=event.target.value;setStockName(value);if(!stockCode){const slug=value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,20);setStockCode(slug?`${slug}-${crypto.randomUUID().slice(0,4).toUpperCase()}`:'');}}}/></label><label className="block text-sm">Storage place<select className={fieldClass+' mt-1'} value={stockLocationId} onChange={event=>setStockLocationId(event.target.value)}><option value="">Choose storage place</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label className="block text-sm">Starting containers<input className={fieldClass+' mt-1'} type="number" min="0" step="1" value={openingContainers} onChange={event=>setOpeningContainers(Number(event.target.value))}/></label><label className="block text-sm">Average cost per {stockBaseUnit} (KES)<input className={fieldClass+' mt-1'} type="number" min="0" step="0.01" value={averageUnitCost} onChange={event=>setAverageUnitCost(Number(event.target.value))}/></label><label className="block text-sm">Stock item code<input className={fieldClass+' mt-1 font-mono'} value={stockCode} onChange={event=>setStockCode(event.target.value)}/></label>{physical&&servings.length>0&&stockBaseUnit!=='ml'&&<p role="alert" className="text-sm text-amber-200">Measured servings require a stock item counted in ml.</p>}</div>}{physical&&familyId&&<p className="text-xs text-slate-400">Each size is a separate sellable product. Choose a different stock item for each size so inventory stays separate.</p>}</div></details>
      </div>
      {wizardStep===3&&<section className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" aria-label="Review item"><h3 className="font-bold">Review before saving</h3><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-slate-400">{stockOnly?'Stock item':'Item'}</dt><dd>{reviewName||'Unnamed item'} · {code||'Code not set'}</dd>{!stockOnly&&<><dt className="text-slate-400">Sale</dt><dd>{money(price)} · {routeTo} · tax {taxClassId||'not selected'}</dd></>}{recipeItem&&<><dt className="text-slate-400">Recipe</dt><dd>{recipeIngredients.length} ingredient(s) · per sale cost {Number.isFinite(recipeUnitCostMinor)?money(recipeUnitCostMinor/100):'unavailable'}{kind==='BATCH'?` · ${batchYield} portions per batch`:''}</dd></>}{physical&&<><dt className="text-slate-400">Package size</dt><dd>{containerQuantity} {containerUnit} · {wholeContainerQuantity} {stockBaseUnit} per container</dd><dt className="text-slate-400">Sale formats</dt><dd>{servings.length?servings.map(serving=>`${serving.name}: ${serving.quantity} ${stockBaseUnit} at ${money(serving.price)}`).join(' · '):`Whole ${packageType.toLowerCase()}: ${money(price)}`}</dd></>}{createStock&&<><dt className="text-slate-400">Opening stock</dt><dd>{openingStockQuantity.toLocaleString()} {stockBaseUnit} at {money(averageUnitCost)} per unit</dd><dt className="text-slate-400">Storage place</dt><dd>{locations.find(location=>location.id===stockLocationId)?.name||'Not selected'}</dd></>}{tracked&&<><dt className="text-slate-400">Stock link</dt><dd>{selectedStock?.name||'Not selected'}</dd></>}</dl><p className="text-xs text-slate-400">The terminal saves these records atomically. A rejected save leaves all created records and movements unchanged.</p></section>}
      {wizardStep===3&&createStock&&<p className="-mt-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Purchase package: {purchasePackageName} · {stockOnly?`${purchasePackageQuantity} ${stockBaseUnit}`:`${unitsPerPackage} sale container(s)`} · {money(purchasePackageCost)} per package · {money(averageUnitCost)} per {stockBaseUnit}.</p>}
      {duplicateVariant&&<p role="alert" className="text-sm text-rose-200">This family already has a {variantLabel} variant.</p>}
      {physical&&tracked&&selectedStock&&servings.length>0&&selectedStock.baseUnit?.toLowerCase()!=='ml'&&<p role="alert" className="text-sm text-amber-200">This stock item is counted in {selectedStock.baseUnit}. Use a stock item counted in ml for measured serving quantities.</p>}
      <div className="flex gap-2"><button type="button" className={buttonClass+' flex-1'} disabled={wizardStep===0} onClick={()=>setWizardStep(step=>Math.max(0,step-1))}>Back</button><button type="button" className={primaryButtonClass+' flex-1'} disabled={stepBlocked||(wizardStep===1&&physical&&tracked&&servings.length>0&&selectedStock?.baseUnit?.toLowerCase()!=='ml')} onClick={()=>wizardStep===3?submit():setWizardStep(step=>Math.min(3,step+1))}>{wizardStep===3?(stockOnly?'Save stock item and opening balance':createStock?'Save item and opening stock':physical?'Save item size':'Save item'):'Continue'}</button></div>
      {outlets.length===0&&<p role="status" className="text-sm text-amber-200">Add a service area in setup before creating sellable items.</p>}
    </div>
  </ActionDialog>;
}
