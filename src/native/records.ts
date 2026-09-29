import type { RuntimeSnapshot, StoredRecord } from '../types/runtime';

export const recordsOf = <T extends Record<string, any> = Record<string, any>>(snapshot: RuntimeSnapshot | null, collection: string): T[] =>
  snapshot?.records.filter(r => r.collection === collection && !r.archived).map(r => r.data as T) ?? [];

export const recordOf = (snapshot: RuntimeSnapshot | null, collection: string, id: string): StoredRecord | undefined =>
  snapshot?.records.find(r => r.collection === collection && r.id === id && !r.archived);

export const money = (value: unknown) => `KES ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const shortDate = (value: unknown) => value ? new Date(String(value)).toLocaleString() : '—';
export const fieldClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-400';
export const buttonClass = 'rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40';
export const primaryButtonClass = 'rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40';
