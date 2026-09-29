import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  Truck, 
  FileCheck, 
  Building, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  Clock,
  X
} from 'lucide-react';

export const ProcurementView: React.FC = () => {
  const {
    suppliers,
    purchaseOrders,
    stockItems,
    receivePurchaseOrder,
    createPurchaseOrder,
    showToast
  } = useServOS();

  const [activeTab, setActiveTab] = useState<'POS' | 'MATCH' | 'SUPPLIERS' | 'AGING'>('POS');
  const [isNewPoOpen, setIsNewPoOpen] = useState<boolean>(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [poItemId, setPoItemId] = useState<string>(stockItems[0]?.id || '');
  const [poQty, setPoQty] = useState<number>(24);
  const [poPrice, setPoPrice] = useState<number>(2800);

  const handleCreatePo = () => {
    if (!selectedSupplierId || !poItemId || poQty <= 0) return;
    createPurchaseOrder(selectedSupplierId, [
      { stockItemId: poItemId, quantity: poQty, unitPrice: poPrice }
    ]);
    setIsNewPoOpen(false);
    showToast('Purchase Order created and approved!', 'success');
  };

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Procurement & Accounts Payable</span>
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5 line-clamp-1">
            Purchase Orders, Goods Receipt (GRN), 3-Way Match & AP Aging
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('POS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'POS' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Purchase Orders ({purchaseOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('MATCH')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'MATCH' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3-Way Match Audit
            </button>
            <button
              onClick={() => setActiveTab('AGING')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'AGING' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AP Aging Ledger
            </button>
            <button
              onClick={() => setActiveTab('SUPPLIERS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'SUPPLIERS' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Suppliers ({suppliers.length})
            </button>
          </div>

          <button
            onClick={() => setIsNewPoOpen(true)}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>+ Create PO</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-28 md:pb-8">
        {activeTab === 'POS' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[720px]">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">PO Number</th>
                    <th className="p-3">Supplier</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">GRN Reference</th>
                    <th className="p-3">Invoice Number</th>
                    <th className="p-3 text-right">Grand Total (KES)</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {purchaseOrders.map(po => {
                    const isReceived = po.status === 'RECEIVED';
                    return (
                      <tr key={po.id} className="hover:bg-slate-850">
                        <td className="p-3 font-bold text-amber-300">
                          {po.poNumber}
                        </td>
                        <td className="p-3 text-slate-200 font-medium">
                          {po.supplierName}
                        </td>
                        <td className="p-3 text-slate-400">
                          {new Date(po.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            isReceived ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {po.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400">
                          {po.grnNumber || '—'}
                        </td>
                        <td className="p-3 text-slate-400">
                          {po.supplierInvoiceNumber || '—'}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-100 tabular-nums">
                          {po.grandTotal.toLocaleString()}
                        </td>
                        <td className="p-3 text-center">
                          {!isReceived ? (
                            <button
                              onClick={() => {
                                receivePurchaseOrder(po.id);
                                showToast(`Goods received for ${po.poNumber}! Stock added to warehouse and AP invoice posted to General Ledger.`, 'success');
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded"
                            >
                              Receive Delivery
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-400 font-medium flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Received
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: 3-Way Match Audit (Section 16) */}
        {activeTab === 'MATCH' && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
              <h3 className="text-sm font-bold text-white mb-1">
                Automated 3-Way Match Verification (PO vs GRN vs Supplier Invoice)
              </h3>
              <p className="text-xs text-slate-400">
                Guarantees price consistency, quantity receipts, and tax calculations before supplier payment authorization.
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Purchase Order (PO)</th>
                      <th className="p-3">Goods Receipt (GRN)</th>
                      <th className="p-3">Supplier Invoice</th>
                      <th className="p-3">Quantity Match</th>
                      <th className="p-3">Price Match</th>
                      <th className="p-3 text-right">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    <tr className="hover:bg-slate-850">
                      <td className="p-3">
                        <div className="font-bold text-slate-200">PO-2026-0919-01</div>
                        <div className="text-[11px] text-slate-400">24 btl Jameson, 12 btl Tanqueray</div>
                      </td>
                      <td className="p-3">
                        <div className="text-emerald-400 font-bold">GRN-2026-0482</div>
                        <div className="text-[11px] text-slate-400">Received 36 / Rejected 0</div>
                      </td>
                      <td className="p-3">
                        <div className="text-slate-200">INV-EAD-98421</div>
                        <div className="text-[11px] text-slate-400">KES 143,840.00</div>
                      </td>
                      <td className="p-3">
                        <span className="text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded">
                          100% MATCH
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded">
                          EXACT (0% VAR)
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-400">
                        APPROVED FOR AP POSTING
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: Accounts Payable Aging */}
        {activeTab === 'AGING' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-[11px] sm:text-xs text-slate-400 font-mono uppercase">Current (0-30 Days)</span>
                <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400 mt-1">
                  KES 143,840
                </div>
              </div>
              <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-[11px] sm:text-xs text-slate-400 font-mono uppercase">31 - 60 Days</span>
                <div className="text-lg sm:text-xl font-bold font-mono text-amber-400 mt-1">
                  KES 0
                </div>
              </div>
              <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-[11px] sm:text-xs text-slate-400 font-mono uppercase">61 - 90 Days</span>
                <div className="text-lg sm:text-xl font-bold font-mono text-slate-400 mt-1">
                  KES 0
                </div>
              </div>
              <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-[11px] sm:text-xs text-slate-400 font-mono uppercase">90+ Days Overdue</span>
                <div className="text-lg sm:text-xl font-bold font-mono text-rose-400 mt-1">
                  KES 0
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Supplier Name</th>
                      <th className="p-3">KRA PIN</th>
                      <th className="p-3">Terms</th>
                      <th className="p-3">Current</th>
                      <th className="p-3">30 Days</th>
                      <th className="p-3 text-right">Total Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    <tr className="hover:bg-slate-850">
                      <td className="p-3 font-bold text-slate-200">
                        East African Distillers & Wines
                      </td>
                      <td className="p-3 text-slate-400">P051009876C</td>
                      <td className="p-3 text-slate-300">14 Days</td>
                      <td className="p-3 tabular-nums font-bold text-emerald-400">KES 143,840</td>
                      <td className="p-3 tabular-nums text-slate-500">KES 0</td>
                      <td className="p-3 text-right tabular-nums font-bold text-slate-100">KES 143,840</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: Suppliers Catalog */}
        {activeTab === 'SUPPLIERS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suppliers.map(sup => (
              <div key={sup.id} className="bg-slate-900 border border-slate-800 rounded-lg p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-base text-white">{sup.name}</h3>
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {sup.code}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-300 font-mono">
                  <div>Contact: {sup.contactPerson} ({sup.phone})</div>
                  <div>Email: {sup.email}</div>
                  <div>KRA PIN: {sup.kraPin}</div>
                  <div>Payment Terms: {sup.paymentTermsDays} Days Credit</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: Create PO */}
      {isNewPoOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Create Purchase Order (PO)</h3>
            <p className="text-xs text-slate-400 mb-4">Official purchase commitment with unit conversions.</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Supplier</label>
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Stock Item</label>
                <select
                  value={poItemId}
                  onChange={e => setPoItemId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {stockItems.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Quantity</label>
                  <input
                    type="number"
                    value={poQty || ''}
                    onChange={e => setPoQty(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-amber-300 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Unit Cost (KES)</label>
                  <input
                    type="number"
                    value={poPrice || ''}
                    onChange={e => setPoPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-amber-300 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span>KES {(poQty * poPrice).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>16% VAT:</span>
                  <span>KES {((poQty * poPrice) * 0.16).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-800">
                  <span>Grand Total:</span>
                  <span className="text-amber-400">KES {((poQty * poPrice) * 1.16).toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  onClick={() => setIsNewPoOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePo}
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded"
                >
                  Generate PO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
