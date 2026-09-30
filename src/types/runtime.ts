export type StaffRole = 'Admin' | 'Manager' | 'Server';
export type InstallationStage =
  | 'NEW'
  | 'INTAKE_IN_PROGRESS'
  | 'READY_FOR_ENROLLMENT'
  | 'ENROLLMENT_PENDING'
  | 'SETUP_REQUIRED'
  | 'READY_FOR_GO_LIVE'
  | 'LIVE';

export type Permission =
  | 'business.view' | 'business.configure' | 'business.tax.configure'
  | 'staff.view' | 'staff.create' | 'staff.update' | 'staff.deactivate' | 'staff.reset_pin' | 'staff.change_role'
  | 'pos.sell' | 'pos.open_tab' | 'pos.manage_table'
  | 'order.fire' | 'order.transfer' | 'order.merge' | 'order.void' | 'order.discount' | 'order.comp' | 'order.refund'
  | 'payment.record' | 'payment.split' | 'payment.reverse'
  | 'till.open' | 'till.close' | 'till.cash_movement' | 'till.override_variance'
  | 'mpesa.record' | 'mpesa.reconcile' | 'mpesa.discrepancy'
  | 'credit.view' | 'credit.manage' | 'credit.charge' | 'credit.settle' | 'credit.reconcile' | 'credit.write_off' | 'credit.override_limit'
  | 'catalog.view' | 'catalog.manage' | 'pricing.manage'
  | 'inventory.view' | 'inventory.receive' | 'inventory.transfer' | 'inventory.waste' | 'inventory.count' | 'inventory.adjust'
  | 'procurement.view' | 'procurement.manage' | 'procurement.receive' | 'procurement.over_receive' | 'procurement.pay'
  | 'floorplan.view' | 'floorplan.manage'
  | 'rooms.view' | 'rooms.manage' | 'rooms.operate' | 'rooms.guests.view'
  | 'folio.view' | 'folio.manage' | 'folio.reverse' | 'folio.room_charge'
  | 'assets.view' | 'assets.manage' | 'assets.operate' | 'maintenance.view' | 'maintenance.manage'
  | 'kds.view' | 'kds.update'
  | 'accounting.view' | 'reports.view' | 'audit.view'
  | 'backup.create' | 'backup.restore' | 'sync.manual' | 'system.configure' | 'help.view'
  | 'data.import.view' | 'data.import.stage' | 'data.import.execute';

export interface BusinessCommand {
  id: string;
  schemaVersion: 1;
  operation: string;
  targetVersion?: number;
  payload: Record<string, unknown>;
}
export interface CommandResult { commandId: string; recordIds: string[]; auditReference: string; sequence: number; syncPending?:boolean }
export interface RuntimeSession { token: string; staffId: string; name: string; role: StaffRole }
export interface RuntimeActor { id: string; name: string; role: StaffRole; permissions: Permission[] }
export interface StoredRecord { collection: string; id: string; version: number; data: Record<string, any>; archived: boolean }
export interface RuntimeSnapshot {
  records: StoredRecord[];
  pendingCount: number;
  lastSync: string | null;
  lastBackup: string | null;
  terminalId: string;
  installationStage: InstallationStage;
  actor: RuntimeActor;
}
export interface RuntimeStatus {
  enrolled: boolean;
  installationStage: InstallationStage;
  staff: Array<{ id: string; name: string; role: StaffRole }>;
  intakeProfile?: IntakeProfile | null;
}
export interface ProductionHealthCollection { collection: string; active: number; archived: number; maxVersion: number }
export interface ProductionHealthRecordVersion { collection: string; id: string; version: number; archived: boolean }
export interface ProductionHealthAudit {
  mode: 'READ_ONLY_LOCAL_AUDIT';
  generatedAt: string;
  appVersion: string;
  database: { schemaVersion: number; quickCheck: string };
  installation: { stage: InstallationStage; terminalId: string | null; cloudConfigured: boolean; projectHostname?: string | null; lastSync: string | null; lastBackup: string | null };
  staff: { total: number; active: number };
  operations: { commands: number; auditEntries: number; firstAuditSequence: number | null; lastAuditSequence: number | null; outboxTotal: number; outboxPending: number; outboxAcknowledged: number; lastOutboxSequence: number; remoteRequests: number; openTills: number };
  records: { total: number; active: number; archived: number; collections: ProductionHealthCollection[]; manifest: ProductionHealthRecordVersion[] };
  warnings: string[];
}
// SERVOS_PATCH_02A_RECONCILIATION
export type ReconciliationClassification = 'MATCHED' | 'LOCAL_AHEAD' | 'CLOUD_MISSING' | 'CLOUD_AHEAD' | 'DIVERGED';
export interface ReconciliationRecordResult {
  collection: string;
  id: string;
  classification: ReconciliationClassification;
  localVersion: number | null;
  cloudVersion: number | null;
  localArchived: boolean | null;
  cloudArchived: boolean | null;
  reason: string;
}
export interface ReconciliationReport {
  mode: 'READ_ONLY_RECONCILIATION';
  generatedAt: string;
  local: {
    terminalId: string;
    schemaVersion: number;
    quickCheck: string;
    lastOutboxSequence: number;
    pendingOutbox: number;
  };
  cloud: {
    terminalId: string;
    lastSequence: number;
    lastSeen: string | null;
    operationCount: number;
  };
  summary: {
    total: number;
    matched: number;
    localAhead: number;
    cloudMissing: number;
    cloudAhead: number;
    diverged: number;
  };
  controlTotals: {
    matches: boolean;
    local: {
      inventoryReconciles: boolean;
      collections: Record<string, { total: number; active: number; archived: number }>;
      stockQuantityMicros: Record<string, number>;
      movementQuantityMicros: Record<string, number>;
      financialMinor: Record<string, number>;
    };
    cloud: {
      inventoryReconciles: boolean;
      collections: Record<string, { total: number; active: number; archived: number }>;
      stockQuantityMicros: Record<string, number>;
      movementQuantityMicros: Record<string, number>;
      financialMinor: Record<string, number>;
    };
  };
  cutoverReady: boolean;
  blockers: string[];
  warnings: string[];
  records: ReconciliationRecordResult[];
}

