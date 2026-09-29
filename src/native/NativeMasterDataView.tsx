import React, { useMemo, useState } from 'react';
import type { Permission } from '../types/runtime';
import { useRuntime } from '../runtime/RuntimeProvider';
import { ActionDialog } from './ActionDialog';
import { buttonClass, fieldClass, primaryButtonClass, recordOf, recordsOf } from './records';

type CollectionKey = 'customers' | 'suppliers' | 'outlets' | 'stockLocations';
type Field = { key:string; label:string; type?:'text'|'email'|'textarea'|'select'|'number'; required?:boolean; optionsFrom?:'stockLocations' };

const DEFINITIONS: Array<{
  collection: CollectionKey;
  label: string;
  permission: Permission;
  description: string;
  archivable: boolean;
  defaults: Record<string, any>;
  fields: Field[];
}> = [
  { collection:'customers', label:'Customers', permission:'catalog.manage', description:'Reusable customer identities for tabs and service history.', archivable:true, defaults:{name:'',phone:'',email:'',notes:''}, fields:[
    {key:'name',label:'Customer name',required:true},{key:'phone',label:'Phone'},{key:'email',label:'Email',type:'email'},{key:'notes',label:'Notes',type:'textarea'}
  ]},
  { collection:'suppliers', label:'Suppliers', permission:'procurement.manage', description:'Suppliers used by purchase orders, goods receipts and accounts payable.', archivable:true, defaults:{name:'',code:'',phone:'',email:'',contactPerson:'',kraPin:'',paymentTermsDays:0,paymentTerms:''}, fields:[
    {key:'name',label:'Supplier name',required:true},{key:'code',label:'Supplier code',required:true},{key:'phone',label:'Phone'},{key:'email',label:'Email',type:'email'},
    {key:'contactPerson',label:'Contact person'},{key:'kraPin',label:'KRA PIN'},{key:'paymentTermsDays',label:'Payment terms (days)',type:'number'},{key:'paymentTerms',label:'Payment terms / notes',type:'textarea'}
  ]},
  { collection:'outlets', label:'Service Areas', permission:'business.configure', description:'Operational service areas. Generic archive is disabled.', archivable:false, defaults:{name:'',code:'',description:'',defaultStockLocationId:''}, fields:[
    {key:'name',label:'Service area name',required:true},{key:'code',label:'Code'},{key:'defaultStockLocationId',label:'Default storage place',type:'select',required:true,optionsFrom:'stockLocations'},{key:'description',label:'Description',type:'textarea'}
  ]},
  { collection:'stockLocations', label:'Storage Places', permission:'inventory.adjust', description:'Places where stock is kept, such as Main Store, Bar, Kitchen or Cellar. Archiving is blocked while stock or service-area references remain.', archivable:true, defaults:{name:'',code:'',description:''}, fields:[
    {key:'name',label:'What do staff call this place?',required:true},{key:'code',label:'Place code (optional)'},{key:'description',label:'Where is it? (optional)',type:'textarea'}
  ]},
];

