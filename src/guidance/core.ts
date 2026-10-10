export interface GuideStep {
  id: string;
  title: string;
  description: string;
  interaction?: 'inform' | 'observe' | 'practice';
  target?: string;
  route?: { screen: string; resourceId?: string; tab?: string; action?: string };
  articleId?: string;
  successOperations?: string[];
  /** Optional fields that must be truthy on the committed command payload. */
  successPayloadFields?: string[];
  /** Optional workspace tab to activate before this step is shown in web. */
  webTab?: string;
}

export interface GuideDefinition {
  id: string;
  version: number;
  title: string;
  description: string;
  permissions?: Permission[];
  steps: GuideStep[];
}

export const CORE_GUIDE: GuideDefinition = {
  id: 'servos.core',
  version: 1,
  title: 'Getting around ServOS',
  description: 'A short tour of your ServOS web workspace.',
  permissions: ['help.view'],
  steps: [
    { id: 'workspace', title: 'Your workspace', description: 'Your available workspaces are listed here. ServOS only shows areas your staff account can access.', target: 'navigation.home', webTab: 'Home' },
    { id: 'status', title: 'Connection and saved work', description: 'This status shows API connectivity and queued changes. Offline actions are available only when the current device has a valid grant. Recover an uncertain command before repeating it.', target: 'shell.status', webTab: 'Home' },
    { id: 'help', title: 'Help when you need it', description: 'Open searchable operating instructions and return to this tour from Help.', target: 'shell.help', articleId: '01-getting-started', webTab: 'Help' },
    { id: 'staff', title: 'Staff session', description: 'Each operator signs in with their own ServOS staff login. Sign out before handing the browser to another person.', target: 'shell.lock', articleId: '05-rbac', webTab: 'Home' },
  ],
};

