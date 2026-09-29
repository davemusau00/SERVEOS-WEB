import React, { useEffect, useMemo, useState } from 'react';
import { BedDouble, BookOpen, Boxes, ClipboardCheck, CreditCard, Database, FileSpreadsheet, HelpCircle, Home, LayoutGrid, Lock, Martini, PackageSearch, RefreshCw, Settings, SlidersHorizontal, Truck, WalletCards, Sparkles, CalendarRange, ChevronDown } from 'lucide-react';
import { flushLocalWork } from '../runtime/localWork';
import { useRuntime } from '../runtime/RuntimeProvider';
import type { Permission } from '../types/runtime';
import { GuidanceProvider } from '../guidance/GuidanceProvider';
import { NativeHomeView } from './NativeHomeView';
import { NativePOSView } from './NativePOSView';
import { NativeKDSView } from './NativeKDSView';
import { NativeInventoryView } from './NativeInventoryView';
import { NativeCatalogView } from './NativeCatalogView';
import { NativeReconciliationView, NativeCloseDayView, NativeReportsView, NativeAdminView, NativeRefundsView } from './NativeOperationsViews';
import { NativeFloorplanView } from './NativeFloorplanView';
import { NativeProcurementView } from './NativeProcurementView';
import { HelpCenterView } from './HelpCenterView';
import { NativeMasterDataView } from './NativeMasterDataView';
import { NativeImportCenterView } from './NativeImportCenterView';
import { NativeRoomsView } from './NativeRoomsView';
import { NativeFrontDeskView } from './NativeFrontDeskView';
import { NativeHousekeepingView } from './NativeHousekeepingView';
import { NativeFoliosView } from './NativeFoliosView';
import { NativeAssetsView } from './NativeAssetsView';
import { NativeCustomerCreditView } from './NativeCustomerCreditView';

interface ShellRoute { id: string; label: string; permission: Permission; icon: React.ComponentType<{ className?: string }>; help: string; group: 'Operations' | 'Management' | 'System'; }
const routes: ShellRoute[] = [
  { id:'pos',label:'Sell',permission:'pos.sell',icon:Martini,help:'pos-tabs',group:'Operations' },
  { id:'kds',label:'Orders',permission:'kds.view',icon:ClipboardCheck,help:'kds',group:'Operations' },
  { id:'inventory',label:'Stock',permission:'inventory.view',icon:Boxes,help:'inventory',group:'Operations' },
  { id:'frontdesk',label:'Front Desk',permission:'rooms.view',icon:CalendarRange,help:'front-desk',group:'Operations' },
  { id:'folios',label:'Guest accounts',permission:'folio.view',icon:WalletCards,help:'folios',group:'Operations' },
  { id:'housekeeping',label:'Housekeeping',permission:'rooms.manage',icon:Sparkles,help:'housekeeping',group:'Operations' },
  { id:'procurement',label:'Purchasing',permission:'procurement.view',icon:Truck,help:'19-receiving',group:'Management' },
  { id:'catalog',label:'Items and menu',permission:'catalog.view',icon:PackageSearch,help:'portions',group:'Management' },
  { id:'assets',label:'Property',permission:'assets.view',icon:PackageSearch,help:'asset-register-procurement',group:'Management' },
  { id:'rooms',label:'Room setup',permission:'rooms.view',icon:BedDouble,help:'rooms-engine',group:'Management' },
  { id:'tender',label:'M-Pesa reconciliation',permission:'mpesa.reconcile',icon:WalletCards,help:'mpesa',group:'Management' },
  { id:'credit',label:'Customer Accounts',permission:'credit.view',icon:CreditCard,help:'customer-credit',group:'Management' },
  { id:'refunds',label:'Refunds',permission:'payment.record',icon:CreditCard,help:'refunds',group:'Management' },
  { id:'close',label:'Close Day',permission:'till.close',icon:SlidersHorizontal,help:'close-day',group:'Management' },
  { id:'reports',label:'Reports',permission:'reports.view',icon:BookOpen,help:'reports',group:'Management' },
  { id:'floorplan',label:'Tables and floorplan',permission:'floorplan.view',icon:LayoutGrid,help:'floorplan',group:'System' },
  { id:'master',label:'Business setup',permission:'catalog.manage',icon:Database,help:'master-data',group:'System' },
  { id:'imports',label:'Bring in data',permission:'data.import.view',icon:FileSpreadsheet,help:'master-data',group:'System' },
  { id:'admin',label:'Business administration',permission:'backup.create',icon:Settings,help:'rbac',group:'System' },
  { id:'help',label:'Help',permission:'help.view',icon:HelpCircle,help:'getting-started',group:'System' },
];

