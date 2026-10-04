import React, { useEffect, useState } from 'react';
import { parseCatalogCsv } from './csvImport';
import { useRuntime } from '../runtime/RuntimeProvider';
import { recordsOf, recordOf, fieldClass, buttonClass, primaryButtonClass, money } from './records';
import { ActionDialog } from './ActionDialog';
import { domainErrorMessage } from './errors/domainErrorMessages';
import { QuickProductDialog } from './QuickProductDialog';

export function NativeCatalogView({initialAction=''}:{initialAction?:string}){
  const runtime=useRuntime(); const s=runtime.snapshot!; const products=recordsOf(s,'products'); const stocks=recordsOf(s,'stockItems'); const outlets=recordsOf(s,'outlets'); const rules=recordsOf(s,'priceRules'); const suppliers=recordsOf(s,'suppliers'); const locations=recordsOf(s,'stockLocations');
  const canManage=s.actor.permissions.includes('catalog.manage'); const canPrice=s.actor.permissions.includes('pricing.manage'); const canImport=canManage&&s.actor.permissions.includes('inventory.adjust');
  const [modal,setModal]=useState<string|null>(null); const [edit,setEdit]=useState<any>(null); const [notice,setNotice]=useState('');
  useEffect(()=>{if(initialAction==='add-item'&&canManage){setEdit(null);setModal('PRODUCT')}},[initialAction,canManage]);
  const save=async(collection:string,data:any)=>{const id=data.id||crypto.randomUUID();const rec=recordOf(s,collection,id);setNotice('');try{await runtime.command('record.save',{collection,id,data:{...data,id}},rec?.version);setModal(null);setEdit(null)}catch(error){setNotice(domainErrorMessage(error,'save this record'))}};
  const createWithStock=async(value:any)=>{setNotice('');try{await runtime.command('catalog.createWithOpeningStock',value);setModal(null);setEdit(null)}catch(error){setNotice(domainErrorMessage(error,'create the item and opening stock'))}};
  const importCsv=async({rows,outletId,locationId,mode,supplierId,reference}:{rows:any[];outletId:string;locationId:string;mode:string;supplierId?:string;reference?:string})=>{
    const key=(value:any)=>String(value||'').trim().toLowerCase();
    if(!['MASTER_ONLY','OPENING_BALANCE','RECEIPT'].includes(mode))throw new Error('Unsupported CSV import mode.');
    if(mode==='OPENING_BALANCE'&&s.installationStage==='LIVE')throw new Error('Opening balances are not allowed after Go Live.');
    if(mode==='RECEIPT'&&s.installationStage!=='LIVE')throw new Error('Use opening-balance mode before Go Live.');
    if(mode!=='MASTER_ONLY'&&!locationId)throw new Error('Choose a stock location.');
    if(mode==='RECEIPT'&&!String(reference||'').trim())throw new Error('Receipt / invoice reference is required.');

    for(const row of rows){
      const stockMatch=stocks.find(x=>key(x.code)===key(row.sku));
      const productMatch=products.find(x=>key(x.code)===key(row.sku));
      if(row.barcode){
        const stockConflict=stocks.find(x=>key(x.barcode)===key(row.barcode)&&x.id!==stockMatch?.id);
        const productConflict=products.find(x=>key(x.barcode)===key(row.barcode)&&x.id!==productMatch?.id);
        if(stockConflict)throw new Error(`Row ${row.rowNumber}: barcode ${row.barcode} already belongs to stock item ${stockConflict.name}.`);
        if(productConflict)throw new Error(`Row ${row.rowNumber}: barcode ${row.barcode} already belongs to product ${productConflict.name}.`);
      }
      if(row.createProduct&&!outletId)throw new Error(`Row ${row.rowNumber}: choose a service area before importing sellables.`);
      if(mode==='RECEIPT'&&row.quantity>0&&row.costPrice===undefined)throw new Error(`Row ${row.rowNumber}: cost_price is required for received stock.`);
    }

    let stockCount=0,productCount=0,movementCount=0;
    for(const row of rows){
      const existingStock=stocks.find(x=>key(x.code)===key(row.sku));
      const stockId=existingStock?.id||crypto.randomUUID();
      const stockRecord=existingStock?recordOf(s,'stockItems',stockId):undefined;
      const stockData={
        ...(existingStock||{}),
        id:stockId,
        name:row.name,
        code:row.sku,
        baseUnit:row.baseUnit,
        scanUnitQuantity:row.scanUnitQuantity,
        currentStock:existingStock?.currentStock||{},
        averageUnitCost:mode==='RECEIPT'&&existingStock?Number(existingStock.averageUnitCost||0):Number(row.costPrice??existingStock?.averageUnitCost??0),
        ...(row.barcode?{barcode:row.barcode}:{})
      };
      await runtime.command('record.save',{collection:'stockItems',id:stockId,data:stockData},stockRecord?.version);
      stockCount++;

      if(row.createProduct){
        const existingProduct=products.find(x=>key(x.code)===key(row.sku));
        const productId=existingProduct?.id||crypto.randomUUID();
        const productRecord=existingProduct?recordOf(s,'products',productId):undefined;
        const outletIds=Array.from(new Set([...(existingProduct?.outletIds||[]),outletId].filter(Boolean)));
        const productData={
          ...(existingProduct||{}),
          id:productId,
          name:row.name,
          code:row.sku,
          price:Number(row.salePrice),
          costPrice:row.costPrice===undefined?existingProduct?.costPrice:Number(row.costPrice),
          category:row.category,
          routeTo:row.routeTo,
          taxClassId:row.taxClassId,
          stockItemId:stockId,
          outletIds,
          portionVolume:Number(row.portionVolume||1),
          favorite:existingProduct?.favorite||false,
          portions:existingProduct?.portions||[],
          modifiers:existingProduct?.modifiers||[],
          recipeIngredients:existingProduct?.recipeIngredients||[],
          ...(row.barcode?{barcode:row.barcode}:{})
        };
        await runtime.command('record.save',{collection:'products',id:productId,data:productData},productRecord?.version);
        productCount++;
      }

      if(mode==='OPENING_BALANCE'&&Number(row.quantity)>0){
        await runtime.command('inventory.openingBalance',{stockItemId:stockId,locationId,quantity:Number(row.quantity),reason:String(reference||'CSV opening balance import')});
        movementCount++;
      }
      if(mode==='RECEIPT'&&Number(row.quantity)>0){
        await runtime.command('inventory.receive',{stockItemId:stockId,locationId,quantity:Number(row.quantity),unitCost:Number(row.costPrice),supplierId,reference:String(reference),invoiceReference:String(reference)});
        movementCount++;
      }
    }
    setNotice(`CSV import complete: ${stockCount} stock master(s), ${productCount} sellable product(s), ${movementCount} inventory movement(s).`);
  };
  return <div className="h-full overflow-auto bg-slate-950 p-5 text-white"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Products & Menu</h1><p className="text-sm text-slate-400">Sellable items, stock links, portions, modifiers, recipes and pricing.</p></div><div className="flex flex-wrap gap-2">{canManage&&<><button className={primaryButtonClass} onClick={()=>{setEdit(null);setModal('PRODUCT')}}>Add item</button>{products.some(product=>product.productFamilyId)&&<button className={buttonClass} onClick={()=>{setEdit(null);setModal('VARIANT')}}>Add another size</button>}<button className={buttonClass} onClick={()=>{setEdit(null);setModal('STOCK')}}>Add stock master</button><button className={buttonClass} onClick={()=>{setEdit(null);setModal('SUPPLIER')}}>Supplier</button></>}{canImport&&<button className={buttonClass} onClick={()=>{setEdit(null);setModal('IMPORT')}}>Import CSV</button>}{canPrice&&<button className={buttonClass} onClick={()=>{setEdit(null);setModal('RULE')}}>Price rule</button>}</div></div>
  {notice&&<p role="alert" className="mb-3 rounded-lg bg-rose-950 p-3 text-sm text-rose-200">{notice}</p>}
  {products.length===0?<section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-6"><h2 className="text-lg font-bold">No sellable products yet</h2><p className="mt-1 text-sm text-slate-400">Add a product to make it available to the service team. Stock can be linked later.</p>{canManage&&<button className={primaryButtonClass+' mt-4'} onClick={()=>{setEdit(null);setModal('PRODUCT')}}>Add first product</button>}</section>:<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{products.map(p=><button key={p.id} onClick={()=>canManage&&(setEdit(p),setModal('PRODUCT'))} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left"><div className="text-xs text-slate-500">{p.code} · {p.category} · → {p.routeTo}</div><div className="mt-1 flex justify-between gap-3"><b>{p.name}</b><span className="text-amber-300">{money(p.price)}</span></div><div className="mt-2 text-xs text-slate-400">{p.portions?.length||0} portions · {p.modifiers?.length||0} modifiers · {p.recipeIngredients?.length||0} recipe lines {p.favorite?'· ★ favorite':''}</div></button>)}</div>}
  <h2 className="mb-2 mt-7 font-bold">Price rules</h2>{rules.length===0?<p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-400">No price rules yet. Products use their saved prices until you add a rule.</p>:<div className="grid gap-2 md:grid-cols-2">{rules.map(r=><button key={r.id} onClick={()=>canPrice&&(setEdit(r),setModal('RULE'))} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-left"><div className="flex justify-between"><b>{r.name}</b><span>{r.active===false?'Off':'Active'}</span></div><div className="text-xs text-slate-500">{r.type} {r.value} · {r.scopeType||'ALL'} · {r.startTime||'all day'}–{r.endTime||'all day'}</div></button>)}</div>}
  {modal==='IMPORT'&&<CsvImportDialog snapshot={s} products={products} stocks={stocks} outlets={outlets} locations={locations} suppliers={suppliers} onClose={()=>setModal(null)} onImport={importCsv}/>} 
  {modal==='PRODUCT'&&(edit?<ProductDialog existing={edit} stocks={stocks} outlets={outlets} onClose={()=>setModal(null)} onSave={v=>save('products',v)}/>:<QuickProductDialog stocks={stocks} products={products} outlets={outlets} locations={locations} onClose={()=>setModal(null)} onSave={v=>save('products',v)} onCreateWithStock={createWithStock}/>)}
  {modal==='VARIANT'&&<QuickProductDialog stocks={stocks} products={products} outlets={outlets} locations={locations} variantOnly onClose={()=>setModal(null)} onSave={v=>save('products',v)} onCreateWithStock={createWithStock}/>}
  {modal==='STOCK'&&<QuickStockDialog onClose={()=>setModal(null)} onSave={v=>save('stockItems',v)}/>}
  {modal==='SUPPLIER'&&<SupplierDialog existing={edit} suppliers={suppliers} onClose={()=>setModal(null)} onSave={v=>save('suppliers',v)}/>} 
  {modal==='RULE'&&<RuleDialog existing={edit} products={products} onClose={()=>setModal(null)} onSave={v=>save('priceRules',v)}/>} 
  </div>;
}

