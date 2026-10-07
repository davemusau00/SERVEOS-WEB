const has=(actor,...permissions)=>actor.permissions?.includes('*')||permissions.some(permission=>actor.permissions?.includes(permission));
export function visibleRecord(actor,record){
 const {collection,data}=record;
 if(collection==='purchaseOrders')return has(actor,'procurement.view','procurement.manage','procurement.receive','procurement.pay');
 if(collection==='suppliers')return has(actor,'suppliers.manage','procurement.view','procurement.manage','procurement.receive','procurement.pay');
 if(collection==='journalEntries')return has(actor,'accounting.view','audit.view','reports.view');
 if(collection==='closeDayReports')return has(actor,'reports.view','accounting.view','audit.view');
 if(collection==='orders')return has(actor,'pos.sell','pos.open_tab','order.fire','order.void','order.discount','order.comp','payment.record','order.refund','payment.reverse','payments.view','reports.view','kds.view','kds.update');
 if(collection==='tillSessions')return has(actor,'till.view','till.override_variance','accounting.view','reports.view','audit.view')||data.operatorId===actor.staffId&&has(actor,'till.open','till.close','payment.record','order.refund','payment.reverse','till.cashMovement');
 if(collection==='cashMovements')return has(actor,'till.view','accounting.view')||data.staffId===actor.staffId&&has(actor,'till.cashMovement','payment.record');
 if(collection==='tillPolicy')return has(actor,'business.configure','till.view','till.open','till.close');
 if(collection==='paymentAccounts')return has(actor,'business.configure','payment.record','payment.split','payments.view','accounting.view');
 if(collection==='refunds')return has(actor,'order.refund','payment.reverse','payments.view','accounting.view');
 if(collection==='payments')return has(actor,'order.refund','payment.reverse','payments.view','accounting.view')||data.staffId===actor.staffId&&has(actor,'payment.record');
 if(collection==='businessDocuments'&&data.type==='PURCHASE_ORDER')return has(actor,'procurement.view','procurement.manage','procurement.receive','procurement.pay');
 if(collection==='businessDocuments'&&data.type==='ORDER_VOID_NOTICE')return has(actor,'pos.sell','order.void','order.discount','order.comp','reports.view','audit.view');
 if(collection==='businessDocuments')return data.type==='CLOSE_DAY_REPORT'?has(actor,'reports.view','accounting.view','audit.view'):['KOT','BOT','KOT_CANCEL','BOT_CANCEL'].includes(data.type)?has(actor,'pos.sell','order.void','order.discount','order.comp','kds.view','kds.update','system.configure'):has(actor,'order.fire','order.discount','order.comp','payment.record','order.refund','payment.reverse','payments.view','accounting.view','reports.view');
 if(collection==='printJobs')return has(actor,'procurement.view','procurement.manage','procurement.receive','procurement.pay','pos.sell','order.void','order.discount','order.comp','kds.view','kds.update','payment.record','order.refund','payment.reverse','system.configure','reports.view','accounting.view','audit.view');
 return true;
}
export const filterRecords=(actor,records)=>records.filter(record=>visibleRecord(actor,record));
export const filterChangePage=(actor,page)=>({...page,changes:page.changes.map(change=>({...change,records:filterRecords(actor,change.records)}))});
