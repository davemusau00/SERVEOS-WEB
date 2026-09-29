import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { ChefHat, Clock, CheckCircle, RotateCcw, Flame, Wine, Layers, Utensils, AlertTriangle } from 'lucide-react';

export const KDSView: React.FC = () => {
  const { orders, bumpKdsTicket, recallKdsTicket } = useServOS();
  const [stationFilter, setStationFilter] = useState<'ALL' | 'BAR' | 'KITCHEN' | 'GRILL' | 'EXPO'>('ALL');
  const [kdsMode, setKdsMode] = useState<'ACTIVE' | 'BUMPED'>('ACTIVE');
  const [showAllDaySummary, setShowAllDaySummary] = useState<boolean>(true);

  // Active tickets needing prep
  const activeKdsOrders = orders.filter(o =>
    (o.state === 'SENT' || o.state === 'OPEN') &&
    o.items &&
    o.items.some(i => i.state === 'ROUTED' || i.state === 'PREPARING' || i.state === 'OPEN')
  );

  // Completed/bumped tickets
  const bumpedKdsOrders = orders.filter(o =>
    o.items && o.items.some(i => i.state === 'SERVED')
  );

  const displayedOrders = kdsMode === 'ACTIVE' ? activeKdsOrders : bumpedKdsOrders;

  // All-Day Summary: aggregate quantities of all active items across active tickets
  const allDaySummaryMap = new Map<string, { name: string; count: number; course?: string }>();
  activeKdsOrders.forEach(order => {
    order.items.forEach(item => {
      const key = `${item.productName}${item.portionName ? ` (${item.portionName})` : ''}`;
      const existing = allDaySummaryMap.get(key);
      if (existing) {
        existing.count += item.quantity;
      } else {
        allDaySummaryMap.set(key, { name: key, count: item.quantity, course: item.courseName });
      }
    });
  });

  const allDayItems = Array.from(allDaySummaryMap.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      {/* Header Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
            <ChefHat className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono truncate">
              Kitchen & Bar Display System (KDS Pass)
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
              <span>Active Tickets: <strong className="text-amber-400">{activeKdsOrders.length}</strong></span>
              <span>·</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Feed
              </span>
            </div>
          </div>
        </div>

        {/* View Mode & Station Filters */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setShowAllDaySummary(!showAllDaySummary)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
              showAllDaySummary
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All-Day Summary ({allDayItems.length})</span>
          </button>

          {/* Active vs Bumped Toggle */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setKdsMode('ACTIVE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                kdsMode === 'ACTIVE'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active Pass ({activeKdsOrders.length})
            </button>
            <button
              onClick={() => setKdsMode('BUMPED')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                kdsMode === 'BUMPED'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              History ({bumpedKdsOrders.length})
            </button>
          </div>

          {/* Station Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            {[
              { id: 'ALL', label: 'All Stations' },
              { id: 'BAR', label: 'Bar Pass' },
              { id: 'KITCHEN', label: 'Kitchen' },
              { id: 'GRILL', label: 'Grill' },
              { id: 'EXPO', label: 'Expo Pass' }
            ].map(st => (
              <button
                key={st.id}
                onClick={() => setStationFilter(st.id as any)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  stationFilter === st.id
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* All-Day Prep Summary Bar */}
      {showAllDaySummary && kdsMode === 'ACTIVE' && allDayItems.length > 0 && (
        <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex items-center gap-3 overflow-x-auto shrink-0">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider shrink-0 font-bold flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-400" /> All-Day Working Totals:
          </span>
          <div className="flex items-center gap-2">
            {allDayItems.map((item, i) => (
              <div
                key={i}
                className="bg-slate-950 border border-slate-750 px-2.5 py-1 rounded-lg flex items-center gap-2 text-xs shrink-0"
              >
                <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center">
                  {item.count}
                </span>
                <span className="text-slate-200 font-medium text-[11px]">{item.name}</span>
                {item.course && (
                  <span className="text-[9px] font-mono bg-slate-800 text-slate-400 px-1 rounded">
                    {item.course}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tickets Stream */}
      <div className="flex-1 overflow-x-auto overflow-y-auto p-4 flex flex-col sm:flex-row gap-4 items-stretch sm:items-start pb-24 lg:pb-6">
        {displayedOrders.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center text-slate-500 py-16">
            <CheckCircle className="w-12 h-12 text-slate-700 mb-2" />
            <p className="text-sm font-semibold text-slate-400">
              {kdsMode === 'ACTIVE' ? 'All passes are clear' : 'No bumped tickets yet'}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              {kdsMode === 'ACTIVE'
                ? 'New orders sent from POS terminals will appear here in real time.'
                : 'Tickets that have been marked ready will appear here.'}
            </p>
          </div>
        ) : (
          displayedOrders.map(order => {
            const isReady = order.items.every(i => i.state === 'SERVED');
            const hasHeldItems = order.items.some(i => i.courseStatus === 'HELD');

            return (
              <div
                key={order.id}
                className={`w-full sm:w-80 shrink-0 bg-slate-900 border rounded-xl shadow-lg overflow-hidden flex flex-col transition-all ${
                  isReady ? 'border-emerald-800/60 opacity-85' : 'border-slate-750'
                }`}
              >
                {/* Ticket Header */}
                <div className="p-3 bg-slate-850 border-b border-slate-750 flex justify-between items-start">
                  <div>
                    <div className="text-base font-bold text-white font-mono flex items-center gap-2">
                      <span>{order.tableName || order.tabName || order.orderNumber}</span>
                      {hasHeldItems && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          HELD COURSES
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-amber-400 font-mono">
                      #{order.orderNumber} · Waiter: {order.serverName}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-mono text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>Live</span>
                  </div>
                </div>

                {/* Ticket Items */}
                <div className="p-3 space-y-2 flex-1 max-h-[380px] overflow-y-auto">
                  {order.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className={`p-2.5 rounded-lg border transition-colors ${
                        item.courseStatus === 'HELD'
                          ? 'bg-slate-950/40 border-slate-800/60 opacity-70'
                          : 'bg-slate-950/80 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-bold text-slate-100">
                            {item.productName}
                          </span>
                        </div>
                        {item.portionName && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {item.portionName}
                          </span>
                        )}
                      </div>

                      {/* Course & Seat Badges */}
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {item.seatLabel && (
                          <span className="text-[9px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                            {item.seatLabel}
                          </span>
                        )}
                        {item.courseName && (
                          <span className="text-[9px] font-mono bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20">
                            {item.courseName}
                          </span>
                        )}
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          item.courseStatus === 'HELD'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {item.courseStatus === 'HELD' ? '⏸ HELD' : '🔥 FIRED'}
                        </span>
                      </div>

                      {item.modifiers.length > 0 && (
                        <div className="mt-1 pl-7 space-y-0.5">
                          {item.modifiers.map(m => (
                            <div key={m.modifierId} className="text-[11px] text-amber-300 font-medium">
                              • {m.name}
                            </div>
                          ))}
                        </div>
                      )}

                      {item.selectedMixers && item.selectedMixers.length > 0 && (
                        <div className="mt-1 pl-7 text-[11px] text-slate-400">
                          Mixers: {item.selectedMixers.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bump Bar / Action footer */}
                <div className="p-2.5 bg-slate-850 border-t border-slate-750 flex gap-2">
                  {kdsMode === 'ACTIVE' ? (
                    <button
                      onClick={() => bumpKdsTicket(order.id)}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Bump Ticket (Ready)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => recallKdsTicket(order.id)}
                      className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Recall Ticket to Pass</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
