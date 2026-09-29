import React, { useState, useMemo } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  TrendingUp, 
  Bed, 
  DollarSign, 
  ShieldAlert, 
  Flame, 
  Users, 
  Boxes, 
  Receipt, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  Plus, 
  Sparkles, 
  Search, 
  Filter, 
  ArrowRight, 
  SlidersHorizontal,
  Calendar,
  Layers,
  ChevronRight,
  Inbox,
  Wine,
  Wrench,
  FileSpreadsheet,
  Zap,
  Activity
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { UniversalInboxModal } from '../inbox/UniversalInboxModal';

interface CommandCentreViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const CommandCentreView: React.FC<CommandCentreViewProps> = ({ onNavigateTab }) => {
  const {
    currentProperty,
    currentOutlet,
    userRole,
    switchUserRole,
    orders,
    guestStays,
    edgeDevices,
    anomalyAlerts,
    approvalRequests,
    stockItems,
    employees,
    showToast
  } = useServOS();

  const [activeLens, setActiveLens] = useState<'GM' | 'OWNER' | 'FNB' | 'HOTEL' | 'FINANCE'>('GM');
  const [inboxOpen, setInboxOpen] = useState<boolean>(false);

  // Hourly Revenue Progression
  const hourlyRevenueData = [
    { hour: '08:00', today: 18500, yesterday: 14200, target: 15000 },
    { hour: '10:00', today: 56200, yesterday: 48000, target: 50000 },
    { hour: '12:00', today: 142400, yesterday: 120000, target: 130000 },
    { hour: '14:00', today: 284000, yesterday: 245000, target: 260000 },
    { hour: '16:00', today: 412500, yesterday: 380000, target: 390000 },
    { hour: '18:00', today: 689000, yesterday: 590000, target: 620000 },
    { hour: '20:00', today: 994000, yesterday: 860000, target: 900000 },
    { hour: '22:00', today: 1284600, yesterday: 1110000, target: 1150000 }
  ];

  // Revenue Mix Data
  const revenueMixData = [
    { name: 'Bar & Spirits', value: 43, amount: 552378, color: '#F59E0B' },
    { name: 'Hotel Rooms', value: 28, amount: 359688, color: '#06B6D4' },
    { name: 'Kitchen & Grill', value: 24, amount: 308304, color: '#10B981' },
    { name: 'Events & Other', value: 5, amount: 64230, color: '#A855F7' }
  ];

