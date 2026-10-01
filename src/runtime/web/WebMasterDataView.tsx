import React,{useMemo,useState} from 'react';
import type {BusinessRecord,WebSession} from './session';
import {allowed} from './session';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';

type CommandFn=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
type CollectionKey='customers'|'suppliers'|'roomTypes'|'assetCategories';
type Field={key:string;label:string;type?:'text'|'email'|'number'|'textarea';optional?:boolean;defaultValue?:string};

const fieldClass='w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';
const button='rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold disabled:opacity-40';
const primary='rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40';
const definitions:Array<{collection:CollectionKey;label:string;permission:string;description:string;fields:Field[];defaults:Record<string,string>}>=[
 {collection:'customers',label:'Customers',permission:'customers.manage',description:'Reusable customer identities for tabs and service history.',fields:[{key:'name',label:'Customer name'},{key:'phone',label:'Phone',optional:true},{key:'email',label:'Email',type:'email',optional:true},{key:'notes',label:'Notes',type:'textarea',optional:true}],defaults:{name:'',phone:'',email:'',notes:''}},
 {collection:'suppliers',label:'Suppliers',permission:'suppliers.manage',description:'Suppliers used by purchase orders, goods receipts and accounts payable.',fields:[{key:'name',label:'Supplier name'},{key:'code',label:'Supplier code'},{key:'phone',label:'Phone',optional:true},{key:'email',label:'Email',type:'email',optional:true},{key:'contactPerson',label:'Contact person',optional:true},{key:'kraPin',label:'KRA PIN',optional:true},{key:'paymentTermsDays',label:'Payment terms (days)',type:'number',optional:true},{key:'paymentTerms',label:'Payment terms / notes',type:'textarea',optional:true}],defaults:{name:'',code:'',phone:'',email:'',contactPerson:'',kraPin:'',paymentTermsDays:'0',paymentTerms:''}},
 {collection:'roomTypes',label:'Room Types',permission:'roomTypes.manage',description:'Room categories and maximum occupancy used by reservations.',fields:[{key:'name',label:'Room type'},{key:'maxGuests',label:'Maximum guests',type:'number'}],defaults:{name:'',maxGuests:'1'}},
 {collection:'assetCategories',label:'Asset Categories',permission:'assetCategories.manage',description:'Reusable categories for property assets and operational history.',fields:[{key:'name',label:'Category name'}],defaults:{name:''}},
];
const data=(record?:BusinessRecord)=>record?.data as Record<string,any>|undefined;
const outcomeText=(outcome:CommandOutcome)=>{switch(outcome.kind){case'CONFIRMED':return 'Master-data change confirmed and synchronized.';case'DRAFT_SAVED':return 'Change saved as a draft; it has not taken effect.';case'PENDING':return 'Change is waiting to synchronize. Do not submit it again.';case'OUTCOME_UNKNOWN':case'REJECTED':case'CONFLICT':case'BLOCKED':return outcome.message}};

