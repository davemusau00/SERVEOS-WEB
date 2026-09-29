import React, { useState, useMemo } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { StockItem, StockMovement } from '../../types/servos';
import { calculatePredictiveInventory, PredictiveStockAnalysis } from '../../utils/predictiveStock';
import { StockRequisitionModal } from './StockRequisitionModal';
import { 
  Package, 
  ArrowRightLeft, 
  Trash2, 
  Edit3,
  Plus,
  Boxes,
  Scale, 
  ClipboardCheck, 
  AlertTriangle,
  History,
  TrendingDown,
  TrendingUp,
  Layers,
  X,
  FileSpreadsheet,
  Cpu,
  Sparkles,
  Calendar,
  Truck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  ShoppingCart,
  DollarSign,
  Activity,
  Zap,
  Info
} from 'lucide-react';

export const InventoryView: React.FC = () => {
  const {
    stockItems,
    addStockItem,
    updateStockItem,
    deleteStockItem,
    stockLocations,
    stockMovements,
    transferStock,
    declareWaste,
    recordStockCountAdjustment,
    showToast
  } = useServOS();

  const [activeTab, setActiveTab] = useState<'ITEMS' | 'PREDICTIVE' | 'AVT' | 'MOVEMENTS'>('ITEMS');

  // Stock Item Modal State
  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockFormName, setStockFormName] = useState<string>('');
  const [stockFormCode, setStockFormCode] = useState<string>('');
  const [stockFormCategory, setStockFormCategory] = useState<StockItem['category']>('BEVERAGE_SPIRITS');
  const [stockFormBaseUnit, setStockFormBaseUnit] = useState<string>('ml');
  const [stockFormCost, setStockFormCost] = useState<number>(100);
  const [stockFormRop, setStockFormRop] = useState<number>(1000);
  const [stockFormMin, setStockFormMin] = useState<number>(500);

  // Modals
  const [isRequisitionOpen, setIsRequisitionOpen] = useState<boolean>(false);
  const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);
  const [transferItemId, setTransferItemId] = useState<string>('');
  const [transferFromLoc, setTransferFromLoc] = useState<string>(stockLocations[0]?.id || '');
  const [transferToLoc, setTransferToLoc] = useState<string>(stockLocations[0]?.id || '');
  const [transferQty, setTransferQty] = useState<number>(0);
  const [transferReason, setTransferReason] = useState<string>('Weekend Bar Replenishment');

  const [isWasteOpen, setIsWasteOpen] = useState<boolean>(false);
  const [wasteItemId, setWasteItemId] = useState<string>('');
  const [wasteLocationId, setWasteLocationId] = useState<string>(stockLocations[0]?.id || '');
  const [wasteQty, setWasteQty] = useState<number>(0);
  const [wasteReason, setWasteReason] = useState<string>('Broken bottle during service');

  const [isStocktakeOpen, setIsStocktakeOpen] = useState<boolean>(false);
  const [stocktakeItemId, setStocktakeItemId] = useState<string>('');
  const [stocktakeLocId, setStocktakeLocId] = useState<string>(stockLocations[0]?.id || '');
  const [stocktakeCounted, setStocktakeCounted] = useState<number>(0);
  const [stocktakeNotes, setStocktakeNotes] = useState<string>('Weekly shift handover count');

  // Movement filter
  const [movementFilter, setMovementFilter] = useState<string>('ALL');

  // Predictive ROP Filter
  const [predictiveFilter, setPredictiveFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'HEALTHY'>('ALL');

  // Compute Predictive Stock Analytics
  const predictiveList = useMemo(() => {
    return calculatePredictiveInventory(stockItems, stockMovements);
  }, [stockItems, stockMovements]);

  const criticalItems = useMemo(() => {
    return predictiveList.filter(p => p.urgencyLevel === 'CRITICAL');
  }, [predictiveList]);

  const warningItems = useMemo(() => {
    return predictiveList.filter(p => p.urgencyLevel === 'WARNING');
  }, [predictiveList]);

  const filteredPredictive = useMemo(() => {
    if (predictiveFilter === 'ALL') return predictiveList;
    return predictiveList.filter(p => p.urgencyLevel === predictiveFilter);
  }, [predictiveList, predictiveFilter]);

  const filteredMovements = stockMovements.filter(m => {
    if (movementFilter === 'ALL') return true;
    return m.movementType === movementFilter;
  });

  const totalReplenishmentCost = useMemo(() => {
    return predictiveList
      .filter(p => p.urgencyLevel === 'CRITICAL' || p.urgencyLevel === 'WARNING')
      .reduce((acc, p) => acc + p.estimatedReplenishmentCost, 0);
  }, [predictiveList]);

  const openAddStockModal = () => {
    setEditingStockId(null);
    setStockFormName('');
    setStockFormCode(`STK-${Math.floor(1000 + Math.random() * 9000)}`);
    setStockFormCategory('BEVERAGE_SPIRITS');
    setStockFormBaseUnit('ml');
    setStockFormCost(250);
    setStockFormRop(1500);
    setStockFormMin(500);
    setIsStockModalOpen(true);
  };

  const openEditStockModal = (item: StockItem) => {
    setEditingStockId(item.id);
    setStockFormName(item.name);
    setStockFormCode(item.code);
    setStockFormCategory(item.category);
    setStockFormBaseUnit(item.baseUnit);
    setStockFormCost(item.averageUnitCost);
    setStockFormRop(item.reorderPoint);
    setStockFormMin(item.minimumStockLevel || 0);
    setIsStockModalOpen(true);
  };

  const handleSaveStockItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockFormName.trim()) return;

    if (editingStockId) {
      const saved = await updateStockItem(editingStockId, {
        name: stockFormName,
        code: stockFormCode,
        category: stockFormCategory,
        baseUnit: stockFormBaseUnit,
        averageUnitCost: stockFormCost,
        reorderPoint: stockFormRop,
        minimumStockLevel: stockFormMin
      });
      if (saved === false) return;
    } else {
      const created: Omit<StockItem, 'id'> = {
        name: stockFormName,
        code: stockFormCode,
        category: stockFormCategory,
        dimension: 'VOLUME',
        parLevel: stockFormRop * 2,
        baseUnit: stockFormBaseUnit,
        currentStock: {},
        reorderPoint: stockFormRop,
        minimumStockLevel: stockFormMin,
        averageUnitCost: stockFormCost,
        lastStocktakeDate: new Date().toISOString().split('T')[0]
      };
      if (await addStockItem(created) === false) return;
    }
    setIsStockModalOpen(false);
  };

  const handleQuickReorder = (item: PredictiveStockAnalysis) => {
    showToast(
      `Reorder Request Generated: PO drafted for ${item.suggestedReorderQuantity} ${item.baseUnit} of ${item.name} with ${item.supplierName} (Est. KES ${item.estimatedReplenishmentCost.toLocaleString()})`,
      'info'
    );
  };

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      {/* Module Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 shrink-0">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Beverage Yield & Inventory Ledger Engine</span>
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5 line-clamp-1">
            Predictive Reorder Points (ROP), Historical Consumption Velocity, Dimensionally-Safe Units & AvT Yields
          </p>
        </div>

        {/* Tab & Action controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('ITEMS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'ITEMS'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Stock Items ({stockItems.length})
            </button>
            <button
              onClick={() => setActiveTab('PREDICTIVE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'PREDICTIVE'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>Predictive ROP</span>
              {(criticalItems.length > 0 || warningItems.length > 0) && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                  activeTab === 'PREDICTIVE' 
                    ? 'bg-slate-950 text-rose-400' 
                    : criticalItems.length > 0 ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40 animate-pulse' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {criticalItems.length + warningItems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('AVT')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'AVT'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AvT Variance
            </button>
            <button
              onClick={() => setActiveTab('MOVEMENTS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'MOVEMENTS'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Movements ({stockMovements.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={openAddStockModal}
              className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Stock Item</span>
            </button>

            <button
              onClick={() => setIsRequisitionOpen(true)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Boxes className="w-3.5 h-3.5 text-amber-400" />
              <span>Store Requisition</span>
            </button>

            <button
              onClick={() => {
                if (stockItems.length > 0) {
                  setTransferItemId(stockItems[0].id);
                  setIsTransferOpen(true);
                }
              }}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>Transfer</span>
            </button>

            <button
              onClick={() => {
                if (stockItems.length > 0) {
                  setWasteItemId(stockItems[0].id);
                  setIsWasteOpen(true);
                }
              }}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Waste</span>
            </button>

            <button
              onClick={() => {
                if (stockItems.length > 0) {
                  setStocktakeItemId(stockItems[0].id);
                  setIsStocktakeOpen(true);
                }
              }}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Count</span>
            </button>
          </div>
        </div>
      </div>

      {/* Urgent Global Predictive Stockout Banner */}
      {criticalItems.length > 0 && activeTab !== 'PREDICTIVE' && (
        <div className="bg-rose-950/70 border-b border-rose-500/40 px-4 py-2.5 flex items-center justify-between text-xs text-rose-200 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 animate-bounce" />
            <span>
              <strong>Predictive Stockout Warning:</strong> {criticalItems.length} item{criticalItems.length === 1 ? '' : 's'} (
              {criticalItems.map(i => i.name).join(', ')}) projected to stock out before supplier replenishment lead time.
            </span>
          </div>
          <button
            onClick={() => setActiveTab('PREDICTIVE')}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-[11px] font-mono transition-colors"
          >
            Review Forecasting & ROP
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-28 md:pb-8 space-y-4">
        {/* VIEW 1: Stock Items & Levels */}
        {activeTab === 'ITEMS' && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Item Code & Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Base Unit</th>
                    <th className="p-3">Unit Cost (KES)</th>
                    <th className="p-3">Warehouse Depot</th>
                    <th className="p-3">Main Bar Store</th>
                    <th className="p-3">Kitchen / Minibar</th>
                    <th className="p-3">Predictive ROP Status</th>
                    <th className="p-3 text-right">Total Valuation (KES)</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {stockItems.map(item => {
                    const whStock = item.currentStock['loc-warehouse'] || 0;
                    const barStock = item.currentStock['loc-bar-store'] || 0;
                    const kitStock = (item.currentStock['loc-kitchen-store'] || 0) + (item.currentStock['loc-minibar-depot'] || 0);
                    const totalQty = whStock + barStock + kitStock;
                    const totalValuation = totalQty * item.averageUnitCost;
                    const pred = predictiveList.find(p => p.stockItemId === item.id);

                    return (
                      <tr key={item.id} className="hover:bg-slate-850">
                        <td className="p-3">
                          <div className="font-bold text-slate-200">{item.name}</div>
                          <div className="text-[10px] text-slate-400">{item.code}</div>
                        </td>
                        <td className="p-3 text-slate-300">
                          {item.category}
                        </td>
                        <td className="p-3">
                          <span className="bg-slate-800 px-2 py-0.5 rounded text-[11px] text-amber-300 font-bold">
                            {item.baseUnit}
                          </span>
                        </td>
                        <td className="p-3 tabular-nums text-slate-300">
                          {item.averageUnitCost.toFixed(2)}
                        </td>
                        <td className="p-3 tabular-nums text-slate-200 font-bold">
                          {whStock.toLocaleString()} {item.baseUnit}
                        </td>
                        <td className="p-3 tabular-nums text-amber-300 font-bold">
                          {barStock.toLocaleString()} {item.baseUnit}
                        </td>
                        <td className="p-3 tabular-nums text-slate-300">
                          {kitStock.toLocaleString()} {item.baseUnit}
                        </td>
                        <td className="p-3">
                          {pred && (
                            <div className="space-y-0.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                pred.urgencyLevel === 'CRITICAL' 
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' 
                                  : pred.urgencyLevel === 'WARNING' 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}>
                                {pred.urgencyLevel === 'CRITICAL' ? `CRITICAL (${pred.daysOfInventoryRemaining.toFixed(1)}d)` :
                                 pred.urgencyLevel === 'WARNING' ? `REORDER (${pred.daysOfInventoryRemaining.toFixed(1)}d)` :
                                 'HEALTHY'}
                              </span>
                              <div className="text-[9.5px] text-slate-400">
                                Dynamic ROP: {pred.dynamicReorderPoint} {item.baseUnit}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-400 tabular-nums">
                          {Math.round(totalValuation).toLocaleString()}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openEditStockModal(item)}
                              title="Edit Item Details"
                              className="p-1 hover:bg-slate-800 text-amber-400 rounded transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete stock item ${item.name}?`)) {
                                  deleteStockItem(item.id);
                                }
                              }}
                              title="Delete Item"
                              className="p-1 hover:bg-slate-800 text-rose-400 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 2: Predictive Low-Stock Alert System & Dynamic ROP Forecasting */}
        {activeTab === 'PREDICTIVE' && (
          <div className="space-y-4">
            {/* Predictive Header Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Critical Stockout Risk</span>
                  <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-rose-400 mt-2">
                  {criticalItems.length} <span className="text-xs font-normal text-slate-400">Items</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Run-rate exceeds supplier lead time
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Reorders Triggered</span>
                  <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
                  {warningItems.length} <span className="text-xs font-normal text-slate-400">Items</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Below dynamic safety reorder point
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Est. Replenishment Capital</span>
                  <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400 mt-2">
                  KES {Math.round(totalReplenishmentCost).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Total EOQ purchase requisition cost
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">ROP Algorithm Mode</span>
                  <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
                    <Zap className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-sm font-bold font-mono text-cyan-300 mt-2">
                  Dynamic Lead Time + 50% SS
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  $ROP = (ADC \times LeadTime) + SafetyStock$
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-slate-400 mr-1">Filter Urgency:</span>
                {(['ALL', 'CRITICAL', 'WARNING', 'HEALTHY'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setPredictiveFilter(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold font-mono transition-colors ${
                      predictiveFilter === f
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-400" />
                <span>Historical consumption velocity computed across live sales & waste depletions.</span>
              </div>
            </div>

            {/* Predictive Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[950px]">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Stock Item & Code</th>
                      <th className="p-3">Current Physical Stock</th>
                      <th className="p-3">Daily Run Rate (ADC)</th>
                      <th className="p-3">Supplier Lead Time</th>
                      <th className="p-3">Dynamic ROP (SS Buffer)</th>
                      <th className="p-3">Days Remaining & Projection</th>
                      <th className="p-3">Suggested Order (EOQ)</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {filteredPredictive.map(item => {
                      const isCritical = item.urgencyLevel === 'CRITICAL';
                      const isWarning = item.urgencyLevel === 'WARNING';
                      const isOverstocked = item.urgencyLevel === 'OVERSTOCKED';

                      return (
                        <tr key={item.stockItemId} className="hover:bg-slate-850">
                          <td className="p-3">
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {isCritical && (
                                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>{item.code}</span>
                              <span>•</span>
                              <span>{item.category}</span>
                              <span>•</span>
                              <span>{item.supplierName}</span>
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="text-sm font-bold text-slate-200 tabular-nums">
                              {item.currentStockTotal.toLocaleString()} <span className="text-xs font-normal text-amber-300">{item.baseUnit}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Par: {item.parLevel} {item.baseUnit}
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-200 tabular-nums">
                              {item.averageDailyConsumption} <span className="text-[10px] font-normal text-slate-400">{item.baseUnit}/day</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Lead Demand: {item.leadTimeDemand} {item.baseUnit}
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-200 flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5 text-slate-400" />
                              <span>{item.leadTimeDays} Days</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Supplier SLA
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-amber-300 tabular-nums">
                              {item.dynamicReorderPoint} {item.baseUnit}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Incl. {item.safetyStock} {item.baseUnit} Safety Stock
                            </div>
                          </td>

                          <td className="p-3 min-w-[180px]">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[11px] font-bold ${
                                isCritical ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'
                              }`}>
                                {item.daysOfInventoryRemaining.toFixed(1)} Days Left
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {item.stockoutProjectedDate}
                              </span>
                            </div>

                            {/* Risk Gauge Bar */}
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, (item.daysOfInventoryRemaining / 30) * 100)}%` }}
                              />
                            </div>
                            <div className="text-[9.5px] text-slate-400 mt-1 truncate">
                              {item.urgencyMessage}
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-100 tabular-nums">
                              {item.suggestedReorderQuantity > 0 ? (
                                <>
                                  {item.suggestedReorderQuantity} {item.baseUnit}
                                  <div className="text-[10px] text-emerald-400 font-semibold">
                                    KES {item.estimatedReplenishmentCost.toLocaleString()}
                                  </div>
                                </>
                              ) : (
                                <span className="text-slate-500">None required</span>
                              )}
                            </div>
                          </td>

                          <td className="p-3 text-right">
                            {item.suggestedReorderQuantity > 0 ? (
                              <button
                                onClick={() => handleQuickReorder(item)}
                                className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 ml-auto transition-colors ${
                                  isCritical 
                                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm' 
                                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm'
                                }`}
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>Reorder Now</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-mono">
                                In Stock
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: Actual vs Theoretical (AvT) Yield Report (Section 13, 27) */}
        {activeTab === 'AVT' && (
          <div className="space-y-4">
            <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  <span>Actual-vs-Theoretical (AvT) Beverage Yield Reconciliation</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Compares POS sale depletions + declared spillage against actual physical bottle/ml counts.
                </p>
              </div>
              <div className="text-xs font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3 py-1.5 rounded shrink-0">
                Configured Tolerance: 2.5% of Theoretical
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[800px]">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Stock Item</th>
                      <th className="p-3">Location</th>
                      <th className="p-3">Opening Stock</th>
                      <th className="p-3">POS Theoretical Usage</th>
                      <th className="p-3">Declared Waste</th>
                      <th className="p-3">Expected In-Stock</th>
                      <th className="p-3">Actual Count</th>
                      <th className="p-3">Yield Variance</th>
                      <th className="p-3 text-right">Variance Loss (KES)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {/* Jameson AvT row with real variance */}
                    <tr className="hover:bg-slate-850">
                      <td className="p-3 font-bold text-slate-200">
                        Jameson Irish Whiskey 750ml
                      </td>
                      <td className="p-3 text-slate-400">Main Bar Beverage Station</td>
                      <td className="p-3 tabular-nums">4,500 ml</td>
                      <td className="p-3 tabular-nums text-amber-300">-210 ml (POS Shots)</td>
                      <td className="p-3 tabular-nums text-rose-350">-90 ml (Spill)</td>
                      <td className="p-3 tabular-nums font-bold">4,200 ml</td>
                      <td className="p-3 tabular-nums font-bold text-slate-100">4,020 ml</td>
                      <td className="p-3">
                        <span className="text-rose-400 font-bold bg-rose-500/20 px-2 py-0.5 rounded">
                          -180 ml (-4.2%)
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-rose-400 tabular-nums">
                        -KES 816.00
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-850">
                      <td className="p-3 font-bold text-slate-200">
                        Tusker Lager 500ml
                      </td>
                      <td className="p-3 text-slate-400">Main Bar Beverage Station</td>
                      <td className="p-3 tabular-nums">120 units</td>
                      <td className="p-3 tabular-nums text-amber-300">-18 units (POS)</td>
                      <td className="p-3 tabular-nums text-rose-350">-2 units (Broken)</td>
                      <td className="p-3 tabular-nums font-bold">100 units</td>
                      <td className="p-3 tabular-nums font-bold text-slate-100">100 units</td>
                      <td className="p-3">
                        <span className="text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded">
                          0 units (Exact)
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-400 tabular-nums">
                        KES 0.00
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: Immutable Stock Movement Ledger */}
        {activeTab === 'MOVEMENTS' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between overflow-x-auto scrollbar-none pb-1">
              <div className="flex items-center gap-1.5 min-w-max">
                {['ALL', 'SALE_CONSUMPTION', 'TRANSFER_IN', 'TRANSFER_OUT', 'WASTE', 'PURCHASE_RECEIPT', 'COUNT_ADJUSTMENT'].map(mvt => (
                  <button
                    key={mvt}
                    onClick={() => setMovementFilter(mvt)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                      movementFilter === mvt
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {mvt}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-md">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Item Name</th>
                      <th className="p-3">Location</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Source Ref / Reason</th>
                      <th className="p-3">Quantity Delta</th>
                      <th className="p-3">Cost Snapshot</th>
                      <th className="p-3 text-right">Cost Valuation (KES)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {filteredMovements.map(m => {
                      const isPositive = m.quantityDelta > 0;
                      return (
                        <tr key={m.id} className="hover:bg-slate-850">
                          <td className="p-3 text-slate-400 text-[11px]">
                            {new Date(m.occurredAt).toLocaleDateString()} {new Date(m.occurredAt).toLocaleTimeString()}
                          </td>
                          <td className="p-3 font-semibold text-slate-200">
                            {m.stockItemName}
                          </td>
                          <td className="p-3 text-slate-400">
                            {m.locationName}
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              m.movementType === 'SALE_CONSUMPTION' ? 'bg-blue-500/20 text-blue-300' :
                              m.movementType === 'PURCHASE_RECEIPT' ? 'bg-emerald-500/20 text-emerald-300' :
                              m.movementType === 'WASTE' ? 'bg-rose-500/20 text-rose-300' :
                              'bg-amber-500/20 text-amber-300'
                            }`}>
                              {m.movementType}
                            </span>
                          </td>
                          <td className="p-3 text-slate-300">
                            {m.sourceId ? `#${m.sourceId} ` : ''}
                            <span className="text-slate-400 text-[11px]">{m.reasonCode}</span>
                          </td>
                          <td className={`p-3 font-bold tabular-nums ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isPositive ? '+' : ''}{m.quantityDelta} {m.baseUnit}
                          </td>
                          <td className="p-3 text-slate-400 tabular-nums">
                            KES {m.unitCostSnapshot.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-200 tabular-nums">
                            {m.totalCostValuation.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Stock Transfer */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Inter-Location Stock Transfer</h3>
            <p className="text-xs text-slate-400 mb-4">Creates paired dispatch/receive movements with zero loss.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Stock Item</label>
                <select
                  value={transferItemId}
                  onChange={e => setTransferItemId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {stockItems.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Base: {s.baseUnit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">From Location</label>
                  <select
                    value={transferFromLoc}
                    onChange={e => setTransferFromLoc(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  >
                    {stockLocations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">To Location</label>
                  <select
                    value={transferToLoc}
                    onChange={e => setTransferToLoc(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                  >
                    {stockLocations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Quantity (in Base Unit)</label>
                <input
                  type="number"
                  value={transferQty}
                  onChange={e => setTransferQty(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Reason / Shift Handover Note</label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={e => setTransferReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setIsTransferOpen(false)}
                className="px-4 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (transferQty <= 0) {
                    showToast('Please enter a positive transfer quantity', 'error');
                    return;
                  }
                  if (await transferStock(transferItemId, transferFromLoc, transferToLoc, transferQty, transferReason) === false) return;
                  setIsTransferOpen(false);
                }}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded"
              >
                Post Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Declare Waste */}
      {isWasteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Record Wastage / Spillage</h3>
            <p className="text-xs text-slate-400 mb-4">Wastage expenses directly to Cost of Goods Sold (COGS) Ledger.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Stock Item</label>
                <select
                  value={wasteItemId}
                  onChange={e => setWasteItemId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {stockItems.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.baseUnit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Location</label>
                <select
                  value={wasteLocationId}
                  onChange={e => setWasteLocationId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {stockLocations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Wasted Quantity (Base Unit)</label>
                <input
                  type="number"
                  value={wasteQty}
                  onChange={e => setWasteQty(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Reason / Cause</label>
                <input
                  type="text"
                  value={wasteReason}
                  onChange={e => setWasteReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setIsWasteOpen(false)}
                className="px-4 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (wasteQty <= 0) {
                    showToast('Please enter a positive wastage quantity', 'error');
                    return;
                  }
                  if (await declareWaste(wasteItemId, wasteLocationId, wasteQty, wasteReason) === false) return;
                  setIsWasteOpen(false);
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded"
              >
                Record Waste
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Stocktake Adjustment */}
      {isStocktakeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Physical Stock Count Adjustment</h3>
            <p className="text-xs text-slate-400 mb-4">Calculates exact delta variance and balances the inventory ledger.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Stock Item</label>
                <select
                  value={stocktakeItemId}
                  onChange={e => setStocktakeItemId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {stockItems.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.baseUnit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Count Location</label>
                <select
                  value={stocktakeLocId}
                  onChange={e => setStocktakeLocId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                >
                  {stockLocations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Actual Physical Counted Units</label>
                <input
                  type="number"
                  value={stocktakeCounted}
                  onChange={e => setStocktakeCounted(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Auditor / Count Notes</label>
                <input
                  type="text"
                  value={stocktakeNotes}
                  onChange={e => setStocktakeNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setIsStocktakeOpen(false)}
                className="px-4 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (await recordStockCountAdjustment(stocktakeItemId, stocktakeLocId, stocktakeCounted, stocktakeNotes) === false) return;
                  setIsStocktakeOpen(false);
                }}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded"
              >
                Commit Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STOCK REQUISITION MODAL */}
      <StockRequisitionModal
        isOpen={isRequisitionOpen}
        onClose={() => setIsRequisitionOpen(false)}
      />

      {/* STOCK ITEM CREATION / EDITING MODAL */}
      {isStockModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingStockId ? 'Edit Stock Item Master' : 'Add New Inventory Stock Item'}
                </h3>
                <p className="text-xs text-slate-400 font-mono">Define unit costs, reorder thresholds & category</p>
              </div>
              <button onClick={() => setIsStockModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockItem} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={stockFormName}
                  onChange={e => setStockFormName(e.target.value)}
                  placeholder="e.g. Jameson Irish Whiskey 750ml"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Item Code / SKU</label>
                  <input
                    type="text"
                    required
                    value={stockFormCode}
                    onChange={e => setStockFormCode(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-amber-300"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Category</label>
                  <select
                    value={stockFormCategory}
                    onChange={e => setStockFormCategory(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                  >
                    <option value="BEVERAGE_SPIRITS">Spirits & Cognac</option>
                    <option value="BEVERAGE_WINE">Wine & Champagne</option>
                    <option value="BEVERAGE_BEER">Beer & Cider</option>
                    <option value="BEVERAGE_MIXER">Softs & Mixers</option>
                    <option value="FOOD_PROTEIN">Meat & Seafood</option>
                    <option value="FOOD_DRY_GOODS">Dry Goods & Pantry</option>
                    <option value="CONSUMABLES">Guest Amenities & Packaging</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Base Inventory Unit</label>
                  <input
                    type="text"
                    required
                    value={stockFormBaseUnit}
                    onChange={e => setStockFormBaseUnit(e.target.value)}
                    placeholder="ml, kg, pcs, cans"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-amber-300"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Average Unit Cost (KES)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={stockFormCost}
                    onChange={e => setStockFormCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Dynamic ROP (Reorder Point)</label>
                  <input
                    type="number"
                    min="0"
                    value={stockFormRop}
                    onChange={e => setStockFormRop(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Minimum Safety Stock Level</label>
                  <input
                    type="number"
                    min="0"
                    value={stockFormMin}
                    onChange={e => setStockFormMin(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors shadow-xs"
                >
                  {editingStockId ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
