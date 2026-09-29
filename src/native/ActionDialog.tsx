import React from 'react';
import { X } from 'lucide-react';
import { buttonClass } from './records';
export function ActionDialog({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){return <div className="fixed inset-0 z-[180] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}><div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button className={buttonClass} onClick={onClose}><X className="h-4 w-4"/></button></div>{children}</div></div>}
