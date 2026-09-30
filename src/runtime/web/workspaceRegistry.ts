import { Activity, BedDouble, Boxes, ClipboardCheck, CreditCard, HelpCircle, Home, LayoutGrid, LogIn, Martini, PackageSearch, Settings, ShieldCheck, Truck, Users, WalletCards, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WebSession } from './session';
import { allowed } from './session';

export type WorkspaceTab = 'Home' | 'POS' | 'KDS' | 'Catalog' | 'Inventory' | 'Procurement' | 'Front Desk' | 'Guest Accounts' | 'Housekeeping' | 'Rooms' | 'Maintenance' | 'Floorplan' | 'Assets' | 'Master Data' | 'Refunds' | 'Finance Controls' | 'Settings' | 'Finance' | 'Staff' | 'Administration' | 'Activity' | 'Help';

export type WorkspaceDefinition = { id: WorkspaceTab; label: string; description: string; permission: string[]; icon: LucideIcon; group: 'Start' | 'Operations' | 'Management' | 'System' };

export const workspaces: WorkspaceDefinition[] = [
  { id: 'Home', label: 'Home', description: 'Choose a task or find a guide.', permission: [], icon: Home, group: 'Start' },
  { id: 'Help', label: 'Help & training', description: 'Find answers, guides, and troubleshooting.', permission: ['help.view'], icon: HelpCircle, group: 'Start' },
  { id: 'POS', label: 'POS', description: 'Take orders and record payments.', permission: ['pos.sell'], icon: Martini, group: 'Operations' },
  { id: 'KDS', label: 'KDS', description: 'Move orders through the service pass.', permission: ['kds.view'], icon: ClipboardCheck, group: 'Operations' },
  { id: 'Inventory', label: 'Inventory', description: 'Review stock, counts, transfers, and waste.', permission: ['inventory.view', 'inventory.adjust', 'inventory.receive'], icon: Boxes, group: 'Operations' },
  { id: 'Procurement', label: 'Procurement', description: 'Buy supplies and record deliveries.', permission: ['procurement.view', 'procurement.manage', 'procurement.receive'], icon: Truck, group: 'Operations' },
  { id: 'Front Desk', label: 'Front Desk', description: 'Manage arrivals, stays, departures, and room moves.', permission: ['rooms.view', 'rooms.operate'], icon: LogIn, group: 'Operations' },
  { id: 'Guest Accounts', label: 'Guest Accounts', description: 'Manage folios, deposits, services, and settlement.', permission: ['folio.view', 'folio.manage', 'payment.record'], icon: WalletCards, group: 'Operations' },
  { id: 'Housekeeping', label: 'Housekeeping', description: 'Move rooms through readiness and maintenance states.', permission: ['rooms.view', 'rooms.operate'], icon: ClipboardCheck, group: 'Operations' },
  { id: 'Maintenance', label: 'Maintenance', description: 'Report and track asset repairs.', permission: ['maintenance.view', 'maintenance.manage'], icon: Wrench, group: 'Operations' },
  { id: 'Floorplan', label: 'Floorplan', description: 'Arrange tables and preserve active table ownership.', permission: ['floorplan.view', 'floorplan.manage'], icon: LayoutGrid, group: 'Operations' },
  { id: 'Rooms', label: 'Rooms & rates', description: 'Set up rooms, rates, reservations, and availability.', permission: ['rooms.view', 'rooms.manage', 'rooms.operate'], icon: BedDouble, group: 'Operations' },
  { id: 'Catalog', label: 'Catalog', description: 'Manage products, prices, portions, and modifiers.', permission: ['catalog.view', 'catalog.manage'], icon: PackageSearch, group: 'Management' },
  { id: 'Assets', label: 'Assets', description: 'Track property items and operational history.', permission: ['assets.view', 'assets.manage'], icon: ShieldCheck, group: 'Management' },
  { id: 'Master Data', label: 'Master data', description: 'Keep guests, suppliers, room types, and categories ready.', permission: ['customers.manage', 'suppliers.manage', 'roomTypes.manage', 'assetCategories.manage'], icon: Users, group: 'Management' },
  { id: 'Refunds', label: 'Refunds', description: 'Review paid transactions and record refunds.', permission: ['order.refund', 'payment.reverse'], icon: CreditCard, group: 'Management' },
  { id: 'Finance Controls', label: 'Finance controls', description: 'Review credit, reconciliation, and exceptions.', permission: ['credit.view', 'credit.manage', 'credit.settle', 'credit.reconcile', 'mpesa.reconcile'], icon: WalletCards, group: 'Management' },
  { id: 'Finance', label: 'Finance', description: 'Review till activity, reports, and financial records.', permission: ['reports.view', 'till.view'], icon: CreditCard, group: 'Management' },
  { id: 'Settings', label: 'Settings', description: 'Manage business master records and policy.', permission: ['customers.manage', 'roomTypes.manage', 'assetCategories.manage'], icon: Settings, group: 'System' },
  { id: 'Staff', label: 'Staff & devices', description: 'Manage staff access, roles, and registered devices.', permission: ['staff.view', 'devices.manage'], icon: Users, group: 'System' },
  { id: 'Administration', label: 'Administration', description: 'Manage imports, exports, readiness, and backup requests.', permission: ['business.configure', 'data.import.view', 'reports.view', 'staff.create', 'backup.create'], icon: ShieldCheck, group: 'System' },
  { id: 'Activity', label: 'Activity & sync', description: 'Review saved, waiting, rejected, and conflicting changes.', permission: ['records.view'], icon: Activity, group: 'System' },
];

export const workspaceById = (id: WorkspaceTab) => workspaces.find(workspace => workspace.id === id)!;
export const canSeeWorkspace = (session: WebSession, workspace: WorkspaceDefinition) => workspace.id === 'Home' || workspace.permission.some(permission => allowed(session, permission));
export const visibleWorkspaces = (session: WebSession) => workspaces.filter(workspace => canSeeWorkspace(session, workspace));
export const workspaceGroups = (session: WebSession) => ['Start', 'Operations', 'Management', 'System'].map(group => ({ group, items: visibleWorkspaces(session).filter(workspace => workspace.group === group) })).filter(group => group.items.length > 0);
