import React, { useState } from 'react';
import { ArrowRight, BedDouble, Boxes, ClipboardCheck, PackagePlus, Plus, Search, Truck, X } from 'lucide-react';
import type { Permission } from '../types/runtime';
import { StaffWelcome } from '../guidance/StaffWelcome';
import { TourAnchor, useGuidance } from '../guidance/GuidanceProvider';

interface HomeAction { id: string; title: string; description: string; icon: React.ComponentType<{ className?: string }>; permission: Permission; }
const actions: HomeAction[] = [
  { id: 'pos', title: 'Make a sale', description: 'Open a tab, add items, and take payment.', icon: ClipboardCheck, permission: 'pos.sell' },
  { id: 'inventory', title: 'Count or move stock', description: 'Record a count, transfer, or waste movement.', icon: Boxes, permission: 'inventory.view' },
  { id: 'procurement', title: 'Receive a delivery', description: 'Receive items against an order or record a new delivery.', icon: Truck, permission: 'procurement.receive' },
  { id: 'frontdesk', title: 'Work with rooms', description: 'Open Front Desk and manage today’s guest work.', icon: BedDouble, permission: 'rooms.view' },
];
const quickAdds: Array<{ id: string; action: string; label: string; permission: Permission }> = [
  { id: 'catalog', action: 'add-item', label: 'Item or menu product', permission: 'catalog.manage' },
  { id: 'rooms', action: 'add-room', label: 'Room', permission: 'rooms.manage' },
  { id: 'assets', action: 'add-asset', label: 'Property item', permission: 'assets.manage' },
];

export function NativeHomeView({ permissions, onNavigate }: { permissions: Permission[]; onNavigate: (id: string, action?: string) => void }) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { guides, progress, start } = useGuidance();
  const visibleActions = actions.filter(action => permissions.includes(action.permission));
  const visibleAdds = quickAdds.filter(action => permissions.includes(action.permission));
  return <div className="h-full overflow-auto bg-slate-950 p-4 text-white sm:p-7">
    <div className="mx-auto max-w-5xl"><StaffWelcome/>
      <p className="text-sm font-semibold text-amber-300">HOME</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">What are you working on?</h1><p className="mt-2 text-slate-400">Choose a task to open the right workspace.</p></div>
        <TourAnchor id="quick-add.open"><button className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950 hover:bg-amber-300" onClick={() => setQuickAddOpen(true)}><Plus className="h-5 w-5"/>Quick Add</button></TourAnchor>
      </div>
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        {visibleActions.map(action => { const Icon = action.icon; return <button key={action.id} onClick={() => onNavigate(action.id, action.id === 'procurement' ? 'receive-delivery' : undefined)} className="group flex min-h-28 items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left hover:border-amber-500/60 hover:bg-slate-900/80"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-800 text-amber-300"><Icon className="h-6 w-6"/></span><span className="min-w-0 flex-1"><b className="text-lg">{action.title}</b><span className="mt-1 block text-sm text-slate-400">{action.description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-amber-300"/></button>; })}
        {visibleActions.length === 0 && <p className="rounded-xl border border-slate-800 p-5 text-slate-300">Ask a manager to assign your work permissions.</p>}
      </section>
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Find something</h2><p className="mt-1 text-sm text-slate-400">Open a workspace by its name.</p></div>{permissions.includes('help.view')&&<button onClick={() => onNavigate('help')} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"><Search className="h-4 w-4"/>Search Help</button>}</div><div className="mt-4 flex flex-wrap gap-2">{[
        ['inventory','Stock','inventory.view'],['frontdesk','Rooms','rooms.view'],['assets','Property','assets.view'],['reports','Reports','reports.view'],['admin','Setup','backup.create'],
      ].filter(([, , permission]) => permissions.includes(permission as Permission)).map(([id,label]) => <button key={id} onClick={() => onNavigate(id)} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-amber-500">{label}</button>)}</div></section>
      {guides.filter(guide => (guide.permissions || []).every(permission => permissions.includes(permission as Permission))).map(guide => {const guideProgress=progress.find(row=>row.guideId===guide.id&&row.guideVersion===guide.version);const inProgress=guideProgress?.state==='IN_PROGRESS';return <section key={guide.id} className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5"><div><h2 className="font-bold">{guide.title}</h2><p className="mt-1 text-sm text-slate-400">{inProgress?'Continue your short tour.':guideProgress?.state==='COMPLETED'?'You completed this tour. You can take it again any time.':guide.description}</p></div><button onClick={() => start(guide.id)} className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10">{inProgress ? 'Continue tour' : guideProgress?.state==='COMPLETED'?'Take tour again':guide.id==='servos.core'?'Take a quick tour':`Start ${guide.title}`}</button></section>;})}
    </div>
    {quickAddOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setQuickAddOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="quick-add-heading" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-amber-300">QUICK ADD</p><h2 id="quick-add-heading" className="mt-1 text-xl font-bold">What do you need to add?</h2></div><button aria-label="Close Quick Add" onClick={() => setQuickAddOpen(false)} className="rounded-lg p-2 hover:bg-slate-800"><X className="h-5 w-5"/></button></div><div className="mt-4 space-y-2">{visibleAdds.map(item => <button key={item.id} onClick={() => { setQuickAddOpen(false); onNavigate(item.id,item.action); }} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-left hover:border-amber-500/60"><span className="flex items-center gap-3"><PackagePlus className="h-5 w-5 text-amber-300"/>{item.label}</span><ArrowRight className="h-4 w-4 text-slate-500"/></button>)}{visibleAdds.length === 0 && <p className="p-3 text-sm text-slate-400">You do not have permission to add these records.</p>}</div></section></div>}
  </div>;
}
