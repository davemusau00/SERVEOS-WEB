import { ManualMpesaFields } from './ManualMpesaFields';
import type { ManualMpesaInput } from '../../types/runtime';
import { isNative, useRuntime } from '../../runtime/RuntimeProvider';
import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { ProductSellable, RestaurantTable, OrderItem, Order } from '../../types/servos';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { MixedTenderModal } from './MixedTenderModal';
import { RefundModal } from './RefundModal';
import { TableMergeModal } from './TableMergeModal';
import { FloorPlanDesignerView } from './FloorPlanDesignerView';
import { QROrderingGuestView } from './QROrderingGuestView';
import { 
  Wine, 
  Beer, 
  Flame, 
  Sparkles, 
  Send, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Smartphone, 
  Coins, 
  Bed, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Percent,
  Gift,
  X,
  QrCode,
  DollarSign,
  Printer,
  Search,
  ArrowRightLeft,
  Users,
  ChevronRight,
  Receipt,
  LayoutGrid,
  Utensils,
  GitMerge,
  RotateCcw,
  Split
} from 'lucide-react';

export const POSView: React.FC = () => {
  const runtime = useRuntime();
  const [pendingTable, setPendingTable] = useState<string | null>(null);
  const [tableError, setTableError] = useState('');
  const {
    products,
    tables,
    activeOrder,
    orders,
    createOrderForTable,
    createQuickBarTab,
    selectOrder,
    addItemToOrder,
    removeItemFromOrder,
    updateItemSeatAndCourse,
    fireHeldCourse,
    sendOrderToKitchenAndBar,
    applyCompToItem,
    applyOrderDiscount,
    voidOrder,
    transferOrderToTable,
    processPayment,
    guestStays,
    guestFolios,
    currentUser,
    currentOutlet,
    isOffline
  } = useServOS();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Mobile navigation view mode: CATALOG vs TICKET
  const [mobileViewMode, setMobileViewMode] = useState<'CATALOG' | 'TICKET'>('CATALOG');
  
  // Modals state
  const [activePortionProduct, setActivePortionProduct] = useState<ProductSellable | null>(null);
  const [activeModifierProduct, setActiveModifierProduct] = useState<ProductSellable | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [selectedMixers, setSelectedMixers] = useState<string[]>([]);

  // Advanced POS Modals
  const [isMixedTenderOpen, setIsMixedTenderOpen] = useState<boolean>(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState<boolean>(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false);

  // Payment checkout modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [tenderType, setTenderType] = useState<'CASH' | 'MPESA' | 'CARD' | 'ROOM_CHARGE'>('MPESA');
  const [mpesaPhone, setMpesaPhone] = useState<string>('');
  const [mpesaReceipt, setMpesaReceipt] = useState<ManualMpesaInput>({ code: '', account: '', receivedAmount: 0, receivedAt: new Date().toISOString(), confirmed: false });
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [selectedGuestStayId, setSelectedGuestStayId] = useState<string>('');
  const [cardAuthCode, setCardAuthCode] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [paymentStep, setPaymentStep] = useState<string>('');
  const [paymentResult, setPaymentResult] = useState<{ success: boolean; message: string; receipt?: string } | null>(null);

  // Discount / Comp modal
  const [isCompModalOpen, setIsCompModalOpen] = useState<boolean>(false);
  const [compTargetItemId, setCompTargetItemId] = useState<string>('');
  const [compReason, setCompReason] = useState<string>('VIP House Hospitality');

  // Floorplan Designer Studio Modal
  const [isFloorDesignerOpen, setIsFloorDesignerOpen] = useState<boolean>(false);
  const [isQrOrderingOpen, setIsQrOrderingOpen] = useState<boolean>(false);

  // Table Transfer Modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [transferTargetTableId, setTransferTargetTableId] = useState<string>('');

  // Bill Split Calculator Modal
  const [isSplitModalOpen, setIsSplitModalOpen] = useState<boolean>(false);
  const [splitCount, setSplitCount] = useState<number>(2);

  // Void Order Modal state
  const [isVoidModalOpen, setIsVoidModalOpen] = useState<boolean>(false);
  const [voidReason, setVoidReason] = useState<string>('Guest request / cancelled before service');

  // Order Discount Modal state
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState<boolean>(false);
  const [discountPercent, setDiscountPercent] = useState<number>(10);
  const [discountReason, setDiscountReason] = useState<string>('Manager Courtesy Discount');

  // Thermal Receipt Modal state
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [receiptModalOrder, setReceiptModalOrder] = useState<Order | null>(null);
  const [receiptIsProForma, setReceiptIsProForma] = useState<boolean>(false);
  const [receiptPaymentDetails, setReceiptPaymentDetails] = useState<any>(undefined);

  // Filter products by current category, outlet & search term
  const filteredProducts = products.filter(p => {
    const outletMatch = p.outletIds.includes(currentOutlet.id);
    if (!outletMatch) return false;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchCode = p.code.toLowerCase().includes(q);
      const matchCategory = p.category.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchCategory) return false;
    }

    if (selectedCategory === 'ALL') return true;
    return p.category === selectedCategory;
  });

  const categories = [
    { id: 'ALL', label: 'All Items' },
    { id: 'SPIRITS', label: 'Spirits & Shots' },
    { id: 'COCKTAIL', label: 'Cocktails' },
    { id: 'BEER', label: 'Beer & Cider' },
    { id: 'PACKAGE', label: 'VIP Packages' },
    { id: 'FOOD', label: 'Grill & Kitchen' }
  ];

  // Helper when clicking product
  const handleProductClick = (prod: ProductSellable) => {
    if (prod.category === 'SPIRITS' && prod.code.startsWith('JAM-')) {
      setActivePortionProduct(prod);
      return;
    }

    if (prod.modifiers && prod.modifiers.length > 0) {
      setActiveModifierProduct(prod);
      setSelectedModifiers([]);
      return;
    }

    if (prod.productType === 'PACKAGE' && prod.packageMixersCount) {
      setActiveModifierProduct(prod);
      setSelectedMixers(['Schweppes Tonic Can (2x)', 'Ginger Ale Can (2x)']);
      return;
    }

    addItemToOrder(prod.id);
  };

  const handleConfirmModifiers = () => {
    if (!activeModifierProduct) return;
    const mods = (activeModifierProduct.modifiers || [])
      .filter(m => selectedModifiers.includes(m.id))
      .map(m => ({ modifierId: m.id, name: m.name, priceDelta: m.priceDelta }));

    addItemToOrder(activeModifierProduct.id, undefined, mods, selectedMixers);
    setActiveModifierProduct(null);
    setSelectedModifiers([]);
    setSelectedMixers([]);
  };

  const handleExecutePayment = async () => {
    if (!activeOrder) return;
    setIsProcessing(true);
    setPaymentResult(null);

    const currentOrderSnapshot = { ...activeOrder };

    const res = await processPayment(activeOrder.id, tenderType, activeOrder.grandTotal - activeOrder.amountPaid, {
      phoneNumber: mpesaPhone,
      mpesa: mpesaReceipt,
      cashTendered,
      guestStayId: selectedGuestStayId,
      cardAuthCode
    });

    setIsProcessing(false);
    setPaymentStep('');
    setPaymentResult(res);

    if (res.success) {
      // Configure receipt modal state ready for thermal printing
      const stay = guestStays.find(s => s.id === selectedGuestStayId);
      setReceiptPaymentDetails({
        tenderType,
        receiptRef: res.receipt,
        cashTendered: tenderType === 'CASH' ? cashTendered : undefined,
        changeDue: tenderType === 'CASH' ? Math.max(0, cashTendered - currentOrderSnapshot.grandTotal) : undefined,
        guestName: stay?.guestName,
        roomNumber: stay?.roomNumber
      });
      setReceiptModalOrder(currentOrderSnapshot);
    }
  };

  const handleOpenProFormaPrint = () => {
    if (!activeOrder) return;
    setReceiptModalOrder(activeOrder);
    setReceiptIsProForma(true);
    setReceiptPaymentDetails(undefined);
    setIsReceiptModalOpen(true);
  };

  const handleOpenSettledReceiptPrint = () => {
    if (!receiptModalOrder) return;
    setReceiptIsProForma(false);
    setIsReceiptModalOpen(true);
  };

  const handleTransferTableConfirm = () => {
    if (!activeOrder || !transferTargetTableId) return;
    transferOrderToTable(activeOrder.id, transferTargetTableId);
    setIsTransferModalOpen(false);
    setTransferTargetTableId('');
  };

  const activeTable = activeOrder?.tableId
    ? tables.find(t => t.id === activeOrder.tableId)
    : null;

  const totalItemsCount = activeOrder?.items.reduce((s, it) => s + it.quantity, 0) || 0;

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-slate-950">
      {/* MOBILE SEGMENT SELECTOR (< md) */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 p-2 flex items-center justify-between gap-2 shrink-0">
        <div className="grid grid-cols-2 w-full gap-1 p-1 bg-slate-950 rounded-lg">
          <button
            onClick={() => setMobileViewMode('CATALOG')}
            className={`py-2 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${
              mobileViewMode === 'CATALOG'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Menu & Tables</span>
          </button>

          <button
            onClick={() => setMobileViewMode('TICKET')}
            className={`py-2 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all relative ${
              mobileViewMode === 'TICKET'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Order Ticket</span>
            {activeOrder && activeOrder.items.length > 0 && (
              <span className={`px-1.5 py-0.2 text-[10px] font-mono rounded-full ${
                mobileViewMode === 'TICKET' ? 'bg-slate-950 text-amber-300' : 'bg-amber-500 text-slate-950'
              }`}>
                {totalItemsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* LEFT: Floorplan / Tables Bar + Search + Catalog Grid */}
      <div className={`flex-1 flex flex-col overflow-hidden border-r border-slate-800 ${
        mobileViewMode === 'TICKET' ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Table & Tab Strip */}
        <div className="bg-slate-900/60 p-2.5 border-b border-slate-800 flex items-center justify-between gap-3 overflow-x-auto scrollbar-none shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mr-1">
              Tables:
            </span>
            {tables.filter(tbl => tbl.outletId === currentOutlet.id).map(tbl => {
              const isCurrent = activeOrder?.tableId === tbl.id;
              const hasOrder = !!tbl.currentOrderId;
              return (
                <button
                  key={tbl.id}
                  disabled={pendingTable !== null}
                  onClick={async () => {
                    setTableError('');
                    if (tbl.currentOrderId) {
                      selectOrder(tbl.currentOrderId);
                    } else if (tbl.state === 'CLEANING') {
                      if (!isNative) { setTableError('Marking a table clean requires the installed application.'); return; }
                      const record = runtime.snapshot?.records.find(r => r.collection === 'tables' && r.id === tbl.id);
                      setPendingTable(tbl.id);
                      try { await runtime.command('table.ready', { tableId: tbl.id }, record?.version); }
                      catch (error) { setTableError(String(error)); }
                      finally { setPendingTable(null); }
                    } else {
                      setPendingTable(tbl.id);
                      try { await createOrderForTable(tbl.id); }
                      catch (error) { setTableError(String(error)); }
                      finally { setPendingTable(null); }
                    }
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-all border ${
                    isCurrent
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                      : hasOrder
                      ? 'bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-500'
                      : 'bg-slate-900 text-slate-400 border-slate-800/80 hover:text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{tbl.label}</span>
                    {!hasOrder && <span className="text-[10px]">{tbl.state === 'CLEANING' ? 'Mark clean' : tbl.state}</span>}
                    {tbl.minimumSpend && (
                      <span className="text-[9px] font-mono font-normal text-amber-400/80">
                        (Min KES {tbl.minimumSpend.toLocaleString()})
                      </span>
                    )}
                    {hasOrder && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsQrOrderingOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded border border-slate-700 transition-colors whitespace-nowrap shadow-xs flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span>Guest QR</span>
            </button>

            <button
              onClick={() => setIsFloorDesignerOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded border border-slate-700 transition-colors whitespace-nowrap shadow-xs flex items-center gap-1.5"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
              <span>Floor Studio</span>
            </button>

            <button
              onClick={() => createQuickBarTab(`Walk-in Tab #${Math.floor(100 + Math.random() * 900)}`)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold rounded border border-slate-700 transition-colors whitespace-nowrap shadow-xs"
            >
              + Quick Bar Tab
            </button>
          </div>
        </div>

        {tableError && <p role="alert" className="px-3 py-2 text-sm text-red-300">{tableError}</p>}
        {/* Search & Category Filter Header */}
        <div className="p-3 bg-slate-900/40 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          {/* Quick Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search drinks, steaks, cocktails, packages..."
              className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? 'bg-slate-200 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Items Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 content-start">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No menu items match your filter</p>
              <p className="text-xs text-slate-600 mt-1">Try searching another keyword or select "All Items".</p>
            </div>
          ) : (
            filteredProducts.map(prod => {
              const isPackage = prod.productType === 'PACKAGE';
              const isRecipe = prod.productType === 'RECIPE';
              return (
                <button
                  key={prod.id}
                  onClick={() => handleProductClick(prod)}
                  className={`p-3 sm:p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all hover:scale-[1.01] active:scale-[0.99] group ${
                    isPackage
                      ? 'bg-gradient-to-b from-amber-950/30 to-slate-900 border-amber-600/40 hover:border-amber-400'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-600 hover:bg-slate-850'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[9.5px] font-mono tracking-wider text-slate-400 uppercase">
                        {prod.category}
                      </span>
                      {prod.portionUnitSymbol && (
                        <span className="text-[9.5px] font-mono text-amber-400 font-semibold">
                          {prod.portionVolume} {prod.portionUnitSymbol}
                        </span>
                      )}
                      {isPackage && (
                        <span className="text-[9px] font-mono text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded font-bold">
                          VIP PACKAGE
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-100 group-hover:text-white line-clamp-2">
                      {prod.name}
                    </h4>
                    {isRecipe && (
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                        Recipe with custom ingredients
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-400">KES</span>
                    <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-amber-300">
                      {prod.price.toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* MOBILE STICKY FLOATING CART BAR (shows on Catalog tab when ticket has items) */}
        {activeOrder && activeOrder.items.length > 0 && (
          <div className="md:hidden p-3 pb-18 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md flex items-center justify-between gap-3 shadow-xl shrink-0">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white font-mono">{activeOrder.orderNumber}</span>
                <span className="text-[10px] text-slate-400">({totalItemsCount} items)</span>
              </div>
              <div className="text-sm font-mono font-bold text-amber-400">
                KES {activeOrder.grandTotal.toLocaleString()}
              </div>
            </div>

            <button
              onClick={() => setMobileViewMode('TICKET')}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-md"
            >
              <span>View Ticket / Pay</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Active Tab / Order Ledger Sidebar */}
      <div className={`w-full md:w-[350px] lg:w-[430px] bg-slate-900 flex flex-col h-full shrink-0 border-l border-slate-800 ${
        mobileViewMode === 'CATALOG' ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Order Header */}
        <div className="p-3 sm:p-3.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white font-mono">
                {activeOrder ? activeOrder.orderNumber : 'No Active Order'}
              </span>
              {activeOrder && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                  activeOrder.state === 'SENT' ? 'bg-amber-500/20 text-amber-300' :
                  activeOrder.state === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' :
                  'bg-slate-700 text-slate-300'
                }`}>
                  {activeOrder.state}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {activeOrder?.tableName || activeOrder?.tabName || 'Select table to start'} · Waiter: {activeOrder?.serverName || currentUser.name}
            </p>
          </div>

          {activeOrder && (
            <div className="flex items-center gap-1">
              {/* Transfer Table Button */}
              <button
                onClick={() => {
                  setTransferTargetTableId(activeOrder.tableId || '');
                  setIsTransferModalOpen(true);
                }}
                title="Transfer order to another table"
                className="p-1.5 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>

              {/* Split Bill Calculator */}
              <button
                onClick={() => setIsSplitModalOpen(true)}
                title="Split Bill Calculator"
                className="p-1.5 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
              >
                <Users className="w-4 h-4" />
              </button>

              {/* Table / Check Merge */}
              <button
                onClick={() => setIsMergeModalOpen(true)}
                title="Merge with another table / tab check"
                className="p-1.5 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
              >
                <GitMerge className="w-4 h-4" />
              </button>

              {/* Refund / Item Return */}
              <button
                onClick={() => setIsRefundModalOpen(true)}
                title="Issue Itemized Refund / Credit Note"
                className="p-1.5 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Print Pro-Forma Bill Check */}
              <button
                onClick={handleOpenProFormaPrint}
                title="Print Pro-Forma / Table Bill Check"
                className="p-1.5 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
              >
                <Printer className="w-4 h-4" />
              </button>

              {/* Void Order */}
              <button
                onClick={() => {
                  setVoidReason('Guest request / cancelled before service');
                  setIsVoidModalOpen(true);
                }}
                title="Void Order"
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Course Firing Control Bar */}
        {activeOrder && activeOrder.items.length > 0 && (
          <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[11px] gap-1 shrink-0 overflow-x-auto">
            <span className="text-slate-400 font-mono text-[10px] shrink-0">Fire Course:</span>
            <div className="flex items-center gap-1.5">
              {(['Drinks', 'Starters', 'Mains', 'Dessert'] as const).map(c => {
                const hasHeld = activeOrder.items.some(i => i.courseName === c && i.courseStatus === 'HELD');
                return (
                  <button
                    key={c}
                    onClick={() => fireHeldCourse(c)}
                    disabled={!hasHeld}
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold transition-colors ${
                      hasHeld
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-xs animate-pulse'
                        : 'bg-slate-800/60 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    Fire {c}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Order Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!activeOrder || activeOrder.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Sparkles className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-xs font-medium">Order ticket is empty</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                Click drinks, shots, or food items on the left to add them to the bill.
              </p>
            </div>
          ) : (
            activeOrder.items.map(item => (
              <div
                key={item.id}
                className={`p-2.5 rounded-lg border ${
                  item.isComp
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                    : 'bg-slate-850/80 border-slate-750'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-xs text-slate-100 truncate">
                        {item.productName}
                      </span>
                      {item.portionName && (
                        <span className="text-[10px] font-mono text-amber-400/90 font-medium">
                          ({item.portionName})
                        </span>
                      )}
                      {item.isComp && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 py-0.5 rounded font-mono font-bold">
                          COMP
                        </span>
                      )}
                    </div>

                    {/* Seat & Course badges / controls */}
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <select
                        value={item.seatLabel || 'Seat 1'}
                        onChange={(e) => updateItemSeatAndCourse(item.id, e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-300 text-[10px] rounded px-1.5 py-0.5 font-mono focus:outline-none focus:border-amber-500"
                      >
                        <option value="Seat 1">Seat 1</option>
                        <option value="Seat 2">Seat 2</option>
                        <option value="Seat 3">Seat 3</option>
                        <option value="Seat 4">Seat 4</option>
                        <option value="Shared">Shared</option>
                      </select>

                      <select
                        value={item.courseName || 'Drinks'}
                        onChange={(e) => updateItemSeatAndCourse(item.id, undefined, e.target.value as any)}
                        className="bg-slate-900 border border-slate-700 text-slate-300 text-[10px] rounded px-1.5 py-0.5 font-mono focus:outline-none focus:border-amber-500"
                      >
                        <option value="Drinks">Drinks</option>
                        <option value="Starters">Starters</option>
                        <option value="Mains">Mains</option>
                        <option value="Dessert">Dessert</option>
                      </select>

                      <button
                        onClick={() => updateItemSeatAndCourse(item.id, undefined, undefined, item.courseStatus === 'HELD' ? 'FIRED' : 'HELD')}
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold transition-colors ${
                          item.courseStatus === 'HELD'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {item.courseStatus === 'HELD' ? '⏸ HELD' : '🔥 FIRED'}
                      </button>
                    </div>

                    {/* Modifiers / Mixers */}
                    {item.modifiers.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.modifiers.map(m => (
                          <div key={m.modifierId} className="text-[11px] text-amber-300/80 flex items-center justify-between">
                            <span>+ {m.name}</span>
                            <span className="font-mono">KES {m.priceDelta}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {item.selectedMixers && item.selectedMixers.length > 0 && (
                      <div className="mt-1 text-[11px] text-slate-400">
                        Mixers: {item.selectedMixers.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold tabular-nums text-slate-200">
                      {item.isComp ? (
                        <span className="line-through text-slate-400 mr-1.5 font-normal">
                          KES {item.totalPrice.toLocaleString()}
                        </span>
                      ) : null}
                      KES {item.isComp ? '0' : item.totalPrice.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Actions row: Comp button & delete */}
                <div className="mt-2 pt-1.5 border-t border-slate-750 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono text-[10px] text-slate-400">
                    Qty: {item.quantity} · Tax: KES {item.taxAmount}
                  </span>

                  <div className="flex items-center gap-2">
                    {!item.isComp && (
                      <button
                        onClick={() => {
                          setCompTargetItemId(item.id);
                          setIsCompModalOpen(true);
                        }}
                        className="hover:text-amber-400 font-medium text-[10px]"
                      >
                        Comp Item
                      </button>
                    )}
                    <button
                      onClick={() => removeItemFromOrder(item.id)}
                      className="text-slate-400 hover:text-rose-400 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Order Financial Calculations (Kenya 16% VAT + 2% Catering Levy + Min Spend) */}
        {activeOrder && (
          <div className="p-3.5 pb-20 md:pb-3.5 bg-slate-950 border-t border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400 font-mono">
              <span>Subtotal (Ex-Tax)</span>
              <span className="tabular-nums">KES {activeOrder.subtotal.toLocaleString()}</span>
            </div>

            <div className="flex justify-between text-slate-400 font-mono text-[11px]">
              <span>Output VAT (16%)</span>
              <span className="tabular-nums">KES {activeOrder.taxTotal.toLocaleString()}</span>
            </div>

            <div className="flex justify-between text-slate-400 font-mono text-[11px]">
              <span>Catering Levy (2%)</span>
              <span className="tabular-nums">KES {activeOrder.cateringLevyTotal.toLocaleString()}</span>
            </div>

            {activeOrder.shortfallAdjustment > 0 && (
              <div className="flex justify-between text-amber-400 font-mono bg-amber-950/20 px-2 py-1 rounded border border-amber-900/40">
                <span>VIP Table Shortfall (Min Spend)</span>
                <span className="tabular-nums">+KES {activeOrder.shortfallAdjustment.toLocaleString()}</span>
              </div>
            )}

            {activeOrder.discountTotal > 0 && (
              <div className="flex justify-between text-emerald-400 font-mono">
                <span>Discount Applied</span>
                <span className="tabular-nums">-KES {activeOrder.discountTotal.toLocaleString()}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
              <span className="text-sm font-bold text-white uppercase tracking-wide">
                Grand Total
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-amber-400">
                KES {activeOrder.grandTotal.toLocaleString()}
              </span>
            </div>

            {/* Quick action buttons: Send to KDS, Print Bill, Pay & Settle */}
            <div className="pt-2 grid grid-cols-4 gap-1.5">
              <button
                onClick={sendOrderToKitchenAndBar}
                disabled={activeOrder.items.length === 0}
                className="py-2 px-1 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded border border-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Send ticket to KDS bar & kitchen prep stations"
              >
                <Send className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px]">Send KDS</span>
              </button>

              <button
                onClick={handleOpenProFormaPrint}
                disabled={activeOrder.items.length === 0}
                className="py-2 px-1 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded border border-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Print thermal bill check for customer"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px]">Print Bill</span>
              </button>

              <button
                onClick={() => {
                  setDiscountPercent(10);
                  setDiscountReason('Manager Courtesy Discount');
                  setIsDiscountModalOpen(true);
                }}
                disabled={activeOrder.items.length === 0}
                className="py-2 px-1 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded border border-slate-700 flex flex-col items-center justify-center gap-0.5"
                title="Apply percentage manager discount"
              >
                <Percent className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px]">Discount</span>
              </button>

              <button
                onClick={() => {
                  setIsCheckoutOpen(true);
                  setPaymentResult(null);
                  setCashTendered(activeOrder.grandTotal - activeOrder.amountPaid);
                  setMpesaReceipt({ code: '', account: '', receivedAmount: activeOrder.grandTotal - activeOrder.amountPaid, receivedAt: new Date().toISOString(), confirmed: false });
                }}
                disabled={activeOrder.items.length === 0}
                className="py-2 px-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded flex flex-col items-center justify-center gap-0.5 shadow-sm"
              >
                <Coins className="w-3.5 h-3.5" />
                <span className="text-[10px]">Settle</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Portion Selector (Shot vs Double vs Bottle for Spirits) */}
      {activePortionProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Select Serving Measure</h3>
                <p className="text-xs text-slate-400">Jameson Irish Whiskey</p>
              </div>
              <button
                onClick={() => setActivePortionProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 py-4">
              <button
                onClick={() => {
                  addItemToOrder('prod-jam-shot', 30);
                  setActivePortionProduct(null);
                }}
                className="p-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-between text-left group"
              >
                <div>
                  <div className="font-semibold text-sm text-slate-100">30 ml Single Shot</div>
                  <div className="text-xs text-slate-400 font-mono">Consumes 30 ml stock base</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-amber-300">KES 450</div>
                </div>
              </button>

              <button
                onClick={() => {
                  addItemToOrder('prod-jam-double', 60);
                  setActivePortionProduct(null);
                }}
                className="p-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-between text-left group"
              >
                <div>
                  <div className="font-semibold text-sm text-slate-100">60 ml Double Measure</div>
                  <div className="text-xs text-slate-400 font-mono">Consumes 60 ml stock base</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-amber-300">KES 850</div>
                </div>
              </button>

              <button
                onClick={() => {
                  addItemToOrder('prod-jam-bottle', 750);
                  setActivePortionProduct(null);
                }}
                className="p-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center justify-between text-left group"
              >
                <div>
                  <div className="font-semibold text-sm text-slate-100">750 ml Full Sealed Bottle</div>
                  <div className="text-xs text-slate-400 font-mono">Consumes 1 bottle (750 ml)</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-amber-300">KES 9,500</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Recipe Modifiers & Package Mixers */}
      {activeModifierProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">{activeModifierProduct.name}</h3>
                <p className="text-xs text-slate-400">Configure Recipe Modifiers & Inventory Adjustments</p>
              </div>
              <button
                onClick={() => setActiveModifierProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modifiers List */}
            {activeModifierProduct.modifiers && (
              <div className="py-4 space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Modifiers / Adjustments:
                </span>
                {activeModifierProduct.modifiers.map(mod => {
                  const isChecked = selectedModifiers.includes(mod.id);
                  return (
                    <label
                      key={mod.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                          : 'bg-slate-850 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedModifiers(prev => [...prev, mod.id]);
                            } else {
                              setSelectedModifiers(prev => prev.filter(id => id !== mod.id));
                            }
                          }}
                          className="w-4 h-4 accent-amber-500 rounded"
                        />
                        <div>
                          <div className="text-xs font-semibold">{mod.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {mod.ingredientAdjustments.map(a => `${a.quantityDelta > 0 ? '+' : ''}${a.quantityDelta} base stock`).join(', ')}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold">
                        {mod.priceDelta > 0 ? `+KES ${mod.priceDelta}` : 'KES 0'}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Package Mixers Selection */}
            {activeModifierProduct.productType === 'PACKAGE' && (
              <div className="py-2 space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Selected Mixers (Included in Package):
                </span>
                <div className="text-xs text-amber-300 font-mono bg-slate-850 p-2.5 rounded border border-slate-800">
                  4x Schweppes Tonic Water / Soda Cans (Allocated from Bar Store)
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setActiveModifierProduct(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmModifiers}
                className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded shadow-xs"
              >
                Add to Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Table Transfer */}
      {isTransferModalOpen && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                  <span>Transfer Table</span>
                </h3>
                <p className="text-xs text-slate-400">Order #{activeOrder.orderNumber} ({activeOrder.tableName || 'Tab'})</p>
              </div>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Select Destination Table</label>
                <select
                  value={transferTargetTableId}
                  onChange={e => setTransferTargetTableId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">-- Choose destination table --</option>
                  {tables
                    .filter(t => t.id !== activeOrder.tableId)
                    .map(tbl => (
                      <option key={tbl.id} value={tbl.id}>
                        {tbl.label} ({tbl.section}) {tbl.currentOrderId ? '⚠️ OCCUPIED' : '✅ AVAILABLE'} {tbl.minimumSpend ? `• Min KES ${tbl.minimumSpend.toLocaleString()}` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <p className="text-[11px] text-slate-400 bg-slate-850 p-2.5 rounded-lg border border-slate-800">
                Transferring this order reassigns items and updates minimum-spend calculations if the destination is a VIP table.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleTransferTableConfirm}
                disabled={!transferTargetTableId}
                className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Split Bill Calculator */}
      {isSplitModalOpen && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>Split Bill Calculator</span>
                </h3>
                <p className="text-xs text-slate-400">Order #{activeOrder.orderNumber} • KES {activeOrder.grandTotal.toLocaleString()}</p>
              </div>
              <button onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <label className="text-xs text-slate-300 block mb-2">Split Evenly Between Guests</label>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setSplitCount(n)}
                      className={`py-2 text-xs font-mono font-bold rounded-lg border transition-all ${
                        splitCount === n
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {n} Guests
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center space-y-1">
                <span className="text-[11px] font-mono text-slate-400 uppercase">Amount per guest:</span>
                <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
                  KES {(Math.round((activeOrder.grandTotal / splitCount) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[10px] text-slate-500">
                  {splitCount} payments of KES {(Math.round((activeOrder.grandTotal / splitCount) * 100) / 100).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsSplitModalOpen(false)}
                className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Comp Item */}
      {isCompModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-2">Mark Item as Complimentary</h3>
            <p className="text-xs text-slate-400 mb-3">
              Item will be charged at KES 0 to the guest, but stock depletion and promo expense will be posted.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Comp Reason</label>
                <input
                  type="text"
                  value={compReason}
                  onChange={e => setCompReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsCompModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    applyCompToItem(compTargetItemId, compReason);
                    setIsCompModalOpen(false);
                  }}
                  className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                >
                  Approve Comp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Apply Discount */}
      {isDiscountModalOpen && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-amber-400" />
                  <span>Apply Order Discount</span>
                </h3>
                <p className="text-xs text-slate-400">Order #{activeOrder.orderNumber}</p>
              </div>
              <button onClick={() => setIsDiscountModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Discount Percentage</label>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {[5, 10, 15, 20].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountPercent(pct)}
                      className={`py-1.5 text-xs font-mono font-bold rounded-lg border transition-all ${
                        discountPercent === pct
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={discountPercent || ''}
                    onChange={e => setDiscountPercent(Math.min(100, Math.max(1, parseFloat(e.target.value) || 0)))}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-xs text-slate-400 font-mono">%</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Discount Reason</label>
                <input
                  type="text"
                  value={discountReason}
                  onChange={e => setDiscountReason(e.target.value)}
                  placeholder="e.g. VIP Hospitality, Service Delay"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Current Subtotal:</span>
                  <span>KES {activeOrder.items.reduce((s, it) => s + (it.isComp ? 0 : it.totalPrice), 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Discount ({discountPercent}%):</span>
                  <span>-KES {Math.round(activeOrder.items.reduce((s, it) => s + (it.isComp ? 0 : it.totalPrice), 0) * (discountPercent / 100)).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsDiscountModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (discountPercent > 0) {
                    applyOrderDiscount(discountPercent, discountReason);
                    setIsDiscountModalOpen(false);
                  }
                }}
                className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-sm"
              >
                Apply Discount
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Void Order */}
      {isVoidModalOpen && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/60 rounded-xl p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Void Order #{activeOrder.orderNumber}</h3>
                  <p className="text-[11px] text-slate-400">{activeOrder.tableName || activeOrder.tabName}</p>
                </div>
              </div>
              <button onClick={() => setIsVoidModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50">
                Warning: Voiding this ticket cancels all items. Manager authorization and reason will be written to the audit log.
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Void Reason</label>
                <input
                  type="text"
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsVoidModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Keep Order
              </button>
              <button
                onClick={() => {
                  voidOrder(activeOrder.id, voidReason);
                  setIsVoidModalOpen(false);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow-sm"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Payment / Checkout with Manual payments & room charge */}
      {isCheckoutOpen && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Checkout & Settle</span>
                  <span className="font-mono text-amber-400 text-sm">
                    KES {activeOrder.grandTotal.toLocaleString()}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Order #{activeOrder.orderNumber} · {activeOrder.tableName || activeOrder.tabName}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsCheckoutOpen(false);
                  setPaymentResult(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {paymentResult ? (
              /* Success / Result Screen */
              <div className="py-6 text-center space-y-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                  paymentResult.success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                }`}>
                  {paymentResult.success ? <CheckCircle2 className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
                </div>

                <div>
                  <h4 className="text-base font-bold text-white">
                    {paymentResult.success ? 'Transaction Complete & Fiscalized' : 'Payment Failed'}
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto">
                    {paymentResult.message}
                  </p>
                </div>

                {paymentResult.success && (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-left font-mono text-xs space-y-1.5 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tender Reference:</span>
                      <span className="text-amber-300 font-bold">{paymentResult.receipt}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">eTIMS CU Serial:</span>
                      <span>KRA-OSCU-NBO-00914</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Double-Entry Status:</span>
                      <span className="text-emerald-400">BALANCED & POSTED</span>
                    </div>
                  </div>
                )}

                <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
                  {/* PRINT THERMAL RECEIPT ACTION BUTTON */}
                  {paymentResult.success && (
                    <button
                      onClick={handleOpenSettledReceiptPrint}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 transition-all"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print Thermal Receipt (80mm)</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setIsCheckoutOpen(false);
                      setPaymentResult(null);
                    }}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg"
                  >
                    Done / Next Order
                  </button>
                </div>
              </div>
            ) : (
              /* Payment Options */
              <div className="py-4 space-y-4">
                {/* Tender Tabs */}
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setTenderType('MPESA')}
                    className={`py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors ${
                      tenderType === 'MPESA'
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>M-PESA</span>
                  </button>

                  <button
                    onClick={() => setTenderType('CASH')}
                    className={`py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors ${
                      tenderType === 'CASH'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Coins className="w-4 h-4" />
                    <span>Cash</span>
                  </button>

                  <button
                    onClick={() => {
                      setTenderType('ROOM_CHARGE');
                      if (!selectedGuestStayId) {
                        const activeStay = guestStays.find(s => s.status === 'CHECKED_IN');
                        if (activeStay) setSelectedGuestStayId(activeStay.id);
                      }
                    }}
                    className={`py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors ${
                      tenderType === 'ROOM_CHARGE'
                        ? 'bg-indigo-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Bed className="w-4 h-4" />
                    <span>Room Charge</span>
                  </button>

                  <button
                    onClick={() => setTenderType('CARD')}
                    className={`py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors ${
                      tenderType === 'CARD'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Card</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsCheckoutOpen(false);
                      setIsMixedTenderOpen(true);
                    }}
                    className="py-2 px-1 text-xs font-semibold rounded flex flex-col items-center gap-1 transition-colors text-purple-400 hover:bg-purple-950/40 border border-purple-500/30"
                  >
                    <Split className="w-4 h-4" />
                    <span>Mixed/Split</span>
                  </button>
                </div>

                {/* Tab Specific Content */}
                {tenderType === 'MPESA' && (
                  <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4" />
                        Manual M-Pesa receipt
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Confirm against the business receipt
                      </span>
                    </div>

                    <ManualMpesaFields value={mpesaReceipt} onChange={setMpesaReceipt} />
                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Customer Phone Number</label>
                      <input
                        type="text"
                        value={mpesaPhone}
                        onChange={e => setMpesaPhone(e.target.value)}
                        placeholder="07XX XXX XXX or 2547XXXXXXXX"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {paymentStep && (
                      <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-800/40 text-xs font-mono text-emerald-300 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>{paymentStep}</span>
                      </div>
                    )}
                  </div>
                )}

                {tenderType === 'CASH' && (
                  <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-300">Amount Due:</span>
                      <span className="font-mono font-bold text-amber-300">
                        KES {activeOrder.grandTotal.toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Cash Tendered</label>
                      <input
                        type="number"
                        value={cashTendered || ''}
                        onChange={e => setCashTendered(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="flex gap-2">
                      {[1000, 2000, 5000, 10000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCashTendered(amt)}
                          className="flex-1 py-1 text-xs bg-slate-800 hover:bg-slate-750 rounded border border-slate-700 font-mono"
                        >
                          KES {amt}
                        </button>
                      ))}
                    </div>

                    <div className="p-2.5 bg-slate-900 rounded border border-slate-800 flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-400">Change Due to Customer:</span>
                      <span className="text-base font-bold text-emerald-400">
                        KES {Math.max(0, (cashTendered || 0) - activeOrder.grandTotal).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {tenderType === 'ROOM_CHARGE' && (
                  <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-indigo-400 font-bold font-mono">Hotel PMS Guest Folio Lookup</span>
                      <span className="text-[10px] text-slate-400 font-mono">Subledger Transfer</span>
                    </div>

                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Select Checked-in Guest Room</label>
                      <select
                        value={selectedGuestStayId}
                        onChange={e => setSelectedGuestStayId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Choose Guest Room --</option>
                        {guestStays
                          .filter(s => s.status === 'CHECKED_IN')
                          .map(stay => {
                            const fol = guestFolios.find(f => f.stayId === stay.id);
                            return (
                              <option key={stay.id} value={stay.id}>
                                Room {stay.roomNumber} - {stay.guestName} (Limit: KES {stay.creditLimit.toLocaleString()} | Bal: KES {fol?.balanceDue.toLocaleString()})
                              </option>
                            );
                          })}
                      </select>
                    </div>

                    <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800">
                      Charge will be posted to the guest's folio subledger with POS order reference #{activeOrder.orderNumber} for night audit reconciliation.
                    </div>
                  </div>
                )}

                {tenderType === 'CARD' && (
                  <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-blue-400 font-bold font-mono">Bank Terminal Clearing</span>
                      <span className="text-[10px] text-slate-400 font-mono">Visa / Mastercard / Amex</span>
                    </div>

                    <div>
                      <label className="text-xs text-slate-300 block mb-1">Terminal Auth Approval Code</label>
                      <input
                        type="text"
                        value={cardAuthCode}
                        onChange={e => setCardAuthCode(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-blue-300 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Execute Button */}
                <div className="pt-2">
                  <button
                    onClick={handleExecutePayment}
                    disabled={isProcessing || (tenderType === 'ROOM_CHARGE' && !selectedGuestStayId)}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Saving payment locally…</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm Payment (KES {activeOrder.grandTotal.toLocaleString()})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT MODAL */}
      <ThermalReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        order={receiptModalOrder}
        isProForma={receiptIsProForma}
        paymentDetails={receiptPaymentDetails}
      />

      {/* MIXED / SPLIT TENDER MODAL */}
      <MixedTenderModal
        isOpen={isMixedTenderOpen}
        onClose={() => setIsMixedTenderOpen(false)}
        order={activeOrder}
      />

      {/* REFUND / ITEM RETURN MODAL */}
      <RefundModal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        order={activeOrder}
      />

      {/* FLOORPLAN DESIGNER STUDIO MODAL */}
      {isFloorDesignerOpen && (
        <FloorPlanDesignerView onClose={() => setIsFloorDesignerOpen(false)} />
      )}

      {/* GUEST QR SELF ORDERING MODAL */}
      {isQrOrderingOpen && (
        <QROrderingGuestView onClose={() => setIsQrOrderingOpen(false)} />
      )}

      {/* TABLE / CHECK MERGE MODAL */}
      <TableMergeModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        currentTableId={activeTable?.id}
      />
    </div>
  );
};
