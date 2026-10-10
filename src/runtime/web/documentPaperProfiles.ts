export type DocumentPaperProfile = 'thermal-80mm' | 'a4-portrait' | 'a4-landscape';
export type DocumentCopyStatus = 'ORIGINAL' | 'REPRINT';

/**
 * Explicit print profiles keep narrow customer/preparation documents separate from
 * multi-section business records. Unknown future document types fail safe to A4.
 */
const profiles: Record<string, DocumentPaperProfile> = {
  SALES_RECEIPT: 'thermal-80mm',
  PAYMENT_ACKNOWLEDGEMENT: 'thermal-80mm',
  REFUND_RECEIPT: 'thermal-80mm',
  KOT: 'thermal-80mm',
  BOT: 'thermal-80mm',
  KOT_CANCEL: 'thermal-80mm',
  BOT_CANCEL: 'thermal-80mm',
  ORDER_VOID_NOTICE: 'thermal-80mm',
  CLOSE_DAY_REPORT: 'a4-landscape',
};

export function documentPaperProfile(type: string): DocumentPaperProfile {
  return profiles[type] ?? 'a4-portrait';
}

export function documentCopyStatus(attempt: number): DocumentCopyStatus {
  return Number.isSafeInteger(attempt) && attempt > 1 ? 'REPRINT' : 'ORIGINAL';
}

/** Show the copy label for the next queued retry, but preserve the prior attempt while uncertain. */
export function documentPreviewAttempt(attempt: number, state: string): number {
  const current = Number.isSafeInteger(attempt) && attempt > 0 ? attempt : 0;
  if (['QUEUED', 'FAILED'].includes(state) && current > 0) return current + 1;
  return Math.max(1, current);
}

export const DOCUMENT_DEVELOPER_FOOTER = 'Developed By Kingsforge, 0746157440';