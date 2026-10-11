export type DocumentPaperProfile = 'thermal-80mm';
export type DocumentCopyStatus = 'ORIGINAL' | 'REPRINT';

/** Every supported physical document uses the same roll geometry. Unknown types fail closed. */
const profiles: Record<string, DocumentPaperProfile> = {
  SALES_RECEIPT: 'thermal-80mm',
  PAYMENT_ACKNOWLEDGEMENT: 'thermal-80mm',
  REFUND_RECEIPT: 'thermal-80mm',
  KOT: 'thermal-80mm',
  BOT: 'thermal-80mm',
  KOT_CANCEL: 'thermal-80mm',
  BOT_CANCEL: 'thermal-80mm',
  ORDER_VOID_NOTICE: 'thermal-80mm',
  CLOSE_DAY_REPORT: 'thermal-80mm',
  SUPPLIER_RETURN_NOTE:'thermal-80mm',
  SUPPLIER_PAYMENT_VOUCHER:'thermal-80mm',
  GOODS_RECEIPT:'thermal-80mm',
  PURCHASE_ORDER:'thermal-80mm',
  CUSTOMER_CREDIT_INVOICE:'thermal-80mm',
  CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT:'thermal-80mm',
  CUSTOMER_CREDIT_WRITE_OFF_NOTICE:'thermal-80mm',
  CUSTOMER_CREDIT_REVERSAL_NOTICE:'thermal-80mm',
  GUEST_FOLIO:'thermal-80mm',
  GUEST_CHECKOUT:'thermal-80mm',
  RESERVATION_CONFIRMATION:'thermal-80mm',
  EXPENSE_PAYMENT_VOUCHER:'thermal-80mm',
};

export function documentPaperProfile(type: string): DocumentPaperProfile {
  if(!Object.hasOwn(profiles,type))throw new Error(`Unsupported thermal document type: ${type}`);
  return profiles[type];
}
export const THERMAL_DOCUMENT_TYPES=Object.freeze(Object.keys(profiles));

export function documentCopyStatus(attempt: number): DocumentCopyStatus {
  return Number.isSafeInteger(attempt) && attempt > 1 ? 'REPRINT' : 'ORIGINAL';
}

/** Show the copy label for the next queued retry, but preserve the prior attempt while uncertain. */
export function documentPreviewAttempt(attempt: number, state: string): number {
  const current = Number.isSafeInteger(attempt) && attempt > 0 ? attempt : 0;
  if (['QUEUED', 'FAILED'].includes(state) && current > 0) return current + 1;
  return Math.max(1, current);
}

/** Money snapshots are persisted in integer minor units and displayed as KES. */
export function formatDocumentMoney(minorUnits: number | null): string {
  if (minorUnits === null || !Number.isSafeInteger(minorUnits)) return '—';
  return `KES ${(minorUnits / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const DOCUMENT_DEVELOPER_FOOTER = 'Developed By Kingsforge, 0746157440';
