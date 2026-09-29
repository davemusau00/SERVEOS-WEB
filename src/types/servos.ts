/**
 * ServOS - Hospitality Operating System
 * Domain Types Specification (Baseline v1.0)
 */

// Business Organization Hierarchy
export interface Organization {
  id: string;
  name: string;
  code: string;
  baseCurrency: string;
}

export interface Property {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  currency: string;
  timezone: string;
  kraPin: string;
  etimsCuNumber: string;
  etimsCuSerialNumber?: string;
}

export interface Outlet {
  id: string;
  propertyId: string;
  name: string;
  code?: string;
  type: string;
  defaultStockLocationId?: string;
  active?: boolean;
}

export interface Terminal {
  id: string;
  propertyId: string;
  outletId: string;
  name: string;
  hardwareSerial: string;
  isEdgeConnected: boolean;
  assignedCashierId?: string;
  currentTillSessionId?: string;
}

// Measurement & Catalog
export type UnitDimension = 'COUNT' | 'VOLUME' | 'MASS' | 'TIME' | 'CAPACITY' | 'CURRENCY';

export interface MeasurementUnit {
  id: string;
  name: string;
  symbol: string;
  dimension: UnitDimension;
  isBase: boolean;
  baseUnitId?: string;
  conversionFactor: number; // e.g., 1 bottle = 750 ml -> factor = 750
}

export type ProductType =
  | 'STOCK_ITEM'
  | 'PORTION'
  | 'RECIPE'
  | 'PACKAGE'
  | 'SERVICE'
  | 'ROOM'
  | 'TICKET'
  | 'OPEN_PRICE';

export type ConsumptionMethod =
  | 'UNIT'
  | 'MEASURED'
  | 'RECIPE'
  | 'SESSION'
  | 'TIME'
  | 'CAPACITY'
  | 'NONE';

export interface RecipeIngredient {
  stockItemId: string;
  quantity: number; // in stockItem base unit (e.g., 30 for 30ml)
  unitSymbol: string;
  tracked: boolean;
}

export interface RecipeModifier {
  id: string;
  name: string;
  priceDelta: number;
  ingredientAdjustments: {
    stockItemId: string;
    quantityDelta: number; // e.g., +30 for extra gin, -0.5 for no lime
  }[];
}

export interface ProductSellable {
  id: string;
  code: string;
  /** Physical retail barcode, stored as text so leading zeroes are preserved. */
  barcode?: string;
  name: string;
  category: 'SPIRITS' | 'BEER' | 'WINE' | 'COCKTAIL' | 'FOOD' | 'PACKAGE' | 'ROOM' | 'EXPERIENCE';
  productType?: ProductType;
  consumptionMethod?: ConsumptionMethod;
  price: number; // In base currency KES
  basePrice?: number;
  costPrice?: number;
  etimsTaxCode?: string;
  description?: string;
  taxClassId?: 'A_16' | 'B_0' | 'C_EXEMPT';
  outletIds: string[];
  stockItemId?: string;
  portionVolume?: number; // e.g. 30 for shot, 60 for double, 750 for bottle
  portionUnitSymbol?: string;
  portionUnit?: string;
  recipeIngredients?: RecipeIngredient[];
  modifiers?: RecipeModifier[];
  packageMixersCount?: number;
  available?: boolean;
  routeTo: 'BAR' | 'KITCHEN' | 'SERVICE';
}

// Inventory & Stock Movement Ledger
export type MovementType =
  | 'PURCHASE_RECEIPT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'SALE_CONSUMPTION'
  | 'PRODUCTION_INPUT'
  | 'PRODUCTION_OUTPUT'
  | 'WASTE'
  | 'COMP_CONSUMPTION'
  | 'COUNT_ADJUSTMENT'
  | 'RETURN_TO_SUPPLIER';

export interface StockLocation {
  id: string;
  propertyId: string;
  name: string;
  type: 'WAREHOUSE' | 'BAR_STORE' | 'KITCHEN_STORE' | 'MINIBAR' | 'STATION';
}

