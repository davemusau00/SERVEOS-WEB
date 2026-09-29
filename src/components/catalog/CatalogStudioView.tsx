import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { ProductSellable, PriceBookRule, ProductType } from '../../types/servos';
import { 
  Layers, 
  Wine, 
  Flame, 
  Beer, 
  Sparkles, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Save, 
  Sliders, 
  Calculator, 
  DollarSign, 
  Clock, 
  Tag, 
  CheckCircle2, 
  AlertCircle, 
  Check, 
  X, 
  Percent,
  SlidersHorizontal,
  Boxes,
  FileSpreadsheet
} from 'lucide-react';

const INITIAL_PRICE_BOOKS: PriceBookRule[] = [
  {
    id: 'pb-01',
    name: 'Friday Happy Hour (16:00 - 19:00)',
    type: 'HAPPY_HOUR',
    description: 'Special draught beer and house cocktail promotional pricing for sunset hours',
    discountPct: 28.5,
    specialPriceKes: 250,
    startTime: '16:00',
    endTime: '19:00',
    daysOfWeek: ['Friday', 'Saturday'],
    activeOutletIds: ['outlet-main-bar', 'outlet-terrace'],
    applicableCategories: ['BEER', 'COCKTAIL'],
    active: true
  },
  {
    id: 'pb-02',
    name: 'VIP Black Card Bottle Discount',
    type: 'VIP',
    description: 'Exclusive 10% privilege discount on all premium spirits and champagne bottles',
    discountPct: 10.0,
    activeOutletIds: ['outlet-main-bar', 'outlet-vip-lounge', 'outlet-pool'],
    applicableCategories: ['SPIRITS', 'WINE', 'PACKAGE'],
    active: true
  },
  {
    id: 'pb-03',
    name: 'Hotel Room Service Surcharge (+15%)',
    type: 'ROOM_SERVICE',
    description: 'Delivery and hospitality tray fee automatically added to guest room folio orders',
    discountPct: -15.0,
    activeOutletIds: ['outlet-main-bar', 'outlet-restaurant'],
    active: true
  },
  {
    id: 'pb-04',
    name: 'Staff Shift Meal & Beverage (50% Off)',
    type: 'STAFF',
    description: 'Subsidized employee dining rate valid during active duty shift hours',
    discountPct: 50.0,
    activeOutletIds: ['outlet-restaurant'],
    applicableCategories: ['FOOD'],
    active: true
  }
];