// SERVOS_PATCH_10_TERMINAL_ACCEPTANCE
export interface TerminalAcceptanceEvidence {
  id: string;
  details: Record<string, unknown>;
  actorId: string;
  actorName: string;
  occurredAt: string;
}
export interface TerminalAcceptanceStatus {
  mode: 'TERMINAL_ACCEPTANCE';
  generatedAt: string;
  facts: {
    schemaVersion: number;
    quickCheck: string;
    installationStage: InstallationStage;
    terminalId: string | null;
    cloudConfigured: boolean;
    lastSync: string | null;
    lastBackup: string | null;
    outboxPending: number;
    openTills: number;
    unresolvedPrinterJobs: number;
  };
  expectations: { printer: boolean; scanner: boolean; cashDrawer: boolean };
  requiredEvidence: string[];
  evidence: Record<string, TerminalAcceptanceEvidence>;
  restart: { pending: boolean; canConfirm: boolean; startedAt: string | null };
  blockers: string[];
  readyToFinalize: boolean;
  accepted: boolean;
  acceptedAt: string | null;
}

export type PrinterJobState = 'SENT' | 'QUEUED' | 'DELIVERY_UNCERTAIN' | 'SENDING' | 'OS_DIALOG' | 'MANUAL';
export interface PrinterJobResult { jobId?: string; orderId?: string; state: PrinterJobState; message?: string; createdAt?: string }
export interface IntakeBusinessIdentity {
  tradingName: string;
  legalName: string;
  registrationNumber: string;
  kraPin: string;
  phone: string;
  email: string;
  address: string;
}
export interface IntakeOwnerProfile { fullName: string; phone: string; email: string }
export interface IntakeAdministratorProfile {
  fullName: string;
  phone: string;
  email: string;
  jobTitle: string;
  isBusinessOwner: boolean;
}
export interface IntakeProfile {
  business: IntakeBusinessIdentity;
  owner: IntakeOwnerProfile;
  initialAdministrator: IntakeAdministratorProfile;
  venueType: 'BAR' | 'PUB' | 'LOUNGE' | 'CLUB' | 'RESTAURANT_BAR' | 'OTHER';
  serviceModes: Array<'COUNTER' | 'TABS' | 'TABLES'>;
  operatingHours: string;
  lateNight: boolean;
  paymentMethods: Array<'CASH' | 'MPESA' | 'CARD'>;
  mpesaAccount?: string;
  salesStructure: string[];
  tracksSpiritsByMl: boolean;
  usesCocktailRecipes: boolean;
  serviceAreas: string[];
  stockAreas: string[];
  hasTables: boolean;
  estimatedTables: number;
  estimatedManagers: number;
  estimatedOperators: number;
  printerExpected: boolean;
  drawerExpected: boolean;
  barcodeScannerExpected: boolean;
  importMode: 'MANUAL' | 'CSV' | 'EMPTY';
  intendedGoLiveDate?: string;
}
export interface ManagerApproval { token: string; permission: Permission; target?: string | null; expiresAt: number; approvedBy: { id: string; name: string } }
export interface SyncOperation { sequence: number; commandId: string; operation: string; actorId: string; occurredAt: string; changes: StoredRecord[] }
export interface SyncBatch { terminalId: string; schemaVersion: 1; operations: SyncOperation[] }
export interface ManualMpesaInput { code: string; account: string; receivedAmount: number; receivedAt: string; confirmed: boolean; customerId?: string }