const CsvImportDialog=({snapshot,products,stocks,outlets,locations,suppliers,onImport,onClose}:{snapshot:any;products:any[];stocks:any[];outlets:any[];locations:any[];suppliers:any[];onImport:(v:any)=>Promise<void>;onClose:()=>void})=>{
  const [parsed,setParsed]=useState<any>({rows:[],errors:[]});
  const [fileName,setFileName]=useState('');
  const [outletId,setOutletId]=useState(outlets[0]?.id||'');
  const [locationId,setLocationId]=useState(locations[0]?.id||'');
  const [mode,setMode]=useState('MASTER_ONLY');
  const [supplierId,setSupplierId]=useState('');
  const [reference,setReference]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const stage=snapshot.installationStage;
  const load=async(file?:File)=>{
    if(!file)return;
    setFileName(file.name);setError('');
    try{setParsed(parseCatalogCsv(await file.text()))}catch(e){setParsed({rows:[],errors:[String(e)]})}
  };
  const submit=async()=>{
    setError('');
    if(!parsed.rows.length||parsed.errors.length)return;
    if(parsed.rows.some((r:any)=>r.createProduct)&&!outletId){setError('Choose the service area for imported sellables.');return;}
    if(mode!=='MASTER_ONLY'&&!locationId){setError('Choose the stock location for imported quantities.');return;}
    if(mode==='RECEIPT'&&!reference.trim()){setError('A receipt/invoice reference is required for live stock receipts.');return;}
    if(mode==='RECEIPT'&&parsed.rows.some((r:any)=>r.quantity>0&&r.costPrice===undefined)){setError('Every row with received quantity needs cost_price in receipt mode.');return;}
    setBusy(true);
    try{await onImport({rows:parsed.rows,outletId,locationId,mode,supplierId:supplierId||undefined,reference:reference.trim()});onClose()}
    catch(e){setError(String(e))}
    finally{setBusy(false)}
  };
  return <ActionDialog title="Import products & inventory CSV" onClose={onClose}><div className="space-y-4">
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
      Required columns: <b>sku</b> and <b>name</b>. Supported: barcode, category, sale_price, cost_price, quantity, base_unit, scan_unit_quantity, route_to, tax_class_id, create_product, portion_volume and notes.
    </div>
    <label className="block text-sm">CSV file<input className={fieldClass+' mt-1'} type="file" accept=".csv,text/csv" onChange={e=>void load(e.target.files?.[0])}/></label>
    {fileName&&<p className="text-xs text-slate-500">{fileName} · {parsed.rows.length} parsed row(s)</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-sm">Service area<select className={fieldClass+' mt-1'} value={outletId} onChange={e=>setOutletId(e.target.value)}>{outlets.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label className="text-sm">Import mode<select className={fieldClass+' mt-1'} value={mode} onChange={e=>setMode(e.target.value)}><option value="MASTER_ONLY">Products / stock master only</option>{stage!=='LIVE'&&<option value="OPENING_BALANCE">Create/update + set opening quantities</option>}{stage==='LIVE'&&<option value="RECEIPT">Create/update + receive stock</option>}</select></label>
      {mode!=='MASTER_ONLY'&&<label className="text-sm">Stock location<select className={fieldClass+' mt-1'} value={locationId} onChange={e=>setLocationId(e.target.value)}>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      {mode==='RECEIPT'&&<label className="text-sm">Supplier (optional)<select className={fieldClass+' mt-1'} value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">No supplier link</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    </div>
    {mode!=='MASTER_ONLY'&&<label className="block text-sm">{mode==='RECEIPT'?'Receipt / invoice reference':'Opening balance note'}<input className={fieldClass+' mt-1'} value={reference} onChange={e=>setReference(e.target.value)} placeholder={mode==='RECEIPT'?'e.g. INV-20175 / supplier receipt batch':'e.g. Initial stock count'}/></label>}
    {parsed.errors.length>0&&<div className="rounded-xl border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">{parsed.errors.slice(0,8).map((x:string)=><div key={x}>{x}</div>)}{parsed.errors.length>8&&<div>+ {parsed.errors.length-8} more error(s)</div>}</div>}
    {parsed.rows.length>0&&<div className="max-h-64 overflow-auto rounded-xl border border-slate-800"><table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="p-2">SKU</th><th className="p-2">Name</th><th className="p-2">Qty</th><th className="p-2">Cost</th><th className="p-2">Sale</th><th className="p-2">Sellable?</th><th className="p-2">Barcode</th></tr></thead><tbody>{parsed.rows.slice(0,20).map((r:any)=><tr key={r.sku} className="border-t border-slate-800"><td className="p-2 font-mono">{r.sku}</td><td className="p-2">{r.name}</td><td className="p-2">{r.quantity} {r.baseUnit}</td><td className="p-2">{r.costPrice===undefined?'—':money(r.costPrice)}</td><td className="p-2">{r.salePrice===undefined?'—':money(r.salePrice)}</td><td className="p-2">{r.createProduct?'Yes':'Stock only'}</td><td className="p-2 font-mono">{r.barcode||'—'}</td></tr>)}</tbody></table></div>}
    <p className="text-xs text-slate-500">Existing records are matched by SKU/code. Backend uniqueness rules still protect duplicate codes and barcodes. In live receipt mode, stock movements go through the normal immutable inventory receipt command.</p>
    {(error||parsed.errors.length>0)&&error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}
    <button className={primaryButtonClass} disabled={busy||!parsed.rows.length||parsed.errors.length>0} onClick={()=>void submit()}>{busy?'Importing…':`Import ${parsed.rows.length||''} row${parsed.rows.length===1?'':'s'}`}</button>
  </div></ActionDialog>
};
const LegacyQuickProductDialog=({stocks,outlets,onSave,onClose}:{stocks:any[];outlets:any[];onSave:(v:any)=>Promise<void>;onClose:()=>void})=>{
  const [kind,setKind]=useState('DRINK');
  const [name,setName]=useState('');
  const [price,setPrice]=useState(0);
  const [category,setCategory]=useState('Drinks');
  const [routeTo,setRouteTo]=useState('BAR');
  const [taxClassId,setTaxClassId]=useState('');
  const [track,setTrack]=useState(false);
  const [stockItemId,setStockItemId]=useState('');
  const [code,setCode]=useState('');
  const configure=(next:string)=>{setKind(next);if(next==='FOOD'){setCategory('Food');setRouteTo('KITCHEN')}else if(next==='RETAIL'){setCategory('Retail');setRouteTo('SERVICE')}else if(next==='SERVICE'){setCategory('Services');setRouteTo('SERVICE')}else{setCategory('Drinks');setRouteTo('BAR')}};
  const updateName=(value:string)=>{setName(value);if(!code){const slug=value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,20);setCode(slug?`${slug}-${crypto.randomUUID().slice(0,4).toUpperCase()}`:'')}};
  const submit=()=>void onSave({id:'',name:name.trim(),code:code.trim(),price:Number(price),category,routeTo,stockItemId:track?stockItemId:'',outletIds:outlets.map(o=>o.id),taxClassId,favorite:false,barcode:'',portions:[],modifiers:[],recipeIngredients:[]});
  return <ActionDialog title="Add product or menu item" onClose={onClose}><div className="space-y-4">
    <label className="block text-sm font-semibold">What are you adding?<select className={fieldClass+' mt-1'} value={kind} onChange={e=>configure(e.target.value)}><option value="DRINK">Drink</option><option value="FOOD">Food / kitchen item</option><option value="RETAIL">Retail / packaged item</option><option value="SERVICE">Service</option></select></label>
    <label className="block text-sm font-semibold">Name<input autoFocus className={fieldClass+' mt-1'} value={name} onChange={e=>updateName(e.target.value)} placeholder={kind==='FOOD'?'e.g. Chicken and chips':'e.g. House lager'}/></label>
    <label className="block text-sm font-semibold">Selling price (KES)<input className={fieldClass+' mt-1'} type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))}/></label>
    <label className="block text-sm font-semibold">Send order to<select className={fieldClass+' mt-1'} value={routeTo} onChange={e=>setRouteTo(e.target.value)}><option value="BAR">Bar</option><option value="KITCHEN">Kitchen</option><option value="SERVICE">Service</option></select></label><label className="block text-sm font-semibold">Tax class<select required className={fieldClass+' mt-1'} value={taxClassId} onChange={e=>setTaxClassId(e.target.value)}><option value="">Select tax class…</option><option value="A_16">Standard · 16%</option><option value="B_0">Zero-rated · 0%</option><option value="C_EXEMPT">Exempt</option></select></label>
    <details className="rounded-xl border border-slate-800 p-3"><summary className="cursor-pointer text-sm font-semibold">More setup</summary><div className="mt-3 space-y-3"><label className="block text-sm">Category<input className={fieldClass+' mt-1'} value={category} onChange={e=>setCategory(e.target.value)}/></label><label className="block text-sm">Item code (generated; you can change it)<input className={fieldClass+' mt-1 font-mono'} value={code} onChange={e=>setCode(e.target.value)}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={track} onChange={e=>setTrack(e.target.checked)}/>Track sales against an existing stock item</label>{track&&<select aria-label="Stock item" className={fieldClass} value={stockItemId} onChange={e=>setStockItemId(e.target.value)}><option value="">Choose stock item</option>{stocks.map(stock=><option key={stock.id} value={stock.id}>{stock.name} · {stock.baseUnit}</option>)}</select>}<p className="text-xs text-slate-400">Recipe ingredients, portions and stock master creation can be set up after the item is saved.</p></div></details>
    <button className={primaryButtonClass+' w-full'} disabled={!name.trim()||!code.trim()||!taxClassId||price<0||outlets.length===0||(track&&!stockItemId)} onClick={submit}>Add item</button>
    {outlets.length===0&&<p role="status" className="text-sm text-amber-200">Add a service area in setup before creating sellable items.</p>}
  </div></ActionDialog>;
};

