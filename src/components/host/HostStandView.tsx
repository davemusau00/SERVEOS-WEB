import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  RestaurantReservation, 
  WaitlistParty, 
  ReservationStatus 
} from '../../types/restaurant';
import { 
  Users, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Phone, 
  Utensils, 
  Sparkles, 
  AlertCircle, 
  Send, 
  MessageSquare,
  Search,
  Filter,
  UserCheck
} from 'lucide-react';

const INITIAL_RESERVATIONS: RestaurantReservation[] = [
  {
    id: 'res-101',
    guestName: 'Dr. Evelyn Wanjiku',
    guestPhone: '+254 712 345 678',
    guestEmail: 'evelyn.w@nairobihospital.org',
    partySize: 4,
    reservationDate: '2026-09-23',
    startTime: '19:30',
    durationMinutes: 90,
    assignedTableName: 'Table 04',
    assignedTableId: 'tbl-4',
    section: 'VIP Lounge',
    source: 'HOTEL_CONCIERGE',
    status: 'ARRIVED',
    depositAmount: 5000,
    isDepositPaid: true,
    dietaryNotes: 'Severe Shellfish Allergy',
    occasion: 'Anniversary',
    specialRequests: 'Moët & Chandon Champagne chilled at table',
    isVip: true
  },
  {
    id: 'res-102',
    guestName: 'James Mwangi',
    guestPhone: '+254 722 987 654',
    partySize: 2,
    reservationDate: '2026-09-23',
    startTime: '20:00',
    durationMinutes: 60,
    assignedTableName: 'Table 08',
    assignedTableId: 'tbl-8',
    section: 'Main Bar',
    source: 'WEBSITE',
    status: 'CONFIRMED',
    depositAmount: 0,
    isDepositPaid: false,
    dietaryNotes: 'Gluten Free Preferred',
    occasion: 'Business Dinner',
    isVip: false
  },
  {
    id: 'res-103',
    guestName: 'Safaricom Corporate Group (Mercy O.)',
    guestPhone: '+254 700 112 233',
    partySize: 8,
    reservationDate: '2026-09-23',
    startTime: '20:30',
    durationMinutes: 120,
    assignedTableName: 'VIP Cabana 1',
    assignedTableId: 'tbl-12',
    section: 'VIP Lounge',
    source: 'CORPORATE',
    status: 'BOOKED',
    depositAmount: 15000,
    isDepositPaid: true,
    specialRequests: 'High-speed AV setup for brief presentation',
    isVip: true
  }
];

const INITIAL_WAITLIST: WaitlistParty[] = [
  {
    id: 'wait-1',
    guestName: 'Kevin & Sarah',
    guestPhone: '+254 733 444 555',
    partySize: 2,
    preferredSection: 'Terrace',
    quotedWaitMinutes: 20,
    elapsedWaitMinutes: 14,
    status: 'WAITING',
    joinedAt: '19:15',
    notes: 'Prefers outdoor seating near the fireplace',
    isVip: false
  },
  {
    id: 'wait-2',
    guestName: 'Chef Martin K.',
    guestPhone: '+254 788 111 222',
    partySize: 5,
    preferredSection: 'VIP Lounge',
    quotedWaitMinutes: 35,
    elapsedWaitMinutes: 32,
    status: 'NOTIFIED',
    joinedAt: '18:55',
    notifiedAt: '19:25',
    notes: 'Visiting Food Critic - Priority Seating',
    isVip: true
  }
];

