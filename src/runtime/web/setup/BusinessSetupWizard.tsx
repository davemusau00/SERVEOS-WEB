import React,{useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,ClipboardCheck,Home,LockKeyhole,Store,WalletCards} from 'lucide-react';
import type {CommandOutcome} from '../../../types/transactions';
import type {BusinessRecord} from '../session';

type BusinessType='BAR_CLUB'|'RESTAURANT_CAFE'|'HOTEL_RESORT'|'RETAIL_POS'|'MIXED_HOSPITALITY';
type PaymentMethod='CASH'|'MPESA'|'CARD'|'BANK';
type Location={id:string;name:string;code:string;type:'STORE'|'FRIDGE'|'BAR'|'KITCHEN'|'OTHER'};
type Outlet={id:string;name:string;defaultStockLocationId:string};
type Payment={id:string;name:string;code:string;method:PaymentMethod;referenceRequired:boolean;mpesaMode?:'TILL'|'PAYBILL';mpesaNumber?:string;mpesaAccountReference?:string};
type SetupConfiguration={
 businessName:string;category:string;contact:string|null;address:string|null;receiptName:string;taxPin:string|null;footer:string|null;
 taxTreatment:'ZERO_RATES'|'CUSTOM_RATES'|null;vatRateBasisPoints:number;levyRateBasisPoints:number;businessType:BusinessType|null;
 locations:Location[];outlets:Outlet[];payments:Payment[];optionalSteps:{products:'NOW'|'LATER';staff:'NOW'|'LATER';rooms:'NOW'|'LATER'};
};
type Props={businessId:string;records:BusinessRecord[];online:boolean;command:(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>Promise<CommandOutcome>;readRecords:()=>Promise<BusinessRecord[]>;onSignOut:()=>void};

const types:Array<{value:BusinessType;label:string;location:string;outlets:string[];locationType:Location['type']}>=[
 {value:'BAR_CLUB',label:'Bar / Club',location:'Bar Store',outlets:['Main Bar'],locationType:'STORE'},
 {value:'RESTAURANT_CAFE',label:'Restaurant / Café',location:'Main Store',outlets:['Main Restaurant'],locationType:'STORE'},
 {value:'HOTEL_RESORT',label:'Hotel / Resort',location:'Main Store',outlets:['Main Property','Front Desk'],locationType:'STORE'},
 {value:'RETAIL_POS',label:'Retail POS',location:'Main Store',outlets:['Main Shop'],locationType:'STORE'},
 {value:'MIXED_HOSPITALITY',label:'Mixed Hospitality',location:'Main Store',outlets:['Main Venue'],locationType:'STORE'},
];
const categories=[['FOOD_AND_BEVERAGE','Food and beverage'],['ACCOMMODATION','Accommodation'],['RETAIL','Retail'],['HOSPITALITY','Hospitality'],['OTHER','Other']];
const field='mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50';
const primary='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40';
const secondary='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40';
const help='mt-1 block text-xs leading-5 text-slate-400';
const asObject=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const activeRecord=(records:BusinessRecord[],collection:string,id:string)=>records.find(record=>record.collection===collection&&record.id===id&&!record.archived);
const percentBasisPoints=(value:string)=>{
 if(!/^\d{1,2}(?:\.\d{1,2})?$/.test(value))return null;
 const result=Number(value)*100;
 return Number.isSafeInteger(result)&&result<=10000?result:null;
};
const percentText=(value:number)=>String(value/100);
const initialConfiguration=(setup:BusinessRecord|undefined):SetupConfiguration=>{
 const data=asObject(setup?.data),saved=asObject(data.configuration);
 const cash=(Array.isArray(saved.payments)?saved.payments as Payment[]:[]).find(item=>item.method==='CASH');
 return {
  businessName:String(saved.businessName||''),category:String(saved.category||''),contact:typeof saved.contact==='string'?saved.contact:null,address:typeof saved.address==='string'?saved.address:null,
  receiptName:String(saved.receiptName||''),taxPin:typeof saved.taxPin==='string'?saved.taxPin:null,footer:typeof saved.footer==='string'?saved.footer:null,
  taxTreatment:saved.taxTreatment==='ZERO_RATES'||saved.taxTreatment==='CUSTOM_RATES'?saved.taxTreatment:null,
  vatRateBasisPoints:Number.isSafeInteger(saved.vatRateBasisPoints)?Number(saved.vatRateBasisPoints):0,
  levyRateBasisPoints:Number.isSafeInteger(saved.levyRateBasisPoints)?Number(saved.levyRateBasisPoints):0,
  businessType:types.some(item=>item.value===saved.businessType)?saved.businessType as BusinessType:null,
  locations:Array.isArray(saved.locations)?saved.locations as Location[]:[],outlets:Array.isArray(saved.outlets)?saved.outlets as Outlet[]:[],
  payments:cash?[...(saved.payments as Payment[])]:[{id:crypto.randomUUID(),name:'Cash',code:'CASH',method:'CASH',referenceRequired:false}],
  optionalSteps:{products:'LATER',staff:'LATER',rooms:'LATER',...asObject(saved.optionalSteps)} as SetupConfiguration['optionalSteps'],
 };
};
const buildResourcePlan=(type:BusinessType,previous:SetupConfiguration):Pick<SetupConfiguration,'locations'|'outlets'>=>{
 const preset=types.find(item=>item.value===type)!;
 const locationId=previous.locations[0]?.id||crypto.randomUUID();
 const existingLocation=previous.locations[0],sameType=previous.businessType===type;
 const location:Location={id:locationId,name:sameType&&existingLocation?existingLocation.name:preset.location,code:sameType&&existingLocation?existingLocation.code:`MAIN_${locationId.slice(0,6)}`.toUpperCase(),type:preset.locationType};
 const outletCount=Math.max(preset.outlets.length,previous.outlets.length);
 const outlets=Array.from({length:outletCount},(_,index)=>({id:previous.outlets[index]?.id||crypto.randomUUID(),name:sameType&&previous.outlets[index]?previous.outlets[index].name:preset.outlets[index]||previous.outlets[index]?.name||`Outlet ${index+1}`,defaultStockLocationId:locationId}));
 return {locations:[location],outlets};
};
const defaultPayment=(method:PaymentMethod,mode?:'TILL'|'PAYBILL'):Payment=>{
 const label=method==='CASH'?'Cash':method==='MPESA'?mode==='TILL'?'M-Pesa Till':'M-Pesa Paybill':method==='CARD'?'Card':'Bank transfer';
 const code=method==='CASH'?'CASH':method==='MPESA'?mode==='TILL'?'MPESA_TILL':'MPESA_PAYBILL':method;
 return {id:crypto.randomUUID(),name:label,code,method,referenceRequired:method!=='CASH',...(mode?{mpesaMode:mode}:{}),...(method==='MPESA'?{mpesaNumber:'',...(mode==='PAYBILL'?{mpesaAccountReference:''}:{})}:{})};
};
const outcomeMessage=(outcome:CommandOutcome)=>'message' in outcome?outcome.message:`${outcome.kind} — review the synchronized business records before continuing.`;

export function BusinessSetupWizard({businessId,records,online,command,readRecords,onSignOut}:Props){
 const setupRecord=records.find(record=>record.collection==='businessSetup'&&record.id===businessId);
 const [configuration,setConfiguration]=useState<SetupConfiguration>(()=>initialConfiguration(setupRecord));
 const [vatText,setVatText]=useState(()=>percentText(initialConfiguration(setupRecord).vatRateBasisPoints));
 const [levyText,setLevyText]=useState(()=>percentText(initialConfiguration(setupRecord).levyRateBasisPoints));
 const [step,setStep]=useState(()=>Math.max(0,Math.min(3,Number(asObject(setupRecord?.data).currentStep)||0)));
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [isError,setIsError]=useState(false);
 useEffect(()=>{
  if(!setupRecord)return;
  const next=initialConfiguration(setupRecord);setConfiguration(next);setVatText(percentText(next.vatRateBasisPoints));setLevyText(percentText(next.levyRateBasisPoints));
  setStep(Math.max(0,Math.min(3,Number(asObject(setupRecord.data).currentStep)||0)));
 },[setupRecord?.version]);
 const update=(key:keyof SetupConfiguration,value:SetupConfiguration[keyof SetupConfiguration])=>setConfiguration(previous=>({...previous,[key]:value}));
 const patchPayment=(id:string,patch:Partial<Payment>)=>setConfiguration(previous=>({...previous,payments:previous.payments.map(account=>account.id===id?{...account,...patch}:account)}));
 const togglePayment=(method:PaymentMethod,enabled:boolean,mode?:'TILL'|'PAYBILL')=>setConfiguration(previous=>{
  const matches=(account:Payment)=>account.method===method&&(method!=='MPESA'||account.mpesaMode===mode);
  if(enabled)return previous.payments.some(matches)?previous:{...previous,payments:[...previous.payments,defaultPayment(method,mode)]};
  if(previous.payments.some(account=>matches(account)&&activeRecord(records,'paymentAccounts',account.id)))return previous;
  return {...previous,payments:previous.payments.filter(account=>!matches(account))};
 });
 const persist=async(nextStep:number,value:SetupConfiguration=configuration)=>{
  const current=(await readRecords()).find(record=>record.collection==='businessSetup'&&record.id===businessId);
  if(!current)throw new Error('The server setup record is missing. Sign out and sign in again, then check the setup status.');
  const outcome=await command('business.setup.configure','businessSetup',businessId,{configuration:value,currentStep:nextStep,expectedVersions:[{collection:'businessSetup',id:businessId,version:current.version}]});
  if(outcome.kind!=='CONFIRMED')throw new Error(outcomeMessage(outcome));
  const refreshed=(await readRecords()).find(record=>record.collection==='businessSetup'&&record.id===businessId);
  if(refreshed)setConfiguration(initialConfiguration(refreshed));
  setStep(nextStep);
 };
 const continueStep=async(event:React.FormEvent)=>{
  event.preventDefault();setMessage('');setIsError(false);
  try{
   let nextConfiguration=configuration;
   if(step===0){
    if(!configuration.businessName.trim())throw new Error('Enter the registered business name.');
    if(!configuration.category)throw new Error('Choose a business category.');
    if(!configuration.receiptName.trim())throw new Error('Enter the name customers should see on receipts.');
    if(!configuration.taxTreatment)throw new Error('Choose an explicit VAT and levy treatment.');
    if(configuration.taxTreatment==='CUSTOM_RATES'){
     const vat=percentBasisPoints(vatText),levy=percentBasisPoints(levyText);
     if(vat===null||levy===null)throw new Error('Enter valid VAT and levy rates between 0 and 100, with up to two decimal places.');
     nextConfiguration={...configuration,vatRateBasisPoints:vat,levyRateBasisPoints:levy};
    }
   }
   if(step===1&&!configuration.businessType)throw new Error('Choose the closest business type.');
   if(step===2){
    if(!configuration.payments.some(account=>account.method==='CASH'))throw new Error('Cash must remain available as a payment option.');
    for(const account of configuration.payments)if(account.method==='MPESA'&&(!/^\d{5,10}$/.test(account.mpesaNumber||'')||(account.mpesaMode==='PAYBILL'&&!account.mpesaAccountReference?.trim())))throw new Error('Enter the real M-Pesa destination provided by the business owner.');
   }
   await persist(Math.min(3,step+1),nextConfiguration);
  }catch(error){setIsError(true);setMessage(error instanceof Error?error.message:'Business setup could not be saved.');}
 };
 const runCommand=async(operation:string,collection:string,id:string,payload:Record<string,unknown>)=>{
  const outcome=await command(operation,collection,id,payload);
  if(outcome.kind!=='CONFIRMED')throw new Error(outcomeMessage(outcome));
 };
 const recordsNow=async()=>readRecords();
 const prepareDefaults=async()=>{
  await persist(3);
  const latest=await recordsNow();
  const existingSettings=activeRecord(latest,'businessSettings',businessId);
  await runCommand('business.settings.save','businessSettings',businessId,{
   data:{businessName:configuration.receiptName.trim(),address:configuration.address||'',contact:configuration.contact||'',taxPin:configuration.taxPin||'',footer:configuration.footer||'',vatRateBasisPoints:configuration.vatRateBasisPoints,levyRateBasisPoints:configuration.levyRateBasisPoints},
   reason:'Initial business setup',expectedVersions:[{collection:'businessSettings',id:businessId,version:existingSettings?.version??0}],
  });
  for(const location of configuration.locations){
   const current=await recordsNow(),prior=activeRecord(current,'stockLocations',location.id);
   await runCommand('stockLocation.save','stockLocations',location.id,{id:location.id,data:{name:location.name,code:location.code,type:location.type},expectedVersions:[{collection:'stockLocations',id:location.id,version:prior?.version??0}]});
  }
  for(const outlet of configuration.outlets){
   const current=await recordsNow(),prior=activeRecord(current,'outlets',outlet.id),location=activeRecord(current,'stockLocations',outlet.defaultStockLocationId);
   if(!location)throw new Error(`Storage location for ${outlet.name} has not synchronized.`);
   await runCommand('outlet.save','outlets',outlet.id,{id:outlet.id,data:{name:outlet.name,defaultStockLocationId:outlet.defaultStockLocationId,archived:false},reason:'Initial business setup',expectedVersions:[{collection:'outlets',id:outlet.id,version:prior?.version??0},{collection:'stockLocations',id:location.id,version:location.version}]});
  }
  for(const account of configuration.payments){
   const current=await recordsNow(),prior=activeRecord(current,'paymentAccounts',account.id);
   const {id,name,code,method,referenceRequired,mpesaMode,mpesaNumber,mpesaAccountReference}=account;
   await runCommand('paymentAccount.save','paymentAccounts',id,{id,data:{name,code,method,currency:'KES',referenceRequired,archived:false,...(method==='MPESA'?{mpesaMode,mpesaNumber,...(mpesaMode==='PAYBILL'?{mpesaAccountReference}:{})}:{})},reason:'Initial business setup',expectedVersions:[{collection:'paymentAccounts',id,version:prior?.version??0}]});
  }
  setMessage('Business settings, outlet, storage, and selected payment accounts are saved. Review the checklist, then finish setup.');setIsError(false);
 };
 const finish=async()=>{
  setMessage('');setIsError(false);
  try{
   setBusy(true);
   const setup=(await recordsNow()).find(record=>record.collection==='businessSetup'&&record.id===businessId);
   if(!setup)throw new Error('The server setup record is missing.');
   await runCommand('business.setup.complete','businessSetup',businessId,{expectedVersions:[{collection:'businessSetup',id:businessId,version:setup.version}]});
  }catch(error){setIsError(true);setMessage(error instanceof Error?error.message:'Setup could not be completed.');}
  finally{setBusy(false)}
 };
 const stepTitles=['Business identity','Business type','Outlets and payments','Finish'];
 const canPrepare=configuration.businessType&&configuration.locations.length>0&&configuration.outlets.length>0&&configuration.payments.some(account=>account.method==='CASH')&&configuration.taxTreatment;
 const prepared=!!activeRecord(records,'businessSettings',businessId)&&configuration.locations.every(location=>!!activeRecord(records,'stockLocations',location.id))&&configuration.outlets.every(outlet=>!!activeRecord(records,'outlets',outlet.id))&&configuration.payments.every(account=>!!activeRecord(records,'paymentAccounts',account.id));
 const nextDisabled=busy||!online;

 return <main className="min-h-dvh bg-slate-950 px-3 py-5 text-slate-100 sm:px-6 sm:py-8">
  <div className="mx-auto max-w-4xl">
   <header className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
    <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-amber-400">SERVOS · FIRST-RUN SETUP</div><p className="mt-1 text-sm text-slate-300">Business owner workspace</p></div>
    <button type="button" className={secondary} onClick={onSignOut}><LockKeyhole className="h-4 w-4"/>Sign out</button>
   </header>
   <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30">
    <div className="border-b border-slate-800 p-5 sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-amber-300">Setup {step+1} of {stepTitles.length}</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">{stepTitles[step]}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">These choices are saved to your business and can be resumed after signing out or refreshing this page.</p></div><div className="flex gap-1.5" aria-label="Setup progress">{stepTitles.map((title,index)=><span key={title} title={title} className={`h-2 w-9 rounded-full ${index<=step?'bg-amber-400':'bg-slate-700'}`}/>)}</div></div></div>
    {!online&&<div className="border-b border-amber-800 bg-amber-950/40 px-5 py-3 text-sm text-amber-100">Connect to the business API to save first-run setup.</div>}
    {message&&<div role={isError?'alert':'status'} className={`mx-5 mt-5 rounded-xl border p-3 text-sm ${isError?'border-rose-800 bg-rose-950/40 text-rose-100':'border-emerald-800 bg-emerald-950/30 text-emerald-100'}`}>{message}</div>}
    {step===0&&<form onSubmit={event=>void continueStep(event)} className="space-y-4 p-5 sm:p-7">
     <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium">Registered business name<input required maxLength={160} autoComplete="organization" className={field} value={configuration.businessName} onChange={event=>update('businessName',event.target.value)}/></label>
      <label className="block text-sm font-medium">Business category<select required className={field} value={configuration.category} onChange={event=>update('category',event.target.value)}><option value="">Choose a category</option>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm font-medium">Contact telephone<input maxLength={160} autoComplete="tel" className={field} value={configuration.contact||''} onChange={event=>update('contact',event.target.value)}/></label>
      <label className="block text-sm font-medium">Address or location<input maxLength={500} autoComplete="street-address" className={field} value={configuration.address||''} onChange={event=>update('address',event.target.value)}/></label>
      <label className="block text-sm font-medium">Receipt display name<input required maxLength={160} className={field} value={configuration.receiptName} onChange={event=>update('receiptName',event.target.value)}/><span className={help}>This is the business name customers see on printed receipts.</span></label>
      <label className="block text-sm font-medium">Tax registration number <span className="font-normal text-slate-500">(optional)</span><input maxLength={80} className={field} value={configuration.taxPin||''} onChange={event=>update('taxPin',event.target.value)}/></label>
     </div>
     <label className="block text-sm font-medium">Receipt footer <span className="font-normal text-slate-500">(optional)</span><input maxLength={500} className={field} value={configuration.footer||''} onChange={event=>update('footer',event.target.value)}/></label>
     <fieldset className="space-y-3 rounded-2xl border border-slate-700 p-4"><legend className="px-2 text-sm font-bold">VAT and levy treatment</legend><p className="text-xs leading-5 text-slate-400">Choose the rates the business owner confirms. ServOS will not assume tax rates.</p>
      <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="radio" name="tax-treatment" className="mt-1 accent-amber-400" checked={configuration.taxTreatment==='ZERO_RATES'} onChange={()=>setConfiguration(previous=>({...previous,taxTreatment:'ZERO_RATES',vatRateBasisPoints:0,levyRateBasisPoints:0}))}/><span><b>Zero rates</b><span className="mt-1 block text-xs text-slate-400">Record VAT and levy at 0% for this setup.</span></span></label>
      <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="radio" name="tax-treatment" className="mt-1 accent-amber-400" checked={configuration.taxTreatment==='CUSTOM_RATES'} onChange={()=>setConfiguration(previous=>({...previous,taxTreatment:'CUSTOM_RATES'}))}/><span><b>Enter rates confirmed by the owner</b><span className="mt-1 block text-xs text-slate-400">The entered rates are applied as inclusive receipt rates.</span></span></label>
      {configuration.taxTreatment==='CUSTOM_RATES'&&<div className="grid gap-3 pl-6 sm:grid-cols-2"><label className="text-sm">VAT rate (%)<input required inputMode="decimal" className={field} value={vatText} onChange={event=>{setVatText(event.target.value);const result=percentBasisPoints(event.target.value);if(result!==null)setConfiguration(previous=>({...previous,vatRateBasisPoints:result}))}}/><span className={help}>Enter 0 to 100, with up to two decimal places.</span></label><label className="text-sm">Levy rate (%)<input required inputMode="decimal" className={field} value={levyText} onChange={event=>{setLevyText(event.target.value);const result=percentBasisPoints(event.target.value);if(result!==null)setConfiguration(previous=>({...previous,levyRateBasisPoints:result}))}}/><span className={help}>Enter 0 to 100, with up to two decimal places.</span></label></div>}
     </fieldset>
     <div className="flex justify-end border-t border-slate-800 pt-4"><button className={primary} disabled={nextDisabled}>{busy?'Saving…':'Save and continue'}<ArrowRight className="h-4 w-4"/></button></div>
    </form>}
    {step===1&&<form onSubmit={event=>void continueStep(event)} className="space-y-5 p-5 sm:p-7">
     <div className="grid gap-3 sm:grid-cols-2">{types.map(item=><label key={item.value} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${configuration.businessType===item.value?'border-amber-400 bg-amber-400/5':'border-slate-700 hover:border-slate-500'}`}><input type="radio" name="business-type" className="mt-1 accent-amber-400" checked={configuration.businessType===item.value} onChange={()=>setConfiguration(previous=>({...previous,businessType:item.value,...buildResourcePlan(item.value,previous)}))}/><span><b>{item.label}</b><span className={help}>Sets useful starting outlets and navigation defaults; this remains one ServOS application.</span></span></label>)}</div>
     {configuration.businessType&&<div className="grid gap-4 md:grid-cols-2"><section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><h2 className="flex items-center gap-2 font-bold"><Home className="h-4 w-4 text-amber-300"/>Storage locations</h2><p className={help}>Rename these defaults to match your premises.</p>{configuration.locations.map(location=><label key={location.id} className="mt-3 block text-sm">Storage location<input required maxLength={120} className={field} value={location.name} onChange={event=>update('locations',configuration.locations.map(row=>row.id===location.id?{...row,name:event.target.value}:row))}/></label>)}</section><section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><h2 className="flex items-center gap-2 font-bold"><Store className="h-4 w-4 text-amber-300"/>Outlets</h2><p className={help}>Each outlet starts linked to the selected main storage location.</p>{configuration.outlets.map(outlet=><label key={outlet.id} className="mt-3 block text-sm">Outlet name<input required maxLength={120} className={field} value={outlet.name} onChange={event=>update('outlets',configuration.outlets.map(row=>row.id===outlet.id?{...row,name:event.target.value}:row))}/></label>)}</section></div>}
     <div className="flex justify-between border-t border-slate-800 pt-4"><button type="button" className={secondary} disabled={busy} onClick={()=>setStep(0)}><ArrowLeft className="h-4 w-4"/>Back</button><button className={primary} disabled={nextDisabled||!configuration.businessType}>{busy?'Saving…':'Save and continue'}<ArrowRight className="h-4 w-4"/></button></div>
    </form>}
    {step===2&&<form onSubmit={event=>void continueStep(event)} className="space-y-5 p-5 sm:p-7">
     <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><h2 className="flex items-center gap-2 font-bold"><WalletCards className="h-4 w-4 text-amber-300"/>Payment options</h2><p className={help}>Cash is always available. Select only methods your business accepts. M-Pesa is recorded manually; no Daraja connection is required.</p>
      <label className="mt-4 flex items-center gap-3 rounded-xl border border-slate-800 p-3 text-sm"><input type="checkbox" disabled={configuration.payments.some(item=>item.method==='CASH'&&!!activeRecord(records,'paymentAccounts',item.id))} checked={configuration.payments.some(item=>item.method==='CASH')} onChange={event=>togglePayment('CASH',event.target.checked)} className="accent-amber-400"/><span><b>Cash</b><span className={help}>Basic payment option</span></span></label>
      {(['TILL','PAYBILL'] as const).map(mode=>{const account=configuration.payments.find(item=>item.method==='MPESA'&&item.mpesaMode===mode);return <div key={mode} className="mt-3 rounded-xl border border-slate-800 p-3"><label className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={!!account&&!!activeRecord(records,'paymentAccounts',account.id)} checked={!!account} onChange={event=>togglePayment('MPESA',event.target.checked,mode)} className="accent-amber-400"/><span><b>M-Pesa {mode==='TILL'?'Till':'Paybill'}</b></span></label>{account&&<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">{mode==='TILL'?'Till number':'Paybill number'}<input required inputMode="numeric" maxLength={10} className={field} value={account.mpesaNumber||''} onChange={event=>patchPayment(account.id,{mpesaNumber:event.target.value.replace(/\D/g,'')})}/><span className={help}>Enter the real destination provided by the business owner.</span></label>{mode==='PAYBILL'&&<label className="text-sm">Account reference<input required maxLength={100} className={field} value={account.mpesaAccountReference||''} onChange={event=>patchPayment(account.id,{mpesaAccountReference:event.target.value})}/></label>}<label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-amber-400" checked={account.referenceRequired} onChange={event=>patchPayment(account.id,{referenceRequired:event.target.checked})}/>Require a payment reference</label></div>}</div>})}
      {(['CARD','BANK'] as const).map(method=>{const account=configuration.payments.find(item=>item.method===method);return <label key={method} className="mt-3 flex items-center gap-3 rounded-xl border border-slate-800 p-3 text-sm"><input type="checkbox" disabled={!!account&&!!activeRecord(records,'paymentAccounts',account.id)} checked={!!account} onChange={event=>togglePayment(method,event.target.checked)}/><span><b>{method==='CARD'?'Card':'Bank transfer'}</b><span className={help}>Payment is recorded against the selected account; no provider connection is implied.</span></span></label>})}
     </div>
     <div className="flex justify-between border-t border-slate-800 pt-4"><button type="button" className={secondary} disabled={busy} onClick={()=>setStep(1)}><ArrowLeft className="h-4 w-4"/>Back</button><button className={primary} disabled={nextDisabled}>{busy?'Saving…':'Save and review'}<ArrowRight className="h-4 w-4"/></button></div>
    </form>}
    {step===3&&<div className="space-y-5 p-5 sm:p-7">
     <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><h2 className="flex items-center gap-2 font-bold"><ClipboardCheck className="h-4 w-4 text-amber-300"/>Setup checklist</h2><div className="mt-4 space-y-3 text-sm">
      {[['Business identity and explicit tax treatment',!!configuration.businessName&&!!configuration.receiptName&&!!configuration.taxTreatment],['Business type and starting navigation',!!configuration.businessType],['Outlet and storage defaults',configuration.outlets.length>0&&configuration.locations.length>0],['Business settings and receipt details',!!activeRecord(records,'businessSettings',businessId)],['Cash payment account',configuration.payments.some(item=>item.method==='CASH')&&configuration.payments.filter(item=>item.method==='CASH').every(item=>!!activeRecord(records,'paymentAccounts',item.id))],['Selected optional payment accounts',configuration.payments.filter(item=>item.method!=='CASH').every(item=>!!activeRecord(records,'paymentAccounts',item.id))]].map(([label,done])=><div key={String(label)} className="flex items-center gap-3"><CheckCircle2 className={`h-4 w-4 shrink-0 ${done?'text-emerald-400':'text-slate-600'}`}/><span className={done?'text-slate-200':'text-slate-400'}>{String(label)}{done?' · complete':' · to do'}</span></div>)}
     </div></section>
     <section className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl border border-slate-800 p-3"><b className="text-sm">Products and opening stock</b><p className={help}>Add your first product or import the catalog after setup. Inventory can be configured later.</p></article><article className="rounded-xl border border-slate-800 p-3"><b className="text-sm">Staff</b><p className={help}>Add staff and role templates from the Staff workspace after setup.</p></article><article className="rounded-xl border border-slate-800 p-3"><b className="text-sm">Rooms</b><p className={help}>{configuration.businessType==='HOTEL_RESORT'?'Set up room types and rooms from the Rooms workspace after setup.':'Hotel room setup is optional for this business type.'}</p></article></section>
     <div className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-4"><button type="button" className={secondary} disabled={busy} onClick={()=>setStep(2)}><ArrowLeft className="h-4 w-4"/>Back</button><div className="flex flex-wrap gap-2"><button type="button" className={secondary} disabled={busy||!online||!canPrepare} onClick={()=>{setBusy(true);setMessage('Saving business defaults…');void prepareDefaults().catch(error=>{setIsError(true);setMessage(error instanceof Error?error.message:'Business defaults could not be saved.')}).finally(()=>setBusy(false))}}>{busy?'Saving…':prepared?'Refresh setup defaults':'Save business defaults'}</button><button type="button" className={primary} disabled={busy||!online||!prepared} onClick={()=>void finish()}>{busy?'Finishing…':'Finish and open workspace'}<ArrowRight className="h-4 w-4"/></button></div></div>
     {!canPrepare&&<p className="text-sm text-amber-200">Complete business identity, choose a business type, and select Cash before saving defaults.</p>}
     {prepared&&<p className="text-xs text-slate-400">Products, staff, and hotel rooms remain available after setup. You can change business settings later.</p>}
    </div>}
   </section>
  </div>
 </main>;
}
