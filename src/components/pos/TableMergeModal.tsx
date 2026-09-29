import React, { useState } from 'react';
import { isNative, useRuntime } from '../../runtime/RuntimeProvider';
import { useServOS } from '../../context/ServOSContext';
import { 
  GitMerge, 
  ArrowRight, 
  CheckCircle2, 
  X, 
  Wine, 
  DollarSign, 
  Layers 
} from 'lucide-react';

interface TableMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTableId?: string;
}

export const TableMergeModal: React.FC<TableMergeModalProps> = ({
  isOpen,
  onClose,
  currentTableId
}) => {
  const { tables, showToast } = useServOS();
  const runtime = useRuntime();
  const [busy, setBusy] = useState(false);
  const [sourceTableId, setSourceTableId] = useState<string>(currentTableId || (tables[0]?.id || 'tbl-1'));
  const [targetTableId, setTargetTableId] = useState<string>(tables[1]?.id || 'tbl-2');

  if (!isOpen) return null;

  const handleMergeTables = async () => {
    if (sourceTableId === targetTableId) {
      showToast('Source and target tables must be different', 'error');
      return;
    }

    const srcTable = tables.find(t => t.id === sourceTableId);
    const tgtTable = tables.find(t => t.id === targetTableId);
    const src = srcTable ? srcTable.label : 'Source Table';
    const tgt = tgtTable ? tgtTable.label : 'Target Table';

    if (!isNative || !srcTable?.currentOrderId || !tgtTable?.currentOrderId) {
      showToast('Merging requires two persisted open orders in the installed application.', 'error'); return;
    }
    setBusy(true);
    try { await runtime.command('order.merge', { orderId: srcTable.currentOrderId, targetTableId }); showToast(`Merged ${src} into ${tgt}; saved locally.`, 'success'); onClose(); }
    catch (e) {showToast(String(e), 'error');} finally {setBusy(false);}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <GitMerge className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Merge Tables & Checks</h3>
              <p className="text-xs text-slate-400 font-mono">Combine two open orders into one bill</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 font-mono text-xs">
          {/* Source Table */}
          <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl space-y-1">
            <label className="text-slate-400 block">Source Table (To Close & Move):</label>
            <select
              value={sourceTableId}
              onChange={e => setSourceTableId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-amber-300 font-bold rounded-lg p-2 focus:outline-none"
            >
              {tables.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.section}) - {t.state}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center text-purple-400">
            <ArrowRight className="w-5 h-5 rotate-90 sm:rotate-0" />
          </div>

          {/* Target Table */}
          <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl space-y-1">
            <label className="text-slate-400 block">Target Primary Table (To Receive Items):</label>
            <select
              value={targetTableId}
              onChange={e => setTargetTableId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-emerald-400 font-bold rounded-lg p-2 focus:outline-none"
            >
              {tables.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.section}) - {t.state}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleMergeTables}
            disabled={busy}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors font-mono"
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Confirm Check Merge</span>
          </button>
        </div>
      </div>
    </div>
  );
};