export interface StockItem {
  id: string;
  code: string;
  /** Physical package barcode; distinct from the internal stock code. */
  barcode?: string;
  /** Quantity represented by one package scan, in baseUnit. */
  scanUnitQuantity?: number;
  name: string;
  dimension: UnitDimension;
  baseUnit: string; // 'ml', 'g', 'unit'
  parLevel: number;
  reorderPoint: number;
  minimumStockLevel?: number;
  lastStocktakeDate?: string;
  currentStock: Record<string, number>; // locationId -> current quantity in base unit
  averageUnitCost: number; // KES per base unit
  category: string;
}

export interface StockMovement {
  id: string;
  organizationId: string;
  propertyId: string;
  stockItemId: string;
  stockItemName: string;
  locationId: string;
  locationName: string;
  quantityDelta: number; // Positive or negative in base unit
  baseUnit: string;
  movementType: MovementType;
  sourceType?: 'ORDER' | 'TRANSFER' | 'PURCHASE' | 'WASTE_EVENT' | 'STOCKTAKE' | 'MINIBAR';
  sourceId?: string;
  reasonCode?: string;
  occurredAt: string;
  actorUserId: string;
  actorName: string;
  unitCostSnapshot: number;
  totalCostValuation: number;
}

// Table & Order Domain
export type TableState = 'AVAILABLE' | 'SEATED' | 'ORDERING' | 'SERVED' | 'PAYMENT_DUE' | 'CLEANING';
export type OrderState = 'DRAFT' | 'OPEN' | 'SENT' | 'PARTIALLY_SERVED' | 'COMPLETED' | 'VOIDED';
export type OrderItemState = 'OPEN' | 'ROUTED' | 'PREPARING' | 'READY' | 'SERVED' | 'VOIDED';

export interface RestaurantTable {
  id: string;
  propertyId: string;
  outletId: string;
  label: string;
  capacity: number;
  section: 'VIP_LOUNGE' | 'MAIN_DECK' | 'TERRACE' | 'GRILL_ROOM';
  state: TableState;
  currentOrderId?: string;
  minimumSpend?: number; // e.g. KES 50,000 for VIP tables
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  portionName?: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  cateringLevy: number;
  totalPrice: number;
  modifiers: {
    modifierId: string;
    name: string;
    priceDelta: number;
  }[];
  selectedMixers?: string[];
  state: OrderItemState;
  sentAt?: string;
  kitchenNote?: string;
  seatLabel?: string; // e.g. "Seat 1", "Seat 2", "Shared"
  courseName?: 'Drinks' | 'Starters' | 'Mains' | 'Dessert';
  courseStatus?: 'HELD' | 'FIRED';
  isComp?: boolean;
  compReason?: string;
  compApprovedBy?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  propertyId: string;
  outletId: string;
  terminalId: string;
  tableId?: string;
  tableName?: string;
  tabName?: string;
  guestFolioId?: string; // If charged to hotel room
  serverEmployeeId: string;
  serverName: string;
  state: OrderState;
  items: OrderItem[];
  subtotal: number;
  taxTotal: number; // 16% VAT
  cateringLevyTotal: number; // 2% Catering Levy
  shortfallAdjustment: number; // Minimum spend adjustment
  discountTotal: number;
  discountReason?: string;
  grandTotal: number;
  amountPaid: number;
  createdAt: string;
  completedAt?: string;
  paymentMethod?: string;
  etimsInvoiceNumber?: string;
  etimsQrCode?: string;
  journalEntryId?: string;
  isOfflineCreated?: boolean;
}

// Payments & Cash Management
export type PaymentState = 'REQUESTED' | 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REVERSED' | 'REFUNDED';
export type TenderType = 'CASH' | 'MPESA' | 'CARD' | 'ROOM_CHARGE' | 'COMPANY_CREDIT';

export interface PaymentRecord {
  id: string;
  orderId?: string;
  folioId?: string;
  propertyId: string;
  tenderType: TenderType;
  amount: number;
  currency: string;
  status: PaymentState;
  referenceNumber: string;
  providerMetadata?: {
    mpesaReceipt?: string;
    phoneNumber?: string;
    cardAuthCode?: string;
    cardLast4?: string;
    guestRoomNumber?: string;
  };
  cashTendered?: number;
  changeGiven?: number;
  occurredAt: string;
  cashierId: string;
  cashierName: string;
}

