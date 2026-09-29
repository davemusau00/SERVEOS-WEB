import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { HousekeepingTask, HousekeepingStatus } from '../../types/servos';
import { 
  Bed, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  Check, 
  X, 
  Filter, 
  Search,
  Eye,
  Wrench,
  ShieldAlert
} from 'lucide-react';

const INITIAL_HK_TASKS: HousekeepingTask[] = [
  {
    id: 'hk-101',
    roomId: 'rm-101',
    roomNumber: '101',
    roomType: 'Standard King',
    status: 'CLEAN',
    assignedStaffName: 'Mercy W.',
    priority: 'NORMAL',
    lastUpdated: '10:45 AM',
    ageMinutes: 0,
    checklist: {
      bedLinen: true,
      bathroomSanitized: true,
      towelsReplaced: true,
      luxuryAmenities: true,
      waterMinibarRestocked: true,
      electronicsDamageCheck: true
    }
  },
  {
    id: 'hk-102',
    roomId: 'rm-102',
    roomNumber: '102',
    roomType: 'Standard Twin',
    status: 'DIRTY',
    assignedStaffName: 'Jane Achieng',
    priority: 'HIGH',
    lastUpdated: '12:15 PM',
    ageMinutes: 18,
    checklist: {
      bedLinen: false,
      bathroomSanitized: false,
      towelsReplaced: false,
      luxuryAmenities: false,
      waterMinibarRestocked: false,
      electronicsDamageCheck: false
    }
  },
  {
    id: 'hk-103',
    roomId: 'rm-103',
    roomNumber: '103',
    roomType: 'Standard King',
    status: 'CLEANING',
    assignedStaffName: 'Sarah Nduta',
    priority: 'NORMAL',
    lastUpdated: '12:09 PM',
    ageMinutes: 24,
    checklist: {
      bedLinen: true,
      bathroomSanitized: true,
      towelsReplaced: false,
      luxuryAmenities: false,
      waterMinibarRestocked: false,
      electronicsDamageCheck: false
    }
  },
  {
    id: 'hk-104',
    roomId: 'rm-104',
    roomNumber: '104',
    roomType: 'Executive Room',
    status: 'INSPECTION',
    assignedStaffName: 'Supervisor Alex',
    priority: 'RUSH_CHECKIN',
    lastUpdated: '12:25 PM',
    ageMinutes: 8,
    checklist: {
      bedLinen: true,
      bathroomSanitized: true,
      towelsReplaced: true,
      luxuryAmenities: true,
      waterMinibarRestocked: true,
      electronicsDamageCheck: true
    }
  },
  {
    id: 'hk-105',
    roomId: 'rm-105',
    roomNumber: '105',
    roomType: 'Executive Room',
    status: 'DND',
    priority: 'NORMAL',
    lastUpdated: '08:30 AM',
    ageMinutes: 240,
    checklist: {
      bedLinen: false,
      bathroomSanitized: false,
      towelsReplaced: false,
      luxuryAmenities: false,
      waterMinibarRestocked: false,
      electronicsDamageCheck: false
    }
  },
  {
    id: 'hk-106',
    roomId: 'rm-312',
    roomNumber: '312',
    roomType: 'Deluxe Suite',
    status: 'MAINTENANCE',
    assignedStaffName: 'Engineering Peter',
    priority: 'HIGH',
    lastUpdated: '12:02 PM',
    ageMinutes: 31,
    checklist: {
      bedLinen: false,
      bathroomSanitized: false,
      towelsReplaced: false,
      luxuryAmenities: false,
      waterMinibarRestocked: false,
      electronicsDamageCheck: false
    },
    specialInstructions: 'AC cooling issue under technician inspection'
  }
];

