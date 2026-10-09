import React,{FormEvent,useState} from 'react';
import {operatorError} from '../operatorError';
import {createServOSInitialSetupClient} from '../apiClient';

const field='mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400';

export function InitialAdminStep({apiOrigin,onCreated,onCancel}:{apiOrigin:string;onCreated:(loginName:string)=>void;onCancel:()=>void}){
 const [businessName,setBusinessName]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [loginName,setLoginName]=useState('');
 const [setupSecret,setSetupSecret]=useState('');
 const [password,setPassword]=useState('');
 const [confirmation,setConfirmation]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();setError('');
  if(password.length<12){setError('Choose a password with at least 12 characters.');return}
  if(password!==confirmation){setError('The passwords do not match.');return}
  setBusy(true);
  try{
   await createServOSInitialSetupClient(apiOrigin).createInitialAdmin({
    businessId:crypto.randomUUID(),staffId:crypto.randomUUID(),businessName:businessName.trim(),
    displayName:displayName.trim(),loginName:loginName.trim(),password,
   },setupSecret);
   setSetupSecret('');setPassword('');setConfirmation('');onCreated(loginName.trim());
  }catch(cause){setError(operatorError(cause))}
  finally{setBusy(false)}
 };

 return <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-white">
  <form className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8" onSubmit={event=>void submit(event)}>
   <header><div className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-400">ServOS Web</div><h1 className="mt-2 text-3xl font-black">Create the first administrator</h1><p className="mt-2 text-sm text-slate-400">This one-time step creates the business owner account. You will sign in next to continue configuring the workspace.</p></header>
   <label className="block text-sm">Business name<input aria-label="Business name" required maxLength={200} autoComplete="organization" className={field} value={businessName} onChange={event=>setBusinessName(event.target.value)}/></label>
   <label className="block text-sm">Administrator name<input aria-label="Administrator name" required maxLength={200} autoComplete="name" className={field} value={displayName} onChange={event=>setDisplayName(event.target.value)}/></label>
   <label className="block text-sm">Login name<input aria-label="Login name" required maxLength={200} autoComplete="username" className={field} value={loginName} onChange={event=>setLoginName(event.target.value)}/></label>
   <label className="block text-sm">One-time setup key<input aria-label="One-time setup key" required autoComplete="off" spellCheck={false} className={field} value={setupSecret} onChange={event=>setSetupSecret(event.target.value)}/><span className="mt-1 block text-xs text-slate-400">Use the one-time key provided for this local installation. It is sent only to the setup API and is not saved in this browser.</span></label>
   <fieldset className="space-y-3 rounded-xl border border-slate-700 p-4"><legend className="px-1 text-sm font-semibold">Create your password</legend><p className="text-xs text-slate-400">Use at least 12 characters. Choose a unique password that you can enter again at sign in.</p>
    <label className="block text-sm">Password<input aria-label="Administrator password" required type="password" minLength={12} autoComplete="new-password" className={field} value={password} onChange={event=>setPassword(event.target.value)}/></label>
    <label className="block text-sm">Confirm password<input aria-label="Confirm administrator password" required type="password" minLength={12} autoComplete="new-password" className={field} value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>
   </fieldset>
   {error&&<p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
   <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40" onClick={onCancel}>Back to sign in</button><button type="submit" disabled={busy} className="flex-1 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40">{busy?'Creating administrator…':'Create administrator'}</button></div>
  </form>
 </main>;
}
