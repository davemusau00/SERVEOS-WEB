import React, { useState } from 'react';
import { useServOS } from '../../context/ServOSContext';
import { Outlet } from '../../types/servos';
import { 
  Settings, 
  Building, 
  ShieldCheck, 
  Sliders, 
  Printer, 
  Smartphone, 
  FileText, 
  Save, 
  CheckCircle2, 
  Check, 
  X, 
  Lock, 
  Server, 
  Globe, 
  Layers,
  Sparkles,
  Key,
  Users
} from 'lucide-react';

export const SettingsCenterView: React.FC = () => {
  const { currentProperty, updateProperty, outlets, addOutlet, updateOutlet, currentOutlet, edgeDevices, showToast } = useServOS();
  const [activeTab, setActiveTab] = useState<'PROPERTIES' | 'ROLES_PERMISSIONS' | 'FISCAL_ETIMS' | 'PAYMENT_GATEWAYS' | 'PRINTERS_KDS'>('PROPERTIES');

  // Property Details Edit Form state
  const [propertyNameInput, setPropertyNameInput] = useState<string>(currentProperty.name);
  const [kraPinInput, setKraPinInput] = useState<string>(currentProperty.kraPin || 'P051239841A');
  const [etimsSerialInput, setEtimsSerialInput] = useState<string>(currentProperty.etimsCuSerialNumber || 'KRA-CU-98214301');
  const [currencyInput, setCurrencyInput] = useState<string>(currentProperty.currency || 'KES');

  // New Outlet Form State
  const [isAddOutletOpen, setIsAddOutletOpen] = useState<boolean>(false);
  const [newOutletName, setNewOutletName] = useState<string>('');
  const [newOutletType, setNewOutletType] = useState<Outlet['type']>('BAR');
  const [newOutletCode, setNewOutletCode] = useState<string>('');

  // Role permissions matrix state
  const [permissionsMatrix, setPermissionsMatrix] = useState({
    server: {
      createOrder: true,
      modifyOrder: true,
      sendKds: true,
      acceptMpesa: true,
      acceptCash: true,
      processRefund: false,
      applyDiscountMax5: true,
      applyDiscountOver5: false,
      adjustStock: false,
      viewAccounting: false
    },
    manager: {
      createOrder: true,
      modifyOrder: true,
      sendKds: true,
      acceptMpesa: true,
      acceptCash: true,
      processRefund: true,
      applyDiscountMax5: true,
      applyDiscountOver5: true,
      adjustStock: true,
      viewAccounting: true
    },
    admin: {
      createOrder: true,
      modifyOrder: true,
      sendKds: true,
      acceptMpesa: true,
      acceptCash: true,
      processRefund: true,
      applyDiscountMax5: true,
      applyDiscountOver5: true,
      adjustStock: true,
      viewAccounting: true
    }
  });

  const toggleServerPerm = (key: keyof typeof permissionsMatrix.server) => {
    setPermissionsMatrix(prev => ({
      ...prev,
      server: {
        ...prev.server,
        [key]: !prev.server[key]
      }
    }));
  };

  const handleSaveSettings = () => {
    showToast('Property settings & role matrix updated across all edge nodes!', 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px] font-bold tracking-wider uppercase border border-slate-700">
              SYSTEM CONFIGURATION
            </span>
            <span className="text-slate-400 text-xs font-mono">Multi-Property & Edge Infrastructure</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
            <span>Settings & Organization Hub</span>
          </h1>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-slate-850 p-1 rounded-xl border border-slate-750 text-xs font-mono overflow-x-auto">
          <button
            onClick={() => setActiveTab('PROPERTIES')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap ${
              activeTab === 'PROPERTIES' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Properties & Outlets
          </button>
          <button
            onClick={() => setActiveTab('ROLES_PERMISSIONS')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap ${
              activeTab === 'ROLES_PERMISSIONS' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            RBAC & Roles
          </button>
          <button
            onClick={() => setActiveTab('FISCAL_ETIMS')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap ${
              activeTab === 'FISCAL_ETIMS' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            eTIMS & Taxes
          </button>
          <button
            onClick={() => setActiveTab('PAYMENT_GATEWAYS')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-bold whitespace-nowrap ${
              activeTab === 'PAYMENT_GATEWAYS' ? 'bg-slate-750 text-amber-300 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Manual M-Pesa
          </button>
        </div>
      </div>

      {/* Main Settings Content */}
      {activeTab === 'PROPERTIES' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-amber-400" />
                <span>Primary Property & Branch Settings</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Grand Hospitality Holdings Ltd • Active Property ID: {currentProperty.id}</p>
            </div>

            <button
              onClick={() => {
                updateProperty({
                  name: propertyNameInput,
                  kraPin: kraPinInput,
                  etimsCuSerialNumber: etimsSerialInput,
                  currency: currencyInput
                });
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Update Property Details</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Property Form */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider text-amber-400">
                Property Master Identity & Tax Config
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Property / Branch Display Name</label>
                  <input
                    type="text"
                    value={propertyNameInput}
                    onChange={e => setPropertyNameInput(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">KRA PIN Number</label>
                    <input
                      type="text"
                      value={kraPinInput}
                      onChange={e => setKraPinInput(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono uppercase text-amber-300"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 block mb-1">eTIMS CU Serial Number</label>
                    <input
                      type="text"
                      value={etimsSerialInput}
                      onChange={e => setEtimsSerialInput(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-emerald-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Functional Currency</label>
                    <select
                      value={currencyInput}
                      onChange={e => setCurrencyInput(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                    >
                      <option value="KES">KES (Kenyan Shilling)</option>
                      <option value="USD">USD (US Dollar)</option>
                      <option value="EUR">EUR (Euro)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Timezone</label>
                    <input
                      type="text"
                      readOnly
                      value={currentProperty.timezone || 'Africa/Nairobi'}
                      className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-2 text-xs font-mono text-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Outlets List & Management */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider text-amber-400">
                  Configured Outlets ({outlets.length})
                </h3>
                <button
                  onClick={() => setIsAddOutletOpen(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors"
                >
                  + Add Outlet
                </button>
              </div>

              <div className="space-y-2">
                {outlets.map(out => (
                  <div
                    key={out.id}
                    className="p-3 bg-slate-850 border border-slate-750 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{out.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-800 text-amber-300 rounded font-bold">
                          {out.type}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">Code: {out.code}</span>
                    </div>

                    <button
                      onClick={() => {
                        const newName = prompt(`Rename outlet "${out.name}":`, out.name);
                        if (newName && newName.trim()) {
                          updateOutlet(out.id, { name: newName.trim() });
                        }
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs rounded font-bold transition-colors"
                    >
                      Rename
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD OUTLET MODAL */}
      {isAddOutletOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Create New Outlet / Station</h3>
              <button onClick={() => setIsAddOutletOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Outlet Name</label>
                <input
                  type="text"
                  placeholder="e.g. Poolside Cabana Bar"
                  value={newOutletName}
                  onChange={e => setNewOutletName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Outlet Type</label>
                  <select
                    value={newOutletType}
                    onChange={e => setNewOutletType(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
                  >
                    <option value="BAR">Bar / Lounge</option>
                    <option value="RESTAURANT">Dining Restaurant</option>
                    <option value="KITCHEN">Kitchen / Food Prep</option>
                    <option value="STORE">Depot Store</option>
                    <option value="ROOM_SERVICE">In-Room Dining</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Outlet Code</label>
                  <input
                    type="text"
                    placeholder="OUT-POOL"
                    value={newOutletCode}
                    onChange={e => setNewOutletCode(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono uppercase text-amber-300"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddOutletOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newOutletName.trim()) return;
                  addOutlet({
                    propertyId: currentProperty.id,
                    name: newOutletName.trim(),
                    type: newOutletType,
                    code: newOutletCode || `OUT-${Math.floor(100 + Math.random() * 900)}`
                  });
                  setNewOutletName('');
                  setNewOutletCode('');
                  setIsAddOutletOpen(false);
                }}
                className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors"
              >
                Create Outlet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROLES & PERMISSIONS TAB */}
      {activeTab === 'ROLES_PERMISSIONS' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-400" />
                <span>Role & Permission Security Matrix (RBAC)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Define operational authorities for servers, cashiers, supervisors & administrators</p>
            </div>

            <button
              onClick={handleSaveSettings}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Apply RBAC Rules</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-900">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                  <th className="p-3.5">Permission Capability</th>
                  <th className="p-3.5 text-center">Server / Bartender</th>
                  <th className="p-3.5 text-center">Operations Manager</th>
                  <th className="p-3.5 text-center">Executive Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {[
                  { key: 'createOrder', label: 'Create & Send POS Order Tickets' },
                  { key: 'modifyOrder', label: 'Modify Open Check Items' },
                  { key: 'acceptMpesa', label: 'Accept manually confirmed M-Pesa' },
                  { key: 'acceptCash', label: 'Accept Cash & Open Drawer' },
                  { key: 'processRefund', label: 'Issue Itemized Refund / Credit Note' },
                  { key: 'applyDiscountMax5', label: 'Apply Discount <= 5%' },
                  { key: 'applyDiscountOver5', label: 'Override Discount > 5% / VIP Comp' },
                  { key: 'adjustStock', label: 'Perform Stock Variance Adjustment' },
                  { key: 'viewAccounting', label: 'Access Double-Entry Journal & P&L' }
                ].map(item => {
                  const sVal = permissionsMatrix.server[item.key as keyof typeof permissionsMatrix.server];
                  const mVal = permissionsMatrix.manager[item.key as keyof typeof permissionsMatrix.manager];
                  const aVal = permissionsMatrix.admin[item.key as keyof typeof permissionsMatrix.admin];

                  return (
                    <tr key={item.key} className="hover:bg-slate-850/50">
                      <td className="p-3.5 font-bold text-white">{item.label}</td>

                      {/* Server Toggle */}
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => toggleServerPerm(item.key as any)}
                          className={`w-6 h-6 rounded-md border inline-flex items-center justify-center transition-colors ${
                            sVal ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-500'
                          }`}
                        >
                          {sVal ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        </button>
                      </td>

                      {/* Manager */}
                      <td className="p-3.5 text-center">
                        <span className="w-6 h-6 rounded-md bg-emerald-500/20 border border-emerald-500 text-emerald-300 inline-flex items-center justify-center">
                          <Check className="w-4 h-4" />
                        </span>
                      </td>

                      {/* Admin */}
                      <td className="p-3.5 text-center">
                        <span className="w-6 h-6 rounded-md bg-emerald-500/20 border border-emerald-500 text-emerald-300 inline-flex items-center justify-center">
                          <Check className="w-4 h-4" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ETIMS & TAXES */}
      {activeTab === 'FISCAL_ETIMS' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              <span>Kenya Revenue Authority (KRA) eTIMS Parameters</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3.5 bg-slate-850 border border-slate-750 rounded-xl space-y-1">
                <span className="text-slate-400 block">KRA Taxpayer PIN:</span>
                <span className="text-amber-400 font-bold text-sm">P051239841Z</span>
              </div>
              <div className="p-3.5 bg-slate-850 border border-slate-750 rounded-xl space-y-1">
                <span className="text-slate-400 block">eTIMS OSCU Control Unit Serial:</span>
                <span className="text-emerald-400 font-bold text-sm">KRA-OSCU-99418240</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT GATEWAYS */}
      {activeTab === 'PAYMENT_GATEWAYS' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              <span>Manual M-Pesa configuration</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-3.5 bg-slate-850 border border-slate-750 rounded-xl space-y-1">
                <span className="text-slate-400 block">Till / Paybill Number:</span>
                <span className="text-white font-bold text-sm">684920</span>
              </div>
              <div className="p-3.5 bg-slate-850 border border-slate-750 rounded-xl space-y-1">
                <span className="text-slate-400 block">Manual review window:</span>
                <span className="text-amber-300 font-bold text-sm">45 Seconds</span>
              </div>
              <div className="p-3.5 bg-slate-850 border border-slate-750 rounded-xl space-y-1">
                <span className="text-slate-400 block">Manual payout budget:</span>
                <span className="text-emerald-400 font-bold text-sm">KES 450,000</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
