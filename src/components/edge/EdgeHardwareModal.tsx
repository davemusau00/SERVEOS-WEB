import React from 'react';

interface EdgeHardwareModalProps { isOpen: boolean; onClose: () => void }

export const EdgeHardwareModal = ({ isOpen, onClose }: EdgeHardwareModalProps) => {
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="hardware-title" className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-xl w-full max-h-[90vh] overflow-auto space-y-5">
      <header className="flex justify-between gap-4"><h2 id="hardware-title" className="text-xl font-bold">Devices and external services</h2><button autoFocus onClick={onClose} aria-label="Close device information">Close</button></header>
      <p>No device adapters have been configured or tested for this terminal.</p>
      <dl className="space-y-4 text-sm">
        <div><dt className="font-semibold">Receipts</dt><dd className="text-slate-300">Open an order receipt to preview, export, or request the operating system print dialog. Check the physical output before treating it as printed.</dd></div>
        <div><dt className="font-semibold">Cash drawer, card reader, scale and room keys</dt><dd className="text-slate-300">Direct device control is unavailable. Use the physical devices manually. Card payments require the actual terminal approval reference.</dd></div>
        <div><dt className="font-semibold">Fiscal submission</dt><dd className="text-slate-300">Receipts are internal records. No external tax submission or acknowledgement is performed.</dd></div>
        <div><dt className="font-semibold">M-Pesa</dt><dd className="text-slate-300">Check the receiving business account, enter the transaction code, and reconcile the receipt separately.</dd></div>
      </dl>
    </section>
  </div>;
};
