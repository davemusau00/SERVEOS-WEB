/**
 * Cross-client operation inventory.
 *
 * This is intentionally a small, reviewable parity ledger rather than a second
 * command registry. The Rust/native dispatcher and staged PostgreSQL dispatcher
 * remain authoritative. Keep entries here whenever an operation is added or a
 * web surface is completed so missing remote actions are visible in review.
 */
export type OperationSurface = 'implemented' | 'partial' | 'missing' | 'blocked';

export interface OperationDefinition {
  operation: string;
  domain: 'POS' | 'KDS' | 'Inventory' | 'Procurement' | 'Rooms' | 'Finance' | 'Staff' | 'Assets' | 'Administration';
  permission: string;
  collection: string;
  native: OperationSurface;
  backend: OperationSurface;
  web: OperationSurface;
  notes?: string;
}

export const WEB_OPERATION_MANIFEST: readonly OperationDefinition[] = [
  { operation: 'order.create', domain: 'POS', permission: 'pos.open_tab', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'order.addItem', domain: 'POS', permission: 'pos.sell', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'order.fire', domain: 'POS', permission: 'order.fire', collection: 'orders', native: 'implemented', backend: 'implemented', web: 'implemented' },
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
  { operation: 'purchaseOrder.receive', domain: 'Procurement', permission: 'procurement.receive', collection: 'goodsReceipts', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'supplierPayable.matchInvoice', domain: 'Procurement', permission: 'procurement.pay', collection: 'supplierPayables', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'supplierPayable.pay', domain: 'Procurement', permission: 'procurement.pay', collection: 'supplierPayments', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'roomReservation.create', domain: 'Rooms', permission: 'rooms.operate', collection: 'roomReservations', native: 'implemented', backend: 'implemented', web: 'implemented' },
   { operation: 'roomStay.settings', domain: 'Rooms', permission: 'business.configure', collection: 'property', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Room-stay policy selector: room type, matching NIGHTLY rate, nightly checkout and day-stay cutoff. Required before reservations and before Go Live.' },
  { operation: 'stay.checkIn', domain: 'Rooms', permission: 'rooms.operate', collection: 'stays', native: 'implemented', backend: 'implemented', web: 'partial', notes: 'Remote action exists in the Rooms view; Front Desk/tape-chart parity is pending.' },
  { operation: 'stay.move', domain: 'Rooms', permission: 'rooms.operate', collection: 'stays', native: 'implemented', backend: 'implemented', web: 'partial' },
  { operation: 'stay.checkOut', domain: 'Rooms', permission: 'rooms.operate', collection: 'stays', native: 'implemented', backend: 'implemented', web: 'partial' },
  { operation: 'folio.postService', domain: 'Rooms', permission: 'folio.manage', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'folio.pay', domain: 'Rooms', permission: 'folio.manage', collection: 'folios', native: 'implemented', backend: 'implemented', web: 'partial' },
  { operation: 'pos.roomCharge', domain: 'Rooms', permission: 'folio.room_charge', collection: 'folios', native: 'implemented', backend: 'partial', web: 'missing' },
  { operation: 'till.close', domain: 'Finance', permission: 'till.close', collection: 'tillSessions', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'closeDay.generate', domain: 'Finance', permission: 'reports.view', collection: 'closeDayReports', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'staff.create', domain: 'Staff', permission: 'staff.create', collection: 'employees', native: 'implemented', backend: 'implemented', web: 'implemented' },
  { operation: 'record.save', domain: 'Administration', permission: 'customers.manage', collection: 'master records', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Web Master Data scopes this shared command to authorized customer, supplier, room-type, and asset-category masters.' },
  { operation: 'record.archive', domain: 'Administration', permission: 'customers.manage', collection: 'master records', native: 'implemented', backend: 'implemented', web: 'implemented', notes: 'Archive remains subject to server-side reference checks and optimistic concurrency.' },
  { operation: 'device.revoke', domain: 'Staff', permission: 'devices.manage', collection: 'deviceEvents', native: 'blocked', backend: 'implemented', web: 'implemented', notes: 'Native v2 desktop adapter is not connected yet.' },
  { operation: 'asset.maintenance', domain: 'Assets', permission: 'maintenance.manage', collection: 'maintenanceOrders', native: 'implemented', backend: 'implemented', web: 'missing' },
  { operation: 'runtime.print_receipt', domain: 'Administration', permission: 'pos.sell', collection: 'receiptDocuments', native: 'implemented', backend: 'blocked', web: 'blocked', notes: 'Browser uses OS/PDF printing; direct terminal printer access is native/agent-only.' },
  { operation: 'runtime.backup', domain: 'Administration', permission: 'backup.create', collection: 'metadata', native: 'implemented', backend: 'blocked', web: 'blocked', notes: 'SQLite backup is local terminal authority.' },
];

export const operationByName = (operation: string) => WEB_OPERATION_MANIFEST.find(item => item.operation === operation);