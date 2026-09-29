import React, { useState, useEffect } from 'react';
import { ServOSProvider, useServOS } from './context/ServOSContext';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { CommandCentreView } from './components/command/CommandCentreView';
import { POSView } from './components/pos/POSView';
import { KDSView } from './components/kds/KDSView';
import { HotelPMSView } from './components/hotel/HotelPMSView';
import { HostStandView } from './components/host/HostStandView';
import { RuntimeProvider, isNative } from './runtime/RuntimeProvider';
import { NativeRoot } from './native/NativeRoot';
import { RemoteManagerApp } from './runtime/RemoteManagerApp';
import { HelpCenterView } from './native/HelpCenterView';
import { CatalogStudioView } from './components/catalog/CatalogStudioView';
import { CRM360View } from './components/crm/CRM360View';
import { EventsNightlifeView } from './components/events/EventsNightlifeView';
import { InventoryView } from './components/inventory/InventoryView';
import { ProcurementView } from './components/procurement/ProcurementView';
import { AccountingView } from './components/accounting/AccountingView';
import { ControlEngineView } from './components/control/ControlEngineView';
import { StaffCashView } from './components/staff/StaffCashView';
import { SettingsCenterView } from './components/settings/SettingsCenterView';
import { ReportsCenterView } from './components/common/ReportsCenterView';
import { TenderReconciliationView } from './components/accounting/TenderReconciliationView';
import { BatchProductionView } from './components/catalog/BatchProductionView';
import { EdgeHardwareModal } from './components/edge/EdgeHardwareModal';
import { ToastContainer } from './components/common/ToastContainer';
import { WifiOff, Database, RefreshCw, Lock, ShieldCheck, ArrowRight } from 'lucide-react';

const MainApp: React.FC = () => {
  const { 
    isOffline, 
    offlineQueueCount, 
    syncOfflineQueue,
    userRole,
    switchUserRole,
    isTabAllowed,
    userPermissions
  } = useServOS();

  const route = () => window.location.hash.replace(/^#\/?/, '').split('/')[0] || 'pos';
  const [activeTab, setTab] = useState<string>(route);
  const setActiveTab = (tab: string) => { window.location.hash = '/' + tab; setTab(tab); };
  useEffect(() => { const update = () => setTab(route()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('servos_sidebar_collapsed');
      if (saved !== null) return saved === 'true';
      return typeof window !== 'undefined' && window.innerWidth < 1024;
    } catch {
      return false;
    }
  });

  // Automatically ensure active tab is allowed under current role
  useEffect(() => {
    if (!isTabAllowed(activeTab)) {
      setActiveTab('pos');
    }
  }, [userRole, activeTab, isTabAllowed]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('servos_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleBannerSync = async () => {
    setIsSyncing(true);
    await syncOfflineQueue();
    setIsSyncing(false);
  };

  const renderActiveModule = () => {
    // If not allowed, show RBAC Guard
    if (!isTabAllowed(activeTab)) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-950">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg animate-bounce">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Module Restricted for {userRole} Role
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 font-mono">
            Your current assigned access tier ({userRole}) does not have permissions to access the "{activeTab.toUpperCase()}" module.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setActiveTab('pos')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            >
              Return to POS View
            </button>
            <button
              onClick={() => switchUserRole('Manager')}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all"
            >
              <span>Unlock with another staff account</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'command':
        return <CommandCentreView />;
      case 'pos':
        return <POSView />;
      case 'host':
        return <HostStandView />;

      case 'kds':
        return <KDSView />;
      case 'hotel':
        return <HotelPMSView />;
      case 'reports':
        return <ReportsCenterView />;
      case 'tender':
        return <TenderReconciliationView />;
      case 'batch':
        return <BatchProductionView />;
      case 'catalog':
        return <CatalogStudioView />;
      case 'crm':
        return <CRM360View />;
      case 'events':
        return <EventsNightlifeView />;
      case 'inventory':
        return <InventoryView />;
      case 'procurement':
        return <ProcurementView />;
      case 'accounting':
        return <AccountingView />;
      case 'control':
        return <ControlEngineView />;
      case 'staff':
        return <StaffCashView />;
      case 'settings':
        return <SettingsCenterView />;
      case 'help':
        return <HelpCenterView />;
      default:
        return <POSView />;
    }
  };

  return (
    <div className="min-h-screen h-screen bg-slate-950 text-slate-100 flex flex-row font-sans selection:bg-amber-500 selection:text-slate-950 overflow-hidden">
      {/* Desktop Collapsible Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
      />

      {/* Main Viewport & Header */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          onOpenHardwareModal={() => setIsHardwareModalOpen(true)} 
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebarCollapse={handleToggleSidebar}
        />

        {/* Persistent Offline Notification Banner */}
        {isOffline && (
          <div className="bg-gradient-to-r from-amber-600/90 via-rose-600/90 to-amber-600/90 text-white px-3 py-1.5 text-xs font-mono flex items-center justify-between shadow-md shrink-0 border-b border-rose-500/30">
            <div className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-3.5 h-3.5 animate-pulse shrink-0" />
              <span className="font-bold shrink-0">OFFLINE MODE ACTIVE:</span>
              <span className="truncate hidden sm:inline">
                Local records remain available. Server synchronization will resume when connected.
              </span>
              <span className="truncate sm:hidden">
                Saved locally.
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="bg-black/30 px-2 py-0.5 rounded text-[11px] font-bold">
                {offlineQueueCount} queued
              </span>
            </div>
          </div>
        )}

        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pb-14 md:pb-0">
          {renderActiveModule()}
        </main>
      </div>

      {/* Edge Hardware Inspector Modal */}
      <EdgeHardwareModal 
        isOpen={isHardwareModalOpen} 
        onClose={() => setIsHardwareModalOpen(false)} 
      />

      {/* Global In-App Notifications Toast */}
      <ToastContainer />
    </div>
  );
};

const BrowserRoot = () => {
  const demoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';
  const [mode, setMode] = useState<'LANDING' | 'PREVIEW' | 'REMOTE'>(demoEnabled ? 'LANDING' : 'REMOTE');
  if (!demoEnabled) return <RemoteManagerApp onBack={() => setMode('REMOTE')} />;
  if (mode === 'REMOTE') return <RemoteManagerApp onBack={() => setMode('LANDING')} />;
  if (mode === 'PREVIEW' && demoEnabled) return <RuntimeProvider><ServOSProvider><div className="fixed left-0 right-0 top-0 z-[120] bg-amber-300 p-1 text-center text-xs font-bold text-slate-950">UI preview — sample data only. No durable business operations or provider integrations.</div><div className="pt-6"><MainApp /></div></ServOSProvider></RuntimeProvider>;
  return <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><div className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8"><div className="text-xs font-black tracking-[.3em] text-amber-400">SERVOS</div><h1 className="mt-2 text-4xl font-black">Single-business hospitality operations</h1><p className="mt-4 text-slate-400">Live trading runs in the installed Tauri application with local SQLite authority. This browser surface is for remote management or explicitly labelled UI preview only.</p><div className="mt-6 flex flex-wrap gap-3"><button className="rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950" onClick={() => setMode('REMOTE')}>Remote management</button><button className="rounded-xl border border-slate-700 px-4 py-3" onClick={() => setMode('PREVIEW')}>Open UI preview</button></div></div></div>;
};

export function App() {
  if (isNative) return <RuntimeProvider><NativeRoot /></RuntimeProvider>;
  return <BrowserRoot />;
}

export default App;
