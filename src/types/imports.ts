export type ImportTemplateKey =
  | 'business' | 'outlets' | 'stock_locations' | 'suppliers' | 'customers' | 'employees'
  | 'products' | 'inventory' | 'room_types' | 'rooms' | 'rate_plans' | 'hotel_services'
  | 'asset_categories' | 'assets';

export type ImportBatchStatus = 'READY' | 'NEEDS_REVIEW' | 'CANCELLED' | 'APPLIED';
export type ImportRowStatus = 'VALID' | 'INVALID';

export interface ImportBatchSummary {
  id: string;
  templateKey: ImportTemplateKey;
  fileName: string;
  status: ImportBatchStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  sourceHash: string;
  headers: string[];
  notes: string;
}
export interface ImportRowPreview {
  rowNumber: number;
  status: ImportRowStatus;
  externalId: string | null;
  normalized: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}
export interface ImportBatchDetail extends ImportBatchSummary {
  rows: ImportRowPreview[];
  rowsTruncated: boolean;
}
export interface StageImportInput {
  templateKey: ImportTemplateKey;
  fileName: string;
  csvText: string;
}

// SERVOS_PATCH_04_CONTROLLED_IMPORT
export type ImportPlanAction = 'CREATE' | 'UPDATE' | 'NO_CHANGE' | 'BLOCKED' | 'CONFLICT';
export type ImportPlanStatus = 'READY' | 'BLOCKED' | 'APPLYING' | 'APPLIED' | 'PARTIAL' | 'SUPERSEDED';
export interface ImportPlanStep {
  stepIndex: number;
  rowNumber: number;
  action: ImportPlanAction;
  status: 'PLANNED' | 'SKIPPED' | 'APPLIED' | 'FAILED' | 'BLOCKED';
  operation: string | null;
  targetCollection: string | null;
  targetId: string | null;
  expectedVersion: number | null;
  reason: string;
  error: string | null;
}
export interface ImportApplyPlan {
  id: string;
  batchId: string;
  status: ImportPlanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sourceHash: string;
  installationStage: string;
  summary: { total: number; create: number; update: number; noChange: number; blocked: number; conflict: number };
  steps: ImportPlanStep[];
}
