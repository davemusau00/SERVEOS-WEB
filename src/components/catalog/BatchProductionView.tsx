import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { 
  Boxes, 
  FlaskConical, 
  Plus, 
  CheckCircle, 
  AlertTriangle, 
  Scale, 
  TrendingDown, 
  RotateCw, 
  Calendar, 
  Clock, 
  Layers,
  ArrowRight
} from 'lucide-react';

interface SubRecipe {
  id: string;
  name: string;
  category: 'KITCHEN_SAUCE' | 'BAR_PREMIX' | 'BAKERY_BASE' | 'MEAT_MARINADE';
  baseUnit: string;
  standardBatchVolume: number; // e.g. 10 Liters
  rawIngredients: { name: string; requiredQty: number; unit: string }[];
  lastBatchYieldPct: number;
}

export const BatchProductionView: React.FC = () => {
  const { showToast } = useServOS();
  const [activeTab, setActiveTab] = useState<'BATCH_RUN' | 'RECIPE_TEMPLATES' | 'HISTORY'>('BATCH_RUN');

  const [subRecipes] = useState<SubRecipe[]>([
    {
      id: 'sr-01',
      name: 'House Smoked BBQ Glaze',
      category: 'KITCHEN_SAUCE',
      baseUnit: 'Liters',
      standardBatchVolume: 15,
      rawIngredients: [
        { name: 'Tomato Paste Concentrate', requiredQty: 5, unit: 'Kg' },
        { name: 'Brown Molasses Sugar', requiredQty: 2, unit: 'Kg' },
        { name: 'Apple Cider Vinegar', requiredQty: 3, unit: 'Liters' },
        { name: 'Smoked Hickory Essence', requiredQty: 0.5, unit: 'Liters' }
      ],
      lastBatchYieldPct: 96.5
    },
    {
      id: 'sr-02',
      name: 'Signature Passion-Ginger Cocktail Premix',
      category: 'BAR_PREMIX',
      baseUnit: 'Liters',
      standardBatchVolume: 20,
      rawIngredients: [
        { name: 'Fresh Passion Fruit Pulp', requiredQty: 8, unit: 'Kg' },
        { name: 'Ginger Root Extract', requiredQty: 2, unit: 'Liters' },
        { name: 'Cane Sugar Syrup (65 Brix)', requiredQty: 5, unit: 'Liters' }
      ],
      lastBatchYieldPct: 98.0
    },
    {
      id: 'sr-03',
      name: 'Aged Burger Patty Seasoning Blend',
      category: 'MEAT_MARINADE',
      baseUnit: 'Kg',
      standardBatchVolume: 10,
      rawIngredients: [
        { name: 'Coarse Sea Salt Flakes', requiredQty: 4, unit: 'Kg' },
        { name: 'Cracked Black Peppercorns', requiredQty: 3, unit: 'Kg' },
        { name: 'Garlic Granules', requiredQty: 3, unit: 'Kg' }
      ],
      lastBatchYieldPct: 100.0
    }
  ]);

  const [selectedSubRecipeId, setSelectedSubRecipeId] = useState<string>(subRecipes[0].id);
  const selectedRecipe = subRecipes.find(r => r.id === selectedSubRecipeId) || subRecipes[0];

  // Batch production input state
  const [targetBatchMultiplier, setTargetBatchMultiplier] = useState<number>(1);
  const [actualYield, setActualYield] = useState<number>(selectedRecipe.standardBatchVolume);
  const [productionNotes, setProductionNotes] = useState<string>('');

  const expectedYield = selectedRecipe.standardBatchVolume * targetBatchMultiplier;
  const yieldVariancePct = expectedYield > 0 ? (actualYield / expectedYield) * 100 : 100;

  const handleExecuteBatchRun = () => {
    showToast(
      `Batch manufacturing complete! Stock deducted for raw materials & ${actualYield} ${selectedRecipe.baseUnit} of ${selectedRecipe.name} added to inventory.`,
      'success'
    );
  };

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-950 font-sans text-slate-100 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <FlaskConical className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Batch Prep & Sub-Recipe Studio
              <span className="px-2.5 py-0.5 text-[10px] font-mono bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                PRODUCTION RUN
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Manufacture central kitchen sauces, bar premixes, dough bases & track yield variance
            </p>
          </div>
        </div>

        {/* Tab switches */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-xs">
          <button
            onClick={() => setActiveTab('BATCH_RUN')}
            className={`px-3.5 py-2 rounded-lg font-bold transition-all ${
              activeTab === 'BATCH_RUN' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Execute Prep Run
          </button>
          <button
            onClick={() => setActiveTab('RECIPE_TEMPLATES')}
            className={`px-3.5 py-2 rounded-lg font-bold transition-all ${
              activeTab === 'RECIPE_TEMPLATES' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sub-Recipe Catalog ({subRecipes.length})
          </button>
        </div>
      </div>

      {activeTab === 'BATCH_RUN' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Recipe Selection & Raw Ingredient Calculation (Cols 7) */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase font-mono mb-2">
                SELECT SUB-RECIPE TO MANUFACTURE
              </label>
              <select
                value={selectedSubRecipeId}
                onChange={e => {
                  setSelectedSubRecipeId(e.target.value);
                  const r = subRecipes.find(x => x.id === e.target.value);
                  if (r) setActualYield(r.standardBatchVolume);
                }}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-bold text-white outline-none focus:border-amber-500 font-mono"
              >
                {subRecipes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.standardBatchVolume} {r.baseUnit} standard batch)
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Multiplier Slider */}
            <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl space-y-3 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase">BATCH MULTIPLIER SCALE</span>
                <span className="text-amber-400 font-bold text-sm">{targetBatchMultiplier}x Batch</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={targetBatchMultiplier}
                onChange={e => {
                  const mult = Number(e.target.value);
                  setTargetBatchMultiplier(mult);
                  setActualYield(selectedRecipe.standardBatchVolume * mult);
                }}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0.5x (Half)</span>
                <span>1.0x (Standard)</span>
                <span>2.0x (Double)</span>
                <span>5.0x (Bulk)</span>
              </div>
            </div>

            {/* Required Raw Ingredient Deductions */}
            <div>
              <h3 className="text-xs font-bold text-slate-300 uppercase font-mono mb-3 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-400" />
                Raw Ingredients to Deplete from Inventory:
              </h3>
              <div className="space-y-2 font-mono text-xs">
                {selectedRecipe.rawIngredients.map((ing, idx) => {
                  const required = ing.requiredQty * targetBatchMultiplier;
                  return (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between"
                    >
                      <span className="text-slate-200 font-bold">{ing.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-lg font-bold">
                          {required} {ing.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Actual Yield Input & Execution (Cols 5) */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 flex flex-col justify-between">
            <div className="space-y-4 font-mono">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-400" />
                Prep Run Yield Audit
              </h3>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">EXPECTED YIELD OUTPUT</span>
                  <span className="text-base font-bold text-white">
                    {expectedYield} {selectedRecipe.baseUnit}
                  </span>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block uppercase mb-1 font-bold">
                    ACTUAL MEASURED YIELD
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={actualYield}
                      onChange={e => setActualYield(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-750 rounded-xl text-amber-300 font-bold text-lg outline-none focus:border-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-400">{selectedRecipe.baseUnit}</span>
                  </div>
                </div>

                {/* Yield Variance Calculation */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Yield Efficiency:</span>
                  <span className={`font-bold px-2 py-0.5 rounded ${
                    yieldVariancePct >= 95
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {yieldVariancePct.toFixed(1)}% Efficiency
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block uppercase mb-1 font-bold">
                  PREP NOTES / EXPIRY DATE BATCH CODE
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Batch #BBQ-2026-0923 prepared by Chef Joseph. Exp: 7 Days."
                  value={productionNotes}
                  onChange={e => setProductionNotes(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              onClick={handleExecuteBatchRun}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-mono rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Record Batch & Update Inventory</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {subRecipes.map(r => (
            <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 font-mono text-xs">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">{r.name}</h3>
                  <span className="text-[10px] text-slate-500 uppercase">{r.category}</span>
                </div>
                <span className="px-2 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-lg font-bold">
                  {r.standardBatchVolume} {r.baseUnit}
                </span>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold block">INGREDIENTS FORMULA:</span>
                {r.rawIngredients.map((ing, i) => (
                  <div key={i} className="flex justify-between text-slate-300 text-[11px]">
                    <span>• {ing.name}</span>
                    <span className="text-amber-400 font-bold">{ing.requiredQty} {ing.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