export function WebMasterDataView({records,session,disabled,command}:{records:BusinessRecord[];session:WebSession;disabled:boolean;command:CommandFn}){
 const available=useMemo(()=>definitions.filter(def=>allowed(session,def.permission)),[session]);
 const [collection,setCollection]=useState<CollectionKey>(available[0]?.collection||'customers');
 const [query,setQuery]=useState('');
 const [editing,setEditing]=useState<BusinessRecord|null>(null);
 const [outcome,setOutcome]=useState<CommandOutcome|null>(null);
 const def=available.find(item=>item.collection===collection)||available[0];
 const rows=records.filter(record=>record.collection===def?.collection&&!record.archived&&JSON.stringify(record.data).toLowerCase().includes(query.toLowerCase()));
 const save=async(values:Record<string,string>)=>{
  if(!def)return;
  const id=editing?.id||crypto.randomUUID();
  const recordData:Record<string,unknown>={...values};
  if(def.collection==='roomTypes')recordData.maxGuests=Number(values.maxGuests);
  if(def.collection==='suppliers')recordData.paymentTermsDays=Number(values.paymentTermsDays||0);
  setOutcome(null);try{const result=await command('record.save',def.collection,id,{id,collection:def.collection,data:recordData});setOutcome(result);if(isCommandConfirmed(result))setEditing(null)}catch{setOutcome({kind:'BLOCKED',message:'The master-data change could not be submitted. Refresh the record and review Activity before retrying.'})}
 };
 const archive=async(record:BusinessRecord)=>{setOutcome(null);try{setOutcome(await command('record.archive',def.collection,record.id,{collection:def.collection,id:record.id}))}catch{setOutcome({kind:'BLOCKED',message:'The record could not be archived. Refresh the record and review Activity before retrying.'})}};
 if(!def)return <section className="space-y-3"><h2 className="text-2xl font-bold">Master Data</h2><p className="text-sm text-slate-400">No editable master-data collections are available to this role.</p></section>;
 return <section className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><header><h2 className="text-2xl font-bold">Master Data</h2><p className="mt-1 text-sm text-slate-400">Safe CRUD for reusable business masters. Transaction ledgers are intentionally excluded.</p></header><button disabled={disabled} className={primary} onClick={()=>{setOutcome(null);setEditing({id:'',collection:def.collection,version:0,archived:false,data:{...def.defaults}} as BusinessRecord)}}>New {def.label.replace(/s$/,'')}</button></div>
  <div className="flex flex-wrap gap-2">{available.map(item=><button key={item.collection} className={item.collection===def.collection?primary:button} onClick={()=>{setCollection(item.collection);setQuery('');setEditing(null)}}>{item.label}</button>)}</div>
  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">{def.description}</div>
  <input aria-label={`Search ${def.label}`} className={fieldClass} placeholder={`Search ${def.label.toLowerCase()}…`} value={query} onChange={e=>setQuery(e.target.value)}/>
  {outcome&&<p role={['OUTCOME_UNKNOWN','REJECTED','CONFLICT','BLOCKED'].includes(outcome.kind)?'alert':'status'} className={`rounded-lg border p-3 text-sm ${outcome.kind==='CONFIRMED'?'border-emerald-800 bg-emerald-950':'border-amber-800 bg-amber-950'}`}>{outcomeText(outcome)}</p>}
  <div className="space-y-2">{rows.map(record=><article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4"><div><div className="font-bold">{String(data(record)?.name||data(record)?.code||record.id)}</div><div className="text-xs text-slate-500">{[data(record)?.code,data(record)?.phone,data(record)?.email].filter(Boolean).join(' · ')}</div></div><div className="flex gap-2"><button disabled={disabled} className={button} onClick={()=>setEditing(record)}>Edit</button><button disabled={disabled} className={button} onClick={()=>void archive(record)}>Archive</button></div></article>)}{!rows.length&&<p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-500">No {def.label.toLowerCase()} found.</p>}</div>
  {editing&&<Editor definition={def} value={editing} disabled={disabled} onClose={()=>setEditing(null)} onSave={save}/>} 
 </section>;
}

function Editor({definition,value,disabled,onClose,onSave}:{definition:(typeof definitions)[number];value:BusinessRecord;disabled:boolean;onClose:()=>void;onSave:(values:Record<string,string>)=>Promise<void>}){
 const initial=Object.fromEntries(definition.fields.map(item=>[item.key,String(data(value)?.[item.key]??item.defaultValue??'')]));
 const [values,setValues]=useState<Record<string,string>>(initial);
 const missing=definition.fields.some(item=>!item.optional&&!values[item.key]?.trim());
 return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4"><form role="dialog" aria-modal="true" aria-label={`${value.id?'Edit':'New'} ${definition.label}`} className="mx-auto my-8 max-w-xl space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5" onSubmit={event=>{event.preventDefault();void onSave(values)}}><h3 className="text-lg font-bold">{value.id?'Edit':'New'} {definition.label.replace(/s$/,'')}</h3>{definition.fields.map(item=><label key={item.key} className="block text-sm">{item.label}{item.type==='textarea'?<textarea className={fieldClass} value={values[item.key]||''} onChange={event=>setValues(previous=>({...previous,[item.key]:event.target.value}))}/>:<input className={fieldClass} type={item.type||'text'} min={item.type==='number'?0:undefined} value={values[item.key]||''} onChange={event=>setValues(previous=>({...previous,[item.key]:event.target.value}))}/>}</label>)}<div className="flex gap-2"><button disabled={disabled||missing} className={primary}>Save</button><button type="button" className={button} onClick={onClose}>Cancel</button></div></form></div>;
}