export function NativeBarShell() { return <GuidanceProvider><NativeBarShellContent/></GuidanceProvider>; }

function NativeBarShellContent(){
  const runtime=useRuntime(); const snapshot=runtime.snapshot!;
  const allowed=useMemo(()=>routes.filter(route=>snapshot.actor.permissions.includes(route.permission)),[snapshot.actor.permissions]);
  const route=()=>window.location.hash.replace(/^#\/?/,'').split(/[/?]/)[0]||'home';
  const routeAction=()=>new URLSearchParams(window.location.hash.split('?')[1]||'').get('action')||'';
  const [tab,setTab]=useState(route); const [tabAction,setTabAction]=useState(routeAction); const [helpQuery,setHelpQuery]=useState(''); const [moreOpen,setMoreOpen]=useState(false);
  useEffect(()=>{const update=()=>{setTab(route());setTabAction(routeAction())};window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
  useEffect(()=>{if(tab!=='home'&&!allowed.some(item=>item.id===tab)){window.location.hash='/home';setTab('home');}},[allowed,tab]);
  const go=(id:string,action?:string)=>{void flushLocalWork().then(()=>{if(id!=='home'&&!allowed.some(item=>item.id===id))return;window.location.hash=`/${id}${action?`?action=${encodeURIComponent(action)}`:''}`;setTab(id);setTabAction(action||'');setMoreOpen(false);}).catch(cause=>window.alert(String(cause)));};
  useEffect(()=>{const handle=(event:Event)=>{const target=(event as CustomEvent<{screen:string;action?:string}>).detail;if(target?.screen)go(target.screen,target.action)};window.addEventListener('servos:guide-route',handle);return()=>window.removeEventListener('servos:guide-route',handle)},[allowed]);
  const current=allowed.find(item=>item.id===tab);
  const openHelp=()=>{if(!allowed.some(item=>item.id==='help'))return;setHelpQuery(current?.help||'');go('help');};
  const content=tab==='home'?<NativeHomeView permissions={snapshot.actor.permissions} onNavigate={go}/>:tab==='pos'?<NativePOSView/>:tab==='kds'?<NativeKDSView/>:tab==='inventory'?<NativeInventoryView/>:tab==='assets'?<NativeAssetsView initialAction={tabAction}/>:tab==='procurement'?<NativeProcurementView initialAction={tabAction} onOpenCatalog={()=>go('catalog')}/>:tab==='catalog'?<NativeCatalogView initialAction={tabAction}/>:tab==='master'?<NativeMasterDataView/>:tab==='imports'?<NativeImportCenterView/>:tab==='frontdesk'?<NativeFrontDeskView/>:tab==='folios'?<NativeFoliosView/>:tab==='housekeeping'?<NativeHousekeepingView/>:tab==='rooms'?<NativeRoomsView initialAction={tabAction}/>:tab==='tender'?<NativeReconciliationView/>:tab==='credit'?<NativeCustomerCreditView/>:tab==='refunds'?<NativeRefundsView/>:tab==='floorplan'?<NativeFloorplanView/>:tab==='close'?<NativeCloseDayView/>:tab==='reports'?<NativeReportsView/>:tab==='admin'?<NativeAdminView/>:<HelpCenterView key={helpQuery} initialQuery={helpQuery}/>;
  const groups=['Operations','Management','System'] as const;
  return <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 md:flex"><div className="border-b border-slate-800 p-4"><div className="text-xs font-black tracking-[.25em] text-amber-400">SERVOS</div><div className="mt-1 font-bold">Workspaces</div></div><nav className="flex-1 space-y-4 overflow-auto p-2" aria-label="Workspaces">
      <button onClick={()=>go('home')} data-guide-anchor="navigation.home" className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${tab==='home'?'bg-amber-400 font-bold text-slate-950':'text-slate-300 hover:bg-slate-800'}`}><Home className="h-4 w-4"/>Home</button>
      {groups.map(group=>{const entries=allowed.filter(item=>item.group===group);if(!entries.length)return null;return <section key={group}><h2 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{group}</h2><div className="space-y-1">{entries.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>go(item.id)} data-guide-anchor={`navigation.${item.id}`} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${tab===item.id?'bg-amber-400 font-bold text-slate-950':'text-slate-300 hover:bg-slate-800'}`}><Icon className="h-4 w-4"/>{item.label}</button>;})}</div></section>;})}
    </nav><div className="border-t border-slate-800 p-3"><div className="text-sm font-semibold">{snapshot.actor.name}</div><div className="text-xs text-slate-500">{snapshot.actor.role} · authenticated PIN session</div></div></aside>
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3"><div className="min-w-0"><div className="truncate font-bold">{tab==='home'?'Home':current?.label||'ServOS'}</div><div data-guide-anchor="shell.status" className="text-xs text-slate-500">{navigator.onLine?'Online':'Offline · local trading active'} · {snapshot.pendingCount} pending sync</div></div><div className="flex items-center gap-2"><button data-guide-anchor="shell.help" className="rounded-lg border border-slate-700 p-2" aria-label="Open contextual help" title="Context help" onClick={openHelp}><HelpCircle className="h-4 w-4"/></button>{snapshot.actor.permissions.includes('sync.manual')&&<button data-guide-anchor="shell.sync" className="rounded-lg border border-slate-700 p-2" aria-label="Sync" title="Sync" disabled={runtime.syncing} onClick={()=>void runtime.sync()}><RefreshCw className={`h-4 w-4 ${runtime.syncing?'animate-spin':''}`}/></button>}<button data-guide-anchor="shell.lock" className="rounded-lg border border-slate-700 p-2" aria-label="Lock terminal" title="Change staff / lock" onClick={()=>void runtime.lock()}><Lock className="h-4 w-4"/></button></div></header>
      {runtime.error&&<div className="shrink-0 bg-rose-950 px-4 py-2 text-sm text-rose-200">{runtime.error}<button className="float-right underline" onClick={runtime.clearError}>Dismiss</button></div>}
      <main className="min-h-0 flex-1 overflow-hidden">{content}</main>
      <nav aria-label="Primary navigation" className="relative flex shrink-0 items-stretch justify-around border-t border-slate-800 bg-slate-900 p-1 md:hidden"><button onClick={()=>go('home')} data-guide-anchor="navigation.home" className={`grid min-w-16 place-items-center rounded-lg px-3 py-2 text-[10px] ${tab==='home'?'bg-amber-400 text-slate-950':'text-slate-400'}`}><Home className="h-4 w-4"/><span>Home</span></button>{[['pos','Sell',Martini],['inventory','Stock',Boxes]].filter(([id])=>allowed.some(item=>item.id===id)).map(([id,label,Icon])=>{const key=id as string;const I=Icon as React.ComponentType<{className?:string}>;return <button key={key} onClick={()=>go(key)} data-guide-anchor={`navigation.${key}`} className={`grid min-w-16 place-items-center rounded-lg px-3 py-2 text-[10px] ${tab===key?'bg-amber-400 text-slate-950':'text-slate-400'}`}><I className="h-4 w-4"/><span>{label as string}</span></button>;})}<button onClick={()=>setMoreOpen(value=>!value)} aria-expanded={moreOpen} className="grid min-w-16 place-items-center rounded-lg px-3 py-2 text-[10px] text-slate-400"><ChevronDown className="h-4 w-4"/><span>More</span></button>{moreOpen&&<div className="absolute bottom-full right-2 z-40 mb-2 max-h-[65vh] w-64 overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">{allowed.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>go(item.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-slate-800"><Icon className="h-4 w-4 text-amber-300"/>{item.label}</button>;})}<button onClick={()=>go('home')} className="w-full rounded-lg px-3 py-3 text-left text-sm hover:bg-slate-800">Home</button></div>}</nav>
    </div>
  </div>;
}
