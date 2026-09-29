import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { JournalEntry, EtimsFiscalInvoice, Account } from '../../types/servos';
import { 
  Scale, 
  Receipt, 
  FileText, 
  QrCode, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Landmark, 
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  X
} from 'lucide-react';

export const AccountingView: React.FC = () => {
  const {
    accounts,
    journalEntries,
    etimsInvoices,
    currentProperty
  } = useServOS();

  const [activeTab, setActiveTab] = useState<'JOURNALS' | 'COA' | 'ETIMS' | 'STATEMENTS'>('JOURNALS');
  const [expandedJeId, setExpandedJeId] = useState<string | null>(journalEntries[0]?.id || null);
  const [selectedEtimsModal, setSelectedEtimsModal] = useState<EtimsFiscalInvoice | null>(null);

  // Financial P&L calculations
  const revenueAccounts = accounts.filter(a => a.type === 'REVENUE');
  const expenseAccounts = accounts.filter(a => a.type === 'EXPENSE');
  const assetAccounts = accounts.filter(a => a.type === 'ASSET');
  const liabilityAccounts = accounts.filter(a => a.type === 'LIABILITY');

  const totalRevenue = revenueAccounts.reduce((s, a) => s + a.balance, 0);
  const totalCogs = expenseAccounts.filter(a => a.code.startsWith('501') || a.code.startsWith('502')).reduce((s, a) => s + a.balance, 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalExpenses = expenseAccounts.reduce((s, a) => s + a.balance, 0);
  const netIncome = totalRevenue - totalExpenses;

  const totalAssets = assetAccounts.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((s, a) => s + a.balance, 0);

  // Verify all journal entries invariant: Debit === Credit
  const unbalancedCount = journalEntries.filter(j => !j.balanced).length;

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Double-Entry General Ledger & Kenya eTIMS Fiscal Engine</span>
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5 line-clamp-1">
            Native Double-Entry Posting Rules, Invariant Audits & Certified KRA OSCU/VSCU Fiscalizer
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-300 hidden sm:inline">Invariant Check:</span>
            {unbalancedCount === 0 ? (
              <span className="text-emerald-400 font-bold">100% BALANCED</span>
            ) : (
              <span className="text-rose-400 font-bold">{unbalancedCount} UNBALANCED</span>
            )}
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('JOURNALS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'JOURNALS' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Journals ({journalEntries.length})
            </button>
            <button
              onClick={() => setActiveTab('ETIMS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'ETIMS' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              eTIMS ({etimsInvoices.length})
            </button>
            <button
              onClick={() => setActiveTab('COA')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'COA' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Accounts ({accounts.length})
            </button>
            <button
              onClick={() => setActiveTab('STATEMENTS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'STATEMENTS' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              P&L & BS
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-28 md:pb-8">
        {/* VIEW 1: Journal Entries Stream */}
        {activeTab === 'JOURNALS' && (
          <div className="space-y-3">
            {journalEntries.map(entry => {
              const isExpanded = expandedJeId === entry.id;
              return (
                <div
                  key={entry.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md"
                >
                  {/* Summary Bar */}
                  <div
                    onClick={() => setExpandedJeId(isExpanded ? null : entry.id)}
                    className="p-3 sm:p-3.5 bg-slate-850 hover:bg-slate-800 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="pt-0.5 sm:pt-0 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="font-bold text-xs sm:text-sm text-white font-mono shrink-0">
                            {entry.entryNumber}
                          </span>
                          <span className="text-[10px] bg-slate-800 text-amber-300 font-mono px-2 py-0.5 rounded font-semibold border border-slate-700 shrink-0">
                            {entry.sourceType} #{entry.sourceId}
                          </span>
                          {entry.balanced ? (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded font-bold shrink-0">
                              BALANCED
                            </span>
                          ) : (
                            <span className="text-[10px] bg-rose-500/20 text-rose-300 font-mono px-2 py-0.5 rounded font-bold shrink-0">
                              UNBALANCED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 mt-1 line-clamp-1 sm:line-clamp-2">{entry.memo}</p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1 font-mono shrink-0 pl-6 sm:pl-0 border-t sm:border-t-0 border-slate-800/60 pt-1.5 sm:pt-0">
                      <div className="text-[11px] sm:text-xs text-slate-400 whitespace-nowrap">
                        {new Date(entry.postedAt).toLocaleDateString()} {new Date(entry.postedAt).toLocaleTimeString()}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-100 tabular-nums whitespace-nowrap">
                        KES {entry.totalDebit.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Debit/Credit Lines */}
                  {isExpanded && (
                    <div className="p-3 sm:p-4 bg-slate-950/60 border-t border-slate-800 overflow-x-auto scrollbar-thin">
                      <table className="w-full text-left text-xs min-w-[500px]">
                        <thead className="text-[10px] font-mono uppercase text-slate-400 border-b border-slate-800 pb-1">
                          <tr>
                            <th className="pb-2">Account Code</th>
                            <th className="pb-2">Account Name</th>
                            <th className="pb-2">Line Description</th>
                            <th className="pb-2 text-right">Debit (KES)</th>
                            <th className="pb-2 text-right">Credit (KES)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 font-mono">
                          {entry.lines.map(line => (
                            <tr key={line.id} className="hover:bg-slate-900">
                              <td className="py-2 text-amber-400 font-bold">{line.accountCode}</td>
                              <td className="py-2 text-slate-200">{line.accountName}</td>
                              <td className="py-2 text-slate-400 text-[11px]">{line.description}</td>
                              <td className="py-2 text-right tabular-nums font-bold text-slate-100">
                                {line.debit > 0 ? line.debit.toLocaleString() : '—'}
                              </td>
                              <td className="py-2 text-right tabular-nums font-bold text-slate-100">
                                {line.credit > 0 ? line.credit.toLocaleString() : '—'}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-750 font-bold">
                            <td colSpan={3} className="py-2.5 text-right uppercase text-[11px] text-slate-400">
                              Total Sum:
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-emerald-400 text-xs">
                              KES {entry.totalDebit.toLocaleString()}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-emerald-400 text-xs">
                              KES {entry.totalCredit.toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: Kenya eTIMS Fiscal Invoices (Section 20) */}
        {activeTab === 'ETIMS' && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span>KRA Electronic Tax Invoice Management System (eTIMS)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Online Control Unit (OSCU) Serial: {currentProperty.etimsCuNumber} · Taxpayer PIN: {currentProperty.kraPin}
                </p>
              </div>

              <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 rounded flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>OSCU Adapter Online (0 retries in queue)</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Invoice Number</th>
                    <th className="p-3">CU Serial Number</th>
                    <th className="p-3">Taxable Base (Ex-VAT)</th>
                    <th className="p-3">16% VAT</th>
                    <th className="p-3">2% Catering Levy</th>
                    <th className="p-3">Total (KES)</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-center">Verify QR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {etimsInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        No fiscal invoices generated in this session yet. Complete any POS order to view live KRA fiscal invoice.
                      </td>
                    </tr>
                  ) : (
                    etimsInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-850">
                        <td className="p-3 font-bold text-amber-300">
                          {inv.invoiceNumber}
                        </td>
                        <td className="p-3 text-slate-400">
                          {inv.cuSerialNumber}
                        </td>
                        <td className="p-3 tabular-nums text-slate-300">
                          {inv.taxableAmount.toLocaleString()}
                        </td>
                        <td className="p-3 tabular-nums text-slate-300">
                          {inv.vatAmount.toLocaleString()}
                        </td>
                        <td className="p-3 tabular-nums text-slate-300">
                          {inv.levyAmount.toLocaleString()}
                        </td>
                        <td className="p-3 tabular-nums font-bold text-emerald-400">
                          {inv.totalAmount.toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded">
                            {inv.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setSelectedEtimsModal(inv)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 flex items-center gap-1 mx-auto"
                          >
                            <QrCode className="w-3.5 h-3.5 text-amber-400" />
                            <span>View Fiscal QR</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: Chart of Accounts */}
        {activeTab === 'COA' && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs min-w-[500px]">
              <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Account Name</th>
                  <th className="p-3">Classification</th>
                  <th className="p-3 text-right">Current Balance (KES)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {accounts.map(acc => (
                  <tr key={acc.id} className="hover:bg-slate-850">
                    <td className="p-3 font-bold text-amber-400">{acc.code}</td>
                    <td className="p-3 text-slate-200 font-medium">{acc.name}</td>
                    <td className="p-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        acc.type === 'ASSET' ? 'bg-blue-500/20 text-blue-300' :
                        acc.type === 'LIABILITY' ? 'bg-amber-500/20 text-amber-300' :
                        acc.type === 'REVENUE' ? 'bg-emerald-500/20 text-emerald-300' :
                        'bg-purple-500/20 text-purple-300'
                      }`}>
                        {acc.type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold tabular-nums text-slate-100">
                      {acc.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* VIEW 4: P&L & Balance Sheet Statements */}
        {activeTab === 'STATEMENTS' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profit & Loss */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="font-bold text-sm text-white">Profit & Loss Statement (P&L)</h3>
                <span className="text-xs text-slate-400 font-mono">Current Accounting Period</span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="text-slate-400 uppercase text-[10px] tracking-wider font-bold">Revenue:</div>
                {revenueAccounts.map(a => (
                  <div key={a.id} className="flex justify-between pl-3 text-slate-300">
                    <span>{a.name}</span>
                    <span className="tabular-nums">KES {a.balance.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-1 border-t border-slate-800 text-emerald-400">
                  <span>Total Revenue</span>
                  <span>KES {totalRevenue.toLocaleString()}</span>
                </div>

                <div className="pt-3 text-slate-400 uppercase text-[10px] tracking-wider font-bold">Cost of Goods Sold (COGS):</div>
                <div className="flex justify-between pl-3 text-slate-300">
                  <span>F&B Cost of Sales</span>
                  <span className="tabular-nums">KES {totalCogs.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-slate-800 text-amber-300">
                  <span>Gross Profit Margin</span>
                  <span>KES {grossProfit.toLocaleString()}</span>
                </div>

                <div className="pt-3 text-slate-400 uppercase text-[10px] tracking-wider font-bold">Operating Expenses & Losses:</div>
                {expenseAccounts.filter(a => !a.code.startsWith('501') && !a.code.startsWith('502')).map(a => (
                  <div key={a.id} className="flex justify-between pl-3 text-slate-300">
                    <span>{a.name}</span>
                    <span className="tabular-nums">KES {a.balance.toLocaleString()}</span>
                  </div>
                ))}

                <div className="pt-3 border-t-2 border-slate-750 flex justify-between text-sm font-bold text-white">
                  <span>Net Operating Income</span>
                  <span className="text-emerald-400">KES {netIncome.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Balance Sheet Snapshot */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="font-bold text-sm text-white">Balance Sheet Summary</h3>
                <span className="text-xs text-slate-400 font-mono">Statement of Financial Position</span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="text-slate-400 uppercase text-[10px] tracking-wider font-bold">Assets:</div>
                {assetAccounts.map(a => (
                  <div key={a.id} className="flex justify-between pl-3 text-slate-300">
                    <span>{a.name}</span>
                    <span className="tabular-nums">KES {a.balance.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-1 border-t border-slate-800 text-blue-400">
                  <span>Total Assets</span>
                  <span>KES {totalAssets.toLocaleString()}</span>
                </div>

                <div className="pt-3 text-slate-400 uppercase text-[10px] tracking-wider font-bold">Liabilities & Tax Payables:</div>
                {liabilityAccounts.map(a => (
                  <div key={a.id} className="flex justify-between pl-3 text-slate-300">
                    <span>{a.name}</span>
                    <span className="tabular-nums">KES {a.balance.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-1 border-t border-slate-800 text-amber-400">
                  <span>Total Liabilities</span>
                  <span>KES {totalLiabilities.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Kenya eTIMS Fiscal Invoice QR Code Inspector */}
      {selectedEtimsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <span>KRA eTIMS Fiscal Verification</span>
              </h3>
              <button
                onClick={() => setSelectedEtimsModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 text-center space-y-4">
              <div className="bg-white p-4 rounded-lg inline-block mx-auto shadow-inner">
                {/* SVG QR Code Simulation */}
                <div className="w-36 h-36 bg-slate-900 p-2 flex flex-col justify-between items-center text-[8px] font-mono text-white">
                  <div className="w-full flex justify-between">
                    <div className="w-6 h-6 border-2 border-white p-0.5"><div className="w-full h-full bg-white"/></div>
                    <div className="w-6 h-6 border-2 border-white p-0.5"><div className="w-full h-full bg-white"/></div>
                  </div>
                  <span className="text-[9px] font-bold text-emerald-400">KRA-eTIMS</span>
                  <div className="w-full flex justify-between">
                    <div className="w-6 h-6 border-2 border-white p-0.5"><div className="w-full h-full bg-white"/></div>
                    <span className="text-[7px]">VERIFIED</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 text-left font-mono text-xs space-y-1.5 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Invoice Number:</span>
                  <span className="text-amber-300 font-bold">{selectedEtimsModal.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">CU Serial:</span>
                  <span>{selectedEtimsModal.cuSerialNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Verification Hash:</span>
                  <span className="text-[10px] text-slate-400">{selectedEtimsModal.verificationHash}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-400">Gross Total:</span>
                  <span className="font-bold text-emerald-400">KES {selectedEtimsModal.totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <a
                href={selectedEtimsModal.qrCodeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline font-mono"
              >
                <span>Verify on KRA Taxpayer Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedEtimsModal(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
