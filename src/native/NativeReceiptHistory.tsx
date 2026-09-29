import React, {useEffect,useState} from 'react';
import {useRuntime} from '../runtime/RuntimeProvider';
import type {ReceiptSummary} from '../types/receipt';
import {ActionDialog} from './ActionDialog';
import {NativeReceiptDialog} from './NativeReceiptDialog';
import {buttonClass} from './records';

export function NativeReceiptHistory(){
  const runtime=useRuntime();const [open,setOpen]=useState(false);const [rows,setRows]=useState<ReceiptSummary[]>([]);const [error,setError]=useState('');const [selected,setSelected]=useState<ReceiptSummary|null>(null);
  useEffect(()=>{if(!open)return;let stopped=false;setError('');void runtime.receiptHistory().then(v=>{if(!stopped)setRows(v)}).catch(e=>{if(!stopped)setError(String(e))});return()=>{stopped=true}},[open]);
  return <><button className={buttonClass} onClick={()=>setOpen(true)}>Receipt history</button>{open&&!selected&&<ActionDialog title="Saved receipts" onClose={()=>setOpen(false)}><p className="mb-3 text-sm text-slate-400">Latest 100 captured receipts. Earlier payments without a saved receipt are not reconstructed.</p>{error&&<p role="alert">{error}</p>}{rows.map(row=><button key={row.id} className={`${buttonClass} mb-2 w-full text-left`} onClick={()=>setSelected(row)}>{row.orderNumber} · {new Date(row.issuedAt).toLocaleString('en-KE')} · KES {(row.totalMinor/100).toFixed(2)}</button>)}{!error&&rows.length===0&&<p>No saved receipts yet.</p>}</ActionDialog>}{selected&&<NativeReceiptDialog order={{id:selected.orderId}} receiptId={selected.id} reprint onClose={()=>setSelected(null)} onJobsChanged={()=>undefined}/>}</>;
}
