import React, { useEffect, useState } from 'react';
import { useRuntime } from '../runtime/RuntimeProvider';
import { PRINTER_CANCEL_REASON_MAX, type PrinterJobResult, type PrinterJobSelection } from '../types/runtime';
import { ActionDialog } from './ActionDialog';
import { buttonClass, fieldClass, primaryButtonClass } from './records';

export function PrinterCancellationDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const runtime = useRuntime();
  const [jobs, setJobs] = useState<PrinterJobResult[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const eligible = jobs.filter(job => job.jobId && job.updatedAt && ['QUEUED', 'DELIVERY_UNCERTAIN'].includes(job.state));
  const resetReview = () => { setSelected([]); setAcknowledged(false); setConfirm(false); };
  const load = async () => {
    setLoaded(false); resetReview();
    try { setJobs(await runtime.printerJobs()); setLoaded(true); }
    catch (error) { setJobs([]); throw error; }
  };
  useEffect(() => { void load().catch(error => setMessage(`Queue refresh failed: ${String(error)}`)); }, []);
  const refresh = async () => {
    setBusy(true); setMessage('');
    try { await load(); } catch (error) { setMessage(`Queue refresh failed: ${String(error)}`); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (busy || !confirm || !acknowledged || !selected.length || !loaded) return;
    setBusy(true); setMessage('');
    const selections = eligible.filter(job => selected.includes(job.jobId!)).map(job => ({ jobId: job.jobId!, state: job.state, updatedAt: job.updatedAt! })) as PrinterJobSelection[];
    try {
      const result = await runtime.cancelPrinterJobs(reason.trim(), selections);
      resetReview(); setReason('');
      setMessage(`${result.count} obsolete print job(s) cancelled. Refresh Business Admin acceptance counts.`);
      try { await load(); await onChanged(); }
      catch (error) { setMessage(`${result.count} job(s) cancelled, but queue refresh failed: ${String(error)}. Refresh before another review.`); }
    } catch (error) {
      setMessage(`${String(error)}. Review and confirm a fresh selection.`);
      try { await load(); await onChanged(); }
      catch (refreshError) { setMessage(`${String(error)}. Queue refresh also failed: ${String(refreshError)}`); }
    } finally { setBusy(false); }
  };
  const validReason = reason.trim().length > 0 && Array.from(reason.trim()).length <= PRINTER_CANCEL_REASON_MAX;
  return <ActionDialog title="Clear obsolete print jobs" onClose={onClose} busy={busy} footer={<>
    <button type="button" className={buttonClass} disabled={busy} onClick={() => void refresh()}>Refresh queue</button>
    <button type="button" className={primaryButtonClass} disabled={busy || !loaded || !selected.length || !validReason || !acknowledged} onClick={() => confirm ? void save() : setConfirm(true)}>{busy ? 'Saving…' : confirm ? `Confirm cancellation of ${selected.length} job(s)` : `Review cancellation (${selected.length})`}</button>
  </>}>
    <p className="text-sm text-amber-200">Cancellation stops further ServOS send attempts. An uncertain job may already have printed; cancellation cannot retract a Windows spooler job.</p>
    <p className="mt-2 text-sm">If a customer still needs a receipt, retain the job or reprint from receipt history using the working printer configuration. Retry uses the original saved printer profile.</p>
    <p className="mt-2 text-sm text-slate-400">Up to 50 jobs are displayed. Additional jobs may need another refreshed batch. This does not complete physical printer acceptance or close a till.</p>
    {message && <p className="my-3 break-words text-sm text-amber-200" role="status">{message}</p>}
    <fieldset disabled={busy || !loaded} className="mt-4 space-y-3">
      <legend className="font-bold">Select obsolete jobs</legend>
      <button type="button" className={buttonClass} onClick={() => { setSelected(eligible.map(job => job.jobId!)); setConfirm(false); }}>Select all displayed eligible jobs</button>
      {loaded && !jobs.length && <p>No unresolved print jobs.</p>}
      {jobs.map(job => <label key={job.jobId} className="flex items-start gap-3 rounded-lg bg-slate-950 p-3 text-sm">
        <input type="checkbox" className="mt-1" disabled={!eligible.includes(job)} checked={selected.includes(job.jobId!)} onChange={event => { setSelected(previous => event.target.checked ? [...previous, job.jobId!] : previous.filter(id => id !== job.jobId)); setConfirm(false); }} />
        <span className="min-w-0 break-words"><b>{job.orderId === 'PRINTER_TEST' ? 'Printer test' : `Order ${job.orderId}`}: {job.state}</b><span className="block text-xs text-slate-400">Updated: {job.updatedAt} · Created: {job.createdAt}</span><span className="block">{job.message}</span></span>
      </label>)}
      <label className="block">Cancellation reason (1–500 characters)<textarea className={fieldClass + ' mt-1'} value={reason} maxLength={PRINTER_CANCEL_REASON_MAX * 2} onChange={event => { setReason(event.target.value); setConfirm(false); }} /></label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={acknowledged} onChange={event => { setAcknowledged(event.target.checked); setConfirm(false); }} /><span>I understand uncertain jobs may already have printed and these selected jobs will receive no further ServOS send attempts.</span></label>
    </fieldset>
    {confirm && <p className="mt-4 font-bold text-amber-200" role="status">Confirm cancellation of {selected.length} reviewed job(s) with reason: {reason.trim()}</p>}
  </ActionDialog>;
}
