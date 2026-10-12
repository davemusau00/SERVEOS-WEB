import React from 'react';
import type {BusinessRecord} from './session';
import {inventoryName,inventoryQuantity,inventoryWhen} from './inventoryPresentation';

export function WebStockCountHistory({records,timeZone='Africa/Nairobi',showTechnicalDetails=false}:{records:BusinessRecord[];timeZone?:string;showTechnicalDetails?:boolean}) {
  const counts=records.filter(record=>record.collection==='stockCounts'&&!record.archived)
    .sort((a,b)=>String(b.data.createdAt||'').localeCompare(String(a.data.createdAt||'')));
  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
    <h3 className="font-bold">Recorded stock counts</h3>
    <p className="mt-1 text-xs text-slate-400">These are server-recorded counts. Review the captured quantities and units; selected counts cover only their listed items. Variances from different units are never added together.</p>
    {!counts.length&&<p className="mt-3 text-sm text-slate-400">No recorded counts in this workspace.</p>}
    <div className="mt-3 space-y-2">{counts.map(record=>{
      const d=record.data;const rows=Array.isArray(d.rows)?d.rows as Record<string,unknown>[]:[];
      const changed=rows.filter(row=>row.variance!==undefined&&row.variance!==null&&Number.isFinite(Number(row.variance))&&Number(row.variance)!==0).length;
      return <details key={record.id} className="rounded-lg border border-slate-800 p-3">
        <summary className="min-h-11 cursor-pointer text-sm">{d.scope==='SELECTED'?'Selected items':'Full location'} · {String(d.locationName||inventoryName(records,'stockLocations',d.locationId,'Storage place unavailable'))} · {inventoryWhen(d.createdAt,timeZone)} · {Number(d.itemCount||rows.length)} items · {changed} with variance</summary>
        <p className="my-3 text-sm text-slate-300">{String(d.reason||'Physical stock count')}</p>
        {rows.some(row=>row.identitySnapshotAvailable===false)&&<p className="mb-3 text-xs text-amber-200">Older count: item names shown from the current catalog where no historical name was captured. Historical units are unavailable for those rows.</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Stock item</th><th className="p-2">Expected</th><th className="p-2">Counted</th><th className="p-2">Variance</th><th className="p-2">Bottle state / method</th></tr></thead>
          <tbody>{rows.map(row=><tr key={String(row.stockItemId)} className="border-t border-slate-800"><td className="p-2">{String(row.name||inventoryName(records,'stockItems',row.stockItemId,'Stock item unavailable'))} {String(row.baseUnit||'')}</td><td className="p-2">{inventoryQuantity(row.expectedQuantity)}</td><td className="p-2">{inventoryQuantity(row.countedQuantity)}</td><td className={'p-2 '+(Number(row.variance)!==0?'font-semibold text-amber-200':'')}>{inventoryQuantity(row.variance)}</td><td className="p-2">{row.countedSealedContainers!=null?`${inventoryQuantity(row.countedSealedContainers)} sealed + ${inventoryQuantity(row.countedOpenQuantity)} ml · `:''}{String(row.measurementMethod||'EXACT')}</td></tr>)}</tbody>
        </table></div>
        {showTechnicalDetails&&<details className="mt-3 text-xs text-slate-500"><summary className="min-h-11 cursor-pointer">Technical evidence</summary><p className="break-all">Count ID: {record.id}</p><p className="break-all">Command: {String(d.sourceCommandId||'Unavailable')}</p></details>}
      </details>;
    })}</div>
  </section>;
}
