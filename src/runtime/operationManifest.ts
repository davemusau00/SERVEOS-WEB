/**
 * Cross-client operation inventory.
 *
 * This is intentionally a small, reviewable parity ledger rather than a second
 * command registry. The Rust/native dispatcher and staged PostgreSQL dispatcher
 * remain authoritative. Keep entries here whenever an operation is added or a
 * web surface is completed so missing remote actions are visible in review.
 */
export type OperationSurface = 'implemented' | 'partial' | 'missing' | 'blocked';
export type OfflineEligibility = 'eligible' | 'online-only' | 'draft-only' | 'blocked' | 'unknown';
export type ReviewStatus = 'accepted' | 'implemented' | 'needs-simplification' | 'blocked-by-domain' | 'unreviewed';

export interface OperationDefinition {
  operation: string;
  domain: 'POS' | 'KDS' | 'Inventory' | 'Procurement' | 'Rooms' | 'Finance' | 'Staff' | 'Assets' | 'Administration';
  permission: string;
  collection: string;
  native: OperationSurface;
  backend: OperationSurface;
  web: OperationSurface;
  offlineEligibility: OfflineEligibility;
  approval: 'required' | 'conditional' | 'none' | 'unknown';
  versioning: 'required' | 'not-required' | 'unknown';
  auditEffect: 'required' | 'none' | 'unknown';
  stockEffect: 'required' | 'none' | 'unknown';
  financialEffect: 'required' | 'none' | 'unknown';
  acceptanceTest: string;
  operatorUxStatus: ReviewStatus;
  notes?: string;
}

