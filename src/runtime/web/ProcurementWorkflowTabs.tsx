import React,{useEffect,useState} from 'react';

type Section={id:string;label:string;content:React.ReactNode};

export function ProcurementWorkflowTabs({sections}:{sections:Section[]}){
 const [active,setActive]=useState(sections[0]?.id||'');
 useEffect(()=>{const open=(event:Event)=>{const id=(event as CustomEvent<{id:string}>).detail?.id;if(sections.some(section=>section.id===id))setActive(id);};window.addEventListener('servos:procurement-tab',open);return()=>window.removeEventListener('servos:procurement-tab',open);},[sections]);
 const current=sections.find(section=>section.id===active)||sections[0];
 return <section className="space-y-4" aria-label="Procurement workflows"><nav className="flex flex-wrap gap-2 border-b border-slate-800 pb-3" role="tablist" aria-label="Procurement workflow sections">{sections.map(section=><button key={section.id} id={`procurement-tab-${section.id}`} role="tab" aria-selected={active===section.id} aria-controls="procurement-workflow-panel" className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${active===section.id?'border-amber-400 bg-amber-400 font-semibold text-slate-950':'border-slate-700 text-slate-200'}`} onClick={()=>setActive(section.id)}>{section.label}</button>)}</nav><div id="procurement-workflow-panel" role="tabpanel" aria-labelledby={`procurement-tab-${current?.id||''}`} className="min-w-0">{current?.content}</div></section>;
}
