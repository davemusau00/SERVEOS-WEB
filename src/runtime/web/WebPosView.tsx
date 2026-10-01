import React,{useCallback,useMemo,useState} from 'react';
import {Barcode,Banknote,CreditCard,Flame,Minus,Plus,Receipt,Search,ShieldAlert,Utensils,WalletCards} from 'lucide-react';
import {barcodeEquals,useBarcodeScanner} from '../../hooks/useBarcodeScanner';
import {allowed,type BusinessRecord,type WebSession} from './session';
import {businessDateTimeInput,businessDateTimeToUtc} from '../../utils/businessTime';
import {Dialog} from '../../design-system/controls';
import {operatorError} from './operatorError';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';
import type {ReceiptDocument} from '../../types/receipt';
import {ReceiptPrintRoot,receiptStyles} from '../../components/pos/ReceiptDocumentView';
import {receiptText} from '../../receipts/format';

type CommandFn=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const field='w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400';
const button='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-40';
const primary='rounded-lg bg-amber-400 px-3 py-2 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40';
const data=(record?:BusinessRecord)=>record?.data as Record<string,any>|undefined;
const orderEditable=(record?:BusinessRecord)=>!!record&&!['COMPLETED','VOIDED'].includes(String(data(record)?.state))&&Number(data(record)?.amountPaidMinor||0)===0;
const active=(records:BusinessRecord[],collection:string)=>records.filter(r=>r.collection===collection&&!r.archived);
const money=(minor:unknown)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(Number(minor||0)/100);
const toMinor=(value:string)=>{const amount=Number(value);if(!Number.isFinite(amount)||amount<0)throw new Error('Enter a valid nonnegative amount.');return Math.round(amount*100)};
const localDateTime=(timeZone:string)=>businessDateTimeInput(new Date(),timeZone);
const outcomeMessage=(outcome:CommandOutcome,action='Action')=>{switch(outcome.kind){case'CONFIRMED':return `${action} confirmed and synchronized.`;case'DRAFT_SAVED':return `${action} saved as a draft; no business transaction was completed.`;case'PENDING':return `${action} is waiting to synchronize. Do not submit it again.`;case'OUTCOME_UNKNOWN':case'REJECTED':case'CONFLICT':case'BLOCKED':return outcome.message}};
const cashChange=(tender:string,amount:string)=>{const cash=Number(tender||0),paid=Number(amount||0);return money(Number.isFinite(cash)&&Number.isFinite(paid)?Math.max(0,Math.round(cash*100)-Math.round(paid*100)):0)};
type TenderDraft={accountId:string;amount:string;cashTendered:string;reference:string;receivedAmount:string;receivedAt:string;confirmed:boolean};
const draftTender=(accountId:string,timeZone:string,amount=''):TenderDraft=>({accountId,amount,cashTendered:amount,reference:'',receivedAmount:amount,receivedAt:localDateTime(timeZone),confirmed:false});

