export const RECEIPT_FOOTER = ['Built By KINGSFORGE', 'info@kingsforge.co.ke', 'info@davemusau.co.ke', '0746157440'] as const;
export const LEGACY_RECEIPT_FOOTER = ['Built By Davemusau.co.ke', 'info@davemusau.co.ke', '0746157440'] as const;
export interface ReceiptBrandingSnapshot {
  version: number;
  footerLines?: string[];
  receiptLogoDataUrl?: string | null;
  thermalLogo?: { width: number; height: number; base64: string } | null;
}
export interface ReceiptDocument {
  id: string; schemaVersion: 1 | 2; orderId: string; sourceCommandId?: string; deviceId?: string;
  number: string; orderNumber: string; issuedAt: string; currency: string; timezone: string;
  business: { name: string; address?: string; phone?: string; email?: string };
  outlet?: string; cashier: string; customerName?: string; table?: string; tab?: string; message?: string;
  brandingSnapshot?: ReceiptBrandingSnapshot;
  items: Array<{id:string; description:string; quantity:number; unitPriceMinor:number; amountMinor:number; portion?:string; modifiers:string[]}>;
  subtotalMinor:number; discountMinor:number; netMinor:number; taxMinor:number; levyMinor:number; totalMinor:number; paidMinor:number; creditedMinor?:number; balanceMinor:number;
  customerCredit?: { customerId?:string; customerName?:string; amountMinor:number; dueAt?:string; accountBalanceMinor:number } | null;
  payments:Array<{id:string; tenderType:string; amountMinor:number; reference?:string; cashTenderedMinor?:number|null; changeMinor?:number|null; currentPayment?:boolean}>;
}
export interface ReceiptResponse { document: ReceiptDocument; customerLines:string[]; businessLines:string[] }
export interface ReceiptSummary { id:string; orderId:string; orderNumber:string; issuedAt:string; totalMinor:number }