export const GUIDES: GuideDefinition[] = [CORE_GUIDE,
  { id: 'business.setup', version: 1, title: 'Set up the business', description: 'Review the business identity, outlets, and payment settings.', permissions: ['business.configure'], steps: [
    { id: 'settings', title: 'Review business settings', description: 'Open Settings and confirm the business name, receipt details, tax rules, outlets, till policy, and payment accounts with the owner. Save only values the business has verified.', target: 'business.settings', webTab: 'Settings' },
  ] },
  { id: 'catalog.add-product', version: 1, title: 'Add a product', description: 'Create a sellable item or stock-only item with its correct tracking.', permissions: ['catalog.manage'], steps: [
    { id: 'add', title: 'Set up an item', description: 'Open Smart item setup. Choose whether this item is sold, tracked as stock, or both. Check its price, tax class, outlet, and opening quantity before saving. A stock-only item will not appear on the POS.', target: 'catalog.add-product', webTab: 'Catalog', successOperations: ['product.save', 'catalog.createWithOpeningStock'] },
  ] },
  { id: 'csv.import-stock', version: 1, title: 'Import stock', description: 'Preview and validate an inventory CSV before applying it.', permissions: ['data.import.stage', 'data.import.execute'], steps: [
    { id: 'import', title: 'Review an inventory import', description: 'In Administration, download the Products and opening stock template. Use existing outlet and storage place names, stage the CSV, run the server dry run, correct rejected rows, and apply only after reviewing the plan and row results.', target: 'import.stock', webTab: 'Administration' },
  ] },
  { id: 'till.start-shift', version: 1, title: 'Start a shift', description: 'Open a till for the correct outlet and record its opening float.', permissions: ['till.open'], steps: [
    { id: 'shift', title: 'Open the till shift', description: 'In POS, choose the correct outlet, review the opening float, and start the shift. Confirm the displayed shift belongs to your staff account and device.', target: 'pos.shift', webTab: 'POS', successOperations: ['till.open'] },
  ] },
  { id: 'pos.first-sale', version: 1, title: 'Make your first sale', description: 'Open a tab, add items and record a real payment.', permissions: ['pos.sell', 'payment.record'], steps: [
    { id: 'sell', title: 'Complete a sale', description: 'Open a tab and add the requested items. Choose Take payment and confirm the money actually received. This step finishes only after your selected tab has a committed payment.', interaction: 'practice', route: { screen: 'pos' }, target: 'pos.open-tab', webTab: 'POS', articleId: 'pos-tabs', successOperations: ['payment.record', 'payment.split'] },
  ] },
  { id: 'payment.mpesa', version: 1, title: 'Record M-Pesa', description: 'Manually record M-Pesa funds after checking the actual receipt.', permissions: ['payment.record', 'mpesa.record'], steps: [
    { id: 'mpesa', title: 'Record a received payment', description: 'Select the order and M-Pesa account. Check the transaction reference, actual amount, and receipt time against the payment received, then confirm manually. ServOS records your confirmation; it does not verify the payment with a provider.', target: 'pos.counter', webTab: 'POS', successOperations: ['payment.record', 'payment.split'], successPayloadFields: ['reference', 'manuallyConfirmed', 'receivedAmountMinor', 'receivedAt'] },
  ] },
  { id: 'receipt.print', version: 1, title: 'Print a receipt', description: 'Open an issued receipt and print it through the browser.', permissions: ['payment.record'], steps: [
    { id: 'print', title: 'Print and check the receipt', description: 'Open Activity, select the issued sales receipt, preview it, and choose Print with browser. Check the printer output. Confirm delivery only after you have seen the receipt print; the browser dialog alone is not proof.', target: 'documents.printing', webTab: 'Activity', successOperations: ['print.confirm'], successPayloadFields: ['operatorConfirmedPrinted'] },
  ] },
  { id: 'stock.receive', version: 1, title: 'Receive stock', description: 'Record delivered stock, cost, and source details.', permissions: ['inventory.receive'], steps: [
    { id: 'receive', title: 'Record delivered stock', description: 'In Inventory, choose Receive stock. Select the item and storage place, enter the received quantity, cost, and source reference, then confirm only what arrived. This records stock; it does not record an invoice or supplier payment.', target: 'stock.receive', webTab: 'Inventory', successOperations: ['inventory.receive'] },
  ] },
  { id: 'procurement.receive-delivery', version: 1, title: 'Receive a purchase delivery', description: 'Compare the supplier delivery with its purchase order and record accepted quantities.', permissions: ['procurement.view', 'procurement.receive'], steps: [
    { id: 'goods-receipt', title: 'Record a supplier delivery', description: 'In Procurement, choose an approved purchase order, enter the delivery reference and receiving location, then review delivered and rejected quantities and cost for every line. Confirm only the quantities that arrived.', target: 'procurement.receive', webTab: 'Procurement', articleId: '19-receiving', successOperations: ['purchaseOrder.receive', 'procurement.receiveDelivery'] },
  ] },
  { id: 'stock.count', version: 1, title: 'Count stock', description: 'Count a Storage Place, review differences and confirm.', permissions: ['inventory.view', 'inventory.count'], steps: [
    { id: 'count', title: 'Count a Storage Place', description: 'Choose Count stock, select a Storage Place, and enter quantities or scan packages. Review every item before confirming. Drafts do not complete this guide.', interaction: 'practice', route: { screen: 'inventory' }, target: 'inventory.count', webTab: 'Inventory', articleId: '21-stocktake', successOperations: ['inventory.countLocation', 'inventory.countSelected'] },
  ] },
  { id: 'finance.close-day', version: 1, title: 'Close the day', description: 'Close and reconcile a till, then issue its close-day report.', permissions: ['reports.view'], steps: [
    { id: 'close-day', title: 'Review the close-day report', description: 'After counting and closing the till, open Activity and review any unresolved orders, money commands, and variances. Issue the immutable report only after the figures and exceptions are understood.', target: 'finance.close-day', webTab: 'Activity', successOperations: ['closeDay.generate'] },
  ] },
  { id: 'staff.add', version: 1, title: 'Add staff', description: 'Create an individual login and assign only the access it needs.', permissions: ['staff.create'], steps: [
    { id: 'staff', title: 'Create a staff login', description: 'Open Staff, create a named login, set a strong initial password, and choose the least access needed for the role. Give the initial password to that staff member securely; they must change it at first sign-in.', target: 'staff.add', webTab: 'Staff', successOperations: ['staff.create'] },
  ] },
  { id: 'rooms.reservation', version: 1, title: 'Make a reservation', description: 'Choose a room and rate, name the guest, and confirm the stay dates.', permissions: ['rooms.operate'], steps: [
    { id: 'reservation', title: 'Confirm a reservation', description: 'In Rooms, choose an available room, matching rate plan, named guest, guest count, arrival, and departure. Confirm only after checking the dates and quoted amount. The API rechecks availability when saving.', target: 'rooms.reservation', webTab: 'Rooms', successOperations: ['roomReservation.create', 'roomReservation.walkIn'] },
  ] },
];
export const GUIDE_ANCHORS = new Set([
  'navigation.home', 'navigation.pos', 'navigation.inventory', 'navigation.procurement', 'navigation.help',
  'shell.status', 'shell.help', 'shell.lock', 'quick-add.open', 'web.start', 'web.quick-add', 'web.help', 'web.status', 'web.help-button',
  'pos.open-tab', 'pos.payment', 'pos.receipt-history', 'pos.shift', 'pos.counter', 'documents.printing', 'business.settings',
  'catalog.add-product', 'import.stock', 'stock.receive', 'procurement.receive', 'inventory.count', 'finance.close-day', 'staff.add', 'rooms.reservation',
  'rooms.add', 'property.add',
]);

export function validateGuides(guides: GuideDefinition[], knownAnchors: ReadonlySet<string> = GUIDE_ANCHORS): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const guide of guides) {
    if (!guide.id || ids.has(guide.id)) errors.push(`Duplicate or empty guide ID: ${guide.id}`);
    ids.add(guide.id);
    const stepIds = new Set<string>();
    for (const step of guide.steps) {
      if (!step.id || stepIds.has(step.id)) errors.push(`${guide.id}: duplicate or empty step ID ${step.id}`);
      stepIds.add(step.id);
      if (step.target && !knownAnchors.has(step.target)) errors.push(`${guide.id}/${step.id}: unknown guide anchor ${step.target}`);
    }
  }
  return errors;
}

const developmentMode = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
if (developmentMode) {
  const errors = validateGuides(GUIDES);
  if (errors.length) throw new Error(`Invalid ServOS guides: ${errors.join('; ')}`);
}
import type { Permission } from '../types/runtime';