export interface TillSession {
  id: string;
  terminalId: string;
  terminalName: string;
  employeeId: string;
  employeeName: string;
  openedAt: string;
  openingFloat: number;
  cashSalesTotal: number;
  cashPaidIn: number;
  cashPaidOut: number;
  expectedCashInDrawer: number;
  countedCashAtClose?: number;
  cashVariance?: number;
  closedAt?: string;
  status: 'OPEN' | 'CLOSED';
}

// Accounting Engine (Double-Entry Ledger)
export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balance: number;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  propertyId: string;
  occurredAt: string;
  postedAt: string;
  sourceType: 'SALE' | 'PURCHASE' | 'WASTE' | 'ROOM_CHARGE' | 'PAYMENT' | 'COUNT_ADJUSTMENT' | 'REFUND';
  sourceId: string;
  memo: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

// Kenya eTIMS Fiscal Integration
export interface EtimsFiscalInvoice {
  id: string;
  orderId: string;
  invoiceNumber: string;
  cuSerialNumber: string;
  customerPin?: string;
  customerName?: string;
  taxableAmount: number;
  vatAmount: number;
  levyAmount: number;
  totalAmount: number;
  qrCodeUrl: string;
  fiscalDate: string;
  status: 'FISCALIZED' | 'PENDING' | 'FAILED';
  verificationHash: string;
}

// Hotel PMS & Folios
export interface RoomType {
  id: string;
  name: string;
  baseRate: number;
  maxGuests: number;
  features: string[];
}

export type RoomOperationalStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'DIRTY'
  | 'CLEANING'
  | 'INSPECTION'
  | 'OUT_OF_ORDER';

export interface HotelRoom {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  floor: number;
  status: RoomOperationalStatus;
  currentGuestStayId?: string;
  currentGuestName?: string;
  minibarItems: {
    stockItemId: string;
    name: string;
    expectedQty: number;
    currentQty: number;
    price: number;
  }[];
}

export interface GuestStay {
  id: string;
  reservationId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  roomNumber: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  creditLimit: number;
  allowRoomCharge: boolean;
  status: 'RESERVED' | 'CHECKED_IN' | 'CHECKED_OUT';
  folioId: string;
}

export interface FolioEntry {
  id: string;
  folioId: string;
  occurredAt: string;
  type: 'CHARGE' | 'PAYMENT' | 'CREDIT' | 'TRANSFER';
  category: 'ROOM' | 'F&B_BAR' | 'F&B_KITCHEN' | 'MINIBAR' | 'LAUNDRY' | 'PAYMENT';
  description: string;
  amount: number; // positive for charges, negative for payments/credits
  referenceId?: string;
  postedBy: string;
}

export interface GuestFolio {
  id: string;
  stayId: string;
  guestName: string;
  roomNumber: string;
  entries: FolioEntry[];
  totalCharges: number;
  totalPayments: number;
  balanceDue: number;
  isClosed: boolean;
}

// Procurement
export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  email: string;
  kraPin: string;
  paymentTermsDays: number;
}

export interface PurchaseOrderItem {
  stockItemId: string;
  stockItemName: string;
  /** Ordered in the stock item's base unit. */
  quantityOrdered: number;
  /** Agreed cost per stock base unit, in KES. */
  unitPrice: number;
  unitSymbol: string;
  lineTotal: number;
  scanUnitQuantity?: number;
  quantityDelivered?: number;
  quantityReceived?: number;
  quantityRejected?: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  propertyId: string;
  createdAt: string;
  status: 'DRAFT' | 'APPROVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'INVOICED';
  items: PurchaseOrderItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  approvedBy?: string;
  grnNumber?: string;
  supplierInvoiceNumber?: string;
}

export type SupplierPayableStatus = 'RECEIVED_UNINVOICED' | 'MATCHED_UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface SupplierPayable {
  id: string;
  payableNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string;
  goodsReceiptId: string;
  grnNumber: string;
  amount: number;
  paidAmount: number;
  amountDue: number;
  status: SupplierPayableStatus;
  supplierInvoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
}

export interface SupplierPayment {
  id: string;
  paymentNumber: string;
  supplierId: string;
  supplierName: string;
  supplierPayableId: string;
  supplierInvoiceNumber: string;
  amount: number;
  method: 'CASH' | 'BANK' | 'MPESA';
  reference: string;
  reason: string;
  status: 'MANUALLY_CONFIRMED';
  occurredAt: string;
}

