import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { MaintenanceWorkOrder, MaintenancePriority, MaintenanceStatus } from '../../types/servos';
import { 
  Wrench, 
  Plus, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  DollarSign, 
  User, 
  X, 
  Check, 
  Sparkles,
  Zap
} from 'lucide-react';

const INITIAL_WORK_ORDERS: MaintenanceWorkOrder[] = [
  {
    id: 'wo-01',
    orderNumber: 'MT-0821',
    roomId: 'rm-312',
    roomNumber: '312',
    assetName: 'Daikin Inverter Split AC',
    issueDescription: 'AC compressor not cooling, ambient temp 27.8°C. Loud buzzing noise on start.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    reportedAt: '10:14 AM',
    assignedTechnician: 'Peter Otieno (Engineering)',
    partsUsed: '1 × 45uF AC Run Capacitor',
    partsCostKes: 3500,
    laborCostKes: 2000
  },
  {
    id: 'wo-02',
    orderNumber: 'MT-0822',
    roomId: 'rm-204',
    roomNumber: '204',
    assetName: 'Hansgrohe Rain Shower Mixer',
    issueDescription: 'Low hot water pressure and slight dripping from thermostatic cartridge.',
    priority: 'MEDIUM',
    status: 'ASSIGNED',
    reportedAt: '11:30 AM',
    assignedTechnician: 'Michael Muriithi (Plumbing)',
    partsCostKes: 1800,
    laborCostKes: 1500
  },
  {
    id: 'wo-03',
    orderNumber: 'MT-0820',
    roomId: 'rm-101',
    roomNumber: '101',
    assetName: 'Smart RFID Door Lock Assa Abloy',
    issueDescription: 'Keycard reader battery low alert (below 15%). Replaced 4x AA Lithium cells.',
    priority: 'LOW',
    status: 'COMPLETED',
    reportedAt: '08:45 AM',
    assignedTechnician: 'Peter Otieno (Engineering)',
    partsUsed: '4 × Energizer AA Lithium Batteries',
    partsCostKes: 1200,
    laborCostKes: 800,
    resolvedAt: '09:20 AM',
    resolutionNotes: 'Keycard reader firmware synced and tested with master badge.'
  }
];

export const MaintenanceWorkspace: React.FC = () => {
  const { showToast } = useServOS();
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>(INITIAL_WORK_ORDERS);
  const [newModalOpen, setNewModalOpen] = useState<boolean>(false);

  // New ticket state
  const [roomNum, setRoomNum] = useState<string>('105');
  const [assetName, setAssetName] = useState<string>('Mini Bar Refrigerator');
  const [issueDesc, setIssueDesc] = useState<string>('Not cooling drinks adequately');
  const [priority, setPriority] = useState<MaintenancePriority>('MEDIUM');

  const getPriorityBadge = (p: MaintenancePriority) => {
    switch (p) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const handleResolveOrder = (woId: string) => {
    setWorkOrders(prev => prev.map(w => {
      if (w.id === woId) {
        return {
          ...w,
          status: 'COMPLETED',
          resolvedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          resolutionNotes: 'Repaired by engineering, tested and cleared.'
        };
      }
      return w;
    }));

    showToast('Maintenance ticket closed and logged to asset ledger!', 'success');
  };

  const handleCreateOrder = () => {
    const newWo: MaintenanceWorkOrder = {
      id: `wo-${Date.now()}`,
      orderNumber: `MT-08${Math.floor(Math.random() * 80 + 25)}`,
      roomId: `rm-${roomNum}`,
      roomNumber: roomNum,
      assetName,
      issueDescription: issueDesc,
      priority,
      status: 'ASSIGNED',
      reportedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      assignedTechnician: 'Peter Otieno (Engineering)',
      partsCostKes: 0,
      laborCostKes: 1500
    };

    setWorkOrders(prev => [newWo, ...prev]);
    setNewModalOpen(false);
    showToast(`Ticket #${newWo.orderNumber} assigned to Engineering!`, 'success');
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[10px] font-mono font-bold uppercase">
              FACILITIES & ENGINEERING
            </span>
            <span className="text-xs text-slate-400 font-mono">Asset Maintenance & Work Orders</span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">Room Work Orders & Asset Repairs</h2>
        </div>

        <button
          onClick={() => setNewModalOpen(true)}
          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Work Order</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {workOrders.map(wo => (
          <div
            key={wo.id}
            className={`p-5 rounded-2xl border transition-all ${
              wo.status === 'COMPLETED'
                ? 'bg-slate-950/40 border-slate-800 opacity-70'
                : 'bg-slate-900 border-slate-750'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-amber-400">#{wo.orderNumber}</span>
                <h3 className="text-base font-bold text-white mt-0.5">Room {wo.roomNumber}</h3>
                <p className="text-xs text-slate-400 font-mono">{wo.assetName}</p>
              </div>

              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getPriorityBadge(wo.priority)}`}>
                {wo.priority}
              </span>
            </div>

            <p className="text-xs text-slate-300 mt-2.5 leading-relaxed bg-slate-850 p-2.5 rounded-xl border border-slate-750">
              {wo.issueDescription}
            </p>

            <div className="mt-3 space-y-1.5 text-xs font-mono text-slate-400">
              <div className="flex justify-between">
                <span>Assigned Tech:</span>
                <span className="text-white font-semibold">{wo.assignedTechnician}</span>
              </div>
              {wo.partsUsed && (
                <div className="flex justify-between">
                  <span>Parts Used:</span>
                  <span className="text-amber-300">{wo.partsUsed}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Estimated Cost:</span>
                <span className="text-emerald-400 font-bold">KES {(wo.partsCostKes + wo.laborCostKes).toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400">Reported {wo.reportedAt}</span>
              {wo.status !== 'COMPLETED' ? (
                <button
                  onClick={() => handleResolveOrder(wo.id)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-1 font-mono transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark Repaired</span>
                </button>
              ) : (
                <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* NEW WORK ORDER MODAL */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Create Maintenance Work Order</h3>
              <button onClick={() => setNewModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Room Number</label>
                <input
                  type="text"
                  value={roomNum}
                  onChange={e => setRoomNum(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Asset Name</label>
                <input
                  type="text"
                  value={assetName}
                  onChange={e => setAssetName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Fault Description</label>
                <textarea
                  rows={3}
                  value={issueDesc}
                  onChange={e => setIssueDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 text-amber-300 font-bold rounded-xl p-2 focus:outline-none"
                >
                  <option value="LOW">Low (Routine)</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High (Guest Impact)</option>
                  <option value="CRITICAL">Critical Emergency</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setNewModalOpen(false)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrder}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
              >
                Dispatch Work Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
