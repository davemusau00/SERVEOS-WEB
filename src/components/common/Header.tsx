import React, { useState, useEffect, useMemo } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  Wifi, 
  WifiOff, 
  Building2, 
  Printer, 
  ShieldAlert,
  ChevronDown,
  Menu,
  X,
  LayoutDashboard,
  Utensils,
  Flame,
  Bed,
  Boxes,
  SlidersHorizontal,
  Calendar,
  FileSpreadsheet,
  Receipt,
  Coins,
  Users,
  UserCheck,
  Settings,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  CreditCard,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Info
} from 'lucide-react';
import { GlobalSearchModal } from './GlobalSearchModal';
import { OfflineQueueModal } from './OfflineQueueModal';
import { UniversalInboxModal } from '../inbox/UniversalInboxModal';
import { EdgeDevice, EdgeDeviceStatus, UserRole } from '../../types/servos';
import { calculatePredictiveInventory, PredictiveStockAnalysis } from '../../utils/predictiveStock';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenHardwareModal: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenHardwareModal,
  isSidebarCollapsed,
  onToggleSidebarCollapse
}) => {
  const {
    currentProperty,
    outlets,
    currentOutlet,
    setCurrentOutlet,
    employees,
    currentUser,
    setCurrentUser,
    userRole,
    setUserRole,
    switchUserRole,
    isTabAllowed,
    availableRoles,
    isOffline,
    toggleOfflineMode,
    offlineQueueCount,
    syncOfflineQueue,
    anomalyAlerts,
    approvalRequests,
    edgeDevices,
    stockItems,
    stockMovements
  } = useServOS();

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [hardwareDropdownOpen, setHardwareDropdownOpen] = useState<boolean>(false);
  const [offlineQueueModalOpen, setOfflineQueueModalOpen] = useState<boolean>(false);
  const [inboxModalOpen, setInboxModalOpen] = useState<boolean>(false);

  // Calculate Predictive Low-Stock Alerts for Global Search Bar Indicator
  const predictiveAlerts = useMemo(() => {
    return calculatePredictiveInventory(stockItems || [], stockMovements || []).filter(
      (p: PredictiveStockAnalysis) => p.urgencyLevel === 'CRITICAL' || p.urgencyLevel === 'WARNING'
    );
  }, [stockItems, stockMovements]);

  const criticalStockoutsCount = predictiveAlerts.filter((p: PredictiveStockAnalysis) => p.urgencyLevel === 'CRITICAL').length;

  const openAlertsCount = anomalyAlerts.filter(a => a.status === 'OPEN').length;
  const pendingApprovalsCount = approvalRequests.filter(a => a.status === 'PENDING').length;
  const totalControlAlerts = openAlertsCount + pendingApprovalsCount;

  // Global Hotkey for Search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navLinks = [
    { id: 'command', label: 'Command Centre', icon: LayoutDashboard, desc: 'Live revenue, occupancy & alerts' },
    { id: 'pos', label: 'POS & Tables', icon: Utensils, desc: 'Floorplan, bills & settlement' },
    { id: 'kds', label: 'KDS Pass', icon: Flame, desc: 'Kitchen & bar prep stations' },
    { id: 'hotel', label: 'Hotel PMS', icon: Bed, desc: 'Tape chart, rooms & housekeeping' },
    { id: 'catalog', label: 'Catalog Studio', icon: SlidersHorizontal, desc: 'Portions, yields & price books' },
    { id: 'crm', label: 'Guest 360 & Loyalty', icon: Users, desc: 'Customer profiles & rewards' },
    { id: 'events', label: 'Events & Nightlife', icon: Calendar, desc: 'Door scanner & promoters' },
    { id: 'inventory', label: 'Inventory & Yield', icon: Boxes, desc: 'Spirits yield & stock depletion' },
    { id: 'procurement', label: 'Procurement & AP', icon: FileSpreadsheet, desc: 'POs, GRN & 3-way match' },
    { id: 'accounting', label: 'Accounting & eTIMS', icon: Receipt, desc: 'Double-entry & KRA fiscal' },
    { id: 'control', label: 'Control & Audit', icon: ShieldAlert, desc: 'Anomalies & approvals' },
    { id: 'staff', label: 'Staff & HR Hub', icon: UserCheck, desc: 'Payroll, leave, shifts & till' },
    { id: 'settings', label: 'Settings & Admin', icon: Settings, desc: 'Multi-property, RBAC & eTIMS' }
  ];

  const visibleNavLinks = navLinks.filter(link => isTabAllowed(link.id));

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  // Hardware Status Aggregations
  const fiscalDevice = edgeDevices.find(d => d.type === 'FISCAL_PRINTER');
  const cardReaderDevice = edgeDevices.find(d => d.type === 'CARD_READER');
  const receiptPrinterDevice = edgeDevices.find(d => d.type === 'RECEIPT_PRINTER');
  const kitchenPrinterDevice = edgeDevices.find(d => d.type === 'KITCHEN_PRINTER');
  const drawerDevice = edgeDevices.find(d => d.type === 'CASH_DRAWER');
  const scaleDevice = edgeDevices.find(d => d.type === 'WEIGHING_SCALE');

  const onlineCount = edgeDevices.filter(d => d.status === 'ONLINE').length;
  const errorDevices = edgeDevices.filter(d => d.status === 'ERROR');
  const hasHardwareError = errorDevices.length > 0;
  const hasHardwareOffline = edgeDevices.some(d => d.status === 'OFFLINE');

  // Helper to get color for individual hardware icon
  const getDeviceStatusColor = (device?: EdgeDevice) => {
    if (!device) return 'text-slate-500';
    if (device.status === 'ONLINE') return 'text-emerald-400';
    if (device.status === 'ERROR') return 'text-rose-400 animate-pulse';
    return 'text-slate-400';
  };

  const getDeviceStatusDot = (device?: EdgeDevice) => {
    if (!device) return 'bg-slate-600';
    if (device.status === 'ONLINE') return 'bg-emerald-400';
    if (device.status === 'ERROR') return 'bg-rose-500 animate-ping';
    return 'bg-slate-500';
  };

  return (
    <>
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-40 select-none">
        <div className="w-full max-w-full px-2 sm:px-4 h-14 sm:h-15 flex items-center justify-between gap-1.5 sm:gap-3">
          {/* Zone 1: Mobile Hamburger & Desktop Sidebar Toggle + Active Outlet Selector */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink-0">
            {/* Mobile Hamburger Button (< md) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 focus:outline-none shrink-0"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Desktop & Tablet Sidebar Toggle Button (>= md) */}
            <button
              onClick={onToggleSidebarCollapse}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden md:flex items-center justify-center p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-amber-400" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {/* Mobile Brand Logo (< md) */}
            <div 
              className="flex md:hidden items-center gap-1.5 cursor-pointer shrink-0" 
              onClick={() => handleSelectTab('pos')}
            >
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center font-black text-slate-950 text-xs shadow-sm shrink-0">
                S
              </div>
              <span className="text-sm font-bold tracking-tight text-white font-sans shrink-0">
                ServOS
              </span>
            </div>

            {/* Property & Outlet selector (Desktop/Tablet >= md) */}
            <div className="hidden md:flex items-center gap-1.5 text-xs min-w-0">
              <div className="h-5 w-[1px] bg-slate-700/60 shrink-0" />
              <span className="text-slate-400 font-medium truncate max-w-[120px] lg:max-w-[150px]">
                {currentProperty.name}
              </span>
              <span className="text-slate-600">/</span>
              <div className="relative group min-w-0 max-w-[140px] lg:max-w-[180px]">
                <select
                  value={currentOutlet.id}
                  onChange={e => {
                    const out = outlets.find(o => o.id === e.target.value);
                    if (out) setCurrentOutlet(out);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 text-amber-300 font-semibold rounded-lg px-2.5 py-1 pr-6 text-xs appearance-none cursor-pointer focus:outline-none focus:border-amber-400 hover:bg-slate-750 truncate"
                >
                  {outlets.map(out => (
                    <option key={out.id} value={out.id}>
                      {out.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Zone 2: Central Global Search Bar (Responsive Desktop & Mobile) */}
          <div className="flex items-center justify-center flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-1">
            {/* Desktop / Tablet Search Input Button (>= sm) */}
            <button
              onClick={() => setSearchModalOpen(true)}
              className="hidden sm:flex w-full items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-750 hover:border-amber-500/50 rounded-xl text-slate-400 hover:text-slate-200 transition-all shadow-inner group"
              title="Global Search (Press Cmd+K / Ctrl+K)"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                <span className="text-xs font-medium truncate text-left text-slate-300">
                  Search items, guests, folios, invoices...
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {predictiveAlerts.length > 0 && (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab('inventory');
                    }}
                    className={`hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors ${
                      criticalStockoutsCount > 0 
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse hover:bg-rose-500/30' 
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
                    }`}
                    title="Predictive Low-Stock Alert: Click to view inventory forecasting"
                  >
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    <span>{criticalStockoutsCount > 0 ? `${criticalStockoutsCount} CRITICAL` : `${predictiveAlerts.length} LOW STOCK`}</span>
                  </span>
                )}

                <kbd className="hidden sm:flex items-center gap-0.5 font-mono text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-1.5 py-0.5 rounded shadow-xs">
                  <span>⌘</span>K
                </kbd>
              </div>
            </button>

            {/* Mobile Compact Search Trigger Button (< sm) */}
            <button
              onClick={() => setSearchModalOpen(true)}
              className="sm:hidden flex items-center justify-center p-1.5 bg-slate-950/60 hover:bg-slate-800 border border-slate-750 rounded-lg text-slate-300 text-xs shrink-0"
              title="Global Search"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              {predictiveAlerts.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse ml-0.5" />
              )}
            </button>
          </div>

          {/* Zone 3: Right Role Switcher, Hardware Indicators & Offline Mode */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* RBAC ROLE SELECTOR (Admin / Manager / Server) */}
            <div className="relative">
              <div className="flex items-center">
                <select
                  value={userRole}
                  onChange={e => switchUserRole(e.target.value as UserRole)}
                  title={`Switch Active User Role (Current: ${userRole})`}
                  className={`text-[11px] font-mono font-bold rounded-lg px-2 py-1 pr-5 appearance-none cursor-pointer focus:outline-none transition-all border shrink-0 ${
                    userRole === 'Admin'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                      : userRole === 'Manager'
                      ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 hover:bg-purple-500/25'
                      : 'bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25'
                  }`}
                >
                  <option value="Admin" className="bg-slate-900 text-amber-300">Admin</option>
                  <option value="Manager" className="bg-slate-900 text-purple-300">Manager</option>
                  <option value="Server" className="bg-slate-900 text-blue-300">Server</option>
                </select>
                <ChevronDown className={`w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                  userRole === 'Admin' ? 'text-amber-400' : userRole === 'Manager' ? 'text-purple-400' : 'text-blue-400'
                }`} />
              </div>
            </div>

            {/* Visual Indicator: Connected Edge Hardware */}
            <div className="relative">
              <button
                onClick={onOpenHardwareModal}
                onMouseEnter={() => setHardwareDropdownOpen(true)}
                onMouseLeave={() => setHardwareDropdownOpen(false)}
                title="Hardware status: Click to open Edge LAN Hardware Controller"
                className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 text-xs font-mono rounded-lg border transition-all shrink-0 ${
                  hasHardwareError
                    ? 'bg-rose-950/50 border-rose-600/60 text-rose-200 shadow-sm ring-1 ring-rose-500/40'
                    : hasHardwareOffline
                    ? 'bg-amber-950/30 border-amber-600/40 text-amber-300'
                    : 'bg-slate-800/90 border-slate-700/80 text-slate-300 hover:bg-slate-750 hover:border-slate-600'
                }`}
              >
                {/* Fiscal Printer */}
                <span className="relative flex items-center" title={`Fiscal OSCU Box: ${fiscalDevice?.status || 'ONLINE'}`}>
                  <Receipt className={`w-3.5 h-3.5 ${getDeviceStatusColor(fiscalDevice)}`} />
                  <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${getDeviceStatusDot(fiscalDevice)}`} />
                </span>

                {/* EMV Card Reader */}
                <span className="relative hidden xs:flex items-center" title={`EMV Card Terminal: ${cardReaderDevice?.status || 'ONLINE'}`}>
                  <CreditCard className={`w-3.5 h-3.5 ${getDeviceStatusColor(cardReaderDevice)}`} />
                  <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${getDeviceStatusDot(cardReaderDevice)}`} />
                </span>

                {/* Overall status glowing dot */}
                <span className={`w-2 h-2 rounded-full ${
                  hasHardwareError 
                    ? 'bg-rose-500 animate-ping' 
                    : hasHardwareOffline 
                    ? 'bg-amber-400' 
                    : 'bg-emerald-400 animate-pulse'
                }`} />
              </button>

              {/* Hardware Quick Dropdown Preview on hover */}
              {hardwareDropdownOpen && (
                <div 
                  className="absolute right-0 top-full mt-1.5 w-64 bg-slate-900 border border-slate-750 rounded-xl p-3 shadow-2xl z-50 animate-in fade-in duration-100 hidden sm:block"
                  onMouseEnter={() => setHardwareDropdownOpen(true)}
                  onMouseLeave={() => setHardwareDropdownOpen(false)}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px] font-mono">
                    <span className="font-bold text-slate-200 uppercase">Edge Peripherals</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      hasHardwareError ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {onlineCount}/{edgeDevices.length} Online
                    </span>
                  </div>

                  <div className="py-2 space-y-1.5 text-xs font-mono">
                    {edgeDevices.slice(0, 4).map(dev => (
                      <div key={dev.id} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 truncate max-w-[140px]">
                          {dev.name.split('(')[0]}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          dev.status === 'ONLINE' ? 'text-emerald-400 bg-emerald-500/10' :
                          dev.status === 'ERROR' ? 'text-rose-400 bg-rose-500/10 animate-pulse' :
                          'text-slate-400 bg-slate-800'
                        }`}>
                          {dev.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={onOpenHardwareModal}
                    className="w-full mt-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold text-center transition-colors block"
                  >
                    Open Hardware Diagnostics
                  </button>
                </div>
              )}
            </div>

            {/* Offline Mode Toggle & Sync (Hidden on extra small mobile screens < sm, available in menu drawer) */}
            <div className="hidden sm:flex items-center gap-1">
              <button
                onClick={toggleOfflineMode}
                title={isOffline ? 'Offline Mode Active' : 'Network Online'}
                className={`flex items-center justify-center gap-1 p-1.5 sm:px-2 sm:py-1 text-xs font-medium rounded-lg border transition-colors shrink-0 ${
                  isOffline
                    ? 'bg-rose-950/70 border-rose-600/60 text-rose-300 animate-pulse'
                    : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {isOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="hidden md:inline font-mono text-[11px]">
                  {isOffline ? 'OFFLINE' : 'ONLINE'}
                </span>
              </button>

              <button
                onClick={() => setOfflineQueueModalOpen(true)}
                title="Open IndexedDB Offline Queue"
                className={`px-1.5 sm:px-2 py-1 text-xs font-mono font-bold rounded-lg flex items-center gap-1 shadow-sm shrink-0 transition-colors ${
                  offlineQueueCount > 0 
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-200 border border-slate-700'
                }`}
              >
                <span className="hidden lg:inline">{offlineQueueCount > 0 ? 'SYNC' : 'QUEUE'}</span>
                <span>({offlineQueueCount})</span>
              </button>

              {/* Universal Inbox & Approvals Quick Trigger */}
              <button
                onClick={() => setInboxModalOpen(true)}
                title={`Universal Inbox: ${totalControlAlerts} active items`}
                className="relative p-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
              >
                <Inbox className="w-4 h-4 text-amber-400" />
                {totalControlAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.2 bg-rose-500 text-white font-mono text-[9px] font-bold rounded-full border border-slate-900 animate-pulse min-w-3.5 text-center">
                    {totalControlAlerts}
                  </span>
                )}
              </button>
            </div>

            {/* Active Employee Switcher (Desktop >= lg) */}
            <div className="relative group hidden lg:block">
              <select
                value={currentUser.id}
                onChange={e => {
                  const emp = employees.find(em => em.id === e.target.value);
                  if (emp) setCurrentUser(emp);
                }}
                className="bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-lg px-2 sm:px-2.5 py-1 pr-6 text-xs appearance-none cursor-pointer focus:outline-none focus:border-amber-400 hover:bg-slate-750 max-w-[130px] lg:max-w-[160px] truncate"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </header>

      {/* UNIVERSAL INBOX MODAL */}
      <UniversalInboxModal
        isOpen={inboxModalOpen}
        onClose={() => setInboxModalOpen(false)}
      />

      {/* GLOBAL SEARCH COMMAND MODAL */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onNavigateTab={handleSelectTab}
      />

      {/* INDEXEDDB OFFLINE QUEUE & SYNC ENGINE MODAL */}
      <OfflineQueueModal
        isOpen={offlineQueueModalOpen}
        onClose={() => setOfflineQueueModalOpen(false)}
      />

      {/* MOBILE DRAWER OVERLAY (< md) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="fixed inset-y-0 left-0 w-[300px] sm:w-[340px] bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col z-10">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center font-black text-slate-950 text-base">
                  S
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">ServOS Enterprise</h3>
                  <p className="text-[10px] text-amber-400 font-mono">Hospitality ERP & POS</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Search Button in Mobile Drawer */}
            <div className="p-3 bg-slate-950/40 border-b border-slate-800">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSearchModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 p-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300 text-xs font-semibold"
              >
                <Search className="w-4 h-4 text-amber-400" />
                <span>Global Lookup & Search</span>
                <span className="ml-auto text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">⌘K</span>
              </button>
            </div>

            {/* Role Switcher in Mobile Drawer */}
            <div className="p-3 bg-slate-950/40 border-b border-slate-800 space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
                Active User Role (Permissions)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['Admin', 'Manager', 'Server'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      switchUserRole(r);
                      setMobileMenuOpen(false);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all text-center ${
                      userRole === r
                        ? r === 'Admin'
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : r === 'Manager'
                          ? 'bg-purple-500 text-white shadow-xs'
                          : 'bg-blue-500 text-white shadow-xs'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Outlet Selector in Mobile Drawer */}
            <div className="p-3 bg-slate-950/40 border-b border-slate-800 space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
                Active Property & Outlet
              </label>
              <div className="relative">
                <select
                  value={currentOutlet.id}
                  onChange={e => {
                    const out = outlets.find(o => o.id === e.target.value);
                    if (out) setCurrentOutlet(out);
                  }}
                  className="w-full bg-slate-850 border border-slate-700 text-amber-300 font-semibold rounded-lg p-2 pr-8 text-xs appearance-none focus:outline-none focus:border-amber-400"
                >
                  {outlets.map(out => (
                    <option key={out.id} value={out.id}>
                      {currentProperty.name} • {out.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Navigation Modules List (Filtered by isTabAllowed) */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono px-2 py-1">
                Authorized Modules ({userRole})
              </div>
              {visibleNavLinks.map(link => {
                const Icon = link.icon;
                const isActive = activeTab === link.id;
                return (
                  <button
                    key={link.id}
                    onClick={() => handleSelectTab(link.id)}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-all ${
                      isActive
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">{link.label}</div>
                        <div className="text-[10px] text-slate-400">{link.desc}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {link.id === 'control' && totalControlAlerts > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 rounded-full border border-rose-500/30">
                          {totalControlAlerts}
                        </span>
                      )}
                      <ChevronRight className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-600'}`} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Current Staff Switcher & Edge Footer */}
            <div className="p-3 bg-slate-950/80 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold">Logged Employee:</span>
                <span className="text-[10px] font-mono text-amber-400 font-bold">{userRole.toUpperCase()}</span>
              </div>
              <div className="relative">
                <select
                  value={currentUser.id}
                  onChange={e => {
                    const emp = employees.find(em => em.id === e.target.value);
                    if (emp) setCurrentUser(emp);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-lg p-2 text-xs appearance-none focus:outline-none"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE STICKY BOTTOM NAVIGATION BAR (< md) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 md:hidden flex items-center justify-around h-14 px-2 safe-area-bottom no-print">
        <button
          onClick={() => handleSelectTab('pos')}
          className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
            activeTab === 'pos' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Utensils className="w-4 h-4 mb-0.5" />
          <span>POS</span>
        </button>

        <button
          onClick={() => handleSelectTab('kds')}
          className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
            activeTab === 'kds' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-4 h-4 mb-0.5" />
          <span>KDS</span>
        </button>

        <button
          onClick={() => handleSelectTab('hotel')}
          className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
            activeTab === 'hotel' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bed className="w-4 h-4 mb-0.5" />
          <span>Hotel</span>
        </button>

        {isTabAllowed('control') && (
          <button
            onClick={() => handleSelectTab('control')}
            className={`relative flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'control' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 mb-0.5" />
            <span>Control</span>
            {totalControlAlerts > 0 && (
              <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-slate-900 animate-pulse" />
            )}
          </button>
        )}

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium text-slate-400 hover:text-slate-200"
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span>Modules</span>
        </button>
      </nav>
    </>
  );
};
