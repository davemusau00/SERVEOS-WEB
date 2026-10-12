import React,{useMemo,useState} from 'react';
import type {createServOSApiClient,ApiCompletionReport} from './apiClient';
import type {BusinessRecord,WebSession} from './session';
import {businessDate} from '../../utils/businessTime';

const allReports=[
 ['expenses','Posted expenses','finance.expense.view'],
 ['stock-movements','Stock movement register','inventory.view'],
 ['stock-position','Physical stock position','inventory.view'],
 ['supplier-balances','Supplier liabilities','procurement.view'],
 ['guest-balances','Outstanding guest folios','rooms.view'],
 ['room-conflicts','Reservation conflict diagnostics','rooms.view'],
 ['accounting-coverage','Accounting coverage diagnostics','accounting.view'],
 ['shift-opening','Till opening facts','till.view']
] as const;
type Kind=(typeof allReports)[number][0];
const control='min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400';
const csvCell=(v:unknown)=>{let s=String(v??'');if(/^\s*[=+@\-]/.test(s)&&!/^\s*-?\d+(\.\d+)?\s*$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
export function completionReportCsv(report:ApiCompletionReport){
 const rows=report.rows||[];
 const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];
 const header=['Report',report.report,'Scope',report.basis||'', 'Generated',report.generatedAt];
 const data=[header,[],columns,...rows.map(row=>columns.map(k=>typeof row[k]==='object'?JSON.stringify(row[k]):row[k]))];
 return '\uFEFF'+data.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
const printable=(value:unknown):string=>value===null||value===undefined?'Unknown':typeof value==='boolean'?value?'Yes':'No':typeof value==='object'?JSON.stringify(value):String(value);
export function CompletionReportsPanel({client,session,records,timeZone,disabled}:{client:ReturnType<typeof createServOSApiClient>;session:WebSession;records:BusinessRecord[];timeZone:string;disabled:boolean}){
 const permitted=(permission:string)=>session.permissions.includes('*')||session.permissions.includes(permission);
 const options=useMemo(()=>allReports.filter(([, ,permission])=>permitted(permission)||permission==='finance.expense.view'&&permitted('accounting.view')),[session.permissions]);
 const [kind,setKind]=useState<Kind>('expenses');
 const today=()=>businessDate(new Date(),timeZone);
 const [from,setFrom]=useState(today),[to,setTo]=useState(today),[tillId,setTillId]=useState('');
 const [result,setResult]=useState<ApiCompletionReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[offset,setOffset]=useState(0);
 const tills=records.filter(row=>row.collection==='tillSessions'&&!row.archived);
 const selected=options.some(([k])=>k===kind)?kind:options[0]?.[0];
 if(!options.length)return null;
 const run=async(nextOffset=0)=>{
  if(disabled||!selected)return;
  setBusy(true);setError('');setResult(null);
  try{
   const output=await client.completionReport(selected,{from,to,timeZone,limit:100,offset:nextOffset,...(selected==='shift-opening'?{tillId}:{} )});
   setResult(output);setOffset(nextOffset);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load report. Check connectivity and access permissions.');}
  finally{setBusy(false)}
 };
 const download=()=>{
  if(!result)return;
  const blob=new Blob([completionReportCsv(result)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`serveos-${selected}-${from}-${to}-page-${offset}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const columns=[...new Set((result?.rows||[]).flatMap(row=>Object.keys(row)))];
 return <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4" aria-labelledby="completion-reports-title">
  <header><h3 id="completion-reports-title" className="text-lg font-semibold">Detailed business registers and diagnostics</h3>
   <p className="text-sm text-slate-300">Live PostgreSQL reports, not cached workspace lists. Current balances are not historical as-of balances. Accounting diagnostics never certify profit or period closing.</p></header>
  <form className="grid gap-3 md:grid-cols-4" onSubmit={e=>{e.preventDefault();void run()}}>
   <label className="text-sm">Report<select className={control} value={selected} onChange={e=>{setKind(e.target.value as Kind);setResult(null)}}>{options.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
   <label className="text-sm">From<input className={control} type="date" value={from} onChange={e=>setFrom(e.target.value)} required/></label>
   <label className="text-sm">To<input className={control} type="date" value={to} onChange={e=>setTo(e.target.value)} required/></label>
   <button className="min-h-11 self-end rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50" type="submit" disabled={disabled||busy||!selected}>{busy?'Reading records…':'Generate report'}</button>
   {selected==='shift-opening'&&<label className="text-sm md:col-span-4">Original till<select className={control} value={tillId} onChange={e=>setTillId(e.target.value)} required><option value="">Select a till</option>{tills.map(t=><option key={t.id} value={t.id}>{String(t.data.openedAt||t.id)} · {t.id}</option>)}</select></label>}
  </form>
  {error&&<p role="alert" className="rounded border border-rose-500 p-3 text-sm text-rose-200">{error}</p>}
  {result&&<div className="space-y-3" aria-live="polite">
   <p className="rounded border border-amber-700/70 p-3 text-sm text-amber-200">Uncertified operational evidence. {result.basis||''}. These rows may be only one page. Always reconcile before making accounting decisions.</p>
   {result.totals&&<dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(result.totals).map(([key,val])=><div key={key} className="rounded border border-slate-600 p-3"><dt className="text-xs text-slate-300">{key}</dt><dd className="break-words text-base font-semibold tabular-nums">{printable(val)}</dd></div>)}</dl>}
   {result.blockers?.map(note=><p key={note} className="text-sm text-amber-200">• {note}</p>)}
   {result.notes?.map(note=><p key={note} className="text-sm text-slate-300">• {note}</p>)}
   <div className="flex flex-wrap items-center gap-2"><button type="button" className="min-h-11 rounded border border-slate-500 px-3 py-2 text-sm" onClick={download}>Download this page as CSV</button>
   <span className="text-xs text-slate-400">{result.recordCount===undefined?'Diagnostic':`${result.recordCount} source records`}{result.hasMore?' · Additional pages available':''}</span></div>
   {columns.length?<div className="max-w-full overflow-x-auto rounded border border-slate-600" tabIndex={0} aria-label="Report details, horizontally scrollable"><table className="w-full min-w-max text-left text-sm"><thead className="bg-slate-800"><tr>{columns.map(key=><th key={key} scope="col" className="p-2">{key}</th>)}</tr></thead><tbody>{result.rows.map((row,i)=><tr key={String(row.id||row.folio_id||row.first_id||i)} className="border-t border-slate-700">{columns.map(key=><td key={key} className="max-w-sm break-words p-2 align-top">{printable(row[key])}</td>)}</tr>)}</tbody></table></div>:<p className="text-sm text-slate-400">No line details in this diagnostic or period.</p>}
   {typeof result.recordCount==='number'&&<div className="flex gap-2"><button type="button" className="min-h-11 rounded border border-slate-500 px-3" disabled={busy||offset===0} onClick={()=>void run(Math.max(0,offset-100))}>Previous</button><button type="button" className="min-h-11 rounded border border-slate-500 px-3" disabled={busy||!result.hasMore} onClick={()=>void run(offset+100)}>Next</button></div>}
  </div>}
 </section>;
}
