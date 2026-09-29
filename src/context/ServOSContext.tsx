/**
 * ServOS - Central State & Domain Engine
 * Implements: Double-entry posting, immutable inventory ledger,
 * Legacy browser preview, offline synchronization,
 * Hotel Folios, Control Engine rules & North Star evidence trail.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Organization,
  Property,
  Outlet,
  Terminal,
  StockItem,
  StockMovement,
  StockLocation,
  ProductSellable,
  RestaurantTable,
  Order,
  OrderItem,
  PaymentRecord,
  TillSession,
  Account,
  JournalEntry,
  JournalLine,
  EtimsFiscalInvoice,
  HotelRoom,
  GuestStay,
  GuestFolio,
  FolioEntry,
  Supplier,
  PurchaseOrder,
  Employee,
  StaffLeaveRequest,
  ShiftSchedule,
  PayrollRun,
  EmployeePayslip,
  SalaryAdvance,
  AnomalyAlert,
  ApprovalRequest,
  EdgeDevice,
  EdgeDeviceStatus,
  EdgeDeviceType,
  OfflineOperation,
  OfflineOperationStatus,
  OfflineOperationType,
  UserRole,
  RolePermissions,
  ROLE_DEFINITIONS
} from '../types/servos';
import {
  initOfflineDb,
  enqueueOfflineOperation,
  getOfflineOperations,
  updateOfflineOperationStatus,
  cacheCatalogOffline,
  logSyncEvent
} from '../utils/offlineDb';

type MutationResult = void | Promise<boolean>;

export interface ServOSContextType {
  // Authentication & Role Permissions
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  switchUserRole: (role: UserRole) => void;
  userPermissions: RolePermissions;
  isTabAllowed: (tabId: string) => boolean;
  availableRoles: UserRole[];

  // Tenancy
  organization: Organization;
  currentProperty: Property;
  updateProperty: (updates: Partial<Property>) => void;
  outlets: Outlet[];
  addOutlet: (outlet: Omit<Outlet, 'id'>) => void;
  updateOutlet: (id: string, updates: Partial<Outlet>) => void;
  currentOutlet: Outlet;
  setCurrentOutlet: (outlet: Outlet) => void;
  terminals: Terminal[];
  currentTerminal: Terminal;
  currentUser: Employee;
  setCurrentUser: (emp: Employee) => void;
  employees: Employee[];
  addEmployee: (emp: Omit<Employee, 'id'>) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  leaveRequests: StaffLeaveRequest[];
  submitLeaveRequest: (req: Omit<StaffLeaveRequest, 'id' | 'requestedAt' | 'status'>) => void;
  approveLeaveRequest: (requestId: string, reviewNotes?: string) => void;
  rejectLeaveRequest: (requestId: string, reason: string) => void;
  shiftSchedules: ShiftSchedule[];
  clockInShift: (shiftId: string) => void;
  clockOutShift: (shiftId: string) => void;
  createShiftSchedule: (schedule: Omit<ShiftSchedule, 'id'>) => void;
  payrollRuns: PayrollRun[];
  generatePayrollRun: (period: string) => void;
  approvePayrollRun: (payrollId: string) => void;
  disbursePayrollRun: (payrollId: string) => void;
  salaryAdvances: SalaryAdvance[];
  requestSalaryAdvance: (employeeId: string, amount: number, reason: string) => void;
  approveSalaryAdvance: (advanceId: string) => void;

  // Catalog & Inventory
  stockItems: StockItem[];
  addStockItem: (item: Omit<StockItem, 'id'>) => MutationResult;
  updateStockItem: (id: string, updates: Partial<StockItem>) => MutationResult;
  deleteStockItem: (id: string) => MutationResult;
  stockLocations: StockLocation[];
  stockMovements: StockMovement[];
  products: ProductSellable[];
  addProduct: (product: Omit<ProductSellable, 'id'>) => MutationResult;
  updateProduct: (id: string, updates: Partial<ProductSellable>) => MutationResult;
  deleteProduct: (id: string) => MutationResult;
  transferStock: (
    stockItemId: string,
    fromLocId: string,
    toLocId: string,
    quantity: number,
    reason: string
  ) => MutationResult;
  declareWaste: (
    stockItemId: string,
    locationId: string,
    quantity: number,
    reason: string
  ) => MutationResult;
  recordStockCountAdjustment: (
    stockItemId: string,
    locationId: string,
    countedQty: number,
    notes: string
  ) => MutationResult;

  // Tables & POS
  tables: RestaurantTable[];
  addTable: (table: Omit<RestaurantTable, 'id'>) => void;
  updateTable: (id: string, updates: Partial<RestaurantTable>) => void;
  deleteTable: (id: string) => void;
  activeOrder: Order | null;
  orders: Order[];
  createOrderForTable: (tableId: string) => Order | Promise<string | null>;
  createQuickBarTab: (tabName?: string) => Order | Promise<string | null>;
  selectOrder: (orderId: string) => void;
  addItemToOrder: (
    productId: string,
    portionVolume?: number,
    modifiers?: { modifierId: string; name: string; priceDelta: number }[],
    selectedMixers?: string[],
    seatLabel?: string,
    courseName?: 'Drinks' | 'Starters' | 'Mains' | 'Dessert'
  ) => void;
  removeItemFromOrder: (itemId: string) => void;
  updateItemSeatAndCourse: (
    itemId: string,
    seatLabel?: string,
    courseName?: 'Drinks' | 'Starters' | 'Mains' | 'Dessert',
    courseStatus?: 'HELD' | 'FIRED'
  ) => void;
  fireHeldCourse: (courseName: 'Drinks' | 'Starters' | 'Mains' | 'Dessert') => void;
  sendOrderToKitchenAndBar: () => void;
  applyCompToItem: (itemId: string, reason: string) => void;
  applyOrderDiscount: (discountPct: number, reason: string) => void;
  voidOrder: (orderId: string, reason: string) => void;
  transferOrderToTable: (orderId: string, newTableId: string) => void;
  bumpKdsTicket: (orderId: string) => void;
  recallKdsTicket: (orderId: string) => void;

  // In-app Toast notifications
  toast: { message: string; type: 'success' | 'info' | 'error'; id: number } | null;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  closeToast: () => void;

  // Payments & Cash Drawer
  processPayment: (
    orderId: string,
    tenderType: 'CASH' | 'MPESA' | 'CARD' | 'ROOM_CHARGE',
    amount: number,
    options?: {
      mpesa?: { code: string; account: string; receivedAmount: number; receivedAt: string; confirmed: boolean };
      phoneNumber?: string;
      cashTendered?: number;
      guestStayId?: string;
      cardAuthCode?: string;
    }
  ) => Promise<{ success: boolean; message: string; receipt?: string }>;
  tillSession: TillSession | null;
  openTillSession: (floatAmount: number) => void;
  closeTillSession: (countedCash: number) => void;
  recordCashPaidInOut: (type: 'IN' | 'OUT', amount: number, reason: string) => void;

  // Accounting & eTIMS
  accounts: Account[];
  journalEntries: JournalEntry[];
  etimsInvoices: EtimsFiscalInvoice[];

  // Hotel PMS
  hotelRooms: HotelRoom[];
  guestStays: GuestStay[];
  guestFolios: GuestFolio[];
  updateRoomStatus: (roomId: string, status: HotelRoom['status']) => void;
  postMinibarConsumption: (
    roomId: string,
    itemsConsumed: { stockItemId: string; qty: number }[]
  ) => void;
  settleGuestFolio: (folioId: string, tenderType: 'CASH' | 'MPESA' | 'CARD') => void;

  // Procurement
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  receivePurchaseOrder: (poId: string, receivedNotes?: string) => void;
  createPurchaseOrder: (
    supplierId: string,
    items: { stockItemId: string; quantity: number; unitPrice: number }[]
  ) => void;

  // Control Engine & Audit
  anomalyAlerts: AnomalyAlert[];
  approvalRequests: ApprovalRequest[];
  acknowledgeAlert: (alertId: string, note?: string) => void;
  resolveAlert: (alertId: string, resolutionNote: string) => void;
  handleApproval: (requestId: string, approved: boolean, reason?: string) => void;

  // Offline Mode & Edge Agent
  isOffline: boolean;
  toggleOfflineMode: () => void;
  offlineQueueCount: number;
  syncOfflineQueue: () => void;
  edgeDevices: EdgeDevice[];
  updateEdgeDeviceStatus: (deviceId: string, status: EdgeDeviceStatus, errorMessage?: string) => void;
  reconnectAllEdgeDevices: () => void;
  triggerEdgePrint: (documentType: 'RECEIPT' | 'KITCHEN_TICKET', payload: any) => void;
  triggerCashDrawerKick: () => void;
  lastEdgeEvent: string | null;

  // North Star Traceability Query
  traceEvidence: (query: string) => {
    type: 'ORDER' | 'STOCK' | 'FOLIO' | 'JOURNAL' | 'NONE';
    order?: Order;
    stockItem?: StockItem;
    movements?: StockMovement[];
    folio?: GuestFolio;
    journalEntry?: JournalEntry;
    fiscalInvoice?: EtimsFiscalInvoice;
    payment?: PaymentRecord;
  };
}

export const ServOSContext = createContext<ServOSContextType | null>(null);

// ================= INITIAL SEED DATA =================

const initialOrg: Organization = {
  id: 'org-simba-01',
  name: 'Simba Hospitality Group East Africa',
  code: 'SHG-EA',
  baseCurrency: 'KES'
};

const initialProperty: Property = {
  id: 'prop-nairobi-01',
  organizationId: 'org-simba-01',
  name: 'The Grand Nairobi Resort & Club',
  code: 'GNR-01',
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  kraPin: 'P051284920M',
  etimsCuNumber: 'KRA-OSCU-NBO-00914'
};

const initialOutlets: Outlet[] = [
  {
    id: 'out-bar-01',
    propertyId: 'prop-nairobi-01',
    name: 'Main Bar & VIP Lounge',
    type: 'BAR',
    defaultStockLocationId: 'loc-bar-store',
    active: true
  },
  {
    id: 'out-grill-01',
    propertyId: 'prop-nairobi-01',
    name: 'Kikao Grill Room',
    type: 'RESTAURANT',
    defaultStockLocationId: 'loc-kitchen-store',
    active: true
  },
  {
    id: 'out-hotel-01',
    propertyId: 'prop-nairobi-01',
    name: 'Front Desk & Concierge',
    type: 'HOTEL_FRONT',
    defaultStockLocationId: 'loc-minibar-depot',
    active: true
  },
  {
    id: 'out-pool-01',
    propertyId: 'prop-nairobi-01',
    name: 'Pool & Garden Lounge',
    type: 'POOL_LOUNGE',
    defaultStockLocationId: 'loc-bar-store',
    active: true
  }
];

const initialStockLocations: StockLocation[] = [
  { id: 'loc-warehouse', propertyId: 'prop-nairobi-01', name: 'Central Warehouse Depot', type: 'WAREHOUSE' },
  { id: 'loc-bar-store', propertyId: 'prop-nairobi-01', name: 'Main Bar Beverage Station', type: 'BAR_STORE' },
  { id: 'loc-kitchen-store', propertyId: 'prop-nairobi-01', name: 'Kitchen Coldstore & Pass', type: 'KITCHEN_STORE' },
  { id: 'loc-minibar-depot', propertyId: 'prop-nairobi-01', name: 'Housekeeping Minibar Depot', type: 'MINIBAR' }
];

const initialStockItems: StockItem[] = [
  {
    id: 'stk-jameson',
    code: 'SPIRIT-JAM-750',
    name: 'Jameson Irish Whiskey 750ml',
    dimension: 'VOLUME',
    baseUnit: 'ml',
    parLevel: 15000,
    reorderPoint: 4500,
    currentStock: {
      'loc-warehouse': 30000,
      'loc-bar-store': 4200,
      'loc-minibar-depot': 1500
    },
    averageUnitCost: 3.73, // KES 2,800 per 750ml bottle
    category: 'Spirits - Whiskey'
  },
  {
    id: 'stk-tanqueray',
    code: 'SPIRIT-TANQ-1000',
    name: 'Tanqueray London Dry Gin 1000ml',
    dimension: 'VOLUME',
    baseUnit: 'ml',
    parLevel: 20000,
    reorderPoint: 5000,
    currentStock: {
      'loc-warehouse': 25000,
      'loc-bar-store': 6800,
      'loc-minibar-depot': 2000
    },
    averageUnitCost: 3.20, // KES 3,200 per 1000ml bottle
    category: 'Spirits - Gin'
  },
  {
    id: 'stk-dom-perignon',
    code: 'CHAMP-DOMP-750',
    name: 'Dom Pérignon Vintage Champagne 750ml',
    dimension: 'VOLUME',
    baseUnit: 'ml',
    parLevel: 7500,
    reorderPoint: 2250,
    currentStock: {
      'loc-warehouse': 9000,
      'loc-bar-store': 2250,
      'loc-minibar-depot': 750
    },
    averageUnitCost: 50.66, // KES 38,000 per 750ml bottle
    category: 'Wine & Champagne'
  },
  {
    id: 'stk-tusker',
    code: 'BEER-TUSK-500',
    name: 'Tusker Lager Bottle 500ml',
    dimension: 'COUNT',
    baseUnit: 'unit',
    parLevel: 240,
    reorderPoint: 60,
    currentStock: {
      'loc-warehouse': 480,
      'loc-bar-store': 96,
      'loc-minibar-depot': 48
    },
    averageUnitCost: 180.00,
    category: 'Beer & Cider'
  },
  {
    id: 'stk-guinness-keg',
    code: 'KEG-GUINN-50L',
    name: 'Guinness Keg 50L (50,000ml)',
    dimension: 'VOLUME',
    baseUnit: 'ml',
    parLevel: 100000,
    reorderPoint: 40000,
    currentStock: {
      'loc-warehouse': 100000,
      'loc-bar-store': 42500
    },
    averageUnitCost: 0.33, // KES 16,500 per 50L
    category: 'Draught Beer'
  },
  {
    id: 'stk-tonic',
    code: 'MIXER-TONIC-200',
    name: 'Schweppes Tonic Water Can 200ml',
    dimension: 'COUNT',
    baseUnit: 'unit',
    parLevel: 300,
    reorderPoint: 72,
    currentStock: {
      'loc-warehouse': 600,
      'loc-bar-store': 120,
      'loc-minibar-depot': 60
    },
    averageUnitCost: 80.00,
    category: 'Mixers'
  },
  {
    id: 'stk-lime',
    code: 'PRODUCE-LIME',
    name: 'Fresh Limes (Cocktail Garnish)',
    dimension: 'COUNT',
    baseUnit: 'unit',
    parLevel: 100,
    reorderPoint: 25,
    currentStock: {
      'loc-warehouse': 150,
      'loc-bar-store': 45
    },
    averageUnitCost: 15.00,
    category: 'Fresh Produce'
  },
  {
    id: 'stk-ribeye',
    code: 'MEAT-RIBEYE-KG',
    name: 'Prime Aged Beef Ribeye Steak (g)',
    dimension: 'MASS',
    baseUnit: 'g',
    parLevel: 25000,
    reorderPoint: 6000,
    currentStock: {
      'loc-warehouse': 35000,
      'loc-kitchen-store': 12000
    },
    averageUnitCost: 4.50, // KES 4,500 per kg
    category: 'Meats & Grill'
  }
];

const initialProducts: ProductSellable[] = [
  {
    id: 'prod-jam-shot',
    code: 'JAM-SHT-30',
    name: 'Jameson Shot (30ml)',
    category: 'SPIRITS',
    productType: 'PORTION',
    consumptionMethod: 'MEASURED',
    price: 450,
    taxClassId: 'A_16',
    outletIds: ['out-bar-01', 'out-grill-01', 'out-pool-01'],
    stockItemId: 'stk-jameson',
    portionVolume: 30,
    portionUnitSymbol: 'ml',
    available: true,
    routeTo: 'BAR'
  },
  {
    id: 'prod-jam-double',
    code: 'JAM-DBL-60',
    name: 'Jameson Double (60ml)',
    category: 'SPIRITS',
    productType: 'PORTION',
    consumptionMethod: 'MEASURED',
    price: 850,
    taxClassId: 'A_16',
    outletIds: ['out-bar-01', 'out-grill-01', 'out-pool-01'],
    stockItemId: 'stk-jameson',
    portionVolume: 60,
    portionUnitSymbol: 'ml',
    available: true,
    routeTo: 'BAR'
  },
  {
    id: 'prod-jam-bottle',
    code: 'JAM-BTL-750',
    name: 'Jameson Bottle 750ml',
    category: 'SPIRITS',
    productType: 'STOCK_ITEM',
    consumptionMethod: 'MEASURED',
    price: 9500,
    taxClassId: 'A_16',
    outletIds: ['out-bar-01', 'out-grill-01'],
    stockItemId: 'stk-jameson',
    portionVolume: 750,
    portionUnitSymbol: 'ml',
    available: true,
    routeTo: 'BAR'
  },
  {
    id: 'prod-tanq-gt',
    code: 'CKTL-TANQ-GT',
    name: 'Tanqueray Classic G&T',
    category: 'COCKTAIL',
    productType: 'RECIPE',
    consumptionMethod: 'RECIPE',
    price: 850,
    taxClassId: 'A_16',
    outletIds: ['out-bar-01', 'out-grill-01', 'out-pool-01'],
    recipeIngredients: [
      { stockItemId: 'stk-tanqueray', quantity: 60, unitSymbol: 'ml', tracked: true },
      { stockItemId: 'stk-tonic', quantity: 1, unitSymbol: 'can', tracked: true },
      { stockItemId: 'stk-lime', quantity: 0.5, unitSymbol: 'ea', tracked: true }
    ],
    modifiers: [
      {
        id: 'mod-extra-gin',
        name: 'Extra 30ml Gin Shot',
        priceDelta: 300,
        ingredientAdjustments: [{ stockItemId: 'stk-tanqueray', quantityDelta: 30 }]
      },
      {
        id: 'mod-no-lime',
        name: 'Hold the Lime',
        priceDelta: 0,
        ingredientAdjustments: [{ stockItemId: 'stk-lime', quantityDelta: -0.5 }]
      },
      {
        id: 'mod-extra-tonic',
        name: 'Extra Tonic Can',
        priceDelta: 120,
        ingredientAdjustments: [{ stockItemId: 'stk-tonic', quantityDelta: 1 }]
      }
    ],
    available: true,
    routeTo: 'BAR'
  },
  {
    id: 'prod-tusker-500',
    code: 'BEER-TUSK-500',
    name: 'Tusker Lager (500ml)',
    category: 'BEER',
    productType: 'STOCK_ITEM',
    consumptionMethod: 'UNIT',
    price: 400,
    taxClassId: 'A_16',
    outletIds: ['out-bar-01', 'out-grill-01', 'out-pool-01'],
    stockItemId: 'stk-tusker',
    available: true,
    routeTo: 'BAR'
  },
  {
    id: 'prod-guinness-pint',
    code: 'DRT-GUINN-500',
    name: 'Guinness Draught Pint (500ml)',
    category: 'BEER',
    productType: 'PORTION',
    consumptionMethod: 'MEASURED',
    price: 500,
    taxClassId: 'A_16',
    outletIds: ['out-bar-01', 'out-grill-01'],
    stockItemId: 'stk-guinness-keg',
    portionVolume: 500,
    portionUnitSymbol: 'ml',
    available: true,
    routeTo: 'BAR'
  },
  {
    id: 'prod-dom-vip-pkg',
    code: 'PKG-DOMP-VIP',
    name: 'Dom Pérignon VIP Bottle Service',
    category: 'PACKAGE',
    productType: 'PACKAGE',
    consumptionMethod: 'RECIPE',
    price: 58000,
    taxClassId: 'A_16',
    outletIds: ['out-bar-01'],
    recipeIngredients: [
      { stockItemId: 'stk-dom-perignon', quantity: 750, unitSymbol: 'ml', tracked: true },
      { stockItemId: 'stk-tonic', quantity: 4, unitSymbol: 'can', tracked: true }
    ],
    packageMixersCount: 4,
    available: true,
    routeTo: 'BAR'
  },
  {
    id: 'prod-ribeye-300',
    code: 'FOOD-RIBEYE-300',
    name: 'Aged Prime Ribeye Steak (300g)',
    category: 'FOOD',
    productType: 'RECIPE',
    consumptionMethod: 'MEASURED',
    price: 3400,
    taxClassId: 'A_16',
    outletIds: ['out-grill-01', 'out-bar-01'],
    recipeIngredients: [
      { stockItemId: 'stk-ribeye', quantity: 300, unitSymbol: 'g', tracked: true }
    ],
    available: true,
    routeTo: 'KITCHEN'
  }
];

const initialStockMovements: StockMovement[] = [
  {
    id: 'mvt-1001',
    organizationId: 'org-simba-01',
    propertyId: 'prop-nairobi-01',
    stockItemId: 'stk-jameson',
    stockItemName: 'Jameson Irish Whiskey 750ml',
    locationId: 'loc-bar-store',
    locationName: 'Main Bar Beverage Station',
    quantityDelta: 3750, // 5 bottles transferred in
    baseUnit: 'ml',
    movementType: 'TRANSFER_IN',
    sourceType: 'TRANSFER',
    sourceId: 'TRF-0081',
    occurredAt: '2026-09-23T01:30:00Z',
    actorUserId: 'emp-storekeeper',
    actorName: 'Peter Kamau (Storekeeper)',
    unitCostSnapshot: 3.73,
    totalCostValuation: 13987.50
  },
  {
    id: 'mvt-1002',
    organizationId: 'org-simba-01',
    propertyId: 'prop-nairobi-01',
    stockItemId: 'stk-tanqueray',
    stockItemName: 'Tanqueray London Dry Gin 1000ml',
    locationId: 'loc-bar-store',
    locationName: 'Main Bar Beverage Station',
    quantityDelta: -60, // 1 G&T served
    baseUnit: 'ml',
    movementType: 'SALE_CONSUMPTION',
    sourceType: 'ORDER',
    sourceId: 'ORD-9018',
    occurredAt: '2026-09-23T02:15:00Z',
    actorUserId: 'emp-bartender',
    actorName: 'David Omondi (Bartender)',
    unitCostSnapshot: 3.20,
    totalCostValuation: 192.00
  },
  {
    id: 'mvt-1003',
    organizationId: 'org-simba-01',
    propertyId: 'prop-nairobi-01',
    stockItemId: 'stk-jameson',
    stockItemName: 'Jameson Irish Whiskey 750ml',
    locationId: 'loc-bar-store',
    locationName: 'Main Bar Beverage Station',
    quantityDelta: -90, // Spillage during shaker break
    baseUnit: 'ml',
    movementType: 'WASTE',
    sourceType: 'WASTE_EVENT',
    sourceId: 'WST-0012',
    reasonCode: 'Spillage / broken jigger',
    occurredAt: '2026-09-23T02:40:00Z',
    actorUserId: 'emp-bartender',
    actorName: 'David Omondi (Bartender)',
    unitCostSnapshot: 3.73,
    totalCostValuation: 335.70
  }
];

const initialAccounts: Account[] = [
  { id: 'acc-1010', code: '1010', name: 'Cash on Hand (Till Drawers)', type: 'ASSET', balance: 45000 },
  { id: 'acc-1020', code: '1020', name: 'M-PESA Clearing Settlement', type: 'ASSET', balance: 285400 },
  { id: 'acc-1030', code: '1030', name: 'Card Settlement Clearing', type: 'ASSET', balance: 192000 },
  { id: 'acc-1100', code: '1100', name: 'Guest Accounts Receivable (Folios)', type: 'ASSET', balance: 78500 },
  { id: 'acc-1200', code: '1200', name: 'Inventory Asset (F&B Stock)', type: 'ASSET', balance: 642100 },
  { id: 'acc-2010', code: '2010', name: 'Accounts Payable (Trade Suppliers)', type: 'LIABILITY', balance: 145000 },
  { id: 'acc-2050', code: '2050', name: 'Guest Advance Deposit Liability', type: 'LIABILITY', balance: 50000 },
  { id: 'acc-2100', code: '2100', name: 'Output VAT Payable (16%)', type: 'LIABILITY', balance: 68420 },
  { id: 'acc-2110', code: '2110', name: 'Catering Levy Payable (2%)', type: 'LIABILITY', balance: 8550 },
  { id: 'acc-2120', code: '2120', name: 'Payroll Statutory Withholdings (PAYE, NSSF, NHIF, Housing)', type: 'LIABILITY', balance: 42100 },
  { id: 'acc-4010', code: '4010', name: 'F&B Revenue - Beverage (Bar)', type: 'REVENUE', balance: 345000 },
  { id: 'acc-4020', code: '4020', name: 'F&B Revenue - Kitchen (Grill)', type: 'REVENUE', balance: 184000 },
  { id: 'acc-4050', code: '4050', name: 'Room Accommodation Revenue', type: 'REVENUE', balance: 450000 },
  { id: 'acc-4090', code: '4090', name: 'Minimum Spend Shortfall Revenue', type: 'REVENUE', balance: 25000 },
  { id: 'acc-5010', code: '5010', name: 'Cost of Goods Sold (COGS - Beverage)', type: 'EXPENSE', balance: 112000 },
  { id: 'acc-5020', code: '5020', name: 'Cost of Goods Sold (COGS - Kitchen)', type: 'EXPENSE', balance: 74000 },
  { id: 'acc-5050', code: '5050', name: 'Waste & Spillage Loss', type: 'EXPENSE', balance: 4200 },
  { id: 'acc-5060', code: '5060', name: 'Complimentary & VIP Promo Expense', type: 'EXPENSE', balance: 12500 },
  { id: 'acc-5080', code: '5080', name: 'Salaries, Wages & Staff Welfare Expense', type: 'EXPENSE', balance: 284000 }
];

const initialJournalEntries: JournalEntry[] = [
  {
    id: 'je-5001',
    entryNumber: 'JE-2026-0923-0001',
    propertyId: 'prop-nairobi-01',
    occurredAt: '2026-09-23T02:15:00Z',
    postedAt: '2026-09-23T02:15:01Z',
    sourceType: 'SALE',
    sourceId: 'ORD-9018',
    memo: 'Order #ORD-9018 settled via manual M-Pesa (1x Tanqueray G&T)',
    totalDebit: 1042.00,
    totalCredit: 1042.00,
    balanced: true,
    lines: [
      { id: 'jl-1', accountId: 'acc-1020', accountCode: '1020', accountName: 'M-PESA Clearing Settlement', debit: 850.00, credit: 0, description: 'M-PESA received' },
      { id: 'jl-2', accountId: 'acc-4010', accountCode: '4010', accountName: 'F&B Revenue - Beverage (Bar)', debit: 0, credit: 720.34, description: 'Net beverage revenue' },
      { id: 'jl-3', accountId: 'acc-2100', accountCode: '2100', accountName: 'Output VAT Payable (16%)', debit: 0, credit: 115.25, description: '16% Output VAT' },
      { id: 'jl-4', accountId: 'acc-2110', accountCode: '2110', accountName: 'Catering Levy Payable (2%)', debit: 0, credit: 14.41, description: '2% Catering Levy' },
      // COGS posting
      { id: 'jl-5', accountId: 'acc-5010', accountCode: '5010', accountName: 'Cost of Goods Sold (COGS - Beverage)', debit: 192.00, credit: 0, description: 'Tanqueray 60ml cost' },
      { id: 'jl-6', accountId: 'acc-1200', accountCode: '1200', accountName: 'Inventory Asset (F&B Stock)', debit: 0, credit: 192.00, description: 'Inventory depletion' }
    ]
  }
];

const initialTables: RestaurantTable[] = [
  { id: 'tbl-vip-01', propertyId: 'prop-nairobi-01', outletId: 'out-bar-01', label: 'VIP-01 (Lounge)', capacity: 8, section: 'VIP_LOUNGE', state: 'SEATED', minimumSpend: 50000 },
  { id: 'tbl-vip-02', propertyId: 'prop-nairobi-01', outletId: 'out-bar-01', label: 'VIP-02 (Lounge)', capacity: 6, section: 'VIP_LOUNGE', state: 'AVAILABLE', minimumSpend: 50000 },
  { id: 'tbl-main-04', propertyId: 'prop-nairobi-01', outletId: 'out-bar-01', label: 'Table 04', capacity: 4, section: 'MAIN_DECK', state: 'ORDERING' },
  { id: 'tbl-main-05', propertyId: 'prop-nairobi-01', outletId: 'out-bar-01', label: 'Table 05', capacity: 4, section: 'MAIN_DECK', state: 'AVAILABLE' },
  { id: 'tbl-terrace-07', propertyId: 'prop-nairobi-01', outletId: 'out-bar-01', label: 'Terrace 07', capacity: 4, section: 'TERRACE', state: 'SERVED' },
  { id: 'tbl-grill-12', propertyId: 'prop-nairobi-01', outletId: 'out-grill-01', label: 'Grill 12', capacity: 2, section: 'GRILL_ROOM', state: 'AVAILABLE' }
];

const initialHotelRooms: HotelRoom[] = [
  {
    id: 'room-101',
    roomNumber: '101',
    roomTypeId: 'rt-deluxe-king',
    roomTypeName: 'Deluxe King Suite',
    floor: 1,
    status: 'OCCUPIED',
    currentGuestStayId: 'stay-101',
    currentGuestName: 'Dr. Amina Odhiambo',
    minibarItems: [
      { stockItemId: 'stk-tusker', name: 'Tusker 500ml', expectedQty: 2, currentQty: 2, price: 450 },
      { stockItemId: 'stk-jameson', name: 'Jameson 50ml Miniature', expectedQty: 2, currentQty: 2, price: 700 },
      { stockItemId: 'stk-tonic', name: 'Tonic Water Can', expectedQty: 2, currentQty: 2, price: 150 }
    ]
  },
  {
    id: 'room-102',
    roomNumber: '102',
    roomTypeId: 'rt-deluxe-king',
    roomTypeName: 'Deluxe King Suite',
    floor: 1,
    status: 'AVAILABLE',
    minibarItems: [
      { stockItemId: 'stk-tusker', name: 'Tusker 500ml', expectedQty: 2, currentQty: 2, price: 450 },
      { stockItemId: 'stk-jameson', name: 'Jameson 50ml Miniature', expectedQty: 2, currentQty: 2, price: 700 },
      { stockItemId: 'stk-tonic', name: 'Tonic Water Can', expectedQty: 2, currentQty: 2, price: 150 }
    ]
  },
  {
    id: 'room-201',
    roomNumber: '201',
    roomTypeId: 'rt-exec-suite',
    roomTypeName: 'Executive Penthouse',
    floor: 2,
    status: 'OCCUPIED',
    currentGuestStayId: 'stay-201',
    currentGuestName: 'James Mwangi Kariuki',
    minibarItems: [
      { stockItemId: 'stk-tusker', name: 'Tusker 500ml', expectedQty: 4, currentQty: 4, price: 450 },
      { stockItemId: 'stk-jameson', name: 'Jameson 50ml Miniature', expectedQty: 2, currentQty: 2, price: 700 }
    ]
  },
  {
    id: 'room-202',
    roomNumber: '202',
    roomTypeId: 'rt-exec-suite',
    roomTypeName: 'Executive Penthouse',
    floor: 2,
    status: 'DIRTY',
    minibarItems: [
      { stockItemId: 'stk-tusker', name: 'Tusker 500ml', expectedQty: 4, currentQty: 2, price: 450 }
    ]
  },
  {
    id: 'room-301',
    roomNumber: '301',
    roomTypeId: 'rt-deluxe-twin',
    roomTypeName: 'Deluxe Twin Garden',
    floor: 3,
    status: 'CLEANING',
    minibarItems: [
      { stockItemId: 'stk-tusker', name: 'Tusker 500ml', expectedQty: 2, currentQty: 2, price: 450 }
    ]
  },
  {
    id: 'room-302',
    roomNumber: '302',
    roomTypeId: 'rt-deluxe-twin',
    roomTypeName: 'Deluxe Twin Garden',
    floor: 3,
    status: 'OUT_OF_ORDER',
    minibarItems: []
  }
];

const initialGuestStays: GuestStay[] = [
  {
    id: 'stay-101',
    reservationId: 'RES-8910',
    guestName: 'Dr. Amina Odhiambo',
    guestEmail: 'amina.odhiambo@healthcorp.co.ke',
    guestPhone: '+254 722 419 802',
    roomNumber: '101',
    roomTypeId: 'rt-deluxe-king',
    checkInDate: '2026-09-22',
    checkOutDate: '2026-09-25',
    creditLimit: 120000,
    allowRoomCharge: true,
    status: 'CHECKED_IN',
    folioId: 'fol-101'
  },
  {
    id: 'stay-201',
    reservationId: 'RES-8914',
    guestName: 'James Mwangi Kariuki',
    guestEmail: 'j.mwangi@capitaladvisors.ke',
    guestPhone: '+254 711 982 344',
    roomNumber: '201',
    roomTypeId: 'rt-exec-suite',
    checkInDate: '2026-09-21',
    checkOutDate: '2026-09-24',
    creditLimit: 250000,
    allowRoomCharge: true,
    status: 'CHECKED_IN',
    folioId: 'fol-201'
  }
];

const initialGuestFolios: GuestFolio[] = [
  {
    id: 'fol-101',
    stayId: 'stay-101',
    guestName: 'Dr. Amina Odhiambo',
    roomNumber: '101',
    totalCharges: 42000,
    totalPayments: 20000,
    balanceDue: 22000,
    isClosed: false,
    entries: [
      {
        id: 'fe-1',
        folioId: 'fol-101',
        occurredAt: '2026-09-22T14:00:00Z',
        type: 'CHARGE',
        category: 'ROOM',
        description: 'Room Charge - Deluxe King Suite (Night 1)',
        amount: 22000,
        postedBy: 'Front Desk System'
      },
      {
        id: 'fe-2',
        folioId: 'fol-101',
        occurredAt: '2026-09-22T14:10:00Z',
        type: 'PAYMENT',
        category: 'PAYMENT',
        description: 'Advance Deposit - M-PESA Receipt QHM839210K',
        amount: -20000,
        postedBy: 'Cashier Alice'
      },
      {
        id: 'fe-3',
        folioId: 'fol-101',
        occurredAt: '2026-09-22T21:30:00Z',
        type: 'CHARGE',
        category: 'F&B_BAR',
        description: 'Room Charge POS Ref #ORD-9012 (2x Tanqueray G&T)',
        amount: 1700,
        referenceId: 'ORD-9012',
        postedBy: 'Terminal POS-01'
      },
      {
        id: 'fe-4',
        folioId: 'fol-101',
        occurredAt: '2026-09-23T00:00:00Z',
        type: 'CHARGE',
        category: 'ROOM',
        description: 'Room Charge - Deluxe King Suite (Night 2)',
        amount: 22000,
        postedBy: 'Night Audit'
      },
      {
        id: 'fe-5',
        folioId: 'fol-101',
        occurredAt: '2026-09-23T02:00:00Z',
        type: 'CHARGE',
        category: 'MINIBAR',
        description: 'Minibar Consumption (2x Tusker, 1x Tonic)',
        amount: 1050,
        postedBy: 'Housekeeper Mercy'
      }
    ]
  },
  {
    id: 'fol-201',
    stayId: 'stay-201',
    guestName: 'James Mwangi Kariuki',
    roomNumber: '201',
    totalCharges: 68500,
    totalPayments: 50000,
    balanceDue: 18500,
    isClosed: false,
    entries: [
      {
        id: 'fe-201',
        folioId: 'fol-201',
        occurredAt: '2026-09-21T15:00:00Z',
        type: 'CHARGE',
        category: 'ROOM',
        description: 'Executive Penthouse (Night 1 & 2)',
        amount: 60000,
        postedBy: 'Front Desk'
      },
      {
        id: 'fe-202',
        folioId: 'fol-201',
        occurredAt: '2026-09-21T15:15:00Z',
        type: 'PAYMENT',
        category: 'PAYMENT',
        description: 'Corporate Visa Card Pre-auth Settled',
        amount: -50000,
        postedBy: 'Front Desk'
      },
      {
        id: 'fe-203',
        folioId: 'fol-201',
        occurredAt: '2026-09-22T20:15:00Z',
        type: 'CHARGE',
        category: 'F&B_KITCHEN',
        description: 'Kikao Grill Dinner Room Post #ORD-8994',
        amount: 8500,
        referenceId: 'ORD-8994',
        postedBy: 'Waiter Brian'
      }
    ]
  }
];

const initialSuppliers: Supplier[] = [
  {
    id: 'sup-kbl',
    name: 'Kenya Breweries Limited (Diageo)',
    code: 'SUP-KBL-01',
    contactPerson: 'Martin Maina',
    phone: '+254 722 000 111',
    email: 'orders.nairobi@eabl.com',
    kraPin: 'P000600123A',
    paymentTermsDays: 30
  },
  {
    id: 'sup-ead',
    name: 'East African Distillers & Wines',
    code: 'SUP-EAD-02',
    contactPerson: 'Grace Wanjiru',
    phone: '+254 733 445 566',
    email: 'supply@eadistillers.co.ke',
    kraPin: 'P051009876C',
    paymentTermsDays: 14
  }
];

const initialPurchaseOrders: PurchaseOrder[] = [
  {
    id: 'po-3041',
    poNumber: 'PO-2026-0919-01',
    supplierId: 'sup-ead',
    supplierName: 'East African Distillers & Wines',
    propertyId: 'prop-nairobi-01',
    createdAt: '2026-09-19T09:00:00Z',
    status: 'RECEIVED',
    grnNumber: 'GRN-2026-0482',
    supplierInvoiceNumber: 'INV-EAD-98421',
    approvedBy: 'Financial Controller (Hellen)',
    subtotal: 124000,
    taxTotal: 19840,
    grandTotal: 143840,
    items: [
      {
        stockItemId: 'stk-jameson',
        stockItemName: 'Jameson Irish Whiskey 750ml (Case of 12)',
        quantityOrdered: 24, // 24 bottles
        unitPrice: 2800,
        unitSymbol: 'btl',
        lineTotal: 67200,
        quantityReceived: 24,
        quantityRejected: 0
      },
      {
        stockItemId: 'stk-tanqueray',
        stockItemName: 'Tanqueray Gin 1000ml (Case of 12)',
        quantityOrdered: 12,
        unitPrice: 3200,
        unitSymbol: 'btl',
        lineTotal: 38400,
        quantityReceived: 12,
        quantityRejected: 0
      }
    ]
  }
];

const initialEmployees: Employee[] = [
  {
    id: 'emp-admin',
    code: 'EMP-ADM-01',
    name: 'Jane Muthoni',
    email: 'jane.muthoni@grandnairobi.co.ke',
    phone: '+254 722 999 000',
    role: 'ADMIN',
    department: 'General Management',
    permissions: ['all'],
    hourlyRate: 1200,
    baseSalary: 280000,
    commissionRate: 0.10,
    contractType: 'PERMANENT',
    nationalId: '19842109',
    kraPin: 'A001928374E',
    nssfNumber: 'NSSF-119283',
    nhifNumber: 'NHIF-991823',
    leaveBalance: 28,
    leaveTaken: 2,
    attendanceStatus: 'ON_DUTY',
    bankName: 'NCBA Bank Kenya',
    bankAccount: '11092837419',
    mpesaDisbursementNumber: '+254 722 999 000'
  },
  {
    id: 'emp-dave',
    code: 'EMP-01',
    name: 'David Omondi',
    email: 'david.omondi@grandnairobi.co.ke',
    phone: '+254 722 101 202',
    role: 'BARTENDER',
    department: 'Food & Beverage',
    permissions: ['order.create', 'order.send', 'payment.cash', 'payment.mpesa'],
    hourlyRate: 350,
    baseSalary: 55000,
    commissionRate: 0.05,
    contractType: 'PERMANENT',
    nationalId: '29841203',
    kraPin: 'A004819230Z',
    nssfNumber: 'NSSF-782190',
    nhifNumber: 'NHIF-451923',
    leaveBalance: 18,
    leaveTaken: 3,
    attendanceStatus: 'ON_DUTY',
    bankName: 'KCB Bank Kenya',
    bankAccount: '1102938471',
    mpesaDisbursementNumber: '+254 722 101 202'
  },
  {
    id: 'emp-alice',
    code: 'EMP-02',
    name: 'Alice Wambui',
    email: 'alice.wambui@grandnairobi.co.ke',
    phone: '+254 733 202 303',
    role: 'CASHIER',
    department: 'Finance & Admin',
    permissions: ['order.create', 'payment.cash', 'payment.mpesa', 'payment.card', 'till.open', 'till.close'],
    hourlyRate: 380,
    baseSalary: 62000,
    commissionRate: 0.02,
    contractType: 'PERMANENT',
    nationalId: '31294812',
    kraPin: 'A007419821W',
    nssfNumber: 'NSSF-891024',
    nhifNumber: 'NHIF-562910',
    leaveBalance: 15,
    leaveTaken: 6,
    attendanceStatus: 'ON_DUTY',
    bankName: 'Equity Bank Kenya',
    bankAccount: '0180293847192',
    mpesaDisbursementNumber: '+254 733 202 303'
  },
  {
    id: 'emp-mgr',
    code: 'EMP-03',
    name: 'Marcus Kiprop',
    email: 'marcus.kiprop@grandnairobi.co.ke',
    phone: '+254 711 303 404',
    role: 'MANAGER',
    department: 'General Management',
    permissions: ['order.create', 'order.void', 'discount.override', 'comp.apply', 'approval.sign', 'reports.view'],
    hourlyRate: 650,
    baseSalary: 145000,
    commissionRate: 0.08,
    contractType: 'PERMANENT',
    nationalId: '24109823',
    kraPin: 'A001298471P',
    nssfNumber: 'NSSF-410928',
    nhifNumber: 'NHIF-109283',
    leaveBalance: 21,
    leaveTaken: 0,
    attendanceStatus: 'ON_DUTY',
    bankName: 'Standard Chartered Kenya',
    bankAccount: '010049281729',
    mpesaDisbursementNumber: '+254 711 303 404'
  },
  {
    id: 'emp-frontdesk',
    code: 'EMP-04',
    name: 'Stella Njeri',
    email: 'stella.njeri@grandnairobi.co.ke',
    phone: '+254 700 404 505',
    role: 'RECEPTIONIST',
    department: 'Front Desk & Rooms',
    permissions: ['hotel.checkin', 'hotel.checkout', 'folio.charge', 'payment.all'],
    hourlyRate: 400,
    baseSalary: 58000,
    commissionRate: 0.03,
    contractType: 'PERMANENT',
    nationalId: '32918239',
    kraPin: 'A009182736K',
    nssfNumber: 'NSSF-928172',
    nhifNumber: 'NHIF-672918',
    leaveBalance: 14,
    leaveTaken: 7,
    attendanceStatus: 'ON_DUTY',
    bankName: 'Co-operative Bank',
    bankAccount: '01129384719200',
    mpesaDisbursementNumber: '+254 700 404 505'
  },
  {
    id: 'emp-chef',
    code: 'EMP-05',
    name: 'Joseph Mwangi',
    email: 'joseph.mwangi@grandnairobi.co.ke',
    phone: '+254 721 556 677',
    role: 'CHEF',
    department: 'Culinary / Kitchen',
    permissions: ['order.create', 'order.send', 'kitchen.kds'],
    hourlyRate: 550,
    baseSalary: 110000,
    commissionRate: 0.0,
    contractType: 'PERMANENT',
    nationalId: '25819203',
    kraPin: 'A003819201L',
    nssfNumber: 'NSSF-561928',
    nhifNumber: 'NHIF-381920',
    leaveBalance: 12,
    leaveTaken: 9,
    attendanceStatus: 'ON_DUTY',
    bankName: 'NCBA Bank Kenya',
    bankAccount: '1002938471',
    mpesaDisbursementNumber: '+254 721 556 677'
  },
  {
    id: 'emp-waiter',
    code: 'EMP-06',
    name: 'Kevin Otieno',
    email: 'kevin.otieno@grandnairobi.co.ke',
    phone: '+254 798 112 233',
    role: 'WAITER',
    department: 'Food & Beverage',
    permissions: ['order.create', 'order.send', 'payment.cash', 'payment.mpesa'],
    hourlyRate: 280,
    baseSalary: 42000,
    commissionRate: 0.04,
    contractType: 'CONTRACT',
    nationalId: '34192830',
    kraPin: 'A006519283M',
    nssfNumber: 'NSSF-819203',
    nhifNumber: 'NHIF-492019',
    leaveBalance: 21,
    leaveTaken: 0,
    attendanceStatus: 'ON_DUTY',
    bankName: 'Equity Bank Kenya',
    bankAccount: '029102938471',
    mpesaDisbursementNumber: '+254 798 112 233'
  },
  {
    id: 'emp-mixologist',
    code: 'EMP-07',
    name: 'Faith Mutua',
    email: 'faith.mutua@grandnairobi.co.ke',
    phone: '+254 712 998 877',
    role: 'BARTENDER',
    department: 'Food & Beverage',
    permissions: ['order.create', 'order.send', 'payment.cash', 'payment.mpesa'],
    hourlyRate: 420,
    baseSalary: 65000,
    commissionRate: 0.06,
    contractType: 'PERMANENT',
    nationalId: '30192847',
    kraPin: 'A008192837X',
    nssfNumber: 'NSSF-739102',
    nhifNumber: 'NHIF-510293',
    leaveBalance: 16,
    leaveTaken: 5,
    attendanceStatus: 'ON_DUTY',
    bankName: 'Absa Bank Kenya',
    bankAccount: '0948192837',
    mpesaDisbursementNumber: '+254 712 998 877'
  },
  {
    id: 'emp-hk',
    code: 'EMP-08',
    name: 'Mary Achieng',
    email: 'mary.achieng@grandnairobi.co.ke',
    phone: '+254 720 334 455',
    role: 'HOUSEKEEPER',
    department: 'Housekeeping',
    permissions: ['hotel.rooms', 'hotel.inspection'],
    hourlyRate: 320,
    baseSalary: 50000,
    commissionRate: 0.0,
    contractType: 'PERMANENT',
    nationalId: '27192830',
    kraPin: 'A005918273T',
    nssfNumber: 'NSSF-629102',
    nhifNumber: 'NHIF-419283',
    leaveBalance: 20,
    leaveTaken: 1,
    attendanceStatus: 'ON_DUTY',
    bankName: 'Family Bank',
    bankAccount: '05918293847',
    mpesaDisbursementNumber: '+254 720 334 455'
  }
];

const initialLeaveRequests: StaffLeaveRequest[] = [
  {
    id: 'lr-101',
    employeeId: 'emp-chef',
    employeeName: 'Joseph Mwangi',
    employeeRole: 'Executive Sous Chef',
    leaveType: 'ANNUAL',
    startDate: '2026-09-28',
    endDate: '2026-10-02',
    daysCount: 5,
    reason: 'Annual family leave; scheduled during planned low occupancy week',
    handoverColleagueId: 'emp-mgr',
    handoverColleagueName: 'Marcus Kiprop',
    status: 'PENDING',
    requestedAt: '2026-09-21T09:30:00Z'
  },
  {
    id: 'lr-102',
    employeeId: 'emp-frontdesk',
    employeeName: 'Stella Njeri',
    employeeRole: 'Receptionist',
    leaveType: 'SICK',
    startDate: '2026-09-18',
    endDate: '2026-09-19',
    daysCount: 2,
    reason: 'Medical consultation & recovery with doctor note submitted',
    handoverColleagueId: 'emp-alice',
    handoverColleagueName: 'Alice Wambui',
    status: 'APPROVED',
    requestedAt: '2026-09-17T14:15:00Z',
    reviewedBy: 'Marcus Kiprop',
    reviewedAt: '2026-09-17T16:00:00Z',
    reviewNotes: 'Doctor certificate verified'
  },
  {
    id: 'lr-103',
    employeeId: 'emp-waiter',
    employeeName: 'Kevin Otieno',
    employeeRole: 'Waiter',
    leaveType: 'COMPASSIONATE',
    startDate: '2026-09-12',
    endDate: '2026-09-14',
    daysCount: 3,
    reason: 'Bereavement leave for immediate family',
    status: 'APPROVED',
    requestedAt: '2026-09-11T11:00:00Z',
    reviewedBy: 'Marcus Kiprop',
    reviewedAt: '2026-09-11T12:00:00Z',
    reviewNotes: 'Approved per HR policy'
  },
  {
    id: 'lr-104',
    employeeId: 'emp-dave',
    employeeName: 'David Omondi',
    employeeRole: 'Bartender',
    leaveType: 'ANNUAL',
    startDate: '2026-10-05',
    endDate: '2026-10-11',
    daysCount: 7,
    reason: 'Scheduled rest and annual vacation',
    handoverColleagueId: 'emp-mixologist',
    handoverColleagueName: 'Faith Mutua',
    status: 'PENDING',
    requestedAt: '2026-09-22T16:45:00Z'
  }
];

const initialShiftSchedules: ShiftSchedule[] = [
  {
    id: 'sh-01',
    employeeId: 'emp-dave',
    employeeName: 'David Omondi',
    role: 'Bartender',
    department: 'Food & Beverage',
    date: '2026-09-23',
    dayOfWeek: 'Wednesday',
    shiftType: 'AFTERNOON',
    startTime: '15:00',
    endTime: '23:30',
    station: 'Main Bar Station A',
    status: 'CLOCKED_IN',
    clockInTime: '14:52',
    notes: 'Opening beverage cellar handover completed'
  },
  {
    id: 'sh-02',
    employeeId: 'emp-mixologist',
    employeeName: 'Faith Mutua',
    role: 'Lead Bartender',
    department: 'Food & Beverage',
    date: '2026-09-23',
    dayOfWeek: 'Wednesday',
    shiftType: 'AFTERNOON',
    startTime: '15:00',
    endTime: '23:30',
    station: 'VIP Lounge Cocktail Bar',
    status: 'CLOCKED_IN',
    clockInTime: '14:58',
    notes: 'Cocktail prep and ice inventory verified'
  },
  {
    id: 'sh-03',
    employeeId: 'emp-waiter',
    employeeName: 'Kevin Otieno',
    role: 'Floor Waiter',
    department: 'Food & Beverage',
    date: '2026-09-23',
    dayOfWeek: 'Wednesday',
    shiftType: 'MORNING',
    startTime: '07:00',
    endTime: '15:30',
    station: 'Garden Terrace Deck',
    status: 'COMPLETED',
    clockInTime: '06:55',
    clockOutTime: '15:35',
    hoursWorked: 8.5
  },
  {
    id: 'sh-04',
    employeeId: 'emp-alice',
    employeeName: 'Alice Wambui',
    role: 'Head Cashier',
    department: 'Finance & Admin',
    date: '2026-09-23',
    dayOfWeek: 'Wednesday',
    shiftType: 'MORNING',
    startTime: '07:00',
    endTime: '15:30',
    station: 'Central Till Desk',
    status: 'CLOCKED_IN',
    clockInTime: '06:50'
  },
  {
    id: 'sh-05',
    employeeId: 'emp-frontdesk',
    employeeName: 'Stella Njeri',
    role: 'Receptionist',
    department: 'Front Desk & Rooms',
    date: '2026-09-23',
    dayOfWeek: 'Wednesday',
    shiftType: 'MORNING',
    startTime: '07:00',
    endTime: '15:30',
    station: 'Hotel Reception PMS Desk',
    status: 'CLOCKED_IN',
    clockInTime: '07:02'
  },
  {
    id: 'sh-06',
    employeeId: 'emp-chef',
    employeeName: 'Joseph Mwangi',
    role: 'Executive Sous Chef',
    department: 'Culinary / Kitchen',
    date: '2026-09-23',
    dayOfWeek: 'Wednesday',
    shiftType: 'MORNING',
    startTime: '06:30',
    endTime: '15:00',
    station: 'Hot Line & Kitchen Pass',
    status: 'CLOCKED_IN',
    clockInTime: '06:28'
  },
  {
    id: 'sh-07',
    employeeId: 'emp-hk',
    employeeName: 'Mary Achieng',
    role: 'Housekeeper',
    department: 'Housekeeping',
    date: '2026-09-23',
    dayOfWeek: 'Wednesday',
    shiftType: 'MORNING',
    startTime: '07:00',
    endTime: '15:30',
    station: 'Floors 1-3 Guest Rooms',
    status: 'COMPLETED',
    clockInTime: '06:58',
    clockOutTime: '15:30',
    hoursWorked: 8.5
  },
  {
    id: 'sh-08',
    employeeId: 'emp-mgr',
    employeeName: 'Marcus Kiprop',
    role: 'General Manager',
    department: 'General Management',
    date: '2026-09-23',
    dayOfWeek: 'Wednesday',
    shiftType: 'DOUBLE',
    startTime: '08:00',
    endTime: '20:00',
    station: 'Executive Duty Office',
    status: 'CLOCKED_IN',
    clockInTime: '07:45'
  }
];

const initialSalaryAdvances: SalaryAdvance[] = [
  {
    id: 'adv-01',
    employeeId: 'emp-waiter',
    employeeName: 'Kevin Otieno',
    amount: 8000,
    reason: 'Emergency outpatient medical prescription',
    requestedAt: '2026-09-10T10:00:00Z',
    status: 'APPROVED',
    payrollDeductionPeriod: 'September 2026',
    approvedBy: 'Marcus Kiprop'
  },
  {
    id: 'adv-02',
    employeeId: 'emp-dave',
    employeeName: 'David Omondi',
    amount: 5000,
    reason: 'High school term fees advance',
    requestedAt: '2026-09-15T14:30:00Z',
    status: 'APPROVED',
    payrollDeductionPeriod: 'September 2026',
    approvedBy: 'Marcus Kiprop'
  },
  {
    id: 'adv-03',
    employeeId: 'emp-hk',
    employeeName: 'Mary Achieng',
    amount: 3500,
    reason: 'Home plumbing repair emergency',
    requestedAt: '2026-09-21T08:15:00Z',
    status: 'PENDING'
  }
];

const initialPayrollRuns: PayrollRun[] = [
  {
    id: 'pyr-2026-08',
    period: 'August 2026',
    runDate: '2026-08-31T17:00:00Z',
    status: 'DISBURSED',
    totalGross: 587000,
    totalAdditions: 74200,
    totalDeductions: 132450,
    totalNetPay: 454550,
    employeeCount: 8,
    approvedBy: 'Marcus Kiprop',
    disbursedAt: '2026-08-31T18:15:00Z',
    journalEntryId: 'je-pyr-aug26',
    payslips: [
      {
        id: 'ps-aug-01',
        payrollRunId: 'pyr-2026-08',
        employeeId: 'emp-dave',
        employeeName: 'David Omondi',
        employeeCode: 'EMP-01',
        role: 'Bartender',
        department: 'Food & Beverage',
        kraPin: 'A004819230Z',
        basicPay: 55000,
        shiftHoursWorked: 184,
        overtimeHours: 12,
        overtimePay: 6300,
        tipShare: 8450,
        bottleCommissions: 4200,
        allowances: 4000,
        grossPay: 77950,
        payeTax: 12150,
        nssfPension: 2160,
        nhifInsurance: 1500,
        housingLevy: 1169,
        advancesDeducted: 0,
        totalDeductions: 16979,
        netPay: 60971,
        disbursementMethod: 'MPESA_MANUAL',
        disbursementStatus: 'DISBURSED',
        paymentReference: 'B2C-MP-849102'
      },
      {
        id: 'ps-aug-02',
        payrollRunId: 'pyr-2026-08',
        employeeId: 'emp-alice',
        employeeName: 'Alice Wambui',
        employeeCode: 'EMP-02',
        role: 'Cashier',
        department: 'Finance & Admin',
        kraPin: 'A007419821W',
        basicPay: 62000,
        shiftHoursWorked: 180,
        overtimeHours: 8,
        overtimePay: 4560,
        tipShare: 7200,
        bottleCommissions: 1200,
        allowances: 4000,
        grossPay: 78960,
        payeTax: 12450,
        nssfPension: 2160,
        nhifInsurance: 1500,
        housingLevy: 1184,
        advancesDeducted: 0,
        totalDeductions: 17294,
        netPay: 61666,
        disbursementMethod: 'BANK_TRANSFER',
        disbursementStatus: 'DISBURSED',
        paymentReference: 'EFT-EQB-910294'
      },
      {
        id: 'ps-aug-03',
        payrollRunId: 'pyr-2026-08',
        employeeId: 'emp-mgr',
        employeeName: 'Marcus Kiprop',
        employeeCode: 'EMP-03',
        role: 'Manager',
        department: 'General Management',
        kraPin: 'A001298471P',
        basicPay: 145000,
        shiftHoursWorked: 190,
        overtimeHours: 0,
        overtimePay: 0,
        tipShare: 0,
        bottleCommissions: 6800,
        allowances: 12000,
        grossPay: 163800,
        payeTax: 39540,
        nssfPension: 2160,
        nhifInsurance: 1700,
        housingLevy: 2457,
        advancesDeducted: 0,
        totalDeductions: 45857,
        netPay: 117943,
        disbursementMethod: 'BANK_TRANSFER',
        disbursementStatus: 'DISBURSED',
        paymentReference: 'EFT-SCB-481920'
      }
    ]
  },
  {
    id: 'pyr-2026-09',
    period: 'September 2026',
    runDate: '2026-09-23T12:00:00Z',
    status: 'DRAFT',
    totalGross: 598400,
    totalAdditions: 78500,
    totalDeductions: 147250,
    totalNetPay: 451150,
    employeeCount: 8,
    payslips: [
      {
        id: 'ps-sep-01',
        payrollRunId: 'pyr-2026-09',
        employeeId: 'emp-dave',
        employeeName: 'David Omondi',
        employeeCode: 'EMP-01',
        role: 'Bartender',
        department: 'Food & Beverage',
        kraPin: 'A004819230Z',
        basicPay: 55000,
        shiftHoursWorked: 176,
        overtimeHours: 14,
        overtimePay: 7350,
        tipShare: 8900,
        bottleCommissions: 4800,
        allowances: 4000,
        grossPay: 80050,
        payeTax: 12850,
        nssfPension: 2160,
        nhifInsurance: 1500,
        housingLevy: 1201,
        advancesDeducted: 5000,
        totalDeductions: 22711,
        netPay: 57339,
        disbursementMethod: 'MPESA_MANUAL',
        disbursementStatus: 'PENDING'
      },
      {
        id: 'ps-sep-02',
        payrollRunId: 'pyr-2026-09',
        employeeId: 'emp-alice',
        employeeName: 'Alice Wambui',
        employeeCode: 'EMP-02',
        role: 'Cashier',
        department: 'Finance & Admin',
        kraPin: 'A007419821W',
        basicPay: 62000,
        shiftHoursWorked: 180,
        overtimeHours: 6,
        overtimePay: 3420,
        tipShare: 7800,
        bottleCommissions: 1400,
        allowances: 4000,
        grossPay: 78620,
        payeTax: 12380,
        nssfPension: 2160,
        nhifInsurance: 1500,
        housingLevy: 1179,
        advancesDeducted: 0,
        totalDeductions: 17219,
        netPay: 61401,
        disbursementMethod: 'BANK_TRANSFER',
        disbursementStatus: 'PENDING'
      },
      {
        id: 'ps-sep-03',
        payrollRunId: 'pyr-2026-09',
        employeeId: 'emp-mgr',
        employeeName: 'Marcus Kiprop',
        employeeCode: 'EMP-03',
        role: 'Manager',
        department: 'General Management',
        kraPin: 'A001298471P',
        basicPay: 145000,
        shiftHoursWorked: 188,
        overtimeHours: 0,
        overtimePay: 0,
        tipShare: 0,
        bottleCommissions: 7200,
        allowances: 12000,
        grossPay: 164200,
        payeTax: 39680,
        nssfPension: 2160,
        nhifInsurance: 1700,
        housingLevy: 2463,
        advancesDeducted: 0,
        totalDeductions: 46003,
        netPay: 118197,
        disbursementMethod: 'BANK_TRANSFER',
        disbursementStatus: 'PENDING'
      },
      {
        id: 'ps-sep-04',
        payrollRunId: 'pyr-2026-09',
        employeeId: 'emp-frontdesk',
        employeeName: 'Stella Njeri',
        employeeCode: 'EMP-04',
        role: 'Receptionist',
        department: 'Front Desk & Rooms',
        kraPin: 'A009182736K',
        basicPay: 58000,
        shiftHoursWorked: 178,
        overtimeHours: 8,
        overtimePay: 4800,
        tipShare: 5400,
        bottleCommissions: 1800,
        allowances: 4000,
        grossPay: 74000,
        payeTax: 10980,
        nssfPension: 2160,
        nhifInsurance: 1400,
        housingLevy: 1110,
        advancesDeducted: 0,
        totalDeductions: 15650,
        netPay: 58350,
        disbursementMethod: 'MPESA_MANUAL',
        disbursementStatus: 'PENDING'
      },
      {
        id: 'ps-sep-05',
        payrollRunId: 'pyr-2026-09',
        employeeId: 'emp-chef',
        employeeName: 'Joseph Mwangi',
        employeeCode: 'EMP-05',
        role: 'Chef',
        department: 'Culinary / Kitchen',
        kraPin: 'A003819201L',
        basicPay: 110000,
        shiftHoursWorked: 185,
        overtimeHours: 16,
        overtimePay: 13200,
        tipShare: 6500,
        bottleCommissions: 0,
        allowances: 8000,
        grossPay: 137700,
        payeTax: 30450,
        nssfPension: 2160,
        nhifInsurance: 1700,
        housingLevy: 2066,
        advancesDeducted: 0,
        totalDeductions: 36376,
        netPay: 101324,
        disbursementMethod: 'BANK_TRANSFER',
        disbursementStatus: 'PENDING'
      },
      {
        id: 'ps-sep-06',
        payrollRunId: 'pyr-2026-09',
        employeeId: 'emp-waiter',
        employeeName: 'Kevin Otieno',
        employeeCode: 'EMP-06',
        role: 'Waiter',
        department: 'Food & Beverage',
        kraPin: 'A006519283M',
        basicPay: 42000,
        shiftHoursWorked: 182,
        overtimeHours: 15,
        overtimePay: 6300,
        tipShare: 9200,
        bottleCommissions: 3600,
        allowances: 3500,
        grossPay: 64600,
        payeTax: 8120,
        nssfPension: 2160,
        nhifInsurance: 1300,
        housingLevy: 969,
        advancesDeducted: 8000,
        totalDeductions: 20549,
        netPay: 44051,
        disbursementMethod: 'MPESA_MANUAL',
        disbursementStatus: 'PENDING'
      },
      {
        id: 'ps-sep-07',
        payrollRunId: 'pyr-2026-09',
        employeeId: 'emp-mixologist',
        employeeName: 'Faith Mutua',
        employeeCode: 'EMP-07',
        role: 'Bartender',
        department: 'Food & Beverage',
        kraPin: 'A008192837X',
        basicPay: 65000,
        shiftHoursWorked: 180,
        overtimeHours: 12,
        overtimePay: 7560,
        tipShare: 9800,
        bottleCommissions: 5800,
        allowances: 4000,
        grossPay: 92160,
        payeTax: 16480,
        nssfPension: 2160,
        nhifInsurance: 1600,
        housingLevy: 1382,
        advancesDeducted: 0,
        totalDeductions: 21622,
        netPay: 70538,
        disbursementMethod: 'MPESA_MANUAL',
        disbursementStatus: 'PENDING'
      },
      {
        id: 'ps-sep-08',
        payrollRunId: 'pyr-2026-09',
        employeeId: 'emp-hk',
        employeeName: 'Mary Achieng',
        employeeCode: 'EMP-08',
        role: 'Housekeeper',
        department: 'Housekeeping',
        kraPin: 'A005918273T',
        basicPay: 50000,
        shiftHoursWorked: 175,
        overtimeHours: 8,
        overtimePay: 3840,
        tipShare: 4200,
        bottleCommissions: 0,
        allowances: 3500,
        grossPay: 61540,
        payeTax: 7240,
        nssfPension: 2160,
        nhifInsurance: 1300,
        housingLevy: 923,
        advancesDeducted: 0,
        totalDeductions: 11623,
        netPay: 49917,
        disbursementMethod: 'MPESA_MANUAL',
        disbursementStatus: 'PENDING'
      }
    ]
  }
];

const initialAlerts: AnomalyAlert[] = [
  {
    id: 'alt-1',
    ruleCode: 'STOCK_VARIANCE_ABOVE_TOLERANCE',
    title: 'Jameson 750ml Variance Exceeds 2.5% Tolerance',
    description: 'Actual vs Theoretical calculation detected an unexplained shortage of 180 ml on Main Bar Beverage Station.',
    severity: 'HIGH',
    evidence: {
      stockItemId: 'stk-jameson',
      expectedValue: '4,380 ml',
      actualValue: '4,200 ml',
      differenceAmount: 180,
      terminalName: 'POS-01 (Main Bar)'
    },
    recommendedAction: 'Verify open bottle handover notes with Bartender David Omondi; check for unrecorded waste or heavy pouring.',
    status: 'OPEN',
    detectedAt: '2026-09-23T02:45:00Z'
  },
  {
    id: 'alt-2',
    ruleCode: 'CASH_DRAWER_VARIANCE',
    title: 'Till #1 Mid-Shift Cash Discrepancy (KES -450)',
    description: 'System expected cash KES 25,450 based on sales minus paid-outs; drawer audit revealed KES 25,000.',
    severity: 'MEDIUM',
    evidence: {
      differenceAmount: 450,
      expectedValue: 'KES 25,450',
      actualValue: 'KES 25,000',
      employeeName: 'Alice Wambui',
      terminalName: 'POS-01 Cash Drawer'
    },
    recommendedAction: 'Re-tally small denomination notes and verify if any emergency ice paid-out voucher was missed.',
    status: 'OPEN',
    detectedAt: '2026-09-23T03:10:00Z'
  },
  {
    id: 'alt-3',
    ruleCode: 'LOW_STOCK_WITH_HIGH_VELOCITY',
    title: 'Tusker 500ml Stock Velocity Spike',
    description: 'Main Bar Store has 96 units remaining with current velocity of 28 units/hr (estimated stockout in 3.4 hrs).',
    severity: 'LOW',
    evidence: {
      stockItemId: 'stk-tusker',
      actualValue: '96 units',
      expectedValue: 'Par: 240 units'
    },
    recommendedAction: 'Execute inter-location stock transfer of 10 cases (240 units) from Central Warehouse depot.',
    status: 'OPEN',
    detectedAt: '2026-09-23T03:30:00Z'
  }
];

const initialApprovals: ApprovalRequest[] = [
  {
    id: 'appr-01',
    actionType: 'COMP_ITEM',
    requestedBy: 'emp-dave',
    requesterName: 'David Omondi',
    details: 'Complimentary Jameson Double (60ml) for VIP Platinum Guest at Table VIP-01',
    amount: 850,
    targetId: 'item-comp-01',
    status: 'PENDING',
    requestedAt: '2026-09-23T03:20:00Z'
  },
  {
    id: 'appr-02',
    actionType: 'DISCOUNT_OVERRIDE',
    requestedBy: 'emp-alice',
    requesterName: 'Alice Wambui',
    details: 'Manager 15% discount for Corporate Board dinner table 04 (Exceeds standard 10% limit)',
    amount: 1250,
    targetId: 'ord-disc-02',
    status: 'PENDING',
    requestedAt: '2026-09-23T03:40:00Z'
  }
];

const initialEdgeDevices: EdgeDevice[] = [
  {
    id: 'edge-fisc-01',
    name: 'KRA Fiscal OSCU / VSCU Box (Datecs FP-700)',
    type: 'FISCAL_PRINTER',
    connection: 'LAN',
    status: 'ONLINE',
    ipAddress: '192.168.1.180',
    port: '9100',
    paperStatus: 'OK',
    lastPing: '2026-09-23T06:00:00Z'
  },
  {
    id: 'edge-card-01',
    name: 'EMV Smart Card Terminal (Ingenico Desk 3500)',
    type: 'CARD_READER',
    connection: 'LAN',
    status: 'ONLINE',
    ipAddress: '192.168.1.185',
    port: '8080',
    batteryLevel: 98,
    lastPing: '2026-09-23T06:00:00Z'
  },
  {
    id: 'edge-prn-01',
    name: 'Bar Receipt Printer (Epson TM-T88VI)',
    type: 'RECEIPT_PRINTER',
    connection: 'LAN',
    status: 'ONLINE',
    ipAddress: '192.168.1.190',
    port: '9100',
    paperStatus: 'OK',
    lastPing: '2026-09-23T06:00:00Z'
  },
  {
    id: 'edge-prn-02',
    name: 'Kitchen Order Printer (Star Micronics SP700)',
    type: 'KITCHEN_PRINTER',
    connection: 'LAN',
    status: 'ONLINE',
    ipAddress: '192.168.1.192',
    port: '9100',
    paperStatus: 'OK',
    lastPing: '2026-09-23T06:00:00Z'
  },
  {
    id: 'edge-drw-01',
    name: 'Cash Drawer Port 1 (RJ-12 24V Solenoid)',
    type: 'CASH_DRAWER',
    connection: 'USB',
    status: 'ONLINE',
    lastPing: '2026-09-23T06:00:00Z'
  },
  {
    id: 'edge-scl-01',
    name: 'Keg Digital Tare Scale (Mettler Toledo RS-232)',
    type: 'WEIGHING_SCALE',
    connection: 'SERIAL',
    status: 'ONLINE',
    lastPing: '2026-09-23T06:00:00Z'
  }
];

export const ServOSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authentication & Role Permissions
  const [userRole, setUserRoleState] = useState<UserRole>(() => {
    try {
      const saved = localStorage.getItem('servos_auth_role');
      if (saved === 'Admin' || saved === 'Manager' || saved === 'Server') return saved as UserRole;
    } catch {}
    return 'Admin';
  });

  const availableRoles: UserRole[] = ['Admin', 'Manager', 'Server'];
  const userPermissions: RolePermissions = ROLE_DEFINITIONS[userRole] || ROLE_DEFINITIONS.Admin;

  const isTabAllowed = (tabId: string): boolean => {
    return userPermissions.allowedTabs.includes(tabId);
  };

  // Tenancy & Session
  const [organization] = useState<Organization>(initialOrg);
  const [currentProperty, setCurrentProperty] = useState<Property>(initialProperty);
  const [outlets, setOutlets] = useState<Outlet[]>(initialOutlets);
  const [currentOutlet, setCurrentOutlet] = useState<Outlet>(initialOutlets[0]);
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);

  const updateProperty = (updates: Partial<Property>) => {
    setCurrentProperty(prev => ({ ...prev, ...updates }));
    showToast('Property configuration updated successfully', 'success');
  };

  const addOutlet = (newOutlet: Omit<Outlet, 'id'>) => {
    const created: Outlet = {
      ...newOutlet,
      id: `out-${Date.now()}`
    };
    setOutlets(prev => [...prev, created]);
    showToast(`Outlet "${created.name}" created`, 'success');
  };

  const updateOutlet = (id: string, updates: Partial<Outlet>) => {
    setOutlets(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
    showToast('Outlet details updated successfully', 'success');
  };

  const addEmployee = (emp: Omit<Employee, 'id'>) => {
    const newEmp: Employee = {
      ...emp,
      id: `emp-${Date.now()}`
    };
    setEmployees(prev => [...prev, newEmp]);
    showToast(`Employee "${newEmp.name}" added`, 'success');
  };

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    showToast('Employee details updated', 'success');
  };

  const deleteEmployee = (id: string) => {
    setEmployees(prev => prev.filter(e => e.id !== id));
    showToast('Employee removed', 'info');
  };
  const [currentUser, setCurrentUser] = useState<Employee>(() => {
    const adminEmp = initialEmployees.find(e => e.role === 'ADMIN') || initialEmployees[0];
    return adminEmp;
  });

  const switchUserRole = (newRole: UserRole) => {
    setUserRoleState(newRole);
    try {
      localStorage.setItem('servos_auth_role', newRole);
    } catch {}

    if (newRole === 'Admin') {
      const adminEmp = employees.find(e => e.role === 'ADMIN') || employees[0];
      setCurrentUser(adminEmp);
      showToast(`Logged in as Administrator (${adminEmp.name}) - Full system authority granted`, 'info');
    } else if (newRole === 'Manager') {
      const mgrEmp = employees.find(e => e.role === 'MANAGER') || employees[2];
      setCurrentUser(mgrEmp);
      showToast(`Logged in as Manager (${mgrEmp.name}) - Operations & Control authority`, 'info');
    } else {
      const serverEmp = employees.find(e => e.role === 'WAITER' || e.role === 'BARTENDER') || employees[1];
      setCurrentUser(serverEmp);
      showToast(`Logged in as Service Staff (${serverEmp.name}) - POS & Guest service`, 'info');
    }
  };

  const setUserRole = (newRole: UserRole) => {
    switchUserRole(newRole);
  };
  const [leaveRequests, setLeaveRequests] = useState<StaffLeaveRequest[]>(initialLeaveRequests);
  const [shiftSchedules, setShiftSchedules] = useState<ShiftSchedule[]>(initialShiftSchedules);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>(initialPayrollRuns);
  const [salaryAdvances, setSalaryAdvances] = useState<SalaryAdvance[]>(initialSalaryAdvances);
  const [terminals] = useState<Terminal[]>([
    {
      id: 'term-01',
      propertyId: 'prop-nairobi-01',
      outletId: 'out-bar-01',
      name: 'POS Terminal 01 (Main Bar)',
      hardwareSerial: 'POS-SR-98412',
      isEdgeConnected: true,
      assignedCashierId: 'emp-alice'
    }
  ]);
  const currentTerminal = terminals[0];

  // Catalog & Inventory
  const [stockItems, setStockItems] = useState<StockItem[]>(initialStockItems);
  const [stockLocations] = useState<StockLocation[]>(initialStockLocations);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(initialStockMovements);
  const [products, setProducts] = useState<ProductSellable[]>(initialProducts);

  const addProduct = (prod: Omit<ProductSellable, 'id'>) => {
    const newProd: ProductSellable = {
      ...prod,
      id: `prod-${Date.now()}`
    };
    setProducts(prev => [newProd, ...prev]);
    showToast(`Product "${newProd.name}" added to catalog`, 'success');
  };

  const updateProduct = (id: string, updates: Partial<ProductSellable>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    showToast('Product details updated successfully', 'success');
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    showToast('Product deleted from catalog', 'info');
  };

  const addStockItem = (item: Omit<StockItem, 'id'>) => {
    const newItem: StockItem = {
      ...item,
      id: `stk-${Date.now()}`
    };
    setStockItems(prev => [newItem, ...prev]);
    showToast(`Stock item "${newItem.name}" added`, 'success');
  };

  const updateStockItem = (id: string, updates: Partial<StockItem>) => {
    setStockItems(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    showToast('Stock item details updated', 'success');
  };

  const deleteStockItem = (id: string) => {
    setStockItems(prev => prev.filter(s => s.id !== id));
    showToast('Stock item deleted', 'info');
  };

  // Orders, Tables & Tabs
  const [tables, setTables] = useState<RestaurantTable[]>(initialTables);

  const addTable = (tbl: Omit<RestaurantTable, 'id'>) => {
    const newTbl: RestaurantTable = {
      ...tbl,
      id: `tbl-${Date.now()}`
    };
    setTables(prev => [...prev, newTbl]);
    showToast(`Table "${newTbl.label}" created`, 'success');
  };

  const updateTable = (id: string, updates: Partial<RestaurantTable>) => {
    setTables(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    showToast('Table configuration updated', 'success');
  };

  const deleteTable = (id: string) => {
    setTables(prev => prev.filter(t => t.id !== id));
    showToast('Table deleted', 'info');
  };
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // Payments & Cash
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [tillSession, setTillSession] = useState<TillSession | null>({
    id: 'till-2026-0923-01',
    terminalId: 'term-01',
    terminalName: 'POS Terminal 01 (Main Bar)',
    employeeId: 'emp-alice',
    employeeName: 'Alice Wambui',
    openedAt: '2026-09-23T00:00:00Z',
    openingFloat: 10000,
    cashSalesTotal: 15450,
    cashPaidIn: 0,
    cashPaidOut: 450,
    expectedCashInDrawer: 25000,
    status: 'OPEN'
  });

  // Accounting Ledger & Fiscal
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(initialJournalEntries);
  const [etimsInvoices, setEtimsInvoices] = useState<EtimsFiscalInvoice[]>([]);

  // Hotel PMS
  const [hotelRooms, setHotelRooms] = useState<HotelRoom[]>(initialHotelRooms);
  const [guestStays, setGuestStays] = useState<GuestStay[]>(initialGuestStays);
  const [guestFolios, setGuestFolios] = useState<GuestFolio[]>(initialGuestFolios);

  // Procurement
  const [suppliers] = useState<Supplier[]>(initialSuppliers);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(initialPurchaseOrders);

  // Control Engine
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlert[]>(initialAlerts);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>(initialApprovals);

  // Offline Mode & Edge State
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<Order[]>([]);
  const [edgeDevices, setEdgeDevices] = useState<EdgeDevice[]>(initialEdgeDevices);
  const [lastEdgeEvent, setLastEdgeEvent] = useState<string | null>(null);

  // Initialize IndexedDB & Caching on App Mount
  useEffect(() => {
    const initOfflineStorage = async () => {
      try {
        await initOfflineDb();
        await cacheCatalogOffline('catalog_products', products);
        await cacheCatalogOffline('catalog_stock', stockItems);
        await cacheCatalogOffline('catalog_tables', tables);

        // Load any pending operations from previous session
        const pendingOps = await getOfflineOperations('PENDING');
        if (pendingOps.length > 0) {
          const pendingOrders: Order[] = pendingOps
            .filter(op => op.operationType === 'PAYMENT_PROCESS' || op.operationType === 'ORDER_CREATE')
            .map(op => op.payload as Order);
          setOfflineQueue(pendingOrders);
        }
      } catch (err) {
        console.warn('IndexedDB offline storage initialization warning:', err);
      }
    };

    initOfflineStorage();
  }, []);

  // Listen to browser online/offline events for automated background sync
  useEffect(() => {
    const handleBrowserOnline = async () => {
      setIsOffline(false);
      showToast('Network connection detected. Auto-syncing IndexedDB offline queue...', 'info');
      await syncOfflineQueue();
    };

    const handleBrowserOffline = () => {
      setIsOffline(true);
      showToast('Network connection lost. Switched to IndexedDB offline queue mode.', 'info');
    };

    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    return () => {
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
    };
  }, [offlineQueue]);

  // In-app Toast Notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error'; id: number } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Date.now();
    setToast({ message, type, id });
    setTimeout(() => {
      setToast(curr => (curr && curr.id === id ? null : curr));
    }, 4000);
  };

  const closeToast = () => {
    setToast(null);
  };

  // Load / initialize active table order on startup
  useEffect(() => {
    // create a default open table order for VIP-01 if none exists
    const orderNum = `ORD-9020`;
    const newOrd: Order = {
      id: 'ord-demo-vip01',
      orderNumber: orderNum,
      propertyId: currentProperty.id,
      outletId: currentOutlet.id,
      terminalId: currentTerminal.id,
      tableId: 'tbl-vip-01',
      tableName: 'VIP-01 (Lounge)',
      tabName: 'Table VIP-01 Tab',
      serverEmployeeId: currentUser.id,
      serverName: currentUser.name,
      state: 'OPEN',
      items: [
        {
          id: 'item-1',
          productId: 'prod-tanq-gt',
          productName: 'Tanqueray Classic G&T',
          quantity: 2,
          unitPrice: 850,
          taxAmount: 230.50,
          cateringLevy: 28.80,
          totalPrice: 1700,
          modifiers: [],
          state: 'SERVED',
          sentAt: '2026-09-23T02:00:00Z'
        },
        {
          id: 'item-2',
          productId: 'prod-jam-double',
          productName: 'Jameson Double (60ml)',
          portionName: '60ml Double',
          quantity: 1,
          unitPrice: 850,
          taxAmount: 115.25,
          cateringLevy: 14.41,
          totalPrice: 850,
          modifiers: [],
          state: 'SERVED',
          sentAt: '2026-09-23T02:10:00Z'
        }
      ],
      subtotal: 2161.70,
      taxTotal: 345.75,
      cateringLevyTotal: 43.21,
      shortfallAdjustment: 0,
      discountTotal: 0,
      grandTotal: 2550,
      amountPaid: 0,
      createdAt: '2026-09-23T02:00:00Z'
    };
    setOrders([newOrd]);
    setActiveOrder(newOrd);
  }, []);

  // Recalculate order totals helper
  const calculateTotals = (items: OrderItem[], discountTotal: number = 0, minSpend: number = 0) => {
    let itemsTotal = 0;
    items.forEach(it => {
      if (!it.isComp) {
        itemsTotal += it.totalPrice;
      }
    });

    const netCharge = Math.max(0, itemsTotal - discountTotal);
    // Kenyan tax calculations: 16% VAT + 2% Catering Levy (included in gross price)
    // Gross = Net / 1.18 * 1.18
    const baseExTax = netCharge / 1.18;
    const taxTotal = baseExTax * 0.16;
    const cateringLevyTotal = baseExTax * 0.02;

    // Minimum spend shortfall check (Section 11, 25)
    let shortfall = 0;
    if (minSpend > 0 && netCharge < minSpend) {
      shortfall = minSpend - netCharge;
    }

    const grandTotal = netCharge + shortfall;

    return {
      subtotal: Math.round(baseExTax * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      cateringLevyTotal: Math.round(cateringLevyTotal * 100) / 100,
      shortfallAdjustment: shortfall,
      grandTotal: Math.round(grandTotal)
    };
  };

  // Order Actions
  const createOrderForTable = (tableId: string): Order => {
    const table = tables.find(t => t.id === tableId);
    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber,
      propertyId: currentProperty.id,
      outletId: currentOutlet.id,
      terminalId: currentTerminal.id,
      tableId,
      tableName: table ? table.label : 'Table',
      tabName: table ? `${table.label} Tab` : 'Bar Tab',
      serverEmployeeId: currentUser.id,
      serverName: currentUser.name,
      state: 'DRAFT',
      items: [],
      subtotal: 0,
      taxTotal: 0,
      cateringLevyTotal: 0,
      shortfallAdjustment: 0,
      discountTotal: 0,
      grandTotal: 0,
      amountPaid: 0,
      createdAt: new Date().toISOString()
    };

    setOrders(prev => [newOrder, ...prev]);
    setActiveOrder(newOrder);

    // Update table state to ORDERING
    if (table) {
      setTables(prev =>
        prev.map(t =>
          t.id === tableId ? { ...t, state: 'ORDERING', currentOrderId: newOrder.id } : t
        )
      );
    }
    return newOrder;
  };

  const createQuickBarTab = (tabName = 'Walk-in Bar Tab'): Order => {
    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber,
      propertyId: currentProperty.id,
      outletId: currentOutlet.id,
      terminalId: currentTerminal.id,
      tabName,
      serverEmployeeId: currentUser.id,
      serverName: currentUser.name,
      state: 'DRAFT',
      items: [],
      subtotal: 0,
      taxTotal: 0,
      cateringLevyTotal: 0,
      shortfallAdjustment: 0,
      discountTotal: 0,
      grandTotal: 0,
      amountPaid: 0,
      createdAt: new Date().toISOString()
    };

    setOrders(prev => [newOrder, ...prev]);
    setActiveOrder(newOrder);
    return newOrder;
  };

  const selectOrder = (orderId: string) => {
    const ord = orders.find(o => o.id === orderId);
    if (ord) setActiveOrder(ord);
  };

  const addItemToOrder = (
    productId: string,
    portionVolume?: number,
    modifiers?: { modifierId: string; name: string; priceDelta: number }[],
    selectedMixers?: string[],
    seatLabel?: string,
    courseName?: 'Drinks' | 'Starters' | 'Mains' | 'Dessert'
  ) => {
    let current = activeOrder;
    if (!current) {
      current = createQuickBarTab('Quick Counter Sale');
    }

    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    let unitPrice = prod.price;
    if (modifiers && modifiers.length > 0) {
      const modTotal = modifiers.reduce((acc, m) => acc + m.priceDelta, 0);
      unitPrice += modTotal;
    }

    // Default course based on product category
    const autoCourse: 'Drinks' | 'Starters' | 'Mains' | 'Dessert' = courseName || (
      prod.category === 'SPIRITS' || prod.category === 'COCKTAIL' || prod.category === 'BEER' ? 'Drinks' :
      prod.category === 'FOOD' ? 'Mains' : 'Starters'
    );

    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: prod.id,
      productName: prod.name,
      portionName: prod.portionUnitSymbol ? `${portionVolume || prod.portionVolume} ${prod.portionUnitSymbol}` : undefined,
      quantity: 1,
      unitPrice,
      taxAmount: Math.round((unitPrice / 1.18 * 0.16) * 100) / 100,
      cateringLevy: Math.round((unitPrice / 1.18 * 0.02) * 100) / 100,
      totalPrice: unitPrice,
      modifiers: modifiers || [],
      selectedMixers: selectedMixers || [],
      seatLabel: seatLabel || 'Seat 1',
      courseName: autoCourse,
      courseStatus: autoCourse === 'Mains' || autoCourse === 'Dessert' ? 'HELD' : 'FIRED',
      state: 'OPEN',
      sentAt: undefined
    };

    const newItems = [...current.items, newItem];
    const table = current.tableId ? tables.find(t => t.id === current?.tableId) : undefined;
    const totals = calculateTotals(newItems, current.discountTotal, table?.minimumSpend || 0);

    const updatedOrder: Order = {
      ...current,
      state: current.state === 'DRAFT' ? 'OPEN' : current.state,
      items: newItems,
      ...totals
    };

    setActiveOrder(updatedOrder);
    setOrders(prev => prev.map(o => (o.id === updatedOrder.id ? updatedOrder : o)));
  };

  const updateItemSeatAndCourse = (
    itemId: string,
    seatLabel?: string,
    courseName?: 'Drinks' | 'Starters' | 'Mains' | 'Dessert',
    courseStatus?: 'HELD' | 'FIRED'
  ) => {
    if (!activeOrder) return;
    const newItems = activeOrder.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          ...(seatLabel !== undefined ? { seatLabel } : {}),
          ...(courseName !== undefined ? { courseName } : {}),
          ...(courseStatus !== undefined ? { courseStatus } : {})
        };
      }
      return item;
    });

    const updated: Order = { ...activeOrder, items: newItems };
    setActiveOrder(updated);
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));
  };

  const fireHeldCourse = (courseName: 'Drinks' | 'Starters' | 'Mains' | 'Dessert') => {
    if (!activeOrder) return;
    const newItems = activeOrder.items.map(item => {
      if (item.courseName === courseName && item.courseStatus === 'HELD') {
        return { ...item, courseStatus: 'FIRED' as const, state: 'ROUTED' as const };
      }
      return item;
    });

    const updated: Order = { ...activeOrder, state: 'SENT', items: newItems };
    setActiveOrder(updated);
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));
    showToast(`Course "${courseName}" fired to Kitchen/Bar KDS pass!`, 'success');
  };

  const removeItemFromOrder = (itemId: string) => {
    if (!activeOrder) return;
    const newItems = activeOrder.items.filter(i => i.id !== itemId);
    const table = activeOrder.tableId ? tables.find(t => t.id === activeOrder?.tableId) : undefined;
    const totals = calculateTotals(newItems, activeOrder.discountTotal, table?.minimumSpend || 0);

    const updated: Order = {
      ...activeOrder,
      items: newItems,
      ...totals
    };
    setActiveOrder(updated);
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));
  };

  const sendOrderToKitchenAndBar = () => {
    if (!activeOrder || activeOrder.items.length === 0) return;

    const now = new Date().toISOString();
    const routedItems = activeOrder.items.map(it => ({
      ...it,
      state: it.state === 'OPEN' ? ('ROUTED' as const) : it.state,
      sentAt: it.sentAt || now
    }));

    const updated: Order = {
      ...activeOrder,
      state: 'SENT',
      items: routedItems
    };

    setActiveOrder(updated);
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));

    // Emit Edge print signal for kitchen/bar pass tickets
    triggerEdgePrint('KITCHEN_TICKET', {
      orderNumber: updated.orderNumber,
      tableName: updated.tableName,
      server: updated.serverName,
      items: routedItems
    });
  };

  const applyCompToItem = (itemId: string, reason: string) => {
    if (!activeOrder) return;
    const newItems = activeOrder.items.map(it => {
      if (it.id === itemId) {
        return {
          ...it,
          isComp: true,
          compReason: reason,
          compApprovedBy: currentUser.name
        };
      }
      return it;
    });

    const table = activeOrder.tableId ? tables.find(t => t.id === activeOrder?.tableId) : undefined;
    const totals = calculateTotals(newItems, activeOrder.discountTotal, table?.minimumSpend || 0);
    const updated: Order = {
      ...activeOrder,
      items: newItems,
      ...totals
    };

    setActiveOrder(updated);
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));
  };

  const applyOrderDiscount = (discountPct: number, reason: string) => {
    if (!activeOrder) return;
    const rawTotal = activeOrder.items.reduce((acc, it) => acc + (it.isComp ? 0 : it.totalPrice), 0);
    const discountAmount = Math.round((rawTotal * (discountPct / 100)));
    const table = activeOrder.tableId ? tables.find(t => t.id === activeOrder?.tableId) : undefined;
    const totals = calculateTotals(activeOrder.items, discountAmount, table?.minimumSpend || 0);

    const updated: Order = {
      ...activeOrder,
      discountTotal: discountAmount,
      discountReason: reason,
      ...totals
    };

    setActiveOrder(updated);
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));
  };

  const voidOrder = (orderId: string, reason: string) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          return {
            ...o,
            state: 'VOIDED',
            discountReason: `VOIDED: ${reason} (by ${currentUser.name})`
          };
        }
        return o;
      })
    );
    if (activeOrder?.id === orderId) {
      setActiveOrder(null);
    }
  };

  const transferOrderToTable = (orderId: string, newTableId: string) => {
    const targetTable = tables.find(t => t.id === newTableId);
    if (!targetTable) return;

    const ord = orders.find(o => o.id === orderId);
    if (!ord) return;

    const oldTableId = ord.tableId;

    // Recalculate totals if target table has different minimum spend
    const totals = calculateTotals(ord.items, ord.discountTotal, targetTable.minimumSpend || 0);

    const updatedOrder: Order = {
      ...ord,
      tableId: newTableId,
      tableName: targetTable.label,
      ...totals
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updatedOrder : o)));
    if (activeOrder?.id === orderId) {
      setActiveOrder(updatedOrder);
    }

    setTables(prev =>
      prev.map(t => {
        if (t.id === oldTableId) {
          return { ...t, currentOrderId: undefined, state: 'AVAILABLE' };
        }
        if (t.id === newTableId) {
          return { ...t, currentOrderId: orderId, state: 'ORDERING' };
        }
        return t;
      })
    );
  };

  const bumpKdsTicket = (orderId: string) => {
    const ord = orders.find(o => o.id === orderId);
    if (!ord) return;

    const updated: Order = {
      ...ord,
      state: 'COMPLETED',
      items: ord.items.map(it => ({
        ...it,
        state: 'SERVED' as const
      }))
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updated : o)));
    if (activeOrder?.id === orderId) {
      setActiveOrder(updated);
    }
    showToast(`Ticket #${ord.orderNumber} (${ord.tableName || ord.tabName || 'Bar Tab'}) bumped to READY & notification dispatched!`, 'success');
  };

  const recallKdsTicket = (orderId: string) => {
    const ord = orders.find(o => o.id === orderId);
    if (!ord) return;

    const updated: Order = {
      ...ord,
      state: 'SENT',
      items: ord.items.map(it => ({
        ...it,
        state: 'ROUTED' as const
      }))
    };

    setOrders(prev => prev.map(o => (o.id === orderId ? updated : o)));
    if (activeOrder?.id === orderId) {
      setActiveOrder(updated);
    }
    showToast(`Ticket #${ord.orderNumber} recalled to active KDS pass.`, 'info');
  };

  // Helper: execute stock depletion for an order
  const depleteInventoryForOrder = (order: Order) => {
    const newMovements: StockMovement[] = [];
    const locationId = currentOutlet.defaultStockLocationId || 'loc-bar-store';
    const location = stockLocations.find(l => l.id === locationId);
    const now = new Date().toISOString();

    order.items.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return;

      // 1. Direct measured portion or stock item (e.g. Jameson Shot 30ml, Double 60ml, Bottle 750ml, Tusker 1 unit)
      if (prod.stockItemId) {
        const stk = stockItems.find(s => s.id === prod.stockItemId);
        if (stk) {
          const qty = (prod.portionVolume || 1) * item.quantity;
          const costVal = Math.round(qty * stk.averageUnitCost * 100) / 100;

          newMovements.push({
            id: `mvt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            organizationId: organization.id,
            propertyId: currentProperty.id,
            stockItemId: stk.id,
            stockItemName: stk.name,
            locationId: locationId,
            locationName: location?.name || 'Outlet Stock',
            quantityDelta: -qty,
            baseUnit: stk.baseUnit,
            movementType: item.isComp ? 'COMP_CONSUMPTION' : 'SALE_CONSUMPTION',
            sourceType: 'ORDER',
            sourceId: order.orderNumber,
            reasonCode: item.isComp ? `Comp: ${item.compReason}` : 'POS Sale Depletion',
            occurredAt: now,
            actorUserId: currentUser.id,
            actorName: currentUser.name,
            unitCostSnapshot: stk.averageUnitCost,
            totalCostValuation: costVal
          });
        }
      }

      // 2. Recipe items (e.g. Tanqueray G&T: 60ml Gin, 1 can Tonic, 0.5 Lime)
      if (prod.recipeIngredients && prod.recipeIngredients.length > 0) {
        prod.recipeIngredients.forEach(ing => {
          const stk = stockItems.find(s => s.id === ing.stockItemId);
          if (stk) {
            let qty = ing.quantity * item.quantity;

            // Check if modifiers alter this ingredient (e.g. +30ml extra gin)
            item.modifiers.forEach(mod => {
              const originalMod = prod.modifiers?.find(m => m.id === mod.modifierId);
              if (originalMod) {
                const adj = originalMod.ingredientAdjustments.find(a => a.stockItemId === stk.id);
                if (adj) {
                  qty += adj.quantityDelta * item.quantity;
                }
              }
            });

            if (qty > 0) {
              const costVal = Math.round(qty * stk.averageUnitCost * 100) / 100;
              newMovements.push({
                id: `mvt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                organizationId: organization.id,
                propertyId: currentProperty.id,
                stockItemId: stk.id,
                stockItemName: stk.name,
                locationId: locationId,
                locationName: location?.name || 'Outlet Stock',
                quantityDelta: -qty,
                baseUnit: stk.baseUnit,
                movementType: item.isComp ? 'COMP_CONSUMPTION' : 'SALE_CONSUMPTION',
                sourceType: 'ORDER',
                sourceId: order.orderNumber,
                reasonCode: 'Recipe Consumption',
                occurredAt: now,
                actorUserId: currentUser.id,
                actorName: currentUser.name,
                unitCostSnapshot: stk.averageUnitCost,
                totalCostValuation: costVal
              });
            }
          }
        });
      }
    });

    // Update stock levels in stockItems state
    setStockItems(prev =>
      prev.map(stk => {
        const itemMovements = newMovements.filter(m => m.stockItemId === stk.id);
        if (itemMovements.length === 0) return stk;

        const totalDelta = itemMovements.reduce((acc, m) => acc + m.quantityDelta, 0);
        const locStock = stk.currentStock[locationId] || 0;
        return {
          ...stk,
          currentStock: {
            ...stk.currentStock,
            [locationId]: Math.max(0, locStock + totalDelta)
          }
        };
      })
    );

    setStockMovements(prev => [...newMovements, ...prev]);
    return newMovements;
  };

  // Helper: execute Double-Entry Accounting Journal Posting (Section 19 & 34)
  const postOrderToGeneralLedger = (
    order: Order,
    tenderType: 'CASH' | 'MPESA' | 'CARD' | 'ROOM_CHARGE',
    stockMovementsCreated: StockMovement[]
  ): JournalEntry => {
    const now = new Date().toISOString();
    const entryNumber = `JE-2026-${Math.floor(10000 + Math.random() * 90000)}`;

    const lines: JournalLine[] = [];
    let totalDebit = 0;
    let totalCredit = 0;

    // 1. Debit Clearing / Tender Account
    let clearingAccountId = 'acc-1010'; // default cash
    let clearingCode = '1010';
    let clearingName = 'Cash on Hand (Till Drawers)';

    if (tenderType === 'MPESA') {
      clearingAccountId = 'acc-1020';
      clearingCode = '1020';
      clearingName = 'M-PESA Clearing Settlement';
    } else if (tenderType === 'CARD') {
      clearingAccountId = 'acc-1030';
      clearingCode = '1030';
      clearingName = 'Card Settlement Clearing';
    } else if (tenderType === 'ROOM_CHARGE') {
      clearingAccountId = 'acc-1100';
      clearingCode = '1100';
      clearingName = 'Guest Accounts Receivable (Folios)';
    }

    // Debit payment amount
    lines.push({
      id: `jl-${Date.now()}-1`,
      accountId: clearingAccountId,
      accountCode: clearingCode,
      accountName: clearingName,
      debit: order.grandTotal,
      credit: 0,
      description: `Settlement for Order #${order.orderNumber} via ${tenderType}`
    });
    totalDebit += order.grandTotal;

    // 2. Credit Revenue Accounts (Split by Bar vs Food)
    const netBarRevenue = Math.round(order.subtotal * 100) / 100;
    lines.push({
      id: `jl-${Date.now()}-2`,
      accountId: 'acc-4010',
      accountCode: '4010',
      accountName: 'F&B Revenue - Beverage (Bar)',
      debit: 0,
      credit: netBarRevenue,
      description: `Gross net revenue for ${order.orderNumber}`
    });
    totalCredit += netBarRevenue;

    // 3. Credit Output Tax
    if (order.taxTotal > 0) {
      lines.push({
        id: `jl-${Date.now()}-3`,
        accountId: 'acc-2100',
        accountCode: '2100',
        accountName: 'Output VAT Payable (16%)',
        debit: 0,
        credit: order.taxTotal,
        description: `16% VAT on Order #${order.orderNumber}`
      });
      totalCredit += order.taxTotal;
    }

    if (order.cateringLevyTotal > 0) {
      lines.push({
        id: `jl-${Date.now()}-4`,
        accountId: 'acc-2110',
        accountCode: '2110',
        accountName: 'Catering Levy Payable (2%)',
        debit: 0,
        credit: order.cateringLevyTotal,
        description: `2% Catering Levy on Order #${order.orderNumber}`
      });
      totalCredit += order.cateringLevyTotal;
    }

    // 4. Minimum spend shortfall if applicable
    if (order.shortfallAdjustment > 0) {
      lines.push({
        id: `jl-${Date.now()}-5`,
        accountId: 'acc-4090',
        accountCode: '4090',
        accountName: 'Minimum Spend Shortfall Revenue',
        debit: 0,
        credit: order.shortfallAdjustment,
        description: `VIP Minimum spend table shortfall on ${order.tableName}`
      });
      totalCredit += order.shortfallAdjustment;
    }

    // Balance check correction for rounding minor cents
    const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
    if (Math.abs(diff) > 0 && Math.abs(diff) < 2) {
      // absorb rounding cent into beverage revenue
      const revLine = lines.find(l => l.accountCode === '4010');
      if (revLine) {
        revLine.credit += diff;
        totalCredit += diff;
      }
    }

    // 5. Cost of Goods Sold (COGS) vs Inventory
    const totalCogs = stockMovementsCreated.reduce((acc, m) => acc + m.totalCostValuation, 0);
    if (totalCogs > 0) {
      lines.push({
        id: `jl-${Date.now()}-cogs`,
        accountId: 'acc-5010',
        accountCode: '5010',
        accountName: 'Cost of Goods Sold (COGS - Beverage)',
        debit: totalCogs,
        credit: 0,
        description: `Inventory cost consumption for Order #${order.orderNumber}`
      });
      totalDebit += totalCogs;

      lines.push({
        id: `jl-${Date.now()}-inv`,
        accountId: 'acc-1200',
        accountCode: '1200',
        accountName: 'Inventory Asset (F&B Stock)',
        debit: 0,
        credit: totalCogs,
        description: `Depletion of bar inventory for Order #${order.orderNumber}`
      });
      totalCredit += totalCogs;
    }

    const journalEntry: JournalEntry = {
      id: `je-${Date.now()}`,
      entryNumber,
      propertyId: currentProperty.id,
      occurredAt: now,
      postedAt: now,
      sourceType: 'SALE',
      sourceId: order.orderNumber,
      memo: `Sale order #${order.orderNumber} settled via ${tenderType}`,
      lines,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      balanced: Math.abs(totalDebit - totalCredit) < 0.05
    };

    setJournalEntries(prev => [journalEntry, ...prev]);

    // Update account balances
    setAccounts(prev =>
      prev.map(acc => {
        const debitLines = lines.filter(l => l.accountId === acc.id);
        const creditLines = lines.filter(l => l.accountId === acc.id);
        const sumDebit = debitLines.reduce((s, l) => s + l.debit, 0);
        const sumCredit = creditLines.reduce((s, l) => s + l.credit, 0);

        if (acc.type === 'ASSET' || acc.type === 'EXPENSE') {
          return { ...acc, balance: acc.balance + sumDebit - sumCredit };
        } else {
          return { ...acc, balance: acc.balance + sumCredit - sumDebit };
        }
      })
    );

    return journalEntry;
  };

  // Helper: generate Kenya eTIMS Fiscal Invoice (Section 20)
  const generateEtimsFiscalInvoice = (order: Order): EtimsFiscalInvoice => {
    const invNum = `INV-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const qrUrl = `https://itax.kra.go.ke/etims/verify?cu=${currentProperty.etimsCuNumber}&inv=${invNum}&amt=${order.grandTotal}&pin=${currentProperty.kraPin}`;

    const fiscalInv: EtimsFiscalInvoice = {
      id: `etims-${Date.now()}`,
      orderId: order.id,
      invoiceNumber: invNum,
      cuSerialNumber: currentProperty.etimsCuNumber,
      customerPin: undefined,
      taxableAmount: order.subtotal,
      vatAmount: order.taxTotal,
      levyAmount: order.cateringLevyTotal,
      totalAmount: order.grandTotal,
      qrCodeUrl: qrUrl,
      fiscalDate: new Date().toISOString(),
      status: 'PENDING',
      verificationHash: ''
    };

    setEtimsInvoices(prev => [fiscalInv, ...prev]);
    return fiscalInv;
  };

  // Browser preview cannot record real financial transactions.
  const processPayment: ServOSContextType['processPayment'] = async () => ({
    success: false,
    message: 'Payments require the installed business application. No payment was recorded.'
  });

  // Till Session Management
  const openTillSession = (floatAmount: number) => {
    const session: TillSession = {
      id: `till-${Date.now()}`,
      terminalId: currentTerminal.id,
      terminalName: currentTerminal.name,
      employeeId: currentUser.id,
      employeeName: currentUser.name,
      openedAt: new Date().toISOString(),
      openingFloat: floatAmount,
      cashSalesTotal: 0,
      cashPaidIn: 0,
      cashPaidOut: 0,
      expectedCashInDrawer: floatAmount,
      status: 'OPEN'
    };
    setTillSession(session);
  };

  const closeTillSession = (countedCash: number) => {
    if (!tillSession) return;
    const variance = countedCash - tillSession.expectedCashInDrawer;

    const closed: TillSession = {
      ...tillSession,
      countedCashAtClose: countedCash,
      cashVariance: variance,
      closedAt: new Date().toISOString(),
      status: 'CLOSED'
    };
    setTillSession(closed);

    // If variance is non-zero, trigger an anomaly alert!
    if (Math.abs(variance) > 50) {
      const alert: AnomalyAlert = {
        id: `alt-${Date.now()}`,
        ruleCode: 'CASH_DRAWER_VARIANCE',
        title: `Cash Drawer Close Discrepancy (KES ${variance})`,
        description: `Till closed by ${currentUser.name}. Expected KES ${tillSession.expectedCashInDrawer.toLocaleString()}, counted KES ${countedCash.toLocaleString()}.`,
        severity: Math.abs(variance) > 500 ? 'HIGH' : 'MEDIUM',
        evidence: {
          differenceAmount: variance,
          expectedValue: `KES ${tillSession.expectedCashInDrawer}`,
          actualValue: `KES ${countedCash}`,
          employeeName: currentUser.name,
          terminalName: tillSession.terminalName
        },
        recommendedAction: 'Manager reconciliation required; review non-sale paid in/out log before releasing drawer.',
        status: 'OPEN',
        detectedAt: new Date().toISOString()
      };
      setAnomalyAlerts(prev => [alert, ...prev]);
    }
  };

  const recordCashPaidInOut = (type: 'IN' | 'OUT', amount: number, reason: string) => {
    if (!tillSession || tillSession.status !== 'OPEN') return;
    setTillSession({
      ...tillSession,
      cashPaidIn: type === 'IN' ? tillSession.cashPaidIn + amount : tillSession.cashPaidIn,
      cashPaidOut: type === 'OUT' ? tillSession.cashPaidOut + amount : tillSession.cashPaidOut,
      expectedCashInDrawer:
        type === 'IN'
          ? tillSession.expectedCashInDrawer + amount
          : tillSession.expectedCashInDrawer - amount
    });
  };

  // Staff & HR Management
  const submitLeaveRequest = (req: Omit<StaffLeaveRequest, 'id' | 'requestedAt' | 'status'>) => {
    const newReq: StaffLeaveRequest = {
      ...req,
      id: `lr-${Date.now()}`,
      requestedAt: new Date().toISOString(),
      status: 'PENDING'
    };
    setLeaveRequests(prev => [newReq, ...prev]);
    showToast(`Leave application submitted for ${newReq.employeeName} (${newReq.daysCount} days)`, 'success');
  };

  const approveLeaveRequest = (requestId: string, reviewNotes?: string) => {
    const req = leaveRequests.find(r => r.id === requestId);
    if (!req) return;

    setLeaveRequests(prev =>
      prev.map(r =>
        r.id === requestId
          ? {
              ...r,
              status: 'APPROVED' as const,
              reviewedBy: currentUser.name,
              reviewedAt: new Date().toISOString(),
              reviewNotes: reviewNotes || 'Approved by Manager'
            }
          : r
      )
    );

    // Deduct leave balance from employee
    setEmployees(prev =>
      prev.map(e => {
        if (e.id === req.employeeId) {
          const newBal = Math.max(0, e.leaveBalance - req.daysCount);
          const newTaken = e.leaveTaken + req.daysCount;
          return { ...e, leaveBalance: newBal, leaveTaken: newTaken };
        }
        return e;
      })
    );

    showToast(`Leave request #${requestId} approved for ${req.employeeName}. Days deducted: ${req.daysCount}`, 'success');
  };

  const rejectLeaveRequest = (requestId: string, reason: string) => {
    const req = leaveRequests.find(r => r.id === requestId);
    if (!req) return;

    setLeaveRequests(prev =>
      prev.map(r =>
        r.id === requestId
          ? {
              ...r,
              status: 'REJECTED' as const,
              reviewedBy: currentUser.name,
              reviewedAt: new Date().toISOString(),
              reviewNotes: reason || 'Application declined'
            }
          : r
      )
    );

    showToast(`Leave request for ${req.employeeName} rejected`, 'info');
  };

  const clockInShift = (shiftId: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setShiftSchedules(prev =>
      prev.map(s =>
        s.id === shiftId
          ? { ...s, status: 'CLOCKED_IN' as const, clockInTime: nowStr }
          : s
      )
    );
    const targetShift = shiftSchedules.find(s => s.id === shiftId);
    if (targetShift) {
      setEmployees(prev =>
        prev.map(e => (e.id === targetShift.employeeId ? { ...e, attendanceStatus: 'ON_DUTY' } : e))
      );
      showToast(`${targetShift.employeeName} clocked in at ${targetShift.station} [${nowStr}]`, 'success');
    }
  };

  const clockOutShift = (shiftId: string) => {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const targetShift = shiftSchedules.find(s => s.id === shiftId);
    setShiftSchedules(prev =>
      prev.map(s =>
        s.id === shiftId
          ? { ...s, status: 'COMPLETED' as const, clockOutTime: nowStr, hoursWorked: s.hoursWorked || 8.5 }
          : s
      )
    );
    if (targetShift) {
      setEmployees(prev =>
        prev.map(e => (e.id === targetShift.employeeId ? { ...e, attendanceStatus: 'OFF_DUTY' } : e))
      );
      showToast(`${targetShift.employeeName} clocked out. 8.5 hours logged to timesheet.`, 'info');
    }
  };

  const createShiftSchedule = (scheduleData: Omit<ShiftSchedule, 'id'>) => {
    const newShift: ShiftSchedule = {
      ...scheduleData,
      id: `sh-${Date.now()}`
    };
    setShiftSchedules(prev => [...prev, newShift]);
    showToast(`Shift scheduled for ${newShift.employeeName} on ${newShift.date}`, 'success');
  };

  const requestSalaryAdvance = (employeeId: string, amount: number, reason: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;
    const newAdv: SalaryAdvance = {
      id: `adv-${Date.now()}`,
      employeeId,
      employeeName: emp.name,
      amount,
      reason,
      requestedAt: new Date().toISOString(),
      status: 'PENDING'
    };
    setSalaryAdvances(prev => [newAdv, ...prev]);
    showToast(`Salary advance request of KES ${amount.toLocaleString()} submitted for ${emp.name}`, 'info');
  };

  const approveSalaryAdvance = (advanceId: string) => {
    const adv = salaryAdvances.find(a => a.id === advanceId);
    if (!adv) return;
    setSalaryAdvances(prev =>
      prev.map(a =>
        a.id === advanceId
          ? { ...a, status: 'APPROVED' as const, approvedBy: currentUser.name, payrollDeductionPeriod: 'September 2026' }
          : a
      )
    );
    showToast(`Salary advance of KES ${adv.amount.toLocaleString()} approved for ${adv.employeeName}. Scheduled for payroll deduction.`, 'success');
  };

  const generatePayrollRun = (period: string) => {
    const generatedPayslips: EmployeePayslip[] = employees.map(emp => {
      const basicPay = emp.baseSalary;
      const shiftHoursWorked = 180;
      const overtimeHours = emp.role === 'CHEF' ? 16 : emp.role === 'BARTENDER' ? 12 : emp.role === 'WAITER' ? 14 : 6;
      const overtimePay = Math.round(overtimeHours * (emp.hourlyRate * 1.5));
      const tipShare = emp.role === 'BARTENDER' ? 9500 : emp.role === 'WAITER' ? 8800 : emp.role === 'CHEF' ? 6500 : emp.role === 'CASHIER' ? 7500 : 4000;
      const bottleCommissions = Math.round(emp.commissionRate * 85000);
      const allowances = emp.role === 'MANAGER' ? 12000 : emp.role === 'CHEF' ? 8000 : 4000;
      const grossPay = basicPay + overtimePay + tipShare + bottleCommissions + allowances;

      // Statutory deductions
      const nssfPension = 2160;
      const nhifInsurance = grossPay > 100000 ? 1700 : grossPay > 50000 ? 1500 : 1300;
      const housingLevy = Math.round(grossPay * 0.015);
      
      const taxable = grossPay - nssfPension;
      let paye = 0;
      if (taxable > 24000) {
        paye = Math.round((taxable - 24000) * 0.25);
      }
      if (taxable > 32333) {
        paye += Math.round((taxable - 32333) * 0.05);
      }
      paye = Math.max(0, paye - 2400); // Personal relief

      const empAdvance = salaryAdvances.find(a => a.employeeId === emp.id && a.status === 'APPROVED');
      const advancesDeducted = empAdvance ? empAdvance.amount : 0;

      const totalDeductions = nssfPension + nhifInsurance + housingLevy + paye + advancesDeducted;
      const netPay = grossPay - totalDeductions;

      return {
        id: `ps-${period.toLowerCase().replace(/\s+/g, '-')}-${emp.code.toLowerCase()}`,
        payrollRunId: `pyr-${period.toLowerCase().replace(/\s+/g, '-')}`,
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.code,
        role: emp.role,
        department: emp.department,
        kraPin: emp.kraPin || 'A000000000X',
        basicPay,
        shiftHoursWorked,
        overtimeHours,
        overtimePay,
        tipShare,
        bottleCommissions,
        allowances,
        grossPay,
        payeTax: paye,
        nssfPension,
        nhifInsurance,
        housingLevy,
        advancesDeducted,
        totalDeductions,
        netPay,
        disbursementMethod: emp.mpesaDisbursementNumber ? 'MPESA_MANUAL' : 'BANK_TRANSFER',
        disbursementStatus: 'PENDING' as const
      };
    });

    const totalGross = generatedPayslips.reduce((s, p) => s + p.grossPay, 0);
    const totalAdditions = generatedPayslips.reduce((s, p) => s + p.overtimePay + p.tipShare + p.bottleCommissions + p.allowances, 0);
    const totalDeductions = generatedPayslips.reduce((s, p) => s + p.totalDeductions, 0);
    const totalNetPay = generatedPayslips.reduce((s, p) => s + p.netPay, 0);

    const newRun: PayrollRun = {
      id: `pyr-${period.toLowerCase().replace(/\s+/g, '-')}`,
      period,
      runDate: new Date().toISOString(),
      status: 'DRAFT',
      totalGross,
      totalAdditions,
      totalDeductions,
      totalNetPay,
      employeeCount: generatedPayslips.length,
      payslips: generatedPayslips
    };

    setPayrollRuns(prev => [newRun, ...prev.filter(r => r.period !== period)]);
    showToast(`Payroll run generated for ${period}: ${generatedPayslips.length} payslips computed`, 'success');
  };

  const approvePayrollRun = (payrollId: string) => {
    setPayrollRuns(prev =>
      prev.map(r =>
        r.id === payrollId
          ? { ...r, status: 'APPROVED' as const, approvedBy: currentUser.name }
          : r
      )
    );
    showToast(`Payroll #${payrollId} approved by ${currentUser.name}. Ready for disbursement!`, 'success');
  };

  const disbursePayrollRun = (_payrollId: string) => {
    showToast('Manual payroll payment recording is pending backend integration. No funds were disbursed.', 'error');
  };

  const transferStock = (
    stockItemId: string,
    fromLocId: string,
    toLocId: string,
    quantity: number,
    reason: string
  ) => {
    const stk = stockItems.find(s => s.id === stockItemId);
    const fromLoc = stockLocations.find(l => l.id === fromLocId);
    const toLoc = stockLocations.find(l => l.id === toLocId);
    if (!stk || !fromLoc || !toLoc) return;

    const now = new Date().toISOString();
    const costVal = Math.round(quantity * stk.averageUnitCost * 100) / 100;
    const transferId = `TRF-${Math.floor(1000 + Math.random() * 9000)}`;

    const outMvt: StockMovement = {
      id: `mvt-${Date.now()}-out`,
      organizationId: organization.id,
      propertyId: currentProperty.id,
      stockItemId: stk.id,
      stockItemName: stk.name,
      locationId: fromLocId,
      locationName: fromLoc.name,
      quantityDelta: -quantity,
      baseUnit: stk.baseUnit,
      movementType: 'TRANSFER_OUT',
      sourceType: 'TRANSFER',
      sourceId: transferId,
      reasonCode: reason,
      occurredAt: now,
      actorUserId: currentUser.id,
      actorName: currentUser.name,
      unitCostSnapshot: stk.averageUnitCost,
      totalCostValuation: costVal
    };

    const inMvt: StockMovement = {
      id: `mvt-${Date.now()}-in`,
      organizationId: organization.id,
      propertyId: currentProperty.id,
      stockItemId: stk.id,
      stockItemName: stk.name,
      locationId: toLocId,
      locationName: toLoc.name,
      quantityDelta: quantity,
      baseUnit: stk.baseUnit,
      movementType: 'TRANSFER_IN',
      sourceType: 'TRANSFER',
      sourceId: transferId,
      reasonCode: reason,
      occurredAt: now,
      actorUserId: currentUser.id,
      actorName: currentUser.name,
      unitCostSnapshot: stk.averageUnitCost,
      totalCostValuation: costVal
    };

    setStockMovements(prev => [outMvt, inMvt, ...prev]);

    setStockItems(prev =>
      prev.map(s => {
        if (s.id === stockItemId) {
          const fromCurrent = s.currentStock[fromLocId] || 0;
          const toCurrent = s.currentStock[toLocId] || 0;
          return {
            ...s,
            currentStock: {
              ...s.currentStock,
              [fromLocId]: Math.max(0, fromCurrent - quantity),
              [toLocId]: toCurrent + quantity
            }
          };
        }
        return s;
      })
    );
  };

  const declareWaste = (
    stockItemId: string,
    locationId: string,
    quantity: number,
    reason: string
  ) => {
    const stk = stockItems.find(s => s.id === stockItemId);
    const loc = stockLocations.find(l => l.id === locationId);
    if (!stk || !loc) return;

    const now = new Date().toISOString();
    const costVal = Math.round(quantity * stk.averageUnitCost * 100) / 100;
    const wasteEventId = `WST-${Math.floor(1000 + Math.random() * 9000)}`;

    const mvt: StockMovement = {
      id: `mvt-${Date.now()}-wst`,
      organizationId: organization.id,
      propertyId: currentProperty.id,
      stockItemId: stk.id,
      stockItemName: stk.name,
      locationId: loc.id,
      locationName: loc.name,
      quantityDelta: -quantity,
      baseUnit: stk.baseUnit,
      movementType: 'WASTE',
      sourceType: 'WASTE_EVENT',
      sourceId: wasteEventId,
      reasonCode: reason,
      occurredAt: now,
      actorUserId: currentUser.id,
      actorName: currentUser.name,
      unitCostSnapshot: stk.averageUnitCost,
      totalCostValuation: costVal
    };

    setStockMovements(prev => [mvt, ...prev]);

    setStockItems(prev =>
      prev.map(s => {
        if (s.id === stockItemId) {
          const curr = s.currentStock[locationId] || 0;
          return {
            ...s,
            currentStock: {
              ...s.currentStock,
              [locationId]: Math.max(0, curr - quantity)
            }
          };
        }
        return s;
      })
    );

    // Double-entry posting: Dr. Waste Expense (5050), Cr. Inventory Asset (1200)
    const je: JournalEntry = {
      id: `je-wst-${Date.now()}`,
      entryNumber: `JE-WST-${Math.floor(10000 + Math.random() * 90000)}`,
      propertyId: currentProperty.id,
      occurredAt: now,
      postedAt: now,
      sourceType: 'WASTE',
      sourceId: wasteEventId,
      memo: `Waste declaration for ${quantity} ${stk.baseUnit} of ${stk.name} (${reason})`,
      totalDebit: costVal,
      totalCredit: costVal,
      balanced: true,
      lines: [
        {
          id: `jl-${Date.now()}-w1`,
          accountId: 'acc-5050',
          accountCode: '5050',
          accountName: 'Waste & Spillage Loss',
          debit: costVal,
          credit: 0,
          description: `Waste loss: ${reason}`
        },
        {
          id: `jl-${Date.now()}-w2`,
          accountId: 'acc-1200',
          accountCode: '1200',
          accountName: 'Inventory Asset (F&B Stock)',
          debit: 0,
          credit: costVal,
          description: `Inventory write-down`
        }
      ]
    };
    setJournalEntries(prev => [je, ...prev]);
  };

  const recordStockCountAdjustment = (
    stockItemId: string,
    locationId: string,
    countedQty: number,
    notes: string
  ) => {
    const stk = stockItems.find(s => s.id === stockItemId);
    const loc = stockLocations.find(l => l.id === locationId);
    if (!stk || !loc) return;

    const currentQty = stk.currentStock[locationId] || 0;
    const diff = countedQty - currentQty;
    if (diff === 0) return;

    const now = new Date().toISOString();
    const costVal = Math.round(Math.abs(diff) * stk.averageUnitCost * 100) / 100;
    const countId = `CNT-${Math.floor(1000 + Math.random() * 9000)}`;

    const mvt: StockMovement = {
      id: `mvt-${Date.now()}-cnt`,
      organizationId: organization.id,
      propertyId: currentProperty.id,
      stockItemId: stk.id,
      stockItemName: stk.name,
      locationId: loc.id,
      locationName: loc.name,
      quantityDelta: diff,
      baseUnit: stk.baseUnit,
      movementType: 'COUNT_ADJUSTMENT',
      sourceType: 'STOCKTAKE',
      sourceId: countId,
      reasonCode: notes || 'Physical Stocktake Count Variance',
      occurredAt: now,
      actorUserId: currentUser.id,
      actorName: currentUser.name,
      unitCostSnapshot: stk.averageUnitCost,
      totalCostValuation: costVal
    };

    setStockMovements(prev => [mvt, ...prev]);

    setStockItems(prev =>
      prev.map(s => {
        if (s.id === stockItemId) {
          return {
            ...s,
            currentStock: {
              ...s.currentStock,
              [locationId]: countedQty
            }
          };
        }
        return s;
      })
    );
  };

  // Hotel PMS Actions
  const updateRoomStatus = (roomId: string, status: HotelRoom['status']) => {
    setHotelRooms(prev =>
      prev.map(r => (r.id === roomId ? { ...r, status } : r))
    );
  };

  const postMinibarConsumption = (
    roomId: string,
    itemsConsumed: { stockItemId: string; qty: number }[]
  ) => {
    const room = hotelRooms.find(r => r.id === roomId);
    if (!room || !room.currentGuestStayId) return;

    const stay = guestStays.find(s => s.id === room.currentGuestStayId);
    if (!stay) return;

    let totalCharge = 0;
    const descriptionParts: string[] = [];

    itemsConsumed.forEach(cons => {
      const mbItem = room.minibarItems.find(m => m.stockItemId === cons.stockItemId);
      if (mbItem && cons.qty > 0) {
        const itemCharge = mbItem.price * cons.qty;
        totalCharge += itemCharge;
        descriptionParts.push(`${cons.qty}x ${mbItem.name}`);

        // Deplete stock
        const stk = stockItems.find(s => s.id === cons.stockItemId);
        if (stk) {
          const mvt: StockMovement = {
            id: `mvt-${Date.now()}-mb`,
            organizationId: organization.id,
            propertyId: currentProperty.id,
            stockItemId: stk.id,
            stockItemName: stk.name,
            locationId: 'loc-minibar-depot',
            locationName: `Room ${room.roomNumber} Minibar`,
            quantityDelta: -cons.qty,
            baseUnit: stk.baseUnit,
            movementType: 'SALE_CONSUMPTION',
            sourceType: 'MINIBAR',
            sourceId: `MB-${room.roomNumber}`,
            reasonCode: 'Guest Minibar Consumption',
            occurredAt: new Date().toISOString(),
            actorUserId: currentUser.id,
            actorName: currentUser.name,
            unitCostSnapshot: stk.averageUnitCost,
            totalCostValuation: Math.round(cons.qty * stk.averageUnitCost * 100) / 100
          };
          setStockMovements(prev => [mvt, ...prev]);
        }
      }
    });

    if (totalCharge === 0) return;

    // Post to Folio
    const entry: FolioEntry = {
      id: `fe-${Date.now()}`,
      folioId: stay.folioId,
      occurredAt: new Date().toISOString(),
      type: 'CHARGE',
      category: 'MINIBAR',
      description: `Minibar Consumption (${descriptionParts.join(', ')})`,
      amount: totalCharge,
      postedBy: `Housekeeping / ${currentUser.name}`
    };

    setGuestFolios(prev =>
      prev.map(f => {
        if (f.id === stay.folioId) {
          return {
            ...f,
            entries: [entry, ...f.entries],
            totalCharges: f.totalCharges + totalCharge,
            balanceDue: f.balanceDue + totalCharge
          };
        }
        return f;
      })
    );
  };

  const settleGuestFolio = (folioId: string, tenderType: 'CASH' | 'MPESA' | 'CARD') => {
    const folio = guestFolios.find(f => f.id === folioId);
    if (!folio || folio.balanceDue <= 0) return;

    const amount = folio.balanceDue;
    const refNum = `${tenderType}-${Math.floor(10000 + Math.random() * 90000)}`;

    const entry: FolioEntry = {
      id: `fe-${Date.now()}`,
      folioId: folio.id,
      occurredAt: new Date().toISOString(),
      type: 'PAYMENT',
      category: 'PAYMENT',
      description: `Folio Settlement at Checkout via ${tenderType} (${refNum})`,
      amount: -amount,
      postedBy: currentUser.name
    };

    setGuestFolios(prev =>
      prev.map(f => {
        if (f.id === folioId) {
          return {
            ...f,
            entries: [entry, ...f.entries],
            totalPayments: f.totalPayments + amount,
            balanceDue: 0,
            isClosed: true
          };
        }
        return f;
      })
    );

    // Update guest stay status
    setGuestStays(prev =>
      prev.map(s => (s.folioId === folioId ? { ...s, status: 'CHECKED_OUT' } : s))
    );

    // Update room status to DIRTY
    const stay = guestStays.find(s => s.folioId === folioId);
    if (stay) {
      setHotelRooms(prev =>
        prev.map(r =>
          r.roomNumber === stay.roomNumber
            ? { ...r, status: 'DIRTY', currentGuestStayId: undefined, currentGuestName: undefined }
            : r
        )
      );
    }
  };

  // Procurement Actions
  const createPurchaseOrder = (
    supplierId: string,
    items: { stockItemId: string; quantity: number; unitPrice: number }[]
  ) => {
    const sup = suppliers.find(s => s.id === supplierId);
    if (!sup) return;

    const poItems = items.map(it => {
      const stk = stockItems.find(s => s.id === it.stockItemId);
      return {
        stockItemId: it.stockItemId,
        stockItemName: stk?.name || 'Item',
        quantityOrdered: it.quantity,
        unitPrice: it.unitPrice,
        unitSymbol: stk?.baseUnit || 'unit',
        lineTotal: it.quantity * it.unitPrice
      };
    });

    const subtotal = poItems.reduce((acc, i) => acc + i.lineTotal, 0);
    const taxTotal = Math.round(subtotal * 0.16 * 100) / 100;
    const grandTotal = subtotal + taxTotal;

    const po: PurchaseOrder = {
      id: `po-${Date.now()}`,
      poNumber: `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      supplierId: sup.id,
      supplierName: sup.name,
      propertyId: currentProperty.id,
      createdAt: new Date().toISOString(),
      status: 'APPROVED',
      approvedBy: currentUser.name,
      subtotal,
      taxTotal,
      grandTotal,
      items: poItems
    };

    setPurchaseOrders(prev => [po, ...prev]);
  };

  const receivePurchaseOrder = (poId: string, receivedNotes = 'Goods verified and received in good condition') => {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;

    const grnNumber = `GRN-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();
    const updatedItems = po.items.map(it => ({
      ...it,
      quantityReceived: it.quantityOrdered,
      quantityRejected: 0
    }));

    // Add stock movements into Central Warehouse
    const movements: StockMovement[] = [];
    updatedItems.forEach(it => {
      const stk = stockItems.find(s => s.id === it.stockItemId);
      if (stk) {
        movements.push({
          id: `mvt-${Date.now()}-${it.stockItemId}`,
          organizationId: organization.id,
          propertyId: currentProperty.id,
          stockItemId: stk.id,
          stockItemName: stk.name,
          locationId: 'loc-warehouse',
          locationName: 'Central Warehouse Depot',
          quantityDelta: it.quantityOrdered,
          baseUnit: it.unitSymbol,
          movementType: 'PURCHASE_RECEIPT',
          sourceType: 'PURCHASE',
          sourceId: po.poNumber,
          reasonCode: `Received via ${grnNumber} (${receivedNotes})`,
          occurredAt: now,
          actorUserId: currentUser.id,
          actorName: currentUser.name,
          unitCostSnapshot: it.unitPrice,
          totalCostValuation: it.lineTotal
        });
      }
    });

    setStockMovements(prev => [...movements, ...prev]);

    // Update stock levels
    setStockItems(prev =>
      prev.map(s => {
        const itemMove = movements.find(m => m.stockItemId === s.id);
        if (itemMove) {
          const curr = s.currentStock['loc-warehouse'] || 0;
          return {
            ...s,
            currentStock: {
              ...s.currentStock,
              'loc-warehouse': curr + itemMove.quantityDelta
            }
          };
        }
        return s;
      })
    );

    // Update PO status
    setPurchaseOrders(prev =>
      prev.map(p =>
        p.id === poId
          ? {
              ...p,
              status: 'RECEIVED',
              grnNumber,
              supplierInvoiceNumber: `INV-${po.supplierName.substring(0, 3).toUpperCase()}-${Math.floor(10000 + Math.random() * 90000)}`,
              items: updatedItems
            }
          : p
      )
    );

    // Post to General Ledger: Dr. Inventory Asset (1200), Cr. Accounts Payable (2010)
    const je: JournalEntry = {
      id: `je-po-${Date.now()}`,
      entryNumber: `JE-AP-${Math.floor(10000 + Math.random() * 90000)}`,
      propertyId: currentProperty.id,
      occurredAt: now,
      postedAt: now,
      sourceType: 'PURCHASE',
      sourceId: po.poNumber,
      memo: `Goods receipt ${grnNumber} from ${po.supplierName}`,
      totalDebit: po.grandTotal,
      totalCredit: po.grandTotal,
      balanced: true,
      lines: [
        {
          id: `jl-${Date.now()}-po1`,
          accountId: 'acc-1200',
          accountCode: '1200',
          accountName: 'Inventory Asset (F&B Stock)',
          debit: po.grandTotal,
          credit: 0,
          description: `Inventory receipt from ${po.supplierName}`
        },
        {
          id: `jl-${Date.now()}-po2`,
          accountId: 'acc-2010',
          accountCode: '2010',
          accountName: 'Accounts Payable (Trade Suppliers)',
          debit: 0,
          credit: po.grandTotal,
          description: `Supplier invoice payable to ${po.supplierName}`
        }
      ]
    };
    setJournalEntries(prev => [je, ...prev]);
  };

  // Control Engine Alerts & Approvals
  const acknowledgeAlert = (alertId: string, note?: string) => {
    setAnomalyAlerts(prev =>
      prev.map(a => (a.id === alertId ? { ...a, status: 'ACKNOWLEDGED', resolverNote: note } : a))
    );
  };

  const resolveAlert = (alertId: string, resolutionNote: string) => {
    setAnomalyAlerts(prev =>
      prev.map(a =>
        a.id === alertId
          ? {
              ...a,
              status: 'RESOLVED',
              resolvedAt: new Date().toISOString(),
              resolverNote: resolutionNote
            }
          : a
      )
    );
  };

  const handleApproval = (requestId: string, approved: boolean, reason = '') => {
    setApprovalRequests(prev =>
      prev.map(r =>
        r.id === requestId
          ? {
              ...r,
              status: approved ? 'APPROVED' : 'REJECTED',
              reviewedBy: currentUser.name,
              reviewedAt: new Date().toISOString(),
              reviewReason: reason
            }
          : r
      )
    );
  };

  // Offline Mode & IndexedDB Automated Synchronization
  const toggleOfflineMode = async () => {
    const nextState = !isOffline;
    setIsOffline(nextState);
    if (!nextState) {
      showToast('Network restored. Synchronizing IndexedDB offline queue...', 'info');
      await syncOfflineQueue();
    } else {
      showToast('Offline Mode Active: POS transactions will cache in IndexedDB.', 'info');
    }
  };

  const syncOfflineQueue = async () => {
    showToast('Browser preview has no server connection. No transactions were synchronized.', 'info');
  };

  const triggerEdgePrint = (documentType: 'RECEIPT' | 'KITCHEN_TICKET', payload: any) => {
    const timestamp = new Date().toLocaleTimeString();
    setLastEdgeEvent(`[Edge LAN Agent] Printed ${documentType} at ${timestamp}: ${JSON.stringify(payload).slice(0, 70)}...`);
  };

  const triggerCashDrawerKick = () => {
    const timestamp = new Date().toLocaleTimeString();
    setLastEdgeEvent(`[Edge LAN Agent] 24V Solenoid Cash Drawer pulse emitted at ${timestamp}`);
  };

  const updateEdgeDeviceStatus = (deviceId: string, status: EdgeDeviceStatus, errorMessage?: string) => {
    setEdgeDevices(prev =>
      prev.map(d =>
        d.id === deviceId
          ? {
              ...d,
              status,
              errorMessage: status === 'ERROR' ? (errorMessage || 'Hardware fault or interface timeout') : undefined,
              lastPing: new Date().toISOString()
            }
          : d
      )
    );
    showToast(
      `Device ${deviceId} is now ${status}${errorMessage ? `: ${errorMessage}` : ''}`,
      status === 'ONLINE' ? 'success' : status === 'ERROR' ? 'error' : 'info'
    );
  };

  const reconnectAllEdgeDevices = () => {
    setEdgeDevices(prev =>
      prev.map(d => ({
        ...d,
        status: 'ONLINE',
        errorMessage: undefined,
        lastPing: new Date().toISOString()
      }))
    );
    showToast('All connected edge peripherals re-scanned and marked ONLINE', 'success');
  };

  // North Star Traceability Evidence Search ("Where did this shilling, bottle, or variance come from?")
  const traceEvidence = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return { type: 'NONE' as const };

    // 1. Search Orders
    const orderMatch = orders.find(
      o => o.orderNumber.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    );
    if (orderMatch) {
      const orderMvts = stockMovements.filter(m => m.sourceId === orderMatch.orderNumber);
      const je = journalEntries.find(j => j.sourceId === orderMatch.orderNumber);
      const fiscal = etimsInvoices.find(f => f.orderId === orderMatch.id);
      const payment = payments.find(p => p.orderId === orderMatch.id);
      return {
        type: 'ORDER' as const,
        order: orderMatch,
        movements: orderMvts,
        journalEntry: je,
        fiscalInvoice: fiscal,
        payment
      };
    }

    // 2. Search Stock Item
    const stockMatch = stockItems.find(
      s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
    if (stockMatch) {
      const movements = stockMovements.filter(m => m.stockItemId === stockMatch.id);
      return {
        type: 'STOCK' as const,
        stockItem: stockMatch,
        movements
      };
    }

    // 3. Search Folio
    const folioMatch = guestFolios.find(
      f =>
        f.id.toLowerCase().includes(q) ||
        f.guestName.toLowerCase().includes(q) ||
        f.roomNumber.toLowerCase().includes(q)
    );
    if (folioMatch) {
      return {
        type: 'FOLIO' as const,
        folio: folioMatch
      };
    }

    // 4. Search Journal Entry
    const jeMatch = journalEntries.find(
      j =>
        j.entryNumber.toLowerCase().includes(q) ||
        j.memo.toLowerCase().includes(q) ||
        j.lines.some(l => l.accountCode.includes(q) || l.accountName.toLowerCase().includes(q))
    );
    if (jeMatch) {
      return {
        type: 'JOURNAL' as const,
        journalEntry: jeMatch
      };
    }

    return { type: 'NONE' as const };
  };

  return (
    <ServOSContext.Provider
      value={{
        userRole,
        setUserRole,
        switchUserRole,
        userPermissions,
        isTabAllowed,
        availableRoles,
        organization,
        currentProperty,
        updateProperty,
        outlets,
        addOutlet,
        updateOutlet,
        currentOutlet,
        setCurrentOutlet,
        terminals,
        currentTerminal,
        currentUser,
        setCurrentUser,
        employees,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        leaveRequests,
        submitLeaveRequest,
        approveLeaveRequest,
        rejectLeaveRequest,
        shiftSchedules,
        clockInShift,
        clockOutShift,
        createShiftSchedule,
        payrollRuns,
        generatePayrollRun,
        approvePayrollRun,
        disbursePayrollRun,
        salaryAdvances,
        requestSalaryAdvance,
        approveSalaryAdvance,
        stockItems,
        addStockItem,
        updateStockItem,
        deleteStockItem,
        stockLocations,
        stockMovements,
        products,
        addProduct,
        updateProduct,
        deleteProduct,
        transferStock,
        declareWaste,
        recordStockCountAdjustment,
        tables,
        addTable,
        updateTable,
        deleteTable,
        activeOrder,
        orders,
        createOrderForTable,
        createQuickBarTab,
        selectOrder,
        addItemToOrder,
        updateItemSeatAndCourse,
        fireHeldCourse,
        removeItemFromOrder,
        sendOrderToKitchenAndBar,
        applyCompToItem,
        applyOrderDiscount,
        voidOrder,
        transferOrderToTable,
        bumpKdsTicket,
        recallKdsTicket,
        toast,
        showToast,
        closeToast,
        processPayment,
        tillSession,
        openTillSession,
        closeTillSession,
        recordCashPaidInOut,
        accounts,
        journalEntries,
        etimsInvoices,
        hotelRooms,
        guestStays,
        guestFolios,
        updateRoomStatus,
        postMinibarConsumption,
        settleGuestFolio,
        suppliers,
        purchaseOrders,
        receivePurchaseOrder,
        createPurchaseOrder,
        anomalyAlerts,
        approvalRequests,
        acknowledgeAlert,
        resolveAlert,
        handleApproval,
        isOffline,
        toggleOfflineMode,
        offlineQueueCount: offlineQueue.length,
        syncOfflineQueue,
        edgeDevices,
        updateEdgeDeviceStatus,
        reconnectAllEdgeDevices,
        triggerEdgePrint,
        triggerCashDrawerKick,
        lastEdgeEvent,
        traceEvidence
      }}
    >
      {children}
    </ServOSContext.Provider>
  );
};

export const useServOS = () => {
  const context = useContext(ServOSContext);
  if (!context) {
    throw new Error('useServOS must be used within a ServOSProvider');
  }
  return context;
};
