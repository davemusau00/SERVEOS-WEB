import React from 'react';
import type {BusinessRecord} from './session';

export function WebStockCountHistory({records}:{records:BusinessRecord[]}) {
  const counts=records.filter(record=>record.collection==='stockCounts'&&!record.archived)
    .sort((a,b)=>String(b.data.createdAt||'').localeCompare(String(a.data.createdAt||'')));
  const name=(collection:string,id:unknown)=>records.find(record=>record.collection===collection&&record.id===id)?.data.name;
  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
    <h3 className="font-bold">Recorded stock counts</h3>
    <p className="mt-1 text-xs text-slate-400">Review the quantities recorded when each count was confirmed. Selected counts cover only their listed items.</p>
    {!counts.length&&<p className="mt-3 text-sm text-slate-400">No recorded counts in this workspace.</p>}
    <div className="mt-3 space-y-2">{counts.map(record=>{
      const d=record.data;const rows=Array.isArray(d.rows)?d.rows as Record<string,unknown>[]:[];
      return <details key={record.id} className="rounded-lg border border-slate-800 p-3">
        <summary className="cursor-pointer text-sm">{d.scope==='SELECTED'?'Selected items':'Full location'} · {String(d.locationName||name('stockLocations',d.locationId)||d.locationId)} · {String(d.createdAt||'')} · {Number(d.itemCount||rows.length)} items</summary>
        <p className="my-3 text-sm text-slate-300">{String(d.reason||'Physical stock count')}</p>
        {rows.some(row=>row.identitySnapshotAvailable===false)&&<p className="mb-3 text-xs text-amber-200">Older count: item names shown from the current catalog where no historical name was captured. Historical units are unavailable for those rows.</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Stock item</th><th className="p-2">Expected</th><th className="p-2">Counted</th><th className="p-2">Variance</th><th className="p-2">Bottle state / method</th></tr></thead>
          <tbody>{rows.map(row=><tr key={String(row.stockItemId)} className="border-t border-slate-800"><td className="p-2">{String(row.name||name('stockItems',row.stockItemId)||row.stockItemId)} {String(row.baseUnit||'')}</td><td className="p-2">{Number(row.expectedQuantity).toLocaleString()}</td><td className="p-2">{Number(row.countedQuantity).toLocaleString()}</td><td className="p-2">{Number(row.variance).toLocaleString()}</td><td className="p-2">{row.countedSealedContainers!=null?`${Number(row.countedSealedContainers)} sealed + ${Number(row.countedOpenQuantity)} ml · `:''}{String(row.measurementMethod||'EXACT')}</td></tr>)}</tbody>
        </table></div>
        <p className="mt-3 break-all text-xs text-slate-500">Command: {String(d.sourceCommandId||record.id)}</p>
      </details>;
    })}</div>
  </section>;
}