const operationDefinitions: Omit<OperationDefinition, 'offlineEligibility' | 'approval' | 'versioning' | 'auditEffect' | 'stockEffect' | 'financialEffect' | 'acceptanceTest' | 'operatorUxStatus'>[] = [
  { operation: 'business.identity', domain: 'Administration', permission: 'business.configure', collection: 'property', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Business identity and property timezone configuration.' },
  { operation: 'setup.completeStep', domain: 'Administration', permission: 'system.configure', collection: 'installation', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'setup.goLive', domain: 'Administration', permission: 'system.configure', collection: 'installation', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'record.save', domain: 'Administration', permission: 'customers.manage', collection: 'master records', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web Master Data scopes this shared command to authorized customer, supplier, room-type, and asset-category masters.' },
  { operation: 'record.archive', domain: 'Administration', permission: 'customers.manage', collection: 'master records', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Archive remains subject to server-side reference checks and optimistic concurrency.' },
  { operation: 'roomType.save', domain: 'Rooms', permission: 'rooms.manage', collection: 'roomTypes', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'ratePlan.save', domain: 'Rooms', permission: 'rooms.manage', collection: 'ratePlans', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'floorplan.save', domain: 'POS', permission: 'floorplan.manage', collection: 'tables', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'table.ready', domain: 'POS', permission: 'pos.manage_table', collection: 'tables', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'customerCredit.charge', domain: 'Finance', permission: 'credit.charge', collection: 'creditLedger', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'inventory.openingBalance', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'inventory.receive', domain: 'Inventory', permission: 'inventory.receive', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'inventory.adjust', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Dedicated reason-required Admin balance correction emits an ADMIN_CORRECTION movement in native and staged SQL sources. Spirit/wine correction accepts sealed bottles plus open ml and records the conserved breakdown. Step-up re-authentication and operator acceptance remain pending.' },
  { operation: 'catalog.createWithOpeningStock', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Terminal and Web Smart Item flows submit one atomic sellable-product/stock or stock-only ingredient command with optional opening movement. Web persists generated record IDs for drafts/retries. Recipe-only menu products use validated product.save instead, avoiding a misleading linked stock balance. Full item-type, portion, and native/Web parity remain open.' },
  { operation: 'mpesa.discrepancy', domain: 'Finance', permission: 'mpesa.reconcile', collection: 'mpesaReceipts', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'mpesa.discrepancy.resolve', domain: 'Finance', permission: 'mpesa.reconcile', collection: 'mpesaDiscrepancies', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'till.open', domain: 'Finance', permission: 'till.open', collection: 'tillSessions', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'till.cashMovement', domain: 'Finance', permission: 'till.cashMovement', collection: 'cashMovements', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'staff.changeRole', domain: 'Staff', permission: 'staff.change_role', collection: 'employees', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'staff.deactivate', domain: 'Staff', permission: 'staff.deactivate', collection: 'employees', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'staff.resetPin', domain: 'Staff', permission: 'staff.reset_pin', collection: 'employees', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'product.save', domain: 'Administration', permission: 'catalog.manage', collection: 'products', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Product saves persist recipe ingredients; Web Smart Item creates recipe-only dishes/mixed drinks through this queued operation and converts familiar units to stock units. Expansion 032 requires optimistic ingredient/outlet baselines for recipe writes. Full item-type/portion parity and operator acceptance remain pending.' },
  { operation: 'stockItem.save', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Stock master saves preserve package definitions, validate bounded unique barcode aliases, and allow sealed-container sizing for ml stock without changing a populated balance.' },
  { operation: 'stockLocation.save', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockLocations', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'supplier.save', domain: 'Procurement', permission: 'procurement.manage', collection: 'suppliers', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'supplier.archive', domain: 'Procurement', permission: 'procurement.manage', collection: 'suppliers', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'asset.save', domain: 'Assets', permission: 'assets.manage', collection: 'assets', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'asset.commission', domain: 'Assets', permission: 'assets.manage', collection: 'assetAcquisitions', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'assetCategory.save', domain: 'Assets', permission: 'assets.manage', collection: 'assetCategories', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'maintenance.report', domain: 'Assets', permission: 'maintenance.manage', collection: 'maintenanceOrders', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'room.save', domain: 'Rooms', permission: 'rooms.manage', collection: 'rooms', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'room.block', domain: 'Rooms', permission: 'rooms.manage', collection: 'roomBlocks', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'room.unblock', domain: 'Rooms', permission: 'rooms.manage', collection: 'roomBlocks', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'room.housekeeping', domain: 'Rooms', permission: 'rooms.manage', collection: 'rooms', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'stay.extend', domain: 'Rooms', permission: 'rooms.operate', collection: 'stays', native: 'implemented', backend: 'implemented', web: 'partial' },
  { operation: 'folio.open', domain: 'Rooms', permission: 'folio.manage', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'folio.applyDeposit', domain: 'Rooms', permission: 'folio.manage', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'folio.postAccommodation', domain: 'Rooms', permission: 'folio.manage', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'folio.refundDeposit', domain: 'Rooms', permission: 'folio.manage', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'folio.reverse', domain: 'Rooms', permission: 'folio.reverse', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'hotelService.save', domain: 'Rooms', permission: 'folio.manage', collection: 'hotelServices', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'order.create', domain: 'POS', permission: 'pos.open_tab', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'order.addItem', domain: 'POS', permission: 'pos.sell', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'order.fire', domain: 'POS', permission: 'order.fire', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Recipe ingredient quantities and measured servings deduct from linked stock at fire; staged SQL distinguishes whole-container bottle demand from serving demand when product metadata is configured. Batch yield and sealed/open acceptance remain pending.' },
  { operation: 'order.kds', domain: 'KDS', permission: 'kds.update', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Item status is FIRED, PREPARING, READY, or SERVED.' },
  { operation: 'order.repeatRound', domain: 'POS', permission: 'pos.sell', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Backend contract exists; remote POS action is still pending.' },
  { operation: 'order.transfer', domain: 'POS', permission: 'order.transfer', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'order.merge', domain: 'POS', permission: 'order.merge', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'order.discount', domain: 'POS', permission: 'order.discount', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'missing', notes: 'Requires protected reason/approval UX.' },
  { operation: 'order.compItem', domain: 'POS', permission: 'order.comp', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'missing', notes: 'Requires protected reason/approval UX.' },
  { operation: 'order.void', domain: 'POS', permission: 'order.void', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Basic remote void exists; approval and full disposition parity remain.' },
  { operation: 'payment.record', domain: 'Finance', permission: 'payment.record', collection: 'payments', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'payment.split', domain: 'Finance', permission: 'payment.split', collection: 'payments', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'payment.refund', domain: 'Finance', permission: 'order.refund', collection: 'refunds', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'payment.reverse', domain: 'Finance', permission: 'payment.reverse', collection: 'refunds', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Dedicated web Refunds workspace supports full remaining-payment reversals with manual external confirmation.' },
  { operation: 'mpesa.reconcile', domain: 'Finance', permission: 'mpesa.reconcile', collection: 'mpesaReceipts', native: 'implemented', backend: 'partial', web: 'missing', notes: 'Manual evidence and discrepancy resolution need a dedicated web workspace.' },
  { operation: 'inventory.countLocation', domain: 'Inventory', permission: 'inventory.count', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Remote count is currently a simpler form; scanner draft parity is pending.' },
  { operation: 'inventory.transfer', domain: 'Inventory', permission: 'inventory.transfer', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'inventory.waste', domain: 'Inventory', permission: 'inventory.waste', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'purchaseOrder.receive', domain: 'Procurement', permission: 'procurement.receive', collection: 'goodsReceipts', native: 'partial', backend: 'partial', web: 'partial', notes: 'Web receipt defaults delivered quantities to remaining approved balances, including partial receipts; package counts are whole units. Rejections require reasons and over-receipt uses separate manager approval. Native and staged SQL convert package counts to canonical stock quantity and cost. Hosted rollout and full receipt acceptance remain open.' },
  { operation: 'purchaseOrder.create', domain: 'Procurement', permission: 'procurement.manage', collection: 'purchaseOrders', native: 'partial', backend: 'partial', web: 'partial', notes: 'Purchase-order lines can reference stock purchase packages with whole-package quantities and package prices. Native and staged SQL sources validate package ownership; hosted migration rollout and package workflow acceptance remain open.' },
  { operation: 'supplierPayable.matchInvoice', domain: 'Procurement', permission: 'procurement.pay', collection: 'supplierPayables', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'supplierPayable.pay', domain: 'Procurement', permission: 'procurement.pay', collection: 'supplierPayments', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'roomReservation.create', domain: 'Rooms', permission: 'rooms.operate', collection: 'roomReservations', native: 'implemented', backend: 'implemented', web: 'implemented' },
   { operation: 'roomStay.settings', domain: 'Rooms', permission: 'business.configure', collection: 'property', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Room-stay policy selector: room type, matching NIGHTLY rate, nightly checkout and day-stay cutoff. Required before reservations and before Go Live.' },
  { operation: 'stay.checkIn', domain: 'Rooms', permission: 'rooms.operate', collection: 'stays', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Remote action exists in the Rooms view; Front Desk/tape-chart parity is pending.' },
  { operation: 'stay.move', domain: 'Rooms', permission: 'rooms.operate', collection: 'stays', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Front Desk queues the staged roomId/reason contract and previews destination capacity/condition, reservation overlap, and active blocks; server validation remains authoritative. Browser acceptance is pending.' },
  { operation: 'stay.checkOut', domain: 'Rooms', permission: 'rooms.operate', collection: 'stays', native: 'implemented', backend: 'implemented', web: 'partial' },
  { operation: 'room.condition', domain: 'Rooms', permission: 'rooms.manage', collection: 'rooms', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Maintenance state is separate from housekeeping; active reservations block OUT_OF_ORDER.' },
  { operation: 'folio.postService', domain: 'Rooms', permission: 'folio.manage', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Guest Accounts posts configured hotel services to an open checked-in folio; server validates service and folio versions.' },
  { operation: 'folio.pay', domain: 'Rooms', permission: 'folio.manage', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Guest Accounts and Front Desk support recorded settlement with tender evidence; external funds require manual confirmation.' },
  { operation: 'pos.roomCharge', domain: 'Rooms', permission: 'folio.room_charge', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web POS charges the outstanding order amount to a selected checked-in folio; staged SQL validates ownership, state and versions.' },
  { operation: 'till.close', domain: 'Finance', permission: 'till.close', collection: 'tillSessions', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Till close previews expected cash, physical count and variance; any non-zero variance requires a reason, while override authority is required only above configured variance tolerance.' },
  { operation: 'closeDay.generate', domain: 'Finance', permission: 'reports.view', collection: 'closeDayReports', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'staff.create', domain: 'Staff', permission: 'staff.create', collection: 'employees', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'device.revoke', domain: 'Staff', permission: 'devices.manage', collection: 'deviceEvents', native: 'blocked', backend: 'implemented', web: 'implemented', notes: 'Native v2 desktop adapter is not connected yet.' },
  { operation: 'asset.maintenance', domain: 'Assets', permission: 'maintenance.manage', collection: 'maintenanceOrders', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'runtime.print_receipt', domain: 'Administration', permission: 'pos.sell', collection: 'receiptDocuments', native: 'implemented', backend: 'blocked', web: 'blocked', notes: 'Browser uses OS/PDF printing; direct terminal printer access is native/agent-only.' },
  { operation: 'runtime.backup', domain: 'Administration', permission: 'backup.create', collection: 'metadata', native: 'implemented', backend: 'blocked', web: 'blocked', notes: 'SQLite backup is local terminal authority.' },
];

/** Unknown is intentional until a workflow has evidence in the parity and operator audit. */
export const WEB_OPERATION_MANIFEST: readonly OperationDefinition[] = operationDefinitions.map(item => ({
  ...item,
  offlineEligibility: item.web === 'blocked' ? 'blocked' : 'unknown',
  approval: item.notes?.toLowerCase().includes('approval') ? 'conditional' : 'unknown',
  versioning: 'unknown',
  auditEffect: 'unknown',
  stockEffect: 'unknown',
  financialEffect: 'unknown',
  acceptanceTest: `Add or maintain acceptance coverage for ${item.operation} across permission, persistence, conflict, and recovery behavior.`,
  operatorUxStatus: item.web === 'implemented' ? 'unreviewed' : 'blocked-by-domain',
}));

export const operationByName = (operation: string) => WEB_OPERATION_MANIFEST.find(item => item.operation === operation);
