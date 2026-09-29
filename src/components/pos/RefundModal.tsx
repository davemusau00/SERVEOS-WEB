import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  RotateCcw, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  DollarSign, 
  ShieldCheck, 
  Receipt 
} from 'lucide-react';

import { Order } from '../../types/servos';

interface RefundModalProps {
  isOpen: boolean;
  order?: Order | null;
  onClose: () => void;
}

export const RefundModal: React.FC<RefundModalProps> = ({ isOpen, order, onClose }) => {
  const { showToast } = useServOS();
  const [receiptNo, setReceiptNo] = useState<string>(order ? `ORD-#${order.orderNumber}` : 'INV-002839');
  const [refundReason, setRefundReason] = useState<string>('INCORRECT_ORDER');
  const [refundMethod, setRefundMethod] = useState<'ORIGINAL_MPESA' | 'CASH' | 'CARD_REVERSAL'>('ORIGINAL_MPESA');
  const [managerPin, setManagerPin] = useState<string>('');

  // Sample items on receipt
  const [itemsToRefund, setItemsToRefund] = useState([
    { id: 'item-1', name: 'Jameson Double (60ml)', price: 650, checked: true },
    { id: 'item-2', name: 'Coca-Cola 300ml Glass', price: 200, checked: false },
    { id: 'item-3', name: 'Nyama Choma Platter 1kg', price: 1800, checked: false }
  ]);

  if (!isOpen) return null;

  const toggleItem = (id: string) => {
    setItemsToRefund(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const selectedRefundAmount = itemsToRefund
    .filter(i => i.checked)
    .reduce((acc, curr) => acc + curr.price, 0);

  const handleProcessRefund = () => {
    showToast('Refund recording is pending backend integration. No refund or fiscal credit note was issued.', 'error');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Itemized POS Refund & Credit Note</h3>
              <p className="text-xs text-slate-400 font-mono">Requires Manager Supervisor PIN</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt lookup */}
        <div className="space-y-1 font-mono text-xs">
          <label className="text-slate-400">Original Receipt Number</label>
          <div className="relative">
            <input
              type="text"
              value={receiptNo}
              onChange={e => setReceiptNo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 uppercase font-bold"
            />
          </div>
        </div>

        {/* Select Items */}
        <div className="space-y-2 font-mono text-xs">
          <label className="text-slate-400">Select Items to Refund</label>
          <div className="space-y-1.5">
            {itemsToRefund.map(item => (
              <div
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${
                  item.checked ? 'bg-rose-950/30 border-rose-500/40 text-rose-300' : 'bg-slate-850 border-slate-750 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => {}}
                    className="accent-rose-500"
                  />
                  <span className="font-semibold text-white">{item.name}</span>
                </div>
                <span className="font-bold text-amber-400">KES {item.price.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reason & Refund to */}
        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Reason</label>
            <select
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2"
            >
              <option value="INCORRECT_ORDER">Incorrect Order</option>
              <option value="CUSTOMER_DISSATISFACTION">Drink Dissatisfaction</option>
              <option value="DEFECTIVE_BOTTLE">Corked / Spoiled Wine</option>
              <option value="DOUBLE_CHARGE">Accidental Double Charge</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Disburse To</label>
            <select
              value={refundMethod}
              onChange={e => setRefundMethod(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 text-amber-300 font-bold rounded-xl p-2"
            >
              <option value="ORIGINAL_MPESA">Original M-PESA</option>
              <option value="CASH">Till Cash Drawer</option>
              <option value="CARD_REVERSAL">Card Reversal</option>
            </select>
          </div>
        </div>

        {/* Manager PIN */}
        <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl space-y-1 font-mono text-xs">
          <label className="text-rose-400 font-bold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Manager Authorization PIN (e.g. 9999)</span>
          </label>
          <input
            type="password"
            maxLength={4}
            placeholder="••••"
            value={managerPin}
            onChange={e => setManagerPin(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-center text-lg text-white font-black tracking-widest rounded-lg p-1.5 focus:outline-none focus:border-rose-400"
          />
        </div>

        {/* Refund Total & Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800 font-mono">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Total Refund</span>
            <span className="text-base font-black text-rose-400">KES {selectedRefundAmount.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleProcessRefund}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-colors"
            >
              Approve Refund
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
