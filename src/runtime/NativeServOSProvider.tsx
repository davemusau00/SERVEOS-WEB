import React, { useState } from 'react';
import { ServOSContext, type ServOSContextType } from '../context/ServOSContext';
import { ROLE_DEFINITIONS, type Order, type UserRole } from '../types/servos';
import { useRuntime } from './RuntimeProvider';

export const NativeServOSProvider = ({ children }: { children: React.ReactNode }) => {
  const runtime = useRuntime()!;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [outletId, setOutletId] = useState('main');
  const [toast, setToast] = useState<ServOSContextType['toast']>(null);
  const records = runtime.snapshot!.records;
  const list = (collection: string) => records.filter(r => r.collection === collection && !r.archived).map(r => r.data);
  const one = (collection: string) => list(collection)[0];
  const showToast: ServOSContextType['showToast'] = (message, type = 'info') => setToast({ message, type, id: Date.now() });
  const run = async (operation: string, payload: Record<string, unknown>) => {
    try { return await runtime.command(operation, payload); }
    catch (e) { showToast(String(e), 'error'); return null; }
  };
  const save = async (collection: string, data: Record<string, unknown>, id?: string) => {
    const existing = records.find(r => r.collection === collection && r.id === id);
    try {
      await runtime.command('record.save', { collection, id: id || crypto.randomUUID(), data: { ...existing?.data, ...data } }, existing?.version);
      showToast('Saved locally; synchronization pending.', 'success'); return true;
    } catch (e) { showToast(String(e), 'error'); return false; }
  };
  const archive = async (collection: string, id: string) => {
    const existing = records.find(r => r.collection === collection && r.id === id);
    try { await runtime.command('record.archive', { collection, id }, existing?.version); showToast('Archived locally.', 'success'); return true; }
    catch (e) { showToast(String(e), 'error'); return false; }
  };
  const unavailable = () => showToast('This workflow is not yet implemented in the installed backend. No changes were made.', 'error');
  const orders = list('orders');
  const currentUser = list('employees').find(e => e.id === runtime.session!.staffId) || { id: runtime.session!.staffId, name: runtime.session!.name, role: runtime.session!.role.toUpperCase() };
  const role = runtime.session!.role as UserRole;
  const createOrder = async (payload: Record<string, unknown>) => {
    const result = await run('order.create', { ...payload, outletId });
    if (!result) return null;
    setActiveId(result.recordIds[0]);
    return result.recordIds[0];
  };
  const mutate = (operation: string, payload: Record<string, unknown>) => run(operation, payload).then(Boolean);
  const createPurchaseOrder = (supplierId: string, items: { stockItemId: string; quantity: number; unitPrice: number }[]) => {
    void run('purchaseOrder.create', {
      supplierId,
      items: items.map(item => ({ stockItemId: item.stockItemId, quantityOrdered: item.quantity, unitPrice: item.unitPrice })),
    });
  };
  const value = {
    userRole: role, userPermissions: ROLE_DEFINITIONS[role], availableRoles: [],
    setUserRole: unavailable, switchUserRole: () => void runtime.lock(),
    isTabAllowed: (tab: string) => ROLE_DEFINITIONS[role].allowedTabs.includes(tab),
    organization: one('organization'), currentProperty: one('property'),
    updateProperty: (data: Record<string, unknown>) => save('property', data, 'property'),
    outlets: list('outlets'), currentOutlet: list('outlets').find(o => o.id === outletId) || one('outlets'),
    setCurrentOutlet: (o: { id: string }) => setOutletId(o.id),
    addOutlet: (data: Record<string, unknown>) => save('outlets', data),
    updateOutlet: (id: string, data: Record<string, unknown>) => save('outlets', data, id),
    terminals: [{ id: runtime.snapshot!.terminalId, name: 'POS terminal', isEdgeConnected: false }],
    currentTerminal: { id: runtime.snapshot!.terminalId, name: 'POS terminal', isEdgeConnected: false },
    currentUser, setCurrentUser: unavailable, employees: list('employees'),
    addEmployee: unavailable, updateEmployee: unavailable, deleteEmployee: unavailable,
    leaveRequests: list('leaveRequests'), shiftSchedules: list('shiftSchedules'), payrollRuns: list('payrollRuns'), salaryAdvances: list('salaryAdvances'),
    submitLeaveRequest: unavailable, approveLeaveRequest: unavailable, rejectLeaveRequest: unavailable,
    clockInShift: unavailable, clockOutShift: unavailable, createShiftSchedule: unavailable,
    requestSalaryAdvance: unavailable, approveSalaryAdvance: unavailable, generatePayrollRun: unavailable, approvePayrollRun: unavailable, disbursePayrollRun: unavailable,
    stockItems: list('stockItems'), stockLocations: list('stockLocations'), stockMovements: list('stockMovements'), products: list('products'),
    addProduct: (data: Record<string, unknown>) => save('products', data),
    updateProduct: (id: string, data: Record<string, unknown>) => save('products', data, id),
    deleteProduct: (id: string) => archive('products', id),
    addStockItem: (data: Record<string, unknown>) => save('stockItems', data),
    updateStockItem: (id: string, data: Record<string, unknown>) => save('stockItems', data, id),
    deleteStockItem: (id: string) => archive('stockItems', id),
    transferStock: (stockItemId: string, locationId: string, toLocationId: string, quantity: number, reason: string) => mutate('inventory.transfer', { stockItemId, locationId, toLocationId, quantity, reason }),
    declareWaste: (stockItemId: string, locationId: string, quantity: number, reason: string) => mutate('inventory.waste', { stockItemId, locationId, quantity, reason }),
    recordStockCountAdjustment: (stockItemId: string, locationId: string, countedQty: number, reason: string) => mutate('inventory.adjust', { stockItemId, locationId, countedQty, reason }),
    tables: list('tables'), addTable: (data: Record<string, unknown>) => save('tables', data),
    updateTable: (id: string, data: Record<string, unknown>) => save('tables', data, id), deleteTable: (id: string) => archive('tables', id),
    orders, activeOrder: orders.find(o => o.id === activeId) || null,
    createOrderForTable: (tableId: string) => createOrder({ tableId }), createQuickBarTab: (name: string) => createOrder({ name }), selectOrder: setActiveId,
    addItemToOrder: (productId: string, portionVolume?: number, modifiers?: unknown[], selectedMixers?: string[], seatLabel?: string, courseName?: string) => {
      if (!activeId) { showToast('Open or select an order first.', 'error'); return; }
      if (portionVolume || modifiers?.length || selectedMixers?.length) { showToast('Portion and modifier commands are not yet implemented. No item was added.', 'error'); return; }
      void run('order.addItem', { orderId: activeId, productId, seatLabel, courseName });
    },
    removeItemFromOrder: (itemId: string) => void run('order.removeItem', { orderId: activeId, itemId }),
    sendOrderToKitchenAndBar: () => void run('order.fire', { orderId: activeId }),
    fireHeldCourse: (courseName: string) => void run('order.fire', { orderId: activeId, courseName }),
    updateItemSeatAndCourse: unavailable, applyCompToItem: unavailable, applyOrderDiscount: unavailable,
    voidOrder: (orderId: string, reason: string) => void run('order.void', { orderId, reason }),
    transferOrderToTable: (orderId: string, targetTableId: string) => void run('order.transfer', { orderId, targetTableId }),
    bumpKdsTicket: (orderId: string) => void run('order.kds', { orderId, status: 'READY' }), recallKdsTicket: (orderId: string) => void run('order.kds', { orderId, status: 'PREPARING' }),
    processPayment: async (orderId: string, tenderType: string, amount: number, options?: Record<string, unknown>) => {
      const result = await run('payment.record', { orderId, method: tenderType, amount, ...options });
      if (!result) return { success: false, message: 'Payment was not recorded. Check the displayed error.' };
      return { success: true, message: tenderType === 'MPESA' ? 'Manually confirmed — awaiting reconciliation. Saved locally.' : 'Payment recorded locally. Synchronization pending.', receipt: (options?.mpesa as { code?: string })?.code || result.commandId };
    },
    tillSession: list('tillSessions').find(t => t.status === 'OPEN') || null,
    openTillSession: (floatAmount: number) => void run('till.open', { floatAmount }),
    closeTillSession: (countedCash: number) => void run('till.close', { tillId: list('tillSessions').find(t => t.status === 'OPEN')?.id, countedCash }),
    recordCashPaidInOut: unavailable,
    accounts: list('accounts'), journalEntries: list('journalEntries'), etimsInvoices: [],
    hotelRooms: list('rooms'), guestStays: list('guestStays'), guestFolios: list('guestFolios'),
    updateRoomStatus: unavailable, postMinibarConsumption: unavailable, settleGuestFolio: unavailable,
    suppliers: list('suppliers'), purchaseOrders: list('purchaseOrders'),
    receivePurchaseOrder: () => showToast('Open Procurement > Receive delivery and record delivered and rejected quantities. No stock change was made.', 'info'),
    createPurchaseOrder,
    anomalyAlerts: list('anomalyAlerts'), approvalRequests: list('approvalRequests'), acknowledgeAlert: unavailable, resolveAlert: unavailable, handleApproval: unavailable,
    isOffline: !navigator.onLine, toggleOfflineMode: () => showToast('Connectivity is detected automatically. Local saving is always enabled.'),
    offlineQueueCount: runtime.snapshot!.pendingCount, syncOfflineQueue: runtime.sync,
    edgeDevices: [], lastEdgeEvent: null, updateEdgeDeviceStatus: unavailable, reconnectAllEdgeDevices: unavailable,
    triggerEdgePrint: () => window.print(), triggerCashDrawerKick: () => showToast('No cash drawer adapter configured. Open the drawer manually.'),
    traceEvidence: (query: string) => { const order = orders.find(o => o.orderNumber === query || o.id === query); return order ? { type: 'ORDER', order } : { type: 'NONE' }; },
    toast, showToast, closeToast: () => setToast(null),
  } as unknown as ServOSContextType;
  return <ServOSContext.Provider value={value}>{children}</ServOSContext.Provider>;
};
