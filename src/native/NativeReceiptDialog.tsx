import React, { useEffect, useState } from 'react';
import { ActionDialog } from './ActionDialog';
import { buttonClass, primaryButtonClass } from './records';
import { useRuntime } from '../runtime/RuntimeProvider';
import type { PrinterJobResult } from '../types/runtime';
import type { ReceiptResponse } from '../types/receipt';
import { ReceiptDocumentView, ReceiptPrintRoot, receiptStyles } from '../components/pos/ReceiptDocumentView';

// Legacy presentation props remain accepted during POS migration; persisted data is authoritative.
export function NativeReceiptDialog({order,onClose,onJobsChanged,receiptId,reprint=false}: {
  order:{id:string}; payment?:unknown; businessName?:string; outletName?:string; cashierName?:string;
  receiptId?:string; reprint?:boolean; onClose:()=>void; onJobsChanged:()=>void;
}) {
  const runtime=useRuntime();
  const [receipt,setReceipt]=useState<ReceiptResponse|null>(null);
  const [message,setMessage]=useState('');
  const [job,setJob]=useState<PrinterJobResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [reload,setReload]=useState(0);
  useEffect(()=>{let cancelled=false;setReceipt(null);setMessage('');
    void runtime.receipt(order.id,receiptId).then(value=>{if(!cancelled)setReceipt(value)}).catch(error=>{if(!cancelled)setMessage(String(error))});
    return()=>{cancelled=true};
  },[order.id,receiptId,runtime.session?.token,reload]);
  const copy=async()=>{if(!receipt)return;await navigator.clipboard.writeText(`${reprint?'REPRINT\n':''}${receipt.customerLines.join('\n')}\n\n${reprint?'REPRINT\n':''}${receipt.businessLines.join('\n')}`)};
  const print=async()=>{
    if(!receipt)return;setBusy(true);setMessage('');
    try {const result=await runtime.printReceipt({orderId:order.id,receiptId:receipt.document.id,reprint});setJob(result);
      if(result.state==='OS_DIALOG'){window.print();setMessage('Print dialog opened for both copies. Confirm paper output at the printer.');}
      else if(result.state==='MANUAL'){await copy();setMessage('Both copies copied for manual printing.');}
      else{setMessage(`${result.state}: ${result.message||'Printer job updated.'}`);onJobsChanged();}
    }catch(error){setMessage(String(error))}finally{setBusy(false)}
  };
  const retry=async(confirmDuplicate:boolean)=>{
    if(!job?.jobId)return;setBusy(true);
    try{const result=await runtime.retryPrinterJob(job.jobId,confirmDuplicate);setJob(result);setMessage(`${result.state}: ${result.message||'Printer job updated.'}`);onJobsChanged()}
    catch(error){setMessage(String(error))}finally{setBusy(false)}
  };
  return <><style>{receiptStyles}</style><ActionDialog title="Print receipts" onClose={onClose}>
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Saved transaction receipt · 80mm · customer and business copies.</p>
      {receipt?<><ReceiptDocumentView document={receipt.document} reprint={reprint}/><ReceiptDocumentView document={receipt.document} business reprint={reprint}/></>:<p>{message?'Receipt could not be loaded.':'Loading saved receipt…'}</p>}
      <div className="flex flex-wrap gap-2"><button disabled={busy||!receipt} className={primaryButtonClass} onClick={()=>void print()}>{busy?'Sending…':'Print both copies'}</button><button disabled={!receipt} className={buttonClass} onClick={()=>void copy().then(()=>setMessage('Both copies copied.')).catch(()=>setMessage('Clipboard unavailable. Use print instead.'))}>Copy both</button>{!receipt&&<button className={buttonClass} onClick={()=>setReload(n=>n+1)}>Reload receipt</button>}<button className={buttonClass} onClick={onClose}>Done</button></div>
      {job?.state==='QUEUED'&&job.jobId&&<button disabled={busy} className={buttonClass} onClick={()=>void retry(false)}>Retry queued print</button>}
      {job?.state==='DELIVERY_UNCERTAIN'&&job.jobId&&<div className="rounded border border-amber-700 p-3 text-sm">Check the paper before retrying; the printer may have received this receipt.<button disabled={busy} className={buttonClass} onClick={()=>void retry(true)}>Reprint anyway (may duplicate)</button></div>}
      {message&&<p role="status" className="text-sm text-slate-300">{message}</p>}
    </div>
  </ActionDialog>{receipt&&<ReceiptPrintRoot document={receipt.document} reprint={reprint}/>}</>;
}