const ProductDialog=({existing,stocks,outlets,onSave,onClose}:{existing:any;stocks:any[];outlets:any[];onSave:(v:any)=>Promise<void>;onClose:()=>void})=>{const [v,setV]=useState(existing||{id:'',name:'',code:'',price:0,category:'SPIRITS',routeTo:'BAR',stockItemId:stocks[0]?.id||'',outletIds:outlets.map(o=>o.id),taxClassId:'',favorite:false,barcode:'',portions:[],modifiers:[],recipeIngredients:[]});const [portion,setPortion]=useState({name:'Single',volume:30,price:0});const [modifier,setModifier]=useState({name:'Mixer',priceDelta:0,stockItemId:'',quantityDelta:0});const [ingredient,setIngredient]=useState({stockItemId:stocks[0]?.id||'',quantity:1});return <ActionDialog title={existing?'Edit product':'New product'} onClose={onClose}><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><input className={fieldClass} placeholder="Name" value={v.name} onChange={e=>setV({...v,name:e.target.value})}/><input className={fieldClass} placeholder="SKU / code" value={v.code} onChange={e=>setV({...v,code:e.target.value})}/><input className={fieldClass} type="number" placeholder="Price" value={v.price} onChange={e=>setV({...v,price:Number(e.target.value)})}/><input className={fieldClass} placeholder="Barcode" value={v.barcode||''} onChange={e=>setV({...v,barcode:e.target.value})}/><input className={fieldClass} placeholder="Category" value={v.category} onChange={e=>setV({...v,category:e.target.value})}/><select className={fieldClass} value={v.routeTo} onChange={e=>setV({...v,routeTo:e.target.value})}><option>BAR</option><option>KITCHEN</option><option>SERVICE</option></select><label className="text-sm">Tax class<select required className={fieldClass} value={v.taxClassId||''} onChange={e=>setV({...v,taxClassId:e.target.value})}><option value="">Select tax class…</option><option value="A_16">Standard · 16%</option><option value="B_0">Zero-rated · 0%</option><option value="C_EXEMPT">Exempt</option></select></label><select className={fieldClass} value={v.stockItemId||''} onChange={e=>setV({...v,stockItemId:e.target.value})}><option value="">Recipe only / untracked</option>{stocks.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><label className="flex items-center gap-2"><input type="checkbox" checked={!!v.favorite} onChange={e=>setV({...v,favorite:e.target.checked})}/>Favorite</label></div>
  <div className="rounded-xl border border-slate-800 p-3"><b className="text-sm">Portions</b><div className="mt-2 flex gap-2"><input className={fieldClass} placeholder="Name" value={portion.name} onChange={e=>setPortion({...portion,name:e.target.value})}/><input className={fieldClass} type="number" placeholder="ml/unit" value={portion.volume} onChange={e=>setPortion({...portion,volume:Number(e.target.value)})}/><input className={fieldClass} type="number" placeholder="Price" value={portion.price} onChange={e=>setPortion({...portion,price:Number(e.target.value)})}/><button className={buttonClass} onClick={()=>{setV({...v,portions:[...(v.portions||[]),{id:crypto.randomUUID(),...portion}]});}}>Add</button></div><div className="mt-2 text-xs text-slate-400">{(v.portions||[]).map((p:any)=>`${p.name} ${p.volume} @ ${money(p.price)}`).join(' · ')||'No portions'}</div></div>
  <label className="block text-sm">Selling method<select aria-label="Selling method" className={fieldClass} value={v.sellingMode||''} onChange={e=>setV({...v,sellingMode:e.target.value||undefined})}><option value="">Keep existing selling behaviour</option><option value="BOTTLE_ONLY">Sealed bottles only</option><option value="BOTTLE_AND_PORTIONS">Bottles and measured portions</option></select></label>
  {v.sellingMode==='BOTTLE_ONLY'&&<div className="rounded border border-amber-500/30 p-3 text-sm"><p>Review all stock links and clear open liquid first. This changes sale choices, not stock quantities.</p><button className={buttonClass} onClick={()=>{const size=Number(stocks.find(stock=>stock.id===v.stockItemId)?.sealedContainerSize||0);if(size>0)setV({...v,portionVolume:size,portions:[{id:'whole-bottle',name:'Whole bottle',volume:size,price:v.price,wholeContainerSale:true}]})}}>Replace portions with whole bottle</button></div>}
  {(v.portions||[]).map((p:any)=><div key={p.id} className="flex justify-between gap-2 text-sm"><span>{p.name} ? {p.volume} ml</span><button className={buttonClass} onClick={()=>setV({...v,portions:v.portions.filter((other:any)=>other.id!==p.id)})}>Remove portion</button></div>)}
  <div className="rounded-xl border border-slate-800 p-3"><b className="text-sm">Modifiers / mixers</b><div className="mt-2 grid grid-cols-2 gap-2"><input className={fieldClass} value={modifier.name} onChange={e=>setModifier({...modifier,name:e.target.value})}/><input className={fieldClass} type="number" value={modifier.priceDelta} onChange={e=>setModifier({...modifier,priceDelta:Number(e.target.value)})}/><select className={fieldClass} value={modifier.stockItemId} onChange={e=>setModifier({...modifier,stockItemId:e.target.value})}><option value="">No stock effect</option>{stocks.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input className={fieldClass} type="number" step="0.001" value={modifier.quantityDelta} onChange={e=>setModifier({...modifier,quantityDelta:Number(e.target.value)})}/></div><button className={buttonClass+' mt-2'} onClick={()=>setV({...v,modifiers:[...(v.modifiers||[]),{id:crypto.randomUUID(),name:modifier.name,priceDelta:modifier.priceDelta,ingredientAdjustments:modifier.stockItemId?[{stockItemId:modifier.stockItemId,quantityDelta:modifier.quantityDelta}]:[]}]})}>Add modifier</button><div className="mt-2 text-xs text-slate-400">{(v.modifiers||[]).map((m:any)=>m.name).join(' · ')||'No modifiers'}</div></div>
  <div className="rounded-xl border border-slate-800 p-3"><b className="text-sm">Recipe ingredients</b><div className="mt-2 flex gap-2"><select className={fieldClass} value={ingredient.stockItemId} onChange={e=>setIngredient({...ingredient,stockItemId:e.target.value})}>{stocks.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input className={fieldClass} type="number" step="0.001" value={ingredient.quantity} onChange={e=>setIngredient({...ingredient,quantity:Number(e.target.value)})}/><button className={buttonClass} onClick={()=>setV({...v,recipeIngredients:[...(v.recipeIngredients||[]),{...ingredient,tracked:true}]})}>Add</button></div><div className="mt-2 text-xs text-slate-400">{(v.recipeIngredients||[]).length} ingredient(s)</div></div>
  <button className={primaryButtonClass} disabled={!v.name||!v.code||!v.taxClassId||!v.outletIds?.length} onClick={()=>void onSave(v)}>Save product</button></div></ActionDialog>};
const StockDialog=({existing,onSave,onClose}:{existing:any;onSave:(v:any)=>Promise<void>;onClose:()=>void})=>{const [v,setV]=useState(existing||{id:'',name:'',code:'',baseUnit:'unit',averageUnitCost:0,currentStock:{},barcode:'',scanUnitQuantity:1,reorderLevel:0});return <ActionDialog title="Stock master" onClose={onClose}><div className="space-y-3"><input className={fieldClass} placeholder="Name" value={v.name} onChange={e=>setV({...v,name:e.target.value})}/><input className={fieldClass} placeholder="Code" value={v.code} onChange={e=>setV({...v,code:e.target.value})}/><input className={fieldClass} placeholder="Base unit (ml, bottle, piece)" value={v.baseUnit} onChange={e=>setV({...v,baseUnit:e.target.value})}/><input className={fieldClass} type="number" min="0" placeholder="Average unit cost" value={v.averageUnitCost} onChange={e=>setV({...v,averageUnitCost:Number(e.target.value)})}/><label className="block text-sm">Reorder level in base units<input className={fieldClass+' mt-1'} type="number" min="0" step="0.001" value={v.reorderLevel??0} onChange={e=>setV({...v,reorderLevel:Number(e.target.value)})}/><span className="text-xs text-slate-500">Inventory marks this item low when total on-hand is at or below this level. Use 0 to disable the alert.</span></label><label className="block text-sm">Physical barcode / EAN / UPC<input data-barcode-capture="true" className={fieldClass+' mt-1 font-mono'} placeholder="Click and scan, or type code" value={v.barcode||''} onChange={e=>setV({...v,barcode:e.target.value})}/></label><label className="block text-sm">Quantity represented by one scan<input className={fieldClass+' mt-1'} type="number" min="0.000001" step="0.001" value={v.scanUnitQuantity??1} onChange={e=>setV({...v,scanUnitQuantity:Number(e.target.value)})}/><span className="text-xs text-slate-500">Enter in {v.baseUnit || 'base units'} (for example, 750 for a 750 ml bottle tracked in ml).</span></label><button className={primaryButtonClass} disabled={!v.name?.trim()||!v.code?.trim()||!v.baseUnit?.trim()||!Number.isFinite(v.scanUnitQuantity)||v.scanUnitQuantity<=0||!Number.isFinite(Number(v.reorderLevel??0))||Number(v.reorderLevel??0)<0} onClick={()=>void onSave(v)}>Save stock item</button></div></ActionDialog>};
const QuickStockDialog=({onSave,onClose}:{onSave:(v:any)=>Promise<void>;onClose:()=>void})=>{
  const [name,setName]=useState('');const [baseUnit,setBaseUnit]=useState('bottle');const [code,setCode]=useState('');const [barcode,setBarcode]=useState('');const [scanUnitQuantity,setScanUnitQuantity]=useState(1);const [averageUnitCost,setAverageUnitCost]=useState(0);const [reorderLevel,setReorderLevel]=useState(0);
  const updateName=(value:string)=>{setName(value);if(!code){const slug=value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,20);setCode(slug?`${slug}-${crypto.randomUUID().slice(0,4).toUpperCase()}`:'')}};
  const submit=()=>void onSave({id:'',name:name.trim(),code:code.trim(),baseUnit:baseUnit.trim(),barcode:barcode.trim(),scanUnitQuantity:Number(scanUnitQuantity),averageUnitCost:Number(averageUnitCost),reorderLevel:Number(reorderLevel),currentStock:{}});
  return <ActionDialog title="Add stock item" onClose={onClose}><div className="space-y-4">
    <label className="block text-sm font-semibold">What do you call this item?<input autoFocus className={fieldClass+' mt-1'} value={name} onChange={e=>updateName(e.target.value)} placeholder="e.g. House lager 500 ml"/></label>
    <label className="block text-sm font-semibold">How do you count it?<input className={fieldClass+' mt-1'} value={baseUnit} onChange={e=>setBaseUnit(e.target.value)} placeholder="bottle, ml, kg, piece"/><span className="mt-1 block text-xs font-normal text-slate-500">Use the smallest unit you track, such as ml for spirits or piece for packaged items.</span></label>
    <details className="rounded-xl border border-slate-800 p-3"><summary className="cursor-pointer text-sm font-semibold">Barcode and stock controls</summary><div className="mt-3 space-y-3"><label className="block text-sm">Item code (generated; editable)<input className={fieldClass+' mt-1 font-mono'} value={code} onChange={e=>setCode(e.target.value)}/></label><label className="block text-sm">Physical barcode<input data-barcode-capture="true" className={fieldClass+' mt-1 font-mono'} value={barcode} onChange={e=>setBarcode(e.target.value)} placeholder="Scan or type barcode"/></label><label className="block text-sm">Quantity represented by one scan ({baseUnit||'unit'})<input className={fieldClass+' mt-1'} type="number" min="0.000001" step="0.001" value={scanUnitQuantity} onChange={e=>setScanUnitQuantity(Number(e.target.value))}/></label><label className="block text-sm">Average unit cost (KES)<input className={fieldClass+' mt-1'} type="number" min="0" step="0.01" value={averageUnitCost} onChange={e=>setAverageUnitCost(Number(e.target.value))}/></label><label className="block text-sm">Reorder alert at ({baseUnit||'unit'})<input className={fieldClass+' mt-1'} type="number" min="0" step="0.001" value={reorderLevel} onChange={e=>setReorderLevel(Number(e.target.value))}/></label></div></details>
    <button className={primaryButtonClass+' w-full'} disabled={!name.trim()||!code.trim()||!baseUnit.trim()||!Number.isFinite(scanUnitQuantity)||scanUnitQuantity<=0||!Number.isFinite(averageUnitCost)||averageUnitCost<0||!Number.isFinite(reorderLevel)||reorderLevel<0} onClick={submit}>Add stock item</button>
    <p className="text-xs text-slate-500">This creates the stock master only. Record starting quantities with the opening balance or receiving workflow so the inventory ledger remains accurate.</p>
  </div></ActionDialog>;
};
const SupplierDialog=({existing,onSave,onClose}:{existing:any;suppliers:any[];onSave:(v:any)=>Promise<void>;onClose:()=>void})=>{const [v,setV]=useState(existing||{id:'',name:'',code:'',phone:'',email:'',contactPerson:'',kraPin:'',paymentTermsDays:0,paymentTerms:''});return <ActionDialog title="Supplier" onClose={onClose}><div className="space-y-3">{['name','code','phone','email','contactPerson','kraPin'].map(k=><input key={k} className={fieldClass} placeholder={k} value={v[k]||''} onChange={e=>setV({...v,[k]:e.target.value})}/>)}<label>Payment terms (days)<input className={fieldClass} type="number" min="0" value={v.paymentTermsDays??0} onChange={e=>setV({...v,paymentTermsDays:Number(e.target.value)})}/></label><label>Payment terms / notes<textarea className={fieldClass} value={v.paymentTerms||''} onChange={e=>setV({...v,paymentTerms:e.target.value})}/></label><button className={primaryButtonClass} disabled={!v.name?.trim()||!v.code?.trim()||Number(v.paymentTermsDays)<0} onClick={()=>void onSave(v)}>Save supplier</button></div></ActionDialog>};
const RuleDialog=({existing,products,onSave,onClose}:{existing:any;products:any[];onSave:(v:any)=>Promise<void>;onClose:()=>void})=>{
  const [v,setV]=useState(existing||{id:'',name:'Happy Hour',type:'PERCENT',value:10,scopeType:'ALL',scopeId:'',startTime:'17:00',endTime:'19:00',days:[1,2,3,4,5],priority:10,active:true});
  const days=[['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',7]] as const;
  const toggleDay=(day:number)=>setV({...v,days:(v.days||[]).includes(day)?(v.days||[]).filter((x:number)=>x!==day):[...(v.days||[]),day].sort()});
  return <ActionDialog title="Price rule" onClose={onClose}><div className="space-y-3">
    <input className={fieldClass} placeholder="Name" value={v.name} onChange={e=>setV({...v,name:e.target.value})}/>
    <div className="grid grid-cols-2 gap-2">
      <select className={fieldClass} value={v.type} onChange={e=>setV({...v,type:e.target.value})}><option>PERCENT</option><option>FIXED</option></select>
      <input className={fieldClass} type="number" min="0" value={v.value} onChange={e=>setV({...v,value:Number(e.target.value)})}/>
      <select className={fieldClass} value={v.scopeType} onChange={e=>setV({...v,scopeType:e.target.value,scopeId:''})}><option>ALL</option><option>PRODUCT</option><option>CATEGORY</option></select>
      {v.scopeType==='PRODUCT'?<select className={fieldClass} value={v.scopeId} onChange={e=>setV({...v,scopeId:e.target.value})}><option value="">Choose product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>:v.scopeType==='CATEGORY'?<input className={fieldClass} placeholder="Category" value={v.scopeId||''} onChange={e=>setV({...v,scopeId:e.target.value})}/>:<div/>}
      <label>Start<input className={fieldClass} type="time" value={v.startTime||''} onChange={e=>setV({...v,startTime:e.target.value})}/></label>
      <label>End<input className={fieldClass} type="time" value={v.endTime||''} onChange={e=>setV({...v,endTime:e.target.value})}/></label>
      <label>Priority<input className={fieldClass} type="number" value={v.priority??10} onChange={e=>setV({...v,priority:Number(e.target.value)})}/></label>
    </div>
    <div><div className="mb-2 text-sm">Active weekdays</div><div className="flex flex-wrap gap-2">{days.map(([label,day])=><button type="button" key={day} className={(v.days||[]).includes(day)?primaryButtonClass:buttonClass} onClick={()=>toggleDay(day)}>{label}</button>)}</div></div>
    <label className="flex gap-2"><input type="checkbox" checked={v.active!==false} onChange={e=>setV({...v,active:e.target.checked})}/>Active</label>
    <button className={primaryButtonClass} disabled={!v.name?.trim()||v.value<0||(v.scopeType!=='ALL'&&!v.scopeId)} onClick={()=>void onSave(v)}>Save rule</button>
  </div></ActionDialog>;
};







