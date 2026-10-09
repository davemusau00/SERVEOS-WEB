import {operatorError} from './operatorError';
import { FormEvent, lazy, Suspense, useEffect, useState } from 'react';
import { ApiHttpError } from './apiClient';
import {
  hasSavedApiSession,
  openApiBusinessStore,
  resumeApiDeviceSession,
  signInAndEnrollApiDevice,
  type ApiAuthenticatedDeviceSession,
} from './apiAuth';
import { BusinessStore } from './BusinessStore';

const WebBusinessApp=lazy(()=>import('./WebBusinessApp').then(module=>({default:module.WebBusinessApp})));

const field = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400';

export function WebAuthGate() {
  const apiOrigin = String(import.meta.env.VITE_API_URL || '').trim();
  const [session, setSession] = useState<ApiAuthenticatedDeviceSession | null>(null);
  const [store, setStore] = useState<BusinessStore | null>(null);
  const [resumePending, setResumePending] = useState(() => {
    try {
      return hasSavedApiSession(apiOrigin);
    } catch {
      return false;
    }
  });
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!resumePending || !apiOrigin) return;
    let active = true;
    setBusy(true);
    void (async () => {
      try {
        const resumed = await resumeApiDeviceSession({ apiOrigin });
        if (!resumed) return;
        const opened = await openApiBusinessStore(resumed);
        if (!active) {
          opened.close();
          await resumed.signOut().catch(() => undefined);
          return;
        }
        setSession(resumed);
        setStore(opened);
        setError('');
      } catch (cause) {
        if (active) setError(`Your saved ServOS session could not be restored. Sign in again. ${operatorError(cause)}`);
      } finally {
        if (active) {
          setResumePending(false);
          setBusy(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [apiOrigin, resumePending]);

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      await session?.signOut();
    } catch {
      setError('This browser is signed out. Server revocation could not be confirmed; the session remains subject to its expiry.');
    } finally {
      store?.close();
      setStore(null);
      setSession(null);
      setPassword('');
      setNewPassword('');
      setBusy(false);
    }
  };

  if (session && store) {
    return (
      <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-white"><p role="status" className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm text-slate-300">Opening your workspace…</p></main>}>
        <WebBusinessApp
          initialSession={{
            businessId: session.profile.businessId,
            actorId: session.profile.staffId,
            enabled: true,
            permissions: session.profile.permissions,
            policyVersion: 'api-catalog-v3',
            lifecycleStage: 'LIVE',
          }}
          apiAuth={session}
          apiStore={store}
          onSignOut={() => void signOut()}
        />
      </Suspense>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!apiOrigin) throw new Error('The ServOS API address is not configured for this web release.');
      const authenticated = await signInAndEnrollApiDevice({
        apiOrigin,
        loginName: loginName.trim(),
        password,
        newPassword: newPassword || undefined,
      });
      try {
        const opened = await openApiBusinessStore(authenticated);
        setSession(authenticated);
        setStore(opened);
        setPassword('');
        setNewPassword('');
      } catch (cause) {
        await authenticated.signOut().catch(() => undefined);
        throw cause;
      }
    } catch (cause) {
      setError(operatorError(cause));
    } finally {
      setBusy(false);
      setResumePending(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-white">
      <form className="w-full max-w-md space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8" onSubmit={submit}>
        <header>
          <div className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-400">ServOS Web</div>
          <h1 className="mt-2 text-3xl font-black">Sign in</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to your business workspace.</p>
        </header>
        <label className="block text-sm">
          Staff login
          <input aria-label="Staff login" required autoComplete="username" className={field} value={loginName} onChange={event => setLoginName(event.target.value)} />
        </label>
        <label className="block text-sm">
          Password
          <input required type="password" autoComplete="current-password" className={field} value={password} onChange={event => setPassword(event.target.value)} />
        </label>
        <label className="block text-sm">
          New password, if account setup requires it
          <input type="password" autoComplete="new-password" minLength={12} className={field} value={newPassword} onChange={event => setNewPassword(event.target.value)} />
        </label>
        {resumePending && <p role="status" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">Restoring your ServOS session…</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
        <button disabled={busy || resumePending} className="w-full rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40">
          {resumePending ? 'Restoring session…' : busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