export const HostStandView: React.FC = () => {
  const { tables, showToast } = useServOS();
  const [activeTab, setActiveTab] = useState<'RESERVATIONS' | 'WAITLIST'>('RESERVATIONS');
  const [reservations, setReservations] = useState<RestaurantReservation[]>(INITIAL_RESERVATIONS);
  const [waitlist, setWaitlist] = useState<WaitlistParty[]>(INITIAL_WAITLIST);
  const [selectedResId, setSelectedResId] = useState<string>(INITIAL_RESERVATIONS[0].id);
  const [selectedWaitId, setSelectedWaitId] = useState<string>(INITIAL_WAITLIST[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Modals state
  const [isNewResModalOpen, setIsNewResModalOpen] = useState<boolean>(false);
  const [isNewWaitlistModalOpen, setIsNewWaitlistModalOpen] = useState<boolean>(false);

  // New reservation form state
  const [resGuestName, setResGuestName] = useState('');
  const [resGuestPhone, setResGuestPhone] = useState('');
  const [resPartySize, setResPartySize] = useState(2);
  const [resTime, setResTime] = useState('20:00');
  const [resSection, setResSection] = useState('Main Bar');
  const [resSpecialNotes, setResSpecialNotes] = useState('');
  const [resIsVip, setResIsVip] = useState(false);

  // Selected contexts
  const activeReservation = reservations.find(r => r.id === selectedResId) || reservations[0];
  const activeWaitlistParty = waitlist.find(w => w.id === selectedWaitId) || waitlist[0];

  const handleUpdateResStatus = (id: string, newStatus: ReservationStatus) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    showToast(`Reservation for ${activeReservation?.guestName} updated to ${newStatus}`, 'info');
  };

  const handleSeatReservation = (res: RestaurantReservation) => {
    setReservations(prev => prev.map(r => r.id === res.id ? { ...r, status: 'SEATED' } : r));
    showToast(`Seated ${res.guestName} (Party of ${res.partySize}) at ${res.assignedTableName || 'Table'}!`, 'success');
  };

  const handleNotifyWaitlistGuest = (party: WaitlistParty) => {
    setWaitlist(prev => prev.map(w => w.id === party.id ? { ...w, status: 'NOTIFIED', notifiedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : w));
    showToast(`SMS table readiness alert sent to ${party.guestName} (${party.guestPhone})!`, 'success');
  };

  const handleCreateReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resGuestName || !resGuestPhone) {
      showToast('Please enter guest name and phone number', 'error');
      return;
    }

    const newRes: RestaurantReservation = {
      id: `res-${Date.now()}`,
      guestName: resGuestName,
      guestPhone: resGuestPhone,
      partySize: Number(resPartySize),
      reservationDate: '2026-09-23',
      startTime: resTime,
      durationMinutes: 90,
      assignedTableName: 'Table 02',
      section: resSection,
      source: 'WALK_IN',
      status: 'BOOKED',
      depositAmount: 0,
      isDepositPaid: false,
      specialRequests: resSpecialNotes,
      isVip: resIsVip
    };

    setReservations(prev => [newRes, ...prev]);
    setSelectedResId(newRes.id);
    setIsNewResModalOpen(false);
    showToast(`Reservation booked for ${newRes.guestName} at ${newRes.startTime}!`, 'success');

    // Reset form
    setResGuestName('');
    setResGuestPhone('');
    setResSpecialNotes('');
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Host Stand & Floor Command
              <span className="px-2 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                LIVE SERVICE
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Grand Nairobi Hotel • Dining Room & VIP Lounge • 23 Sep 2026
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsNewWaitlistModalOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Add to Waitlist</span>
          </button>

          <button
            onClick={() => setIsNewResModalOpen(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-amber-500/10"
          >
            <Calendar className="w-4 h-4" />
            <span>New Reservation</span>
          </button>
        </div>
      </div>

      {/* Main 3-Pane Layout */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Pane 1: Queue & List (Cols 3) */}
        <div className="col-span-3 border-r border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">
          {/* Switcher Tabs */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/60 flex items-center gap-2">
            <button
              onClick={() => setActiveTab('RESERVATIONS')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold font-mono transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'RESERVATIONS'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Reservations ({reservations.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('WAITLIST')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold font-mono transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'WAITLIST'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Waitlist ({waitlist.length})</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-slate-800/80">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search guest name or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeTab === 'RESERVATIONS' ? (
              reservations
                .filter(r => r.guestName.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(res => (
                  <div
                    key={res.id}
                    onClick={() => setSelectedResId(res.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedResId === res.id
                        ? 'bg-slate-800/90 border-amber-500/50 shadow-lg shadow-amber-500/5'
                        : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold font-mono text-amber-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {res.startTime}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md ${
                        res.status === 'ARRIVED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        res.status === 'CONFIRMED' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        res.status === 'SEATED' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {res.status}
                      </span>
                    </div>

                    <div className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
                      {res.isVip && <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                      <span>{res.guestName}</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-500" />
                        {res.partySize} Guests
                      </span>
                      <span>{res.assignedTableName || res.section}</span>
                    </div>
                  </div>
                ))
            ) : (
              waitlist.map(party => (
                <div
                  key={party.id}
                  onClick={() => setSelectedWaitId(party.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedWaitId === party.id
                      ? 'bg-slate-800/90 border-amber-500/50 shadow-lg'
                      : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1">
                      <Users className="w-3 h-3 text-amber-400" />
                      {party.guestName} ({party.partySize}p)
                    </span>
                    <span className="text-xs font-mono text-amber-400 font-bold">
                      ~{party.quotedWaitMinutes}m wait
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 font-mono mb-2">
                    Joined at {party.joinedAt} • {party.preferredSection}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 text-[10px] font-mono rounded-md ${
                      party.status === 'NOTIFIED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {party.status}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotifyWaitlistGuest(party);
                      }}
                      className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-mono font-bold flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      Notify SMS
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pane 2: Live Floorplan Canvas (Cols 6) */}
        <div className="col-span-6 border-r border-slate-800 bg-slate-950 p-6 flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Utensils className="w-4 h-4 text-amber-400" />
                Live Floor Canvas & Table Occupancy
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Click any table to assign or view real-time seating state
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Vacant
              </span>
              <span className="flex items-center gap-1 text-purple-400">
                <span className="w-2 h-2 rounded-full bg-purple-400"></span> Occupied
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span> Reserved
              </span>
            </div>
          </div>

          {/* Table Canvas Grid */}
          <div className="grid grid-cols-3 gap-4 flex-1">
            {tables.map(tbl => {
              const assignedRes = reservations.find(r => r.assignedTableName === `Table ${tbl.label}` || r.assignedTableName === tbl.label);
              
              return (
                <div
                  key={tbl.id}
                  className={`p-4 rounded-2xl border flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${
                    tbl.state !== 'AVAILABLE'
                      ? 'bg-purple-950/20 border-purple-500/40 hover:border-purple-500'
                      : assignedRes
                      ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Table Header */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold font-mono text-white">
                      Table {tbl.label}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full ${
                      tbl.state !== 'AVAILABLE' ? 'bg-purple-500/20 text-purple-400' :
                      assignedRes ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {tbl.state !== 'AVAILABLE' ? 'SEATED' : assignedRes ? 'RESERVED' : 'VACANT'}
                    </span>
                  </div>

                  {/* Table Body */}
                  <div className="my-4">
                    {assignedRes ? (
                      <div>
                        <p className="text-xs font-bold text-amber-300 flex items-center gap-1">
                          {assignedRes.isVip && <Sparkles className="w-3 h-3 text-amber-400 fill-amber-400" />}
                          {assignedRes.guestName}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400 mt-1">
                          {assignedRes.startTime} • Party of {assignedRes.partySize}
                        </p>
                      </div>
                    ) : tbl.state !== 'AVAILABLE' ? (
                      <div>
                        <p className="text-xs font-bold text-purple-300">Active Seated Party</p>
                        <p className="text-[11px] font-mono text-slate-400 mt-1">Seated • {tbl.state}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 font-mono">Capacity: {tbl.capacity || 4} Guests</p>
                    )}
                  </div>

                  {/* Table Footer */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>{tbl.section}</span>
                    {assignedRes && assignedRes.status === 'ARRIVED' && (
                      <button
                        onClick={() => handleSeatReservation(assignedRes)}
                        className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded font-bold transition-colors"
                      >
                        Seat Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pane 3: Guest & Context Inspection Drawer (Cols 3) */}
        <div className="col-span-3 bg-slate-900/60 p-5 flex flex-col overflow-y-auto">
          {activeReservation ? (
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
                  Guest & Reservation Context
                </span>
                {activeReservation.isVip && (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full text-[10px] font-mono font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 fill-amber-400" />
                    VIP GUEST
                  </span>
                )}
              </div>

              {/* Guest Card */}
              <div className="my-5 p-4 bg-slate-950 rounded-xl border border-slate-800">
                <h3 className="text-base font-bold text-white mb-1">
                  {activeReservation.guestName}
                </h3>
                <p className="text-xs font-mono text-slate-400 flex items-center gap-1 mb-3">
                  <Phone className="w-3 h-3 text-slate-500" />
                  {activeReservation.guestPhone}
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">TIME</span>
                    <span className="text-white font-bold">{activeReservation.startTime}</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">PARTY SIZE</span>
                    <span className="text-white font-bold">{activeReservation.partySize} Guests</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">TABLE</span>
                    <span className="text-amber-400 font-bold">{activeReservation.assignedTableName || 'Unassigned'}</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">DEPOSIT</span>
                    <span className={activeReservation.isDepositPaid ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {activeReservation.depositAmount > 0 ? `KES ${activeReservation.depositAmount.toLocaleString()}` : 'None'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Special Requests & Allergies */}
              <div className="space-y-3 mb-6">
                {activeReservation.dietaryNotes && (
                  <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-xl">
                    <span className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-wider block mb-1">
                      DIETARY / ALLERGY WARNING
                    </span>
                    <p className="text-xs text-red-200">{activeReservation.dietaryNotes}</p>
                  </div>
                )}

                {activeReservation.specialRequests && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block mb-1">
                      SPECIAL REQUESTS
                    </span>
                    <p className="text-xs text-slate-300">{activeReservation.specialRequests}</p>
                  </div>
                )}
              </div>

              {/* Status Action Buttons */}
              <div className="space-y-2 pt-4 border-t border-slate-800">
                <button
                  onClick={() => handleSeatReservation(activeReservation)}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/10"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Seat Party at Table</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleUpdateResStatus(activeReservation.id, 'ARRIVED')}
                    className="py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-mono font-medium"
                  >
                    Mark Arrived
                  </button>
                  <button
                    onClick={() => handleUpdateResStatus(activeReservation.id, 'NO_SHOW')}
                    className="py-2 bg-slate-800 hover:bg-slate-750 text-red-400 rounded-xl text-xs font-mono font-medium"
                  >
                    Mark No-Show
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 text-xs font-mono">
              Select a reservation or waitlist party to inspect details
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Reservation */}
      {isNewResModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                New Reservation Booking
              </h3>
              <button
                onClick={() => setIsNewResModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReservation} className="p-6 space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1">GUEST NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Honorable Member M. Hassan"
                  value={resGuestName}
                  onChange={e => setResGuestName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">PHONE NUMBER</label>
                  <input
                    type="text"
                    required
                    placeholder="+254 712..."
                    value={resGuestPhone}
                    onChange={e => setResGuestPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">PARTY SIZE</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={resPartySize}
                    onChange={e => setResPartySize(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">START TIME</label>
                  <input
                    type="time"
                    value={resTime}
                    onChange={e => setResTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">PREFERRED SECTION</label>
                  <select
                    value={resSection}
                    onChange={e => setResSection(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-none"
                  >
                    <option value="Main Bar">Main Bar</option>
                    <option value="VIP Lounge">VIP Lounge</option>
                    <option value="Terrace">Terrace</option>
                    <option value="Dining Room">Dining Room</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">SPECIAL REQUESTS / NOTES</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Window table preference, birthday cake request..."
                  value={resSpecialNotes}
                  onChange={e => setResSpecialNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-none resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="vipCheck"
                  checked={resIsVip}
                  onChange={e => setResIsVip(e.target.checked)}
                  className="rounded border-slate-800 text-amber-500 focus:ring-0"
                />
                <label htmlFor="vipCheck" className="text-amber-400 font-bold flex items-center gap-1 cursor-pointer">
                  <Sparkles className="w-3.5 h-3.5" />
                  FLAG AS VIP GUEST
                </label>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewResModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/10"
                >
                  Book Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
