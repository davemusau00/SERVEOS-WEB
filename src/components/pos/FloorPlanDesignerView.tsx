import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { RestaurantTable } from '../../types/servos';
import { isNative, useRuntime } from '../../runtime/RuntimeProvider';
import { 
  LayoutGrid, 
  Plus, 
  Save, 
  RotateCw, 
  Trash2, 
  Move, 
  Sparkles, 
  Users, 
  DollarSign, 
  Check, 
  AlertCircle,
  Eye,
  Sliders,
  Layers,
  Square
} from 'lucide-react';

interface CustomTableLayout extends RestaurantTable {
  shape?: 'SQUARE' | 'RECTANGLE' | 'ROUND' | 'BAR_TOP';
  posX?: number; // 0-100 percentage grid
  posY?: number; // 0-100 percentage grid
  minimumSpendKes?: number;
  assignedServerName?: string;
  assignedServerId?: string;
  isJoinable?: boolean;
}

export const FloorPlanDesignerView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { tables: allTables, showToast, currentOutlet, currentProperty, employees } = useServOS();
  const runtime = useRuntime();
  const tables = allTables.filter(t => t.outletId === currentOutlet.id);
  const [baseline] = useState(() => runtime?.snapshot?.records.filter(r => r.collection === 'tables' && !r.archived && r.data.outletId === currentOutlet.id).map(r => ({ id: r.id, version: r.version })) || []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [selectedSection, setSelectedSection] = useState<string>('MAIN_DECK');
  const [editingTableId, setEditingTableId] = useState<string | null>(tables[0]?.id || null);

  // Layout state initialized with context tables
  const [layoutTables, setLayoutTables] = useState<CustomTableLayout[]>(() =>
    tables.map((t, index) => ({
      ...t,
      shape: (t as CustomTableLayout).shape || (t.capacity <= 2 ? 'ROUND' : t.capacity >= 8 ? 'RECTANGLE' : 'SQUARE'),
      posX: (t as CustomTableLayout).posX ?? (index % 4) * 22 + 5,
      posY: (t as CustomTableLayout).posY ?? Math.min(90, Math.floor(index / 4) * 25 + 10),
      minimumSpendKes: t.minimumSpend || 0,
      assignedServerName: (t as CustomTableLayout).assignedServerName || 'Unassigned',
      isJoinable: (t as CustomTableLayout).isJoinable ?? t.capacity <= 4
    }))
  );

  const selectedTable = layoutTables.find(t => t.id === editingTableId);

  const handleAddTable = (shape: 'SQUARE' | 'RECTANGLE' | 'ROUND' | 'BAR_TOP', capacity: number) => {
    const newId = crypto.randomUUID();
    const newLabel = `${layoutTables.length + 1}`;
    const newTable: CustomTableLayout = {
      id: newId,
      propertyId: currentProperty.id,
      outletId: currentOutlet.id,
      label: newLabel,
      capacity,
      section: selectedSection as any,
      state: 'AVAILABLE',
      shape,
      posX: 10 + (layoutTables.length % 3) * 25,
      posY: Math.min(90, 10 + Math.floor(layoutTables.length / 3) * 20),
      minimumSpendKes: 0,
      assignedServerName: 'Unassigned',
      isJoinable: capacity <= 4
    };

    setLayoutTables(prev => [...prev, newTable]);
    setEditingTableId(newId);
    setSaveError('');
  };

  const handleUpdateTableProps = (updatedFields: Partial<CustomTableLayout>) => {
    if (!editingTableId) return;
    setLayoutTables(prev =>
      prev.map(t => (t.id === editingTableId ? { ...t, ...updatedFields } : t))
    );
  };

  const handleDeleteTable = (id: string) => {
    if (layoutTables.find(t => t.id === id)?.currentOrderId) { setSaveError('Close or transfer the active order before removing this table.'); return; }
    setLayoutTables(prev => prev.filter(t => t.id !== id));
    if (editingTableId === id) setEditingTableId(null);
  };

  const handleSaveLayout = async () => {
    if (saving) return;
    if (!isNative) { setSaveError('This is a sample layout. Saving requires the installed application.'); return; }
    setSaving(true); setSaveError('');
    try {
      await runtime.command('floorplan.save', { outletId: currentOutlet.id, baseline, tables: layoutTables.map(t => ({ ...t, minimumSpend: t.minimumSpendKes || 0 })) });
      showToast('Layout saved locally; synchronization pending.', 'success'); onClose();
    } catch (error) { setSaveError(String(error)); }
    finally { setSaving(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Floorplan designer" className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col font-sans text-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="px-4 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Interactive Floor Plan Studio
              <span className="px-2 py-0.5 text-[10px] font-mono bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                EDITOR MODE
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Edit table placement and capacity for {currentOutlet.name}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded-xl font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveLayout}
            disabled={saving}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/10 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving…' : 'Save layout'}</span>
          </button>
        </div>
      </div>

      {saveError && <p role="alert" className="p-3 text-sm text-red-300 bg-red-950/40">{saveError}</p>}
      {/* Main Workspace Layout */}
      <div className={`flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-auto ${saving ? 'pointer-events-none opacity-70' : ''}`} aria-busy={saving}>
        {/* Left Toolbar: Add Objects & Section Selector (Cols 3) */}
        <div className="lg:col-span-3 border-r border-slate-800 bg-slate-900/60 p-4 space-y-6 lg:overflow-y-auto font-mono text-xs">
          {/* Section Selector */}
          <div>
            <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">
              SELECT SECTION CANVAS
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { id: 'MAIN_DECK', name: 'Main Dining Deck' },
                { id: 'VIP_LOUNGE', name: 'VIP Lounge & Cabanas' },
                { id: 'TERRACE', name: 'Outdoor Terrace & Bar' },
                { id: 'GRILL_ROOM', name: 'Private Grill Room' }
              ].map(sec => (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSection(sec.id)}
                  className={`p-2.5 rounded-xl border text-left font-bold transition-all flex items-center justify-between ${
                    selectedSection === sec.id
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>{sec.name}</span>
                  <Layers className="w-3.5 h-3.5 opacity-60" />
                </button>
              ))}
            </div>
          </div>

          {/* Preset Table Palette */}
          <div>
            <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">
              ADD PRESET TABLES
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddTable('ROUND', 2)}
                className="p-3 bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl flex flex-col items-center gap-1 text-slate-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-full border-2 border-amber-400/60 flex items-center justify-center text-[10px] font-bold">
                  2p
                </div>
                <span className="text-[10px]">Round 2-Seat</span>
              </button>

              <button
                onClick={() => handleAddTable('SQUARE', 4)}
                className="p-3 bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl flex flex-col items-center gap-1 text-slate-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg border-2 border-amber-400/60 flex items-center justify-center text-[10px] font-bold">
                  4p
                </div>
                <span className="text-[10px]">Square 4-Seat</span>
              </button>

              <button
                onClick={() => handleAddTable('RECTANGLE', 8)}
                className="p-3 bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl flex flex-col items-center gap-1 text-slate-200 transition-colors"
              >
                <div className="w-12 h-8 rounded border-2 border-amber-400/60 flex items-center justify-center text-[10px] font-bold">
                  8p
                </div>
                <span className="text-[10px]">Rect 8-Seat</span>
              </button>

              <button
                onClick={() => handleAddTable('BAR_TOP', 1)}
                className="p-3 bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl flex flex-col items-center gap-1 text-slate-200 transition-colors"
              >
                <div className="w-10 h-6 bg-amber-500/20 border border-amber-500/40 rounded flex items-center justify-center text-[10px] font-bold">
                  Bar
                </div>
                <span className="text-[10px]">Bar Stool</span>
              </button>
            </div>
          </div>

          {/* Instructions Card */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 space-y-1.5 text-[11px]">
            <span className="text-amber-400 font-bold block">💡 Designer Tip:</span>
            <p>Click any table on the center canvas to drag its grid position, edit its server zone or minimum spend requirements.</p>
          </div>
        </div>

        {/* Center Canvas (Cols 6) */}
        <div className="lg:col-span-6 min-h-[450px] bg-slate-950 p-6 flex flex-col justify-between overflow-hidden relative border-r border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              Live Canvas Grid — {selectedSection}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {layoutTables.filter(t => t.section === selectedSection).length} Tables Placed
            </span>
          </div>

          {/* Interactive Grid Canvas Container */}
          <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-2xl relative overflow-hidden grid-bg my-2">
            {layoutTables
              .filter(t => t.section === selectedSection)
              .map(table => {
                const isSelected = table.id === editingTableId;

                return (
                  <button
                    key={table.id}
                    aria-label={`Edit table ${table.label}`}
                    onClick={() => setEditingTableId(table.id)}
                    style={{
                      left: `${table.posX}%`,
                      top: `${table.posY}%`
                    }}
                    className={`absolute p-3 cursor-pointer transition-transform hover:scale-105 select-none flex flex-col items-center justify-center ${
                      table.shape === 'ROUND'
                        ? 'rounded-full'
                        : table.shape === 'BAR_TOP'
                        ? 'rounded-md'
                        : 'rounded-xl'
                    } ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold border-2 border-amber-300 shadow-xl shadow-amber-500/20'
                        : 'bg-slate-800/90 border border-slate-700 text-white'
                    }`}
                  >
                    <span className="text-xs font-mono font-bold">
                      T-{table.label}
                    </span>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-slate-900' : 'text-slate-400'}`}>
                      {table.capacity}p
                    </span>

                    {table.minimumSpendKes && table.minimumSpendKes > 0 ? (
                      <span className={`text-[8px] font-mono px-1 rounded mt-0.5 ${isSelected ? 'bg-slate-950 text-amber-400' : 'bg-amber-500/20 text-amber-300'}`}>
                        KES {table.minimumSpendKes / 1000}k min
                      </span>
                    ) : null}
                  </button>
                );
              })}
          </div>

          {/* Canvas Footer Bar */}
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-2 border-t border-slate-800/80">
            <span>Position is a percentage of the floor</span>
            <span>Capacity Totals: {layoutTables.reduce((acc, t) => acc + t.capacity, 0)} Seats</span>
          </div>
        </div>

        {/* Right Inspector Drawer (Cols 3) */}
        <div className="lg:col-span-3 bg-slate-900/60 p-5 space-y-5 lg:overflow-y-auto font-mono text-xs">
          {selectedTable ? (
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" />
                  Table {selectedTable.label} Inspector
                </span>
                <button
                  onClick={() => handleDeleteTable(selectedTable.id)}
                  className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-500/30 rounded-lg transition-colors"
                  title="Remove Table"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase mb-1">TABLE LABEL / NUMBER</label>
                  <input
                    type="text"
                    value={selectedTable.label}
                    onChange={e => handleUpdateTableProps({ label: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase mb-1">SEAT CAPACITY</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={selectedTable.capacity}
                      onChange={e => handleUpdateTableProps({ capacity: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase mb-1">SHAPE</label>
                    <select
                      value={selectedTable.shape || 'SQUARE'}
                      onChange={e => handleUpdateTableProps({ shape: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-amber-500"
                    >
                      <option value="SQUARE">Square</option>
                      <option value="ROUND">Round</option>
                      <option value="RECTANGLE">Rectangle</option>
                      <option value="BAR_TOP">Bar Top</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(['posX', 'posY'] as const).map(axis => <label key={axis} className="text-slate-400">{axis === 'posX' ? 'Horizontal position (%)' : 'Vertical position (%)'}<input type="number" min="0" max="100" value={selectedTable[axis] ?? 0} onChange={event => handleUpdateTableProps({ [axis]: Number(event.target.value) })} className="w-full p-2 mt-1 bg-slate-950 border border-slate-800 rounded text-white" /></label>)}
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase mb-1">ASSIGNED SERVER ZONE</label>
                  <select
                    value={selectedTable.assignedServerId || ''}
                    onChange={e => handleUpdateTableProps({ assignedServerId: e.target.value, assignedServerName: employees.find(employee => employee.id === e.target.value)?.name || 'Unassigned' })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-amber-500"
                  >
                    <option value="">Unassigned</option>
                    {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[10px] uppercase mb-1">MINIMUM SPEND REQUIREMENT (KES)</label>
                  <input
                    type="number"
                    step="1000"
                    value={selectedTable.minimumSpendKes || 0}
                    onChange={e => handleUpdateTableProps({ minimumSpendKes: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-400 font-bold outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                  <input
                    type="checkbox"
                    id="joinableCheck"
                    checked={selectedTable.isJoinable || false}
                    onChange={e => handleUpdateTableProps({ isJoinable: e.target.checked })}
                    className="rounded border-slate-800 text-amber-500 focus:ring-0"
                  />
                  <label htmlFor="joinableCheck" className="text-slate-300 text-xs cursor-pointer">
                    Joinable Table for Large Parties
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 text-xs font-mono">
              Click any table on the canvas to configure its properties
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
