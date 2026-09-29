import React, { useEffect, useRef, useState } from 'react';

export type AccountLink = { type: 'invite' | 'recovery'; tokenHash?: string; accessToken?: string };
export function takeAccountLink(): AccountLink | null {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const type = query.get('type') || fragment.get('type');
  const tokenHash = query.get('token_hash') || undefined;
  const accessToken = fragment.get('access_token') || undefined;
  if (!['invite', 'recovery'].includes(type || '') || (!tokenHash && !accessToken)) return null;
  return { type: type as AccountLink['type'], tokenHash, accessToken };
}
export async function remoteAuthCall(url: string, key: string, path: string, body?: unknown, token?: string, method = 'POST') {
  const response = await fetch(`${url}/auth/v1/${path}`, { method, headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Account request failed (${response.status}). The link may have expired; request a new one or contact the owner.`);
  const content = await response.text();
  return content ? JSON.parse(content) : null;
}

export function RemoteAccountAccess({ url, publishableKey, link, onDone }: { url: string; publishableKey: string; link: AccountLink; onDone: () => void }) {
  const token = useRef(link.accessToken || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const verify = async () => {
    setBusy(true); setError('');
    try {
      if (!token.current) { const session = await remoteAuthCall(url, publishableKey, 'verify', { token_hash: link.tokenHash, type: link.type }); token.current = session.access_token; }
      const user = await remoteAuthCall(url, publishableKey, 'user', undefined, token.current, 'GET');
      setEmail(user.email || '');
      if (!user.email) throw new Error('Account identity could not be verified.');
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  useEffect(() => { window.history.replaceState(null, '', window.location.pathname); }, []);
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-white"><form className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6" onSubmit={async event => {
    event.preventDefault(); if (busy || password !== repeat || password.length < 12) return;
    setBusy(true); setError('');
    try { await remoteAuthCall(url, publishableKey, 'user', { password }, token.current, 'PUT'); await remoteAuthCall(url, publishableKey, 'logout?scope=global', undefined, token.current); token.current = ''; setPassword(''); setRepeat(''); setComplete(true); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }}>
    <h1 className="text-xl font-bold">{link.type === 'invite' ? 'Accept ServOS invitation' : 'Reset your password'}</h1>
    {complete ? <><p>Password saved. Sign in with your individual account. The owner must also assign Remote Manager membership.</p><button type="button" className="rounded-lg bg-amber-400 p-3 text-slate-950" onClick={onDone}>Return to sign in</button></> : !email ? <><p className="text-sm text-slate-300">Continue to verify this one-time account link.</p><button type="button" disabled={busy} className="rounded-lg bg-amber-400 p-3 text-slate-950" onClick={() => void verify()}>{busy ? 'Verifying…' : 'Continue'}</button></> : <><p className="break-all text-sm">Set a password for <b>{email}</b>.</p><label className="block text-sm">New password<input className="mt-1 w-full rounded-lg bg-slate-950 p-3" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} /></label><label className="block text-sm">Confirm password<input className="mt-1 w-full rounded-lg bg-slate-950 p-3" type="password" autoComplete="new-password" required value={repeat} onChange={event => setRepeat(event.target.value)} /></label><button disabled={busy || password.length < 12 || password !== repeat} className="rounded-lg bg-amber-400 p-3 text-slate-950 disabled:opacity-40">{busy ? 'Saving…' : 'Save password'}</button></>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
  </form></main>;
}
