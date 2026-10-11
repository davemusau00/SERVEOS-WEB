import React,{useEffect,useState} from 'react';

import type {BusinessStore,LocalBusinessDocument} from '../BusinessStore';

import {localCashDocuments} from '../localCashDocuments';

import {BusinessDocumentRenderer,businessDocumentPreviewStyles,printBusinessDocument} from '../BusinessDocumentRenderer';

import {formatDocumentMoney} from '../documentPaperProfiles';

import {operatorError} from '../operatorError';

export function LocalCashActivity({store,printingEnabled=false}:{store:BusinessStore;printingEnabled?:boolean}){

 const [sales,setSales]=useState<Array<Record<string,unknown>>>([]),[documents,setDocuments]=useState<LocalBusinessDocument[]>([]),[selected,setSelected]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[claim,setClaim]=useState<{id:string;attempt:number}|null>(null);

 useEffect(()=>{let active=true,running=false;const refresh=async()=>{if(running)return;running=true;try{const current=await store.localCashSales();if(active)setSales(current);}catch(error){if(active)setMessage(operatorError(error));}finally{running=false;}};void refresh();const timer=window.setInterval(()=>void refresh(),3000);return()=>{active=false;clearInterval(timer);};},[store]);

 const states:Record<string,string>={RECORDED_LOCALLY:'Cash received locally; pending sync',QUEUED:'Queued for synchronization',SYNCING:'Synchronizing original cash record',SERVER_CONFIRMED:'Confirmed by server',OUTCOME_UNKNOWN:'Cash received; server outcome unknown',RECONCILIATION_REQUIRED:'Manager reconciliation required'};

 const pending=sales.filter(sale=>sale.state!=='SERVER_CONFIRMED').length,exceptions=sales.filter(sale=>['OUTCOME_UNKNOWN','RECONCILIATION_REQUIRED'].includes(String(sale.state))).length;



 const preview=documents.find(document=>document.id===selected);

 const print=async(reprint=false)=>{if(!preview||!printingEnabled||busy)return;setBusy(true);try{const saleId=preview.id.split(':')[0],claimed=await store.claimLocalCashPrint(saleId,preview.type,reprint);setClaim(claimed);try{await printBusinessDocument(preview,{attempt:claimed.attempt});await store.finishLocalCashPrint(claimed.id,'DELIVERY_UNCERTAIN');setMessage('Print dialog sent. Check actual paper before confirming delivery or requesting a reprint.');}catch(error){await store.finishLocalCashPrint(claimed.id,'FAILED');throw error;}}catch(error){setMessage(operatorError(error));}finally{setBusy(false);}};

 return <section aria-label="Local cash activity" className="space-y-3"><h2>Local cash activity and recovery</h2><p role="status">{sales.length} local cash records  -  {pending} awaiting server confirmation  -  {exceptions} exceptions</p><p>Local cash received remains provisional for central reporting until server reconciliation. Retain original slips and review exceptions with your manager.</p>{sales.map(sale=><article key={String(sale.id)} className="rounded border p-3"><b>{String(sale.reference)}</b><p>{states[String(sale.state)]||'Review original record'}  -  Cash {formatDocumentMoney(Number(sale.totalMinor))}</p>{Boolean(sale.reason)&&<p>{String(sale.reason)}</p>}<button className="min-h-11 border px-3" onClick={()=>void localCashDocuments(sale).then(next=>{setDocuments(next);setSelected(next[0].id);setClaim(null);})}>View original local slips</button><button className="min-h-11 border px-3" onClick={()=>void store.localCashRecoveryEvidence(String(sale.id)).then(evidence=>{const blob=new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${sale.reference}-private-cash-evidence.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}).catch(error=>setMessage(operatorError(error)))}>Export private recovery evidence</button></article>)}{preview&&<><label>Local document<select value={selected} onChange={event=>{setSelected(event.target.value);setClaim(null);}}>{documents.map(document=><option key={document.id} value={document.id}>{document.type}  -  {document.documentNumber}</option>)}</select></label><style>{businessDocumentPreviewStyles}</style><BusinessDocumentRenderer document={preview} attempt={claim?.attempt||1}/>{printingEnabled?<><button className="min-h-11 border px-3" disabled={busy} onClick={()=>void print()}>Print 80 mm slip</button>{claim&&<><button className="min-h-11 border px-3" disabled={busy} onClick={()=>void store.finishLocalCashPrint(claim.id,'CONFIRMED').then(()=>setMessage('Operator confirmed physical paper delivery.'))}>I checked the paper: delivery confirmed</button><button className="min-h-11 border px-3" disabled={busy} onClick={()=>void print(true)}>I checked delivery: request marked reprint</button></>}</>:<p>Direct local printing is disabled until the printer cohort has physical acceptance evidence. Preview remains available.</p>}</>}{message&&<p role="status">{message}</p>}</section>;

}

