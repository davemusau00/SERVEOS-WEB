import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { CustomerProfile, CustomerVipTier, CustomerActivity } from '../../types/servos';
import { 
  Users, 
  Search, 
  Plus, 
  Crown, 
  Award, 
  Wine, 
  Bed, 
  Calendar, 
  DollarSign, 
  Clock, 
  CreditCard, 
  Star, 
  Sparkles, 
  CheckCircle2, 
  Gift, 
  TrendingUp, 
  Phone, 
  Mail, 
  Building, 
  Tag, 
  Check, 
  X,
  History,
  Activity,
  ArrowRight
} from 'lucide-react';

const INITIAL_CUSTOMERS: CustomerProfile[] = [
  {
    id: 'cust-01',
    name: 'John Kamau',
    phone: '+254 722 849 201',
    email: 'j.kamau@safaricom.co.ke',
    vipTier: 'GOLD',
    loyaltyPoints: 1842,
    totalSpendKes: 684300,
    visitCount: 42,
    hotelNightsCount: 11,
    avgSpendPerVisit: 16293,
    lastVisitDate: '2026-09-21',
    favouriteDrink: 'Jameson Black Barrel (Double)',
    preferredTable: 'VIP 04 (Terrace Lounge)',
    notes: 'Likes high-ball glasses with extra ice and lime. Always sits near terrace screen for Premier League games.',
    tags: ['Corporate VIP', 'Premier League Regular', 'Spirits Connoisseur'],
    companyName: 'Safaricom PLC',
    creditLimitKes: 300000,
    creditBalanceKes: 48500,
    status: 'VIP',
    timeline: [
      { id: 'act-1', date: '2026-09-21 21:40', type: 'BAR', amount: 18400, description: 'VIP Terrace Bar • Jameson Black Barrel Bottle + Mixers', referenceId: 'ORD-8492' },
      { id: 'act-2', date: '2026-09-17 11:30', type: 'HOTEL', amount: 31200, description: 'Hotel Suite 304 • 2 Nights Weekend Stay', referenceId: 'FOL-2091' },
      { id: 'act-3', date: '2026-09-02 23:15', type: 'EVENT', amount: 42000, description: 'Saturday Night Gala VIP Table Deposit', referenceId: 'EVT-082' },
      { id: 'act-4', date: '2026-08-28 20:10', type: 'REWARD_REDEMPTION', amount: -2000, description: 'Redeemed 2,000 ServOS Loyalty Reward Points', referenceId: 'RWD-441' }
    ]
  },
  {
    id: 'cust-02',
    name: 'Amb. Richard Davis',
    phone: '+254 711 902 448',
    email: 'r.davis@unon.org',
    vipTier: 'VIP_BLACK',
    loyaltyPoints: 4520,
    totalSpendKes: 1420500,
    visitCount: 68,
    hotelNightsCount: 24,
    avgSpendPerVisit: 20889,
    lastVisitDate: '2026-09-23',
    favouriteDrink: 'Macallan 18yr / Glenfiddich 15yr',
    preferredTable: 'Table 14 (Private Dining)',
    notes: 'Diplomatic protocol. Quiet table preferred. Room 312 regular resident.',
    tags: ['Diplomatic', 'UN Resident', 'VIP Black Card'],
    companyName: 'UN Habitat Nairobi',
    creditLimitKes: 500000,
    creditBalanceKes: 112000,
    status: 'VIP',
    timeline: [
      { id: 'act-5', date: '2026-09-23 12:45', type: 'HOTEL', amount: 48000, description: 'Deluxe Suite Room 312 Check-in', referenceId: 'FOL-2104' },
      { id: 'act-6', date: '2026-09-18 20:30', type: 'DINING', amount: 24600, description: 'Private Executive Dinner 4 Pax', referenceId: 'ORD-8411' }
    ]
  },
  {
    id: 'cust-03',
    name: 'Brenda Cherono',
    phone: '+254 733 410 882',
    email: 'bcherono@kcbgroup.com',
    vipTier: 'SILVER',
    loyaltyPoints: 620,
    totalSpendKes: 194000,
    visitCount: 16,
    hotelNightsCount: 2,
    avgSpendPerVisit: 12125,
    lastVisitDate: '2026-09-19',
    favouriteDrink: 'Moët & Chandon Brut Imperial',
    preferredTable: 'VIP 02 (Poolside)',
    notes: 'Celebrates company quarterly milestones with champagne buckets.',
    tags: ['Champagne Lover', 'Weekend Brunch Regular'],
    companyName: 'KCB Bank Kenya',
    creditLimitKes: 150000,
    creditBalanceKes: 0,
    status: 'ACTIVE',
    timeline: [
      { id: 'act-7', date: '2026-09-19 18:20', type: 'BAR', amount: 15500, description: 'Moët Bottle + Snack Platter', referenceId: 'ORD-8390' }
    ]
  }
];

