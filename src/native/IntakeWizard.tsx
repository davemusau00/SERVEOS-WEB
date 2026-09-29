import React, { useMemo, useState } from 'react';
import type { IntakeProfile } from '../types/runtime';
import { useRuntime } from '../runtime/RuntimeProvider';
import { buttonClass, fieldClass, primaryButtonClass } from './records';
import { parseBusinessIntakeCsv } from './intakeCsv';
import { IMPORT_TEMPLATES } from './importTemplates';

const defaults: IntakeProfile = {
  business: { tradingName: '', legalName: '', registrationNumber: '', kraPin: '', phone: '', email: '', address: '' },
  owner: { fullName: '', phone: '', email: '' },
  initialAdministrator: { fullName: '', phone: '', email: '', jobTitle: 'Owner / Administrator', isBusinessOwner: true },
  venueType: 'BAR', serviceModes: ['COUNTER', 'TABS'], operatingHours: '10:00–02:00', lateNight: true,
  paymentMethods: ['CASH', 'MPESA', 'CARD'], mpesaAccount: '', salesStructure: ['DRINKS', 'COCKTAILS'],
  tracksSpiritsByMl: true, usesCocktailRecipes: true, serviceAreas: ['Main Bar'], stockAreas: ['Main Store', 'Bar Store'],
  hasTables: false, estimatedTables: 0, estimatedManagers: 1, estimatedOperators: 3,
  printerExpected: true, drawerExpected: false, barcodeScannerExpected: true, importMode: 'MANUAL'
};

