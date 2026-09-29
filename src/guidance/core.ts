export interface GuideStep {
  id: string;
  title: string;
  description: string;
  interaction?: 'inform' | 'observe' | 'practice';
  target?: string;
  route?: { screen: string; resourceId?: string; tab?: string; action?: string };
  articleId?: string;
  successOperations?: string[];
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
  description: 'A short tour of your workspace and the tools that keep local operations moving.',
  permissions: ['help.view'],
  steps: [
    { id: 'workspace', title: 'Your workspace', description: 'Your available workspaces are listed here. ServOS only shows areas your staff account can access.', target: 'navigation.home', webTab: 'Home' },
    { id: 'status', title: 'Local status', description: 'This status shows connectivity and queued changes. Sales and other enabled local operations continue when offline.', target: 'shell.status', webTab: 'Home' },
    { id: 'help', title: 'Help when you need it', description: 'Open searchable operating instructions and return to this tour from Help.', target: 'shell.help', articleId: 'getting-started', webTab: 'Help' },
    { id: 'staff', title: 'Staff session', description: 'Lock the terminal when handing it to another staff member. Each person signs in with their own PIN.', target: 'shell.lock', articleId: 'rbac', webTab: 'Home' },
  ],
};

export const GUIDES: GuideDefinition[] = [CORE_GUIDE,
  { id: 'pos.first-sale', version: 1, title: 'Make your first sale', description: 'Open a tab, add items and record a real payment.', permissions: ['pos.sell', 'payment.record'], steps: [
    { id: 'sell', title: 'Complete a sale', description: 'Open a tab and add the requested items. Choose Take payment and confirm the money actually received. This step finishes only after your selected tab has a committed payment.', interaction: 'practice', route: { screen: 'pos' }, articleId: 'pos-tabs', successOperations: ['payment.record', 'payment.split'] },
  ] },
  { id: 'stock.count', version: 1, title: 'Count stock', description: 'Count a Storage Place, review differences and confirm.', permissions: ['inventory.view', 'inventory.count'], steps: [
    { id: 'count', title: 'Count a Storage Place', description: 'Choose Count stock, select a Storage Place, and enter quantities or scan packages. Review every item before confirming. Drafts do not complete this guide.', interaction: 'practice', route: { screen: 'inventory' }, articleId: 'inventory', successOperations: ['inventory.countLocation'] },
  ] },
  { id: 'stock.receive', version: 1, title: 'Receive a delivery', description: 'Check delivered and rejected quantities before receiving.', permissions: ['procurement.view', 'procurement.receive'], steps: [
    { id: 'receive', title: 'Record a real delivery', description: 'Choose the supplier or an approved purchase order. Enter the reference, Storage Place, quantities and cost. Review and confirm only what arrived. This guide completes after that receipt commits.', interaction: 'practice', route: { screen: 'procurement', action: 'receive-delivery' }, target: 'stock.receive', articleId: '19-receiving', successOperations: ['purchaseOrder.receive', 'procurement.receiveDelivery'] },
  ] },
];
export const GUIDE_ANCHORS = new Set([
  'navigation.home', 'navigation.pos', 'navigation.inventory', 'navigation.procurement', 'navigation.help',
  'shell.status', 'shell.help', 'shell.lock', 'quick-add.open', 'web.start', 'web.quick-add', 'web.help', 'web.status', 'web.help-button',
  'pos.open-tab', 'pos.payment', 'pos.receipt-history', 'inventory.count', 'stock.receive', 'rooms.add', 'property.add',
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
