import React, { useState } from 'react';
import { DEFAULT_APP_EMBLEM, DEFAULT_RECEIPT_LOGO, loadDefaultBrandingImage, prepareBrandingImage, type PreparedBrandingImage } from './branding';

export function ReceiptBrandingEditor({ appEmblem, receiptLogo, onAppEmblemChange, onReceiptLogoChange, disabled = false }: {
  appEmblem: string;
  receiptLogo: PreparedBrandingImage | null;
  onAppEmblemChange: (dataUrl: string) => void;
  onReceiptLogoChange: (image: PreparedBrandingImage | null) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<'app' | 'receipt' | null>(null);
  const [error, setError] = useState('');
  const process = async (kind: 'app' | 'receipt', file?: File) => {
    setBusy(kind); setError('');
    try {
      const prepared = file ? await prepareBrandingImage(file) : await loadDefaultBrandingImage(kind === 'app' ? DEFAULT_APP_EMBLEM : DEFAULT_RECEIPT_LOGO);
      if (kind === 'app') onAppEmblemChange(prepared.dataUrl);
      else onReceiptLogoChange(prepared);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Logo could not be prepared.'); }
    finally { setBusy(null); }
  };
  const imageInput = (kind: 'app' | 'receipt', label: string) => <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold has-[:disabled]:opacity-40">
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
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
  </div>;
}