// User Roles & Authentication Permissions Context
export type UserRole = 'Admin' | 'Manager' | 'Server';

export interface RolePermissions {
  role: UserRole;
  label: string;
  description: string;
  allowedTabs: string[];
  canApproveDiscounts: boolean;
  canVoidOrders: boolean;
  canAdjustStock: boolean;
  canManageProcurement: boolean;
  canAccessAccounting: boolean;
  canAccessControlEngine: boolean;
  canManageStaffPayroll: boolean;
  canAccessHardwareSettings: boolean;
}

export const ROLE_DEFINITIONS: Record<UserRole, RolePermissions> = {
  Admin: {
    role: 'Admin',
    label: 'Executive Admin (Full Access)',
    description: 'Complete system authority across ERP, Command Centre, Catalog, CRM, Events, Accounting, Control Engine & System Configuration',
    allowedTabs: ['command', 'pos', 'host', 'kds', 'hotel', 'catalog', 'crm', 'events', 'inventory', 'procurement', 'accounting', 'control', 'staff', 'settings', 'reports', 'tender', 'batch', 'help'],
    canApproveDiscounts: true,
    canVoidOrders: true,
    canAdjustStock: true,
    canManageProcurement: true,
    canAccessAccounting: true,
    canAccessControlEngine: true,
    canManageStaffPayroll: true,
    canAccessHardwareSettings: true,
  },
  Manager: {
    role: 'Manager',
    label: 'F&B & Hotel Operations Manager',
    description: 'Operational manager with supervisor authority, anomaly audits, discount approvals, reservations & stock transfers',
    allowedTabs: ['command', 'pos', 'host', 'kds', 'hotel', 'catalog', 'crm', 'events', 'inventory', 'procurement', 'accounting', 'control', 'staff', 'settings', 'reports', 'tender', 'batch', 'help'],
    canApproveDiscounts: true,
    canVoidOrders: true,
    canAdjustStock: true,
    canManageProcurement: true,
    canAccessAccounting: true,
    canAccessControlEngine: true,
    canManageStaffPayroll: true,
    canAccessHardwareSettings: true,
  },
  Server: {
    role: 'Server',
    label: 'Floor Server & Bartender',
    description: 'POS floorplan, tables, room charge posting, fast customer loyalty lookup, and kitchen/bar KDS pass workflow',
    allowedTabs: ['pos', 'host', 'kds', 'hotel', 'crm', 'events', 'staff', 'help'],
    canApproveDiscounts: false,
    canVoidOrders: false,
    canAdjustStock: false,
    canManageProcurement: false,
    canAccessAccounting: false,
    canAccessControlEngine: false,
    canManageStaffPayroll: false,
    canAccessHardwareSettings: false,
  },
};

// CRM & Loyalty 360
export type CustomerVipTier = 'REGULAR' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'VIP_BLACK';

export interface CustomerActivity {
  id: string;
  date: string;
  type: 'BAR' | 'HOTEL' | 'EVENT' | 'DINING' | 'REWARD_REDEMPTION';
  amount: number;
  description: string;
  referenceId?: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  vipTier: CustomerVipTier;
  loyaltyPoints: number;
  totalSpendKes: number;
  visitCount: number;
  hotelNightsCount: number;
  avgSpendPerVisit: number;
  lastVisitDate: string;
  favouriteDrink: string;
  preferredTable: string;
  notes: string;
  tags: string[];
  birthDate?: string;
  companyName?: string;
  creditLimitKes: number;
  creditBalanceKes: number;
  timeline: CustomerActivity[];
  status: 'ACTIVE' | 'VIP' | 'SUSPENDED';
}

export interface LoyaltyRewardRule {
  id: string;
  tier: CustomerVipTier;
  minSpendKes: number;
  pointsPer100Kes: number;
  perks: string[];
  birthdayVoucherKes: number;
  discountRatePct: number;
}

