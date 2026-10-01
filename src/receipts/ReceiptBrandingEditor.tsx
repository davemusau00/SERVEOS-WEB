import React, { useState } from 'react';
import { DEFAULT_APP_EMBLEM, DEFAULT_RECEIPT_LOGO, loadDefaultBrandingImage, prepareBrandingImage, prepareMpesaTillQr, type PreparedBrandingImage, type PreparedTillQr } from './branding';

export function ReceiptBrandingEditor({ appEmblem, receiptLogo, tillQr, onAppEmblemChange, onReceiptLogoChange, onTillQrChange, disabled = false }: {
  appEmblem: string;
  receiptLogo: PreparedBrandingImage | null;
  tillQr: PreparedTillQr | null;
  onAppEmblemChange: (dataUrl: string) => void;
  onReceiptLogoChange: (image: PreparedBrandingImage | null) => void;
  onTillQrChange: (qr: PreparedTillQr | null) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<'app' | 'receipt' | 'qr' | null>(null);
  const [error, setError] = useState('');
  const [qrEnabled, setQrEnabled] = useState(tillQr?.enabled ?? false);
  const process = async (kind: 'app' | 'receipt' | 'qr', file?: File) => {
    setBusy(kind); setError('');
    try {
      if (kind === 'qr') { const prepared = file ? await prepareMpesaTillQr(file, { label: tillQr?.label, tillNumber: tillQr?.tillNumber }) : null; if (prepared) { prepared.enabled = tillQr?.enabled ?? true; setQrEnabled(prepared.enabled); } onTillQrChange(prepared); return; }
      const prepared = file ? await prepareBrandingImage(file) : await loadDefaultBrandingImage(kind === 'app' ? DEFAULT_APP_EMBLEM : DEFAULT_RECEIPT_LOGO);
      if (kind === 'app') onAppEmblemChange(prepared.dataUrl);
      else onReceiptLogoChange(prepared);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Logo could not be prepared.'); }
    finally { setBusy(null); }
  };
  const imageInput = (kind: 'app' | 'receipt' | 'qr', label: string) => <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold has-[:disabled]:opacity-40">
    {busy === kind ? 'Preparing…' : `Replace ${label}`}
    <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy !== null} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void process(kind, file); }} />
  </label>;
  return <div className="space-y-4 rounded-xl border border-slate-700 p-3">
    <h3 className="font-bold">Business branding</h3>
    <p className="text-xs text-slate-400">Images are decoded, composited onto white, resized, and saved with the business settings. Receipt documents keep the logo version captured when payment was recorded.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">App emblem</h4>
        <div className="grid h-28 place-items-center rounded-lg bg-white p-3">{appEmblem?<img className="max-h-full max-w-full object-contain" src={appEmblem} alt="Business app emblem preview" />:<span className="text-xs text-slate-700">No business emblem · ServOS identity remains unchanged</span>}</div>
        <div className="flex flex-wrap gap-2">{imageInput('app', 'emblem')}<button type="button" disabled={disabled || busy !== null} className="rounded-lg border border-slate-600 px-3 py-2 text-sm" onClick={() => void process('app')}>Use supplied default</button><button type="button" disabled={disabled||busy!==null||!appEmblem} className="rounded-lg border border-slate-600 px-3 py-2 text-sm" onClick={()=>onAppEmblemChange('')}>Remove custom emblem</button></div>
      </section>
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Receipt logo · customer copy</h4>
        <div className="grid h-28 place-items-center rounded-lg bg-white p-3">{receiptLogo?<img className="max-h-full max-w-full object-contain" src={receiptLogo.dataUrl} alt="Receipt logo preview" />:<span className="text-xs text-slate-700">No receipt logo · printed output uses an explicit text-only fallback</span>}</div>
        <div className="flex flex-wrap gap-2">{imageInput('receipt', 'receipt logo')}<button type="button" disabled={disabled || busy !== null} className="rounded-lg border border-slate-600 px-3 py-2 text-sm" onClick={() => void process('receipt')}>Use supplied default</button><button type="button" disabled={disabled||busy!==null||!receiptLogo} className="rounded-lg border border-slate-600 px-3 py-2 text-sm" onClick={()=>onReceiptLogoChange(null)}>Remove custom receipt logo</button></div>
      </section>
    </div>
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">M-Pesa Till QR · customer copy</h4>
      <div className="grid h-40 place-items-center rounded-lg bg-white p-3">{tillQr?<img className="max-h-full max-w-full object-contain" src={tillQr.dataUrl} alt="M-Pesa Till QR preview"/>:<span className="text-xs text-slate-700">No Till QR · receipts print without a payment QR</span>}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={qrEnabled} disabled={disabled||busy!==null||!tillQr} onChange={event=>{setQrEnabled(event.target.checked);onTillQrChange(tillQr?{...tillQr,enabled:event.target.checked}:null);}}/> Show on customer receipt</label>
      <div className="flex flex-wrap gap-2">{imageInput('qr','Till QR')}<button type="button" disabled={disabled||busy!==null||!tillQr} className="rounded-lg border border-slate-600 px-3 py-2 text-sm" onClick={()=>{onTillQrChange(tillQr?{...tillQr,enabled:qrEnabled}:null);setQrEnabled(false);}}>Remove Till QR</button></div>
      <p className="text-xs text-slate-400">Upload the QR image supplied by your M-Pesa Till provider. ServOS never generates a Safaricom payload from a Till number. The QR is a payment convenience only and is not proof that M-Pesa funds were received. It appears on the customer copy below the thank-you message and above the KINGSFORGE footer; it is never printed on the business record copy.</p>
    </section>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
  </div>;
}
