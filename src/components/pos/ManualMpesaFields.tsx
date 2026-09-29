import React from 'react';
import type { ManualMpesaInput } from '../../types/runtime';

export const ManualMpesaFields = ({ value, onChange }: { value: ManualMpesaInput; onChange: (value: ManualMpesaInput) => void }) => {
  const field = 'block w-full bg-slate-950 border border-slate-700 rounded p-2 text-white mt-1';
  const date = new Date(value.receivedAt);
  const localDate = Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '';
  return <fieldset className="space-y-3 text-xs"><legend className="font-bold mb-2">Business M-Pesa receipt</legend><label className="block">Transaction code<input required autoComplete="off" className={field} value={value.code} onChange={e => onChange({ ...value, code: e.target.value.toUpperCase() })} /></label><label className="block">Receiving till / paybill account<input required className={field} value={value.account} onChange={e => onChange({ ...value, account: e.target.value })} /></label><label className="block">Amount on receipt (KES)<input required type="number" min="0.01" step="0.01" className={field} value={value.receivedAmount} onChange={e => onChange({ ...value, receivedAmount: Number(e.target.value) })} /></label><label className="block">Receipt time<input required type="datetime-local" className={field} value={localDate} onChange={e => onChange({ ...value, receivedAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></label><label className="flex gap-2"><input type="checkbox" checked={value.confirmed} onChange={e => onChange({ ...value, confirmed: e.target.checked })} />I checked the business receipt and confirmed the code and amount.</label></fieldset>;
};