export const HousekeepingBoard: React.FC = () => {
  const { showToast } = useServOS();
  const [tasks, setTasks] = useState<HousekeepingTask[]>(INITIAL_HK_TASKS);
  const [selectedTask, setSelectedTask] = useState<HousekeepingTask | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const getStatusBadge = (st: HousekeepingStatus) => {
    switch (st) {
      case 'CLEAN':
        return { label: 'CLEAN & READY', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case 'DIRTY':
        return { label: 'DIRTY / VACANT', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
      case 'CLEANING':
        return { label: 'IN PROGRESS', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'INSPECTION':
        return { label: 'READY FOR INSPECT', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      case 'DND':
        return { label: 'DO NOT DISTURB', bg: 'bg-slate-800 text-slate-400 border-slate-700' };
      case 'MAINTENANCE':
        return { label: 'MAINTENANCE', bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40' };
    }
  };

  const handleUpdateChecklist = (field: keyof HousekeepingTask['checklist']) => {
    if (!selectedTask) return;
    const updated = {
      ...selectedTask,
      checklist: {
        ...selectedTask.checklist,
        [field]: !selectedTask.checklist[field]
      }
    };
    setSelectedTask(updated);
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const handleSetRoomClean = (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          status: 'CLEAN',
          ageMinutes: 0,
          checklist: {
            bedLinen: true,
            bathroomSanitized: true,
            towelsReplaced: true,
            luxuryAmenities: true,
            waterMinibarRestocked: true,
            electronicsDamageCheck: true
          }
        };
      }
      return t;
    }));
    setSelectedTask(null);
    showToast('Room marked inspected and available for guest check-in!', 'success');
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold uppercase">
              HOUSEKEEPING WORKSPACE
            </span>
            <span className="text-xs text-slate-400 font-mono">Live Turnover & Inspection Board</span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">Room Status & Cleaner Allocations</h2>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1 overflow-x-auto text-xs font-mono">
          {(['ALL', 'DIRTY', 'CLEANING', 'INSPECTION', 'CLEAN', 'MAINTENANCE'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg transition-colors font-bold whitespace-nowrap ${
                statusFilter === st ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Housekeeping Tasks Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase">
              <th className="p-3">Room</th>
              <th className="p-3">Status</th>
              <th className="p-3">Assigned Staff</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Elapsed Age</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {filteredTasks.map(task => {
              const badge = getStatusBadge(task.status);
              return (
                <tr key={task.id} className="hover:bg-slate-850/50 transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-white text-sm">Room {task.roomNumber}</div>
                    <div className="text-[10px] text-slate-400">{task.roomType}</div>
                  </td>

                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                      {badge.label}
                    </span>
                  </td>

                  <td className="p-3 text-slate-300">
                    {task.assignedStaffName || '— Unassigned —'}
                  </td>

                  <td className="p-3">
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                      task.priority === 'RUSH_CHECKIN' ? 'bg-rose-500/20 text-rose-300' :
                      task.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-300' :
                      'text-slate-400'
                    }`}>
                      {task.priority}
                    </span>
                  </td>

                  <td className="p-3 text-slate-400">
                    {task.ageMinutes > 0 ? `${task.ageMinutes}m ago` : '✓ Updated'}
                  </td>

                  <td className="p-3 text-right">
                    <button
                      onClick={() => setSelectedTask(task)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-750 text-amber-300 rounded-lg text-xs font-bold border border-slate-700 transition-colors"
                    >
                      Checklist
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE CLEANER INSPECTION CHECKLIST MODAL */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase font-bold">Mobile Cleaner Checklist</span>
                <h3 className="text-base font-bold text-white">Room {selectedTask.roomNumber} ({selectedTask.roomType})</h3>
              </div>
              <button onClick={() => setSelectedTask(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 font-mono text-xs">
              {[
                { key: 'bedLinen', label: '1. Fresh Linen & Bed Made' },
                { key: 'bathroomSanitized', label: '2. Bathroom Fully Sanitized' },
                { key: 'towelsReplaced', label: '3. Towels & Bathrobe Replaced' },
                { key: 'luxuryAmenities', label: '4. Toiletries & Amenities Restocked' },
                { key: 'waterMinibarRestocked', label: '5. Mineral Water & Minibar Checked' },
                { key: 'electronicsDamageCheck', label: '6. AC, Lights & TV Electronics Tested' }
              ].map(item => {
                const checked = selectedTask.checklist[item.key as keyof HousekeepingTask['checklist']];
                return (
                  <div
                    key={item.key}
                    onClick={() => handleUpdateChecklist(item.key as any)}
                    className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${
                      checked ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-slate-850 border-slate-750 text-slate-300'
                    }`}
                  >
                    <span className="font-semibold">{item.label}</span>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                      checked ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-600'
                    }`}>
                      {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedTask(null)}
                className="px-3 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => handleSetRoomClean(selectedTask.id)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Clean & Inspected</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
