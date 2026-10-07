import {WebOutletSettings} from './WebOutletSettings';
import React,{useRef,useState} from 'react';
import {allowed,type BusinessRecord,type WebSession} from './session';
import {isCommandConfirmed,type CommandOutcome} from '../../types/transactions';

type Field={key:string;label:string;kind?:'number'|'checkbox'|'textarea'|'select';choices?:string[];required?:boolean};
type Editor={kind:'BUSINESS'|'TILL'|'ACCOUNT';collection:string;id:string;version:number;values:Record<string,string|boolean>};
type Command=(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;
const input='mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2';
const button='rounded border border-slate-600 px-3 py-2 disabled:opacity-40';
const percent=(value:unknown)=>typeof value==='number'?String(value/100):'';
const minor=(value:string|boolean)=>{const amount=typeof value==='string'&&value.trim()?Number(value)*100:NaN;if(!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(Math.round(amount))||Math.abs(amount-Math.round(amount))>0.000001)throw new Error('Enter a non-negative value with at most two decimals.');return Math.round(amount);};

export function WebApiSettings({records,session,disabled,command}:{records:BusinessRecord[];session:WebSession;disabled:boolean;command:Command}){
 const [editor,setEditor]=useState<Editor|null>(null),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(false);
 const inFlight=useRef(false);
 const business=records.find(row=>row.collection==='businessSettings'&&row.id===session.businessId);
 const till=records.find(row=>row.collection==='tillPolicy'&&row.id===session.businessId);
 const accounts=records.filter(row=>row.collection==='paymentAccounts');
 const open=(kind:Editor['kind'],record?:BusinessRecord)=>{
  const d=record?.data||{};let values:Editor['values'];
  if(kind==='BUSINESS')values={businessName:String(d.businessName||''),address:String(d.address||''),contact:String(d.contact||''),taxPin:String(d.taxPin||''),footer:String(d.footer||''),vatRatePct:percent(d.vatRateBasisPoints),levyRatePct:percent(d.levyRateBasisPoints)};
  else if(kind==='TILL')values={scope:String(d.scope||'SINGLE_BUSINESS'),varianceThreshold:typeof d.varianceThresholdMinor==='number'?String(d.varianceThresholdMinor/100):'0'};
  else values={name:String(d.name||''),code:String(d.code||''),method:String(d.method||'CASH'),referenceRequired:d.referenceRequired===true,archived:record?.archived===true,mpesaMode:String(d.mpesaMode||'TILL'),mpesaNumber:String(d.mpesaNumber||''),mpesaAccountReference:String(d.mpesaAccountReference||'')};
  setEditor({kind,collection:kind==='BUSINESS'?'businessSettings':kind==='TILL'?'tillPolicy':'paymentAccounts',id:kind==='ACCOUNT'?record?.id||crypto.randomUUID():session.businessId,version:record?.version??0,values});setReason('');setMessage('');setPending(false);
 };
 const fields:Field[]=editor?.kind==='BUSINESS'?[{key:'businessName',label:'Business name',required:true},{key:'address',label:'Address',kind:'textarea'},{key:'contact',label:'Contact'},{key:'taxPin',label:'Tax PIN'},{key:'vatRatePct',label:'VAT rate (%)',kind:'number',required:true},{key:'levyRatePct',label:'Levy rate (%)',kind:'number',required:true},{key:'footer',label:'Receipt footer',kind:'textarea'}]:editor?.kind==='TILL'?[{key:'scope',label:'Till scope',kind:'select',choices:['SINGLE_BUSINESS','OUTLET','OPERATOR_DEVICE']},{key:'varianceThreshold',label:'Variance review threshold (KES)',kind:'number',required:true}]:[{key:'name',label:'Payment account name',required:true},{key:'code',label:'Account code',required:true},{key:'method',label:'Tender method',kind:'select',choices:['CASH','MPESA','CARD','BANK']},{key:'referenceRequired',label:'Require an external payment reference',kind:'checkbox'},{key:'archived',label:'Archive this payment account',kind:'checkbox'},...(editor?.values.method==='MPESA'?[{key:'mpesaMode',label:'M-Pesa destination',kind:'select' as const,choices:['TILL','PAYBILL']},{key:'mpesaNumber',label:'Till / paybill number',required:true},...(editor.values.mpesaMode==='PAYBILL'?[{key:'mpesaAccountReference',label:'Paybill account reference',required:true}]:[])]:[])];
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(!editor||inFlight.current||pending||disabled)return;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const v=editor.values;let operation:string,payload:Record<string,unknown>;
   if(editor.kind==='BUSINESS'){operation='business.settings.save';const vat=minor(v.vatRatePct),levy=minor(v.levyRatePct);if(vat>10000||levy>10000)throw new Error('Tax rates must be between 0% and 100%.');payload={data:{businessName:v.businessName,address:v.address,contact:v.contact,taxPin:v.taxPin,footer:v.footer,vatRateBasisPoints:vat,levyRateBasisPoints:levy}};}
   else if(editor.kind==='TILL'){operation='till.policy.save';payload={scope:v.scope,varianceThresholdMinor:minor(v.varianceThreshold)};}
   else{operation='paymentAccount.save';payload={id:editor.id,data:{name:v.name,code:v.code,method:v.method,currency:'KES',referenceRequired:v.referenceRequired,archived:v.archived,...(v.method==='MPESA'?{mpesaMode:v.mpesaMode,mpesaNumber:v.mpesaNumber,...(v.mpesaMode==='PAYBILL'?{mpesaAccountReference:v.mpesaAccountReference}:{})}:{})}};}
   const outcome=await command(operation,editor.collection,editor.id,{...payload,reason:reason.trim(),expectedVersions:[{collection:editor.collection,id:editor.id,version:editor.version}]});
   if(isCommandConfirmed(outcome)){setEditor(null);setMessage('Settings saved and confirmed.');}
   else{if(outcome.kind==='PENDING'||outcome.kind==='OUTCOME_UNKNOWN')setPending(true);setMessage('message' in outcome?outcome.message:'The original action is saved. Check Activity before submitting another configuration change.');}
  }catch(error){setMessage(error instanceof Error?error.message:String(error))}finally{inFlight.current=false;setBusy(false)}
 };
 return <section className="space-y-4">
  <h2 className="text-xl font-bold">Business and payment settings</h2>
  <WebOutletSettings records={records} disabled={disabled||busy||pending} command={command}/>
  <div className="flex flex-wrap gap-2">{allowed(session,'business.tax.configure')&&<button disabled={disabled||busy||pending} className={button} onClick={()=>open('BUSINESS',business)}>Business identity and tax</button>}<button disabled={disabled||busy||pending} className={button} onClick={()=>open('TILL',till)}>Till policy</button><button disabled={disabled||busy||pending} className={button} onClick={()=>open('ACCOUNT')}>Add payment account</button></div>
  <p className="text-sm text-slate-400">Configure the business's approved tax rates explicitly. Issued documents retain their original settings. Till policy changes require all tills to be closed and reviewed.</p>
  <div className="space-y-2">{accounts.map(row=><button key={row.id} disabled={disabled||busy||pending} className={`${button} block w-full text-left`} onClick={()=>open('ACCOUNT',row)}>{String(row.data.name)} · {String(row.data.method)}{row.archived?' · Archived':''}</button>)}</div>
  {editor&&<form role="dialog" aria-label="Edit business settings" onSubmit={event=>void submit(event)} className="space-y-3 rounded-xl border border-slate-700 p-4">
   <h3 className="font-bold">{editor.kind==='BUSINESS'?'Receipt identity and tax rates':editor.kind==='TILL'?'Till scope and variance policy':'Payment account'}</h3>
   {fields.map(field=><label key={field.key} className="block text-sm">{field.kind==='checkbox'?<><input type="checkbox" disabled={busy||pending} checked={editor.values[field.key]===true} onChange={event=>setEditor({...editor,values:{...editor.values,[field.key]:event.target.checked}})}/> {field.label}</>:<>{field.label}{field.kind==='select'?<select className={input} disabled={busy||pending||field.key==='method'&&editor.version>0} value={String(editor.values[field.key]??'')} onChange={event=>setEditor({...editor,values:{...editor.values,[field.key]:event.target.value}})}>{field.choices?.map(choice=><option key={choice}>{choice}</option>)}</select>:field.kind==='textarea'?<textarea className={input} disabled={busy||pending} value={String(editor.values[field.key]??'')} onChange={event=>setEditor({...editor,values:{...editor.values,[field.key]:event.target.value}})}/>:<input className={input} disabled={busy||pending} required={field.required} type={field.kind==='number'?'number':'text'} min={field.kind==='number'?0:undefined} step={field.kind==='number'?'0.01':undefined} value={String(editor.values[field.key]??'')} onChange={event=>setEditor({...editor,values:{...editor.values,[field.key]:event.target.value}})}/>}</>}</label>)}
   <label className="block text-sm">Change reason<textarea className={input} required minLength={3} maxLength={500} disabled={busy||pending} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   <button disabled={disabled||busy||pending||reason.trim().length<3} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Save settings</button><button type="button" disabled={busy} className={`${button} ml-2`} onClick={()=>setEditor(null)}>Close</button>
  </form>}
  {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 </section>;
}
