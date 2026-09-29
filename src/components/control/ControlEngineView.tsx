import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { ExecutiveAnalyticsDashboard } from './ExecutiveAnalyticsDashboard';
import { 
  ShieldAlert, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  ArrowRight, 
  Clock, 
  Layers, 
  Receipt, 
  Coins, 
  Package, 
  Scale, 
  QrCode,
  UserCheck,
  Check,
  X,
  BarChart3
} from 'lucide-react';

export const ControlEngineView: React.FC = () => {
  const {
    traceEvidence,
    anomalyAlerts,
    resolveAlert,
    approvalRequests,
    handleApproval
  } = useServOS();

  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'NORTHSTAR' | 'ALERTS' | 'APPROVALS'>('ANALYTICS');
  const [searchQuery, setSearchQuery] = useState<string>('ORD-9020');
  const [traceResult, setTraceResult] = useState<any>(() => traceEvidence('ORD-9020'));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const res = traceEvidence(searchQuery.trim());
    setTraceResult(res);
  };

  const openAlerts = anomalyAlerts.filter(a => a.status === 'OPEN');
  const pendingApprovals = approvalRequests.filter(a => a.status === 'PENDING');

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Control Engine & Executive Audit Hub</span>
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-400 font-mono mt-0.5 line-clamp-1">
            Recharts Multi-Stream Revenue, RevPAR Occupancy, Beverage Yield & Full-Life North Star Audit
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'ANALYTICS' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Executive Analytics</span>
          </button>
          <button
            onClick={() => setActiveTab('NORTHSTAR')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'NORTHSTAR' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            North Star Traceability
          </button>
          <button
            onClick={() => setActiveTab('ALERTS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'ALERTS' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Anomaly Alerts</span>
            {openAlerts.length > 0 && (
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                activeTab === 'ALERTS' ? 'bg-slate-950 text-amber-400' : 'bg-rose-500 text-white'
              }`}>
                {openAlerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('APPROVALS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'APPROVALS' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Manager Approvals</span>
            {pendingApprovals.length > 0 && (
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                activeTab === 'APPROVALS' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500 text-slate-950'
              }`}>
                {pendingApprovals.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content Area (Safe padding for bottom bar on mobile: pb-28 lg:pb-8) */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 lg:pb-8">
        {/* VIEW 0: Executive Analytics Dashboard (Recharts) */}
        {activeTab === 'ANALYTICS' && <ExecutiveAnalyticsDashboard />}
        {/* VIEW 1: The North Star Traceability Console (Section 29) */}
        {activeTab === 'NORTHSTAR' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Query: Order # (ORD-9020), Item (Jameson), Room (101)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow-sm whitespace-nowrap"
              >
                Trace Lifecycle
              </button>
            </form>

            {/* Traceability Graph Flow */}
            {traceResult && traceResult.type !== 'NONE' ? (
              <div className="space-y-4">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-bold">
                        Trace Result: {traceResult.type} MATCH FOUND
                      </span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        Lifecycle Audit Trail & Correlated Evidence
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded w-fit">
                      Auditable: 100% Deterministic
                    </span>
                  </div>
                </div>

                {/* Step 1: POS Order */}
                {traceResult.order && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400 font-mono mb-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[11px]">1</span>
                      <span>POS Order Inception</span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
                      <div className="flex justify-between text-slate-200">
                        <span className="font-bold">{traceResult.order.orderNumber} ({traceResult.order.tableName || traceResult.order.tabName})</span>
                        <span className="text-amber-300">KES {traceResult.order.grandTotal.toLocaleString()}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Server: {traceResult.order.serverName} · State: {traceResult.order.state} · Outlet: Main Bar Lounge
                      </div>
                      <div className="pt-1 text-[11px] text-slate-300">
                        Items: {traceResult.order.items.map((i: any) => `${i.quantity}x ${i.productName} (${i.portionName || 'Standard'})`).join(', ')}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Payment */}
                {traceResult.order?.payments && traceResult.order.payments.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 font-mono mb-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[11px]">2</span>
                      <span>Settlement & Fiscal Clearance</span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
                      {traceResult.order.payments.map((p: any) => (
                        <div key={p.id} className="flex justify-between items-center text-slate-200">
                          <div>
                            <span className="font-bold text-amber-400">{p.tenderType}</span>
                            <span className="text-slate-400 ml-2">Ref: {p.reference}</span>
                          </div>
                          <span className="font-bold">KES {p.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      {traceResult.order.etimsInvoiceNumber && (
                        <div className="text-emerald-400 text-[11px] pt-1">
                          ✓ eTIMS Fiscal Invoice: {traceResult.order.etimsInvoiceNumber}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: Stock Depletion */}
                {traceResult.stockMovements && traceResult.stockMovements.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-400 font-mono mb-2">
                      <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[11px]">3</span>
                      <span>Stock Depletions Logged</span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
                      {traceResult.stockMovements.map((m: any) => (
                        <div key={m.id} className="flex justify-between text-slate-300 text-[11px]">
                          <span>{m.stockItemId} ({m.movementType})</span>
                          <span className="text-rose-400">-{m.quantity} {m.unitSymbol || 'units'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4: General Ledger */}
                {traceResult.journalEntries && traceResult.journalEntries.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-purple-400 font-mono mb-2">
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[11px]">4</span>
                      <span>Double-Entry General Ledger</span>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-2">
                      {traceResult.journalEntries.map((j: any) => (
                        <div key={j.id} className="border-b border-slate-850 pb-1.5 last:border-0 last:pb-0">
                          <div className="font-bold text-slate-200">{j.entryNumber}: {j.memo}</div>
                          {j.lines.map((l: any) => (
                            <div key={l.id} className="flex justify-between text-[11px]">
                              <span className="text-slate-400">{l.accountCode} - {l.accountName}</span>
                              <span className="tabular-nums">
                                {l.debit > 0 ? `Dr. KES ${l.debit.toLocaleString()}` : `Cr. KES ${l.credit.toLocaleString()}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800 font-mono text-xs">
                No matching record found for query "{searchQuery}". Try searching "ORD-9020" or "Jameson" or "101".
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: Anomaly Alerts */}
        {activeTab === 'ALERTS' && (
          <div className="space-y-3.5 max-w-5xl mx-auto">
            {anomalyAlerts.map(alert => {
              const isOpen = alert.status === 'OPEN';
              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3.5 transition-all ${
                    isOpen ? 'bg-slate-900 border-rose-500/40 shadow-sm' : 'bg-slate-900/60 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                      alert.severity === 'CRITICAL' ? 'text-rose-500' :
                      alert.severity === 'HIGH' ? 'text-rose-400' : 'text-amber-400'
                    }`} />
                    <div className="min-w-0 flex-1">
                      {/* Responsive title row with wrap */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-white break-words">
                          {alert.title}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold shrink-0 ${
                          alert.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300' :
                          alert.severity === 'HIGH' ? 'bg-rose-500/20 text-rose-300' :
                          'bg-amber-500/20 text-amber-300'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {alert.ruleCode}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mt-1.5 break-words leading-relaxed">
                        {alert.description}
                      </p>

                      {/* Evidence block with proper wrap / scroll */}
                      <div className="text-[11px] font-mono text-slate-400 mt-2.5 bg-slate-950 p-2.5 rounded-lg border border-slate-800 break-all whitespace-pre-wrap overflow-x-auto max-h-40 leading-relaxed">
                        Evidence Details: {JSON.stringify(alert.evidence)}
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <button
                      onClick={() => resolveAlert(alert.id, 'Acknowledged and verified by manager on duty')}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 shrink-0 text-center transition-colors shadow-xs"
                    >
                      Acknowledge & Resolve
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 3: Manager Approval Queue */}
        {activeTab === 'APPROVALS' && (
          <div className="space-y-3.5 max-w-5xl mx-auto">
            {approvalRequests.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-mono text-xs">
                No approval requests in the pipeline.
              </div>
            ) : (
              approvalRequests.map(req => {
                const isPending = req.status === 'PENDING';
                return (
                  <div
                    key={req.id}
                    className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-white font-mono">{req.actionType}</span>
                        {req.amount !== undefined && (
                          <span className="text-xs text-amber-400 font-mono font-bold">
                            Amount: KES {req.amount.toLocaleString()}
                          </span>
                        )}
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isPending ? 'bg-amber-500/20 text-amber-300' :
                          req.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300' :
                          'bg-rose-500/20 text-rose-300'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1.5 break-words">
                        Details: {req.details}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Requested by: {req.requesterName} · Target ID: #{req.targetId}
                      </p>
                    </div>

                    {isPending && (
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end sm:justify-start pt-2 sm:pt-0 border-t border-slate-800 sm:border-t-0">
                        <button
                          onClick={() => handleApproval(req.id, false, 'Rejected by supervisor')}
                          className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-rose-400 text-xs font-bold rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                        <button
                          onClick={() => handleApproval(req.id, true, 'Approved by supervisor')}
                          className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve & Authorize</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
