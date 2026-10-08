import React,{useId,useState} from 'react';
import {Dialog} from '../../design-system/controls';

export type WebActionField={
 name:string;
 label:string;
 multiline?:boolean;
 initialValue?:string;
 minLength?:number;
 maxLength?:number;
};

export function WebActionDialog({title,description,fields,confirmLabel,onClose,onConfirm,disabled=false,danger=false}:{
 title:string;
 description?:string;
 fields:WebActionField[];
 confirmLabel:string;
 onClose:()=>void;
 onConfirm:(values:Record<string,string>)=>Promise<void>;
 disabled?:boolean;
 danger?:boolean;
}){
 const formId=useId();
 const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(field=>[field.name,field.initialValue||''])));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const close=()=>{if(!busy)onClose()};
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(busy||disabled)return;
  for(const field of fields){
   const value=values[field.name]||'',trimmed=value.trim(),minimum=field.minLength??1,maximum=field.maxLength??500;
   if(trimmed.length<minimum){setError(`${field.label} must contain at least ${minimum} character${minimum===1?'':'s'}.`);return}
   if(value.length>maximum){setError(`${field.label} must be ${maximum} characters or fewer.`);return}
  }
  setError('');setBusy(true);
  try{await onConfirm(values);onClose()}
  catch(cause){setError(cause instanceof Error?cause.message:'The action could not be confirmed. Review its status before trying again.')}
  finally{setBusy(false)}
 };
 return <Dialog title={title} onClose={close} footer={<><button type="button" className="min-h-10 rounded-lg border border-slate-700 px-4 py-2 text-sm" disabled={busy} onClick={close}>Cancel</button><button type="submit" form={formId} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${danger?'bg-rose-600 text-white':'bg-amber-400 text-slate-950'}`} disabled={disabled||busy}>{busy?'Saving…':confirmLabel}</button></>}>
  {description&&<p className="mb-4 text-sm text-slate-300">{description}</p>}
  <form id={formId} className="space-y-4" onSubmit={event=>void submit(event)}>
   {fields.map(field=><label key={field.name} className="block space-y-1.5 text-sm font-medium"><span>{field.label}</span>{field.multiline?<textarea autoFocus={!fields.indexOf(field)} required minLength={field.minLength??1} maxLength={field.maxLength??500} className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400" value={values[field.name]||''} onChange={event=>setValues(previous=>({...previous,[field.name]:event.target.value}))}/>:<input autoFocus={!fields.indexOf(field)} required minLength={field.minLength??1} maxLength={field.maxLength??500} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400" value={values[field.name]||''} onChange={event=>setValues(previous=>({...previous,[field.name]:event.target.value}))}/>}</label>)}
   {error&&<p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-100">{error}</p>}
  </form>
 </Dialog>;
}