export const CatalogStudioView: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct, outlets, stockItems, showToast } = useServOS();
  const [activeTab, setActiveTab] = useState<'PRODUCTS' | 'RECIPES' | 'PORTIONS' | 'PRICING_ENGINE'>('PRODUCTS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [priceBooks, setPriceBooks] = useState<PriceBookRule[]>(INITIAL_PRICE_BOOKS);

  // Selected product for detailed inspector
  const [selectedProduct, setSelectedProduct] = useState<ProductSellable>(products[0] || null);

  // Product Editing / Creation Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null); // null = New Product
  const [productFormName, setProductFormName] = useState<string>('');
  const [productFormCode, setProductFormCode] = useState<string>('');
  const [productFormCategory, setProductFormCategory] = useState<ProductSellable['category']>('SPIRITS');
  const [productFormPrice, setProductFormPrice] = useState<number>(500);
  const [productFormCostPrice, setProductFormCostPrice] = useState<number>(150);
  const [productFormRouteTo, setProductFormRouteTo] = useState<ProductSellable['routeTo']>('BAR');
  const [productFormEtimsCode, setProductFormEtimsCode] = useState<ProductSellable['etimsTaxCode']>('A');
  const [productFormDescription, setProductFormDescription] = useState<string>('');

  // New Price Book modal state
  const [newRuleModalOpen, setNewRuleModalOpen] = useState<boolean>(false);
  const [newRuleName, setNewRuleName] = useState<string>('Sunday Sunset Cocktail Hour');
  const [newRuleType, setNewRuleType] = useState<PriceBookRule['type']>('HAPPY_HOUR');
  const [newRuleDiscount, setNewRuleDiscount] = useState<number>(20);

  const filteredProducts = products.filter(p => {
    if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
    }
    return true;
  });

  const handleToggleRule = (id: string) => {
    setPriceBooks(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
    showToast('Price Book Rule status toggled successfully!', 'info');
  };

  const openAddProductModal = () => {
    setEditingProductId(null);
    setProductFormName('');
    setProductFormCode(`SKU-${Math.floor(100 + Math.random() * 900)}`);
    setProductFormCategory('SPIRITS');
    setProductFormPrice(650);
    setProductFormCostPrice(200);
    setProductFormRouteTo('BAR');
    setProductFormEtimsCode('A');
    setProductFormDescription('');
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (prod: ProductSellable) => {
    setEditingProductId(prod.id);
    setProductFormName(prod.name);
    setProductFormCode(prod.code);
    setProductFormCategory(prod.category);
    setProductFormPrice(prod.price);
    setProductFormCostPrice(prod.costPrice || Math.round(prod.price * 0.3));
    setProductFormRouteTo(prod.routeTo);
    setProductFormEtimsCode(prod.etimsTaxCode || 'A');
    setProductFormDescription(prod.description || '');
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productFormName.trim()) return;

    if (editingProductId) {
      const saved = await updateProduct(editingProductId, {
        name: productFormName,
        code: productFormCode,
        category: productFormCategory,
        basePrice: productFormPrice,
        price: productFormPrice,
        costPrice: productFormCostPrice,
        routeTo: productFormRouteTo,
        etimsTaxCode: productFormEtimsCode,
        description: productFormDescription
      });
      // update selected product
      if (saved === false) return;
      if (selectedProduct && selectedProduct.id === editingProductId) {
        setSelectedProduct(prev => prev ? {
          ...prev,
          name: productFormName,
          code: productFormCode,
          category: productFormCategory,
          basePrice: productFormPrice,
          price: productFormPrice,
          costPrice: productFormCostPrice,
          routeTo: productFormRouteTo,
          etimsTaxCode: productFormEtimsCode,
          description: productFormDescription
        } : prev);
      }
    } else {
      const created: Omit<ProductSellable, 'id'> = {
        name: productFormName,
        code: productFormCode,
        category: productFormCategory,
        basePrice: productFormPrice,
        price: productFormPrice,
        costPrice: productFormCostPrice,
        portionVolume: 750,
        portionUnit: 'ml',
        routeTo: productFormRouteTo,
        outletIds: outlets.map(o => o.id),
        etimsTaxCode: productFormEtimsCode,
        description: productFormDescription
      };
      if (await addProduct(created) === false) return;
    }
    setIsProductModalOpen(false);
  };

  const handleCreatePriceBook = () => {
    const newRule: PriceBookRule = {
      id: `pb-${Date.now()}`,
      name: newRuleName,
      type: newRuleType,
      description: 'Custom pricing engine rule',
      discountPct: newRuleDiscount,
      activeOutletIds: outlets.map(o => o.id),
      active: true
    };
    setPriceBooks(prev => [newRule, ...prev]);
    setNewRuleModalOpen(false);
    showToast(`Created pricing rule: ${newRuleName}!`, 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold tracking-wider uppercase border border-rose-500/30">
              CATALOG STUDIO & PRICING ENGINE
            </span>
            <span className="text-slate-400 text-xs font-mono">Master Product & Recipe Matrix</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
            <span>Product, Yield & Price Books</span>
          </h1>
        </div>

        {/* Studio Sub-Navigation Tabs */}
        <div className="flex items-center bg-slate-850 p-1 rounded-xl border border-slate-750 text-xs font-mono overflow-x-auto">
          <button
            onClick={() => setActiveTab('PRODUCTS')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap ${
              activeTab === 'PRODUCTS' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Products ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('PORTIONS')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap ${
              activeTab === 'PORTIONS' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Portions & Yield
          </button>
          <button
            onClick={() => setActiveTab('RECIPES')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap ${
              activeTab === 'RECIPES' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cocktail Recipes
          </button>
          <button
            onClick={() => setActiveTab('PRICING_ENGINE')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap ${
              activeTab === 'PRICING_ENGINE' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Price Books & Happy Hour
          </button>
        </div>
      </div>

      {/* Main Studio Viewport */}
      {activeTab === 'PRODUCTS' && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left List of Products */}
          <div className="w-full md:w-80 lg:w-96 border-r border-slate-800 bg-slate-900/60 flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase">Product Catalog</span>
                <button
                  onClick={openAddProductModal}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Product</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter products..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-750 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {(['ALL', 'SPIRITS', 'COCKTAIL', 'BEER', 'FOOD', 'PACKAGE'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold whitespace-nowrap transition-colors ${
                      selectedCategory === cat ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredProducts.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedProduct?.id === p.id
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-sm'
                      : 'bg-slate-850/50 border-slate-750/70 hover:border-slate-650'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white truncate max-w-[180px]">{p.name}</span>
                    <span className="text-xs font-mono font-bold text-amber-400">KES {p.price.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1">
                    <span>{p.code}</span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px]">{p.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Product Detail Inspector */}
          {selectedProduct ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                      {selectedProduct.category}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{selectedProduct.code}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white mt-1">{selectedProduct.name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Route To: {selectedProduct.routeTo} Station</p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="text-left sm:text-right">
                    <span className="text-xs font-mono text-slate-400 block">Base Selling Price</span>
                    <span className="text-2xl font-black text-amber-400 font-mono">KES {selectedProduct.price.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditProductModal(selectedProduct)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-amber-400 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete ${selectedProduct.name}?`)) {
                          deleteProduct(selectedProduct.id);
                          const remaining = products.filter(p => p.id !== selectedProduct.id);
                          setSelectedProduct(remaining[0] || null);
                        }
                      }}
                      className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold rounded-lg border border-rose-800/50 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Portion & Yield Spec (for Spirits) */}
              {selectedProduct.category === 'SPIRITS' && (
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Wine className="w-4 h-4 text-amber-400" />
                      <span>Spirits Inventory Basis & Selling Tiers</span>
                    </h3>
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                      750ml Standard Bottle Basis
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl">
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">30ml Single Shot</span>
                      <span className="text-sm font-bold text-amber-300 font-mono">KES 350</span>
                      <span className="text-[10px] text-slate-400 block mt-1">Yield: 25.0 shots / bottle</span>
                    </div>

                    <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl">
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">60ml Double Shot</span>
                      <span className="text-sm font-bold text-amber-300 font-mono">KES 650</span>
                      <span className="text-[10px] text-slate-400 block mt-1">Yield: 12.5 shots / bottle</span>
                    </div>

                    <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl">
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">375ml Half Bottle</span>
                      <span className="text-sm font-bold text-amber-300 font-mono">KES 3,900</span>
                      <span className="text-[10px] text-slate-400 block mt-1">Yield: 2.0 halves / bottle</span>
                    </div>

                    <div className="p-3 bg-slate-850 border border-slate-750 rounded-xl">
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">750ml Full Bottle</span>
                      <span className="text-sm font-bold text-amber-300 font-mono">KES 7,500</span>
                      <span className="text-[10px] text-emerald-400 font-mono block mt-1">Includes 4 Mixers</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">Allowable Spillage / Dispense Loss Tolerance:</span>
                    <span className="font-bold text-amber-400">2.0% Maximum Allowed</span>
                  </div>
                </div>
              )}

              {/* Outlet Availability */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                  Outlet Availability & Deployment
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {outlets.map(out => {
                    const isAvail = selectedProduct.outletIds.includes(out.id);
                    return (
                      <div
                        key={out.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          isAvail ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' : 'bg-slate-850 border-slate-750 text-slate-400'
                        }`}
                      >
                        <span className="font-medium">{out.name}</span>
                        {isAvail && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* RECIPES TAB (COCKTAIL BUILDER) */}
      {activeTab === 'RECIPES' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold uppercase">
                COCKTAIL RECIPE BUILDER
              </span>
              <h2 className="text-xl font-bold text-white mt-1">Long Island Iced Tea</h2>
              <p className="text-xs text-slate-400 mt-0.5">Automated recipe stock depletion & cost-of-goods calculation</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 block uppercase">Calculated Margin</span>
                <span className="text-xl font-black text-emerald-400 font-mono">74.2% Net</span>
              </div>
              <div className="text-right border-l border-slate-800 pl-3">
                <span className="text-[10px] font-mono text-slate-400 block uppercase">Sell Price</span>
                <span className="text-xl font-black text-amber-400 font-mono">KES 900</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Ingredients Spec */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Recipe Inclusions (Auto-Depleted per Order)</span>
              </h3>

              <div className="space-y-2 font-mono text-xs">
                {[
                  { name: 'Smirnoff Vodka', qty: '30 ml', cost: 42.0 },
                  { name: 'Gordon\'s Dry Gin', qty: '30 ml', cost: 45.0 },
                  { name: 'Captain Morgan White Rum', qty: '30 ml', cost: 40.0 },
                  { name: 'Jose Cuervo Silver Tequila', qty: '30 ml', cost: 58.0 },
                  { name: 'Triple Sec Liqueur', qty: '20 ml', cost: 28.0 },
                  { name: 'Coca-Cola (Dispense)', qty: '120 ml', cost: 12.0 },
                  { name: 'Fresh Lemon Wedge', qty: '0.25 ea', cost: 7.0 }
                ].map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-850 border border-slate-750 rounded-xl flex items-center justify-between">
                    <span className="text-slate-200 font-semibold">{item.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-amber-300 font-bold">{item.qty}</span>
                      <span className="text-slate-400 text-[10px]">KES {item.cost.toFixed(2)} cost</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 font-bold">Total Beverage Cost of Goods (COGS):</span>
                <span className="font-bold text-rose-300">KES 232.00 (25.8%)</span>
              </div>
            </div>

            {/* Modifiers Spec */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-400" />
                <span>POS Modifiers & Upsell Rules</span>
              </h3>

              <div className="space-y-2 font-mono text-xs">
                {[
                  { name: '+ Double Spirits (+15ml each)', price: '+KES 350', effect: 'Depletes +15ml of each spirit' },
                  { name: '+ Premium Mixer (Fever Tree Red Bull)', price: '+KES 150', effect: 'Substitutes standard Cola' },
                  { name: '+ Extra Lemon & Mint Garnish', price: 'FREE', effect: 'No price change' },
                  { name: '- No Ice / Light Ice', price: 'FREE', effect: 'Standard pour volume preserved' }
                ].map((mod, idx) => (
                  <div key={idx} className="p-3 bg-slate-850 border border-slate-750 rounded-xl">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-purple-300">{mod.name}</span>
                      <span className="text-amber-400">{mod.price}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans mt-0.5">{mod.effect}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PORTIONS & YIELD TAB */}
      {activeTab === 'PORTIONS' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-amber-400" />
              <span>Standard Portion & Theoretical Yield Matrix</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Controls stock depletion precision across all bars, cocktail dispensers and VIP lounges
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
              <h3 className="text-sm font-bold text-amber-300 font-mono">Standard 750ml Spirit Bottle</h3>
              <div className="space-y-1.5 text-xs font-mono text-slate-300">
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>30ml Single Pour</span>
                  <span className="font-bold text-white">25.0 Servings</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>60ml Double Pour</span>
                  <span className="font-bold text-white">12.5 Servings</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>Standard Spillage SLA</span>
                  <span className="font-bold text-emerald-400">2.0%</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
              <h3 className="text-sm font-bold text-cyan-300 font-mono">Standard 50L Draught Keg</h3>
              <div className="space-y-1.5 text-xs font-mono text-slate-300">
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>500ml Pint</span>
                  <span className="font-bold text-white">100 Pints</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>330ml Half Pint</span>
                  <span className="font-bold text-white">151 Halves</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>Line Cleaning Loss</span>
                  <span className="font-bold text-amber-400">3.5%</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
              <h3 className="text-sm font-bold text-purple-300 font-mono">Standard 750ml Wine Bottle</h3>
              <div className="space-y-1.5 text-xs font-mono text-slate-300">
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>150ml Glass</span>
                  <span className="font-bold text-white">5.0 Glasses</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>250ml Large Carafe</span>
                  <span className="font-bold text-white">3.0 Carafes</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-850 rounded-lg">
                  <span>Oxidation Tolerance</span>
                  <span className="font-bold text-emerald-400">1.5%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRICING ENGINE & PRICE BOOKS TAB */}
      {activeTab === 'PRICING_ENGINE' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-400" />
                <span>Price Books, Happy Hour & Promotional Rules</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Dynamic pricing rules applied automatically during checkout based on time, loyalty tier & outlet
              </p>
            </div>

            <button
              onClick={() => setNewRuleModalOpen(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Deploy Price Book</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {priceBooks.map(rule => (
              <div
                key={rule.id}
                className={`p-4 rounded-2xl border transition-all ${
                  rule.active ? 'bg-slate-900 border-slate-750' : 'bg-slate-950/40 border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        rule.type === 'HAPPY_HOUR' ? 'bg-amber-500/20 text-amber-300' :
                        rule.type === 'VIP' ? 'bg-purple-500/20 text-purple-300' :
                        rule.type === 'ROOM_SERVICE' ? 'bg-cyan-500/20 text-cyan-300' :
                        'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {rule.type}
                      </span>
                      {rule.startTime && (
                        <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          {rule.startTime} - {rule.endTime}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white mt-1.5">{rule.name}</h3>
                    <p className="text-xs text-slate-300 mt-0.5">{rule.description}</p>
                  </div>

                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                      rule.active ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {rule.active ? 'ACTIVE' : 'PAUSED'}
                  </button>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">
                    Adjustment: <span className="text-amber-400 font-bold">{(rule.discountPct || 0) > 0 ? `-${rule.discountPct}%` : `+${Math.abs(rule.discountPct || 0)}%`}</span>
                  </span>
                  <span className="text-slate-400">
                    Outlets: <span className="text-white font-bold">{rule.activeOutletIds.length} Active</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEW PRICE BOOK MODAL */}
      {newRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-750 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Create New Price Book Rule</h3>
              <button onClick={() => setNewRuleModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Rule Name</label>
                <input
                  type="text"
                  value={newRuleName}
                  onChange={e => setNewRuleName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Rule Type</label>
                <select
                  value={newRuleType}
                  onChange={e => setNewRuleType(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 text-amber-300 font-bold rounded-xl p-2 focus:outline-none"
                >
                  <option value="HAPPY_HOUR">Happy Hour (Timed)</option>
                  <option value="VIP">VIP Card Discount</option>
                  <option value="ROOM_SERVICE">Room Service Surcharge</option>
                  <option value="STAFF">Staff Meal Allowance</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Discount / Surcharge Rate (%)</label>
                <input
                  type="number"
                  value={newRuleDiscount}
                  onChange={e => setNewRuleDiscount(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setNewRuleModalOpen(false)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePriceBook}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
              >
                Deploy Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT CREATION / EDITING MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingProductId ? 'Edit Product Details' : 'Add New Product to Catalog'}
                </h3>
                <p className="text-xs text-slate-400 font-mono">Configure selling price, routing & eTIMS classification</p>
              </div>
              <button onClick={() => setIsProductModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  value={productFormName}
                  onChange={e => setProductFormName(e.target.value)}
                  placeholder="e.g. Hennessy VSOP 750ml"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">SKU / Code</label>
                  <input
                    type="text"
                    required
                    value={productFormCode}
                    onChange={e => setProductFormCode(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-amber-300"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Category</label>
                  <select
                    value={productFormCategory}
                    onChange={e => setProductFormCategory(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                  >
                    <option value="SPIRITS">Spirits</option>
                    <option value="COCKTAIL">Cocktail</option>
                    <option value="BEER">Beer & Cider</option>
                    <option value="FOOD">Food & Kitchen</option>
                    <option value="PACKAGE">Package & Softs</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Selling Price (KES)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={productFormPrice}
                    onChange={e => setProductFormPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Cost Price (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={productFormCostPrice}
                    onChange={e => setProductFormCostPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Station Route</label>
                  <select
                    value={productFormRouteTo}
                    onChange={e => setProductFormRouteTo(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                  >
                    <option value="BAR">Bar Pass</option>
                    <option value="KITCHEN">Kitchen Pass</option>
                    <option value="GRILL">Grill Station</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">eTIMS KRA Tax Code</label>
                  <select
                    value={productFormEtimsCode}
                    onChange={e => setProductFormEtimsCode(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-emerald-400 font-mono"
                  >
                    <option value="A">Code A (16% Standard VAT)</option>
                    <option value="B">Code B (0% Zero Rated)</option>
                    <option value="C">Code C (Exempt Tax)</option>
                    <option value="EX">Code EX (Excise Duty 20%)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Product Description / Notes</label>
                <textarea
                  rows={2}
                  value={productFormDescription}
                  onChange={e => setProductFormDescription(e.target.value)}
                  placeholder="e.g. Premium VSOP cognac served with optional ginger ale mixer"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 outline-none resize-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors shadow-xs"
                >
                  {editingProductId ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
