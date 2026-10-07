export interface ApiBridgeAuthorization {keyId:string;payloadJson:string;signature:string}
export type BridgePrinterRole='RECEIPT'|'KITCHEN'|'BAR'|'OFFICE'|'LABEL';
export interface BridgeDocument {
 id:string;documentType:'SUPPLIER_RETURN_NOTE'|'SUPPLIER_PAYMENT_VOUCHER'|'GOODS_RECEIPT'|'PURCHASE_ORDER'|'SALES_RECEIPT'|'PAYMENT_ACKNOWLEDGEMENT'|'REFUND_RECEIPT'|'KOT'|'BOT'|'KOT_CANCEL'|'BOT_CANCEL'|'ORDER_VOID_NOTICE'|'CLOSE_DAY_REPORT'|'CUSTOMER_CREDIT_INVOICE'|'CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT'|'CUSTOMER_CREDIT_WRITE_OFF_NOTICE'|'CUSTOMER_CREDIT_REVERSAL_NOTICE';
 documentNumber:string;layoutVersion:1;hash:string;canonicalSnapshot:string;
}
export type BridgeAction=
 |{action:'SUBMIT';jobId:string;claimedJobRevision:number;printerRole:BridgePrinterRole;copies:1|2;document:BridgeDocument;authorization:ApiBridgeAuthorization}
 |{action:'STATUS';jobId:string}
 |{action:'REQUEST_STATUS';originalRequestId:string}
 |{action:'RETRY';jobId:string;expectedRevision:number;reason:string;possibleDuplicateAcknowledged:boolean}
 |{action:'CANCEL';jobId:string;expectedRevision:number;reason:string};
