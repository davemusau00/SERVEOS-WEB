import React, { useMemo, useState } from 'react';
import { BookOpen, Play, Search } from 'lucide-react';
import help from '../generated/help-index.json';
import { useOptionalGuidance } from '../guidance/GuidanceProvider';
import { useRuntime } from '../runtime/RuntimeProvider';
import { fieldClass } from './records';

type Article={id:string;title:string;section:string;roles:string[];permissions:string[];screen:string;summary:string;body:string;keywords:string[]};
export function HelpCenterView({initialQuery=''}:{initialQuery?:string}){
  const articles=help.articles as Article[];
  const [query,setQuery]=useState(initialQuery);
  const [selected,setSelected]=useState(articles.find(article=>article.id.includes(initialQuery))||articles[0]);
  const guidance=useOptionalGuidance();
  const runtime=useRuntime();
  const results=useMemo(()=>{const q=query.toLowerCase().trim();return !q?articles:articles.filter(article=>[article.title,article.section,article.summary,article.body,...article.keywords,...article.permissions].join(' ').toLowerCase().includes(q));},[query,articles]);
  const availableGuides=(guidance?.guides||[]).filter(guide=>(guide.permissions||[]).every(permission=>runtime.snapshot?.actor.permissions.includes(permission)));
  return <div className="grid h-full min-h-0 grid-cols-1 bg-slate-950 text-white lg:grid-cols-[360px_1fr]"><aside className="min-h-0 overflow-auto border-r border-slate-800 p-4"><h1 className="text-xl font-bold">ServOS Help Center</h1><p className="text-xs text-slate-400">Offline guides generated from docs/user-guide.</p>
    {availableGuides.length>0&&<section className="my-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><h2 className="text-sm font-bold text-amber-200">Learn ServOS</h2>{availableGuides.map(guide=>{const item=guidance?.progress.find(row=>row.guideId===guide.id);return <div key={guide.id} className="mt-2 flex items-center justify-between gap-2"><span className="min-w-0 text-sm">{guide.title}<span className="block text-xs text-slate-400">{item?.state==='IN_PROGRESS'?'In progress':item?.state==='COMPLETED'?'Completed':'Short tour'}</span></span><button aria-label={`${item?.state==='IN_PROGRESS'?'Continue':'Start'} ${guide.title}`} onClick={()=>guidance?.start(guide.id)} className="rounded-lg border border-amber-500/40 p-2 text-amber-200 hover:bg-amber-500/10"><Play className="h-4 w-4"/></button></div>;})}</section>}
    <label className="relative mt-3 block"><span className="sr-only">Search help articles</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input className={fieldClass+' pl-9'} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search refund, M-Pesa, stock count…"/></label>
    <div className="mt-4 space-y-2">{results.map(article=><button key={article.id} onClick={()=>setSelected(article)} className={`w-full rounded-xl border p-3 text-left ${selected?.id===article.id?'border-amber-500 bg-amber-500/10':'border-slate-800 bg-slate-900'}`}><div className="text-xs text-slate-500">{article.section}</div><b>{article.title}</b></button>)}{results.length===0&&<p className="rounded-lg p-3 text-sm text-slate-400">No matching guide. Try a shorter search.</p>}</div>
  </aside><main className="min-h-0 overflow-auto p-6">{selected?<><div className="flex items-center gap-2 text-xs font-mono text-amber-400"><BookOpen className="h-4 w-4"/>{selected.section} · {selected.screen||'General'}</div><h2 className="mt-1 text-3xl font-bold">{selected.title}</h2><p className="mt-3 max-w-3xl text-slate-400">{selected.summary}</p><div className="mt-4 flex flex-wrap gap-2">{selected.roles.map(role=><span key={role} className="rounded bg-slate-800 px-2 py-1 text-xs">{role}</span>)}{selected.permissions.map(permission=><span key={permission} className="rounded bg-purple-500/10 px-2 py-1 text-xs text-purple-300">{permission}</span>)}</div><article className="prose prose-invert mt-7 max-w-4xl whitespace-pre-wrap text-sm leading-7 text-slate-200">{selected.body}</article></>:<p className="text-slate-400">Choose an article or search for a task.</p>}</main></div>;
}