export function WebPosView({records,session,disabled,command}:{records:BusinessRecord[];session:WebSession;disabled:boolean;command:CommandFn}){
 const timeZone=String(active(records,'property')[0]?.data.timezone||'Africa/Nairobi');
 const outlets=active(records,'outlets');
 const tables=active(records,'tables');
 const products=active(records,'products');
 const customers=active(records,'customers');
 const creditAccounts=active(records,'customerCreditAccounts');
 const creditEntries=active(records,'customerCreditEntries');
 const roomReservations=active(records,'roomReservations');
 const folios=active(records,'folios');
 const orders=active(records,'orders');
 const openOrders=orders.filter(order=>!['COMPLETED','VOIDED'].includes(String(data(order)?.state)));
 const recentOrders=orders.slice().sort((a,b)=>String(data(b)?.createdAt||'').localeCompare(String(data(a)?.createdAt||''))).slice(0,40);
 const [outletId,setOutletId]=useState(outlets[0]?.id||'');
 const [activeId,setActiveId]=useState(openOrders[0]?.id||'');
 const [query,setQuery]=useState('');
 const [notice,setNoticeState]=useState('');const setNotice=(message:string)=>setNoticeState(message?operatorError(message):'');
 const [newTab,setNewTab]=useState(false);
 const [tabName,setTabName]=useState('');
 const [customerId,setCustomerId]=useState('');
 const [config,setConfig]=useState<{product:BusinessRecord;quantity:number;portionId:string;modifierIds:string[]}|null>(null);
 const [voiding,setVoiding]=useState(false);
 const [voidReason,setVoidReason]=useState('');
 const [voidDisposition,setVoidDisposition]=useState('WASTE');
 const [paying,setPaying]=useState(false);
 const [tenders,setTenders]=useState<TenderDraft[]>([]);
 const [openingFloat,setOpeningFloat]=useState('');
 const [refundTarget,setRefundTarget]=useState<BusinessRecord|null>(null);
 const [refundAmount,setRefundAmount]=useState('');
 const [refundReason,setRefundReason]=useState('');
 const [refundReference,setRefundReference]=useState('');
 const [refundConfirmed,setRefundConfirmed]=useState(false);
 const [printReceipt,setPrintReceipt]=useState<ReceiptDocument|null>(null);
 const finishReceiptPrint=useCallback(()=>setPrintReceipt(null),[]);
  const [posDialog,setPosDialog]=useState<'ROOM'|'MOVE'|'MERGE'|'DISCOUNT'|'COMP'|null>(null);
  const [targetTableId,setTargetTableId]=useState('');
  const [discountPercent,setDiscountPercent]=useState('10');
  const [posReason,setPosReason]=useState('');
 const [roomFolioId,setRoomFolioId]=useState('');
 const [creditApprovalOpen,setCreditApprovalOpen]=useState(false);const [creditApprovalToken,setCreditApprovalToken]=useState('');

 const activeOrder=orders.find(order=>order.id===activeId)||openOrders[0];
 const currentOutlet=outlets.find(outlet=>outlet.id===outletId)||outlets[0];
 const visible=useMemo(()=>products.filter(product=>{
   const d=data(product)!;const q=query.trim().toLowerCase();
   const outletIds=Array.isArray(d.outletIds)?d.outletIds:[];
   return (!outletId||outletIds.length===0||outletIds.includes(outletId))
     &&(!q||[d.name,d.code,d.barcode,d.category].some(value=>String(value||'').toLowerCase().includes(q)));
 }),[products,outletId,query]);

 const canSell=allowed(session,'pos.sell');
 const canOpen=allowed(session,'pos.open_tab');
 const canFire=allowed(session,'order.fire')||canSell;
 const canVoid=allowed(session,'order.void');
 const canTable=allowed(session,'pos.manage_table');
 const canPay=allowed(session,'payment.record');
 const accounts=active(records,'paymentAccounts').filter(account=>['CASH','MPESA','CARD'].includes(String(data(account)?.method||'')));
 const openTill=active(records,'tillSessions').find(till=>data(till)?.status==='OPEN');
 const orderPayments=active(records,'payments').filter(payment=>data(payment)?.orderId===activeOrder?.id);
 const refunds=active(records,'refunds').filter(refund=>data(refund)?.orderId===activeOrder?.id);
 const orderReceipts=active(records,'receiptDocuments').filter(receipt=>data(receipt)?.orderId===activeOrder?.id).sort((a,b)=>String(data(b)?.issuedAt||'').localeCompare(String(data(a)?.issuedAt||'')));
  const folioTargets=roomReservations.filter(reservation=>String(data(reservation)?.status)==='CHECKED_IN').map(reservation=>{const folio=folios.find(row=>String(data(row)?.reservationId||row.id)===reservation.id);const room=active(records,'rooms').find(row=>row.id===String(data(reservation)?.roomId));const guest=customers.find(row=>row.id===String(data(reservation)?.customerId));return folio?{folioId:folio.id,folioVersion:folio.version,balanceMinor:Number(data(folio)?.balanceMinor||0),roomNumber:String(data(room)?.number||data(room)?.label||''),guestName:String(data(guest)?.name||'Guest')}:null}).filter(Boolean) as Array<{folioId:string;folioVersion:number;balanceMinor:number;roomNumber:string;guestName:string}>;

 const run=async(operation:string,collection:string,id:string,payload:Record<string,unknown>):Promise<CommandOutcome>=>{
   setNotice('');
   try{const outcome=await command(operation,collection,id,payload);setNotice(outcomeMessage(outcome));return outcome}
   catch(error){const message=operatorError(error);setNotice(message);return {kind:'BLOCKED',message}}
 };

 const createOrder=async(input:{name:string;tableId?:string;customerId?:string})=>{
   if(!currentOutlet)return;
   const id=crypto.randomUUID();
   const outcome=await run('order.create','orders',id,{id,outletId:currentOutlet.id,...input});
   if(!isCommandConfirmed(outcome))return;
   setActiveId(id);setNewTab(false);setTabName('');setCustomerId('');
 };

 const addProduct=(product:BusinessRecord)=>{
   if(!activeOrder){setNotice('Open or select a tab before adding a product.');return}
   if(!orderEditable(activeOrder)){setNotice('This order is no longer editable. Open a new tab for additional items.');return}
   const d=data(product)!;const portions=Array.isArray(d.portions)?d.portions:[];const modifiers=Array.isArray(d.modifiers)?d.modifiers:[];
   if(portions.length||modifiers.length){
     setConfig({product,quantity:1,portionId:String(portions[0]?.id||''),modifierIds:[]});
     return;
   }
   void run('order.addItem','orders',activeOrder.id,{orderId:activeOrder.id,productId:product.id,itemId:crypto.randomUUID(),quantity:1,modifierIds:[]});
 };

 const applyScan=(raw:string)=>{
   const code=raw.trim();if(!code)return;
   const matches=visible.filter(product=>barcodeEquals(String(data(product)?.barcode||''),code)||barcodeEquals(String(data(product)?.code||''),code));
   setQuery('');
   if(matches.length!==1){setNotice(matches.length?'Barcode matches more than one sellable. Resolve the duplicate catalog assignment.':'Barcode is not assigned to a sellable in this outlet.');return}
   addProduct(matches[0]);
 };
 useBarcodeScanner({enabled:!config&&!newTab&&!voiding,onScan:applyScan,allowTabTerminator:true,maxInterKeyDelayMs:150});

 const updateQty=async(item:any,next:number)=>{
   if(!orderEditable(activeOrder)||item.stockFired)return;
   if(next<=0)await run('order.removeItem','orders',activeOrder.id,{orderId:activeOrder.id,itemId:item.id});
   else await run('order.updateItem','orders',activeOrder.id,{orderId:activeOrder.id,itemId:item.id,quantity:next});
 };

 const saveConfigured=async()=>{
   if(!config||!activeOrder)return;
   const outcome=await run('order.addItem','orders',activeOrder.id,{
     orderId:activeOrder.id,productId:config.product.id,itemId:crypto.randomUUID(),quantity:config.quantity,
     portionId:config.portionId||undefined,modifierIds:config.modifierIds
   });
   if(isCommandConfirmed(outcome))setConfig(null);
 };

 const voidOrder=async()=>{
   if(!activeOrder||!voidReason.trim())return;
   const outcome=await run('order.void','orders',activeOrder.id,{orderId:activeOrder.id,reason:voidReason.trim(),disposition:voidDisposition});
   if(isCommandConfirmed(outcome)){setVoiding(false);setVoidReason('')}
 };

 const total=Number(data(activeOrder)?.grandTotalMinor||0);
 const paid=Number(data(activeOrder)?.amountPaidMinor||0);
 const balance=Math.max(0,total-paid);
 const activeCustomerId=String(data(activeOrder)?.customerId||'');
 const creditAccount=creditAccounts.find(account=>String(data(account)?.customerId)===activeCustomerId);
 const creditBalance=creditEntries.filter(entry=>String(data(entry)?.customerId)===activeCustomerId).reduce((sum,entry)=>sum+Number(data(entry)?.balanceDeltaMinor||0),0);
  const creditLimit=Number((data(creditAccount)?.creditLimitMinor??data(creditAccount)?.limitMinor)||0);
 const creditAvailable=Math.max(0,creditLimit-creditBalance);
 const startPayment=()=>{const cash=accounts.find(a=>data(a)?.method==='CASH');const accountId=cash?.id||accounts[0]?.id||'';setTenders([draftTender(accountId,timeZone,(balance/100).toFixed(2))]);setPaying(true)};
 const submitPayment=async()=>{
   if(!activeOrder||!tenders.length)return;
   const paymentLines=tenders.map(line=>{const account=accounts.find(a=>a.id===line.accountId);const method=String(data(account)?.method||'');
     if(!account)throw new Error('Select an active payment account.');
     if(method==='MPESA'&&!allowed(session,'mpesa.record'))throw new Error('Your role cannot record M-Pesa payments.');
     const common={accountId:account.id,amountMinor:toMinor(line.amount)};
     if(method==='CASH')return {...common,cashTenderedMinor:toMinor(line.cashTendered)};
     if(!line.confirmed)throw new Error('Confirm that you manually verified the external payment.');
     if(method==='MPESA')return {...common,reference:line.reference.trim(),receivedAmountMinor:toMinor(line.receivedAmount),receivedAt:businessDateTimeToUtc(line.receivedAt,timeZone),manuallyConfirmed:true};
     return {...common,reference:line.reference.trim(),manuallyConfirmed:true};
   });
   const sum=paymentLines.reduce((n,line)=>n+line.amountMinor,0);
   if(paymentLines.some(line=>line.amountMinor<=0))throw new Error('Every tender amount must be greater than zero.');
   if(paymentLines.length>1&&sum!==balance)throw new Error('Split tender amounts must equal the entire outstanding balance.');
   if(sum>balance)throw new Error('Payment exceeds the outstanding balance.');
   const payload=paymentLines.length===1?{orderId:activeOrder.id,...paymentLines[0]}:{orderId:activeOrder.id,payments:paymentLines};
   const outcome=await run(paymentLines.length===1?'payment.record':'payment.split','orders',activeOrder.id,payload);
   if(isCommandConfirmed(outcome)){setPaying(false);setTenders([])}
 };
  const chargeToAccount=async(approvalToken='')=>{
    if(!activeOrder||!activeCustomerId||balance<=0)return;
    if(!allowed(session,'credit.charge'))throw new Error('Your role cannot charge customer accounts.');
    if(!creditAccount||String(data(creditAccount)?.status||'ACTIVE')!=='ACTIVE')throw new Error('Select a customer with an active credit account.');
    if(balance>creditAvailable&&!approvalToken.trim())throw new Error(`Credit limit exceeded. Available credit is ${money(creditAvailable)}. Manager approval is required.`);
    const outcome=await run('credit.charge','orders',activeOrder.id,{orderId:activeOrder.id,customerId:activeCustomerId,amountMinor:balance,notes:'POS charge to customer account',approvalToken:approvalToken.trim()||undefined});if(isCommandConfirmed(outcome)){setCreditApprovalOpen(false);setCreditApprovalToken('')}
  };
 const submitOpenTill=async()=>{const id=crypto.randomUUID();const outcome=await run('till.open','tillSessions',id,{id,openingFloatMinor:toMinor(openingFloat)});if(isCommandConfirmed(outcome))setOpeningFloat('')};
 const refundedFor=(paymentId:string)=>refunds.filter(refund=>data(refund)?.paymentId===paymentId).reduce((sum,refund)=>sum+Number(data(refund)?.amountMinor||0),0);
 const beginRefund=(payment:BusinessRecord)=>{setRefundTarget(payment);setRefundAmount(((Number(data(payment)?.amountMinor||0)-refundedFor(payment.id))/100).toFixed(2));setRefundReason('');setRefundReference('');setRefundConfirmed(false)};
 const submitRefund=async(reverse=false)=>{
   if(!refundTarget)return;
   const payload={paymentId:refundTarget.id,reason:refundReason.trim(),...(reverse?{}:{amountMinor:toMinor(refundAmount)}),...(refundReference.trim()?{externalReference:refundReference.trim(),manuallyConfirmed:refundConfirmed}:{})};
   const outcome=await run(reverse?'payment.reverse':'payment.refund','payments',refundTarget.id,payload);
   if(isCommandConfirmed(outcome))setRefundTarget(null);
 };
  const submitPosAction=async()=>{if(!activeOrder)return;const target=targetTableId;const targetTable=tables.find(table=>table.id===target);const op=posDialog==='MOVE'?'order.transfer':posDialog==='MERGE'?'order.merge':posDialog==='DISCOUNT'?'order.discount':'order.comp';const payload=posDialog==='ROOM'?{orderId:activeOrder.id,folioId:roomFolioId,folioVersion:folioTargets.find(row=>row.folioId===roomFolioId)?.folioVersion}:{orderId:activeOrder.id,...(posDialog==='MOVE'||posDialog==='MERGE'?{sourceTableId:String(data(activeOrder)?.tableId||''),targetTableId:target,targetOrderId:String(data(targetTable)?.currentOrderId||'')}:{percent:Number(discountPercent),reason:posReason.trim(),...(posDialog==='COMP'?{compReason:posReason.trim()}: {})})};const outcome=await run(posDialog==='ROOM'?'pos.roomCharge':op,'orders',activeOrder.id,payload);if(isCommandConfirmed(outcome)){setPosDialog(null);setPosReason('')}};
 const receiptDocument=(record:BusinessRecord):ReceiptDocument=>{const d=data(record)||{};return {id:record.id,schemaVersion:Number(d.schemaVersion)===2?2:1,orderId:String(d.orderId||''),number:String(d.number||''),orderNumber:String(d.orderNumber||''),issuedAt:String(d.issuedAt||''),currency:String(d.currency||'KES'),timezone:String(d.timezone||'Africa/Nairobi'),business:(d.business||{name:'Business'}) as ReceiptDocument['business'],outlet:String(d.outlet||''),cashier:String(d.cashier||'Cashier'),customerName:String(d.customerName||''),table:String(d.table||''),tab:String(d.tab||''),message:String(d.message||''),brandingSnapshot:d.brandingSnapshot as ReceiptDocument['brandingSnapshot'],items:(Array.isArray(d.items)?d.items:[]).map((item:any)=>({id:String(item.id||''),description:String(item.description||'Item'),quantity:Number(item.quantity||0),unitPriceMinor:Number(item.unitPriceMinor||0),amountMinor:Number(item.amountMinor||0),portion:typeof item.portion==='string'?item.portion:undefined,modifiers:Array.isArray(item.modifiers)?item.modifiers.map((modifier:any)=>typeof modifier==='string'?modifier:String(modifier.name||'')):[]})),subtotalMinor:Number(d.subtotalMinor||0),discountMinor:Number(d.discountMinor||0),netMinor:Number(d.netMinor||0),taxMinor:Number(d.taxMinor||0),levyMinor:Number(d.levyMinor||0),totalMinor:Number(d.totalMinor||0),paidMinor:Number(d.paidMinor||0),creditedMinor:Number(d.creditedMinor||0),balanceMinor:Number(d.balanceMinor||0),payments:(Array.isArray(d.payments)?d.payments:[]).map((payment:any)=>({id:String(payment.id||''),tenderType:String(payment.tenderType||payment.method||'Payment'),amountMinor:Number(payment.amountMinor||0),reference:typeof payment.reference==='string'?payment.reference:undefined,cashTenderedMinor:payment.cashTenderedMinor==null?null:Number(payment.cashTenderedMinor),changeMinor:payment.changeMinor==null?null:Number(payment.changeMinor)}))};};
 const downloadReceipt=(receipt:BusinessRecord)=>{const d=receiptDocument(receipt);const url=URL.createObjectURL(new Blob([receiptText(d)],{type:'text/plain;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`${String(d.number||receipt.id)}.txt`;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)};

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-xl font-bold"><Utensils className="h-5 w-5 text-amber-300"/>Service workspace</h2><p className="mt-1 text-sm text-slate-400">Online orders and manually confirmed tenders · offline payment finalization is disabled.</p></div>
      <div className="flex flex-wrap gap-2">
        {canOpen&&<><button disabled={disabled||!currentOutlet} className={primary} onClick={()=>void createOrder({name:`Walk-in ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`})}><Plus className="h-4 w-4"/>Quick tab</button><button disabled={disabled||!currentOutlet} className={button} onClick={()=>setNewTab(true)}>Named tab</button></>}
     </div>
   </div>

    <div className="grid gap-3 sm:grid-cols-3"><PosMetric icon={<Receipt className="h-4 w-4"/>} label="Open tabs" value={String(openOrders.length)}/><PosMetric icon={<Search className="h-4 w-4"/>} label="Menu matches" value={String(visible.length)}/><PosMetric icon={<Banknote className="h-4 w-4"/>} label="Till" value={openTill?'OPEN':'CLOSED'} tone={openTill?'text-emerald-200':'text-amber-200'}/></div>

   <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
     <div className="space-y-4">
       <div className="grid gap-2 md:grid-cols-[220px_1fr]">
         <select className={field} value={outletId} onChange={e=>setOutletId(e.target.value)}>{outlets.map(outlet=><option key={outlet.id} value={outlet.id}>{String(data(outlet)?.name)}</option>)}</select>
         <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input data-barcode-capture="true" className={field+' pl-9'} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search or scan barcode / SKU"/></label>
       </div>

        {tables.some(table=>data(table)?.outletId===outletId)&&<div className="flex gap-2 overflow-x-auto pb-1">
          {tables.filter(table=>data(table)?.outletId===outletId).map(table=>{const d=data(table)!;const state=String(d.state||'AVAILABLE');return <button key={table.id} disabled={disabled||(!canOpen&&state==='AVAILABLE')||(!canTable&&state==='CLEANING')||!['AVAILABLE','CLEANING'].includes(state)} onClick={()=>state==='CLEANING'?void run('table.ready','tables',table.id,{tableId:table.id}):void createOrder({name:`Table ${String(d.label)}`,tableId:table.id})} className={`min-w-28 rounded-xl border p-3 text-left ${state==='AVAILABLE'?'border-emerald-700 bg-emerald-950/30':state==='CLEANING'?'border-amber-700 bg-amber-950/30':'border-slate-800 bg-slate-900 opacity-60'}`}><b className="block">{String(d.label)}</b><span className="text-xs text-slate-400">{state}</span></button>})}
       </div>
        }

       <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
         {visible.map(product=>{const d=data(product)!;return <button key={product.id} disabled={disabled||!canSell||!activeOrder} onClick={()=>addProduct(product)} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-amber-500 disabled:opacity-40"><div className="text-[10px] font-black uppercase text-slate-500">{String(d.category||d.routeTo||'ITEM')}</div><div className="mt-1 font-bold">{String(d.name)}</div><div className="mt-2 text-amber-300">{money(d.priceMinor)}</div>{d.barcode&&<div className="mt-2 flex items-center gap-1 font-mono text-[10px] text-slate-600"><Barcode className="h-3 w-3"/>{String(d.barcode)}</div>}</button>})}
       </div>
        {visible.length===0&&<div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-800 text-amber-300"><Utensils className="h-6 w-6"/></span><h3 className="mt-3 font-bold">No menu items to show</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{products.length?'Try a different search or select another outlet.':'Add products to the catalog and assign them to an outlet before opening for service.'}</p></div>}
     </div>

      <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-black/10">
       {!openTill&&<div className="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 p-3"><b className="text-sm">No open till</b>{allowed(session,'till.open')?<div className="mt-2 flex gap-2"><label className="sr-only" htmlFor="web-opening-float">Opening float in KES</label><input id="web-opening-float" aria-label="Opening float in KES" type="number" min="0" step="0.01" className={field} value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)} placeholder="Opening float (KES)"/><button disabled={disabled||openingFloat==='' } className={primary} onClick={()=>void submitOpenTill().catch(e=>setNotice(String(e)))}>Open till</button></div>:<p className="mt-1 text-xs text-slate-400">A till operator must open a till before accepting payments.</p>}</div>}
       <div className="mb-4"><div className="text-[10px] font-black uppercase tracking-widest text-amber-400">Active tab / receipt history</div><select aria-label="Select order or receipt history" className={field} value={activeOrder?.id||''} onChange={e=>setActiveId(e.target.value)}><option value="">Select order</option>{recentOrders.map(order=><option key={order.id} value={order.id}>{String(data(order)?.tabName||data(order)?.orderNumber)} · {String(data(order)?.state)} · {money(data(order)?.grandTotalMinor)}</option>)}</select></div>
       {!activeOrder?<div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">Open a quick tab, named tab or available table.</div>:<>
         <div className="space-y-2">{(data(activeOrder)?.items||[]).filter((item:any)=>item.state!=='VOIDED').map((item:any)=><div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="flex justify-between gap-3"><div><b>{String(item.productName)}</b><div className="text-xs text-slate-500">{String(item.portionSnapshot?.name||'')}{item.modifiers?.length?` · ${item.modifiers.map((m:any)=>m.name).join(', ')}`:''}</div><div className="text-xs text-slate-600">{String(item.courseStatus)} · round {Number(item.roundNo||1)}</div></div><b>{money(item.lineTotalMinor)}</b></div><div className="mt-2 flex items-center gap-1"><button disabled={disabled||!orderEditable(activeOrder)||item.stockFired} className={button} onClick={()=>void updateQty(item,Number(item.quantity)-1)}><Minus className="h-3 w-3"/></button><span className="px-3 text-sm">{Number(item.quantity)}</span><button disabled={disabled||!orderEditable(activeOrder)||item.stockFired} className={button} onClick={()=>void updateQty(item,Number(item.quantity)+1)}><Plus className="h-3 w-3"/></button>{item.stockFired&&<span className="ml-auto rounded bg-slate-800 px-2 py-1 text-[10px] font-black">{String(item.courseStatus)}</span>}</div></div>)}</div>
         <div className="mt-4 space-y-1 border-t border-slate-800 pt-3 text-sm"><div className="flex justify-between"><span>Net</span><span>{money(data(activeOrder)?.subtotalMinor)}</span></div><div className="flex justify-between"><span>Tax</span><span>{money(data(activeOrder)?.taxTotalMinor)}</span></div><div className="flex justify-between"><span>Levy</span><span>{money(data(activeOrder)?.cateringLevyTotalMinor)}</span></div><div className="flex justify-between text-lg font-bold"><span>Total</span><span>{money(total)}</span></div><div className="flex justify-between text-amber-300"><span>Outstanding</span><span>{money(balance)}</span></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button data-guide-anchor="pos.fire" disabled={disabled||!canFire||!orderEditable(activeOrder)} className={primary} onClick={()=>void run('order.fire','orders',activeOrder.id,{orderId:activeOrder.id})}><Flame className="mr-1 inline h-4 w-4"/>Fire</button><button data-guide-anchor="pos.payment" disabled={disabled||!canPay||!openTill||!accounts.length||balance<=0||['COMPLETED','VOIDED'].includes(String(data(activeOrder)?.state))} className={button} onClick={startPayment}><Banknote className="mr-1 inline h-4 w-4"/>Take payment</button>{allowed(session,'folio.room_charge')&&<button disabled={disabled||!folioTargets.length||balance<=0||['COMPLETED','VOIDED'].includes(String(data(activeOrder)?.state))} className={button} onClick={()=>{setRoomFolioId(folioTargets[0]?.folioId||'');setPosDialog('ROOM')}}>Charge room</button>}{allowed(session,'credit.charge')&&<button disabled={disabled||!activeCustomerId||!creditAccount||balance<=0||['COMPLETED','VOIDED'].includes(String(data(activeOrder)?.state))} className={button} onClick={()=>{if(balance>creditAvailable){setCreditApprovalToken('');setCreditApprovalOpen(true)}else void chargeToAccount().catch(error=>setNotice(String(error)))}}><WalletCards className="mr-1 inline h-4 w-4"/>Charge to account</button>}{canTable&&<><button disabled={disabled||!data(activeOrder)?.tableId} className={button} onClick={()=>{setTargetTableId('');setPosDialog('MOVE')}}>Transfer table</button><button disabled={disabled||!data(activeOrder)?.tableId} className={button} onClick={()=>{setTargetTableId('');setPosDialog('MERGE')}}>Merge table</button></>}{allowed(session,'order.discount')&&<button disabled={disabled||!orderEditable(activeOrder)} className={button} onClick={()=>setPosDialog('DISCOUNT')}>Discount</button>}{allowed(session,'order.comp')&&<button disabled={disabled||!orderEditable(activeOrder)} className={button} onClick={()=>setPosDialog('COMP')}>Comp</button>}<button disabled={disabled||!canSell||!orderEditable(activeOrder)||!(data(activeOrder)?.items||[]).some((item:any)=>item.stockFired)} className={button} onClick={()=>void run('order.repeatRound','orders',activeOrder.id,{orderId:activeOrder.id})}>Repeat round</button><button disabled={disabled||!canVoid||!orderEditable(activeOrder)} className={button} onClick={()=>setVoiding(true)}><ShieldAlert className="mr-1 inline h-4 w-4"/>Void</button></div>
          {activeCustomerId&&<p className="mt-2 text-xs text-slate-500">Customer account: {creditAccount?`available ${money(creditAvailable)}`:'not configured'} · charge-to-account is an internal receivable, not a cash, M-Pesa, or card receipt.</p>}
         {orderPayments.length>0&&<section className="mt-4 border-t border-slate-800 pt-3"><h3 className="text-sm font-bold">Recorded tenders</h3><ul className="mt-2 space-y-2 text-xs text-slate-300">{orderPayments.map(payment=>{const available=Math.max(0,Number(data(payment)?.amountMinor||0)-refundedFor(payment.id));return <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2"><span>{String(data(payment)?.method)}{data(payment)?.reference?` · ${String(data(payment)?.reference)}`:''} · refundable {money(available)}</span><span>{money(data(payment)?.amountMinor)}</span><span className="flex gap-1">{allowed(session,'order.refund')&&available>0&&<button disabled={disabled||(!openTill&&data(payment)?.method==='CASH')} className={button} onClick={()=>beginRefund(payment)}>Refund</button>}{allowed(session,'payment.reverse')&&available>0&&<button disabled={disabled||(!openTill&&data(payment)?.method==='CASH')} className={button} onClick={()=>beginRefund(payment)}>Reverse remaining</button>}</span></li>})}</ul>{refunds.length>0&&<div className="mt-2 text-xs text-slate-400">Refund history: {refunds.map(refund=>`${money(data(refund)?.amountMinor)} · ${String(data(refund)?.reason)}`).join('; ')}</div>}</section>}
          {orderReceipts.length>0&&<details data-guide-anchor="pos.receipt-history" className="mt-3 border-t border-slate-800 pt-3"><summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"><Receipt className="h-4 w-4"/>Receipt history ({orderReceipts.length})</summary><div className="mt-2 space-y-3">{orderReceipts.map(receipt=>{const d=data(receipt)!;return <article key={receipt.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs"><div className="flex justify-between"><b>{String(d.number)}</b><span>{new Date(String(d.issuedAt)).toLocaleString()}</span></div><p>{String(d.business?.name||'Business')} · {String(d.outlet||'')}</p><ul className="my-2">{(d.items||[]).map((item:any)=><li key={item.id} className="flex justify-between"><span>{Number(item.quantity)} × {String(item.description)}</span><span>{money(item.amountMinor)}</span></li>)}</ul><div className="flex justify-between border-t border-slate-800 pt-2"><b>Total {money(d.totalMinor)}</b><span>Paid {money(d.paidMinor)} · Due {money(d.balanceMinor)}</span></div><p className="mt-2 text-slate-500">{String(d.message||'')} · Manually recorded tender evidence</p><div className="mt-2 flex gap-2"><button className={button} onClick={()=>setPrintReceipt(receiptDocument(receipt))}>Print selected receipt</button><button className={button} onClick={()=>downloadReceipt(receipt)}>Download</button></div></article>})}</div></details>}
       </>}
       {notice&&<p className="mt-3 rounded-lg bg-slate-950 p-2 text-xs text-slate-300">{notice}</p>}
     </aside>
   </div>

   {newTab&&<Modal title="Open named tab" onClose={()=>setNewTab(false)}><div className="space-y-3"><label className="block text-sm">Tab name<input className={field} value={tabName} onChange={e=>setTabName(e.target.value)} placeholder="Kamau, Birthday group, Pool table"/></label><label className="block text-sm">Customer (optional)<select className={field} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">No linked customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{String(data(customer)?.name)}</option>)}</select></label><button disabled={disabled||!(tabName.trim()||customerId)} className={primary} onClick={()=>void createOrder({name:tabName.trim()||String(data(customers.find(c=>c.id===customerId))?.name||'Named tab'),customerId:customerId||undefined})}>Open tab</button></div></Modal>}
   {creditApprovalOpen&&<Modal title="Manager approval required" onClose={()=>setCreditApprovalOpen(false)}><div className="space-y-3"><p className="text-sm text-amber-100">This charge exceeds available credit by {money(Math.max(0,balance-creditAvailable))}. A manager must issue an approval for this exact sale.</p><label className="block text-sm">Single-use manager approval token<input autoFocus autoComplete="off" className={field} value={creditApprovalToken} onChange={event=>setCreditApprovalToken(event.target.value)}/></label><div className="flex justify-end gap-2"><button className={button} onClick={()=>setCreditApprovalOpen(false)}>Cancel</button><button disabled={disabled||!creditApprovalToken.trim()} className={primary} onClick={()=>void chargeToAccount(creditApprovalToken).catch(error=>setNotice(String(error)))}>Submit approved charge</button></div></div></Modal>}

   {config&&<Modal title={`Configure ${String(data(config.product)?.name)}`} onClose={()=>setConfig(null)}><div className="space-y-3"><label className="block text-sm">Quantity<input type="number" min="0.001" step="0.001" className={field} value={config.quantity} onChange={e=>setConfig({...config,quantity:Number(e.target.value)})}/></label>{Array.isArray(data(config.product)?.portions)&&data(config.product)!.portions.length>0&&<label className="block text-sm">Portion<select className={field} value={config.portionId} onChange={e=>setConfig({...config,portionId:e.target.value})}>{data(config.product)!.portions.map((portion:any)=><option key={portion.id} value={portion.id}>{String(portion.name)} · {money(portion.priceMinor)}</option>)}</select></label>}{Array.isArray(data(config.product)?.modifiers)&&data(config.product)!.modifiers.length>0&&<div><div className="mb-2 text-sm">Modifiers</div>{data(config.product)!.modifiers.map((modifier:any)=><label key={modifier.id} className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.modifierIds.includes(modifier.id)} onChange={e=>setConfig({...config,modifierIds:e.target.checked?[...config.modifierIds,modifier.id]:config.modifierIds.filter(id=>id!==modifier.id)})}/>{String(modifier.name)} {Number(modifier.priceDeltaMinor||0)>0?`(+${money(modifier.priceDeltaMinor)})`:''}</label>)}</div>}<button disabled={disabled||config.quantity<=0} className={primary} onClick={()=>void saveConfigured()}>Add to tab</button></div></Modal>}
    {posDialog&&<Modal title={posDialog==='ROOM'?'Charge checked-in room':posDialog==='MOVE'?'Transfer table':posDialog==='MERGE'?'Merge table':posDialog==='DISCOUNT'?'Apply discount':'Record comp'} onClose={()=>setPosDialog(null)}><div className="space-y-3">{posDialog==='ROOM'&&<><label className="block text-sm">Checked-in folio<select className={field} value={roomFolioId} onChange={e=>setRoomFolioId(e.target.value)}>{folioTargets.map(target=><option key={target.folioId} value={target.folioId}>Room {target.roomNumber} · {target.guestName} · {money(target.balanceMinor)}</option>)}</select></label><p className="text-xs text-slate-400">This posts an internal guest receivable and completes the order without a cash, M-Pesa, or card tender.</p></>}{(posDialog==='MOVE'||posDialog==='MERGE')&&<label className="block text-sm">Target table<select className={field} value={targetTableId} onChange={e=>setTargetTableId(e.target.value)}><option value="">Select target</option>{tables.filter(table=>table.id!==String(data(activeOrder)?.tableId)).map(table=><option key={table.id} value={table.id}>{String(data(table)?.label)} · {String(data(table)?.state)}</option>)}</select></label>}{(posDialog==='DISCOUNT'||posDialog==='COMP')&&<><label className="block text-sm">{posDialog==='DISCOUNT'?'Discount percent':'Comp reason'}{posDialog==='DISCOUNT'?<input className={field} type="number" min="0.01" max="100" step="0.01" value={discountPercent} onChange={e=>setDiscountPercent(e.target.value)}/>:<textarea className={field} value={posReason} onChange={e=>setPosReason(e.target.value)}/>}</label>{posDialog==='DISCOUNT'&&<label className="block text-sm">Reason<textarea className={field} value={posReason} onChange={e=>setPosReason(e.target.value)}/></label>}</>}<button disabled={disabled||(posDialog==='ROOM'&&!roomFolioId)||(posDialog!=='ROOM'&&((posDialog==='MOVE'||posDialog==='MERGE')&&!targetTableId||(posDialog==='DISCOUNT'&&(!posReason.trim()||Number(discountPercent)<=0))||(posDialog==='COMP'&&!posReason.trim())))} className={primary} onClick={()=>void submitPosAction().catch(error=>setNotice(String(error)))}>Confirm</button></div></Modal>}

   {paying&&activeOrder&&<Modal title={`Settle ${String(data(activeOrder)?.tabName||data(activeOrder)?.orderNumber)}`} onClose={()=>setPaying(false)}><div className="space-y-3"><div className="flex justify-between rounded-lg bg-slate-950 p-3"><span>Outstanding</span><b>{money(balance)}</b></div>{tenders.map((line,index)=>{const method=String(data(accounts.find(a=>a.id===line.accountId))?.method||'');const permitted=method!=='MPESA'||allowed(session,'mpesa.record');return <fieldset key={index} className="space-y-2 rounded-lg border border-slate-700 p-3"><legend className="px-1 text-sm font-bold">Tender {index+1}</legend><label className="block text-sm">Payment account<select className={field} value={line.accountId} onChange={e=>setTenders(old=>old.map((v,i)=>i===index?{...draftTender(e.target.value,timeZone,v.amount)}:v))}><option value="">Select account</option>{accounts.map(account=><option key={account.id} value={account.id}>{String(data(account)?.name)} · {String(data(account)?.method)}</option>)}</select></label><label className="block text-sm">Amount (KES)<input aria-label={`Tender ${index+1} amount in KES`} type="number" min="0.01" step="0.01" className={field} value={line.amount} onChange={e=>setTenders(old=>old.map((v,i)=>i===index?{...v,amount:e.target.value,...(method==='CASH'?{cashTendered:e.target.value}:{}),...(method==='MPESA'?{receivedAmount:e.target.value}:{})}:v))}/></label>{method==='CASH'&&<label className="block text-sm">Cash received (KES)<input type="number" min="0" step="0.01" className={field} value={line.cashTendered} onChange={e=>setTenders(old=>old.map((v,i)=>i===index?{...v,cashTendered:e.target.value}:v))}/><small className="text-slate-500">Change {cashChange(line.cashTendered,line.amount)}</small></label>}{method==='MPESA'&&<><label className="block text-sm">M-Pesa transaction code<input className={field} value={line.reference} onChange={e=>setTenders(old=>old.map((v,i)=>i===index?{...v,reference:e.target.value.toUpperCase()}:v))}/></label><label className="block text-sm">Amount shown on receipt (KES)<input type="number" min="0.01" step="0.01" className={field} value={line.receivedAmount} onChange={e=>setTenders(old=>old.map((v,i)=>i===index?{...v,receivedAmount:e.target.value}:v))}/></label><label className="block text-sm">Receipt time ({timeZone})<input type="datetime-local" data-business-timezone={timeZone} className={field} value={line.receivedAt} onChange={e=>setTenders(old=>old.map((v,i)=>i===index?{...v,receivedAt:e.target.value}:v))}/></label></>}{method==='CARD'&&<label className="block text-sm">External authorization reference<input className={field} value={line.reference} onChange={e=>setTenders(old=>old.map((v,i)=>i===index?{...v,reference:e.target.value}:v))}/></label>}{method!=='CASH'&&<label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={line.confirmed} onChange={e=>setTenders(old=>old.map((v,i)=>i===index?{...v,confirmed:e.target.checked}:v))}/><span>I manually verified that the funds were received. ServOS did not initiate or confirm a provider payment.</span></label>}{!permitted&&<p role="alert" className="text-xs text-rose-300">Your role cannot record M-Pesa payments.</p>}{tenders.length>1&&<button type="button" className={button} onClick={()=>setTenders(old=>old.filter((_,i)=>i!==index))}>Remove tender</button>}</fieldset>})}<div className="flex flex-wrap gap-2"><button type="button" disabled={tenders.length>=10||!accounts.length} className={button} onClick={()=>setTenders(old=>[...old,draftTender(accounts.find(a=>data(a)?.method!=='CASH')?.id||accounts[0]?.id||'',timeZone)])}>Add split tender</button><button disabled={disabled||!openTill||!canPay||tenders.some(t=>!t.accountId||!allowed(session,'mpesa.record')&&data(accounts.find(a=>a.id===t.accountId))?.method==='MPESA')} className={primary} onClick={()=>void submitPayment().catch(e=>setNotice(String(e)))}><CreditCard className="mr-1 inline h-4 w-4"/>Record payment</button></div><p className="text-xs text-slate-500">Online server confirmation is required. M-Pesa codes must allocate the exact receipt amount in this staged flow. Failed or offline submissions remain queued as drafts/commands; no provider initiation is represented.</p></div></Modal>}

   {voiding&&activeOrder&&<Modal title="Void order" onClose={()=>setVoiding(false)}><div className="space-y-3"><label className="block text-sm">Reason<textarea className={field} value={voidReason} onChange={e=>setVoidReason(e.target.value)}/></label><label className="block text-sm">Fired-stock disposition<select className={field} value={voidDisposition} onChange={e=>setVoidDisposition(e.target.value)}><option>WASTE</option><option>CONSUMED</option><option>RETURN_SEALED</option><option>MANAGER_ADJUSTMENT</option></select></label><p className="text-xs text-slate-500">RETURN_SEALED reverses the exact ingredient snapshot. WASTE/CONSUMED keep fired stock consumed. Manager approvals are added with the administration/security patch.</p><button disabled={disabled||!voidReason.trim()} className={primary} onClick={()=>void voidOrder()}>Void order</button></div></Modal>}
   {refundTarget&&<Modal title={`Refund or reverse ${String(data(refundTarget)?.method)}`} onClose={()=>setRefundTarget(null)}><div className="space-y-3"><p className="text-sm text-slate-400">Remaining refundable amount {money(Number(data(refundTarget)?.amountMinor||0)-refundedFor(refundTarget.id))}. This records a new event and keeps the original payment immutable.</p><label className="block text-sm">Refund amount (KES)<input aria-label="Refund amount in KES" type="number" min="0.01" step="0.01" className={field} value={refundAmount} onChange={e=>setRefundAmount(e.target.value)}/></label><label className="block text-sm">Reason<textarea className={field} value={refundReason} onChange={e=>setRefundReason(e.target.value)}/></label>{data(refundTarget)?.method!=='CASH'&&<><label className="block text-sm">External refund reference<input className={field} value={refundReference} onChange={e=>setRefundReference(e.target.value.toUpperCase())}/></label><label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={refundConfirmed} onChange={e=>setRefundConfirmed(e.target.checked)}/><span>I manually verified the external refund. ServOS did not initiate or confirm a provider payout.</span></label></>}<div className="flex flex-wrap gap-2"><button disabled={disabled||refundReason.trim().length<3||data(refundTarget)?.method!=='CASH'&&(!refundReference.trim()||!refundConfirmed)} className={primary} onClick={()=>void submitRefund().catch(e=>setNotice(String(e)))}>Record refund</button>{allowed(session,'payment.reverse')&&<button disabled={disabled||refundReason.trim().length<3||data(refundTarget)?.method!=='CASH'&&(!refundReference.trim()||!refundConfirmed)} className={button} onClick={()=>void submitRefund(true).catch(e=>setNotice(String(e)))}>Reverse full remaining amount</button>}</div><p className="text-xs text-slate-500">Refunds are journaled and do not automatically return stock.</p></div></Modal>}
   <style>{receiptStyles}</style>{printReceipt&&<ReceiptPrintRoot document={printReceipt} autoPrint onPrintComplete={finishReceiptPrint}/>}
 </section>;
}

const Modal=({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode})=><Dialog title={title} onClose={onClose}>{children}</Dialog>;
const PosMetric=({icon,label,value,tone='text-white'}:{icon:React.ReactNode;label:string;value:string;tone?:string})=><div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{icon}{label}</div><div className={`mt-2 text-xl font-black ${tone}`}>{value}</div></div>;
