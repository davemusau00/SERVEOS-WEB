import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronRight, Clock3, Database, RefreshCw, Search, ShieldCheck, Wifi } from 'lucide-react';
import { RemoteAccountAccess, remoteAuthCall, takeAccountLink } from './RemoteAccountAccess';
import { WebBusinessApp } from './web/WebBusinessApp';
import type { WebSession } from './web/session';
import { Drawer } from '../design-system/controls';
import {signInAndEnrollApiDevice,openApiBusinessStore,type ApiAuthenticatedDeviceSession} from './web/apiAuth';
import {ApiCatalogPilot} from './web/ApiCatalogPilot';
import {BusinessStore} from './web/BusinessStore';

interface Auth { access_token: string; refresh_token: string; expires_in: number }
interface RecordRow { collection: string; id: string; version: number; data: Record<string, any>; archived: boolean }

const collections = [
  { id: 'orders', label: 'Orders', group: 'Sales' },
  { id: 'payments', label: 'Payments', group: 'Sales' },
  { id: 'customers', label: 'Customers', group: 'Sales' },
  { id: 'tables', label: 'Tables', group: 'Sales' },
  { id: 'tillSessions', label: 'Till sessions', group: 'Sales' },
  { id: 'products', label: 'Products', group: 'Stock' },
  { id: 'stockItems', label: 'Stock items', group: 'Stock' },
  { id: 'stockMovements', label: 'Stock movements', group: 'Stock' },
  { id: 'suppliers', label: 'Suppliers', group: 'Stock' },
  { id: 'purchaseOrders', label: 'Purchase orders', group: 'Procurement' },
  { id: 'goodsReceipts', label: 'Goods receipts', group: 'Procurement' },
  { id: 'supplierPayables', label: 'Supplier payables', group: 'Finance' },
  { id: 'supplierPayments', label: 'Supplier payments', group: 'Finance' },
  { id: 'journalEntries', label: 'Journal entries', group: 'Finance' },
  { id: 'mpesaReceipts', label: 'M-Pesa receipts', group: 'Finance' },
  { id: 'rooms', label: 'Rooms', group: 'Hotel' },
  { id: 'roomReservations', label: 'Reservations', group: 'Hotel' },
  { id: 'folios', label: 'Folios', group: 'Hotel' },
  { id: 'assets', label: 'Assets', group: 'Assets' },
] as const;

const field = 'rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400';
const button = 'rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-40';
const primary = 'rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40';