// Events, Nightlife, Promoters & Ticketing
export type EventStatus = 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export interface HospitalityEvent {
  id: string;
  title: string;
  subtitle: string;
  date: string; // YYYY-MM-DD
  startTime: string; // e.g. "20:00"
  endTime: string; // e.g. "04:00"
  venueSection: string; // e.g. "Main Terrace & VIP Arena"
  capacity: number;
  ticketsSold: number;
  checkedInCount: number;
  vipTablesCount: number;
  doorRevenueKes: number;
  presaleRevenueKes: number;
  status: EventStatus;
  ticketTiers: {
    name: string;
    price: number;
    allocated: number;
    sold: number;
  }[];
  headliner?: string;
  djLineup?: string[];
  minimumAge?: number;
}

export interface EventTicket {
  id: string;
  eventId: string;
  ticketNumber: string;
  tierName: string;
  priceKes: number;
  guestName: string;
  guestPhone: string;
  qrCode: string;
  isScanned: boolean;
  scannedAt?: string;
  scannedBy?: string;
  promoterId?: string;
  promoterName?: string;
  purchaseDate: string;
}

export interface Promoter {
  id: string;
  name: string;
  phone: string;
  promoCode: string;
  guestListCount: number;
  checkedInCount: number;
  vipTablesBooked: number;
  attributedSalesKes: number;
  commissionRatePct: number;
  earnedCommissionKes: number;
  paidCommissionKes: number;
  status: 'ACTIVE' | 'INACTIVE';
}

// Hotel Operations 2.0 (Housekeeping & Maintenance Work Orders)
export type HousekeepingStatus = 'CLEAN' | 'DIRTY' | 'CLEANING' | 'INSPECTION' | 'DND' | 'MAINTENANCE';

export interface HousekeepingTask {
  id: string;
  roomId: string;
  roomNumber: string;
  roomType: string;
  status: HousekeepingStatus;
  assignedStaffId?: string;
  assignedStaffName?: string;
  priority: 'NORMAL' | 'HIGH' | 'RUSH_CHECKIN';
  lastUpdated: string;
  ageMinutes: number;
  checklist: {
    bedLinen: boolean;
    bathroomSanitized: boolean;
    towelsReplaced: boolean;
    luxuryAmenities: boolean;
    waterMinibarRestocked: boolean;
    electronicsDamageCheck: boolean;
  };
  specialInstructions?: string;
}

export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MaintenanceStatus = 'REPORTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface MaintenanceWorkOrder {
  id: string;
  orderNumber: string;
  roomId: string;
  roomNumber: string;
  assetName: string;
  issueDescription: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  reportedAt: string;
  assignedTechnician?: string;
  partsUsed?: string;
  partsCostKes: number;
  laborCostKes: number;
  resolvedAt?: string;
  resolutionNotes?: string;
}

export interface HotelTapeReservation {
  id: string;
  resNumber: string;
  guestId?: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  roomNumber: string;
  roomType: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  nightsCount: number;
  adultsCount: number;
  ratePlan: 'BAR' | 'CORPORATE' | 'PACKAGE_VIP' | 'COMPLIMENTARY';
  dailyRateKes: number;
  totalAmountKes: number;
  depositPaidKes: number;
  source: 'DIRECT' | 'WALK_IN' | 'CORPORATE' | 'BOOKING_COM' | 'EXPEDIA';
  status: 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
  specialRequests?: string;
}

// Universal Task / Action Inbox
export type InboxCategory = 
  | 'APPROVAL' 
  | 'STOCK_ALERT' 
  | 'MAINTENANCE' 
  | 'HOUSEKEEPING' 
  | 'CASH_VARIANCE' 
  | 'SYNC_CONFLICT' 
  | 'OVERDUE_INVOICE' 
  | 'RESERVATION_ACTION';

export interface InboxTaskItem {
  id: string;
  category: InboxCategory;
  urgency: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  subtitle: string;
  description: string;
  amountKes?: number;
  dueTimeText?: string;
  relatedEntityId?: string;
  actionLabel: string;
  actionType: string;
  targetTab?: string;
  isCompleted: boolean;
  createdAt: string;
}

// Catalog Studio & Price Books
export interface PriceBookRule {
  id: string;
  name: string;
  type: 'HAPPY_HOUR' | 'VIP' | 'STAFF' | 'MEMBERS' | 'EVENT_NIGHT' | 'ROOM_SERVICE' | 'WHOLESALE';
  description: string;
  discountPct?: number;
  specialPriceKes?: number;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: string[];
  activeOutletIds: string[];
  applicableCategories?: string[];
  applicableProductCodes?: string[];
  active: boolean;
}

