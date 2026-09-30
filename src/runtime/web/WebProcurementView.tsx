import React,{useMemo,useState} from 'react';
import {Barcode,Boxes,ClipboardCheck,CreditCard,PackageCheck,Plus,Truck} from 'lucide-react';
import {barcodeEquals,useBarcodeScanner} from '../../hooks/useBarcodeScanner';
import {allowed,type BusinessRecord,type WebSession} from './session';
import {parseQuantity} from '../../utils/fiscal';
import {Dialog} from '../../design-system/controls';

type CommandFn=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<unknown>;
type DraftLine={
  lineId:string;
  treatment:'STOCK'|'EXPENSE'|'ASSET';
  displayName:string;
  quantityOrdered:number;
  unitPriceMinor:number;
  stockItemId?:string;
  purchasePackageId?:string;
  purchasePackageName?:string;
  quantityBasePerPackage?:number;
  expenseCategory?:string;
  description?:string;
  assetCategoryId?:string;
  assetName?:string;
};
type ReceiptDraft={delivered:number;rejected:number;reason:string};

const field='w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400';
const button='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-40';
const primary='rounded-lg bg-amber-400 px-3 py-2 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40';
const money=(minor:unknown)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(Number(minor||0)/100);
const data=(record?:BusinessRecord)=>record?.data as Record<string,any>|undefined;
const active=(records:BusinessRecord[],collection:string)=>records.filter(r=>r.collection===collection&&!r.archived);
const record=(records:BusinessRecord[],collection:string,id:string)=>records.find(r=>r.collection===collection&&r.id===id);
const today=()=>new Date().toISOString().slice(0,10);