const titleCase = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const recordName = (r: RecordRow) => String(r.data.name || r.data.label || r.data.orderNumber || r.data.poNumber || r.data.grnNumber || r.data.referenceNumber || r.data.number || r.data.tag || r.id);
const recordState = (r: RecordRow) => String(r.data.state || r.data.status || r.data.condition || 'ACTIVE');
const compactId = (value: string) => value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-5)}` : value;
const kes = (value: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(value);
const recordValue = (r: RecordRow) => {
  if (r.data.grandTotal !== undefined) return kes(Number(r.data.grandTotal || 0));
  if (r.data.amount !== undefined) return kes(Number(r.data.amount || 0));
  if (r.data.price !== undefined) return kes(Number(r.data.price || 0));
  if (r.data.amountMinor !== undefined) return kes(Number(r.data.amountMinor || 0) / 100);
  if (r.data.balanceMinor !== undefined) return kes(Number(r.data.balanceMinor || 0) / 100);
  if (r.collection === 'stockItems') {
    const qty = Object.values(r.data.currentStock || {}).reduce((sum: number, value) => sum + Number(value || 0), 0);
    return `${qty.toLocaleString()} ${r.data.baseUnit || 'units'}`;
  }
  return '—';
};
const statusTone = (value: string) => {
  const state = value.toUpperCase();
  if (/CONFLICT|REJECT|VOID|CANCEL|OUT_OF_ORDER|LOST|FAILED/.test(state)) return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (/PENDING|OPEN|DRAFT|RESERVED|LOW|DIRTY|IN_PROGRESS/.test(state)) return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
};
const displayValue = (key: string, value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (/minor$/i.test(key)) return kes(value / 100);
    return value.toLocaleString();
  }
  if (typeof value === 'string' && /(?:At|Date|Time)$/i.test(key) && !Number.isNaN(Date.parse(value))) return new Date(value).toLocaleString('en-KE');
  if (Array.isArray(value)) return value.length ? value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const RemoteManagerApp = ({ onBack }: { onBack: () => void }) => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const webV2Enabled = import.meta.env.VITE_ENABLE_WEB_V2 === 'true';
  const [accountLink, setAccountLink] = useState(takeAccountLink);
  const [accountNotice, setAccountNotice] = useState('');
  const [auth, setAuth] = useState<Auth | null>(null); const authRef = useRef<Auth | null>(null); const expires = useRef(0);
  const [cloudSession,setCloudSession]=useState<WebSession|null>(null);
  const [apiSession,setApiSession]=useState<ApiAuthenticatedDeviceSession|null>(null);const [apiStore,setApiStore]=useState<BusinessStore|null>(null);const [authMode,setAuthMode]=useState<'REMOTE'|'API'>('REMOTE');const [newPassword,setNewPassword]=useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState('orders'); const [offset, setOffset] = useState(0); const [rows, setRows] = useState<RecordRow[]>([]);
  const [requests, setRequests] = useState<any[]>([]); const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [selected, setSelected] = useState<RecordRow | null>(null); const [name, setName] = useState(''); const [price, setPrice] = useState('');
  const [search, setSearch] = useState(''); const [refreshing, setRefreshing] = useState(false);
  const saveAuth = (next: Auth) => { authRef.current = next; expires.current = Date.now() + next.expires_in * 1000; setAuth(next); };
  const generation = useRef(0);
  const clearSession = () => { generation.current++;  authRef.current = null; setAuth(null); setCloudSession(null); setRows([]); setRequests([]); setSelected(null); setLastSeen(null); };
  const signOut = async () => { setBusy(true); try { if(authRef.current) await remoteAuthCall(url,key,'logout?scope=global',undefined,authRef.current.access_token); clearSession(); setError(''); } catch(cause) { setError(String(cause)); } finally {setBusy(false);} };
  const signOutApi=async()=>{setBusy(true);try{await apiSession?.signOut();setApiStore(current=>{current?.close();return null});setApiSession(null);setPassword('');setNewPassword('');setError('')}catch(cause){setError(String(cause))}finally{setBusy(false)}};
  const recover = async () => { if(!email.trim()) { setError('Enter your account email first.'); return; } setBusy(true); setError(''); try { await remoteAuthCall(url,key,`recover?redirect_to=${encodeURIComponent(window.location.origin + window.location.pathname)}`,{email:email.trim()}); setAccountNotice('If this address has an account, recovery instructions have been sent.'); } catch(cause) { setError(String(cause)); } finally {setBusy(false);} };
  const request = async (path: string, body?: unknown) => {
    if (!authRef.current) throw new Error('Sign in first');
    if (Date.now() >= expires.current - 60_000) {
      const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: authRef.current.refresh_token }) });
      if (!res.ok) { clearSession(); throw new Error('Session expired. Sign in again.'); }
      saveAuth(await res.json());
    }
    const endpoint=path.startsWith('functions/v1/')?`${url}/${path}`:`${url}/rest/v1/${path}`;
    const res = await fetch(endpoint, { method: body === undefined ? 'GET' : 'POST', headers: { apikey: key, Authorization: `Bearer ${authRef.current!.access_token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {const detail=await res.json().catch(()=>({}));throw Object.assign(new Error(detail.message||`Server rejected the request (${res.status}). No change was confirmed.`),{status:res.status})}
    const text = await res.text(); return text ? JSON.parse(text) : null;
  };
  const refresh = async () => {
    const started = generation.current;
    setRefreshing(true);
    try {
      if(await request('rpc/servos_is_manager', {}) !== true) { clearSession(); throw new Error('Remote Manager access has been revoked.'); }
      const [records, changes, health] = await Promise.all([
        request(`business_records?select=*&archived=eq.false&collection=eq.${encodeURIComponent(collection)}&order=id&limit=100&offset=${offset}`),
        request('remote_change_requests?select=*&order=created_at.desc&limit=100'),
        request('rpc/servos_health', {})
      ]);
      if(started !== generation.current || !authRef.current) return;
      setRows(records); setRequests(changes); setLastSeen(health?.lastSeen || null); setError('');
    } catch (e) { setError(String(e)); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { if (!auth||cloudSession?.enabled) return; void refresh(); const timer = setInterval(() => void refresh(), 60_000); return () => clearInterval(timer); }, [auth?.access_token, cloudSession?.enabled, collection, offset]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => `${recordName(row)} ${row.id} ${recordState(row)} ${JSON.stringify(row.data)}`.toLowerCase().includes(q));
  }, [rows, search]);

  const pendingRequests = requests.filter(request => !['APPLIED','REJECTED','CANCELLED','CONFLICT'].includes(String(request.status || '').toUpperCase())).length;
  const syncAgeMinutes = lastSeen ? Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000)) : null;
  const syncState = syncAgeMinutes === null ? 'NO DATA' : syncAgeMinutes <= 5 ? 'FRESH' : syncAgeMinutes <= 30 ? 'DELAYED' : 'STALE';
  const syncTone = syncState === 'FRESH' ? 'text-emerald-300' : syncState === 'DELAYED' ? 'text-amber-300' : 'text-rose-300';
  const activeCollection = collections.find(item => item.id === collection);

  if(accountLink) return <RemoteAccountAccess url={url} publishableKey={key} link={accountLink} onDone={()=>setAccountLink(null)}/>;
  if(apiSession&&apiStore)return <ApiCatalogPilot auth={apiSession} store={apiStore} onSignOut={()=>void signOutApi()}/>;
  if (!auth) return <div className="min-h-screen bg-slate-950 text-white grid place-items-center p-5"><form className="w-full max-w-md space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if(authMode==='API'){
        const apiOrigin=import.meta.env.VITE_API_URL;if(!apiOrigin)throw new Error('The ServOS API origin is not configured for this PWA release.');
        const next=await signInAndEnrollApiDevice({apiOrigin,loginName:email.trim(),password,newPassword:newPassword||undefined});
        const opened=await openApiBusinessStore(next);setApiSession(next);setApiStore(opened);setPassword('');setNewPassword('');return;
      }
      if (!url || !key) throw new Error('The business server is not configured for this build.');
      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!res.ok) throw new Error('Sign-in failed');
      const next: Auth = await res.json();
      if(webV2Enabled){
        const sessionResponse=await fetch(`${url}/rest/v1/rpc/servos_v2_session`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${next.access_token}`,'Content-Type':'application/json'},body:'{}'});
        if(sessionResponse.ok){const session:WebSession=await sessionResponse.json();if(session.enabled||session.lifecycleStage&&session.lifecycleStage!=='LIVE'){setCloudSession(session);setPassword('');saveAuth(next);return}}
        else if(sessionResponse.status!==404)throw new Error('Business membership could not be verified. Sign-in was not completed.');
      }
      const check = await fetch(`${url}/rest/v1/rpc/servos_is_manager`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${next.access_token}`, 'Content-Type': 'application/json' }, body: '{}' });
      if (!check.ok || await check.json() !== true) throw new Error('Manager access has not been assigned to this account.');
      setCloudSession(null);setPassword(''); saveAuth(next);
    } catch(e) {setError(String(e));} finally {setBusy(false);}
  }}>
    <div><div className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-400">ServOS Remote</div><h1 className="mt-2 text-3xl font-black">Business control</h1><p className="mt-2 text-sm text-slate-400">{authMode==='API'?'Sign in to the ServOS API catalog pilot.':'Secure remote visibility and constrained management for your ServOS business.'}</p></div>
    <div className="flex gap-2"><button type="button" className={`${button} ${authMode==='REMOTE'?'border-amber-400 text-amber-200':''}`} onClick={()=>{setAuthMode('REMOTE');setError('')}}>Remote</button><button type="button" className={`${button} ${authMode==='API'?'border-amber-400 text-amber-200':''}`} onClick={()=>{setAuthMode('API');setError('')}}>API catalog pilot</button></div>
    <label className="block text-sm">{authMode==='API'?'Staff login':'Email'}<input required type={authMode==='API'?'text':'email'} autoComplete="username" className={`${field} mt-1 w-full`} value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="block text-sm">Password<input required type="password" autoComplete="current-password" className={`${field} mt-1 w-full`} value={password} onChange={e => setPassword(e.target.value)} /></label>
    {authMode==='API'&&<label className="block text-sm">New password, if account setup requires it<input type="password" autoComplete="new-password" minLength={12} className={`${field} mt-1 w-full`} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>}
    {error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
    {accountNotice&&<p role="status" className="text-sm text-emerald-200">{accountNotice}</p>}
    {authMode==='REMOTE'&&<button type="button" disabled={busy} className="text-sm text-amber-200 underline" onClick={()=>void recover()}>Forgot password?</button>}
    <div className="flex gap-2"><button disabled={busy} className={primary}>{busy?'Signing in…':'Sign in'}</button><button type="button" className={button} onClick={onBack}>Back</button></div>
  </form></div>;

  if(cloudSession?.enabled)return <WebBusinessApp initialSession={cloudSession} rpc={request} onSignOut={()=>void signOut()}/>;
  if(cloudSession?.lifecycleStage&&cloudSession.lifecycleStage!=='LIVE')return <WebBusinessApp initialSession={cloudSession} rpc={request} onSignOut={()=>void signOut()}/>;

  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-4 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-400">ServOS Remote</div><h1 className="text-xl font-black">Business control</h1></div><div className="flex items-center gap-2"><button className={button} disabled={refreshing} onClick={() => void refresh()}><RefreshCw className={`mr-1 inline h-4 w-4 ${refreshing?'animate-spin':''}`}/>Refresh</button><button className={button} disabled={busy} onClick={() => void signOut()}>Sign out</button></div></div></header>

    <main className="mx-auto max-w-[1600px] p-4 sm:p-6">
      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetric icon={<Wifi className="h-4 w-4"/>} label="Terminal sync" value={syncState} detail={lastSeen ? `${new Date(lastSeen).toLocaleString('en-KE')} · ${syncAgeMinutes} min ago` : 'No terminal data received'} valueClass={syncTone}/>
        <DashboardMetric icon={<Database className="h-4 w-4"/>} label="Current dataset" value={activeCollection?.label || collection} detail={`${rows.length} record${rows.length===1?'':'s'} loaded on this page`}/>
        <DashboardMetric icon={<Activity className="h-4 w-4"/>} label="Pending requests" value={String(pendingRequests)} detail={`${requests.length} recent request${requests.length===1?'':'s'} retained`}/>
        <DashboardMetric icon={<ShieldCheck className="h-4 w-4"/>} label="Authority" value="Terminal" detail="Remote edits remain requests until the terminal applies and uploads them."/>
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-3 lg:sticky lg:top-24">
          <div className="px-2 pb-2 text-xs font-black uppercase tracking-wide text-slate-500">Business data</div>
          {Array.from(new Set(collections.map(item => item.group))).map(group => <div key={group} className="mb-3"><div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{group}</div>{collections.filter(item => item.group === group).map(item => <button key={item.id} onClick={() => { setCollection(item.id); setOffset(0); setSearch(''); setSelected(null); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${collection === item.id ? 'bg-amber-400 font-bold text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}><span>{item.label}</span>{collection === item.id && <ChevronRight className="h-4 w-4"/>}</button>)}</div>)}
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4"><div><h2 className="text-lg font-bold">{activeCollection?.label || titleCase(collection)}</h2><p className="mt-1 text-xs text-slate-500">Read-only replica view. Actions below never pretend to be terminal commits.</p></div><label className="relative min-w-[240px] flex-1 sm:max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input className={field + ' w-full pl-9'} value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${activeCollection?.label.toLowerCase() || 'records'}`}/></label></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Record</th><th className="p-3">State</th><th className="p-3">Value / quantity</th><th className="p-3">Version</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{filteredRows.map(r => { const state=recordState(r); return <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900"><td className="p-3"><div className="font-semibold">{recordName(r)}</div><div className="mt-0.5 font-mono text-[11px] text-slate-600">{compactId(r.id)}</div></td><td className="p-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusTone(state)}`}>{state}</span></td><td className="p-3 font-medium">{recordValue(r)}</td><td className="p-3 font-mono text-slate-400">v{r.version}</td><td className="p-3 text-right"><button className={button} onClick={() => { setSelected(r); setName(String(r.data.name || r.data.label || '')); setPrice(String(r.data.price ?? '')); }}>View</button></td></tr>; })}</tbody></table></div>
            {filteredRows.length===0&&<div className="p-10 text-center text-sm text-slate-500">{rows.length ? 'No records match your search.' : 'No records in this category.'}</div>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 p-4 text-sm text-slate-400"><span>{rows.length ? `Records ${offset + 1}–${offset + rows.length}` : 'No records on this page'}</span><div className="flex gap-2"><button disabled={offset===0} className={button} onClick={()=>setOffset(Math.max(0,offset-100))}>Previous</button><button disabled={rows.length<100} className={button} onClick={()=>setOffset(offset+100)}>Next</button></div></div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold">Latest change requests</h2><p className="mt-1 text-xs text-slate-500">Remote intent only. Terminal authority decides whether a request can be applied.</p></div><Clock3 className="h-5 w-5 text-slate-600"/></div>
            <div className="grid gap-2 md:grid-cols-2">{requests.slice(0,12).map(r => { const state=String(r.status||'PENDING'); return <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"><div className="flex items-center justify-between gap-2"><b>{titleCase(String(r.operation||'Change request'))}</b><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusTone(state)}`}>{state}</span></div><div className="mt-1 text-xs text-slate-500">{titleCase(String(r.payload?.collection||'Business record'))}</div>{r.result?.message && <p className="mt-2 text-xs text-slate-300">{r.result.message}</p>}</div>; })}</div>
            {requests.length===0&&<p className="text-sm text-slate-500">No recent change requests.</p>}
          </section>
        </div>
      </div>
    </main>

    {selected && <Drawer title={recordName(selected)} onClose={()=>setSelected(null)}><div className="space-y-5">
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">{titleCase(selected.collection)}</div><h2 className="mt-1 text-2xl font-black">{recordName(selected)}</h2><div className="mt-1 font-mono text-xs text-slate-600">{selected.id} · v{selected.version}</div></div><button className={button} onClick={()=>setSelected(null)}>Close</button></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">{Object.entries(selected.data).filter(([key])=>key!=='id').map(([key,value])=><div key={key} className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{titleCase(key)}</div><div className="mt-1 break-words text-sm">{displayValue(key,value)}</div></div>)}</div>
      {['products','tables','customers','suppliers'].includes(selected.collection)&&<form className="mt-5 space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const data={...selected.data,[selected.collection==='tables'?'label':'name']:name,...(selected.collection==='products'?{price:Number(price)}:{})};await request('rpc/servos_request_change',{operation:'record.save',payload:{collection:selected.collection,id:selected.id,data},expected_version:selected.version});setSelected(null);await refresh();}catch(e){setError(String(e));}finally{setBusy(false)}}}><div><b>Request a terminal-applied change</b><p className="mt-1 text-xs text-slate-500">This does not directly overwrite the terminal record.</p></div><label className="block text-sm">Name / label<input required className={field+' mt-1 w-full'} value={name} onChange={e=>setName(e.target.value)}/></label>{selected.collection==='products'&&<label className="block text-sm">Price<input type="number" min="0" step="0.01" required className={field+' mt-1 w-full'} value={price} onChange={e=>setPrice(e.target.value)}/></label>}<button disabled={busy} className={primary}>{busy?'Submitting…':'Submit change request'}</button></form>}
      <details className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-400">Technical data</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-500">{JSON.stringify(selected.data,null,2)}</pre></details>
    </div></Drawer>}
  </div>;
};

const DashboardMetric=({icon,label,value,detail,valueClass=''}:{icon:React.ReactNode;label:string;value:string;detail:string;valueClass?:string})=><div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{label}</div><div className={`mt-2 text-xl font-black ${valueClass}`}>{value}</div><div className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</div></div>;
