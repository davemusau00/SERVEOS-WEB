import React, { useEffect, useState } from 'react';
import { Order } from '../../types/servos';
import type { ManualMpesaInput } from '../../types/runtime';
import { isNative, useRuntime } from '../../runtime/RuntimeProvider';
import { ManualMpesaFields } from './ManualMpesaFields';

interface Props { isOpen: boolean; order?: Order | null; totalAmount?: number; onClose: () => void; onCompleteSettlement?: (payments: { method: string; amount: number }[]) => void }
export const MixedTenderModal = ({ isOpen, order, totalAmount, onClose, onCompleteSettlement }: Props) => {
  const runtime = useRuntime();
  const due = order ? order.grandTotal - order.amountPaid : totalAmount || 0;
  const [cash, setCash] = useState(0); const [card, setCard] = useState(0); const [mpesa, setMpesa] = useState(0); const [cardCode, setCardCode] = useState('');
  const [receipt, setReceipt] = useState<ManualMpesaInput>({ code: '', account: '', receivedAmount: 0, receivedAt: new Date().toISOString(), confirmed: false });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (isOpen) { setCash(due); setCard(0); setMpesa(0); setCardCode(''); setError(''); setReceipt({ code: '', account: '', receivedAmount: 0, receivedAt: new Date().toISOString(), confirmed: false }); } }, [isOpen, order?.id]);
  if (!isOpen) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!isNative || !order) { setError('Payments require the installed business application.'); return; }
    if ([cash, card, mpesa].some(n => !Number.isFinite(n) || n < 0) || Math.round((cash + card + mpesa) * 100) !== Math.round(due * 100)) { setError('Allocate exactly the outstanding balance.'); return; }
    const payments = [cash > 0 ? { method: 'CASH', amount: cash, cashTendered: cash } : null, card > 0 ? { method: 'CARD', amount: card, cardAuthCode: cardCode } : null, mpesa > 0 ? { method: 'MPESA', amount: mpesa, mpesa: receipt } : null].filter(Boolean);
    setBusy(true);
    try { await runtime.command('payment.split', { orderId: order.id, payments }); onCompleteSettlement?.(payments as { method: string; amount: number }[]); onClose(); }
    catch(e) {setError(String(e));} finally {setBusy(false);}
  };
  const field = 'w-full bg-slate-950 border border-slate-700 rounded p-2';
  return <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4"><form role="dialog" aria-modal="true" aria-labelledby="split-title" onSubmit={submit} className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-auto space-y-3"><h2 id="split-title" className="font-bold text-xl">Split payment</h2><p>Outstanding: KES {due.toLocaleString()}</p>{[{ name: 'Cash', value: cash, set: setCash }, { name: 'Card', value: card, set: setCard }, { name: 'M-Pesa', value: mpesa, set: setMpesa }].map(f => <label key={f.name} className="block">{f.name}<input type="number" min="0" step="0.01" className={field} value={f.value} onChange={e => f.set(Number(e.target.value))} /></label>)}{card > 0 && <label className="block">Card approval code<input required className={field} value={cardCode} onChange={e => setCardCode(e.target.value)} /></label>}{mpesa > 0 && <ManualMpesaFields value={receipt} onChange={setReceipt} />}<p>Unallocated: KES {(due - cash - card - mpesa).toFixed(2)}</p>{error && <p role="alert" className="text-rose-300">{error}</p>}<div className="flex gap-3"><button disabled={busy} className="bg-amber-400 text-slate-950 rounded p-3">{busy ? 'Saving…' : 'Record payments'}</button><button disabled={busy} type="button" className="p-3" onClick={onClose}>Cancel</button></div></form></div>;
};
