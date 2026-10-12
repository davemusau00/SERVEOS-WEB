import React,{useEffect,useMemo,useState} from 'react';
import {ArrowRight,BookOpen,Play,RotateCcw,Search} from 'lucide-react';
import help from '../../generated/help-index.json';
import {GUIDES,type GuideDefinition} from '../../guidance/core';
import type {WebGuidanceProgress} from './session';

type Article={id:string;title:string;section:string;roles:string[];permissions:string[];screen:string;summary:string;example?:string;steps?:string[];systemHandles?:string[];commonMistakes?:string[];relatedTasks?:string[];guideId?:string;estimatedMinutes?:number|null;body:string;keywords:string[]};
type Props={initialQuery?:string;permissions?:string[];availableWorkspaces?:readonly string[];progress?:WebGuidanceProgress[];onStartTour:(guideId?:string)=>void;onRestartGuide?:(guideId:string)=>void;onNavigate?:(tab:string)=>void};
const articles=help.articles as Article[];
const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40';
const primary=`${button} border-amber-400 bg-amber-400 text-slate-950 hover:bg-amber-300`;
const canUse=(permissions:readonly string[],required:readonly string[]=[])=>required.every(permission=>permissions.includes('*')||permissions.includes(permission));
const screenTabs:Record<string,string>={pos:'POS',inventory:'Inventory',catalog:'Catalog',procurement:'Procurement',rooms:'Rooms',frontdesk:'Front Desk',guestaccounts:'Guest Accounts',housekeeping:'Housekeeping',maintenance:'Maintenance',kds:'KDS',finance:'Finance',help:'Help',settings:'Settings',staff:'Staff',administration:'Administration',activity:'Activity'};
const workspaceFor=(screen:string)=>screenTabs[screen.toLowerCase().replace(/[^a-z]/g,'')];
const guideFor=(query:string)=>GUIDES.find(guide=>guide.id===query.trim()||guide.title.toLowerCase()===query.trim().toLowerCase());
const initialArticle=(query:string)=>articles.find(article=>article.guideId===guideFor(query)?.id)||articles.find(article=>article.title.toLowerCase().includes(query.toLowerCase()));
const associatedGuide=(article:Article|undefined)=>{
 if(!article)return undefined;
 if(article.guideId)return GUIDES.find(guide=>guide.id===article.guideId);
 const title=article.title.toLowerCase();
 const id=title.includes('stocktake')||title.includes('count stock')?'stock.count':title.includes('receive stock')?'stock.receive':title.includes('close day')?'finance.close-day':title.includes('getting started')?'servos.core':null;
 return GUIDES.find(guide=>guide.id===id);
};
const cleanStep=(value:string)=>value.replace(/^#{1,6}\s*/gm,'').replace(/\*\*/g,'').replace(/`/g,'');

export function WebHelpView({initialQuery='',permissions=[],availableWorkspaces,progress=[],onStartTour,onRestartGuide,onNavigate}:Props){
 const [query,setQuery]=useState(()=>guideFor(initialQuery)?'':initialQuery);
 const [selectedId,setSelectedId]=useState(()=>initialArticle(initialQuery)?.id||articles[0]?.id||'');
 useEffect(()=>{setQuery(guideFor(initialQuery)?'':initialQuery);setSelectedId(initialArticle(initialQuery)?.id||articles[0]?.id||'');},[initialQuery]);
 const results=useMemo(()=>{const value=query.trim().toLowerCase();return value?articles.filter(article=>[article.title,article.section,article.summary,article.guideId,...article.keywords].join(' ').toLowerCase().includes(value)):articles;},[query]);
 const selected=results.find(article=>article.id===selectedId)||results[0];
 const selectedGuide=associatedGuide(selected);
 const guideAvailable=(guide:GuideDefinition)=>canUse(permissions,guide.permissions)&&(!availableWorkspaces||guide.steps.every(step=>!step.webTab||availableWorkspaces.includes(step.webTab)));
 const guideProgress=selectedGuide?progress.find(row=>row.guideId===selectedGuide.id&&row.guideVersion===selectedGuide.version):undefined;
 const selectedTab=selected?workspaceFor(selected.screen):undefined;
 const canShow=Boolean(selectedTab&&canUse(permissions,selected?.permissions)&&(!availableWorkspaces||availableWorkspaces.includes(selectedTab)));
 const selectedGuideAllowed=Boolean(selectedGuide&&guideAvailable(selectedGuide));
 const guides=GUIDES.filter(guide=>guideAvailable(guide)&&(!query.trim()||`${guide.title} ${guide.description}`.toLowerCase().includes(query.trim().toLowerCase())));
 const navigate=(tab:string)=>onNavigate?onNavigate(tab):window.dispatchEvent(new CustomEvent('servos:web-navigate',{detail:{tab}}));
 const showArticle=(id:string)=>{setQuery('');setSelectedId(id);};
 return <div className="grid grid-cols-1 gap-4 text-white lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]" data-guide-anchor="web.help">
  <aside className="min-w-0 rounded-xl border border-slate-800 p-4"><h2 className="text-xl font-bold">Help &amp; training</h2><p className="mt-1 text-sm text-slate-400">Find instructions or resume a guided task.</p>
   <label className="relative mt-4 block"><span className="sr-only">Search help articles and guided tasks</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400"/><input type="search" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-amber-400" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search a task or mistake"/></label>
   <p role="status" className="mt-3 text-xs text-slate-400">{results.length} article{results.length===1?'':'s'} · {guides.length} available guide{guides.length===1?'':'s'}</p>
   <nav className="mt-3 max-h-72 space-y-2 overflow-y-auto lg:max-h-[60dvh]" aria-label="Help articles">{results.map(article=><button type="button" key={article.id} aria-current={selected?.id===article.id?'page':undefined} onClick={()=>setSelectedId(article.id)} className={`min-h-11 w-full rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${selected?.id===article.id?'border-amber-500 bg-amber-500/10':'border-slate-800 bg-slate-900'}`}><span className="block text-xs text-slate-400">{article.section}</span><b>{article.title}</b><span className="mt-1 block text-xs text-slate-300">{article.summary}</span></button>)}</nav>
   {!results.length&&<p className="mt-3 text-sm text-slate-400">No matching article. Try another word or choose a guided task.</p>}
  </aside>
  <div className="min-w-0 space-y-4">
   {selected&&<article>
    <header className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-300"><BookOpen className="h-4 w-4"/>{selected.section}</div><h2 className="mt-2 text-2xl font-bold">{selected.title}</h2></div><span className="text-xs text-slate-400">{selected.estimatedMinutes?`About ${selected.estimatedMinutes} min`:'Short reference'}</span></div><p className="mt-3 text-sm leading-6 text-slate-300">{selected.summary}</p><div className="mt-4 flex flex-wrap gap-2">
     {selectedTab&&<button type="button" className={primary} disabled={!canShow} onClick={()=>{if(canShow)navigate(selectedTab);}}><ArrowRight className="h-4 w-4"/>Show me</button>}
     {selectedGuide&&<button type="button" className={button} disabled={!selectedGuideAllowed} onClick={()=>{if(selectedGuideAllowed)onStartTour(selectedGuide.id);}}><Play className="h-4 w-4"/>{guideProgress?.state==='IN_PROGRESS'?'Resume guided task':'Start guided task'}</button>}
     {selectedGuide&&onRestartGuide&&guideProgress&&<button type="button" className={button} disabled={!selectedGuideAllowed} onClick={()=>{if(selectedGuideAllowed){onRestartGuide(selectedGuide.id);onStartTour(selectedGuide.id);}}}><RotateCcw className="h-4 w-4"/>Restart guide</button>}
    </div>{selectedTab&&!canShow&&<p className="mt-3 text-sm text-amber-200">You can read these instructions. Opening this task requires the appropriate workspace, staff access and device authorization.</p>}{selectedGuide&&!selectedGuideAllowed&&<p className="mt-3 text-sm text-amber-200">This guided task is unavailable with your current access. Ask an authorized manager for help.</p>}{guideProgress&&<p className="mt-3 text-xs text-slate-400">{guideProgress.state==='COMPLETED'?'Current guide version completed':`${guideProgress.completedStepIds.length} confirmed or reviewed steps saved. Skipped and unconfirmed steps remain incomplete.`} Progress is for this staff account on this browser.</p>}</header>
    {selected.example&&<HelpSection title="Example" tone="sky"><p>{selected.example}</p></HelpSection>}
    {!!selected.steps?.length&&<HelpSection title="What to do"><ol className="space-y-3">{selected.steps.map((step,index)=><li key={`${selected.id}-${index}`} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-400/15 text-xs font-bold text-amber-200">{index+1}</span><span>{cleanStep(step)}</span></li>)}</ol></HelpSection>}
    {!!selected.systemHandles?.length&&<HelpSection title="What ServOS records" tone="emerald">{selected.systemHandles.map((item,index)=><p key={index}>{item}</p>)}</HelpSection>}
    {!!selected.commonMistakes?.length&&<HelpSection title="Avoid these mistakes" tone="amber">{selected.commonMistakes.map((item,index)=><p key={index}>{item}</p>)}</HelpSection>}
    {!!selected.relatedTasks?.length&&<HelpSection title="Related tasks"><div className="flex flex-wrap gap-2">{selected.relatedTasks.map(id=>{const article=articles.find(item=>item.id===id);return article?<button key={id} type="button" className={button} onClick={()=>showArticle(id)}>{article.title}</button>:null;})}</div></HelpSection>}
    <details className="mt-4 rounded-xl border border-slate-800 p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-slate-300">Full reference and policy notes</summary><div className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{selected.body}</div></details>
   </article>}
   {guides.length>0&&<section className="rounded-2xl border border-slate-800 bg-slate-900 p-5" aria-label="Available guided tasks"><h2 className="font-bold">Guided tasks for your work</h2><p className="mt-1 text-sm text-slate-400">Guides open the real workspace. They never submit transactions for you.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{guides.map(guide=>{const saved=progress.find(row=>row.guideId===guide.id&&row.guideVersion===guide.version);return <div key={guide.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3"><h3 className="font-semibold">{guide.title}</h3><p className="mt-1 text-sm text-slate-300">{guide.description}</p><p className="mt-2 text-xs text-slate-400">Version {guide.version}{saved?.state==='COMPLETED'?' · completed':saved?' · progress saved':''}</p><button type="button" className={`${button} mt-3`} onClick={()=>{if(guideAvailable(guide))onStartTour(guide.id);}}><Play className="h-4 w-4"/>{saved?.state==='IN_PROGRESS'?'Resume':saved?.state==='COMPLETED'?'Review':'Start'}</button>{saved&&onRestartGuide&&<button type="button" className={`${button} ml-2 mt-3`} onClick={()=>{if(guideAvailable(guide)){onRestartGuide(guide.id);onStartTour(guide.id);}}}>Restart</button>}</div>;})}</div></section>}
  </div>
 </div>;
}

function HelpSection({title,tone='neutral',children}:{title:string;tone?:'neutral'|'sky'|'emerald'|'amber';children:React.ReactNode}){
 const color=tone==='sky'?'border-sky-700/40 text-sky-200':tone==='emerald'?'border-emerald-700/40 text-emerald-200':tone==='amber'?'border-amber-700/40 text-amber-200':'border-slate-800 text-slate-100';
 return <section className={`mt-4 rounded-xl border bg-slate-900 p-4 ${color}`}><h3 className="font-semibold">{title}</h3><div className="mt-3 space-y-2 text-sm leading-6 text-slate-200">{children}</div></section>;
}
