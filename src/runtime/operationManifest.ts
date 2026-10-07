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

/**
 * How an operation reaches the shared v2 authority.
 *
 * `shared`      a business mutation: it must have a complete v2 handler, because
 *               after cutover the terminal writes through servos_v2 only.
 * `local-only`  a device-local operation that must NEVER route through v2. A raw
 *               ESC/POS job has no meaning on a server, and a SQLite backup is
 *               local terminal authority. Routing these to v2 would be a defect,
 *               so they are explicitly excluded from the parity gate instead of
 *               being left to look like missing backend coverage.
 */
export type V2Routing = 'shared' | 'local-only';

export interface OperationDefinition {
  operation: string;
  domain: 'POS' | 'KDS' | 'Inventory' | 'Procurement' | 'Rooms' | 'Finance' | 'Staff' | 'Assets' | 'Administration';
  permission: string;
  collection: string;
  native: OperationSurface;
  backend: OperationSurface;
  web: OperationSurface;
  v2Routing: V2Routing;
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

/**
 * Operations that are device-local and must never route through servos_v2.
 *
 * A raw ESC/POS print job has no meaning on a server, and a SQLite backup is
 * local terminal authority. After cutover these still run locally by design, so
 * they are excluded from the Native -> Cloud parity gate rather than being left
 * looking like missing backend coverage.
 */
const LOCAL_ONLY_OPERATIONS = new Set<string>([
  'runtime.print_receipt',
  'runtime.backup',
]);

/** True when this operation must have a complete servos_v2 handler. */
export function requiresSharedV2Handler(operation: string): boolean {
  return !LOCAL_ONLY_OPERATIONS.has(operation);
}

/** True when this operation is device-local by design. */
export function isLocalOnly(operation: string): boolean {
  return LOCAL_ONLY_OPERATIONS.has(operation);
}

// v2Routing is derived from LOCAL_ONLY_OPERATIONS below, so it is not authored per entry.
const operationDefinitions: Omit<OperationDefinition, 'v2Routing' | 'offlineEligibility' | 'approval' | 'versioning' | 'auditEffect' | 'stockEffect' | 'financialEffect' | 'acceptanceTest' | 'operatorUxStatus'>[] = [
  { operation: 'business.identity', domain: 'Administration', permission: 'business.configure', collection: 'property', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Business identity and property timezone configuration.' },
  { operation: 'business.settings.save', domain: 'Administration', permission: 'business.configure', collection: 'organization', native: 'partial', backend: 'implemented', web: 'implemented', notes: 'Web Admin updates versioned branding/receipt settings through an online BusinessCommandV2; native branding is saved to the property record. Receipt documents snapshot the logo at payment commit.' },
  { operation: 'setup.completeStep', domain: 'Administration', permission: 'system.configure', collection: 'installation', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'setup.goLive', domain: 'Administration', permission: 'system.configure', collection: 'installation', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'admin.import.stage', domain: 'Administration', permission: 'data.import.stage', collection: 'importBatches', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Stages eleven templates on the server: products, stock items, stock locations, customers, suppliers, room types, rate plans, rooms, asset categories, assets and staff. Stage stores a source hash and rejects a batch ID reused for different content. Web staging UX remains narrower than the native import centre.' },
  { operation: 'admin.import.dryRun', domain: 'Administration', permission: 'data.import.stage', collection: 'importBatches', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Server validates staged CSV rows by running the existing domain validators in rolled-back subtransactions, so a row that the native terminal would reject is rejected identically. Web surface remains narrower.' },
  { operation: 'admin.import.apply', domain: 'Administration', permission: 'data.import.execute', collection: 'importBatches', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Applies only a hash-bound, fully valid eleven-template plan atomically through the existing domain validators, including staff.create for already-invited Auth users. It deliberately does not create Auth accounts or import balances and history; the cutover bootstrap is the supported path for existing business state.' },
  { operation: 'admin.import.cancel', domain: 'Administration', permission: 'data.import.stage', collection: 'importBatches', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Cancels only unapplied batches, purges the raw CSV and dry-run plan, and retains an actor/time/reason tombstone; batch IDs cannot be reused. Web surface remains narrower.' },
  { operation: 'record.save', domain: 'Administration', permission: 'customers.manage', collection: 'master records', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web Master Data scopes this shared command to authorized customer, supplier, room-type, and asset-category masters.' },
  { operation: 'record.archive', domain: 'Administration', permission: 'customers.manage', collection: 'master records', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Archive remains subject to server-side reference checks and optimistic concurrency.' },
  { operation: 'roomType.save', domain: 'Rooms', permission: 'rooms.manage', collection: 'roomTypes', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'ratePlan.save', domain: 'Rooms', permission: 'rooms.manage', collection: 'ratePlans', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'floorplan.save', domain: 'POS', permission: 'floorplan.manage', collection: 'tables', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'table.ready', domain: 'POS', permission: 'pos.manage_table', collection: 'tables', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'customerCredit.charge', domain: 'Finance', permission: 'credit.charge', collection: 'creditLedger', native: 'implemented', backend: 'implemented', web: 'missing', notes: 'Canonical v2 handler is credit.charge. Migration 047 routes customerCredit.charge into that same implementation and derives the customer and the outstanding amount from the order using the identical rule, so the derived Native payload and the explicit Web payload share one code path. The Native command name remains for the existing terminal UI; it is not a second financial rule.' },
  { operation: 'credit.charge', domain: 'Finance', permission: 'credit.charge', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Canonical customer credit charge. Accepts the explicit Web payload (customerId + amountMinor) and the derived Native payload (orderId only); both must settle the outstanding order balance exactly.' },
  { operation: 'inventory.openingBalance', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'inventory.policy.save', domain: 'Inventory', permission: 'business.configure', collection: 'inventoryPolicy', native: 'missing', backend: 'missing', web: 'implemented', notes: 'Standalone API-only inventory receiving policy. No legacy dispatcher implementation; source coverage is not acceptance.' },
  { operation: 'outlet.save', domain: 'Administration', permission: 'business.configure', collection: 'outlets', native: 'missing', backend: 'missing', web: 'implemented', notes: 'Standalone API-only outlet configuration with active-order/till blockers. No legacy dispatcher implementation; source coverage is not acceptance.' },
  { operation: 'inventory.receive', domain: 'Inventory', permission: 'inventory.receive', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'inventory.adjust', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Dedicated reason-required Admin balance correction emits an ADMIN_CORRECTION movement in native and staged SQL sources. Spirit/wine correction accepts sealed bottles plus open ml and records the conserved breakdown. Step-up re-authentication and operator acceptance remain pending.' },
  { operation: 'catalog.createWithOpeningStock', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Terminal and Web Smart Item flows submit one atomic sellable-product/stock or stock-only ingredient command with optional opening movement. Web persists generated record IDs for drafts/retries and initializes sealed/open stock for Spirit/Wine bottle packages with serving and optional whole-container portions. Web BATCH setup uses the same command to link a zero-on-hand portion stock master; recipe-only dishes/mixed drinks use product.save. Full item-type, portion, and native/Web parity remain open.' },
  { operation: 'mpesa.discrepancy', domain: 'Finance', permission: 'mpesa.reconcile', collection: 'mpesaReceipts', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web Finance Controls records manual statement amount/reference and reason; no provider or STK success is asserted.' },
  { operation: 'mpesa.discrepancy.resolve', domain: 'Finance', permission: 'mpesa.reconcile', collection: 'mpesaDiscrepancies', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web Finance Controls records an explicit outcome and resolution note; server validates the open discrepancy.' },
  { operation: 'till.open', domain: 'Finance', permission: 'till.open', collection: 'tillSessions', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'till.cashMovement', domain: 'Finance', permission: 'till.cashMovement', collection: 'cashMovements', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'staff.changeRole', domain: 'Staff', permission: 'staff.change_role', collection: 'employees', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'staff.deactivate', domain: 'Staff', permission: 'staff.deactivate', collection: 'employees', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'staff.resetPin', domain: 'Staff', permission: 'staff.reset_pin', collection: 'employees', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'product.save', domain: 'Administration', permission: 'catalog.manage', collection: 'products', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Product saves persist recipe ingredients; Web Smart Item creates recipe-only dishes/mixed drinks through this queued operation and converts familiar units to stock units. Recipe creation also requires inventory.view; expansion 032 enforces ingredient and supplied outlet baselines. Full item-type/portion parity and operator acceptance remain pending.' },
  { operation: 'stockItem.save', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Stock master saves preserve package definitions, validate bounded unique barcode aliases, and allow sealed-container sizing for ml stock without changing a populated balance.' },
  { operation: 'stockLocation.save', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockLocations', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'supplier.save', domain: 'Procurement', permission: 'procurement.manage', collection: 'suppliers', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'supplier.archive', domain: 'Procurement', permission: 'procurement.manage', collection: 'suppliers', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'asset.save', domain: 'Assets', permission: 'assets.manage', collection: 'assets', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'asset.commission', domain: 'Assets', permission: 'assets.manage', collection: 'assetAcquisitions', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'assetCategory.save', domain: 'Assets', permission: 'assets.manage', collection: 'assetCategories', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'maintenance.report', domain: 'Assets', permission: 'maintenance.manage', collection: 'maintenanceOrders', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'maintenance.assign', domain: 'Assets', permission: 'maintenance.manage', collection: 'maintenanceOrders', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'maintenance.start', domain: 'Assets', permission: 'maintenance.manage', collection: 'maintenanceOrders', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'maintenance.complete', domain: 'Assets', permission: 'maintenance.manage', collection: 'maintenanceOrders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web completion records repair resolution and optional supplier invoice cost; part consumption is not yet exposed in the Web form.' },
  { operation: 'maintenance.cancel', domain: 'Assets', permission: 'maintenance.manage', collection: 'maintenanceOrders', native: 'implemented', backend: 'implemented', web: 'implemented' },
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
  { operation: 'order.addItem', domain: 'POS', permission: 'pos.sell', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Prepared BATCH portions are snapshot as finished-stock demand; selected modifiers retain additional ingredient adjustments and their stock-version dependencies in the staged command.' },
  { operation: 'order.fire', domain: 'POS', permission: 'order.fire', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Recipe ingredient quantities and measured servings deduct from linked stock at fire; staged SQL distinguishes whole-container bottle demand from serving demand when product metadata is configured. Batch yield and sealed/open acceptance remain pending.' },
  { operation: 'order.kds', domain: 'KDS', permission: 'kds.update', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Item status is FIRED, PREPARING, READY, or SERVED.' },
  { operation: 'order.repeatRound', domain: 'POS', permission: 'pos.sell', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Backend contract exists; remote POS action is still pending.' },
  { operation: 'order.transfer', domain: 'POS', permission: 'order.transfer', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web POS queues the transfer command with source/target table IDs; server rejects occupied destinations.' },
  { operation: 'order.merge', domain: 'POS', permission: 'order.merge', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web POS queues a merge command with source/target table and order IDs; server remains authoritative for merge rules.' },
  { operation: 'order.discount', domain: 'POS', permission: 'order.discount', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Web collects percentage and reason, but does not yet provide the required manager-approval token flow for non-manager actors.' },
  { operation: 'order.comp', domain: 'POS', permission: 'order.comp', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Whole-order comp: the entire order total becomes zero. Distinct from order.compItem and never overloaded onto it. Non-manager approval-token UX is still missing on Web.' },
  { operation: 'order.compItem', domain: 'POS', permission: 'order.comp', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'missing', notes: 'Item-level comp: zeroes exactly one order line and leaves every other line payable. Migration 047 implements it as its own handler because it is a different business operation from whole-order order.comp.' },
  { operation: 'order.void', domain: 'POS', permission: 'order.void', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Basic remote void exists; approval and full disposition parity remain.' },
  { operation: 'payment.record', domain: 'Finance', permission: 'payment.record', collection: 'payments', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'payment.split', domain: 'Finance', permission: 'payment.split', collection: 'payments', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'payment.refund', domain: 'Finance', permission: 'order.refund', collection: 'refunds', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'payment.reverse', domain: 'Finance', permission: 'payment.reverse', collection: 'refunds', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Dedicated web Refunds workspace supports full remaining-payment reversals with manual external confirmation.' },
  { operation: 'mpesa.reconcile', domain: 'Finance', permission: 'mpesa.reconcile', collection: 'mpesaReceipts', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web Finance Controls supports manual statement amount/reference/notes and reconciliation; unresolved or unaccepted discrepancies remain blocked. No M-Pesa provider success is asserted.' },
  { operation: 'inventory.reverseMovement', domain: 'Inventory', permission: 'inventory.adjust', collection: 'movementCorrections', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Full linked waste/transfer reversal only with a saved baseline and no later stock/cost changes; otherwise use current balance correction.' },
  { operation: 'inventory.countSelected', domain: 'Inventory', permission: 'inventory.count', collection: 'stockCounts', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Explicit selected scope; canonical forward migration required. Hosted rollout and operator acceptance pending.' },
  { operation: 'procurement.reverseUnusedReceipt', domain: 'Procurement', permission: 'procurement.pay', collection: 'receiptCorrections', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Exact unused receipt reversal requires immutable baseline snapshots and no downstream activity. Consumed and paid corrections remain gated by accounting design.' },
  { operation: 'record.reactivate', domain: 'Administration', permission: 'catalog.manage', collection: 'master collections', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Collection-specific permissions and dependency/uniqueness validation apply.' },
  { operation: 'inventory.countLocation', domain: 'Inventory', permission: 'inventory.count', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Whole-location counts now carry sealed bottles plus open ml for tracked Spirit/Wine; scanner draft parity and acceptance remain pending.' },
  { operation: 'inventory.produceBatch', domain: 'Inventory', permission: 'inventory.adjust', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Online-only shared command consumes saved full-batch ingredients and increases the recipe-linked portion stock atomically with immutable movements and cost valuation. Batch authoring parity, acceptance, and production enablement remain open.' },
  { operation: 'inventory.transfer', domain: 'Inventory', permission: 'inventory.transfer', collection: 'stockItems', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Staged Spirit/Wine transfer preserves sealed/open state and paired movement evidence; transfer is rejected if destination open-liquid representation would overflow.' },
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
  { operation: 'runtime.print_receipt', domain: 'Administration', permission: 'pos.sell', collection: 'receiptDocuments', native: 'implemented', backend: 'blocked', web: 'implemented', notes: 'Web prints the selected immutable receipt through the shared document portal; terminal raw ESC/POS is native-only. Printer transport acceptance is not physical output proof.' },
  { operation: 'runtime.backup', domain: 'Administration', permission: 'backup.create', collection: 'metadata', native: 'implemented', backend: 'blocked', web: 'blocked', notes: 'SQLite backup is local terminal authority.' },
];

/** Unknown is intentional until a workflow has evidence in the parity and operator audit. */
export const WEB_OPERATION_MANIFEST: readonly OperationDefinition[] = operationDefinitions.map(item => ({
  ...item,
  v2Routing: LOCAL_ONLY_OPERATIONS.has(item.operation) ? 'local-only' : 'shared',
  offlineEligibility: ['floorplan.save','admin.import.stage','admin.import.dryRun','admin.import.apply'].includes(item.operation) ? 'online-only' : item.web === 'blocked' ? 'blocked' : 'unknown',
  approval: item.operation === 'floorplan.save' || item.operation.startsWith('admin.import.') ? 'none' : item.notes?.toLowerCase().includes('approval') ? 'conditional' : 'unknown',
  versioning: item.operation === 'floorplan.save' || item.operation.startsWith('admin.import.') ? 'required' : 'unknown',
  auditEffect: item.operation === 'floorplan.save' || item.operation.startsWith('admin.import.') ? 'required' : 'unknown',
  stockEffect: item.operation === 'floorplan.save' || item.operation.startsWith('admin.import.') ? 'none' : 'unknown',
  financialEffect: item.operation === 'floorplan.save' || item.operation.startsWith('admin.import.') ? 'none' : 'unknown',
  acceptanceTest: item.operation === 'floorplan.save' ? 'Verify atomic full-outlet save, optimistic baseline, occupied-table preservation, removal rejection, authorization, replay, and cross-client visibility.' : item.operation.startsWith('admin.import.') ? 'Verify staged permissions, RFC-style CSV parsing, identifier/barcode preservation, exact numeric validation, dry-run rollback, duplicate rejection, source/plan hashes, atomic application, replay, private source retention/removal, and authorized cross-client batch summaries.' : `Add or maintain acceptance coverage for ${item.operation} across permission, persistence, conflict, and recovery behavior.`,
  operatorUxStatus: item.operation === 'floorplan.save' ? 'implemented' : item.web === 'implemented' ? 'unreviewed' : 'blocked-by-domain',
}));

export const operationByName = (operation: string) => WEB_OPERATION_MANIFEST.find(item => item.operation === operation);
