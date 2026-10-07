const has=(actor,...permissions)=>actor.permissions?.includes('*')||permissions.some(permission=>actor.permissions?.includes(permission));
export function visibleRecord(actor,record){
 const {collection,data}=record;
 if(collection==='customers')return has(actor,'customers.manage','credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off','pos.sell','pos.open_tab');
 if(collection==='customerCreditAccounts'||collection==='customerCreditEntries')return has(actor,'credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off');
 if(['customerCreditReconciliations','customerCreditDiscrepancies','customerCreditDiscrepancyResolutions'].includes(collection))return has(actor,'credit.view','credit.reconcile','credit.manage','credit.write_off','accounting.view','audit.view');
 if(['purchaseOrders','goodsReceipts','supplierPayables','supplierPayments','supplierReturns','supplierCreditNotes','supplierCredits','supplierCreditApplications'].includes(collection))return has(actor,'procurement.view','procurement.manage','procurement.receive','procurement.pay');
 if(collection==='suppliers')return has(actor,'suppliers.manage','procurement.view','procurement.manage','procurement.receive','procurement.pay');
 if(collection==='journalEntries')return has(actor,'accounting.view','audit.view','reports.view');
 if(collection==='closeDayReports')return has(actor,'reports.view','accounting.view','audit.view');
 if(collection==='orders')return has(actor,'pos.sell','pos.open_tab','order.fire','order.void','order.discount','order.comp','payment.record','order.refund','payment.reverse','credit.view','credit.charge','credit.settle','credit.write_off','payments.view','reports.view','kds.view','kds.update');
 if(collection==='tillSessions')return has(actor,'till.view','till.override_variance','accounting.view','reports.view','audit.view')||data.operatorId===actor.staffId&&has(actor,'till.open','till.close','payment.record','order.refund','payment.reverse','till.cashMovement','credit.settle','credit.write_off');
 if(collection==='cashMovements')return has(actor,'till.view','accounting.view')||data.staffId===actor.staffId&&has(actor,'till.cashMovement','payment.record','credit.settle','credit.write_off');
 if(collection==='tillPolicy')return has(actor,'business.configure','till.view','till.open','till.close');
 if(collection==='paymentAccounts')return has(actor,'business.configure','payment.record','payment.split','payments.view','accounting.view','procurement.pay','credit.settle');
 if(collection==='refunds')return has(actor,'order.refund','payment.reverse','payments.view','accounting.view','procurement.pay');
 if(collection==='payments')return has(actor,'order.refund','payment.reverse','payments.view','accounting.view')||data.staffId===actor.staffId&&has(actor,'payment.record');
 if(collection==='businessDocuments'&&['PURCHASE_ORDER','GOODS_RECEIPT','SUPPLIER_PAYMENT_VOUCHER','SUPPLIER_RETURN_NOTE'].includes(data.type))return has(actor,'procurement.view','procurement.manage','procurement.receive','procurement.pay');
 if(collection==='businessDocuments'&&data.type==='CUSTOMER_CREDIT_INVOICE')return has(actor,'credit.view','credit.charge','credit.settle','accounting.view','audit.view');
 if(collection==='businessDocuments'&&data.type==='CUSTOMER_CREDIT_PAYMENT_ACKNOWLEDGEMENT')return has(actor,'credit.view','credit.settle','accounting.view','audit.view');
 if(collection==='businessDocuments'&&data.type==='CUSTOMER_CREDIT_WRITE_OFF_NOTICE')return has(actor,'credit.view','credit.write_off','accounting.view','audit.view');
 if(collection==='businessDocuments'&&data.type==='CUSTOMER_CREDIT_REVERSAL_NOTICE')return has(actor,'credit.view','credit.write_off','accounting.view','audit.view');
 if(collection==='businessDocuments'&&data.type==='ORDER_VOID_NOTICE')return has(actor,'pos.sell','order.void','order.discount','order.comp','reports.view','audit.view');
 if(collection==='businessDocuments')return data.type==='CLOSE_DAY_REPORT'?has(actor,'reports.view','accounting.view','audit.view'):['KOT','BOT','KOT_CANCEL','BOT_CANCEL'].includes(data.type)?has(actor,'pos.sell','order.void','order.discount','order.comp','kds.view','kds.update','system.configure'):has(actor,'order.fire','order.discount','order.comp','payment.record','order.refund','payment.reverse','payments.view','accounting.view','reports.view');
 if(collection==='printJobs')return has(actor,'procurement.view','procurement.manage','procurement.receive','procurement.pay','pos.sell','order.void','order.discount','order.comp','kds.view','kds.update','payment.record','order.refund','payment.reverse','credit.view','credit.charge','credit.settle','credit.write_off','system.configure','reports.view','accounting.view','audit.view');
 return true;
}
export const filterRecords=(actor,records)=>records.filter(record=>visibleRecord(actor,record));
export const filterChangePage=(actor,page)=>({...page,changes:page.changes.map(change=>({...change,records:filterRecords(actor,change.records)}))});
