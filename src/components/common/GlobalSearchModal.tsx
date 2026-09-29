import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { calculatePredictiveInventory, PredictiveStockAnalysis } from '../../utils/predictiveStock';
import { 
  Search, 
  X, 
  Utensils, 
  Bed, 
  Receipt, 
  Boxes, 
  Users, 
  FileSpreadsheet, 
  ArrowRight, 
  ExternalLink,
  DollarSign,
  Tag,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Building2,
  Clock,
  ChevronRight,
  Sparkles,
  TrendingDown,
  Flame
} from 'lucide-react';

export type SearchCategory = 'ALL' | 'PRODUCTS' | 'GUESTS' | 'FINANCE' | 'STAFF' | 'INVENTORY';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tabId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab
}) => {
  const {
    products,
    stockItems,
    stockLocations,
    stockMovements,
    hotelRooms,
    guestStays,
    guestFolios,
    journalEntries,
    etimsInvoices,
    purchaseOrders,
    employees,
    activeOrder,
    addItemToOrder
  } = useServOS();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory>('ALL');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Compute Predictive Stock Analytics across inventory
  const predictiveList = useMemo(() => {
    return calculatePredictiveInventory(stockItems, stockMovements);
  }, [stockItems, stockMovements]);

  const urgentPredictiveAlerts = useMemo(() => {
    return predictiveList.filter(p => p.urgencyLevel === 'CRITICAL' || p.urgencyLevel === 'WARNING');
  }, [predictiveList]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setSelectedIndex(0);
    } else {
      setSearchQuery('');
      setSelectedCategory('ALL');
    }
  }, [isOpen]);

  // Aggregate results across modules
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const results: Array<{
      id: string;
      category: 'PRODUCTS' | 'GUESTS' | 'FINANCE' | 'STAFF' | 'INVENTORY';
      title: string;
      subtitle: string;
      badge: string;
      badgeColor: string;
      extraInfo?: string;
      targetTab: string;
      icon: React.ElementType;
      onSelect?: () => void;
    }> = [];

    // 1. Products & Menu Items
    if (selectedCategory === 'ALL' || selectedCategory === 'PRODUCTS') {
      products.forEach(prod => {
        const matches = !q || 
          prod.name.toLowerCase().includes(q) || 
          prod.category.toLowerCase().includes(q) || 
          prod.code?.toLowerCase().includes(q);

        if (matches) {
          results.push({
            id: `prod-${prod.id}`,
            category: 'PRODUCTS',
            title: prod.name,
            subtitle: `${prod.category} • SKU: ${prod.code}${prod.portionVolume ? ` (${prod.portionVolume}${prod.portionUnitSymbol || 'ml'})` : ''}`,
            badge: prod.category,
            badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
            extraInfo: `KES ${prod.price.toLocaleString()}`,
            targetTab: 'pos',
            icon: Utensils,
            onSelect: () => {
              if (activeOrder) {
                addItemToOrder(prod.id, prod.portionVolume);
              }
            }
          });
        }
      });
    }

    // 2. Hotel Guests, Rooms & Folios
    if (selectedCategory === 'ALL' || selectedCategory === 'GUESTS') {
      // Search guest stays
      guestStays.forEach(stay => {
        const matches = !q ||
          stay.guestName.toLowerCase().includes(q) ||
          stay.roomNumber.toLowerCase().includes(q) ||
          stay.guestPhone.toLowerCase().includes(q) ||
          stay.guestEmail.toLowerCase().includes(q) ||
          stay.id.toLowerCase().includes(q);

        if (matches) {
          const folio = guestFolios.find(f => f.stayId === stay.id || f.id === stay.folioId);
          const balance = folio ? folio.balanceDue : 0;
          results.push({
            id: `stay-${stay.id}`,
            category: 'GUESTS',
            title: stay.guestName,
            subtitle: `Room ${stay.roomNumber} • ${stay.status === 'CHECKED_IN' ? 'Checked In' : 'Reserved'} • Tel: ${stay.guestPhone}`,
            badge: `Room ${stay.roomNumber}`,
            badgeColor: stay.status === 'CHECKED_IN' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30',
            extraInfo: `Folio: KES ${balance.toLocaleString()}`,
            targetTab: 'hotel',
            icon: Bed
          });
        }
      });

      // Search Hotel Rooms directly
      hotelRooms.forEach(room => {
        const matches = !q ||
          room.roomNumber.toLowerCase().includes(q) ||
          room.roomTypeName.toLowerCase().includes(q) ||
          (room.currentGuestName && room.currentGuestName.toLowerCase().includes(q));

        if (matches && !guestStays.some(s => s.roomNumber === room.roomNumber && s.guestName.toLowerCase().includes(q))) {
          results.push({
            id: `room-${room.id}`,
            category: 'GUESTS',
            title: `Room ${room.roomNumber} (${room.roomTypeName})`,
            subtitle: `Status: ${room.status} • Floor ${room.floor}${room.currentGuestName ? ` • Guest: ${room.currentGuestName}` : ''}`,
            badge: room.status,
            badgeColor: room.status === 'OCCUPIED' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            targetTab: 'hotel',
            icon: Bed
          });
        }
      });
    }

    // 3. Financial Records & Accounting (Journals, eTIMS, Purchase Orders)
    if (selectedCategory === 'ALL' || selectedCategory === 'FINANCE') {
      // eTIMS Invoices
      etimsInvoices.forEach(inv => {
        const matches = !q ||
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.cuSerialNumber.toLowerCase().includes(q) ||
          (inv.customerName && inv.customerName.toLowerCase().includes(q)) ||
          (inv.customerPin && inv.customerPin.toLowerCase().includes(q));

        if (matches) {
          results.push({
            id: `etims-${inv.id}`,
            category: 'FINANCE',
            title: `eTIMS Fiscal #${inv.invoiceNumber}`,
            subtitle: `CU: ${inv.cuSerialNumber} • Date: ${new Date(inv.fiscalDate).toLocaleTimeString()}${inv.customerName ? ` • ${inv.customerName}` : ''}`,
            badge: inv.status,
            badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            extraInfo: `KES ${inv.totalAmount.toLocaleString()}`,
            targetTab: 'accounting',
            icon: Receipt
          });
        }
      });

      // Journal Entries
      journalEntries.forEach(je => {
        const matches = !q ||
          je.entryNumber.toLowerCase().includes(q) ||
          je.memo.toLowerCase().includes(q) ||
          je.sourceType.toLowerCase().includes(q) ||
          je.lines.some(l => l.accountName.toLowerCase().includes(q) || l.accountCode.includes(q));

        if (matches) {
          results.push({
            id: `je-${je.id}`,
            category: 'FINANCE',
            title: `Journal Entry #${je.entryNumber}`,
            subtitle: `${je.memo} (${je.sourceType})`,
            badge: je.sourceType,
            badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
            extraInfo: `KES ${je.totalDebit.toLocaleString()}`,
            targetTab: 'accounting',
            icon: Receipt
          });
        }
      });

      // Purchase Orders
      purchaseOrders.forEach(po => {
        const matches = !q ||
          po.poNumber.toLowerCase().includes(q) ||
          po.supplierName.toLowerCase().includes(q) ||
          (po.grnNumber && po.grnNumber.toLowerCase().includes(q)) ||
          (po.supplierInvoiceNumber && po.supplierInvoiceNumber.toLowerCase().includes(q));

        if (matches) {
          results.push({
            id: `po-${po.id}`,
            category: 'FINANCE',
            title: `Purchase Order #${po.poNumber}`,
            subtitle: `Supplier: ${po.supplierName}${po.grnNumber ? ` • ${po.grnNumber}` : ''}`,
            badge: po.status,
            badgeColor: po.status === 'RECEIVED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30',
            extraInfo: `KES ${po.grandTotal.toLocaleString()}`,
            targetTab: 'procurement',
            icon: FileSpreadsheet
          });
        }
      });
    }

    // 4. Staff & HR Hub
    if (selectedCategory === 'ALL' || selectedCategory === 'STAFF') {
      employees.forEach(emp => {
        const matches = !q ||
          emp.name.toLowerCase().includes(q) ||
          emp.role.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.code.toLowerCase().includes(q) ||
          emp.phone.toLowerCase().includes(q);

        if (matches) {
          results.push({
            id: `emp-${emp.id}`,
            category: 'STAFF',
            title: `${emp.name} (${emp.code})`,
            subtitle: `${emp.role} • ${emp.department} • Tel: ${emp.phone}`,
            badge: emp.role,
            badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
            extraInfo: emp.attendanceStatus || 'Active',
            targetTab: 'staff',
            icon: Users
          });
        }
      });
    }

    // 5. Inventory & Stock Items (Enriched with Predictive AI Analytics)
    if (selectedCategory === 'ALL' || selectedCategory === 'INVENTORY') {
      stockItems.forEach(stk => {
        const totalUnits = Object.values(stk.currentStock).reduce((a, b) => a + b, 0);
        const pred = predictiveList.find(p => p.stockItemId === stk.id);
        const matches = !q ||
          stk.name.toLowerCase().includes(q) ||
          stk.code.toLowerCase().includes(q) ||
          stk.category.toLowerCase().includes(q);

        if (matches) {
          const isCritical = pred?.urgencyLevel === 'CRITICAL';
          const isWarning = pred?.urgencyLevel === 'WARNING';

          results.push({
            id: `stk-${stk.id}`,
            category: 'INVENTORY',
            title: stk.name,
            subtitle: pred 
              ? `Dynamic ROP: ${pred.dynamicReorderPoint} ${stk.baseUnit} • Run Rate: ${pred.averageDailyConsumption} ${stk.baseUnit}/day • ${pred.daysOfInventoryRemaining.toFixed(1)} days left`
              : `SKU: ${stk.code} • ${stk.category} • Cost: KES ${stk.averageUnitCost.toFixed(2)}/${stk.baseUnit}`,
            badge: isCritical 
              ? `⚠️ ${pred?.daysOfInventoryRemaining.toFixed(1)}d LEFT (CRITICAL)` 
              : isWarning 
              ? `REORDER (${totalUnits} ${stk.baseUnit})` 
              : `${totalUnits} ${stk.baseUnit}`,
            badgeColor: isCritical 
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse' 
              : isWarning 
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            extraInfo: pred ? `Lead: ${pred.leadTimeDays}d · Par: ${stk.parLevel}` : `Par: ${stk.parLevel}`,
            targetTab: 'inventory',
            icon: Boxes
          });
        }
      });
    }

    return results;
  }, [
    searchQuery,
    selectedCategory,
    products,
    stockItems,
    hotelRooms,
    guestStays,
    guestFolios,
    journalEntries,
    etimsInvoices,
    purchaseOrders,
    employees,
    activeOrder,
    addItemToOrder
  ]);

  // Handle item activation
  const handleSelectItem = (item: typeof searchResults[0]) => {
    if (item.onSelect) {
      item.onSelect();
    }
    onNavigateTab(item.targetTab);
    onClose();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        handleSelectItem(searchResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 pt-12 sm:pt-20 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-750 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Input */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950/70 flex items-center gap-3">
          <Search className="w-5 h-5 text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search products, rooms, guests, eTIMS invoices, staff, stock..."
            className="w-full bg-transparent text-sm sm:text-base text-white placeholder-slate-400 focus:outline-none font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1 font-mono text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">
            <span>ESC to close</span>
          </div>
        </div>

        {/* Category Filters */}
        <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          {(
            [
              { id: 'ALL', label: 'All Results' },
              { id: 'PRODUCTS', label: 'Menu & POS' },
              { id: 'GUESTS', label: 'Guests & Rooms' },
              { id: 'FINANCE', label: 'eTIMS & Journals' },
              { id: 'INVENTORY', label: 'Stock Items' },
              { id: 'STAFF', label: 'Staff & Team' }
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedCategory(tab.id);
                setSelectedIndex(0);
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors shrink-0 ${
                selectedCategory === tab.id
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="text-[11px] text-slate-500 font-mono ml-auto pl-2 shrink-0">
            {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
          </span>
        </div>

        {/* URGENT PREDICTIVE LOW-STOCK ALERTS BANNER */}
        {urgentPredictiveAlerts.length > 0 && (selectedCategory === 'ALL' || selectedCategory === 'INVENTORY') && (
          <div className="mx-3 my-2 p-3 bg-gradient-to-r from-rose-950/60 via-amber-950/40 to-slate-900 border border-rose-500/40 rounded-xl shadow-lg shrink-0">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-rose-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 animate-bounce" />
                <span className="text-xs font-bold text-rose-200 uppercase tracking-wide">
                  Urgent Predictive Low-Stock Alerts ({urgentPredictiveAlerts.length} Items at Risk)
                </span>
              </div>
              <button
                onClick={() => {
                  onNavigateTab('inventory');
                  onClose();
                }}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono transition-colors"
              >
                <span>Open Inventory Forecasting</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {urgentPredictiveAlerts.slice(0, 2).map(item => (
                <div 
                  key={item.stockItemId}
                  onClick={() => {
                    onNavigateTab('inventory');
                    onClose();
                  }}
                  className="p-2 bg-slate-950/80 hover:bg-slate-900 border border-rose-500/30 rounded-lg flex items-center justify-between cursor-pointer transition-all group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-xs text-white truncate group-hover:text-amber-300">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Run Rate: {item.averageDailyConsumption} {item.baseUnit}/day • {item.daysOfInventoryRemaining.toFixed(1)} days supply
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      item.urgencyLevel === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {item.urgencyLevel === 'CRITICAL' ? 'CRITICAL' : 'REORDER'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results List */}
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1 divide-y divide-slate-800/40"
        >
          {searchResults.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Search className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-medium text-slate-300">No matching records found</p>
              <p className="text-xs text-slate-500 mt-1">
                Try searching for a product name ("Jameson", "Tusker"), guest ("Sarah"), room ("101"), invoice number, or staff member.
              </p>
            </div>
          ) : (
            searchResults.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`p-2.5 sm:p-3 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/40 text-white'
                      : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      isSelected ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                          {item.title}
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${item.badgeColor} shrink-0`}>
                          {item.badge}
                        </span>
                      </div>
                      <div className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {item.extraInfo && (
                      <span className="text-xs font-mono font-bold text-amber-300 hidden sm:inline">
                        {item.extraInfo}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-400 uppercase bg-slate-800 px-2 py-0.5 rounded hidden xs:inline">
                      Go to {item.targetTab}
                    </span>
                    <ArrowRight className={`w-4 h-4 ${isSelected ? 'text-amber-400 translate-x-0.5 transition-transform' : 'text-slate-600'}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Search Footer info */}
        <div className="p-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono px-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300 text-[10px]">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300 text-[10px]">↵</kbd> select
            </span>
          </div>
          <span className="text-amber-400/90 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> ServOS Fast-Index
          </span>
        </div>
      </div>
    </div>
  );
};
