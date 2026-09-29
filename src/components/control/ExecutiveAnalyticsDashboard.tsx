import React, { useState, useMemo } from 'react';
import { useServOS } from '../../context/ServOSContext';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Bed,
  Wine,
  ShieldAlert,
  Percent,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Filter,
  Download,
  Building2,
  Receipt,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PieChart as PieIcon,
  BarChart3
} from 'lucide-react';

export const ExecutiveAnalyticsDashboard: React.FC = () => {
  const {
    currentProperty,
    currentOutlet,
    orders,
    hotelRooms,
    guestFolios,
    stockItems,
    stockMovements,
    anomalyAlerts,
    approvalRequests,
    userRole,
    showToast
  } = useServOS();

  const [timeRange, setTimeRange] = useState<'TODAY' | '7D' | '30D' | 'MTD'>('7D');
  const [activeMetricTab, setActiveMetricTab] = useState<'ALL' | 'REVENUE' | 'OCCUPANCY' | 'YIELD'>('ALL');

  // --- 1. DAILY REVENUE TREND DATA ---
  const revenueTrendData = useMemo(() => {
    if (timeRange === 'TODAY') {
      return [
        { label: '08:00', posSales: 18500, roomCharges: 0, events: 0, taxCollected: 2960, total: 18500 },
        { label: '10:00', posSales: 34200, roomCharges: 22000, events: 0, taxCollected: 8992, total: 56200 },
        { label: '12:00', posSales: 89400, roomCharges: 0, events: 15000, taxCollected: 16704, total: 104400 },
        { label: '14:00', posSales: 112000, roomCharges: 44000, events: 25000, taxCollected: 28960, total: 181000 },
        { label: '16:00', posSales: 78500, roomCharges: 0, events: 10000, taxCollected: 14160, total: 88500 },
        { label: '18:00', posSales: 145000, roomCharges: 22000, events: 45000, taxCollected: 33920, total: 212000 },
        { label: '20:00', posSales: 198000, roomCharges: 0, events: 65000, taxCollected: 42080, total: 263000 },
        { label: '22:00', posSales: 164000, roomCharges: 0, events: 20000, taxCollected: 29440, total: 184000 }
      ];
    }

    if (timeRange === '30D' || timeRange === 'MTD') {
      return [
        { label: 'Week 1', posSales: 940000, roomCharges: 480000, events: 210000, taxCollected: 260800, total: 1630000 },
        { label: 'Week 2', posSales: 1120000, roomCharges: 540000, events: 380000, taxCollected: 326400, total: 2040000 },
        { label: 'Week 3', posSales: 1280000, roomCharges: 610000, events: 450000, taxCollected: 374400, total: 2340000 },
        { label: 'Week 4', posSales: 1045000, roomCharges: 520000, events: 320000, taxCollected: 301600, total: 1885000 }
      ];
    }

    // Default 7 Days
    return [
      { label: 'Wed 17', posSales: 142000, roomCharges: 66000, events: 25000, taxCollected: 37280, total: 233000 },
      { label: 'Thu 18', posSales: 158000, roomCharges: 88000, events: 40000, taxCollected: 45760, total: 286000 },
      { label: 'Fri 19', posSales: 285000, roomCharges: 110000, events: 95000, taxCollected: 78400, total: 490000 },
      { label: 'Sat 20', posSales: 340000, roomCharges: 132000, events: 150000, taxCollected: 99520, total: 622000 },
      { label: 'Sun 21', posSales: 245000, roomCharges: 110000, events: 80000, taxCollected: 69600, total: 435000 },
      { label: 'Mon 22', posSales: 135000, roomCharges: 66000, events: 15000, taxCollected: 34560, total: 216000 },
      { label: 'Tue 23', posSales: 215000, roomCharges: 88000, events: 55000, taxCollected: 57280, total: 358000 }
    ];
  }, [timeRange]);

  // --- 2. OCCUPANCY RATE & ROOM YIELD DATA ---
  const occupancyTrendData = useMemo(() => {
    return [
      { day: 'Wed 17', date: '09/17', occupancyRate: 68.5, targetRate: 80.0, occupiedRooms: 7, totalRooms: 10, adr: 21500, revPar: 14727 },
      { day: 'Thu 18', date: '09/18', occupancyRate: 75.0, targetRate: 80.0, occupiedRooms: 8, totalRooms: 10, adr: 22000, revPar: 16500 },
      { day: 'Fri 19', date: '09/19', occupancyRate: 92.5, targetRate: 80.0, occupiedRooms: 9, totalRooms: 10, adr: 24500, revPar: 22662 },
      { day: 'Sat 20', date: '09/20', occupancyRate: 100.0, targetRate: 80.0, occupiedRooms: 10, totalRooms: 10, adr: 26000, revPar: 26000 },
      { day: 'Sun 21', date: '09/21', occupancyRate: 88.0, targetRate: 80.0, occupiedRooms: 9, totalRooms: 10, adr: 23500, revPar: 20680 },
      { day: 'Mon 22', date: '09/22', occupancyRate: 70.0, targetRate: 80.0, occupiedRooms: 7, totalRooms: 10, adr: 21000, revPar: 14700 },
      { day: 'Tue 23', date: '09/23', occupancyRate: 84.6, targetRate: 80.0, occupiedRooms: 8, totalRooms: 10, adr: 22800, revPar: 19288 }
    ];
  }, []);

  // --- 3. BEVERAGE YIELD & AvT TREND DATA ---
  const beverageYieldTrendData = useMemo(() => {
    return [
      { day: 'Wed 17', date: '09/17', yieldScore: 97.8, standardTarget: 96.0, theoreticalMl: 14200, actualUsedMl: 14520, spillageLossKes: 1180 },
      { day: 'Thu 18', date: '09/18', yieldScore: 96.4, standardTarget: 96.0, theoreticalMl: 16800, actualUsedMl: 17420, spillageLossKes: 2294 },
      { day: 'Fri 19', date: '09/19', yieldScore: 94.2, standardTarget: 96.0, theoreticalMl: 31200, actualUsedMl: 33100, spillageLossKes: 7030 },
      { day: 'Sat 20', date: '09/20', yieldScore: 95.1, standardTarget: 96.0, theoreticalMl: 38400, actualUsedMl: 40380, spillageLossKes: 7326 },
      { day: 'Sun 21', date: '09/21', yieldScore: 96.9, standardTarget: 96.0, theoreticalMl: 24500, actualUsedMl: 25280, spillageLossKes: 2886 },
      { day: 'Mon 22', date: '09/22', yieldScore: 98.2, standardTarget: 96.0, theoreticalMl: 12100, actualUsedMl: 12320, spillageLossKes: 814 },
      { day: 'Tue 23', date: '09/23', yieldScore: 97.4, standardTarget: 96.0, theoreticalMl: 22400, actualUsedMl: 23000, spillageLossKes: 2220 }
    ];
  }, []);

  // --- 4. TENDER TYPE BREAKDOWN PIE DATA ---
  const paymentChannelData = [
    { name: 'Manual M-Pesa', value: 58, amount: 1531200, color: '#10B981' },
    { name: 'EMV Card Terminal (Ingenico)', value: 26, amount: 686400, color: '#3B82F6' },
    { name: 'Hotel Room Folio Postings', value: 11, amount: 290400, color: '#F59E0B' },
    { name: 'Cash Drawer Float', value: 5, amount: 132000, color: '#8B5CF6' }
  ];

  // --- 5. CATEGORY YIELD VARIANCE RANKING ---
  const categoryYieldBreakdown = [
    { category: 'Premium Whiskey (Jameson/Glenfiddich)', theoretical: 8400, actual: 8750, variancePct: -4.1, lossKes: 3955, status: 'WATCH' },
    { category: 'London Dry Gin (Tanqueray/Hendricks)', theoretical: 6200, actual: 6380, variancePct: -2.9, lossKes: 1728, status: 'NORMAL' },
    { category: 'Prestige Champagne (Dom Pérignon)', theoretical: 1500, actual: 1500, variancePct: 0.0, lossKes: 0, status: 'PERFECT' },
    { category: 'Draught Beer & Lagers (Tusker/Guinness)', theoretical: 12400, actual: 12620, variancePct: -1.7, lossKes: 1840, status: 'NORMAL' }
  ];

  // Aggregated totals
  const totalPeriodRevenue = useMemo(() => {
    return revenueTrendData.reduce((acc, curr) => acc + curr.total, 0);
  }, [revenueTrendData]);

  const averageDailyOccupancy = useMemo(() => {
    const sum = occupancyTrendData.reduce((acc, curr) => acc + curr.occupancyRate, 0);
    return (sum / occupancyTrendData.length).toFixed(1);
  }, [occupancyTrendData]);

  const averageBeverageYield = useMemo(() => {
    const sum = beverageYieldTrendData.reduce((acc, curr) => acc + curr.yieldScore, 0);
    return (sum / beverageYieldTrendData.length).toFixed(1);
  }, [beverageYieldTrendData]);

  const totalSpillageVarianceLoss = useMemo(() => {
    return beverageYieldTrendData.reduce((acc, curr) => acc + curr.spillageLossKes, 0);
  }, [beverageYieldTrendData]);

  const handleExportSummary = () => {
    showToast(`Executive Analytics Briefing (PDF/CSV) generated for ${currentProperty.name}`, 'success');
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Time Range Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Executive Control & Performance Telemetry</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                LIVE AUDIT
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Multi-channel Revenue, Hospitality RevPAR & Physical Bottle Yield Analytics
            </p>
          </div>
        </div>

        {/* Range & Category toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric category switcher */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'REVENUE', 'OCCUPANCY', 'YIELD'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveMetricTab(tab)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  activeMetricTab === tab
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'ALL' ? '360° Overview' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Time range selector */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['TODAY', '7D', '30D', 'MTD'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg transition-colors ${
                  timeRange === range
                    ? 'bg-slate-800 text-amber-300 border border-slate-700 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          {/* Export Report */}
          <button
            onClick={handleExportSummary}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            title="Download executive KPI report"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* 4 Executive KPI Headline Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Gross Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Gross Turnover</span>
            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-white">
              KES {totalPeriodRevenue.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
            <span className="text-emerald-400 flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" /> +14.8% vs prior
            </span>
            <span className="text-slate-400">VAT + Levy Incl.</span>
          </div>
          <div className="w-full bg-slate-800 h-1 mt-3 rounded-full overflow-hidden">
            <div className="bg-emerald-400 h-full w-[82%]" />
          </div>
        </div>

        {/* Card 2: Hotel Room Occupancy & ADR */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Hotel Occupancy</span>
            <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
              <Bed className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-cyan-300">
              {averageDailyOccupancy}%
            </span>
            <span className="text-xs text-slate-400 font-mono">/ 80.0% Target</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
            <span className="text-emerald-400 flex items-center gap-0.5">
              <ArrowUpRight className="w-3.5 h-3.5" /> +4.6% benchmark
            </span>
            <span className="text-slate-300 font-bold">ADR KES 22.8k</span>
          </div>
          <div className="w-full bg-slate-800 h-1 mt-3 rounded-full overflow-hidden">
            <div className="bg-cyan-400 h-full w-[85%]" />
          </div>
        </div>

        {/* Card 3: Beverage Yield Efficiency (AvT) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">AvT Beverage Yield</span>
            <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
              <Wine className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-amber-300">
              {averageBeverageYield}%
            </span>
            <span className="text-xs text-slate-400 font-mono">Efficiency</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
            <span className="text-rose-400 flex items-center gap-0.5">
              <TrendingDown className="w-3.5 h-3.5" /> -KES {totalSpillageVarianceLoss.toLocaleString()} Loss
            </span>
            <span className="text-slate-400">96% Par Target</span>
          </div>
          <div className="w-full bg-slate-800 h-1 mt-3 rounded-full overflow-hidden">
            <div className="bg-amber-400 h-full w-[97%]" />
          </div>
        </div>

        {/* Card 4: Control Engine Anomaly Score */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Audit Integrity</span>
            <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-purple-300">
              98.2%
            </span>
            <span className="text-xs text-slate-400 font-mono">Clean Audit</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
            <span className="text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {anomalyAlerts.filter(a => a.status === 'OPEN').length} Open Alerts
            </span>
            <span className="text-slate-300">
              {approvalRequests.filter(a => a.status === 'PENDING').length} Approvals
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1 mt-3 rounded-full overflow-hidden">
            <div className="bg-purple-400 h-full w-[98%]" />
          </div>
        </div>
      </div>

      {/* SECTION 1: REVENUE TELEMETRY CHART & PAYMENT CHANNELS */}
      {(activeMetricTab === 'ALL' || activeMetricTab === 'REVENUE') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Area & Bar Revenue Chart (2 Cols) */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-md flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>Multi-Stream Revenue Trajectory (KES)</span>
                </h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Breakdown by POS F&B, Lodging Folios, VIP Packages & Fiscal VAT
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> POS F&B
                </span>
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" /> Hotel Rooms
                </span>
                <span className="flex items-center gap-1.5 text-purple-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /> VIP Events
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="posSalesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="roomsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="eventsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A855F7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#A855F7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#64748B"
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                  />
                  <YAxis
                    stroke="#64748B"
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                    formatter={(value: any, name: any) => [
                      `KES ${Number(value).toLocaleString()}`,
                      name === 'posSales' ? 'POS F&B Sales' : name === 'roomCharges' ? 'Hotel Room Charges' : name === 'events' ? 'VIP Packages' : 'Total'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="posSales"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#posSalesGrad)"
                    name="posSales"
                  />
                  <Area
                    type="monotone"
                    dataKey="roomCharges"
                    stroke="#06B6D4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#roomsGrad)"
                    name="roomCharges"
                  />
                  <Area
                    type="monotone"
                    dataKey="events"
                    stroke="#A855F7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#eventsGrad)"
                    name="events"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Payment Channel Donut Distribution (1 Col) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-md flex flex-col justify-between">
            <div className="pb-3 mb-2 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-emerald-400" />
                <span>Settlement Tender Split</span>
              </h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Manual M-Pesa vs EMV & Room Folios
              </p>
            </div>

            <div className="h-44 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentChannelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentChannelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }}
                    formatter={(value: any, name: any, item: any) => [
                      `${value}% (KES ${item.payload.amount.toLocaleString()})`,
                      name
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center pointer-events-none">
                <span className="text-xs font-mono text-slate-400">Total</span>
                <span className="text-sm font-bold font-mono text-white">100%</span>
              </div>
            </div>

            <div className="space-y-2 mt-2 pt-2 border-t border-slate-800/80">
              {paymentChannelData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-300 truncate max-w-[130px]">{item.name.split('(')[0]}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-white font-bold">{item.value}%</span>
                    <span className="text-[10px] text-slate-500 ml-1.5">KES {(item.amount / 1000).toFixed(0)}k</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: HOTEL OCCUPANCY & REVPAR VELOCITY */}
      {(activeMetricTab === 'ALL' || activeMetricTab === 'OCCUPANCY') && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Bed className="w-4 h-4 text-cyan-400" />
                <span>Hotel Room Occupancy Rate (%) & RevPAR Trajectory</span>
              </h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Compares actual occupancy percentage against the 80% operational break-even target.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Occupancy %
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Target (80%)
              </span>
              <span className="flex items-center gap-1 text-purple-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-400" /> RevPAR (KES)
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={occupancyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="day" stroke="#64748B" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis
                  yAxisId="left"
                  stroke="#64748B"
                  domain={[40, 100]}
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickFormatter={(val) => `${val}%`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#64748B"
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  formatter={(value: any, name: any) => [
                    name === 'occupancyRate' ? `${value}%` : name === 'targetRate' ? `${value}%` : `KES ${Number(value).toLocaleString()}`,
                    name === 'occupancyRate' ? 'Occupancy Rate' : name === 'targetRate' ? 'Target Benchmark' : 'RevPAR'
                  ]}
                />
                <Bar yAxisId="left" dataKey="occupancyRate" fill="#06B6D4" radius={[6, 6, 0, 0]} maxBarSize={36} name="occupancyRate" />
                <Line yAxisId="left" type="monotone" dataKey="targetRate" stroke="#10B981" strokeDasharray="5 5" strokeWidth={2} dot={false} name="targetRate" />
                <Line yAxisId="right" type="monotone" dataKey="revPar" stroke="#C084FC" strokeWidth={2.5} dot={{ fill: '#C084FC', r: 4 }} name="revPar" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* SECTION 3: BEVERAGE YIELD & AvT VARIANCE MONITORING */}
      {(activeMetricTab === 'ALL' || activeMetricTab === 'YIELD') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Yield % Trend Line Chart (2 Cols) */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Wine className="w-4 h-4 text-amber-400" />
                  <span>Beverage Yield Efficiency & Spillage Trend</span>
                </h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  AvT yield performance against 96.0% target tolerance benchmark
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Yield Score %
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Par (96%)
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Spillage Loss (KES)
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={beverageYieldTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748B" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                  <YAxis
                    yAxisId="left"
                    stroke="#64748B"
                    domain={[90, 100]}
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#64748B"
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    tickFormatter={(val) => `KES ${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                    formatter={(value: any, name: any) => [
                      name === 'yieldScore' ? `${value}%` : name === 'standardTarget' ? `${value}%` : `KES ${Number(value).toLocaleString()}`,
                      name === 'yieldScore' ? 'Yield Efficiency' : name === 'standardTarget' ? 'Standard Par' : 'Spillage Loss'
                    ]}
                  />
                  <Bar yAxisId="right" dataKey="spillageLossKes" fill="#F43F5E" opacity={0.6} radius={[4, 4, 0, 0]} maxBarSize={28} name="spillageLossKes" />
                  <Line yAxisId="left" type="monotone" dataKey="yieldScore" stroke="#F59E0B" strokeWidth={3} dot={{ fill: '#F59E0B', r: 4 }} name="yieldScore" />
                  <Line yAxisId="left" type="monotone" dataKey="standardTarget" stroke="#10B981" strokeDasharray="4 4" strokeWidth={1.5} dot={false} name="standardTarget" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category AvT Table Breakdown (1 Col) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-md flex flex-col justify-between">
            <div className="pb-3 mb-2 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>High-Risk Spirit Categories</span>
              </h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Variance loss breakdown by spirit classification
              </p>
            </div>

            <div className="space-y-2.5 flex-1 flex flex-col justify-center">
              {categoryYieldBreakdown.map((item) => (
                <div key={item.category} className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 truncate max-w-[150px]">{item.category}</span>
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                      item.status === 'PERFECT' ? 'bg-emerald-500/20 text-emerald-300' :
                      item.status === 'WATCH' ? 'bg-rose-500/20 text-rose-300 animate-pulse' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>
                      {item.variancePct === 0 ? '0.0% Exact' : `${item.variancePct}%`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1">
                    <span>AvT: {item.theoretical.toLocaleString()} / {item.actual.toLocaleString()} ml</span>
                    <span className={item.lossKes > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {item.lossKes > 0 ? `-KES ${item.lossKes.toLocaleString()}` : 'KES 0.00'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Total Yield Spillage Loss:</span>
              <span className="font-bold text-rose-400">KES {totalSpillageVarianceLoss.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
