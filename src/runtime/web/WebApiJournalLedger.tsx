import React,{useState} from 'react';
import type {BusinessRecord} from './session';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==='string'?value:'';
const money=(value:unknown)=>Number.isSafeInteger(value)?new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES'}).format(Number(value)/100):'Unavailable';
const names:Record<string,string>={ASSET_TENDER:'Tender asset',REVENUE_SALES:'Sales revenue',LIABILITY_VAT:'VAT payable',LIABILITY_LEVY:'Levy payable'};

export function WebApiJournalLedger({records}:{records:BusinessRecord[]}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState('');
 const journals=records.filter(row=>row.collection==='journalEntries'&&!row.archived).sort((a,b)=>text(b.data.occurredAt).localeCompare(text(a.data.occurredAt))||b.id.localeCompare(a.id));
 const filtered=journals.filter(row=>[row.id,row.data.sourceId,row.data.paymentId,row.data.sourceCommandId,row.data.sourceType].some(value=>text(value).toLowerCase().includes(query.toLowerCase())));
 const journal=journals.find(row=>row.id===selected),data=journal?.data;
 const lines=Array.isArray(data?.lines)?data.lines.map(object):[];
 const basis=object(data?.basisSnapshot);
 const balanced=!!data&&lines.length>0&&lines.every(line=>Number.isSafeInteger(line.debitMinor)&&Number.isSafeInteger(line.creditMinor))&&lines.reduce((sum,line)=>sum+Number(line.debitMinor),0)===data.totalDebitMinor&&lines.reduce((sum,line)=>sum+Number(line.creditMinor),0)===data.totalCreditMinor&&data.totalDebitMinor===data.totalCreditMinor;
 return <section className="mt-5 space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4" aria-label="Revenue journal evidence">
  <div><h2 className="text-lg font-bold">Revenue journal evidence</h2><p className="text-sm text-slate-400">Immutable payment and refund postings in this browser projection. Bootstrap includes the latest 1,000 journals; this list is not a complete period report or day close.</p></div>
  <label className="block text-sm">Find journal, payment or command<input className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" value={query} onChange={event=>setQuery(event.target.value)}/></label>
  <div className="grid gap-4 lg:grid-cols-2">
   <div className="max-h-96 space-y-2 overflow-auto">{!filtered.length&&<p className="text-sm text-slate-400">No matching journal evidence is loaded.</p>}{filtered.map(row=><button key={row.id} className="w-full rounded-lg border border-slate-700 p-3 text-left aria-pressed:border-amber-400" aria-pressed={selected===row.id} onClick={()=>setSelected(row.id)}><span className="flex justify-between gap-2"><b>{text(row.data.sourceType)}</b><span>{money(row.data.totalDebitMinor)}</span></span><span className="block break-all text-xs text-slate-400">Payment {text(row.data.paymentId)}</span><span className="block text-xs text-slate-400">{text(row.data.occurredAt)}</span></button>)}</div>
   {journal&&data?<article className="min-w-0 space-y-3 rounded-lg bg-slate-950 p-3">
    <h3 className="font-semibold">{text(data.sourceType)} posting</h3>
    <p className={balanced?'text-emerald-300':'text-rose-300'}>{balanced?'Projected debits and credits reconcile.':'Projected lines do not reconcile. Synchronize and investigate before using this evidence.'}</p>
    <dl className="space-y-2 break-all text-sm">{[['Journal',journal.id],['Payment',data.paymentId],['Source',data.sourceId],['Command',data.sourceCommandId],['Staff',data.staffId],['Occurred',data.occurredAt],['Original journal',data.originalJournalId]].filter(([,value])=>!!value).map(([label,value])=><div key={String(label)}><dt className="text-slate-400">{String(label)}</dt><dd>{text(value)}</dd></div>)}</dl>
    <div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead><tbody>{lines.map(line=><tr key={Number(line.lineNumber)} className="border-t border-slate-800"><td className="py-2">{names[text(line.accountCode)]||text(line.accountCode)}{text(line.accountRef)&&<small className="block max-w-52 break-all text-slate-400">{text(line.accountRef)}</small>}</td><td className="text-right">{money(line.debitMinor)}</td><td className="text-right">{money(line.creditMinor)}</td></tr>)}</tbody><tfoot><tr className="border-t border-slate-600"><th className="py-2 text-left">Total</th><td className="text-right">{money(data.totalDebitMinor)}</td><td className="text-right">{money(data.totalCreditMinor)}</td></tr></tfoot></table></div>
    {text(basis.reason)&&<p className="whitespace-pre-wrap text-sm">Reason: {text(basis.reason)}</p>}
    <p className="text-xs text-slate-400">Allocation policy {String(basis.policyVersion??'unknown')}: {text(basis.rounding)}. Refund postings return money; stock disposition is separate.</p>
   </article>:<p className="text-sm text-slate-400">Select a posting to inspect its original source and debit/credit lines.</p>}
  </div>
 </section>;
}
