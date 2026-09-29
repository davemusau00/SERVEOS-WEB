import React from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  LayoutDashboard,
  Utensils, 
  Flame, 
  Bed, 
  Boxes, 
  SlidersHorizontal,
  Users,
  Calendar,
  FileSpreadsheet, 
  Receipt, 
  ShieldAlert, 
  UserCheck, 
  Settings,
  ChevronLeft, 
  ChevronRight, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Printer, 
  Building2,
  BarChart3,
  FlaskConical,
  CheckCircle2,
  AlertCircle,
  BookOpen
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenHardwareModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isCollapsed,
  onToggleCollapse,
  onOpenHardwareModal
}) => {
  const {
    currentProperty,
    currentOutlet,
    currentUser,
    userRole,
    switchUserRole,
    isTabAllowed,
    anomalyAlerts,
    approvalRequests
  } = useServOS();

  const openAlertsCount = anomalyAlerts.filter(a => a.status === 'OPEN').length;
  const pendingApprovalsCount = approvalRequests.filter(a => a.status === 'PENDING').length;
  const totalControlAlerts = openAlertsCount + pendingApprovalsCount;

  const allNavLinks = [
    { id: 'command', label: 'Command Centre', icon: LayoutDashboard, desc: 'Live revenue, occupancy & alerts' },
    { id: 'pos', label: 'POS & Tables', icon: Utensils, desc: 'Floorplan, tabs & checkout' },
    { id: 'host', label: 'Host & Reservations', icon: UserCheck, desc: 'Waitlist, reservations & seating' },
    { id: 'kds', label: 'KDS Pass', icon: Flame, desc: 'Kitchen & bar prep stations' },
    { id: 'hotel', label: 'Hotel PMS', icon: Bed, desc: 'Tape chart, rooms & housekeeping' },
    { id: 'reports', label: 'Reports Centre', icon: BarChart3, desc: 'Sales, Covers, SLA & Engineering' },
    { id: 'tender', label: 'Tender Settlement', icon: Receipt, desc: 'Shift drawer & payment audit' },
    { id: 'batch', label: 'Batch Prep Studio', icon: FlaskConical, desc: 'Sub-recipes, yield & prep runs' },
    { id: 'catalog', label: 'Catalog Studio', icon: SlidersHorizontal, desc: 'Portions, yields & price books' },
    { id: 'crm', label: 'Guest 360 & Loyalty', icon: Users, desc: 'Customer profiles & rewards' },
    { id: 'events', label: 'Events & Nightlife', icon: Calendar, desc: 'Door scanner & promoters' },
    { id: 'inventory', label: 'Inventory & Yield', icon: Boxes, desc: 'Spirits yield & stock depletion' },
    { id: 'procurement', label: 'Procurement & AP', icon: FileSpreadsheet, desc: 'POs, GRN & 3-way match' },
    { id: 'accounting', label: 'Accounting & eTIMS', icon: Receipt, desc: 'Double-entry & reconciliation' },
    { id: 'control', label: 'Control & Audit', icon: ShieldAlert, desc: 'Anomalies & approvals' },
    { id: 'staff', label: 'Staff & HR Hub', icon: UserCheck, desc: 'Payroll, leave, shifts & till' },
    { id: 'settings', label: 'Business Admin', icon: Settings, desc: 'Staff, terminal, backups & synchronization' },
    { id: 'help', label: 'Help Center', icon: BookOpen, desc: 'Offline operating guides and troubleshooting' },
  ];

  const visibleNavLinks = allNavLinks.filter(link => isTabAllowed(link.id));

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 h-screen sticky top-0 z-30 bg-slate-900 border-r border-slate-800 transition-all duration-200 select-none ${
        isCollapsed ? 'w-[68px] lg:w-[74px]' : 'w-64'
      }`}
    >
      {/* Brand & Collapse Header */}
      <div className="h-15 border-b border-slate-800 flex items-center justify-between px-3.5 bg-slate-950/40">
        <div 
          onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-2.5 cursor-pointer overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center font-black text-slate-950 text-base shadow-sm shrink-0">
            S
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5 font-sans leading-none">
                ServOS
              </span>
              <p className="text-[9.5px] text-amber-400 font-mono tracking-wider uppercase mt-1">
                Hospitality ERP
              </p>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <button
            onClick={onToggleCollapse}
            title="Collapse Sidebar"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Outlet context card when expanded */}
      {!isCollapsed && (
        <div className="px-3 py-2.5 border-b border-slate-800/80 bg-slate-950/20">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-200 truncate">
                {currentProperty.name}
              </div>
              <div className="text-[10px] text-amber-300 font-mono truncate">
                {currentOutlet.name}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-none">
        {visibleNavLinks.map(link => {
          const Icon = link.icon;
          const isActive = activeTab === link.id;
          const hasAlerts = link.id === 'control' && totalControlAlerts > 0;

          if (isCollapsed) {
            return (
              <button
                key={link.id}
                onClick={() => setActiveTab(link.id)}
                title={`${link.label}${hasAlerts ? ` (${totalControlAlerts} alerts)` : ''} - ${link.desc}`}
                className={`relative w-full h-11 flex items-center justify-center rounded-xl transition-all group ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-amber-400 rounded-r" />
                )}
                {hasAlerts && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-slate-900 animate-pulse" />
                )}
              </button>
            );
          }

          return (
            <button
              key={link.id}
              onClick={() => setActiveTab(link.id)}
              className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-all group ${
                isActive
                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`p-2 rounded-lg shrink-0 transition-colors ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-750'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className={`text-xs truncate ${isActive ? 'font-bold text-white' : 'font-medium'}`}>
                    {link.label}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {link.desc}
                  </div>
                </div>
              </div>

              {hasAlerts && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full shrink-0">
                  {totalControlAlerts}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / Edge Hardware & Active Staff */}
      <div className="border-t border-slate-800 bg-slate-950/60 p-2 space-y-1.5">
        {/* Hardware bridge trigger */}
        <button
          onClick={onOpenHardwareModal}
          title="Edge Hardware Bridge (Printers, Drawer, Scale)"
          className={`w-full flex items-center rounded-lg transition-colors p-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Printer className="w-4 h-4 text-amber-400 shrink-0" />
            {!isCollapsed && (
              <span className="font-mono text-[11px]">Edge Hardware</span>
            )}
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        </button>

        {/* Staff badge & Role indicator */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} pt-1`}>
          {!isCollapsed ? (
            <div className="min-w-0 flex items-center justify-between w-full">
              <div className="min-w-0 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-[10px] text-amber-400 shrink-0">
                  {currentUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-200 truncate leading-none">
                    {currentUser.name}
                  </p>
                  <p className="text-[9.5px] font-mono text-amber-400 truncate mt-0.5">
                    Role: {userRole}
                  </p>
                </div>
              </div>

              <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold shrink-0 ${
                userRole === 'Admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                userRole === 'Manager' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                {userRole}
              </span>
            </div>
          ) : (
            <div 
              title={`${currentUser.name} (Role: ${userRole})`}
              className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-[10px] text-amber-400"
            >
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          {isCollapsed && (
            <button
              onClick={onToggleCollapse}
              title="Expand Sidebar"
              className="mt-1 w-full flex items-center justify-center p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
