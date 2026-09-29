import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { HospitalityEvent, EventTicket, Promoter } from '../../types/servos';
import { 
  Calendar, 
  Ticket, 
  Users, 
  QrCode, 
  Sparkles, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Search, 
  Award, 
  X, 
  Check, 
  Flame,
  ArrowRight,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

const INITIAL_EVENTS: HospitalityEvent[] = [
  {
    id: 'evt-01',
    title: 'Saturday Sessions • Sunset to Sunrise',
    subtitle: 'Afrobeats & Amapiano Headline Edition',
    date: '2026-09-26',
    startTime: '20:00',
    endTime: '05:00',
    venueSection: 'Terrace & Rooftop VIP Arena',
    capacity: 850,
    ticketsSold: 438,
    checkedInCount: 291,
    vipTablesCount: 17,
    doorRevenueKes: 412000,
    presaleRevenueKes: 684000,
    status: 'LIVE',
    ticketTiers: [
      { name: 'Early Bird Regular', price: 1500, allocated: 300, sold: 300 },
      { name: 'VIP Golden Circle', price: 3500, allocated: 200, sold: 110 },
      { name: 'VVIP Table Package (6 Pax + Spirits)', price: 45000, allocated: 20, sold: 17 }
    ],
    headliner: 'Major League DJz & Special Guests',
    minimumAge: 21
  },
  {
    id: 'evt-02',
    title: 'Nairobi Wine & Jazz Soirée',
    subtitle: 'Premium Vineyard Tasting & Live Saxophone Quintet',
    date: '2026-10-03',
    startTime: '18:00',
    endTime: '00:00',
    venueSection: 'Garden Courtyard & Wine Cellar',
    capacity: 350,
    ticketsSold: 180,
    checkedInCount: 0,
    vipTablesCount: 8,
    doorRevenueKes: 0,
    presaleRevenueKes: 540000,
    status: 'UPCOMING',
    ticketTiers: [
      { name: 'Tasting Pass', price: 3000, allocated: 250, sold: 150 },
      { name: 'VIP Sommelier Table', price: 25000, allocated: 10, sold: 8 }
    ]
  }
];

const INITIAL_PROMOTERS: Promoter[] = [
  {
    id: 'prom-01',
    name: 'Mercy Wanjiku',
    phone: '+254 722 901 884',
    promoCode: 'MERCYVIP',
    guestListCount: 82,
    checkedInCount: 64,
    vipTablesBooked: 7,
    attributedSalesKes: 184000,
    commissionRatePct: 5.0,
    earnedCommissionKes: 9200,
    paidCommissionKes: 5000,
    status: 'ACTIVE'
  },
  {
    id: 'prom-02',
    name: 'Jay Odhiambo',
    phone: '+254 711 445 229',
    promoCode: 'JAYEVENTS',
    guestListCount: 110,
    checkedInCount: 91,
    vipTablesBooked: 10,
    attributedSalesKes: 270000,
    commissionRatePct: 5.0,
    earnedCommissionKes: 13500,
    paidCommissionKes: 13500,
    status: 'ACTIVE'
  },
  {
    id: 'prom-03',
    name: 'Kevin Mutua',
    phone: '+254 733 881 990',
    promoCode: 'MUTUANIGHTS',
    guestListCount: 95,
    checkedInCount: 74,
    vipTablesBooked: 6,
    attributedSalesKes: 220000,
    commissionRatePct: 5.0,
    earnedCommissionKes: 11000,
    paidCommissionKes: 0,
    status: 'ACTIVE'
  }
];

export const EventsNightlifeView: React.FC = () => {
  const { showToast } = useServOS();
  const [events, setEvents] = useState<HospitalityEvent[]>(INITIAL_EVENTS);
  const [selectedEventId, setSelectedEventId] = useState<string>(INITIAL_EVENTS[0].id);
  const [promoters, setPromoters] = useState<Promoter[]>(INITIAL_PROMOTERS);
  const [activeTab, setActiveTab] = useState<'COCKPIT' | 'DOOR_SCANNER' | 'PROMOTERS'>('COCKPIT');

  // Door QR scanner simulation state
  const [scanInput, setScanInput] = useState<string>('TCK-84920');
  const [lastScannedResult, setLastScannedResult] = useState<{
    status: 'VALID' | 'DUPLICATE' | 'INVALID';
    guest: string;
    tier: string;
    message: string;
  } | null>(null);

  const selectedEvent = events.find(e => e.id === selectedEventId) || events[0];

  const handleSimulateScan = () => {
    if (!scanInput.trim()) return;

    if (scanInput.includes('INVALID')) {
      setLastScannedResult({
        status: 'INVALID',
        guest: 'Unknown Guest',
        tier: 'None',
        message: 'Invalid QR Ticket signature. Unrecognized barcode hash.'
      });
      showToast('Check-in Rejected: QR code signature mismatch', 'error');
    } else {
      setLastScannedResult({
        status: 'VALID',
        guest: 'John Kamau (VIP Gold)',
        tier: 'VVIP Table Package #04',
        message: 'Access Granted: Wristband #882 issued with 1 bottle voucher.'
      });

      // Increment live checked-in count
      setEvents(prev => prev.map(e => {
        if (e.id === selectedEvent.id) {
          return { ...e, checkedInCount: e.checkedInCount + 1 };
        }
        return e;
      }));

      showToast('Door Access Granted • VIP Lounge Entry', 'success');
    }
  };

  const handlePayCommission = (_prom: Promoter) => {
    showToast('Manual commission payment recording is pending backend integration. No payout was made.', 'error');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold tracking-wider uppercase border border-amber-500/30">
              NIGHTLIFE & EVENTS ENGINE
            </span>
            <span className="text-slate-400 text-xs font-mono">Door Scanning, Promoters & VIP Tables</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
            <span>{selectedEvent.title}</span>
            {selectedEvent.status === 'LIVE' && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-mono font-bold border border-rose-500/40 animate-pulse">
                ● LIVE TONIGHT
              </span>
            )}
          </h1>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-slate-850 p-1 rounded-xl border border-slate-750 text-xs font-mono">
          <button
            onClick={() => setActiveTab('COCKPIT')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
              activeTab === 'COCKPIT' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Event Cockpit
          </button>
          <button
            onClick={() => setActiveTab('DOOR_SCANNER')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
              activeTab === 'DOOR_SCANNER' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Door Check-in & Scanner
          </button>
          <button
            onClick={() => setActiveTab('PROMOTERS')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
              activeTab === 'PROMOTERS' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Promoters & Commissions
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'COCKPIT' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Hero KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Venue Capacity</span>
              <span className="text-xl font-black text-white font-mono mt-1 block">{selectedEvent.capacity} Pax</span>
              <span className="text-[11px] font-mono text-slate-400">Max limit</span>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Tickets Sold</span>
              <span className="text-xl font-black text-amber-400 font-mono mt-1 block">{selectedEvent.ticketsSold} Sold</span>
              <span className="text-[11px] font-mono text-emerald-400">51.5% Capacity</span>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Checked In</span>
              <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">{selectedEvent.checkedInCount} Inside</span>
              <span className="text-[11px] font-mono text-slate-400">66.4% of Presales</span>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">VIP Tables</span>
              <span className="text-xl font-black text-purple-400 font-mono mt-1 block">{selectedEvent.vipTablesCount} Booked</span>
              <span className="text-[11px] font-mono text-purple-300">100% Sold Out</span>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Door Revenue</span>
              <span className="text-xl font-black text-white font-mono mt-1 block">
                KES {(selectedEvent.doorRevenueKes / 1000).toFixed(0)}k
              </span>
              <span className="text-[11px] font-mono text-amber-400">Walk-in Cash/M-Pesa</span>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-[10px] font-mono text-slate-400 uppercase block">Total Presales</span>
              <span className="text-xl font-black text-cyan-400 font-mono mt-1 block">
                KES {(selectedEvent.presaleRevenueKes / 1000).toFixed(0)}k
              </span>
              <span className="text-[11px] font-mono text-cyan-300">Event tickets</span>
            </div>
          </div>

          {/* Ticket Tiers Breakdown */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <Ticket className="w-4 h-4 text-amber-400" />
              <span>Ticket Tier Breakdown & Allocation</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
              {selectedEvent.ticketTiers.map((tier, idx) => (
                <div key={idx} className="p-4 bg-slate-850 border border-slate-750 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">{tier.name}</span>
                    <span className="text-amber-400 font-black">KES {tier.price.toLocaleString()}</span>
                  </div>

                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full"
                      style={{ width: `${(tier.sold / tier.allocated) * 100}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>{tier.sold} Sold</span>
                    <span>{tier.allocated} Allocated</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DOOR SCANNER TAB */}
      {activeTab === 'DOOR_SCANNER' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                <QrCode className="w-8 h-8" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">Fast Door QR Check-in Terminal</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Scan customer e-ticket barcode or enter ticket code to validate entry
                </p>
              </div>

              <div className="flex items-center gap-2 max-w-md mx-auto">
                <input
                  type="text"
                  placeholder="Scan QR or enter TCK-..."
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 text-amber-300 font-mono text-sm font-bold rounded-xl px-4 py-2.5 focus:outline-none focus:border-amber-400"
                />
                <button
                  onClick={handleSimulateScan}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-all"
                >
                  Verify
                </button>
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => { setScanInput('TCK-VIP-84920'); }}
                  className="text-[11px] font-mono text-slate-400 hover:text-amber-300 underline"
                >
                  Load Valid VIP Sample
                </button>
                <span className="text-slate-600">•</span>
                <button
                  onClick={() => { setScanInput('TCK-INVALID-991'); }}
                  className="text-[11px] font-mono text-slate-400 hover:text-rose-400 underline"
                >
                  Load Invalid Sample
                </button>
              </div>
            </div>

            {/* Scan Result Card */}
            {lastScannedResult && (
              <div className={`p-5 rounded-2xl border transition-all ${
                lastScannedResult.status === 'VALID'
                  ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
              }`}>
                <div className="flex items-center gap-3">
                  {lastScannedResult.status === 'VALID' ? (
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <h4 className="text-base font-bold text-white font-mono">
                      {lastScannedResult.status === 'VALID' ? 'VALID TICKET: ENTRY APPROVED' : 'ACCESS DENIED: INVALID SIGNATURE'}
                    </h4>
                    <p className="text-xs font-bold text-amber-300 mt-0.5">
                      Guest: {lastScannedResult.guest} • Tier: {lastScannedResult.tier}
                    </p>
                    <p className="text-xs text-slate-300 mt-1">
                      {lastScannedResult.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROMOTERS TAB */}
      {activeTab === 'PROMOTERS' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span>Promoter & Host Performance Leaderboard</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Real-time attribution to POS checks and automated 5% commission calculation
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {promoters.map(prom => {
              const pendingComm = prom.earnedCommissionKes - prom.paidCommissionKes;
              return (
                <div key={prom.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold uppercase">
                        PROMO CODE: {prom.promoCode}
                      </span>
                      <h3 className="text-base font-bold text-white mt-1.5">{prom.name}</h3>
                      <p className="text-xs text-slate-400 font-mono">{prom.phone}</p>
                    </div>
                  </div>

                  <div className="space-y-2 font-mono text-xs bg-slate-850 p-3 rounded-xl border border-slate-750">
                    <div className="flex justify-between text-slate-400">
                      <span>Guest List:</span>
                      <span className="text-white font-bold">{prom.guestListCount} Guests</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Checked In:</span>
                      <span className="text-emerald-400 font-bold">{prom.checkedInCount} Inside</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>VIP Tables:</span>
                      <span className="text-purple-300 font-bold">{prom.vipTablesBooked} Tables</span>
                    </div>
                    <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-750">
                      <span>Attributed Sales:</span>
                      <span className="text-amber-400 font-bold">KES {prom.attributedSalesKes.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Commission (5%):</span>
                      <span className="text-emerald-400 font-bold">KES {prom.earnedCommissionKes.toLocaleString()}</span>
                    </div>

                    <button
                      onClick={() => handlePayCommission(prom)}
                      disabled={pendingComm <= 0}
                      className={`w-full py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 ${
                        pendingComm > 0
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {pendingComm > 0 ? (
                        <>
                          <span>Disburse KES {pendingComm.toLocaleString()} (M-PESA)</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <span>✓ Commission Settled</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