export function NativeMasterDataView(){
  const runtime=useRuntime();
  const s=runtime.snapshot!;
  const available=useMemo(()=>DEFINITIONS.filter(d=>s.actor.permissions.includes(d.permission)),[s.actor.permissions]);
  const [collection,setCollection]=useState<CollectionKey>(available[0]?.collection||'customers');
  const [query,setQuery]=useState('');
  const [editing,setEditing]=useState<any|null>(null);
  const [archiving,setArchiving]=useState<any|null>(null);
  const [notice,setNotice]=useState('');
  const def=available.find(d=>d.collection===collection)||available[0];
  const all=def?recordsOf<any>(s,def.collection):[];
  const records=all.filter(r=>JSON.stringify(r).toLowerCase().includes(query.toLowerCase()));
  const stockLocations=recordsOf<any>(s,'stockLocations');

  if(!def)return <div className="h-full overflow-auto bg-slate-950 p-5 text-white"><p>No editable master-data collections are available to this role.</p></div>;

  const save=async(data:any)=>{
    setNotice('');
    const id=data.id||crypto.randomUUID();
    const saveData=def.collection==='stockLocations'&&!String(data.code||'').trim()?{...data,code:`PLACE-${crypto.randomUUID().slice(0,6).toUpperCase()}`}:{...data};
    const rec=recordOf(s,def.collection,id);
    try{
      await runtime.command('record.save',{collection:def.collection,id,data:{...saveData,id}},rec?.version);
      setEditing(null);setNotice(`${def.label} saved locally.`);
    }catch(error){setNotice(String(error))}
  };

  const archive=async(record:any)=>{
    setNotice('');
    const rec=recordOf(s,def.collection,record.id);
    try{
      await runtime.command('record.archive',{collection:def.collection,id:record.id},rec?.version);
      setArchiving(null);setNotice(`${record.name||record.code||record.id} archived.`);
    }catch(error){setNotice(String(error))}
  };

  return <div className="h-full overflow-auto bg-slate-950 p-5 text-white">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Master Data</h1><p className="text-sm text-slate-400">Safe CRUD for reusable business masters. Transaction ledgers are intentionally excluded.</p></div>
      <button className={primaryButtonClass} onClick={()=>setEditing({...def.defaults})}>New {def.label.replace(/s$/,'')}</button>
    </div>
    <div className="mb-4 flex flex-wrap gap-2">
      {available.map(x=><button key={x.collection} className={collection===x.collection?primaryButtonClass:buttonClass} onClick={()=>{setCollection(x.collection);setQuery('');setEditing(null)}}>{x.label}</button>)}
    </div>
    <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-sm text-slate-300">{def.description}</p></div>
    <input className={fieldClass+' mb-4'} placeholder={`Search ${def.label.toLowerCase()}…`} value={query} onChange={e=>setQuery(e.target.value)}/>
    {notice&&<p role="status" className="mb-4 rounded-lg bg-slate-900 p-3 text-sm text-slate-200">{notice}</p>}
    <div className="space-y-2">
      {records.map(record=><article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div><div className="font-bold">{record.name||record.code||record.id}</div><div className="text-xs text-slate-500">{[record.code,record.phone,record.email,record.description].filter(Boolean).join(' · ')}</div></div>
        <div className="flex gap-2"><button className={buttonClass} onClick={()=>setEditing(record)}>Edit</button>{def.collection==='customers'&&s.actor.permissions.includes('credit.view')&&<button className={buttonClass} onClick={()=>{window.location.hash='/credit'}}>Credit Account</button>}{def.archivable&&<button className={buttonClass} onClick={()=>setArchiving(record)}>Archive</button>}</div>
      </article>)}
      {records.length===0&&<div className="rounded-xl border border-dashed border-slate-700 p-8 text-center"><p className="text-sm text-slate-300">{def.collection==='stockLocations'?'No storage places yet. Add where staff keep stock so service areas and inventory movements can use it.':`No ${def.label.toLowerCase()} found.`}</p>{def.collection==='stockLocations'&&<button className={primaryButtonClass+' mt-3'} onClick={()=>setEditing({...def.defaults})}>Add first storage place</button>}</div>}
    </div>
    {editing&&<MasterEditor definition={def} value={editing} stockLocations={stockLocations} onClose={()=>setEditing(null)} onSave={save}/>}
    {archiving&&<ActionDialog title={`Archive ${archiving.name||archiving.code||'record'}`} onClose={()=>setArchiving(null)}><p className="text-sm text-slate-300">The record remains in history but disappears from active master data. ServOS will reject the archive if live references make it unsafe.</p><div className="mt-4 flex gap-2"><button className={buttonClass} onClick={()=>setArchiving(null)}>Cancel</button><button className={primaryButtonClass} onClick={()=>void archive(archiving)}>Archive record</button></div></ActionDialog>}
  </div>;
}

function MasterEditor({definition,value,stockLocations,onSave,onClose}:{definition:(typeof DEFINITIONS)[number];value:any;stockLocations:any[];onSave:(v:any)=>Promise<void>;onClose:()=>void}){
  const [v,setV]=useState({...definition.defaults,...value});
  const missing=definition.fields.some(f=>f.required&&!String(v[f.key]??'').trim());
  return <ActionDialog title={`${value.id?'Edit':'New'} ${definition.label.replace(/s$/,'')}`} onClose={onClose}>
    <div className="space-y-3">
      {definition.fields.map(field=><label key={field.key} className="block text-sm">{field.label}
        {field.type==='textarea'?<textarea className={fieldClass+' mt-1'} value={v[field.key]||''} onChange={e=>setV({...v,[field.key]:e.target.value})}/>:
        field.type==='select'&&field.optionsFrom==='stockLocations'?<select className={fieldClass+' mt-1'} value={v[field.key]||''} onChange={e=>setV({...v,[field.key]:e.target.value})}><option value="">Choose stock location</option>{stockLocations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>:
        <input type={field.type==='email'?'email':field.type==='number'?'number':'text'} min={field.type==='number'?0:undefined} className={fieldClass+' mt-1'} value={v[field.key]??''} onChange={e=>setV({...v,[field.key]:field.type==='number'?Number(e.target.value):e.target.value})}/>}
      </label>)}
      <button disabled={missing} className={primaryButtonClass} onClick={()=>void onSave(v)}>Save</button>
    </div>
  </ActionDialog>;
}
