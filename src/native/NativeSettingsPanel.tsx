import React,{useState} from 'react';
import {useRuntime} from '../runtime/RuntimeProvider';
import {ActionDialog} from './ActionDialog';
import {buttonClass,fieldClass,primaryButtonClass,recordOf,recordsOf} from './records';
import { ReceiptBrandingEditor } from '../receipts/ReceiptBrandingEditor';
import type { PreparedBrandingImage, PreparedTillQr } from '../receipts/branding';

type Field={key:string;label:string;type?:'number'|'checkbox'|'select';options?:string[]};
const sections:{id:string;label:string;collection:string;fields:Field[]}[]=[
  {id:'identity',label:'Business identity',collection:'organization',fields:[{key:'name',label:'Trading name'},{key:'legalName',label:'Legal name'},{key:'registrationNumber',label:'Registration number'},{key:'address',label:'Address'},{key:'phone',label:'Business phone'},{key:'email',label:'Business email'}]},
  {id:'tax',label:'Tax and receipt message',collection:'property',fields:[{key:'kraPin',label:'Business PIN'},{key:'taxConfigured',label:'Tax configuration reviewed',type:'checkbox'},{key:'vatRatePct',label:'VAT %',type:'number'},{key:'levyRatePct',label:'Levy %',type:'number'},{key:'receiptFooter',label:'Business thank-you message'}]},
  {id:'branding',label:'Business branding and receipt logo',collection:'property',fields:[]},
  {id:'roomStays',label:'Room stays',collection:'property',fields:[{key:'roomTypeId',label:'Configured room type',type:'select'},{key:'ratePlanId',label:'Configured room rate',type:'select'},{key:'nightlyCheckoutTime',label:'Nightly checkout time'},{key:'dayStayCutoffTime',label:'Day-stay cutoff time'}]},
  {id:'till',label:'Till and printer',collection:'tillPolicy',fields:[{key:'defaultOpeningFloat',label:'Default opening float (KES)',type:'number'},{key:'varianceThreshold',label:'Variance threshold (KES)',type:'number'},{key:'receiptPrinterMode',label:'Receipt printer mode',type:'select',options:['OS_PRINT','MANUAL','XP80T_USB_ESC_POS','XP80T_LAN_ESC_POS']},{key:'receiptPrinterQueue',label:'Windows printer queue'},{key:'receiptPrinterHost',label:'LAN printer address'},{key:'receiptPrinterPort',label:'LAN TCP port',type:'number'},{key:'receiptPaperColumns',label:'Receipt text columns',type:'number'},{key:'receiptMaxLogoWidthDots',label:'Maximum thermal logo width (dots)',type:'number'},{key:'receiptFeedLines',label:'Feed lines before cut (test printer)',type:'number'},{key:'receiptAutoCut',label:'Cut between copies',type:'checkbox'}]},
  {id:'payments',label:'Payment methods',collection:'paymentConfig',fields:[]},
];
export function NativeSettingsPanel(){
  const runtime=useRuntime();const s=runtime.snapshot!;const [section,setSection]=useState<typeof sections[number]|null>(null);const [form,setForm]=useState<Record<string,any>>({});const [branding,setBranding]=useState<{appEmblem:string;receiptLogo:PreparedBrandingImage|null}>({appEmblem:'',receiptLogo:null});const [baseline,setBaseline]=useState<{id:string;version?:number;propertyVersion?:number}>({id:''});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  if(!s.actor.permissions.includes('business.configure'))return null;
  const open=(definition:typeof sections[number])=>{
    const current=recordsOf(s,definition.collection)[0]||{};const id=current.id||(definition.id==='identity'?'business':definition.id==='tax'?'property':'main');
    setBaseline({id,version:recordOf(s,definition.collection,id)?.version,propertyVersion:recordOf(s,'property','property')?.version});
    const roomTypes=recordsOf(s,'roomTypes'),rates=recordsOf(s,'ratePlans');
    const roomTypeId=current.roomStayRoomTypeId||roomTypes[0]?.id||'';const compatibleRate=rates.find(rate=>rate.id===current.roomStayRatePlanId&&rate.mode==='NIGHTLY'&&rate.roomTypeId===roomTypeId)||rates.find(rate=>rate.mode==='NIGHTLY'&&rate.roomTypeId===roomTypeId);
    setForm({...current,roomTypeId,ratePlanId:compatibleRate?.id||'',nightlyCheckoutTime:current.nightlyCheckoutTime||'10:00',dayStayCutoffTime:current.dayStayCutoffTime||'18:00',receiptPrinterMode:current.receiptPrinterMode||'OS_PRINT',receiptPrinterPort:current.receiptPrinterPort??9100,receiptPaperColumns:current.receiptPaperColumns??48,receiptMaxLogoWidthDots:current.receiptMaxLogoWidthDots??576,receiptFeedLines:current.receiptFeedLines??5,receiptAutoCut:current.receiptAutoCut??true});setMessage('');setSection(definition);
    if(definition.id==='branding')setBranding({appEmblem:String(current.appEmblemDataUrl||''),receiptLogo:current.receiptLogoDataUrl?{dataUrl:String(current.receiptLogoDataUrl),thermalLogo:current.receiptThermalLogo as PreparedBrandingImage['thermalLogo']}:null});
  };
  const save=async()=>{
    if(!section)return;setBusy(true);setMessage('');
    try{
      if(section.id==='identity')await runtime.command('business.identity',{data:Object.fromEntries(section.fields.map(f=>[f.key,form[f.key]??''])),organizationVersion:baseline.version,propertyVersion:baseline.propertyVersion});
      else if(section.id==='roomStays'){const rate=recordsOf(s,'ratePlans').find(candidate=>candidate.id===form.ratePlanId&&candidate.mode==='NIGHTLY'&&candidate.roomTypeId===form.roomTypeId);if(!rate)throw new Error('Choose a NIGHTLY rate belonging to the selected room type before saving room-stay policy.');await runtime.command('roomStay.settings',{roomTypeId:form.roomTypeId,ratePlanId:form.ratePlanId,nightlyCheckoutTime:form.nightlyCheckoutTime,dayStayCutoffTime:form.dayStayCutoffTime,propertyVersion:baseline.version});}
      else if(section.id==='branding'){
        const original=recordsOf(s,'property').find(v=>v.id==='property')||{};
        await runtime.command('record.save',{collection:'property',id:'property',data:{...original,name:original.name||'Business property',appEmblemDataUrl:branding.appEmblem||null,receiptLogoDataUrl:branding.receiptLogo?.dataUrl||null,receiptThermalLogo:branding.receiptLogo?.thermalLogo||null}},baseline.version);
      }
      else{
        const original=recordsOf(s,section.collection).find(v=>v.id===baseline.id)||{};
        const edited=section.id==='payments'?{methods:form.methods||[],mpesaAccounts:form.mpesaAccounts||[]}:Object.fromEntries(section.fields.map(f=>[f.key,form[f.key]??(f.type==='checkbox'?false:f.type==='number'?0:'')]));
        await runtime.command('record.save',{collection:section.collection,id:baseline.id,data:{...original,...edited,name:original.name||section.label}},baseline.version);
      }
      setSection(null);setMessage('Settings saved locally. Existing receipts and transactions retain their snapshots.');
    }catch(e){setMessage(String(e))}finally{setBusy(false)}
  };
  return <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-bold">Business settings</h2><p className="mb-3 text-xs text-slate-400">KES · Africa/Nairobi · tax-inclusive pricing. Receipt attribution is fixed.</p><div className="flex flex-wrap gap-2">{sections.map(d=><button key={d.id} className={buttonClass} onClick={()=>open(d)}>{d.label}</button>)}<button className={buttonClass} disabled={busy} onClick={()=>{setBusy(true);void runtime.testPrinter().then(r=>setMessage(`${r.state}: ${r.message||'Check printer output.'}`)).catch(e=>setMessage(String(e))).finally(()=>setBusy(false))}}>Test saved printer</button></div>{message&&!section&&<p role="status" className="mt-3 text-sm">{message}</p>}
    {section&&<ActionDialog title={section.label} onClose={()=>{if(!busy)setSection(null)}}><form className="space-y-3" onSubmit={e=>{e.preventDefault();void save()}}>
      {section.id==='branding'&&<ReceiptBrandingEditor appEmblem={branding.appEmblem} receiptLogo={branding.receiptLogo} onAppEmblemChange={appEmblem=>setBranding(current=>({...current,appEmblem}))} onReceiptLogoChange={receiptLogo=>setBranding(current=>({...current,receiptLogo}))} disabled={busy}/>}
      {section.fields.map(f=><label className="block text-sm" key={f.key}>{f.label}{f.type==='checkbox'?<input className="ml-3" type="checkbox" checked={Boolean(form[f.key])} onChange={e=>setForm({...form,[f.key]:e.target.checked})}/>:f.type==='select'?<select required className={fieldClass} value={form[f.key]||''} onChange={e=>setForm({...form,[f.key]:e.target.value,...(f.key==='roomTypeId'?{ratePlanId:''}:{})})}>{(f.options||((f.key==='roomTypeId'?recordsOf(s,'roomTypes'):recordsOf(s,'ratePlans').filter(rate=>rate.mode==='NIGHTLY'&&(!form.roomTypeId||rate.roomTypeId===form.roomTypeId))).map(v=>v.id))).map(v=><option key={v} value={v}>{f.key==='roomTypeId'?recordsOf(s,'roomTypes').find(record=>record.id===v)?.name:recordsOf(s,'ratePlans').find(record=>record.id===v)?.name}</option>)}</select>:<input required={f.key==='name'||section.id==='roomStays'} className={fieldClass} type={f.type==='number'?'number':'text'} step={f.type==='number'?'any':undefined} value={form[f.key]??''} onChange={e=>setForm({...form,[f.key]:f.type==='number'?Number(e.target.value):e.target.value})}/>}</label>)}
      {section.id==='roomStays'&&<p className="text-xs text-slate-400">Nightly stays end at the configured checkout time. Day stays may use any end time on the same day, up to the configured cutoff.</p>}
      {section.id==='payments'&&<>{['CASH','MPESA','CARD'].map(method=><label className="block" key={method}><input type="checkbox" checked={(form.methods||[]).includes(method)} onChange={e=>setForm({...form,methods:e.target.checked?[...(form.methods||[]),method]:(form.methods||[]).filter((m:string)=>m!==method)})}/> {method}</label>)}{(form.methods||[]).includes('MPESA')&&<label className="block text-sm">Primary M-Pesa account<input required className={fieldClass} value={form.mpesaAccounts?.[0]?.number||''} onChange={e=>setForm({...form,mpesaAccounts:[{...(form.mpesaAccounts?.[0]||{}),label:form.mpesaAccounts?.[0]?.label||'Primary',number:e.target.value},...(form.mpesaAccounts||[]).slice(1)]})}/></label>}<p className="text-xs text-slate-400">External payments remain manually confirmed.</p></>}
      {message&&<p role="alert" className="text-sm text-rose-300">{message}</p>}<button disabled={busy} className={primaryButtonClass} type="submit">{busy?'Saving…':'Save settings'}</button>
    </form></ActionDialog>}
  </section>;
}