export function WebProcurementView({
  records,session,disabled,command
}:{
  records:BusinessRecord[];
  session:WebSession;
  disabled:boolean;
  command:CommandFn;
}){
  const suppliers=active(records,'suppliers');
  const stockItems=active(records,'stockItems');
  const locations=active(records,'stockLocations');
  const categories=active(records,'assetCategories');
  const rooms=active(records,'rooms');
  const orders=active(records,'purchaseOrders').slice().sort((a,b)=>String(data(b)?.createdAt||'').localeCompare(String(data(a)?.createdAt||'')));
  const receipts=active(records,'goodsReceipts').slice().sort((a,b)=>String(data(b)?.receivedAt||'').localeCompare(String(data(a)?.receivedAt||'')));
  const payables=active(records,'supplierPayables').slice().sort((a,b)=>String(data(b)?.createdAt||'').localeCompare(String(data(a)?.createdAt||'')));
  const payments=active(records,'supplierPayments').slice().sort((a,b)=>String(data(b)?.occurredAt||'').localeCompare(String(data(a)?.occurredAt||'')));
  const acquisitions=active(records,'assetAcquisitions').filter(r=>data(r)?.status==='PENDING_COMMISSION');

  const canManage=allowed(session,'procurement.manage');
  const canReceive=allowed(session,'procurement.receive');
  const canPay=allowed(session,'procurement.pay');
  const canAccount=allowed(session,'accounting.view')||allowed(session,'accounting.manage');
  const canAssets=allowed(session,'assets.manage');

  const [section,setSection]=useState<'ORDERS'|'RECEIPTS'|'PAYABLES'|'SUPPLIERS'|'ACQUISITIONS'>('ORDERS');
  const [supplierEdit,setSupplierEdit]=useState<BusinessRecord|null|undefined>(undefined);
  const [supplierForm,setSupplierForm]=useState({name:'',code:'',phone:'',email:'',contactPerson:'',kraPin:'',paymentTermsDays:0,notes:''});

  const [poOpen,setPoOpen]=useState(false);
  const [poSupplier,setPoSupplier]=useState('');
  const [poLines,setPoLines]=useState<DraftLine[]>([]);
  const [lineKind,setLineKind]=useState<'STOCK'|'EXPENSE'|'ASSET'>('STOCK');
  const [stockId,setStockId]=useState('');
  const [purchasePackageId,setPurchasePackageId]=useState('');
  const [expenseDescription,setExpenseDescription]=useState('');
  const [expenseCategory,setExpenseCategory]=useState('GENERAL');
  const [assetName,setAssetName]=useState('');
  const [assetCategoryId,setAssetCategoryId]=useState('');
  const [lineQty,setLineQty]=useState(1);
  const [linePrice,setLinePrice]=useState(0);

  const [receiving,setReceiving]=useState<BusinessRecord|null>(null);
  const [receiptLocation,setReceiptLocation]=useState('');
  const [receiptDraft,setReceiptDraft]=useState<Record<string,ReceiptDraft>>({});
  const [receiptInvoice,setReceiptInvoice]=useState('');
  const [receiptDeliveryNote,setReceiptDeliveryNote]=useState('');
  const [receiptNotes,setReceiptNotes]=useState('');
  const [receiptApprovalToken,setReceiptApprovalToken]=useState('');
  const [scanCode,setScanCode]=useState('');

  const [matching,setMatching]=useState<BusinessRecord|null>(null);
  const [invoiceNumber,setInvoiceNumber]=useState('');
  const [invoiceDate,setInvoiceDate]=useState(today());
  const [invoiceDue,setInvoiceDue]=useState(today());

  const [paying,setPaying]=useState<BusinessRecord|null>(null);
  const [payAmount,setPayAmount]=useState(0);
  const [payMethod,setPayMethod]=useState<'BANK'|'MPESA'|'CASH'>('BANK');
  const [payReference,setPayReference]=useState('');
  const [payReason,setPayReason]=useState('');
  const [payConfirmed,setPayConfirmed]=useState(false);

  const [commissioning,setCommissioning]=useState<BusinessRecord|null>(null);
  const [commissionForm,setCommissionForm]=useState({name:'',tag:'',serialNumber:'',roomId:'',locationId:'',notes:''});

  const openSupplier=(existing?:BusinessRecord)=>{
    const d=data(existing)||{};
    setSupplierEdit(existing||null);
    setSupplierForm({
      name:String(d.name||''),code:String(d.code||''),phone:String(d.phone||''),email:String(d.email||''),
      contactPerson:String(d.contactPerson||''),kraPin:String(d.kraPin||''),
      paymentTermsDays:Number(d.paymentTermsDays||0),notes:String(d.notes||'')
    });
  };

  const saveSupplier=async()=>{
    const id=supplierEdit?.id||crypto.randomUUID();
    await command('supplier.save','suppliers',id,{id,data:supplierForm});
    setSupplierEdit(undefined);
  };

  const addDraftLine=()=>{
    let qty:number;
    try{qty=parseQuantity(lineQty,{min:Number.MIN_VALUE,integer:lineKind==='ASSET'||lineKind==='STOCK'&&Boolean(purchasePackageId)})}catch{return}
    const priceMinor=Math.round(Number(linePrice)*100);
    if(!Number.isFinite(priceMinor)||priceMinor<0)return;
    if(lineKind==='STOCK'){
      const item=stockItems.find(r=>r.id===stockId);if(!item)return;
      if(poLines.some(x=>x.treatment==='STOCK'&&x.stockItemId===stockId))return;
      const pkg=Array.isArray(data(item)?.purchasePackages)?data(item)!.purchasePackages.find((value:any)=>value.id===purchasePackageId):undefined;
      setPoLines(lines=>[...lines,{lineId:crypto.randomUUID(),treatment:'STOCK',displayName:String(data(item)?.name||item.id),stockItemId:stockId,...(pkg?{purchasePackageId:pkg.id,purchasePackageName:String(pkg.name),quantityBasePerPackage:Number(pkg.baseQuantity)}:{}),quantityOrdered:qty,unitPriceMinor:priceMinor} as DraftLine]);
    }else if(lineKind==='EXPENSE'){
      if(!expenseDescription.trim())return;
      setPoLines(lines=>[...lines,{lineId:crypto.randomUUID(),treatment:'EXPENSE',displayName:expenseDescription.trim(),description:expenseDescription.trim(),expenseCategory,quantityOrdered:qty,unitPriceMinor:priceMinor}]);
    }else{
      const category=categories.find(r=>r.id===assetCategoryId);
      if(!assetName.trim()||!category||qty>100)return;
      setPoLines(lines=>[...lines,{lineId:crypto.randomUUID(),treatment:'ASSET',displayName:assetName.trim(),assetName:assetName.trim(),assetCategoryId,quantityOrdered:qty,unitPriceMinor:priceMinor}]);
    }
    setLineQty(1);setLinePrice(0);setExpenseDescription('');setAssetName('');
  };

  const submitPo=async()=>{
    if(!poSupplier||!poLines.length)return;
    const id=crypto.randomUUID();
    await command('purchaseOrder.create','purchaseOrders',id,{
      id,supplierId:poSupplier,
      items:poLines.map(line=>({
        lineId:line.lineId,treatment:line.treatment,quantityOrdered:line.quantityOrdered,unitPriceMinor:line.unitPriceMinor,
        ...(line.stockItemId?{stockItemId:line.stockItemId}:{}),
        ...(line.purchasePackageId?{purchasePackageId:line.purchasePackageId}:{}),
        ...(line.description?{description:line.description,expenseCategory:line.expenseCategory}:{}),
        ...(line.assetName?{assetName:line.assetName,assetCategoryId:line.assetCategoryId}:{})
      }))
    });
    setPoOpen(false);setPoLines([]);
  };

  const beginReceive=(order:BusinessRecord)=>{
    const items=(data(order)?.items||[]) as Array<Record<string,any>>;
    const defaults:Record<string,ReceiptDraft>={};
    for(const line of items){
      const outstanding=Math.max(0,Number(line.quantityOrdered||0)-Number(line.quantityReceived||0));
      defaults[String(line.lineId)]={delivered:outstanding,rejected:0,reason:''};
    }
    setReceiving(order);
    setReceiptLocation(locations[0]?.id||'');
    setReceiptDraft(defaults);
    setReceiptInvoice('');setReceiptDeliveryNote('');setReceiptNotes('');setReceiptApprovalToken('');setScanCode('');
  };

  const applyScan=(raw:string)=>{
    if(!receiving)return;
    const code=raw.trim();if(!code)return;
    const matches=stockItems.filter(item=>{const d=data(item)!;return barcodeEquals(String(d.barcode||''),code)||barcodeEquals(String(d.code||''),code)||(Array.isArray(d.purchasePackages)&&d.purchasePackages.some((pkg:any)=>barcodeEquals(String(pkg.barcode||''),code)))});
    if(matches.length!==1)return;
    const item=matches[0];
    const poLine=(data(receiving)?.items||[]).find((line:any)=>line.treatment==='STOCK'&&line.stockItemId===item.id);
    if(!poLine)return;
    const itemData=data(item)!;const scannedPackage=Array.isArray(itemData.purchasePackages)?itemData.purchasePackages.find((pkg:any)=>barcodeEquals(String(pkg.barcode||''),code)):undefined;
    if(scannedPackage&&poLine.purchasePackageId!==scannedPackage.id)return;
    let increment:number;try{increment=parseQuantity(poLine.purchasePackageId?1:poLine.scanUnitQuantity??itemData.scanUnitQuantity??1,{min:Number.MIN_VALUE})}catch{return}
    setReceiptDraft(prev=>{
      const current=prev[poLine.lineId]||{delivered:0,rejected:0,reason:''};
      return {...prev,[poLine.lineId]:{...current,delivered:current.delivered+increment}};
    });
    setScanCode('');
  };
  useBarcodeScanner({enabled:Boolean(receiving),onScan:applyScan});

  const postReceipt=async()=>{
    if(!receiving)return;
    const order=data(receiving)!;
    const lines=(order.items||[]).map((line:any)=>{
      const draft=receiptDraft[line.lineId]||{delivered:0,rejected:0,reason:''};
      let delivered:number;let rejected:number;
      try{delivered=parseQuantity(draft.delivered,{integer:Boolean(line?.purchasePackageId)});rejected=parseQuantity(draft.rejected,{integer:Boolean(line?.purchasePackageId)})}catch{return null}
      if(rejected>delivered)return null;
      return {
        lineId:line.lineId,
        quantityDelivered:delivered,
        quantityAccepted:delivered-rejected,
        quantityRejected:rejected,
        rejectionReason:draft.reason
      };
    }).filter((line:any)=>line&&line.quantityDelivered>0);
    if(!lines.length)return;
    await command('purchaseOrder.receive','purchaseOrders',receiving.id,{
      purchaseOrderId:receiving.id,
      ...(lines.some((received:any)=>{const line=(order.items||[]).find((x:any)=>x.lineId===received.lineId);return line?.treatment==='STOCK'})?{locationId:receiptLocation}:{}),
      supplierInvoiceNumber:receiptInvoice.trim(),deliveryNote:receiptDeliveryNote.trim(),notes:receiptNotes.trim(),lines,...(receiptApprovalToken.trim()?{approvalToken:receiptApprovalToken.trim()}: {})
    });
    setReceiving(null);
  };

  const beginMatch=(payable:BusinessRecord)=>{
    setMatching(payable);
    setInvoiceNumber(String(data(payable)?.supplierInvoiceNumber||''));
    const terms=Number(data(record(records,'suppliers',String(data(payable)?.supplierId)))?.paymentTermsDays||0);
    const d=new Date();const due=new Date();due.setDate(due.getDate()+Math.max(0,terms));
    setInvoiceDate(d.toISOString().slice(0,10));setInvoiceDue(due.toISOString().slice(0,10));
  };

  const matchInvoice=async()=>{
    if(!matching)return;
    const p=data(matching)!;
    const receipt=record(records,'goodsReceipts',String(p.goodsReceiptId));if(!receipt)return;
    const lines=(data(receipt)?.lines||[]).filter((line:any)=>Number(line.quantityAccepted)>0).map((line:any)=>({
      lineId:line.lineId,quantityBilled:Number(line.quantityAccepted),unitPriceMinor:Number(line.unitPriceMinor)
    }));
    await command('supplierPayable.matchInvoice','supplierPayables',matching.id,{
      payableId:matching.id,invoiceNumber:invoiceNumber.trim(),
      invoiceAmountMinor:Number(p.amountMinor||0),invoiceDate,dueDate:invoiceDue,lines
    });
    setMatching(null);
  };

  const beginPay=(payable:BusinessRecord)=>{
    setPaying(payable);setPayAmount(Number(data(payable)?.amountDueMinor||0)/100);
    setPayMethod('BANK');setPayReference('');setPayReason('');setPayConfirmed(false);
  };

  const pay=async()=>{
    if(!paying)return;
    await command('supplierPayable.pay','supplierPayables',paying.id,{
      payableId:paying.id,amountMinor:Math.round(Number(payAmount)*100),method:payMethod,
      reference:payReference.trim(),reason:payReason.trim(),confirmed:payConfirmed
    });
    setPaying(null);
  };

  const beginCommission=(acquisition:BusinessRecord)=>{
    const d=data(acquisition)!;setCommissioning(acquisition);
    setCommissionForm({name:String(d.assetName||''),tag:'',serialNumber:'',roomId:'',locationId:locations[0]?.id||'',notes:''});
  };
  const commission=async()=>{
    if(!commissioning)return;
    const id=crypto.randomUUID();
    await command('asset.commission','assets',id,{
      id,acquisitionId:commissioning.id,...commissionForm,
      roomId:commissionForm.roomId||undefined,locationId:commissionForm.locationId||undefined
    });
    setCommissioning(null);
  };

  const openPoTotal=useMemo(()=>orders.filter(o=>['APPROVED','PARTIALLY_RECEIVED'].includes(String(data(o)?.status))).reduce((sum,o)=>sum+Number(data(o)?.grandTotalMinor||0),0),[orders]);
  const payableDue=useMemo(()=>payables.reduce((sum,p)=>sum+Number(data(p)?.amountDueMinor||0),0),[payables]);
  const receiptHasOverage=Boolean(receiving&&(data(receiving)?.items||[]).some((line:any)=>{const draft=receiptDraft[line.lineId]||{delivered:0,rejected:0,reason:''};return Number(line.quantityReceived||0)+Math.max(0,Number(draft.delivered||0)-Number(draft.rejected||0))>Number(line.quantityOrdered||0)+0.000001}));

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-xl font-bold"><Truck className="h-5 w-5 text-amber-300"/>Purchasing</h2><p className="mt-1 max-w-3xl text-sm text-slate-400">Create an order, check what arrived, and record supplier payments only after the money has actually been sent.</p></div>
      <div className="flex gap-2">{canManage&&<><button disabled={disabled} className={button} onClick={()=>openSupplier()}>New supplier</button><button disabled={disabled||!suppliers.length} className={primary} onClick={()=>{setPoSupplier(suppliers[0]?.id||'');setPoLines([]);setStockId(stockItems[0]?.id||'');setPurchasePackageId(String(data(stockItems[0])?.purchasePackages?.[0]?.id||''));setAssetCategoryId(categories[0]?.id||'');setPoOpen(true)}}><Plus className="mr-1 inline h-4 w-4"/>New PO</button></>}</div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<ClipboardCheck className="h-4 w-4"/>} label="Open purchase orders" value={String(orders.filter(o=>['APPROVED','PARTIALLY_RECEIVED'].includes(String(data(o)?.status))).length)}/>
      <Metric icon={<CreditCard className="h-4 w-4"/>} label="Payables due" value={money(payableDue)}/>
      <Metric icon={<PackageCheck className="h-4 w-4"/>} label="Pending assets" value={String(acquisitions.length)}/>
      <Metric icon={<Boxes className="h-4 w-4"/>} label="Open PO value" value={money(openPoTotal)}/>
    </div>

    <nav className="flex flex-wrap gap-2">
      {([
        ['ORDERS',`Purchase orders (${orders.length})`],
        ['RECEIPTS',`Goods receipts (${receipts.length})`],
        ['PAYABLES',`Payables (${payables.length})`],
        ['SUPPLIERS',`Suppliers (${suppliers.length})`],
        ['ACQUISITIONS',`Commissioning (${acquisitions.length})`]
      ] as const).map(([id,label])=><button key={id} className={section===id?primary:button} onClick={()=>setSection(id)}>{label}</button>)}
    </nav>

    {section==='ORDERS'&&<div className="space-y-3">{orders.map(order=>{const d=data(order)!;return <article key={order.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap justify-between gap-3"><div><b className="text-amber-300">{String(d.poNumber)}</b><div className="text-sm">{String(d.supplierName)}</div><div className="text-xs text-slate-500">{String(d.status)} · {new Date(String(d.createdAt)).toLocaleString()}</div></div><div className="text-right"><b>{money(d.grandTotalMinor)}</b>{canReceive&&['APPROVED','PARTIALLY_RECEIVED'].includes(String(d.status))&&<div><button disabled={disabled} className={button+' mt-2'} onClick={()=>beginReceive(order)}>Receive delivery</button></div>}</div></div><div className="mt-3 divide-y divide-slate-800">{(d.items||[]).map((line:any)=><div key={line.lineId} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{String(line.displayName)} <Tag>{String(line.treatment)}</Tag></span><span className="font-mono text-slate-400">{Number(line.quantityReceived||0)}/{Number(line.quantityOrdered)} {String(line.unitSymbol||'unit')} · {money(Number(line.unitPriceMinor)*Number(line.quantityOrdered))}</span></div>)}</div></article>})}{!orders.length&&<Empty>No purchase orders yet.</Empty>}</div>}

    {section==='RECEIPTS'&&<div className="space-y-3">{receipts.map(receipt=>{const d=data(receipt)!;return <article key={receipt.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap justify-between gap-3"><div><b className="text-emerald-300">{String(d.grnNumber)}</b><div className="text-sm">{String(d.poNumber)} · {String(d.supplierName)}</div><div className="text-xs text-slate-500">{new Date(String(d.receivedAt)).toLocaleString()} · {String(d.deliveryNote||'No delivery note')}</div></div><b>{canAccount?money(d.acceptedValueMinor):'Posted GRN'}</b></div><div className="mt-3 text-xs text-slate-400">{(d.lines||[]).map((line:any)=><div key={line.lineId}>{String(line.treatment)} · {String(line.displayName)} · accepted {Number(line.quantityAccepted)} / rejected {Number(line.quantityRejected)}</div>)}</div></article>})}{!receipts.length&&<Empty>No goods receipts yet.</Empty>}</div>}

    {section==='PAYABLES'&&<div className="space-y-3">{payables.map(payable=>{const d=data(payable)!;return <article key={payable.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap justify-between gap-3"><div><b>{String(d.payableNumber)}</b><div className="text-sm">{String(d.supplierName)} · {String(d.status)}</div><div className="text-xs text-slate-500">{String(d.grnNumber)} · {String(d.supplierInvoiceNumber||'Invoice not matched')}</div></div><div className="text-right"><b>{money(d.amountDueMinor)}</b><div className="mt-2 flex gap-2">{canManage&&d.status==='RECEIVED_UNINVOICED'&&<button disabled={disabled} className={button} onClick={()=>beginMatch(payable)}>Match invoice</button>}{canPay&&['MATCHED_UNPAID','PARTIALLY_PAID'].includes(String(d.status))&&<button disabled={disabled} className={primary} onClick={()=>beginPay(payable)}>Record payment</button>}</div></div></div></article>})}{payments.length>0&&<details className="rounded-xl border border-slate-800 p-4"><summary className="cursor-pointer font-semibold">Payment history ({payments.length})</summary><div className="mt-3 space-y-2">{payments.map(payment=>{const d=data(payment)!;return <div key={payment.id} className="rounded-lg bg-slate-900 p-3 text-sm">{String(d.paymentNumber)} · {String(d.supplierName)} · {money(d.amountMinor)} · {String(d.method)} · {String(d.reference)}</div>})}</div></details>}{!payables.length&&<Empty>No supplier payables yet.</Empty>}</div>}

    {section==='SUPPLIERS'&&<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{suppliers.map(supplier=>{const d=data(supplier)!;return <article key={supplier.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex justify-between gap-3"><div><b>{String(d.name)}</b><div className="font-mono text-xs text-slate-500">{String(d.code)}</div></div>{canManage&&<button disabled={disabled} className={button} onClick={()=>openSupplier(supplier)}>Edit</button>}</div><div className="mt-2 text-xs text-slate-400">{String(d.contactPerson||'')} {String(d.phone||'')}<br/>Terms: {Number(d.paymentTermsDays||0)} days</div>{canManage&&<button disabled={disabled} className={button+' mt-3'} onClick={()=>void command('supplier.archive','suppliers',supplier.id,{id:supplier.id})}>Archive</button>}</article>})}{!suppliers.length&&<Empty>No suppliers yet.</Empty>}</div>}

    {section==='ACQUISITIONS'&&<div className="grid gap-3 md:grid-cols-2">{acquisitions.map(acq=>{const d=data(acq)!;return <article key={acq.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><b>{String(d.assetName)}</b><div className="text-sm">{String(d.assetCategoryName)} · {money(d.unitCostMinor)}</div><div className="text-xs text-slate-500">{String(d.poNumber)} / {String(d.grnNumber)} · unit {String(d.unitOrdinal)}</div>{canAssets&&<button disabled={disabled} className={primary+' mt-3'} onClick={()=>beginCommission(acq)}>Commission asset</button>}</article>})}{!acquisitions.length&&<Empty>No capital assets waiting for commissioning.</Empty>}</div>}

    {supplierEdit!==undefined&&<Modal title={supplierEdit?'Edit supplier':'New supplier'} onClose={()=>setSupplierEdit(undefined)}><div className="grid gap-3 sm:grid-cols-2">
      <Input label="Name" value={supplierForm.name} set={value=>setSupplierForm({...supplierForm,name:value})}/>
      <Input label="Code" value={supplierForm.code} set={value=>setSupplierForm({...supplierForm,code:value.toUpperCase()})}/>
      <Input label="Phone" value={supplierForm.phone} set={value=>setSupplierForm({...supplierForm,phone:value})}/>
      <Input label="Email" value={supplierForm.email} set={value=>setSupplierForm({...supplierForm,email:value})}/>
      <Input label="Contact person" value={supplierForm.contactPerson} set={value=>setSupplierForm({...supplierForm,contactPerson:value})}/>
      <Input label="KRA PIN" value={supplierForm.kraPin} set={value=>setSupplierForm({...supplierForm,kraPin:value.toUpperCase()})}/>
      <label className="text-sm">Payment terms (days)<input type="number" min="0" max="3650" className={field} value={supplierForm.paymentTermsDays} onChange={e=>setSupplierForm({...supplierForm,paymentTermsDays:Number(e.target.value)})}/></label>
      <Input label="Notes" value={supplierForm.notes} set={value=>setSupplierForm({...supplierForm,notes:value})}/>
      <button disabled={disabled||!supplierForm.name.trim()||!supplierForm.code.trim()} className={primary} onClick={()=>void saveSupplier()}>Save supplier</button>
    </div></Modal>}

    {poOpen&&<Modal title="New purchase order" onClose={()=>setPoOpen(false)}><div className="space-y-4">
      <label className="block text-sm">Supplier<select className={field} value={poSupplier} onChange={e=>setPoSupplier(e.target.value)}>{suppliers.map(s=><option key={s.id} value={s.id}>{String(data(s)?.name)}</option>)}</select></label>
      <div className="rounded-xl border border-slate-800 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Treatment<select className={field} value={lineKind} onChange={e=>setLineKind(e.target.value as any)}><option>STOCK</option><option>EXPENSE</option><option>ASSET</option></select></label>
          {lineKind==='STOCK'&&<><label className="text-sm">Stock item<select className={field} value={stockId} onChange={e=>{const id=e.target.value;setStockId(id);const item=stockItems.find(value=>value.id===id);setPurchasePackageId(String(data(item)?.purchasePackages?.[0]?.id||''))}}>{stockItems.map(item=><option key={item.id} value={item.id}>{String(data(item)?.name)}</option>)}</select></label>{(Array.isArray(data(stockItems.find(item=>item.id===stockId))?.purchasePackages)&&data(stockItems.find(item=>item.id===stockId))!.purchasePackages.length>0)&&<label className="text-sm">Purchase package<select className={field} value={purchasePackageId} onChange={e=>setPurchasePackageId(e.target.value)}>{data(stockItems.find(item=>item.id===stockId))!.purchasePackages.map((pkg:any)=><option key={pkg.id} value={pkg.id}>{String(pkg.name)} · {Number(pkg.baseQuantity).toLocaleString()} {String(data(stockItems.find(item=>item.id===stockId))?.baseUnit||'units')}</option>)}</select></label>}</>}
          {lineKind==='EXPENSE'&&<><Input label="Expense description" value={expenseDescription} set={setExpenseDescription}/><label className="text-sm">Category<select className={field} value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)}><option>GENERAL</option><option>REPAIRS</option><option>MARKETING</option><option>UTILITIES</option></select></label></>}
          {lineKind==='ASSET'&&<><Input label="Asset name" value={assetName} set={setAssetName}/><label className="text-sm">Asset category<select className={field} value={assetCategoryId} onChange={e=>setAssetCategoryId(e.target.value)}>{categories.map(category=><option key={category.id} value={category.id}>{String(data(category)?.name)}</option>)}</select></label></>}
          <label className="text-sm">{lineKind==='STOCK'&&purchasePackageId?'Packages ordered':'Quantity'}<input type="number" min="0.001" step="0.001" className={field} value={lineQty} onChange={e=>setLineQty(Number(e.target.value))}/></label>
          <label className="text-sm">{lineKind==='STOCK'&&purchasePackageId?'Price per package (KES)':'Unit price (KES)'}<input type="number" min="0" step="0.01" className={field} value={linePrice} onChange={e=>setLinePrice(Number(e.target.value))}/></label>
        </div>
        <button className={button+' mt-3'} onClick={addDraftLine}>Add line</button>
      </div>
      <div className="space-y-2">{poLines.map(line=><div key={line.lineId} className="flex items-center justify-between rounded-lg bg-slate-950 p-3 text-sm"><span>{line.displayName} <Tag>{line.treatment}</Tag><br/><span className="text-xs text-slate-500">{line.quantityOrdered} × {money(line.unitPriceMinor)}</span></span><button className={button} onClick={()=>setPoLines(lines=>lines.filter(x=>x.lineId!==line.lineId))}>Remove</button></div>)}</div>
      <div className="flex items-center justify-between"><b>Total {money(poLines.reduce((sum,line)=>sum+Math.round(line.quantityOrdered*line.unitPriceMinor),0))}</b><button disabled={disabled||!poSupplier||!poLines.length} className={primary} onClick={()=>void submitPo()}>Create approved PO</button></div>
    </div></Modal>}

    {receiving&&<Modal title={`Receive ${String(data(receiving)?.poNumber)}`} onClose={()=>setReceiving(null)}><div className="space-y-4">
      {receiptHasOverage&&<p role="alert" className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-100">Accepted quantities exceed the approved PO balance. A manager approval token is required; rejected units do not count as received stock.</p>}
      {(data(receiving)?.items||[]).map((line:any)=>{const d=receiptDraft[line.lineId]||{delivered:0,rejected:0,reason:''};const outstanding=Math.max(0,Number(line.quantityOrdered||0)-Number(line.quantityReceived||0));return <div key={line.lineId} className="rounded-xl border border-slate-800 p-3"><div className="flex justify-between text-sm"><b>{String(line.displayName)}{line.purchasePackageName?` · ${line.purchasePackageName}`:''}</b><Tag>{String(line.treatment)}</Tag></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-sm">{line.purchasePackageId?'Packages delivered':'Delivered quantity'}<input type="number" min="0" step={line.purchasePackageId?'1':'0.001'} className={field} value={d.delivered} onChange={e=>{try{const value=parseQuantity(e.target.value,{integer:Boolean(line.purchasePackageId)});setReceiptDraft(prev=>({...prev,[line.lineId]:{...d,delivered:value}}))}catch{}}}/></label><label className="text-sm">Rejected<input type="number" min="0" step={line.purchasePackageId?'1':'0.001'} className={field} value={d.rejected} onChange={e=>{try{const value=parseQuantity(e.target.value,{integer:Boolean(line.purchasePackageId)});setReceiptDraft(prev=>({...prev,[line.lineId]:{...d,rejected:value}}))}catch{}}}/></label>{d.rejected>0&&<Input label="Rejection reason" value={d.reason} set={value=>setReceiptDraft(prev=>({...prev,[line.lineId]:{...d,reason:value}}))}/>}</div><div className="mt-1 text-xs text-slate-500">Remaining approved {line.purchasePackageId?'packages':'quantity'}: {outstanding}{line.purchasePackageId?` · ${(outstanding*Number(line.quantityBasePerPackage||1)).toLocaleString()} ${String(line.quantityBaseUnit||'base units')} stock units`:''} · defaulted to remaining</div></div>})}
      {(data(receiving)?.items||[]).some((line:any)=>line.treatment==='STOCK')&&<><label className="block text-sm">Receiving stock location<select className={field} value={receiptLocation} onChange={e=>setReceiptLocation(e.target.value)}>{locations.map(location=><option key={location.id} value={location.id}>{String(data(location)?.name)}</option>)}</select></label><label className="block text-sm"><Barcode className="mr-1 inline h-4 w-4"/>Scan stock barcode / SKU<input data-barcode-capture="true" className={field} value={scanCode} onChange={e=>setScanCode(e.target.value)}/></label><button className={button} disabled={!scanCode.trim()} onClick={()=>applyScan(scanCode)}>Apply typed scan</button></>}
      <Input label="Supplier invoice reference (optional until matching)" value={receiptInvoice} set={setReceiptInvoice}/>
      <Input label="Delivery note" value={receiptDeliveryNote} set={setReceiptDeliveryNote}/>
      <Input label="Manager approval token (required only when receiving above approved quantities)" value={receiptApprovalToken} set={setReceiptApprovalToken}/>
      <Input label="Receipt notes" value={receiptNotes} set={setReceiptNotes}/>
      <button disabled={disabled||receiptHasOverage&&!receiptApprovalToken.trim()} className={primary} onClick={()=>void postReceipt()}>Post GRN atomically</button>
    </div></Modal>}

    {matching&&<Modal title="Match supplier invoice" onClose={()=>setMatching(null)}><div className="space-y-3">
      <Input label="Invoice number" value={invoiceNumber} set={setInvoiceNumber}/>
      <label className="block text-sm">Invoice date<input type="date" className={field} value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></label>
      <label className="block text-sm">Due date<input type="date" className={field} value={invoiceDue} onChange={e=>setInvoiceDue(e.target.value)}/></label>
      <div className="rounded-lg bg-slate-950 p-3 text-sm">Exact three-way amount: <b>{money(data(matching)?.amountMinor)}</b><br/><span className="text-xs text-slate-500">The server compares every accepted GRN line to its approved PO quantity and price.</span></div>
      <button disabled={disabled||!invoiceNumber.trim()} className={primary} onClick={()=>void matchInvoice()}>Match invoice</button>
    </div></Modal>}

    {paying&&<Modal title="Record supplier payment" onClose={()=>setPaying(null)}><div className="space-y-3">
      <label className="block text-sm">Amount (KES)<input type="number" min="0.01" step="0.01" className={field} value={payAmount} onChange={e=>setPayAmount(Number(e.target.value))}/></label>
      <label className="block text-sm">Method<select className={field} value={payMethod} onChange={e=>setPayMethod(e.target.value as any)}><option>BANK</option><option>MPESA</option><option>CASH</option></select></label>
      <Input label="Payment reference" value={payReference} set={setPayReference}/>
      <Input label="Reason / note" value={payReason} set={setPayReason}/>
      <label className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-500/5 p-3 text-sm"><input className="mt-1" type="checkbox" checked={payConfirmed} onChange={e=>setPayConfirmed(e.target.checked)}/><span>I confirm the supplier has actually been paid. ServOS records settlement; it does not initiate a bank, cash or M-Pesa transfer.</span></label>
      <button disabled={disabled||!payConfirmed||!payReference.trim()||payAmount<=0} className={primary} onClick={()=>void pay()}>Record confirmed payment</button>
    </div></Modal>}

    {commissioning&&<Modal title="Commission capital asset" onClose={()=>setCommissioning(null)}><div className="space-y-3">
      <Input label="Asset name" value={commissionForm.name} set={value=>setCommissionForm({...commissionForm,name:value})}/>
      <Input label="Permanent asset tag" value={commissionForm.tag} set={value=>setCommissionForm({...commissionForm,tag:value})}/>
      <Input label="Serial number" value={commissionForm.serialNumber} set={value=>setCommissionForm({...commissionForm,serialNumber:value})}/>
      <label className="block text-sm">Room (optional)<select className={field} value={commissionForm.roomId} onChange={e=>setCommissionForm({...commissionForm,roomId:e.target.value,locationId:e.target.value?'':commissionForm.locationId})}><option value="">No room</option>{rooms.map(room=><option key={room.id} value={room.id}>{String(data(room)?.number)}</option>)}</select></label>
      <label className="block text-sm">Stock / physical location (optional)<select className={field} value={commissionForm.locationId} onChange={e=>setCommissionForm({...commissionForm,locationId:e.target.value,roomId:e.target.value?'':commissionForm.roomId})}><option value="">No stock location</option>{locations.map(location=><option key={location.id} value={location.id}>{String(data(location)?.name)}</option>)}</select></label>
      <Input label="Notes" value={commissionForm.notes} set={value=>setCommissionForm({...commissionForm,notes:value})}/>
      <div className="rounded-lg bg-slate-950 p-3 text-sm">Acquisition cost: <b>{money(data(commissioning)?.unitCostMinor)}</b>. Commissioning moves this value from Asset Clearing to Fixed Assets.</div>
      <button disabled={disabled||!commissionForm.name.trim()||!commissionForm.tag.trim()||(!commissionForm.roomId&&!commissionForm.locationId)} className={primary} onClick={()=>void commission()}>Commission asset</button>
    </div></Modal>}
  </section>;
}

const Metric=({icon,label,value}:{icon:React.ReactNode;label:string;value:string})=><div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2 text-xs uppercase text-slate-500">{icon}{label}</div><div className="mt-2 text-xl font-black">{value}</div></div>;
const Empty=({children}:{children:React.ReactNode})=><div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">{children}</div>;
const Tag=({children}:{children:React.ReactNode})=><span className="ml-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-black text-slate-300">{children}</span>;
const Input=({label,value,set}:{label:string;value:string;set:(value:string)=>void})=><label className="block text-sm">{label}<input className={field} value={value} onChange={e=>set(e.target.value)}/></label>;
const Modal=({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode})=><Dialog title={title} onClose={onClose}>{children}</Dialog>;
