import React, { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { Permission } from '../types/runtime';
import { useRuntime } from '../runtime/RuntimeProvider';
import { fieldClass, primaryButtonClass, buttonClass } from './records';

export function ManagerApprovalDialog({ permission, target, onApproved, onClose }:{
  permission: Permission;
  target?: string;
  onApproved: (token:string)=>void | Promise<void>;
  onClose: ()=>void;
}) {
  const runtime=useRuntime();
  const eligible=(runtime.status?.staff||[]).filter(s=>(s.role==='Manager'||s.role==='Admin')&&(permission!=='procurement.over_receive'||s.id!==runtime.snapshot?.actor.id));
  const [approver,setApprover]=useState(eligible[0]?.id||'');
  const [pin,setPin]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const managers=eligible;
  useEffect(()=>{if(!managers.some(s=>s.id===approver))setApprover(managers[0]?.id||'')},[managers,approver]);
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Manager approval">
    <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><ShieldCheck className="text-amber-400"/><div><h2 className="font-bold">Manager approval</h2><p className="mt-1 text-xs text-slate-400">Permission: <span className="font-mono text-amber-300">{permission}</span>. Approval is single-use and expires in two minutes.</p></div></div><button className="p-1 text-slate-400" onClick={onClose}><X/></button></div>
      <div className="mt-5 space-y-3"><label className="block text-sm">Approver<select className={fieldClass} value={approver} onChange={e=>setApprover(e.target.value)}>{managers.map(s=><option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}</select></label>{!managers.length&&<p className="text-sm text-amber-300" role="status">No eligible Admin or Manager is available to approve this action.</p>}<label className="block text-sm">Approver PIN<input autoFocus className={fieldClass} type="password" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,12))}/></label>{error&&<p className="text-sm text-rose-300" role="alert">{error}</p>}</div>
      <div className="mt-5 flex justify-end gap-2"><button className={buttonClass} onClick={onClose}>Cancel</button><button className={primaryButtonClass} disabled={busy||!approver||pin.length<6} onClick={async()=>{setBusy(true);setError('');try{const a=await runtime.approve(approver,pin,permission,target);await onApproved(a.token);onClose();}catch(e){setError(String(e));}finally{setBusy(false);}}}>{busy?'Checking…':'Approve action'}</button></div>
    </div>
  </div>;
}
