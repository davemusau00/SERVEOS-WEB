import React, { useState } from 'react';
import { 
  Inbox, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Wrench, 
  Bed, 
  Sparkles, 
  CreditCard, 
  FileText, 
  ArrowRight, 
  DollarSign, 
  Filter, 
  Search,
  Check,
  Zap,
  CheckCheck
} from 'lucide-react';
import { InboxTaskItem, InboxCategory } from '../../types/servos';
import { useServOS } from '../../context/ServOSContext';

interface UniversalInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
}

const INITIAL_INBOX_ITEMS: InboxTaskItem[] = [
  {
    id: 'inbox-01',
    category: 'CASH_VARIANCE',
    urgency: 'URGENT',
    title: 'Cash Variance Detected on Till #04',
    subtitle: 'Shift Cashier: David Kiprop • Terrace Bar Terminal',
    description: 'Physical cash count of KES 28,600 differs from theoretical POS cash sales of KES 31,000 (-KES 2,400 variance). Immediate manager count required.',
    amountKes: -2400,
    dueTimeText: '12m overdue',
    relatedEntityId: 'till-04',
    actionLabel: 'Investigate Variance',
    actionType: 'AUDIT_TILL',
    targetTab: 'staff',
    isCompleted: false,
    createdAt: '2026-09-23T12:45:00'
  },
  {
    id: 'inbox-02',
    category: 'MAINTENANCE',
    urgency: 'URGENT',
    title: 'Room 312 AC Compressor Overheating',
    subtitle: 'Deluxe Suite • Guest checked in: Amb. Richard Davis',
    description: 'Smart thermostat trigger: Ambient temp 27.8°C (Target 21°C). Guest requested urgent cooling resolution before VIP dinner.',
    dueTimeText: '45m overdue',
    relatedEntityId: 'WO-312',
    actionLabel: 'Assign Engineering',
    actionType: 'ASSIGN_TECH',
    targetTab: 'hotel',
    isCompleted: false,
    createdAt: '2026-09-23T13:10:00'
  },
  {
    id: 'inbox-03',
    category: 'STOCK_ALERT',
    urgency: 'URGENT',
    title: 'Jameson 750ml Stockout in 1.4 Days',
    subtitle: 'Velocity: 24.5 btls/day • On Hand: 34 bottles',
    description: 'Predictive algorithm forecasts complete depletion by Friday 18:00. Minimum batch reorder size: 36 bottles from East African Distillers.',
    dueTimeText: 'Reorder today',
    relatedEntityId: 'JAMESON-750',
    actionLabel: 'Create PO (36 btls)',
    actionType: 'CREATE_PO',
    targetTab: 'procurement',
    isCompleted: false,
    createdAt: '2026-09-23T11:20:00'
  },
  {
    id: 'inbox-04',
    category: 'APPROVAL',
    urgency: 'HIGH',
    title: 'VIP Discount Override: 15% on KES 48,200',
    subtitle: 'Waiter: Alex Otieno • Table VIP 02 (Corporate Folio)',
    description: 'Executive courtesy discount requested for Safaricom CEO hosted dinner. Requires Manager PIN approval.',
    amountKes: 7230,
    dueTimeText: 'Action needed',
    relatedEntityId: 'APPR-901',
    actionLabel: 'Review & Authorize',
    actionType: 'APPROVE_DISCOUNT',
    targetTab: 'control',
    isCompleted: false,
    createdAt: '2026-09-23T13:30:00'
  },
  {
    id: 'inbox-05',
    category: 'OVERDUE_INVOICE',
    urgency: 'HIGH',
    title: 'Supplier Invoice Overdue by 8 Days',
    subtitle: 'East African Distillers • INV-04482',
    description: 'KES 143,840 pending AP disbursement. Credit hold risk for upcoming weekend spirits restock order.',
    amountKes: 143840,
    dueTimeText: '8 days late',
    relatedEntityId: 'INV-04482',
    actionLabel: 'Schedule AP Payment',
    actionType: 'PAY_AP',
    targetTab: 'accounting',
    isCompleted: false,
    createdAt: '2026-09-23T09:00:00'
  },
  {
    id: 'inbox-06',
    category: 'HOUSEKEEPING',
    urgency: 'HIGH',
    title: 'Rush Cleaning Required: Room 204',
    subtitle: 'Executive Penthouse • Early VIP Arrival at 14:30',
    description: 'Previous guest checked out at 12:00. Room marked Dirty. Priority VIP inspection needed for incoming Gold Member stay.',
    dueTimeText: '25m left',
    relatedEntityId: 'ROOM-204',
    actionLabel: 'Dispatch Housekeeper',
    actionType: 'DISPATCH_HK',
    targetTab: 'hotel',
    isCompleted: false,
    createdAt: '2026-09-23T13:15:00'
  },
  {
    id: 'inbox-07',
    category: 'SYNC_CONFLICT',
    urgency: 'MEDIUM',
    title: 'eTIMS OSCU Buffer: 3 Pending Invoices',
    subtitle: 'KRA Fiscal Server • Timeout at 13:04',
    description: '3 offline sales recorded with local cryptographic hash. Automatic retry queued for background submission.',
    amountKes: 34500,
    dueTimeText: 'Queued',
    relatedEntityId: 'ETIMS-SYNC',
    actionLabel: 'Force Fiscal Sync',
    actionType: 'RETRY_SYNC',
    targetTab: 'accounting',
    isCompleted: false,
    createdAt: '2026-09-23T13:05:00'
  }
];

