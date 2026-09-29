import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  DollarSign, 
  Utensils, 
  Download, 
  Calendar, 
  PieChart, 
  Target, 
  FileSpreadsheet,
  Layers,
  Sparkles
} from 'lucide-react';

export const ReportsCenterView: React.FC = () => {
  const { showToast } = useServOS();
  const [selectedReportTab, setSelectedReportTab] = useState<'SALES_COVERS' | 'KITCHEN_SLA' | 'FOOD_COST_AVT' | 'MENU_ENGINEERING'>('SALES_COVERS');
  const [dateRange, setDateRange] = useState<'TODAY' | 'WEEK' | 'MONTH'>('TODAY');

  const handleExportCsv = () => {
    showToast(`Exporting ServOS ${selectedReportTab} report as CSV...`, 'success');
  };

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 font-sans text-slate-100 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Restaurant Analytics & Intelligence Centre
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Deep operational reports: Sales per cover, Kitchen SLA, Food Cost AvT & Menu Engineering Matrix
            </p>
          </div>
        </div>

        {/* Date Filter & Export Button */}
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-xs">
            {(['TODAY', 'WEEK', 'MONTH'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDateRange(d)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  dateRange === d ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCsv}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-amber-300 font-mono text-xs rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Report Navigation Tabs */}
      <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 font-mono text-xs overflow-x-auto">
        {[
          { id: 'SALES_COVERS', label: 'Sales & Covers Breakdown' },
          { id: 'KITCHEN_SLA', label: 'Kitchen Turn Time & SLA' },
          { id: 'FOOD_COST_AVT', label: 'Food Cost & AvT Variance' },
          { id: 'MENU_ENGINEERING', label: 'Menu Engineering Matrix' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSelectedReportTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
              selectedReportTab === tab.id
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Panels */}
      {selectedReportTab === 'SALES_COVERS' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase block">NET REVENUE</span>
              <span className="text-xl font-bold text-white mt-1 block">KES 344,200</span>
              <span className="text-[10px] text-emerald-400 font-bold block mt-1">+14.2% vs last week</span>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase block">TOTAL SEATED COVERS</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">186 Guests</span>
              <span className="text-[10px] text-slate-400 block mt-1">12.4 Guests / Table</span>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase block">SPEND PER COVER (RevPASH)</span>
              <span className="text-xl font-bold text-white mt-1 block">KES 1,850</span>
              <span className="text-[10px] text-emerald-400 block mt-1">+KES 120 target beat</span>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase block">AVERAGE TABLE DWELL TIME</span>
              <span className="text-xl font-bold text-white mt-1 block">48 Mins</span>
              <span className="text-[10px] text-amber-400 block mt-1">Optimal turnover rate</span>
            </div>
          </div>

          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 font-mono text-xs">
            <h3 className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Peak Service Hour Revenue Curve
            </h3>
            <div className="space-y-2">
              {[
                { time: '12:00 - 13:00 (Lunch Rush)', rev: 'KES 42,000', pct: 60 },
                { time: '13:00 - 14:00 (Peak Lunch)', rev: 'KES 68,000', pct: 95 },
                { time: '18:00 - 19:00 (Happy Hour)', rev: 'KES 54,000', pct: 75 },
                { time: '19:00 - 21:00 (Peak Dinner)', rev: 'KES 112,000', pct: 100 }
              ].map((hr, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span>{hr.time}</span>
                    <span className="font-bold text-amber-400">{hr.rev}</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all"
                      style={{ width: `${hr.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedReportTab === 'KITCHEN_SLA' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <span className="text-[10px] text-slate-400 uppercase block">AVG KITCHEN TICKET TIME</span>
            <span className="text-2xl font-bold text-amber-400 block">11m 45s</span>
            <p className="text-[11px] text-slate-400">Target SLA threshold is 15m 00s</p>
          </div>

          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <span className="text-[10px] text-slate-400 uppercase block">BAR DRINK SPEED PASS</span>
            <span className="text-2xl font-bold text-emerald-400 block">3m 20s</span>
            <p className="text-[11px] text-slate-400">Cocktails & draught beer speed</p>
          </div>

          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <span className="text-[10px] text-slate-400 uppercase block">OVERDUE TICKETS (&gt;20m)</span>
            <span className="text-2xl font-bold text-rose-400 block">2 Tickets</span>
            <p className="text-[11px] text-slate-400">Grill station bottleneck under review</p>
          </div>
        </div>
      )}

      {selectedReportTab === 'MENU_ENGINEERING' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 font-mono text-xs">
          <h3 className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            Boston Matrix Menu Engineering
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-2">
              <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 font-bold rounded">
                🌟 STARS (High Profit, High Popularity)
              </span>
              <ul className="text-slate-300 space-y-1 pt-1">
                <li>• Aged Ribeye Steak 300g (Margin: 68%)</li>
                <li>• Passion Fruit Mojito (Margin: 82%)</li>
              </ul>
            </div>

            <div className="p-4 bg-slate-950 border border-amber-500/30 rounded-xl space-y-2">
              <span className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-300 font-bold rounded">
                🐎 PLOWHORSES (Low Profit, High Popularity)
              </span>
              <ul className="text-slate-300 space-y-1 pt-1">
                <li>• Classic Cheese Burger & Fries (Margin: 42%)</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
