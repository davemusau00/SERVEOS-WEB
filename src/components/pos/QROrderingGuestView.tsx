import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { ProductSellable } from '../../types/servos';
import { 
  QrCode, 
  Utensils, 
  Smartphone, 
  ShoppingBag, 
  Plus, 
  Minus, 
  CheckCircle, 
  Sparkles, 
  X, 
  Send, 
  DollarSign, 
  Clock, 
  Info,
  Flame,
  Wine,
  CreditCard
} from 'lucide-react';

interface GuestCartItem {
  product: ProductSellable;
  quantity: number;
  portionName?: string;
  notes?: string;
}

export const QROrderingGuestView: React.FC<{ onClose: () => void; tableLabel?: string }> = ({ 
  onClose, 
  tableLabel = 'Table 4 (Terrace Poolside)' 
}) => {
  const { products, showToast, createOrderForTable, addItemToOrder } = useServOS();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<GuestCartItem[]>([]);
  const [guestName, setGuestName] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [paymentOption, setPaymentOption] = useState<'ADD_TO_TABLE' | 'PAY_MPESA_NOW'>('ADD_TO_TABLE');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const categories = ['ALL', 'FOOD', 'SPIRITS', 'WINE', 'BEER', 'COCKTAIL'];

  const filteredProducts = products.filter(p => 
    selectedCategory === 'ALL' ? true : p.category === selectedCategory
  );

  const addToCart = (prod: ProductSellable) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === prod.id);
      if (existing) {
        return prev.map(i => i.product.id === prod.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product: prod, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.product.id !== productId);
    });
  };

  const cartTotal = cart.reduce((acc, i) => acc + (i.product.basePrice || i.product.price) * i.quantity, 0);

  const handleSubmitGuestOrder = () => {
    if (cart.length === 0) return;

    // Create or select table order and route items
    const created = createOrderForTable('t-04');
    cart.forEach(item => {
      addItemToOrder(item.product.id, item.product.portionVolume, [], [], 'Seat 1', 'Starters');
    });

    setIsSubmitted(true);
    showToast(`Order successfully sent to Kitchen & Bar pass for ${tableLabel}!`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 font-sans text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col h-[90vh] overflow-hidden relative">
        {/* Mobile Guest App Simulation Top Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1 font-mono">
                <span>ServOS Digital QR Menu</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-[10px] text-amber-400 font-mono font-bold">{tableLabel}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-white">Order Sent to Kitchen!</h2>
            <p className="text-xs text-slate-400 font-mono max-w-xs">
              Your order has been routed to our Kitchen & Bar pass. Your items will be served directly to {tableLabel}.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl font-mono shadow-md"
            >
              Return to Menu
            </button>
          </div>
        ) : (
          <>
            {/* Category Filter Pills */}
            <div className="p-3 bg-slate-900 border-b border-slate-800/80 flex gap-1.5 overflow-x-auto shrink-0 font-mono text-[11px]">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredProducts.map(prod => {
                const inCart = cart.find(i => i.product.id === prod.id);
                return (
                  <div
                    key={prod.id}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-100">{prod.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{prod.description || ''}</p>
                      <span className="text-xs font-bold text-amber-400 font-mono mt-1 block">
                        KES {(prod.basePrice || prod.price).toLocaleString()}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {inCart ? (
                        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 font-mono text-xs">
                          <button
                            onClick={() => removeFromCart(prod.id)}
                            className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center font-bold"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-amber-400 px-1">{inCart.quantity}</span>
                          <button
                            onClick={() => addToCart(prod)}
                            className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(prod)}
                          className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold font-mono transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cart & Checkout Footer Drawer */}
            {cart.length > 0 && (
              <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3 shrink-0 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold uppercase text-[10px]">GUEST CART ({cart.length} ITEMS)</span>
                  <span className="text-amber-400 font-bold text-sm">KES {cartTotal.toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Your Name (Optional)"
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-amber-500"
                  />
                  <select
                    value={paymentOption}
                    onChange={e => setPaymentOption(e.target.value as any)}
                    className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-amber-500"
                  >
                    <option value="ADD_TO_TABLE">Add to Table Bill</option>
                    <option value="PAY_MPESA_NOW">Pay at the cashier</option>
                  </select>
                </div>

                <button
                  onClick={handleSubmitGuestOrder}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Order to Kitchen (KES {cartTotal.toLocaleString()})</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