// Financial Recon & Expenses & AR
export interface ExpenseRecord {
  id: string;
  expenseNumber: string;
  title: string;
  category: 'UTILITIES' | 'MAINTENANCE' | 'STAFF_MEALS' | 'MARKETING' | 'SUPPLIES' | 'FUEL' | 'LICENSES' | 'OTHER';
  amountKes: number;
  paymentMethod: 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'PETTY_CASH';
  paidTo: string;
  costCenter: 'BAR' | 'KITCHEN' | 'HOTEL' | 'ADMIN';
  approvedBy: string;
  createdAt: string;
  notes?: string;
  receiptNumber?: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
}

export interface MpesaReconciliationRecord {
  id: string;
  mpesaReceiptNo: string;
  customerName: string;
  customerPhone: string;
  amountKes: number;
  posAmountKes: number;
  varianceKes: number;
  status: 'MATCHED' | 'UNMATCHED' | 'DISCREPANCY';
  transactionTime: string;
  servosOrderId?: string;
  servosOrderNumber?: string;
  notes?: string;
}

export interface CorporateAccount {
  id: string;
  companyName: string;
  accountNumber: string;
  kraPin: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  creditLimitKes: number;
  currentBalanceKes: number;
  overdue30DaysKes: number;
  paymentTermsDays: number;
  status: 'CURRENT' | 'OVERDUE' | 'FROZEN';
}

// Staff, HR, Roster, Leave & Payroll
export type EmployeeRole = 
  | 'WAITER' 
  | 'BARTENDER' 
  | 'CHEF' 
  | 'CASHIER' 
  | 'RECEPTIONIST' 
  | 'HOUSEKEEPER' 
  | 'MANAGER' 
  | 'ADMIN'
  | 'FINANCE';

export type ContractType = 'PERMANENT' | 'PROBATION' | 'CASUAL' | 'CONTRACT';
export type AttendanceStatus = 'ON_DUTY' | 'ON_BREAK' | 'OFF_DUTY' | 'ON_LEAVE';

export interface Employee {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  role: EmployeeRole;
  department: 'Food & Beverage' | 'Culinary / Kitchen' | 'Front Desk & Rooms' | 'Housekeeping' | 'Finance & Admin' | 'General Management';
  permissions: string[];
  activeShiftId?: string;
  hourlyRate: number;
  baseSalary: number; // Monthly base in KES
  commissionRate: number; // e.g. 0.05 (5%)
  contractType: ContractType;
  nationalId?: string;
  kraPin?: string;
  nssfNumber?: string;
  nhifNumber?: string;
  leaveBalance: number; // Entitlement days remaining
  leaveTaken: number;
  attendanceStatus?: AttendanceStatus;
  bankName?: string;
  bankAccount?: string;
  mpesaDisbursementNumber?: string;
}

export type LeaveType = 'ANNUAL' | 'SICK' | 'MATERNITY' | 'PATERNITY' | 'COMPASSIONATE' | 'UNPAID';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface StaffLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  handoverColleagueId?: string;
  handoverColleagueName?: string;
  status: LeaveStatus;
  requestedAt: string;
  reviewedBy?: string;
  reviewNotes?: string;
  reviewedAt?: string;
}

export type ShiftType = 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'DOUBLE' | 'OFF';
export type ShiftStatus = 'SCHEDULED' | 'CLOCKED_IN' | 'COMPLETED' | 'ABSENT' | 'ON_LEAVE';

export interface ShiftSchedule {
  id: string;
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // 'Monday', 'Tuesday', etc.
  shiftType: ShiftType;
  startTime: string; // e.g. '07:00'
  endTime: string; // e.g. '15:30'
  station: string; // e.g. 'Main Bar Station A', 'Hot Line Grill', 'Terrace Tables'
  status: ShiftStatus;
  clockInTime?: string;
  clockOutTime?: string;
  hoursWorked?: number;
  notes?: string;
}

