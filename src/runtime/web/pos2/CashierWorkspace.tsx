import {calculateLine} from '../../../../contracts/pos-math.mjs';
import {buildLocalCashInput} from '../localCashSnapshot';
import {OfflineCashSetup,offlinePublicKey} from './OfflineCashSetup';
import type {OfflineCashLease} from '../offlineCashLedger';
import {parseMoneyToMinor} from '../../../utils/fiscal';
import {PaySheet} from './PaySheet';
import {useModalFocus} from './useModalFocus';
import {LocalCashActivity} from './LocalCashActivity';
import React,{useEffect,useRef,useState} from 'react';
import type {WebApiPosProps} from '../WebApiPosView';
import {allowed,type BusinessRecord} from '../session';
import {WebApiPaymentPanel} from '../WebApiPaymentPanel';
import {inventoryRevisions} from '../inventoryRevisions';
import {operatorError} from '../operatorError';
import {formatDocumentMoney} from '../documentPaperProfiles';
import {useBarcodeScanner,barcodeEquals} from '../../../hooks/useBarcodeScanner';

const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value:[];
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
const revision=(row:BusinessRecord)=>({collection:row.collection,id:row.id,version:row.version});
const money=(value:unknown)=>formatDocumentMoney(Number(value||0));

export function CashierWorkspace({records,session,deviceId,queue,command,disabled,readRecords,store,apiAuth,onMore,initialOrderId='',onOrderChange,initialOfflineLease=null}:WebApiPosProps&{onMore:()=>void;onOrderChange?:(id:string)=>void;initialOfflineLease?:OfflineCashLease|null}){
 const outlets=records.filter(row=>row.collection==='outlets'&&!row.archived);
 const [outletId,setOutlet]=useState(String(records.find(row=>row.collection==='orders'&&row.id===initialOrderId)?.data.outletId||outlets[0]?.id||'')),[orderId,setOrder]=useState(initialOrderId),[query,setQuery]=useState(''),[category,setCategory]=useState('');
 useEffect(()=>onOrderChange?.(orderId),[orderId,onOrderChange]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[paymentRequest,setPaymentRequest]=useState(0);
 const [choice,setChoice]=useState<BusinessRecord|null>(null),[portionId,setPortion]=useState(''),[modifiers,setModifiers]=useState<string[]>([]),[note,setNote]=useState('');
 const [draftLines,setDraftLines]=useState<Record<string,unknown>[]>([]),[rejectedCreation,setRejectedCreation]=useState(false);
 const [offlineLease,setOfflineLease]=useState<OfflineCashLease|null>(initialOfflineLease),[cashOpen,setCashOpen]=useState(false),[cashTendered,setCashTendered]=useState(''),[localActivity,setLocalActivity]=useState(false);
 useEffect(()=>{if(!offlineLease)return;const delay=Math.max(0,Date.parse(offlineLease.expiresAt)-Date.now());const timer=window.setTimeout(()=>{setOfflineLease(null);setCashOpen(false);setMessage('Offline checkout capability expired. Reconnect to renew it; recorded cash remains available in Activity.');},delay);return()=>clearTimeout(timer);},[offlineLease]);
 const draftRef=useRef<Record<string,unknown>[]>([]),draftSaleId=useRef<string>(crypto.randomUUID());
 const inFlight=useRef(false),dialogRef=useRef<HTMLFormElement|null>(null),returnFocus=useRef<HTMLElement|null>(null);
 useModalFocus(dialogRef,cashOpen||Boolean(choice),()=>{if(!busy){setCashOpen(false);setChoice(null);}},returnFocus);
 const saveLines=(next:Record<string,unknown>[])=>{draftRef.current=next;setDraftLines(next);void store?.saveDraft({id:'cashier-new-sale',operation:'cashier.draft',collection:'orders',targetId:'cashier-new-sale',editorKind:'Cashier basket',inputValues:{},payload:{saleId:draftSaleId.current,outletId,lines:next},expectedVersions:[],validationSummary:[],requiresReview:false}).catch(error=>setMessage(operatorError(error)));};
 useEffect(()=>{let active=true;void store?.resumeDraft('cashier-new-sale').then(draft=>{if(active&&draft&&Array.isArray(draft.payload.lines)){if(typeof draft.payload.saleId==='string')draftSaleId.current=draft.payload.saleId;draftRef.current=draft.payload.lines as Record<string,unknown>[];setDraftLines(draftRef.current);setOutlet(String(draft.payload.outletId||outletId));}});return()=>{active=false;};},[store]);
 const order=records.find(row=>row.collection==='orders'&&row.id===orderId);
 const lines=orderId?rows(order?.data.items).filter(row=>row.state!=='VOIDED'):draftLines;
 const till=records.find(row=>row.collection==='tillSessions'&&row.data.status==='OPEN'&&row.data.operatorId===session.actorId&&row.data.deviceId===deviceId&&row.data.outletId===outletId);
 const products=records.filter(row=>row.collection==='products'&&!row.archived&&row.data.available!==false&&(!Array.isArray(row.data.outletIds)||row.data.outletIds.length===0||row.data.outletIds.includes(outletId)));
 const pending=queue.some(row=>['PENDING_SYNC','OUTCOME_UNKNOWN'].includes(row.state)&&(row.command.payload.orderId===orderId&&Boolean(orderId)||row.command.payload.tillSessionId===till?.id&&Boolean(till)));
 const localAuthorized=Boolean(offlineLease&&Date.parse(offlineLease.expiresAt)>Date.now()&&offlineLease.outletId===outletId&&session.capabilities?.['pos2.offlineCash']&&document.documentElement.dataset.servosBrowserMode!=='Online only');
 const locked=busy||(disabled&&!localAuthorized)||(pending&&!localAuthorized)||(!navigator.onLine&&!localAuthorized);
 const balance=Number(orderId?order?.data.grandTotalMinor||0:draftLines.reduce((sum,line)=>sum+Number(line.lineTotalMinor),0))-Number(order?.data.amountPaidMinor||0)-Number(order?.data.amountCreditedMinor||0)-Number(order?.data.roomChargeMinor||0);
 const editable=!order||['OPEN','FIRED'].includes(String(order.data.state))&&Number(order.data.amountPaidMinor||0)+Number(order.data.amountCreditedMinor||0)+Number(order.data.roomChargeMinor||0)===0;
 const run=async(operation:string,id:string,payload:Record<string,unknown>)=>{
  const result=await command(operation,'orders',id,payload);
  if(result.kind!=='CONFIRMED'){if(['REJECTED','CONFLICT','BLOCKED','VALIDATION_FAILED'].includes(result.kind))setRejectedCreation(true);setMessage('message' in result?result.message:'Saved; check the original action in Activity before retrying.');return false;}return true;
 };
 const add=async(product:BusinessRecord,selectedPortion='',selectedModifiers:string[]=[],preparationNote='')=>{
  if(locked||inFlight.current||!editable||!allowed(session,'pos.sell'))return;
  if(!orderId){
   try{
    const settings=records.find(row=>row.collection==='businessSettings'&&row.id===session.businessId);if(!settings)throw Error('Load business tax policy before drafting a sale.');
    const portion=rows(product.data.portions).find(row=>row.id===selectedPortion),chosen=rows(product.data.modifiers).filter(row=>selectedModifiers.includes(String(row.id)));
    const price=chosen.reduce((sum,row)=>sum+BigInt(Number(row.priceDeltaMinor)),BigInt(Number(portion?.priceMinor??product.data.priceMinor)));
    if(price>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsupported option price.');
    const unitPriceMinor=Number(price<0n?0n:price),taxSnapshot={settingsVersion:settings.version,taxClassId:product.data.taxClassId,priceMode:'INCLUSIVE',vatRateBasisPoints:['B_0','C_EXEMPT'].includes(String(product.data.taxClassId))?0:Number(settings.data.vatRateBasisPoints),levyRateBasisPoints:Number(settings.data.levyRateBasisPoints)};
    const same=draftRef.current.find(line=>line.productId===product.id&&line.portionId===selectedPortion&&JSON.stringify(line.modifierIds)===JSON.stringify(selectedModifiers)&&line.notes===preparationNote),quantity=Number(same?.quantity||0)+1;
    const line={id:same?.id||crypto.randomUUID(),productId:product.id,productVersion:product.version,name:product.data.name,quantity,unitPriceMinor,portionId:selectedPortion,modifierIds:selectedModifiers,notes:preparationNote,state:'DRAFT',taxSnapshot,...calculateLine(quantity,unitPriceMinor,0,false,taxSnapshot)};
    saveLines(same?draftRef.current.map(row=>row.id===same.id?line:row):[...draftRef.current,line]);setChoice(null);setMessage('Local draft. Payment has not been recorded.');
   }catch(error){setMessage(operatorError(error));}return;
  }
  if(orderId&&!order){setMessage('The original sale is updating. Recover it in Activity before adding more items.');return;}
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   const settings=records.find(row=>row.collection==='businessSettings'&&row.id===session.businessId);
   if(!settings)throw new Error('Refresh business tax settings before starting a sale.');
   const same=lines.find(line=>line.state==='DRAFT'&&line.productId===product.id&&!selectedPortion&&!selectedModifiers.length&&!preparationNote&&!object(line.portionSnapshot).id&&!rows(line.modifierSnapshots).length&&!line.notes);
   if(order&&same){await run('order.updateItem',order.id,{orderId:order.id,itemId:same.id,quantity:Number(same.quantity)+1,note:lineNote(same),courseName:String(same.courseName||''),expectedVersions:[revision(order)]});}
   else if(order){await run('order.addItem',order.id,{orderId:order.id,itemId:crypto.randomUUID(),productId:product.id,quantity:1,portionId:selectedPortion||undefined,modifierIds:selectedModifiers,note:preparationNote,expectedVersions:[revision(order),revision(product),revision(settings)]});}
   else{
    const outlet=outlets.find(row=>row.id===outletId),storage=records.find(row=>row.collection==='stockLocations'&&row.id===outlet?.data.defaultStockLocationId&&!row.archived);
    if(!outlet||!storage)throw new Error('Choose an outlet with an active stock location.');
    const id=crypto.randomUUID();
    setOrder(id);
    await run('order.quickAdd',id,{orderId:id,itemId:crypto.randomUUID(),outletId,name:'Counter sale',productId:product.id,quantity:1,portionId:selectedPortion||undefined,modifierIds:selectedModifiers,note:preparationNote,expectedVersions:[{collection:'orders',id,version:0},revision(outlet),revision(storage),revision(settings),revision(product)]});
   }
   setChoice(null);
  }catch(error){setMessage(operatorError(error));}finally{inFlight.current=false;setBusy(false);}
 };
 const select=(product:BusinessRecord)=>{if(locked)return;if(rows(product.data.portions).length||rows(product.data.modifiers).length){returnFocus.current=document.activeElement as HTMLElement;setChoice(product);setPortion('');setModifiers([]);setNote('');}else void add(product);};
 useBarcodeScanner({enabled:!locked&&!choice,onScan:code=>{
  const matches=products.filter(product=>barcodeEquals(String(product.data.barcode||''),code)||(Array.isArray(product.data.barcodeAliases)&&product.data.barcodeAliases.some(alias=>barcodeEquals(String(alias),code))));
  if(matches.length===1)select(matches[0]);else{setQuery(code);setMessage(matches.length?'Several products match this barcode. Choose the correct item.':'No sellable product matches this barcode.');}
 }});
 const pay=async()=>{
  if(locked||inFlight.current||!till||balance<=0)return;
  if(localAuthorized&&!orderId){returnFocus.current=document.activeElement as HTMLElement;setCashTendered('');setCashOpen(true);return;}
  inFlight.current=true;setBusy(true);setMessage('');
  try{
   let activeOrder=order,activeRecords=records;
   if(!orderId){
    const reviewed=draftRef.current;if(!reviewed.length)return;
    const id=crypto.randomUUID(),outlet=outlets.find(row=>row.id===outletId),storage=records.find(row=>row.collection==='stockLocations'&&row.id===outlet?.data.defaultStockLocationId),settings=records.find(row=>row.collection==='businessSettings'&&row.id===session.businessId);
    if(!outlet||!storage||!settings)throw Error('Refresh outlet and tax configuration before checkout.');
    if(reviewed.some(line=>!records.some(row=>row.collection==='products'&&row.id===line.productId&&row.version===line.productVersion)))throw Error('A drafted product changed. Review prices before checkout.');
    setOrder(id);setRejectedCreation(false);
    for(const [index,line] of reviewed.entries()){
     const product=records.find(row=>row.collection==='products'&&row.id===line.productId);if(!product||product.version!==line.productVersion)throw Error('A drafted product changed. Review prices before checkout.');
     const current=activeRecords.find(row=>row.collection==='orders'&&row.id===id),expected=index===0?[{collection:'orders',id,version:0},revision(outlet),revision(storage),revision(settings),revision(product)]:[revision(current!),revision(product),revision(settings)];
     if(!await run(index===0?'order.quickAdd':'order.addItem',id,{orderId:id,itemId:line.id,outletId,name:'Counter sale',productId:line.productId,quantity:line.quantity,portionId:line.portionId||undefined,modifierIds:line.modifierIds,note:line.notes,expectedVersions:expected}))return;
     activeRecords=await readRecords();
    }
    activeOrder=activeRecords.find(row=>row.collection==='orders'&&row.id===id);if(!activeOrder)throw Error('The created order is updating. Recover its original command in Activity.');
    saveLines([]);await store?.discardDraft('cashier-new-sale');
   }
   if(!activeOrder)throw Error('Recover the selected order in Activity before paying.');
   const activeLines=rows(activeOrder.data.items).filter(row=>row.state!=='VOIDED');
   const drafts=activeLines.filter(line=>line.state==='DRAFT');
   if(drafts.length){
    if(!allowed(session,'order.fire'))throw new Error('Your role cannot release preparation. Use the authorized checkout workflow.');
    const stockIds=[...new Set(drafts.flatMap(line=>rows(object(line.productSnapshot).ingredientSnapshot).map(ingredient=>String(ingredient.stockItemId))))];
    const revisions=inventoryRevisions(activeRecords,stockIds,[String(activeOrder.data.stockLocationId)]);
    if(!await run('order.fire',activeOrder.id,{orderId:activeOrder.id,itemIds:drafts.map(line=>line.id),...revisions,expectedVersions:[revision(activeOrder),...revisions.expectedVersions]}))return;
   }
   const fresh=(await readRecords()).find(row=>row.collection==='orders'&&row.id===activeOrder.id);
   if(fresh?.data.state==='FIRED')setPaymentRequest(value=>value+1);else setMessage('Recorded, updating display. Check Activity before retrying.');
  }catch(error){setMessage(operatorError(error));}finally{inFlight.current=false;setBusy(false);}
 };
 const button='min-h-11 rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
 const visible=products.filter(product=>(!category||product.data.category===category)&&`${product.data.name} ${product.data.code||''} ${product.data.barcode||''}`.toLowerCase().includes(query.toLowerCase()));
 return <section aria-label="Cashier workspace" className="servos-cashier-workspace flex min-h-0 flex-col gap-3 lg:h-[calc(100dvh-12rem)]">
  <header className="flex flex-wrap items-center gap-3"><label>Outlet <select className={button} value={outletId} disabled={busy||Boolean(order)} onChange={event=>setOutlet(event.target.value)}>{outlets.map(outlet=><option key={outlet.id} value={outlet.id}>{String(outlet.data.name)}</option>)}</select></label><span>{till?'Shift open':'Start a shift in More'}</span><span role="status">{navigator.onLine?'API status checked in Activity':'Offline — online checkout only until offline capability is provisioned'}</span><button className={button} onClick={onMore}>More / Shift / Activity</button></header>
  {session.capabilities?.['pos2.offlineCash']&&<details onToggle={event=>setLocalActivity(event.currentTarget.open)}><summary>Local cash / pending sync / recovery</summary>{localActivity&&<LocalCashActivity store={store} printingEnabled={session.capabilities?.['pos2.localKitchenTickets']===true}/>}</details>}
  <nav className="flex gap-2" aria-label="Cashier orders"><button className={button} disabled={busy||pending} onClick={()=>{setOrder('');setPaymentRequest(0);setRejectedCreation(false);setMessage('');}}>New sale</button><label>Held / History <select className={button} value={orderId} disabled={busy} onChange={event=>{setOrder(event.target.value);setPaymentRequest(0);}}><option value="">Choose sale</option>{records.filter(row=>row.collection==='orders'&&row.data.outletId===outletId).map(row=><option key={row.id} value={row.id}>{String(row.data.name)} · {String(row.data.state)}</option>)}</select></label></nav>
  <div className="servos-cashier-layout grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
   <section className="flex min-h-0 flex-col gap-3"><label>Search products<input className="block min-h-11 w-full rounded border border-slate-600 bg-slate-950 p-2" value={query} onChange={event=>setQuery(event.target.value)}/></label><label>Category <select className={button} value={category} onChange={event=>setCategory(event.target.value)}><option value="">All</option>{[...new Set(products.map(product=>String(product.data.category||'')))].filter(Boolean).sort().map(value=><option key={value}>{value}</option>)}</select></label><div className="servos-cashier-products grid min-h-0 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">{visible.map(product=><button key={product.id} className={`${button} min-h-20 text-left`} disabled={locked||!editable} onClick={()=>select(product)}><b className="block">{String(product.data.name)}</b>{money(product.data.priceMinor)}</button>)}</div></section>
   <aside aria-label="Current bill" className="sticky bottom-0 flex min-h-48 flex-col rounded-xl border border-slate-700 bg-slate-950 p-3 lg:static lg:min-h-0"><h3 className="font-bold">{String(order?.data.name||'New sale')}</h3><div className="min-h-0 flex-1 overflow-y-auto">{lines.map(line=><div key={String(line.id)} className="border-b border-slate-800 py-2"><b>{String(line.name)}</b><p>{String(line.quantity)} × {money(line.unitPriceMinor)} = {money(line.lineTotalMinor)}</p><small>{line.state==='DRAFT'?'Held':String(line.state)}</small></div>)}</div><p>Paid {money(order?.data.amountPaidMinor)}</p><p className="text-xl font-bold">Balance {money(balance)}</p><button className={`${button} bg-amber-400 font-bold text-slate-950`} disabled={locked||!till||(!order&&!draftLines.length)||balance<=0||!allowed(session,'payment.record')} onClick={()=>void pay()}>Pay {money(balance)}</button>{!till&&<p>Open your shift in More before accepting payment.</p>}</aside>
  </div>
  {session.capabilities?.['pos2.offlineAuthV2']&&<OfflineCashSetup store={store} session={session} apiAuth={apiAuth} outletId={outletId} tillId={till?.id} onUnlocked={setOfflineLease} onStopped={()=>setOfflineLease(null)}/>}
  <PaySheet key={orderId} records={records} order={order} session={session} deviceId={deviceId} queue={queue} command={command} disabled={disabled||busy} openRequest={paymentRequest}/>
  {cashOpen&&<form ref={dialogRef} role="dialog" aria-modal="true" aria-label="Cash checkout" className="fixed inset-4 z-50 rounded border bg-slate-950 p-4 lg:inset-x-1/3" onSubmit={event=>{event.preventDefault();if(inFlight.current||!offlineLease||!till)return;inFlight.current=true;setBusy(true);void (async()=>{try{const tendered=parseMoneyToMinor(cashTendered);if(tendered===null||tendered<balance)throw Error('Cash tendered must cover the total.');const account=records.find(row=>row.collection==='paymentAccounts'&&row.data.method==='CASH'&&!row.archived);if(!account)throw Error('No provisioned cash account.');const savedSales=await store.localCashSales(),already=savedSales.find(sale=>sale.id===draftSaleId.current);if(already){saveLines([]);setCashOpen(false);setMessage(`Cash was already recorded locally as ${already.reference}. No second sale was created.`);await store.discardDraft('cashier-new-sale');draftSaleId.current=crypto.randomUUID();return;}const overlays=savedSales.filter(sale=>sale.state!=='SERVER_CONFIRMED');const input=await buildLocalCashInput(records,draftRef.current,outletId,till.id,account.id,tendered,overlays);input.id=draftSaleId.current;const sale=await store.recordLocalCash(input,offlineLease,offlinePublicKey());setCashOpen(false);saveLines([]);setMessage(`Cash received. ${sale.reference}: recorded locally, pending server sync. Change ${money(sale.changeMinor)}.`);try{await store.discardDraft('cashier-new-sale');draftSaleId.current=crypto.randomUUID();}catch{setMessage(`Cash recorded locally as ${sale.reference}. Draft cleanup failed; recover this sale in local activity before starting another.`);}}catch(error){setMessage(operatorError(error));}finally{inFlight.current=false;setBusy(false);}})();}}><h3>Cash total {money(balance)}</h3><label>Cash tendered<input autoFocus inputMode="decimal" value={cashTendered} onChange={event=>setCashTendered(event.target.value)}/></label><p>Change {money(Math.max(0,(cashMinor(cashTendered)||0)-balance))}</p><p>This cash sale is recorded locally and remains provisional until the server confirms it.</p><button className={button} disabled={busy}>Record cash received</button><button type="button" className={button} disabled={busy} onClick={()=>setCashOpen(false)}>Back</button></form>}
  {choice&&<form ref={dialogRef} role="dialog" aria-modal="true" aria-label="Choose product options" className="fixed inset-4 z-50 overflow-auto rounded-xl border border-slate-600 bg-slate-950 p-4 lg:inset-x-1/3" onSubmit={event=>{event.preventDefault();void add(choice,portionId,modifiers,note);}}><h3>{String(choice.data.name)}</h3><label>Portion<select className={button} value={portionId} onChange={event=>setPortion(event.target.value)}><option value="">Standard</option>{rows(choice.data.portions).map(portion=><option key={String(portion.id)} value={String(portion.id)}>{String(portion.name)} · {money(portion.priceMinor)}</option>)}</select></label>{rows(choice.data.modifiers).map(modifier=><label key={String(modifier.id)} className="block py-2"><input type="checkbox" checked={modifiers.includes(String(modifier.id))} onChange={event=>setModifiers(values=>event.target.checked?[...values,String(modifier.id)]:values.filter(id=>id!==modifier.id))}/> {String(modifier.name)} · {money(modifier.priceDeltaMinor)}</label>)}<label>Preparation note<input className={button} maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label><button className={button} disabled={busy}>Add item</button><button type="button" className={button} disabled={busy} onClick={()=>setChoice(null)}>Close</button></form>}
  {rejectedCreation&&!order&&<button className={button} onClick={()=>{setOrder('');setRejectedCreation(false);setMessage('Rejected creation cleared. Original local draft retained for review.');}}>Return to retained draft</button>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
const lineNote=(line:Record<string,unknown>)=>String(line.notes||'');

const cashMinor=(value:string)=>{try{return parseMoneyToMinor(value)}catch{return null;}};