export const UniversalInboxModal: React.FC<UniversalInboxModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab
}) => {
  const { showToast } = useServOS();
  const [items, setItems] = useState<InboxTaskItem[]>(INITIAL_INBOX_ITEMS);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  const activeItems = items.filter(i => !i.isCompleted);
  const completedItems = items.filter(i => i.isCompleted);

  const filteredItems = items.filter(item => {
    if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
    if (selectedUrgency !== 'ALL' && item.urgency !== selectedUrgency) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleResolveTask = (task: InboxTaskItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItems(prev => prev.map(t => t.id === task.id ? { ...t, isCompleted: true } : t));
    showToast(`Resolved: ${task.title}`, 'success');
  };

  const handleActionClick = (task: InboxTaskItem) => {
    if (task.targetTab && onNavigateTab) {
      onNavigateTab(task.targetTab);
      onClose();
    } else {
      handleResolveTask(task);
    }
  };

  const getCategoryBadge = (cat: InboxCategory) => {
    switch (cat) {
      case 'CASH_VARIANCE':
        return { label: 'Cash Variance', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: DollarSign };
      case 'MAINTENANCE':
        return { label: 'Maintenance', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: Wrench };
      case 'STOCK_ALERT':
        return { label: 'Low Stock', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: AlertTriangle };
      case 'APPROVAL':
        return { label: 'Approval', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: ShieldAlert };
      case 'HOUSEKEEPING':
        return { label: 'Housekeeping', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', icon: Bed };
      case 'OVERDUE_INVOICE':
        return { label: 'Accounts Payable', color: 'bg-red-500/20 text-red-300 border-red-500/40', icon: FileText };
      default:
        return { label: 'System', color: 'bg-slate-700 text-slate-300 border-slate-600', icon: Sparkles };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className="fixed inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">ServOS Universal Action Inbox</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {activeItems.length} PENDING ACTIONS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Single operational cockpit for approvals, till variances, predictive stockouts & SLA tasks
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters bar */}
        <div className="p-3 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter tasks by room, item, cashier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-850 border border-slate-750 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-slate-850 border border-slate-750 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="CASH_VARIANCE">Cash Variances</option>
              <option value="STOCK_ALERT">Stock Alerts</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="APPROVAL">Approvals</option>
              <option value="HOUSEKEEPING">Housekeeping</option>
              <option value="OVERDUE_INVOICE">Overdue AP</option>
            </select>

            <select
              value={selectedUrgency}
              onChange={e => setSelectedUrgency(e.target.value)}
              className="bg-slate-850 border border-slate-750 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="ALL">All Urgencies</option>
              <option value="URGENT">Urgent Only</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium</option>
            </select>

            {activeItems.length > 0 && (
              <button
                onClick={() => {
                  setItems(prev => prev.map(t => ({ ...t, isCompleted: true })));
                  showToast('Marked all pending tasks as resolved!', 'info');
                }}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Resolve All</span>
              </button>
            )}
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3 animate-pulse" />
              <h3 className="text-base font-bold text-white mb-1">Inbox Zero Achieved</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                No outstanding operational bottlenecks, till variances or critical alerts require executive intervention right now.
              </p>
            </div>
          ) : (
            filteredItems.map(task => {
              const badge = getCategoryBadge(task.category);
              const Icon = badge.icon;
              return (
                <div
                  key={task.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    task.isCompleted
                      ? 'bg-slate-900/40 border-slate-800 opacity-60'
                      : task.urgency === 'URGENT'
                      ? 'bg-gradient-to-r from-rose-950/20 via-slate-900 to-slate-900 border-rose-500/40 shadow-sm'
                      : 'bg-slate-850/70 border-slate-750 hover:border-slate-650'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-2 rounded-xl border shrink-0 mt-0.5 ${badge.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-sm font-bold ${task.isCompleted ? 'line-through text-slate-400' : 'text-white'}`}>
                            {task.title}
                          </h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                            task.urgency === 'URGENT' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse' :
                            task.urgency === 'HIGH' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {task.urgency}
                          </span>
                          {task.dueTimeText && (
                            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" />
                              {task.dueTimeText}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-amber-400/90 font-medium mt-0.5">
                          {task.subtitle}
                        </p>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          {task.description}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {!task.isCompleted ? (
                        <>
                          <button
                            onClick={() => handleActionClick(task)}
                            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
                          >
                            <span>{task.actionLabel}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleResolveTask(task, e)}
                            title="Mark as completed"
                            className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-800 border border-slate-750 transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-mono text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>ServOS AI Task Orchestrator</span>
          <span>{completedItems.length} resolved this shift</span>
        </div>
      </div>
    </div>
  );
};
