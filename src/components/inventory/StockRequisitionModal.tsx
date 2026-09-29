import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  Boxes, 
  ArrowRightLeft, 
  CheckCircle, 
  AlertTriangle, 
  X, 
  Plus, 
  Send, 
  Clock, 
  ShieldCheck, 
  Building2 
} from 'lucide-react';

export const StockRequisitionModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ 
  isOpen, 
  onClose 
}) => {
  const { stockItems, showToast } = useServOS();
  const [sourceLocation, setSourceLocation] = useState<string>('Central Wine & Spirits Cellar');
  const [targetLocation, setTargetLocation] = useState<string>('Rooftop VIP Cocktail Bar');

  const [requestedItems, setRequestedItems] = useState<
    { stockItemId: string; name: string; requestedQty: number; unit: string }[]
  >([
    {
      stockItemId: stockItems[0]?.id || 'st-01',
      name: stockItems[0]?.name || 'Johnnie Walker Black Label 750ml',
      requestedQty: 12,
      unit: 'Bottles'
    },
    {
      stockItemId: stockItems[1]?.id || 'st-02',
      name: stockItems[1]?.name || 'Tanqueray London Dry Gin 1L',
      requestedQty: 6,
      unit: 'Bottles'
    }
  ]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    const nextItem = stockItems[requestedItems.length % stockItems.length];
    if (nextItem) {
      setRequestedItems(prev => [
        ...prev,
        { stockItemId: nextItem.id, name: nextItem.name, requestedQty: 6, unit: 'Bottles' }
      ]);
    }
  };

  const handleRemoveItem = (idx: number) => {
    setRequestedItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitRequisition = () => {
    showToast(
      `Internal Store Requisition submitted to ${sourceLocation} for dispatch to ${targetLocation}!`,
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 font-sans text-slate-100">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
                Internal Store Requisition & Transfer
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Transfer liquor, ingredients & supplies between Central Cellar and sub-outlets
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <div className="p-6 space-y-5 overflow-y-auto font-mono text-xs">
          {/* Source & Destination Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                DISPATCH SOURCE STORE
              </label>
              <select
                value={sourceLocation}
                onChange={e => setSourceLocation(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold outline-none focus:border-amber-500"
              >
                <option value="Central Wine & Spirits Cellar">Central Wine & Spirits Cellar</option>
                <option value="Main Kitchen Bulk Dry Store">Main Kitchen Bulk Dry Store</option>
                <option value="Cold Storage Unit #2">Cold Storage Unit #2</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                DESTINATION OUTLET STORE
              </label>
              <select
                value={targetLocation}
                onChange={e => setTargetLocation(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold outline-none focus:border-amber-500"
              >
                <option value="Rooftop VIP Cocktail Bar">Rooftop VIP Cocktail Bar</option>
                <option value="Terrace Poolside Bar">Terrace Poolside Bar</option>
                <option value="Grill Room Kitchen Pass">Grill Room Kitchen Pass</option>
              </select>
            </div>
          </div>

          {/* Line Items Requisition Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-bold">
                REQUISITIONED STOCK ITEMS
              </span>
              <button
                onClick={handleAddItem}
                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>

            <div className="space-y-2">
              {requestedItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-white block truncate">{item.name}</span>
                    <span className="text-[10px] text-slate-500">Unit: {item.unit}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={item.requestedQty}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setRequestedItems(prev =>
                          prev.map((i, index) => (index === idx ? { ...i, requestedQty: val } : i))
                        );
                      }}
                      className="w-20 px-2.5 py-1 bg-slate-900 border border-slate-750 rounded-lg text-amber-300 font-bold outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3 font-mono text-xs">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitRequisition}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/10"
          >
            <Send className="w-4 h-4" />
            <span>Submit Transfer Request</span>
          </button>
        </div>
      </div>
    </div>
  );
};
