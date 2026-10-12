import React,{useEffect,useState} from 'react';
import {LockKeyhole,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import {workspaceById,type WorkspaceTab,type WorkspaceDefinition} from './workspaceRegistry';
import {ds} from '../../design-system/tokens';

const readPreference=(key:string)=>{try{return localStorage.getItem(key)==='collapsed';}catch{return false;}};
export function WorkspaceSidebar({tabs,current,onNavigate,businessId,staffId,staffName,businessName,emblem}:{tabs:WorkspaceTab[];current:WorkspaceTab;onNavigate:(tab:WorkspaceTab)=>void;businessId:string;staffId:string;staffName:string;businessName:string;emblem?:string}){
 const key=`servos-sidebar:${businessId}:${staffId}`;
 const [collapsed,setCollapsed]=useState(()=>readPreference(key));
 useEffect(()=>setCollapsed(readPreference(key)),[key]);
 const toggle=()=>setCollapsed(value=>{try{localStorage.setItem(key,value?'expanded':'collapsed');}catch{/* Presentation preference only. */}return !value;});
 const groups:WorkspaceDefinition['group'][]=['Start','Operations','Management','System'];
 return <aside aria-label="Workspace sidebar" className={`hidden shrink-0 flex-col border-r border-slate-800 bg-slate-900 md:flex ${collapsed?'w-20':'w-56'}`}>
  <div className="border-b border-slate-800 p-3">
   <div className="flex items-center justify-between gap-2">{!collapsed&&(emblem?<img src={emblem} alt="Business emblem" className="h-10 max-w-36 rounded bg-white object-contain p-1"/>:<span className="text-xs font-black tracking-widest text-amber-400">SERVOS</span>)}<button type="button" aria-label={collapsed?'Expand navigation':'Collapse navigation'} title={collapsed?'Expand navigation':'Collapse navigation'} className={`${ds.button} min-h-11 min-w-11`} onClick={toggle}>{collapsed?<PanelLeftOpen aria-hidden="true" className="h-4 w-4"/>:<PanelLeftClose aria-hidden="true" className="h-4 w-4"/>}</button></div>
   {!collapsed&&<p className="mt-2 break-words text-sm font-bold">{businessName||'Business workspace'}</p>}
  </div>
  <nav aria-label="Business workspace" className="flex-1 space-y-3 overflow-auto p-2">
   {groups.map(group=>{const items=tabs.map(workspaceById).filter(item=>item.group===group);return items.length?<section key={group} aria-label={group} className={collapsed?'border-b border-slate-800 pb-2':''}>
    {!collapsed&&<h2 className="mb-1 px-2 text-xs font-semibold text-slate-400">{group}</h2>}
    <div className="space-y-1">{items.map(item=>{const Icon=item.icon;return <button key={item.id} type="button" title={collapsed?item.label:undefined} aria-label={item.label} aria-current={current===item.id?'page':undefined} data-guide-anchor={`navigation.${item.id.toLowerCase().replace(/ /g,'-')}`} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${collapsed?'justify-center':''} ${current===item.id?'bg-amber-400 font-bold text-slate-950':'text-slate-300 hover:bg-slate-800'}`} onClick={()=>onNavigate(item.id)}><Icon aria-hidden="true" className="h-5 w-5 shrink-0"/>{!collapsed&&<span className="min-w-0 flex-1 break-words">{item.label}</span>}</button>;})}</div>
   </section>:null;})}
  </nav>
  <div className="border-t border-slate-800 p-3" title={collapsed?staffName:undefined}><div className="flex items-center gap-2 text-xs text-slate-400"><LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0"/>{!collapsed&&<span>Signed in</span>}</div>{!collapsed&&<p className="mt-1 break-words text-sm font-semibold">{staffName||'Staff member'}</p>}</div>
 </aside>;
}