export const CRM360View: React.FC = () => {
  const { showToast } = useServOS();
  const [customers, setCustomers] = useState<CustomerProfile[]>(INITIAL_CUSTOMERS);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(INITIAL_CUSTOMERS[0].id);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'LOYALTY_RULES' | 'CREDIT_ACCOUNTS'>('PROFILE');
  const [newCustomerModal, setNewCustomerModal] = useState<boolean>(false);

  // New customer form state
  const [newName, setNewName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newTier, setNewTier] = useState<CustomerVipTier>('BRONZE');

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0];

  const filteredCustomers = customers.filter(c => {
    if (selectedTier !== 'ALL' && c.vipTier !== selectedTier) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getTierBadge = (tier: CustomerVipTier) => {
    switch (tier) {
      case 'VIP_BLACK':
        return { label: 'VIP BLACK CARD', bg: 'bg-zinc-900 border-amber-500/80 text-amber-300' };
      case 'PLATINUM':
        return { label: 'PLATINUM', bg: 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300' };
      case 'GOLD':
        return { label: 'GOLD MEMBER', bg: 'bg-amber-950/40 border-amber-500/60 text-amber-300' };
      case 'SILVER':
        return { label: 'SILVER', bg: 'bg-slate-800 border-slate-600 text-slate-300' };
      default:
        return { label: 'BRONZE', bg: 'bg-orange-950/30 border-orange-700 text-orange-300' };
    }
  };

  const handleCreateCustomer = () => {
    if (!newName || !newPhone) {
      showToast('Name and Phone number are required', 'error');
      return;
    }

    const newCust: CustomerProfile = {
      id: `cust-${Date.now()}`,
      name: newName,
      phone: newPhone,
      email: newEmail,
      vipTier: newTier,
      loyaltyPoints: 100, // Welcome points
      totalSpendKes: 0,
      visitCount: 1,
      hotelNightsCount: 0,
      avgSpendPerVisit: 0,
      lastVisitDate: new Date().toISOString().split('T')[0],
      favouriteDrink: 'Pending order history',
      preferredTable: 'Open Seating',
      notes: 'New member registered',
      tags: ['New Member'],
      creditLimitKes: 50000,
      creditBalanceKes: 0,
      status: 'ACTIVE',
      timeline: []
    };

    setCustomers(prev => [newCust, ...prev]);
    setSelectedCustomerId(newCust.id);
    setNewCustomerModal(false);
    setNewName('');
    setNewPhone('');
    setNewEmail('');

    showToast(`Profile created for ${newCust.name} with 100 welcome reward points!`, 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold tracking-wider uppercase border border-purple-500/30">
              GUEST 360 & CRM ENGINE
            </span>
            <span className="text-slate-400 text-xs font-mono">Unified Customer Lifecycle & Loyalty</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
            <span>Customer 360 & ServOS Rewards</span>
          </h1>
        </div>

        {/* Tab & Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-850 p-1 rounded-xl border border-slate-750 text-xs font-mono">
            <button
              onClick={() => setActiveTab('PROFILE')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
                activeTab === 'PROFILE' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Guest 360
            </button>
            <button
              onClick={() => setActiveTab('LOYALTY_RULES')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
                activeTab === 'LOYALTY_RULES' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ServOS Rewards
            </button>
            <button
              onClick={() => setActiveTab('CREDIT_ACCOUNTS')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-bold ${
                activeTab === 'CREDIT_ACCOUNTS' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Corporate Credit
            </button>
          </div>

          <button
            onClick={() => setNewCustomerModal(true)}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Guest Profile</span>
          </button>
        </div>
      </div>

      {activeTab === 'PROFILE' && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Customer Directory Sidebar */}
          <div className="w-full md:w-80 lg:w-96 border-r border-slate-800 bg-slate-900/60 flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b border-slate-800 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name, phone, company..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-750 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {(['ALL', 'VIP_BLACK', 'GOLD', 'SILVER', 'BRONZE'] as const).map(tier => (
                  <button
                    key={tier}
                    onClick={() => setSelectedTier(tier)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold whitespace-nowrap transition-colors ${
                      selectedTier === tier ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredCustomers.map(cust => {
                const badge = getTierBadge(cust.vipTier);
                return (
                  <div
                    key={cust.id}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedCustomerId === cust.id
                        ? 'bg-amber-500/15 border-amber-500/50 shadow-sm'
                        : 'bg-slate-850/50 border-slate-750/70 hover:border-slate-650'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white truncate">{cust.name}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${badge.bg}`}>
                        {cust.vipTier}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1">
                      <span>{cust.phone}</span>
                      <span className="text-amber-400 font-bold">{cust.loyaltyPoints} pts</span>
                    </div>

                    {cust.companyName && (
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1 truncate">
                        <Building className="w-3 h-3 text-slate-400" />
                        <span>{cust.companyName}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Customer 360 Full Canvas */}
          {selectedCustomer ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Customer Hero Header */}
              <div className="p-5 sm:p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl font-bold font-mono">
                    {selectedCustomer.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-black text-white">{selectedCustomer.name}</h2>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${getTierBadge(selectedCustomer.vipTier).bg}`}>
                        {getTierBadge(selectedCustomer.vipTier).label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-amber-400" /> {selectedCustomer.phone}</span>
                      <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-cyan-400" /> {selectedCustomer.email}</span>
                      {selectedCustomer.companyName && (
                        <span className="flex items-center gap-1"><Building className="w-3.5 h-3.5 text-purple-400" /> {selectedCustomer.companyName}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Loyalty points banner */}
                <div className="flex items-center gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <Gift className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">ServOS Loyalty Points</span>
                    <div className="text-xl font-black text-amber-400 font-mono">
                      {selectedCustomer.loyaltyPoints.toLocaleString()} <span className="text-xs text-slate-400 font-normal">PTS</span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                      KES {selectedCustomer.loyaltyPoints.toLocaleString()} Redeemable Value
                    </span>
                  </div>
                </div>
              </div>

              {/* KPI STATS ROW */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Lifetime Spend</span>
                  <span className="text-lg font-black text-white font-mono mt-1 block">
                    KES {selectedCustomer.totalSpendKes.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono">Top 2% of Property</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Total Visits</span>
                  <span className="text-lg font-black text-white font-mono mt-1 block">
                    {selectedCustomer.visitCount} Visits
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">Last visit: {selectedCustomer.lastVisitDate}</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Hotel Nights</span>
                  <span className="text-lg font-black text-white font-mono mt-1 block">
                    {selectedCustomer.hotelNightsCount} Nights
                  </span>
                  <span className="text-[11px] text-cyan-400 font-mono">Avg Stay: 2.2 days</span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Avg Spend / Visit</span>
                  <span className="text-lg font-black text-white font-mono mt-1 block">
                    KES {selectedCustomer.avgSpendPerVisit.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-amber-400 font-mono">High Velocity</span>
                </div>
              </div>

              {/* PREFERENCES & ATTRIBUTES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400" />
                    <span>Guest Preferences & Favorites</span>
                  </h3>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-2">
                        <Wine className="w-4 h-4 text-amber-400" />
                        <span>Favourite Drink:</span>
                      </span>
                      <span className="text-white font-bold">{selectedCustomer.favouriteDrink}</span>
                    </div>

                    <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-2">
                        <Crown className="w-4 h-4 text-cyan-400" />
                        <span>Preferred Seating:</span>
                      </span>
                      <span className="text-white font-bold">{selectedCustomer.preferredTable}</span>
                    </div>

                    <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl space-y-1">
                      <span className="text-slate-400 block font-semibold">Service & Host Notes:</span>
                      <p className="text-slate-200 font-sans leading-relaxed">{selectedCustomer.notes}</p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {selectedCustomer.tags.map((tag, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold border border-slate-700">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* CORPORATE CREDIT ACCOUNT */}
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span>Corporate Credit Account</span>
                  </h3>

                  <div className="p-4 bg-slate-850 border border-slate-750 rounded-xl space-y-2 font-mono text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Credit Limit:</span>
                      <span className="text-white font-bold">KES {selectedCustomer.creditLimitKes.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Current Ledger Balance:</span>
                      <span className="text-rose-400 font-bold">KES {selectedCustomer.creditBalanceKes.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-750">
                      <span>Available Credit:</span>
                      <span className="text-emerald-400 font-bold">
                        KES {(selectedCustomer.creditLimitKes - selectedCustomer.creditBalanceKes).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs font-mono">
                    <span className="text-emerald-300 font-semibold">Authorized for POS Direct Room/Folio Charge</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>
              </div>

              {/* TIMELINE OF ENGAGEMENT */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4 text-cyan-400" />
                    <span>Cross-Property Activity Timeline</span>
                  </h3>
                  <span className="text-xs font-mono text-slate-400">{selectedCustomer.timeline.length} Recorded Stays/Visits</span>
                </div>

                <div className="space-y-2">
                  {selectedCustomer.timeline.map(act => (
                    <div key={act.id} className="p-3 bg-slate-850 border border-slate-750 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg border ${
                          act.type === 'BAR' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                          act.type === 'HOTEL' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' :
                          act.type === 'EVENT' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                          'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {act.type === 'BAR' ? <Wine className="w-4 h-4" /> :
                           act.type === 'HOTEL' ? <Bed className="w-4 h-4" /> :
                           act.type === 'EVENT' ? <Calendar className="w-4 h-4" /> :
                           <Gift className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{act.description}</p>
                          <span className="text-[10px] font-mono text-slate-400">{act.date} • Ref: {act.referenceId}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono font-bold text-xs">
                        <span className={act.amount < 0 ? 'text-emerald-400' : 'text-white'}>
                          {act.amount < 0 ? `-KES ${Math.abs(act.amount).toLocaleString()}` : `KES ${act.amount.toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* LOYALTY RULES TAB */}
      {activeTab === 'LOYALTY_RULES' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-amber-400" />
                <span>ServOS Rewards Tier Configuration</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Standard baseline: KES 100 spent = 1 ServOS Loyalty Point (KES 1 cash value on checkout)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                tier: 'BRONZE',
                spend: 'KES 0 - 50,000',
                rate: '1 pt per KES 100',
                perks: ['Welcome drink voucher', 'Birthday reward KES 500'],
                bg: 'border-orange-500/40 text-orange-300'
              },
              {
                tier: 'SILVER',
                spend: 'KES 50,000 - 250,000',
                rate: '1.25 pts per KES 100',
                perks: ['10% off Sunday Brunch', 'Birthday voucher KES 1,000', 'Late hotel checkout 13:00'],
                bg: 'border-slate-500/60 text-slate-300'
              },
              {
                tier: 'GOLD',
                spend: 'KES 250,000 - 1,000,000',
                rate: '1.5 pts per KES 100',
                perks: ['Priority VIP table reservations', 'Complimentary room upgrade', 'Birthday voucher KES 2,000', 'Valet parking'],
                bg: 'border-amber-500/60 text-amber-300'
              },
              {
                tier: 'PLATINUM',
                spend: 'KES 1,000,000 - 3,000,000',
                rate: '2.0 pts per KES 100',
                perks: ['Dedicated host manager', 'Guaranteed VIP booth on event nights', 'Annual luxury weekend stay'],
                bg: 'border-cyan-500/60 text-cyan-300'
              },
              {
                tier: 'VIP BLACK CARD',
                spend: 'KES 3,000,000+',
                rate: '3.0 pts per KES 100',
                perks: ['Private cellar access', 'Direct GM hotline', 'Unlimited complimentary airport chauffeur', 'Custom cocktail barrel'],
                bg: 'border-amber-400 text-amber-300'
              }
            ].map(item => (
              <div key={item.tier} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black border ${item.bg}`}>
                    {item.tier}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{item.rate}</span>
                </div>

                <div className="text-xs font-mono text-slate-300">
                  <span className="text-slate-400 block text-[10px] uppercase">Annual Spend Qualification</span>
                  <span className="text-sm font-bold text-white">{item.spend}</span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Privilege Inclusions</span>
                  {item.perks.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEW GUEST PROFILE MODAL */}
      {newCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Create Guest 360 Profile</h3>
              <button onClick={() => setNewCustomerModal(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Guest Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Dennis Ochieng"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Mobile Phone (M-PESA) *</label>
                <input
                  type="text"
                  placeholder="e.g. +254 712 345 678"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. d.ochieng@gmail.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Starting Membership Tier</label>
                <select
                  value={newTier}
                  onChange={e => setNewTier(e.target.value as CustomerVipTier)}
                  className="w-full bg-slate-800 border border-slate-700 text-amber-300 font-bold rounded-xl p-2 focus:outline-none"
                >
                  <option value="BRONZE">Bronze (Standard)</option>
                  <option value="SILVER">Silver Regular</option>
                  <option value="GOLD">Gold VIP</option>
                  <option value="VIP_BLACK">VIP Black Card</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setNewCustomerModal(false)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomer}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
              >
                Create Profile & 100 Pts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