  const handleQuickAction = (tabId: string) => {
    if (onNavigateTab) {
      onNavigateTab(tabId);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Top Cockpit Header */}
      <div className="p-4 sm:p-6 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold tracking-wider uppercase border border-amber-500/30">
                COMMAND COCKPIT v2.5
              </span>
              <span className="text-slate-400 text-xs font-mono">
                TODAY • {currentProperty?.name?.toUpperCase() || 'GRAND NAIROBI HOTEL & RESORT'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2.5">
              <span>Executive Operations Center</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            </h1>
          </div>

          {/* Lens Switcher & Action Inbox Button */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setInboxOpen(true)}
              className="relative px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all group"
            >
              <Inbox className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              <span>ServOS Inbox</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-950 text-amber-300 text-[10px] font-mono font-black">
                12
              </span>
            </button>

            {/* Role Lens */}
            <div className="flex items-center bg-slate-850 p-1 rounded-xl border border-slate-750 text-xs font-mono overflow-x-auto scrollbar-none max-w-full">
              <button
                onClick={() => setActiveLens('GM')}
                className={`px-2.5 py-1 rounded-lg transition-colors font-bold ${
                  activeLens === 'GM' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                GM
              </button>
              <button
                onClick={() => setActiveLens('OWNER')}
                className={`px-2.5 py-1 rounded-lg transition-colors font-bold ${
                  activeLens === 'OWNER' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Owner
              </button>
              <button
                onClick={() => setActiveLens('FNB')}
                className={`px-2.5 py-1 rounded-lg transition-colors font-bold ${
                  activeLens === 'FNB' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                F&B
              </button>
              <button
                onClick={() => setActiveLens('HOTEL')}
                className={`px-2.5 py-1 rounded-lg transition-colors font-bold ${
                  activeLens === 'HOTEL' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Hotel
              </button>
              <button
                onClick={() => setActiveLens('FINANCE')}
                className={`px-2.5 py-1 rounded-lg transition-colors font-bold ${
                  activeLens === 'FINANCE' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Finance
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* HERO KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Revenue */}
          <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden group hover:border-amber-500/50 transition-all">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Today Revenue</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-lg sm:text-xl font-black text-white font-mono">
              KES 1,284,600
            </div>
            <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 font-semibold mt-1.5">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+15.7% vs Target</span>
            </div>
          </div>

          {/* Occupancy */}
          <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden group hover:border-cyan-500/50 transition-all">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Hotel Occupancy</span>
              <Bed className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-lg sm:text-xl font-black text-white font-mono">
              78%
            </div>
            <div className="text-[11px] font-mono text-cyan-300 font-semibold mt-1.5">
              31 of 40 Rooms Occupied
            </div>
          </div>

          {/* Gross Profit */}
          <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden group hover:border-emerald-500/50 transition-all">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Gross Profit</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-lg sm:text-xl font-black text-white font-mono">
              KES 412,800
            </div>
            <div className="text-[11px] font-mono text-emerald-400 font-semibold mt-1.5">
              32.1% Net Margin
            </div>
          </div>

          {/* Orders / Tickets */}
          <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden group hover:border-purple-500/50 transition-all">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">POS Orders</span>
              <Receipt className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-lg sm:text-xl font-black text-white font-mono">
              1,284
            </div>
            <div className="text-[11px] font-mono text-slate-400 font-semibold mt-1.5">
              Avg KES 998 / ticket
            </div>
          </div>

          {/* Alerts */}
          <div 
            onClick={() => setInboxOpen(true)}
            className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden cursor-pointer group hover:border-rose-500/50 transition-all"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Active Alerts</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-lg sm:text-xl font-black text-rose-400 font-mono">
              14
            </div>
            <div className="text-[11px] font-mono text-rose-300 font-semibold mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              <span>5 Critical Bottlenecks</span>
            </div>
          </div>

          {/* Cash Variance */}
          <div className="p-3.5 sm:p-4 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden group hover:border-amber-500/50 transition-all">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Cash Variance</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-lg sm:text-xl font-black text-amber-400 font-mono">
              -KES 3,420
            </div>
            <div className="text-[11px] font-mono text-amber-300 font-semibold mt-1.5">
              4 Active Till Drawers
            </div>
          </div>
        </div>

        {/* SECTION 2: CHARTS (REVENUE PROGRESSION & REVENUE MIX) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Progression Area Chart (2 Cols) */}
          <div className="lg:col-span-2 p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span>Revenue Today vs Targets</span>
                </h3>
                <p className="text-xs text-slate-400">Intraday revenue accumulation in KES</p>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Today
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-600" /> Yesterday
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyRevenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="todayGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="hour" stroke="#64748B" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                  <YAxis stroke="#64748B" tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                    formatter={(value: any) => [`KES ${Number(value).toLocaleString()}`, 'Revenue']}
                  />
                  <Area type="monotone" dataKey="today" stroke="#F59E0B" strokeWidth={2.5} fillOpacity={1} fill="url(#todayGrad)" name="Today" />
                  <Area type="monotone" dataKey="yesterday" stroke="#64748B" strokeWidth={1.5} strokeDasharray="4 4" fillOpacity={0} name="Yesterday" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue Mix Pie Chart (1 Col) */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-cyan-400" />
                <span>Revenue Mix</span>
              </h3>
              <p className="text-xs text-slate-400">Departmental split across property</p>
            </div>

            <div className="h-44 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueMixData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {revenueMixData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                    formatter={(val: any, name: any) => [`${val}%`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs font-mono text-slate-400">Total</span>
                <span className="text-sm font-bold text-white font-mono">1.28M</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              {revenueMixData.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{item.value}%</span>
                    <span className="text-slate-400 text-[10px]">KES {(item.amount / 1000).toFixed(0)}k</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 3: NEEDS ATTENTION (ACTIONABLE OPERATIONAL BOTTLENECKS) */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
              <h3 className="text-base font-bold text-white tracking-tight">NEEDS ATTENTION (CRITICAL BOTTLENECKS)</h3>
            </div>
            <button
              onClick={() => setInboxOpen(true)}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 font-mono"
            >
              <span>View All 12 Tasks</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Alert 1 */}
            <div className="p-3.5 bg-rose-950/20 border border-rose-500/40 rounded-xl flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between text-rose-300 text-xs font-mono font-bold">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    PREDICTIVE STOCKOUT
                  </span>
                  <span className="bg-rose-500/20 px-1.5 py-0.5 rounded">1.4 DAYS</span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1">Jameson 750ml Depletion Alert</h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  High velocity (24.5 btls/day). Restock needed before weekend rush.
                </p>
              </div>
              <button
                onClick={() => handleQuickAction('procurement')}
                className="w-full py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Create PO (36 Bottles)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Alert 2 */}
            <div className="p-3.5 bg-amber-950/20 border border-amber-500/40 rounded-xl flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between text-amber-300 text-xs font-mono font-bold">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                    TILL AUDIT DISCREPANCY
                  </span>
                  <span className="bg-amber-500/20 px-1.5 py-0.5 rounded">-KES 2,400</span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1">Till #04 (Terrace Bar Station)</h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Physical count differs from registered drawer float. Manager count needed.
                </p>
              </div>
              <button
                onClick={() => handleQuickAction('staff')}
                className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Investigate Till Session</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Alert 3 */}
            <div className="p-3.5 bg-orange-950/20 border border-orange-500/40 rounded-xl flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between text-orange-300 text-xs font-mono font-bold">
                  <span className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-orange-400" />
                    MAINTENANCE SLA
                  </span>
                  <span className="bg-orange-500/20 px-1.5 py-0.5 rounded">2h OVERDUE</span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1">Room 312 AC Cooling Fault</h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Assigned guest checked in. Compressor capacitor repair required.
                </p>
              </div>
              <button
                onClick={() => handleQuickAction('hotel')}
                className="w-full py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Assign Engineer Peter</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 4: LIVE OPERATIONS RADAR */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>LIVE OPERATIONS RADAR</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">All edge terminals connected</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Tables */}
            <div 
              onClick={() => handleQuickAction('pos')}
              className="p-3 bg-slate-850/80 border border-slate-750 hover:border-amber-500/50 rounded-xl cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-1">
                <span>TABLES</span>
                <Wine className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-lg font-bold text-white font-mono">17 / 24</div>
              <p className="text-[11px] text-amber-300 font-medium mt-1">70.8% Floor Occupied</p>
            </div>

            {/* Rooms */}
            <div 
              onClick={() => handleQuickAction('hotel')}
              className="p-3 bg-slate-850/80 border border-slate-750 hover:border-cyan-500/50 rounded-xl cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-1">
                <span>ROOMS</span>
                <Bed className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-lg font-bold text-white font-mono">31 / 40</div>
              <p className="text-[11px] text-cyan-300 font-medium mt-1">9 Clean & Available</p>
            </div>

            {/* KDS Active */}
            <div 
              onClick={() => handleQuickAction('kds')}
              className="p-3 bg-slate-850/80 border border-slate-750 hover:border-rose-500/50 rounded-xl cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-1">
                <span>KDS TICKETS</span>
                <Flame className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-lg font-bold text-white font-mono">8 Active</div>
              <p className="text-[11px] text-rose-300 font-medium mt-1">Avg pass speed 9.2m</p>
            </div>

            {/* Staff */}
            <div 
              onClick={() => handleQuickAction('staff')}
              className="p-3 bg-slate-850/80 border border-slate-750 hover:border-purple-500/50 rounded-xl cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-1">
                <span>STAFF ON DUTY</span>
                <Users className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-lg font-bold text-white font-mono">26 Active</div>
              <p className="text-[11px] text-purple-300 font-medium mt-1">100% Roster Clock-in</p>
            </div>

            {/* VIP Lounges */}
            <div 
              onClick={() => handleQuickAction('pos')}
              className="p-3 bg-slate-850/80 border border-slate-750 hover:border-emerald-500/50 rounded-xl cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-1">
                <span>VIP TABLES</span>
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-lg font-bold text-white font-mono">4 Active</div>
              <p className="text-[11px] text-emerald-300 font-medium mt-1">Min-Spend 100% Met</p>
            </div>
          </div>
        </div>

        {/* SECTION 5: QUICK COMMAND LAUNCHPAD */}
        <div className="p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-3">
          <h3 className="text-xs font-mono uppercase font-bold text-slate-400 tracking-wider">
            EXECUTIVE QUICK LAUNCHPAD
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            <button
              onClick={() => handleQuickAction('pos')}
              className="p-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border border-slate-700 transition-all hover:border-amber-500/40"
            >
              <Wine className="w-4 h-4 text-amber-400" />
              <span>+ Open POS Sale</span>
            </button>

            <button
              onClick={() => handleQuickAction('hotel')}
              className="p-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border border-slate-700 transition-all hover:border-cyan-500/40"
            >
              <Bed className="w-4 h-4 text-cyan-400" />
              <span>+ Hotel Check-In</span>
            </button>

            <button
              onClick={() => handleQuickAction('procurement')}
              className="p-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border border-slate-700 transition-all hover:border-emerald-500/40"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>+ Purchase Order</span>
            </button>

            <button
              onClick={() => handleQuickAction('crm')}
              className="p-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border border-slate-700 transition-all hover:border-purple-500/40"
            >
              <Users className="w-4 h-4 text-purple-400" />
              <span>+ New VIP Member</span>
            </button>

            <button
              onClick={() => handleQuickAction('events')}
              className="p-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border border-slate-700 transition-all hover:border-amber-400"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>+ Issue Event Ticket</span>
            </button>

            <button
              onClick={() => handleQuickAction('catalog')}
              className="p-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 border border-slate-700 transition-all hover:border-rose-400"
            >
              <Layers className="w-4 h-4 text-rose-400" />
              <span>+ Catalog Studio</span>
            </button>
          </div>
        </div>
      </div>

      {/* Universal Action Inbox Modal */}
      <UniversalInboxModal
        isOpen={inboxOpen}
        onClose={() => setInboxOpen(false)}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
};
