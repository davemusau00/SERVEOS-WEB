import React, { useState, useEffect } from 'react';
import { isNative } from '../../runtime/RuntimeProvider';
import { NativeQueuePanel } from '../../runtime/NativeQueuePanel';
import { useServOS } from '../../context/ServOSContext';
import { 
  Database, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ArrowRight, 
  Trash2, 
  X, 
  ShieldCheck, 
  Layers, 
  HardDrive,
  FileText,
  Activity,
  Receipt,
  Utensils,
  Play
} from 'lucide-react';
import { OfflineOperation } from '../../types/servos';
import { 
  getOfflineOperations, 
  deleteOfflineOperation, 
  clearAllOfflineOperations, 
  getSyncLogs 
} from '../../utils/offlineDb';

interface OfflineQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineQueueModal: React.FC<OfflineQueueModalProps> = ({ isOpen, onClose }) => {
  const { 
    isOffline, 
    toggleOfflineMode, 
    syncOfflineQueue, 
    offlineQueueCount 
  } = useServOS();

  const [queuedOps, setQueuedOps] = useState<OfflineOperation[]>([]);
  const [syncLogs, setSyncLogs] = useState<Array<{
    id: string;
    message: string;
    type: 'info' | 'success' | 'error';
    syncedCount: number;
    timestamp: string;
  }>>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'QUEUE' | 'LOGS'>('QUEUE');

  const loadData = async () => {
    try {
      const ops = await getOfflineOperations();
      setQueuedOps(ops);
      const logs = await getSyncLogs(15);
      setSyncLogs(logs);
    } catch (err) {
      console.error('Failed to read IndexedDB operations:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, offlineQueueCount, isOffline]);

  if (!isOpen) return null;
  if (isNative) return <NativeQueuePanel onClose={onClose} />;

  const handleManualSync = async () => {
    setIsSyncing(true);
    await syncOfflineQueue();
    await loadData();
    setIsSyncing(false);
  };

  const handleDeleteOp = async (id: string) => {
    await deleteOfflineOperation(id);
    await loadData();
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all pending offline transactions?')) {
      await clearAllOfflineOperations();
      await loadData();
    }
  };

  const getOpIcon = (type: string) => {
    switch (type) {
      case 'PAYMENT_PROCESS':
      case 'ORDER_CREATE':
        return Receipt;
      case 'KDS_BUMP':
        return Utensils;
      default:
        return Activity;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl p-4 sm:p-6 max-w-3xl w-full shadow-2xl max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">IndexedDB Offline Queue & Sync Engine</h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                  isOffline
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isOffline ? 'OFFLINE (IDB ACTIVE)' : 'ONLINE (READY TO SYNC)'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Local transaction buffering, immutable journal staging & automated cloud replay
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('QUEUE')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'QUEUE'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Pending Queue ({queuedOps.filter(o => o.status === 'PENDING').length})</span>
            </button>

            <button
              onClick={() => setActiveTab('LOGS')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'LOGS'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Sync Audit Logs</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleOfflineMode}
              className={`px-2.5 py-1.5 rounded-lg font-mono font-semibold border flex items-center gap-1.5 transition-colors ${
                isOffline 
                  ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/60' 
                  : 'bg-rose-950/50 border-rose-600/50 text-rose-300 hover:bg-rose-900/50'
              }`}
            >
              {isOffline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isOffline ? 'Go Online' : 'Simulate Outage'}</span>
            </button>

            <button
              onClick={handleManualSync}
              disabled={isSyncing || queuedOps.filter(o => o.status === 'PENDING').length === 0}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Queue Now'}</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="py-4 space-y-3 overflow-y-auto flex-1">
          {activeTab === 'QUEUE' ? (
            queuedOps.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-semibold text-slate-200">IndexedDB Queue is Clean</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  All transactions and POS orders have been posted to the central General Ledger and eTIMS fiscal servers.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {queuedOps.map(op => {
                  const Icon = getOpIcon(op.operationType);
                  return (
                    <div
                      key={op.id}
                      className="p-3 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-white">
                              {op.summary}
                            </span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                              op.status === 'PENDING' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                              op.status === 'SYNCED' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                              'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            }`}>
                              {op.status}
                            </span>
                            {op.amount && (
                              <span className="text-xs font-mono font-bold text-amber-300 ml-auto">
                                KES {op.amount.toLocaleString()}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] font-mono text-slate-400 mt-1 flex items-center gap-3">
                            <span>Time: {new Date(op.occurredAt).toLocaleTimeString()}</span>
                            <span>• Cashier: {op.employeeName}</span>
                            <span>• Terminal: {op.terminalName}</span>
                          </div>

                          {op.payload && (
                            <div className="mt-1 text-[10px] font-mono text-slate-500 bg-slate-900/80 p-1.5 rounded border border-slate-800/80 truncate">
                              Payload: {JSON.stringify(op.payload)}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteOp(op.id)}
                        title="Delete from local queue"
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="space-y-2">
              {syncLogs.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs font-mono">
                  No sync audit logs recorded yet.
                </div>
              ) : (
                syncLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 font-mono text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${log.type === 'success' ? 'text-emerald-400' : 'text-amber-400'}`} />
                      <span className="text-slate-300">{log.message}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer info & Controls */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-amber-400" />
            <span>Store: IndexedDB (ServOS_Offline_Store v1)</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {queuedOps.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 text-slate-400 hover:text-rose-400 text-xs transition-colors"
              >
                Clear Queue
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors w-full sm:w-auto"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
