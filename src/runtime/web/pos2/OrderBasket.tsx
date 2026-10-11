import React from 'react';
import {Minus, Plus, Trash2, X, Tag, Package, HelpCircle} from 'lucide-react';
import type {BusinessRecord} from '../session';

interface OrderLine {
  id: string;
  productId: string;
  quantity: number;
  portionId?: string;
  modifierIds: string[];
  note?: string;
  courseName?: string;
}

interface OrderBasketProps {
  lines: OrderLine[];
  products: BusinessRecord[];
  totalMinor: number;
  onQuantityChange: (lineId: string, quantity: number) => void;
  onLineRemove: (lineId: string) => void;
  onLineUpdate: (lineId: string, updates: Partial<OrderLine>) => void;
  onPayClick: () => void;
  disabled?: boolean;
  className?: string;
export function OrderBasket({
  lines,
  products,
  totalMinor,
  onQuantityChange,
  onLineRemove,
  onLineUpdate,
  onPayClick,
  disabled = false,
  className = ''
}: OrderBasketProps) {
  const formatMoney = (minor: number) => 
    (minor / 100).toLocaleString('en-KE', {style: 'currency', currency: 'KES'});

  const getProduct = (productId: string) => 
    products.find(p => p.id === productId);

  const getPortion = (product: BusinessRecord, portionId?: string) => {
    if (!portionId) return null;
    const portions = Array.isArray(product.data.portions) ? product.data.portions : [];
    return portions.find(p => p.id === portionId) || null;
  };

  const getModifiers = (product: BusinessRecord, modifierIds: string[]) => {
    const modifiers = Array.isArray(product.data.modifiers) ? product.data.modifiers : [];
    return modifiers.filter(m => modifierIds.includes(m.id));
  };

  const calculateLineTotal = (line: OrderLine) => {
    const product = getProduct(line.productId);
    if (!product) return 0;
    
    const portion = getPortion(product, line.portionId);
    const basePrice = portion?.priceMinor ?? product.data.priceMinor ?? 0;
    const modifiers = getModifiers(product, line.modifierIds);
    const modifierTotal = modifiers.reduce((sum, m) => sum + (m.priceDeltaMinor ?? 0), 0);
    
    return (basePrice + modifierTotal) * line.quantity;
  };

return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Basket Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
        <h3 className="font-semibold text-white">Basket ({lines.length})</h3>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={() => lines.forEach(l => onLineRemove(l.id))}
            className="text-xs text-slate-400 hover:text-rose-400"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Order Lines */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {lines.map((line, index) => {
          const product = getProduct(line.productId);
          const portion = product ? getPortion(product, line.portionId) : null;
          const modifiers = product ? getModifiers(product, line.modifierIds) : [];
          const lineTotal = calculateLineTotal(line);
          const unitPrice = lineTotal / line.quantity;

          return (
            <div key={line.id} className="bg-slate-900 border border-slate-700 rounded-xl p-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-slate-400 font-mono tabular-nums">#{index + 1}</span>
                    <h4 className="font-medium text-white truncate">{product?.data.name || 'Unknown Product'}</h4>
                    {portion && (
                      <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300">
                        {portion.name || portion.id}
                      </span>
                    )}
                    {modifiers.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-xs bg-sky-500/20 text-sky-300">
                        {modifiers.map(m => m.name).join(', ')}
                      </span>
                    )}
                  </div>

                  {(line.note || line.courseName) && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      {line.courseName && (
                        <span className="px-2 py-0.5 rounded bg-slate-800">
                          <Tag className="h-3 w-3 inline mr-1" />
                          {line.courseName}
                        </span>
                      )}
                      {line.note && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 flex items-center gap-1">
                          <HelpCircle className="h-3 w-3" />
                          {line.note}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => onQuantityChange(line.id, Math.max(1, line.quantity - 1))}
                        disabled={disabled || line.quantity <= 1}
                        className="px-3 py-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="px-4 py-1.5 font-mono tabular-nums text-white bg-slate-800 border-x border-slate-700">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onQuantityChange(line.id, line.quantity + 1)}
                        disabled={disabled}
                        className="px-3 py-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <span className="font-mono tabular-nums text-amber-300 whitespace-nowrap">
                      {formatMoney(lineTotal)}
                    </span>

                    <button
                      type="button"
                      onClick={() => onLineRemove(line.id)}
                      disabled={disabled}
                      className="ml-auto p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded disabled:opacity-50"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total & Pay */}
      <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium text-white">Total</span>
          <span className="text-2xl font-bold text-amber-300 tabular-nums">
            {formatMoney(totalMinor)}
          </span>
        </div>

        <button
          type="button"
          onClick={onPayClick}
          disabled={disabled || lines.length === 0}
          className="w-full py-4 rounded-xl bg-amber-400 text-slate-950 font-bold text-xl hover:bg-amber-300 active:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Pay {formatMoney(totalMinor)}
        </button>
      </div>
    </div>
  );
}
  if (lines.length === 0) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
          <Package className="h-16 w-16 mb-4 opacity-30" />
          <h3 className="text-lg font-medium mb-2">No items in basket</h3>
          <p className="text-sm text-center max-w-xs">Tap products from the catalog to add them here</p>
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <button
            type="button"
            onClick={onPayClick}
            disabled={disabled || lines.length === 0}
            className="w-full py-3 rounded-lg bg-slate-800 text-slate-500 font-bold text-lg disabled:opacity-50"
          >
            {formatMoney(totalMinor)} &mdash; Pay
          </button>
        </div>
      </div>
    );
  }
}
