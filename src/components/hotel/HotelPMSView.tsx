import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { HotelRoom, GuestStay, GuestFolio } from '../../types/servos';
import { 
  Bed, 
  UserCheck, 
  Sparkles, 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Receipt,
  Wine,
  Plus,
  Minus,
  Check,
  CreditCard,
  Smartphone,
  Coins,
  ShieldCheck,
  X,
  Calendar,
  Wrench
} from 'lucide-react';
import { HotelTapeChart } from './HotelTapeChart';
import { HousekeepingBoard } from './HousekeepingBoard';
import { MaintenanceWorkspace } from './MaintenanceWorkspace';
import { DedicatedCheckInModal } from './DedicatedCheckInModal';

export const HotelPMSView: React.FC = () => {
  const {
    hotelRooms,
    guestStays,
    guestFolios,
    updateRoomStatus,
    postMinibarConsumption,
    settleGuestFolio,
    showToast
  } = useServOS();

  const [activeTab, setActiveTab] = useState<'ROOM_BOARD' | 'TAPE_CHART' | 'HOUSEKEEPING' | 'MAINTENANCE'>('ROOM_BOARD');
  const [checkInModalOpen, setCheckInModalOpen] = useState<boolean>(false);
  const [selectedRoom, setSelectedRoom] = useState<HotelRoom | null>(null);
  const [activeFolioModal, setActiveFolioModal] = useState<GuestFolio | null>(null);
  const [minibarCounts, setMinibarCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredRooms = hotelRooms.filter(r => {
    if (statusFilter === 'ALL') return true;
    return r.status === statusFilter;
  });

  const getStatusBadge = (status: HotelRoom['status']) => {
    switch (status) {
      case 'AVAILABLE':
        return <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">AVAILABLE</span>;
      case 'OCCUPIED':
        return <span className="text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded">OCCUPIED</span>;
      case 'DIRTY':
        return <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">DIRTY</span>;
      case 'CLEANING':
        return <span className="text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">CLEANING</span>;
      case 'INSPECTION':
        return <span className="text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded">INSPECTION</span>;
      case 'OUT_OF_ORDER':
        return <span className="text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded">OUT OF ORDER</span>;
      default:
        return null;
    }
  };

  const handleOpenRoomModal = (room: HotelRoom) => {
    setSelectedRoom(room);
    // Initialize minibar consumption counts to 0
    const counts: Record<string, number> = {};
    room.minibarItems.forEach(item => {
      counts[item.stockItemId] = 0;
    });
    setMinibarCounts(counts);
  };

  const handleMinibarSubmit = () => {
    if (!selectedRoom) return;
    const consumed = Object.entries(minibarCounts)
      .filter(([_, qty]) => qty > 0)
      .map(([stockItemId, qty]) => ({ stockItemId, qty }));

    if (consumed.length > 0) {
      postMinibarConsumption(selectedRoom.id, consumed);
      showToast(`Minibar charges posted to Room ${selectedRoom.roomNumber} guest folio, inventory depleted, and replenishment task created!`, 'success');
    }
    setSelectedRoom(null);
  };

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      {/* Top Controls Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Bed className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Hotel Property Management System (PMS)</span>
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Reservations, Tape Chart, Housekeeping Turnover & Engineering
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sub-view switcher */}
          <div className="flex items-center bg-slate-850 p-1 rounded-xl border border-slate-750 text-xs font-mono">
            <button
              onClick={() => setActiveTab('ROOM_BOARD')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
                activeTab === 'ROOM_BOARD' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rooms & Folios
            </button>
            <button
              onClick={() => setActiveTab('TAPE_CHART')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
                activeTab === 'TAPE_CHART' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tape Chart
            </button>
            <button
              onClick={() => setActiveTab('HOUSEKEEPING')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
                activeTab === 'HOUSEKEEPING' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Housekeeping
            </button>
            <button
              onClick={() => setActiveTab('MAINTENANCE')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
                activeTab === 'MAINTENANCE' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Maintenance
            </button>
          </div>

          <button
            onClick={() => setCheckInModalOpen(true)}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all font-mono"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Check-In Wizard</span>
          </button>
        </div>
      </div>

      {/* Viewport Content */}
      {activeTab === 'TAPE_CHART' && (
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-28 md:pb-8">
          <HotelTapeChart onNewBooking={() => setCheckInModalOpen(true)} />
        </div>
      )}

      {activeTab === 'HOUSEKEEPING' && (
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-28 md:pb-8">
          <HousekeepingBoard />
        </div>
      )}

      {activeTab === 'MAINTENANCE' && (
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-28 md:pb-8">
          <MaintenanceWorkspace />
        </div>
      )}

      {/* Main Content: Rooms Grid */}
      {activeTab === 'ROOM_BOARD' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 sm:px-6 py-2 bg-slate-900/50 border-b border-slate-850 flex items-center gap-1.5 overflow-x-auto shrink-0">
            {['ALL', 'AVAILABLE', 'OCCUPIED', 'DIRTY', 'CLEANING', 'OUT_OF_ORDER'].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-28 md:pb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRooms.map(room => {
                const stay = room.currentGuestStayId ? guestStays.find(s => s.id === room.currentGuestStayId) : null;
                const folio = stay ? guestFolios.find(f => f.id === stay.folioId) : null;

                return (
                  <div
                    key={room.id}
                    className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl font-bold font-mono text-white">
                          Room {room.roomNumber}
                        </span>
                        {getStatusBadge(room.status)}
                      </div>

                      <div className="text-xs text-amber-400/90 font-medium mb-3">
                        {room.roomTypeName} · Floor {room.floor}
                      </div>

                      {stay ? (
                        <div className="bg-slate-950/80 p-3 rounded border border-slate-800/80 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-slate-200">
                            <span className="font-semibold">{stay.guestName}</span>
                            <span className="font-mono text-[10px] text-emerald-400">IN-HOUSE</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {stay.checkInDate} to {stay.checkOutDate}
                          </div>

                          {folio && (
                            <div className="pt-1.5 border-t border-slate-800 flex justify-between items-center font-mono">
                              <span className="text-slate-400 text-[11px]">Folio Balance:</span>
                              <span className="font-bold text-amber-300 text-xs">
                                KES {folio.balanceDue.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-slate-950/40 p-3 rounded border border-dashed border-slate-800 text-center py-4">
                          <span className="text-xs text-slate-500 font-mono">Vacant / Unoccupied</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex gap-2">
                      <button
                        onClick={() => handleOpenRoomModal(room)}
                        className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded border border-slate-700"
                      >
                        Room Controls
                      </button>

                      {folio && (
                        <button
                          onClick={() => setActiveFolioModal(folio)}
                          className="py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold rounded border border-amber-500/30 flex items-center gap-1 font-mono"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Folio</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Dedicated 10-Point Check-In Modal */}
      <DedicatedCheckInModal
        isOpen={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
      />

      {/* MODAL: Room Inspection, Status Change & Minibar Consumption */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Room {selectedRoom.roomNumber} Controls</span>
                  {getStatusBadge(selectedRoom.status)}
                </h3>
                <p className="text-xs text-slate-400">{selectedRoom.roomTypeName}</p>
              </div>
              <button
                onClick={() => setSelectedRoom(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Change Status Buttons */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono block mb-2">
                  Update Operational Status:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['AVAILABLE', 'DIRTY', 'CLEANING', 'INSPECTION', 'OUT_OF_ORDER'] as const).map(st => (
                    <button
                      key={st}
                      onClick={() => {
                        updateRoomStatus(selectedRoom.id, st);
                        setSelectedRoom(prev => prev ? { ...prev, status: st } : null);
                      }}
                      className={`py-2 px-2 text-xs font-semibold rounded border transition-colors ${
                        selectedRoom.status === st
                          ? 'bg-amber-500 text-slate-950 font-bold border-amber-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minibar Section (if occupied) */}
              {selectedRoom.currentGuestStayId && selectedRoom.minibarItems.length > 0 && (
                <div className="pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Wine className="w-4 h-4 text-amber-400" />
                      <span>Record Minibar Consumption</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Auto-posts to folio & replenishes
                    </span>
                  </div>

                  <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                    {selectedRoom.minibarItems.map(item => {
                      const count = minibarCounts[item.stockItemId] || 0;
                      return (
                        <div key={item.stockItemId} className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-slate-200 font-medium">{item.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              Par: {item.expectedQty} | KES {item.price} ea
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setMinibarCounts(prev => ({
                                ...prev,
                                [item.stockItemId]: Math.max(0, count - 1)
                              }))}
                              className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-mono font-bold text-amber-400">
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() => setMinibarCounts(prev => ({
                                ...prev,
                                [item.stockItemId]: Math.min(item.expectedQty, count + 1)
                              }))}
                              className="w-6 h-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setSelectedRoom(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
              {selectedRoom.currentGuestStayId && (
                <button
                  onClick={handleMinibarSubmit}
                  className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded"
                >
                  Save & Post Minibar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Guest Folio Subledger (Section 22) */}
      {activeFolioModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  <span>Guest Folio Subledger: Room {activeFolioModal.roomNumber}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Guest: {activeFolioModal.guestName} · Folio ID: {activeFolioModal.id}
                </p>
              </div>
              <button
                onClick={() => setActiveFolioModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Folio Entries Ledger */}
            <div className="flex-1 overflow-y-auto py-4 space-y-2">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px]">
                  <tr>
                    <th className="p-2">Date / Time</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Description & Reference</th>
                    <th className="p-2">Posted By</th>
                    <th className="p-2 text-right">Amount (KES)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {activeFolioModal.entries.map(entry => {
                    const isCredit = entry.amount < 0;
                    return (
                      <tr key={entry.id} className="hover:bg-slate-850">
                        <td className="p-2 text-slate-400 text-[11px]">
                          {new Date(entry.occurredAt).toLocaleDateString()} {new Date(entry.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-2">
                          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                            {entry.category}
                          </span>
                        </td>
                        <td className="p-2 text-slate-200">
                          {entry.description}
                          {entry.referenceId && (
                            <span className="text-amber-400/90 ml-1">({entry.referenceId})</span>
                          )}
                        </td>
                        <td className="p-2 text-slate-400 text-[11px]">
                          {entry.postedBy}
                        </td>
                        <td className={`p-2 text-right font-bold tabular-nums ${
                          isCredit ? 'text-emerald-400' : 'text-slate-200'
                        }`}>
                          {entry.amount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Folio Summary & Balance Verification */}
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Total Accumulated Charges:</span>
                <span className="tabular-nums">KES {activeFolioModal.totalCharges.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-mono text-emerald-400">
                <span>Total Payments & Deposits:</span>
                <span className="tabular-nums">-KES {activeFolioModal.totalPayments.toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline font-mono">
                <span className="text-sm font-bold text-white uppercase">
                  Net Balance Outstanding:
                </span>
                <span className="text-lg font-bold text-amber-400 tabular-nums">
                  KES {activeFolioModal.balanceDue.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Settle / Checkout Actions */}
            <div className="pt-4 flex justify-between items-center">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded"
              >
                Print Folio Statement
              </button>

              <div className="flex items-center gap-2">
                {activeFolioModal.balanceDue > 0 ? (
                  <>
                    <button
                      onClick={() => {
                        settleGuestFolio(activeFolioModal.id, 'MPESA');
                        setActiveFolioModal(null);
                        showToast('Folio settled via M-PESA! Guest checkout recorded and General Ledger updated.', 'success');
                      }}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded flex items-center gap-1"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Settle via M-PESA</span>
                    </button>
                    <button
                      onClick={() => {
                        settleGuestFolio(activeFolioModal.id, 'CARD');
                        setActiveFolioModal(null);
                        showToast('Folio settled via Corporate Card! Guest checkout recorded and General Ledger updated.', 'success');
                      }}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Settle via Card</span>
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 px-3 py-1.5 rounded border border-emerald-800/40">
                    FOLIO FULLY SETTLED (READY FOR CHECKOUT)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
