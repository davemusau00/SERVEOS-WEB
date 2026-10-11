import React,{useState} from 'react';
import type {WebApiPosProps} from '../WebApiPosView';
import {allowed} from '../session';
import {operatorError} from '../operatorError';
export function CashManagerRecovery({records,session,store,command,disabled}:WebApiPosProps){
 const [saleId,setSale]=useState(''),[orderId,setOrder]=useState(''),[reason,setReason]=useState(''),[deviceId,setDevice]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const exceptions=records.filter(row=>row.collection==='offlineCashReconciliations'&&row.data.status==='RECONCILIATION_REQUIRED'),orders=records.filter(row=>row.collection==='orders'&&row.data.state==='COMPLETED');
 const run=async(handoff=false)=>{if(disabled||busy)return;setBusy(true);try{
  if(handoff){
   const frozen=await store.stopOfflineCashCreation();
   if(frozen.some(sale=>sale.state!=='SERVER_CONFIRMED'))throw Error('Local creation is stopped. Synchronize and resolve every original cash record before handoff.');
   const outcome=await command('pos.checkoutHandoff','checkoutTerminals',session.businessId,{deviceId,reason,saleIds:frozen.map(sale=>sale.id)});
   if(outcome.kind!=='CONFIRMED')throw Error('Handoff is not confirmed. Recover the original command in Activity before retrying.');
   setMessage('Checkout handed over. This terminal remains stopped; the receiving terminal must sign in, open its own shift and provision a new capability.');
  }else{
   const sale=exceptions.find(row=>row.id===saleId);if(!sale)throw Error('Review an outstanding cash exception.');
   const outcome=await command('pos.offlineCash.resolve','offlineCashReconciliations',saleId,{saleId,orderId,reason,expectedVersions:[{collection:sale.collection,id:sale.id,version:sale.version}]});
   if(outcome.kind!=='CONFIRMED')throw Error('Resolution is not confirmed. Inspect the original outcome in Activity; received cash remains recorded.');
   setMessage('Original cash evidence linked to the verified sale. No new payment or stock consumption was created.');
  }
 }catch(error){setMessage(operatorError(error));}finally{setBusy(false);}};
 if(!allowed(session,'till.override_variance')&&!allowed(session,'business.configure'))return null;
 return <details className="rounded border p-3"><summary>Manager cash review / checkout handoff</summary><p>Use an already-recorded matching cash sale. Do not take payment again. The server checks the original amount, items, tax, shift and stock consumption; a mismatch remains unresolved.</p>{allowed(session,'till.override_variance')&&<fieldset><legend>Resolve an original cash exception</legend><label>Original cash reference<select value={saleId} onChange={event=>setSale(event.target.value)}><option value="">Choose exception</option>{exceptions.map(row=><option key={row.id} value={row.id}>{String(row.data.reference)} — {String(row.data.reason)}</option>)}</select></label><label>Verified recorded sale<select value={orderId} onChange={event=>setOrder(event.target.value)}><option value="">Choose recorded sale</option>{orders.map(row=><option key={row.id} value={row.id}>{String(row.data.name)}</option>)}</select></label><button disabled={disabled||busy||!saleId||!orderId||reason.trim().length<3} onClick={()=>void run()}>Link verified cash evidence</button></fieldset>}<label>Manager review reason<input maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>{allowed(session,'business.configure')&&<fieldset><legend>Authorized terminal handoff</legend><p>Enroll the receiving browser online first. Drain cash records, end capabilities, close and review the old shifts, then copy its device reference from authorized Device Settings.</p><label>Receiving enrolled device reference<input value={deviceId} onChange={event=>setDevice(event.target.value)}/></label><button disabled={disabled||busy||!deviceId||reason.trim().length<3} onClick={()=>void run(true)}>Freeze old terminal and hand over</button></fieldset>}{message&&<p role="status">{message}</p>}</details>;
}
