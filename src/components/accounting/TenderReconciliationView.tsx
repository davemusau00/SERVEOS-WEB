import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  DollarSign, 
  CheckCircle, 
  AlertTriangle, 
  Receipt, 
  Smartphone, 
  CreditCard, 
  Building2, 
  Truck, 
  RefreshCw, 
  ShieldCheck, 
  Award, 
  Send,
  Lock,
  FileSpreadsheet
} from 'lucide-react';

interface TenderChannel {
  id: string;
  name: string;
  icon: React.ReactNode;
  expectedKes: number;
  actualCountedKes: number;
  varianceKes: number;
  notes?: string;
  status: 'BALANCED' | 'SHORT' | 'OVER' | 'PENDING';
}

export const TenderReconciliationView: React.FC = () => {
  const { showToast } = useServOS();
  const [selectedShift, setSelectedShift] = useState<'SHIFT_1_LUNCH' | 'SHIFT_2_DINNER'>('SHIFT_2_DINNER');
  const [isSettled, setIsSettled] = useState(false);

  // Initial channels with expected values from POS ledger
  const [channels, setChannels] = useState<TenderChannel[]>([
    {
      id: 'cash',
      name: 'POS Cash Drop Box',
      icon: <DollarSign className="w-5 h-5 text-emerald-400" />,
      expectedKes: 48500,
      actualCountedKes: 48500,
      varianceKes: 0,
      status: 'BALANCED'
    },
    {
      id: 'mpesa',
      name: 'M-Pesa Express (Till #882910)',
      icon: <Smartphone className="w-5 h-5 text-green-400" />,
      expectedKes: 142800,
      actualCountedKes: 142800,
      varianceKes: 0,
      status: 'BALANCED'
    },
    {
      id: 'card',
      name: 'Card PDQ Batches (Visa/Mastercard)',
      icon: <CreditCard className="w-5 h-5 text-blue-400" />,
      expectedKes: 96400,
      actualCountedKes: 95400,
      varianceKes: -1000,
      notes: 'Merchant transaction fee offset under review',
      status: 'SHORT'
    },
    {
      id: 'room',
      name: 'Hotel Guest Room Postings',
      icon: <Building2 className="w-5 h-5 text-amber-400" />,
      expectedKes: 32000,
      actualCountedKes: 32000,
      varianceKes: 0,
      status: 'BALANCED'
    },
    {
      id: 'delivery',
      name: 'Glovo / UberEats Marketplace Payout',
      icon: <Truck className="w-5 h-5 text-purple-400" />,
      expectedKes: 24500,
      actualCountedKes: 24500,
      varianceKes: 0,
      status: 'BALANCED'
    }
  ]);

  // Tip pool calculation state
  const [serviceChargeCollected, setServiceChargeCollected] = useState(34420);
  const [staffPoolShares, setStaffPoolShares] = useState({
    waiters: 50, // 50%
    kitchen: 30, // 30%
    bar: 15,    // 15%
    support: 5   // 5%
  });

  const handleActualCountChange = (id: string, value: number) => {
    setChannels(prev =>
      prev.map(ch => {
        if (ch.id === id) {
          const variance = value - ch.expectedKes;
          let status: TenderChannel['status'] = 'BALANCED';
          if (variance < -100) status = 'SHORT';
          if (variance > 100) status = 'OVER';
          return {
            ...ch,
            actualCountedKes: value,
            varianceKes: variance,
            status
          };
        }
        return ch;
      })
    );
  };

  const handleNoteChange = (id: string, notes: string) => {
    setChannels(prev =>
      prev.map(ch => (ch.id === id ? { ...ch, notes } : ch))
    );
  };

  const totalExpected = channels.reduce((acc, c) => acc + c.expectedKes, 0);
  const totalActual = channels.reduce((acc, c) => acc + c.actualCountedKes, 0);
  const totalVariance = totalActual - totalExpected;

  const handlePerformSettlement = () => {
    if (Math.abs(totalVariance) > 500) {
      const missingNotes = channels.filter(c => c.varianceKes !== 0 && !c.notes);
      if (missingNotes.length > 0) {
        showToast('Please provide supervisor notes for tender variances over tolerance threshold.', 'error');
        return;
      }
    }
    setIsSettled(true);
    showToast('Daily Tender Settlement finalized & General Ledger locked!', 'success');
  };

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 font-sans text-slate-100 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Top Banner Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Tender Reconciliation & Settlement Center
              {isSettled && (
                <span className="px-2.5 py-0.5 text-[10px] font-mono bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> SETTLED & LOCKED
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Verify expected POS collections against actual physical cash, M-Pesa & gateway merchant batches
            </p>
          </div>
        </div>

        {/* Shift selector & action button */}
        <div className="flex items-center gap-3">
          <select
            value={selectedShift}
            onChange={e => setSelectedShift(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded-xl px-3 py-2 outline-none focus:border-amber-500"
          >
            <option value="SHIFT_1_LUNCH">Shift 1: Lunch (11:00 - 16:00)</option>
            <option value="SHIFT_2_DINNER">Shift 2: Dinner (16:00 - Close)</option>
          </select>

          <button
            onClick={handlePerformSettlement}
            disabled={isSettled}
            className={`px-5 py-2 rounded-xl text-xs font-bold font-mono flex items-center gap-2 transition-all ${
              isSettled
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/10'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Finalize Shift Settlement</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Total Expected POS Ledger</span>
            <span className="text-xl font-bold text-white font-mono mt-1 block">
              KES {totalExpected.toLocaleString()}
            </span>
          </div>
          <FileSpreadsheet className="w-8 h-8 text-slate-700" />
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Total Actual Counted</span>
            <span className="text-xl font-bold text-amber-400 font-mono mt-1 block">
              KES {totalActual.toLocaleString()}
            </span>
          </div>
          <CheckCircle className="w-8 h-8 text-amber-500/30" />
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Net Variance</span>
            <span className={`text-xl font-bold font-mono mt-1 block ${
              totalVariance === 0 ? 'text-emerald-400' : totalVariance < 0 ? 'text-rose-400' : 'text-amber-400'
            }`}>
              {totalVariance >= 0 ? '+' : ''}KES {totalVariance.toLocaleString()}
            </span>
          </div>
          {totalVariance === 0 ? (
            <CheckCircle className="w-8 h-8 text-emerald-500/30" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-rose-500/30" />
          )}
        </div>
      </div>

      {/* Tender Breakdown Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Receipt className="w-4 h-4 text-amber-400" />
          Tender Channel Audit Ledger
        </h2>

        <div className="space-y-3">
          {channels.map(channel => (
            <div
              key={channel.id}
              className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-4 items-center font-mono text-xs"
            >
              <div className="md:col-span-3 flex items-center gap-3">
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                  {channel.icon}
                </div>
                <div>
                  <span className="font-bold text-white block">{channel.name}</span>
                  <span className="text-[10px] text-slate-500">POS Channel #{channel.id.toUpperCase()}</span>
                </div>
              </div>

              <div className="md:col-span-2">
                <span className="text-[10px] text-slate-500 block uppercase">EXPECTED</span>
                <span className="text-slate-200 font-bold">KES {channel.expectedKes.toLocaleString()}</span>
              </div>

              <div className="md:col-span-3">
                <span className="text-[10px] text-slate-500 block uppercase">ACTUAL COUNTED</span>
                <input
                  type="number"
                  disabled={isSettled}
                  value={channel.actualCountedKes}
                  onChange={e => handleActualCountChange(channel.id, Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-amber-300 font-bold outline-none focus:border-amber-500"
                />
              </div>

              <div className="md:col-span-2">
                <span className="text-[10px] text-slate-500 block uppercase">VARIANCE</span>
                <span className={`font-bold ${
                  channel.varianceKes === 0
                    ? 'text-emerald-400'
                    : channel.varianceKes < 0
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}>
                  {channel.varianceKes >= 0 ? '+' : ''}KES {channel.varianceKes.toLocaleString()}
                </span>
              </div>

              <div className="md:col-span-2 flex items-center justify-end">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                  channel.status === 'BALANCED'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                }`}>
                  {channel.status}
                </span>
              </div>

              {channel.varianceKes !== 0 && (
                <div className="md:col-span-12 pt-2 border-t border-slate-800/60">
                  <input
                    type="text"
                    disabled={isSettled}
                    placeholder="Provide supervisor variance note..."
                    value={channel.notes || ''}
                    onChange={e => handleNoteChange(channel.id, e.target.value)}
                    className="w-full px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs outline-none focus:border-amber-500"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tip & Service Charge Distribution Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            Service Charge & Tip Pool Distribution
          </h2>
          <span className="text-xs font-mono text-amber-400 font-bold">
            Pool Total: KES {serviceChargeCollected.toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono text-xs">
          {[
            { key: 'waiters', name: 'Waitstaff (50%)', sharePct: staffPoolShares.waiters },
            { key: 'kitchen', name: 'Kitchen Team (30%)', sharePct: staffPoolShares.kitchen },
            { key: 'bar', name: 'Bar & Mixology (15%)', sharePct: staffPoolShares.bar },
            { key: 'support', name: 'Support & Runners (5%)', sharePct: staffPoolShares.support }
          ].map(pool => {
            const calculatedAmount = (serviceChargeCollected * pool.sharePct) / 100;
            return (
              <div key={pool.key} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-[11px] text-slate-400 font-bold block">{pool.name}</span>
                <span className="text-sm font-bold text-amber-400 block">
                  KES {calculatedAmount.toLocaleString()}
                </span>
                <button
                  onClick={() => showToast(`Initiating manual M-Pesa tip transfer of KES ${calculatedAmount.toLocaleString()} for ${pool.name}...`, 'info')}
                  className="w-full py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                >
                  <Send className="w-3 h-3" /> Payout via M-Pesa
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
