import React, {useState} from 'react';
import {LogIn, Users, Clock, AlertCircle, ChevronDown, Wifi, WifiOff} from 'lucide-react';
import {PosConnectivityBadge} from './PosConnectivityBadge';
import {format} from 'date-fns';

interface ShiftHeaderProps {
  venueName: string;
  outletName: string;
  cashierName: string;
  shiftStartedAt: string | null;
  ticketCount: number;
  connectivityState: 'online' | 'offline' | 'syncing' | 'unknown';
  pendingCount: number;
  unknownCount: number;
  onShiftAction: (action: 'open' | 'close' | 'cashIn' | 'cashOut') => void;
  onViewTickets: () => void;
  disabled?: boolean;
}

export function ShiftHeader({
  venueName,
  outletName,
  cashierName,
  shiftStartedAt,
  ticketCount,
  connectivityState,
  pendingCount,
  unknownCount,
  onShiftAction,
  onViewTickets,
  disabled = false
}: ShiftHeaderProps) {
  const [showShiftMenu, setShowShiftMenu] = useState(false);
  const shiftDuration = shiftStartedAt
    ? Math.floor((Date.now() - new Date(shiftStartedAt).getTime()) / 60000)
    : 0;

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-950 border-b border-slate-800">
      <div className="flex items-center justify-between h-14 px-4 gap-4">
        <div className="flex-1 min-w-0 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">{venueName}</p>
              <p className="text-xs text-slate-400 truncate">{outletName}</p>
            </div>
          </div>

          {shiftStartedAt && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-700">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-sm text-slate-300 font-mono tabular-nums">
                Shift: {formatDuration(shiftDuration)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <PosConnectivityBadge
            state={connectivityState}
            pendingCount={pendingCount}
            unknownCount={unknownCount}
          />

          {ticketCount > 0 && (
            <button
              type="button"
              onClick={onViewTickets}
              className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-700 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              disabled={disabled}
            >
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Tickets ({ticketCount})</span>
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowShiftMenu(!showShiftMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
              disabled={disabled}
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline text-sm font-medium">{cashierName}</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {showShiftMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-slate-700 bg-slate-950 shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-xs text-slate-400">Cashier: {cashierName}</p>
                  {shiftStartedAt && (
                    <p className="text-xs text-slate-400">Shift started: {format(new Date(shiftStartedAt), 'HH:mm')}</p>
                  )}
                </div>
                {!shiftStartedAt ? (
                  <button
                    type="button"
                    onClick={() => {onShiftAction('open'); setShowShiftMenu(false);}}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-800 flex items-center gap-2"
                  >
                    <LogIn className="h-4 w-4" />
                    Open Shift
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {onShiftAction('cashIn'); setShowShiftMenu(false);}}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-800 flex items-center gap-2"
                    >
                      Cash In
                    </button>
                    <button
                      type="button"
                      onClick={() => {onShiftAction('cashOut'); setShowShiftMenu(false);}}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-800 flex items-center gap-2"
                    >
                      Cash Out
                    </button>
                    <hr className="border-slate-800 my-1" />
                    <button
                      type="button"
                      onClick={() => {onShiftAction('close'); setShowShiftMenu(false);}}
                      className="w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10 flex items-center gap-2"
                    >
                      Close Shift
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}