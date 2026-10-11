const prefixes={SALES_RECEIPT:'R',PAYMENT_ACKNOWLEDGEMENT:'PAY',REFUND_RECEIPT:'REF',CLOSE_DAY_REPORT:'CLOSE',CUSTOMER_CREDIT_INVOICE:'CR',CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT:'CRP',CUSTOMER_CREDIT_WRITE_OFF_NOTICE:'WO',CUSTOMER_CREDIT_REVERSAL_NOTICE:'CRR',GOODS_RECEIPT:'GRN',PURCHASE_ORDER:'PO',SUPPLIER_PAYMENT_VOUCHER:'SP',SUPPLIER_RETURN_NOTE:'SR',EXPENSE_PAYMENT_VOUCHER:'EX',KOT:'KOT',BOT:'BOT',KOT_CANCEL:'KOT-CANCEL',BOT_CANCEL:'BOT-CANCEL',ORDER_VOID_NOTICE:'VOID',RESERVATION_CONFIRMATION:'RES',GUEST_CHECKOUT:'OUT',GUEST_FOLIO:'FOL'};
/** Allocation shares the caller's transaction; replay returns the already issued snapshot. */
export async function allocateDocumentNumber(db,businessId,type){
 const prefix=prefixes[type];if(!prefix)throw new Error(`Document numbering is not configured for ${type}`);
 const {rows}=await db.query(`INSERT INTO business_document_sequences(business_id,document_type,last_value) VALUES($1,$2,1) ON CONFLICT(business_id,document_type) DO UPDATE SET last_value=business_document_sequences.last_value+1 RETURNING last_value::text AS sequence`,[businessId,type]);
 return `${prefix}-${rows[0].sequence.padStart(6,'0')}`;
}