export interface EmployeePayslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  role: string;
  department: string;
  kraPin: string;
  basicPay: number;
  shiftHoursWorked: number;
  overtimeHours: number;
  overtimePay: number;
  tipShare: number;
  bottleCommissions: number;
  allowances: number; // Housing/Transport/Meal allowance
  grossPay: number;
  payeTax: number;
  nssfPension: number;
  nhifInsurance: number;
  housingLevy: number;
  advancesDeducted: number;
  totalDeductions: number;
  netPay: number;
  disbursementMethod: 'MPESA_MANUAL' | 'BANK_TRANSFER' | 'CASH';
  disbursementStatus: 'PENDING' | 'DISBURSED';
  paymentReference?: string;
}

export type PayrollRunStatus = 'DRAFT' | 'APPROVED' | 'DISBURSED';

export interface PayrollRun {
  id: string;
  period: string; // e.g. "September 2026"
  runDate: string;
  status: PayrollRunStatus;
  totalGross: number;
  totalAdditions: number; // Tips + Overtime + Commissions + Allowances
  totalDeductions: number; // PAYE + NSSF + NHIF + Housing Levy + Advances
  totalNetPay: number;
  employeeCount: number;
  payslips: EmployeePayslip[];
  journalEntryId?: string;
  approvedBy?: string;
  disbursedAt?: string;
}

export interface SalaryAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'RECOVERED' | 'REJECTED';
  payrollDeductionPeriod?: string;
  approvedBy?: string;
}

// Control Engine & Anomaly Detection
export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AnomalyAlert {
  id: string;
  ruleCode:
    | 'STOCK_VARIANCE_ABOVE_TOLERANCE'
    | 'VOID_RATE_ANOMALY'
    | 'CASH_DRAWER_VARIANCE'
    | 'NEGATIVE_MARGIN_ITEM'
    | 'UNMATCHED_PAYMENT'
    | 'CREDIT_LIMIT_BREACH'
    | 'LOW_STOCK_WITH_HIGH_VELOCITY'
    | 'ROOM_MAINTENANCE_SLA_BREACH';
  title: string;
  description: string;
  severity: AnomalySeverity;
  evidence: {
    transactionId?: string;
    stockItemId?: string;
    differenceAmount?: number;
    expectedValue?: string | number;
    actualValue?: string | number;
    employeeName?: string;
    terminalName?: string;
  };
  recommendedAction: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  detectedAt: string;
  resolvedAt?: string;
  resolverNote?: string;
}

export interface ApprovalRequest {
  id: string;
  actionType: 'ORDER_VOID' | 'DISCOUNT_OVERRIDE' | 'COMP_ITEM' | 'STOCK_ADJUSTMENT' | 'REFUND';
  requestedBy: string;
  requesterName: string;
  details: string;
  amount?: number;
  targetId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

// Hardware & Edge Agent
export type EdgeDeviceType = 
  | 'RECEIPT_PRINTER' 
  | 'KITCHEN_PRINTER' 
  | 'FISCAL_PRINTER' 
  | 'CARD_READER' 
  | 'CASH_DRAWER' 
  | 'BARCODE_SCANNER' 
  | 'WEIGHING_SCALE';

export type EdgeDeviceStatus = 'ONLINE' | 'OFFLINE' | 'ERROR';

export interface EdgeDevice {
  id: string;
  name: string;
  type: EdgeDeviceType;
  connection: 'LAN' | 'USB' | 'SERIAL' | 'BLUETOOTH';
  status: EdgeDeviceStatus;
  lastPing: string;
  ipAddress?: string;
  port?: string;
  errorMessage?: string;
  paperStatus?: 'OK' | 'LOW' | 'OUT';
  batteryLevel?: number;
}

// Offline Queue & Synchronization
export type OfflineOperationType =
  | 'ORDER_CREATE'
  | 'PAYMENT_PROCESS'
  | 'KDS_BUMP'
  | 'MINIBAR_POST'
  | 'WASTE_DECLARE'
  | 'STOCK_COUNT_ADJUST';

export type OfflineOperationStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface OfflineOperation {
  id: string;
  operationType: OfflineOperationType;
  occurredAt: string;
  terminalId: string;
  terminalName: string;
  employeeId: string;
  employeeName: string;
  status: OfflineOperationStatus;
  retryCount: number;
  payload: any;
  summary: string;
  amount?: number;
  errorMessage?: string;
  syncedAt?: string;
}