const split = (value: string) => value.split(',').map(v => v.trim()).filter(Boolean);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const IntakeWizard = () => {
  const runtime = useRuntime();
  const saved = runtime.status?.intakeProfile;
  const [csvMessage,setCsvMessage]=useState('');
  const [profile, setProfile] = useState<IntakeProfile>({
    ...defaults,
    ...(saved || {}),
    business: { ...defaults.business, ...(saved?.business || {}) },
    owner: { ...defaults.owner, ...(saved?.owner || {}) },
    initialAdministrator: { ...defaults.initialAdministrator, ...(saved?.initialAdministrator || {}) },
  });

  const set = <K extends keyof IntakeProfile>(key: K, value: IntakeProfile[K]) =>
    setProfile(p => ({ ...p, [key]: value }));

  const setBusiness = <K extends keyof IntakeProfile['business']>(key: K, value: IntakeProfile['business'][K]) =>
    setProfile(p => ({ ...p, business: { ...p.business, [key]: value } }));

  const setOwner = <K extends keyof IntakeProfile['owner']>(key: K, value: IntakeProfile['owner'][K]) =>
    setProfile(p => {
      const owner = { ...p.owner, [key]: value };
      return {
        ...p,
        owner,
        initialAdministrator: p.initialAdministrator.isBusinessOwner
          ? { ...p.initialAdministrator, fullName: owner.fullName, phone: owner.phone, email: owner.email }
          : p.initialAdministrator
      };
    });

  const setAdmin = <K extends keyof IntakeProfile['initialAdministrator']>(key: K, value: IntakeProfile['initialAdministrator'][K]) =>
    setProfile(p => ({ ...p, initialAdministrator: { ...p.initialAdministrator, [key]: value } }));

  const toggleAdminOwner = (checked: boolean) =>
    setProfile(p => ({
      ...p,
      initialAdministrator: checked
        ? {
            ...p.initialAdministrator,
            isBusinessOwner: true,
            fullName: p.owner.fullName,
            phone: p.owner.phone,
            email: p.owner.email,
            jobTitle: p.initialAdministrator.jobTitle || 'Owner / Administrator'
          }
        : { ...p.initialAdministrator, isBusinessOwner: false }
    }));

  const toggle = <T extends string>(key: 'serviceModes' | 'paymentMethods', value: T) =>
    setProfile(p => ({
      ...p,
      [key]: (p[key] as string[]).includes(value)
        ? (p[key] as string[]).filter(x => x !== value)
        : [...(p[key] as string[]), value]
    }));

  const loadBusinessCsv=async(file?:File)=>{if(!file)return;try{const business=parseBusinessIntakeCsv(await file.text());setProfile(p=>({...p,business,importMode:'CSV'}));setCsvMessage('business.csv loaded. Review the identity fields before confirmation.')}catch(e){setCsvMessage(String(e))}};
  const downloadBusinessTemplate=()=>{const t=IMPORT_TEMPLATES.find(x=>x.key==='business')!;const u=URL.createObjectURL(new Blob([t.csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=t.fileName;a.click();window.setTimeout(()=>URL.revokeObjectURL(u),1000)};

  const identityReady =
    !!profile.business.tradingName.trim() &&
    !!profile.owner.fullName.trim() &&
    validEmail(profile.owner.email) &&
    !!profile.initialAdministrator.fullName.trim() &&
    validEmail(profile.initialAdministrator.email) &&
    !!profile.initialAdministrator.jobTitle.trim();

  const summary = useMemo(() => [
    profile.business.tradingName || 'Business name pending',
    `${profile.venueType.replace('_', ' ')} · ${profile.serviceModes.join(' + ')}`,
    profile.paymentMethods.join(' / '),
    `Initial Admin: ${profile.initialAdministrator.fullName || 'pending'}`,
    profile.tracksSpiritsByMl ? 'ml-based spirit control' : 'unit-based stock',
    profile.usesCocktailRecipes ? 'cocktail recipes' : 'no recipes',
    `${profile.serviceAreas.length} service area(s)`,
    `${profile.stockAreas.length} stock area(s)`,
    profile.hasTables ? `${profile.estimatedTables} tables` : 'counter/tab operation'
  ], [profile]);

  return <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="text-xs font-bold tracking-[.2em] text-amber-400">SERVOS TERMINAL INTAKE</div>
        <h1 className="mt-2 text-3xl font-black">Configure the business and its first administrator</h1>
        <p className="mt-2 max-w-3xl text-slate-400">Intake stores business configuration intent only. Passwords and local PINs are never stored here. The first System Administrator is activated during secure terminal enrollment.</p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-lg font-bold">1. Business identity</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label>Trading / business name<input className={fieldClass} value={profile.business.tradingName} onChange={e=>setBusiness('tradingName',e.target.value)}/></label>
          <label>Legal / registered name<input className={fieldClass} value={profile.business.legalName} onChange={e=>setBusiness('legalName',e.target.value)}/></label>
          <label>Registration number<input className={fieldClass} value={profile.business.registrationNumber} onChange={e=>setBusiness('registrationNumber',e.target.value)}/></label>
          <label>KRA PIN<input className={fieldClass} value={profile.business.kraPin} onChange={e=>setBusiness('kraPin',e.target.value.toUpperCase())}/></label>
          <label>Business phone<input className={fieldClass} value={profile.business.phone} onChange={e=>setBusiness('phone',e.target.value)}/></label>
          <label>Business email<input type="email" className={fieldClass} value={profile.business.email} onChange={e=>setBusiness('email',e.target.value)}/></label>
          <label className="md:col-span-2">Physical address<textarea className={fieldClass} value={profile.business.address} onChange={e=>setBusiness('address',e.target.value)}/></label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-lg font-bold">2. Owner / authorizing person</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <label>Full name<input className={fieldClass} value={profile.owner.fullName} onChange={e=>setOwner('fullName',e.target.value)}/></label>
          <label>Phone<input className={fieldClass} value={profile.owner.phone} onChange={e=>setOwner('phone',e.target.value)}/></label>
          <label>Email used for owner authorization<input type="email" className={fieldClass} value={profile.owner.email} onChange={e=>setOwner('email',e.target.value)}/></label>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">3. Initial System Administrator</h2><p className="text-sm text-slate-400">This account receives the local Admin role. Its PIN is created later during enrollment.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.initialAdministrator.isBusinessOwner} onChange={e=>toggleAdminOwner(e.target.checked)}/> Same person as owner</label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>Administrator full name<input className={fieldClass} value={profile.initialAdministrator.fullName} disabled={profile.initialAdministrator.isBusinessOwner} onChange={e=>setAdmin('fullName',e.target.value)}/></label>
          <label>Job title<input className={fieldClass} value={profile.initialAdministrator.jobTitle} onChange={e=>setAdmin('jobTitle',e.target.value)}/></label>
          <label>Phone<input className={fieldClass} value={profile.initialAdministrator.phone} disabled={profile.initialAdministrator.isBusinessOwner} onChange={e=>setAdmin('phone',e.target.value)}/></label>
          <label>Email<input type="email" className={fieldClass} value={profile.initialAdministrator.email} disabled={profile.initialAdministrator.isBusinessOwner} onChange={e=>setAdmin('email',e.target.value)}/></label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-lg font-bold">4. Operations profile</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label>Venue profile<select className={fieldClass} value={profile.venueType} onChange={e => set('venueType', e.target.value as IntakeProfile['venueType'])}><option value="BAR">Bar</option><option value="PUB">Pub</option><option value="LOUNGE">Lounge</option><option value="CLUB">Club</option><option value="RESTAURANT_BAR">Restaurant + bar</option><option value="OTHER">Other</option></select></label>
          <label>Operating hours<input className={fieldClass} value={profile.operatingHours} onChange={e => set('operatingHours', e.target.value)} /></label>
          <div><div className="mb-2 text-sm font-semibold">Service model</div><div className="flex flex-wrap gap-2">{(['COUNTER','TABS','TABLES'] as const).map(x => <button type="button" key={x} onClick={() => toggle('serviceModes', x)} className={profile.serviceModes.includes(x) ? primaryButtonClass : buttonClass}>{x}</button>)}</div></div>
          <div><div className="mb-2 text-sm font-semibold">Payment methods</div><div className="flex flex-wrap gap-2">{(['CASH','MPESA','CARD'] as const).map(x => <button type="button" key={x} onClick={() => toggle('paymentMethods', x)} className={profile.paymentMethods.includes(x) ? primaryButtonClass : buttonClass}>{x}</button>)}</div></div>
          {profile.paymentMethods.includes('MPESA') && <label>M-Pesa Till / Paybill number<input className={fieldClass} value={profile.mpesaAccount || ''} onChange={e => set('mpesaAccount', e.target.value)} /></label>}
          <label>Sales structure<input className={fieldClass} value={profile.salesStructure.join(', ')} onChange={e => set('salesStructure', split(e.target.value))} /></label>
          <label>Service areas<input className={fieldClass} value={profile.serviceAreas.join(', ')} onChange={e => set('serviceAreas', split(e.target.value))} /></label>
          <label>Stock areas<input className={fieldClass} value={profile.stockAreas.join(', ')} onChange={e => set('stockAreas', split(e.target.value))} /></label>
          <label>Existing data<select className={fieldClass} value={profile.importMode} onChange={e => set('importMode', e.target.value as IntakeProfile['importMode'])}><option value="MANUAL">Manual entry</option><option value="CSV">CSV import</option><option value="EMPTY">Start empty</option></select></label>
          {profile.importMode==='CSV'&&<div className="rounded-xl border border-slate-700 p-3 text-sm"><div className="font-semibold">Business identity CSV</div><p className="mt-1 text-xs text-slate-500">Load business.csv to prefill identity only. Owner and administrator authorization remain manual.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={downloadBusinessTemplate}>Download business.csv</button><label className={buttonClass+' cursor-pointer'}>Load business.csv<input className="hidden" type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];void loadBusinessCsv(file);e.currentTarget.value=''}}/></label></div>{csvMessage&&<p className="mt-2 text-xs text-amber-200">{csvMessage}</p>}</div>}
          <label>Intended go-live date<input type="date" className={fieldClass} value={profile.intendedGoLiveDate || ''} onChange={e => set('intendedGoLiveDate', e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3"><label>Managers<input type="number" min="1" className={fieldClass} value={profile.estimatedManagers} onChange={e => set('estimatedManagers', Number(e.target.value))} /></label><label>Operators<input type="number" min="1" className={fieldClass} value={profile.estimatedOperators} onChange={e => set('estimatedOperators', Number(e.target.value))} /></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={profile.tracksSpiritsByMl} onChange={e => set('tracksSpiritsByMl', e.target.checked)} /> Spirit ml control</label><label className="flex items-center gap-2"><input type="checkbox" checked={profile.usesCocktailRecipes} onChange={e => set('usesCocktailRecipes', e.target.checked)} /> Cocktail recipes</label><label className="flex items-center gap-2"><input type="checkbox" checked={profile.hasTables} onChange={e => set('hasTables', e.target.checked)} /> Tables / seating</label><label className="flex items-center gap-2"><input type="checkbox" checked={profile.lateNight} onChange={e => set('lateNight', e.target.checked)} /> Late-night operation</label></div>
          {profile.hasTables && <label>Estimated tables<input type="number" min="1" className={fieldClass} value={profile.estimatedTables} onChange={e => set('estimatedTables', Number(e.target.value))} /></label>}
          <div className="grid grid-cols-3 gap-2 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={profile.printerExpected} onChange={e => set('printerExpected', e.target.checked)} /> Printer</label><label className="flex items-center gap-2"><input type="checkbox" checked={profile.drawerExpected} onChange={e => set('drawerExpected', e.target.checked)} /> Cash drawer</label><label className="flex items-center gap-2"><input type="checkbox" checked={profile.barcodeScannerExpected} onChange={e => set('barcodeScannerExpected', e.target.checked)} /> Scanner</label></div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
        <h2 className="font-bold">Commissioning summary</h2>
        <ul className="mt-2 grid gap-1 text-sm text-slate-300 md:grid-cols-2">{summary.map(x => <li key={x}>• {x}</li>)}</ul>
      </section>
      {runtime.error && <p className="rounded-xl bg-rose-950 p-3 text-rose-200">{runtime.error}</p>}
      <div className="flex justify-end gap-3">
        <button disabled={runtime.busy} className={buttonClass} onClick={() => void runtime.saveIntake(profile)}>Save progress</button>
        <button disabled={runtime.busy || !identityReady || !profile.serviceAreas.length || !profile.stockAreas.length || !profile.paymentMethods.length} className={primaryButtonClass} onClick={() => void runtime.completeIntake(profile)}>Confirm intake & continue</button>
      </div>
    </div>
  </div>;
};
