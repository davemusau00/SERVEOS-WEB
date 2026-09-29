import React, { useMemo, useState } from 'react';
import type { ImportTemplateKey, StageImportInput } from '../types/imports';
import { IMPORT_TEMPLATES } from './importTemplates';
import { mappedCsv, parseDelimited, suggestMapping } from './importMapping';
import { buttonClass, fieldClass, primaryButtonClass } from './records';

const required: Partial<Record<ImportTemplateKey, string[]>> = {
  products: ['external_id', 'code', 'name', 'selling_price'],
  inventory: ['external_id', 'stock_item_external_id', 'stock_item_name', 'base_unit', 'location_external_id', 'opening_quantity'],
  rooms: ['external_id', 'room_number', 'room_type_external_id', 'initial_status'],
  assets: ['external_id', 'asset_tag', 'name', 'category_external_id', 'status'],
};
const labels: Record<string, string> = { products: 'Products', inventory: 'Stock / opening inventory', rooms: 'Rooms', assets: 'Property / assets' };
export function FriendlyImport({ live, busy, onStage }: { live: boolean; busy: boolean; onStage: (input: StageImportInput) => Promise<void> }) {
  const [key, setKey] = useState<ImportTemplateKey>('products');
  const [source, setSource] = useState('');
  const [delimiter, setDelimiter] = useState<',' | '\t'>('\t');
  const [filename, setFilename] = useState('pasted-from-excel.csv');
  const [mapping, setMapping] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  const template = IMPORT_TEMPLATES.find(item => item.key === key)!;
  const parsed = useMemo(() => { try { return { rows: source ? parseDelimited(source, delimiter) : [], error: '' }; } catch (cause) { return { rows: [], error: String(cause) }; } }, [source, delimiter]);
  const effective = mapping || suggestMapping(parsed.rows[0] || [], template.headers);
  const requiredFields = required[key] || [];
  const missing = requiredFields.filter(field => effective[field] === undefined || effective[field] < 0);
  const data = parsed.rows.slice(1);
  const ids = data.map(row => row[effective.external_id]?.trim()).filter(Boolean);
  const duplicateCount = ids.length - new Set(ids).size;
  const emptyCount = data.filter(row => requiredFields.some(field => !row[effective[field]]?.trim())).length;
  const valid = data.length > 0 && missing.length === 0 && duplicateCount === 0 && emptyCount === 0 && !parsed.error && !(live && key === 'inventory');
  return <section className="mt-5 space-y-4 rounded-2xl border border-amber-500/30 bg-slate-900 p-4">
    <h2 className="text-lg font-bold">What do you have?</h2>
    <div className="flex flex-wrap gap-2">{Object.entries(labels).map(([value, label]) => <button key={value} className={key === value ? primaryButtonClass : buttonClass} disabled={busy} onClick={() => { setKey(value as ImportTemplateKey); setMapping(null); }}>{label}</button>)}</div>
    {live && key === 'inventory' && <p role="alert" className="text-sm text-amber-200">Opening inventory cannot be imported into a LIVE business. Use Count stock or Receive Delivery for current quantities.</p>}
    <div className="flex flex-wrap items-center gap-3"><label className={buttonClass}>Upload CSV<input aria-label="Upload CSV for mapping" className="ml-2 max-w-full text-xs" type="file" accept=".csv,text/csv" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; setError(''); if (file.size > 5_000_000 || !file.name.toLowerCase().endsWith('.csv')) { setError('Choose a CSV file smaller than 5 MB. XLSX is not supported.'); return; } setSource(await file.text()); setDelimiter(','); setFilename(file.name); setMapping(null); }} /></label><span className="text-xs text-slate-400">Or paste a header row and cells copied from Excel. XLSX files are outside this release.</span></div>
    <label className="block text-sm">Paste from Excel<textarea aria-label="Paste from Excel" className={fieldClass + ' mt-1 min-h-28 font-mono'} value={source} onChange={event => { setSource(event.target.value); setDelimiter('\t'); setFilename('pasted-from-excel.csv'); setMapping(null); }} /></label>
    <label className="block text-xs">Source separator<select className={fieldClass} value={delimiter} onChange={event => { setDelimiter(event.target.value as ',' | '\t'); setMapping(null); }}><option value={'\t'}>Tabs (Excel paste)</option><option value=",">Commas (CSV)</option></select></label>
    {(error || parsed.error) && <p role="alert" className="text-sm text-rose-300">{error || parsed.error}</p>}
    {data.length > 0 && <><h3 className="font-semibold">Match your columns</h3><p className="text-xs text-slate-400">Required fields have *. External IDs identify source records; existing-record decisions and dependencies must be reviewed in the native dry run.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{template.headers.map(target => <label key={target} className="text-xs">{target.replace(/_/g, ' ')}{requiredFields.includes(target) ? ' *' : ''}<select className={fieldClass} value={effective[target] ?? -1} onChange={event => setMapping({ ...effective, [target]: Number(event.target.value) })}><option value={-1}>Not supplied</option>{parsed.rows[0].map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>)}</div>
      <p className="text-sm">{data.length} rows · {duplicateCount} duplicate external IDs · {emptyCount} rows missing required values{missing.length ? ` · Map: ${missing.join(', ')}` : ''}</p>
      <div className="max-h-64 overflow-auto"><table className="text-left text-xs"><thead><tr>{template.headers.filter(header => effective[header] >= 0).map(header => <th className="p-2" key={header}>{header.replace(/_/g, ' ')}</th>)}</tr></thead><tbody>{data.slice(0, 20).map((row, index) => <tr key={index}>{template.headers.filter(header => effective[header] >= 0).map(header => <td className="border-t border-slate-700 p-2" key={header}>{row[effective[header]]}</td>)}</tr>)}</tbody></table></div>
      <p className="text-xs text-slate-400">Preview shows up to 20 rows. Next, validate all rows and review unresolved dependencies and proposed updates. Nothing is applied automatically.</p>
      <button className={primaryButtonClass} disabled={busy || !valid} onClick={() => void onStage({ templateKey: key, fileName: filename, csvText: mappedCsv(parsed.rows, template.headers, effective) }).catch(cause => setError(String(cause)))}>{busy ? 'Validating…' : 'Validate mapped data'}</button>
    </>}
  </section>;
}

