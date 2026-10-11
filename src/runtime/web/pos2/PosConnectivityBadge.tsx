import React from 'react';
import {Wifi, WifiOff, AlertTriangle, Loader2} from 'lucide-react';

type ConnectivityState = 'online' | 'offline' | 'syncing' | 'unknown';

interface PosConnectivityBadgeProps {
  state: ConnectivityState;
  pendingCount?: number;
  unknownCount?: number;
  className?: string;
}

export function PosConnectivityBadge({
  state,
  pendingCount = 0,
  unknownCount = 0,
  className = ''
}: PosConnectivityBadgeProps) {
  const config = {
    online: {
      icon: Wifi,
      color: 'text-emerald-400',
      bg: 'bg-emerald-900/30',
      border: 'border-emerald-700',
      label: 'Online',
      tooltip: 'Connected to server'
    },
    offline: {
      icon: WifiOff,
      color: 'text-amber-400',
      bg: 'bg-amber-900/30',
      border: 'border-amber-700',
      label: 'Offline',
      tooltip: 'Working offline - changes will sync when reconnected'
    },
    syncing: {
      icon: Loader2,
      color: 'text-sky-400',
      bg: 'bg-sky-900/30',
      border: 'border-sky-700',
      label: 'Syncing...',
      tooltip: 'Synchronizing with server...'
    },
    unknown: {
      icon: AlertTriangle,
      color: 'text-rose-400',
      bg: 'bg-rose-900/30',
      border: 'border-rose-700',
      label: 'Unknown',
      tooltip: 'Connection state unknown'
    }
  }[state];

  const Icon = config.icon;
  const hasIssues = unknownCount > 0;
  const totalPending = pendingCount + unknownCount;

  return (
    <button
      type="button"
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border
        ${config.bg} ${config.border} ${config.color}
        ${className}
        hover:opacity-80 transition-opacity
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900
      `}
      title={`${config.tooltip}${totalPending > 0 ? ` (${totalPending} pending${unknownCount > 0 ? `, ${unknownCount} unknown` : ''})` : ''}`}
      disabled={false}
    >
      <Icon className="h-4 w-4 animate-spin" />
      <span className="text-sm font-medium">{config.label}</span>
      {totalPending > 0 && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
          unknownCount > 0 ? 'bg-rose-500/80 text-white' : 'bg-sky-500/80 text-white'
        }`}>
          {totalPending}
        </span>
      )}
    </button>
  );
}