const has=(actor,...permissions)=>actor.permissions?.includes('*')||permissions.some(permission=>actor.permissions?.includes(permission));
export function visibleRecord(actor,record){
 const {collection,data}=record;
 if(collection==='orders')return has(actor,'pos.sell','pos.open_tab','order.fire','payment.record','order.refund','payment.reverse','payments.view','reports.view','kds.view');
 if(collection==='tillSessions')return has(actor,'till.view','till.override_variance','accounting.view')||data.operatorId===actor.staffId&&has(actor,'till.open','till.close','payment.record','order.refund','payment.reverse','till.cashMovement');
 if(collection==='cashMovements')return has(actor,'till.view','accounting.view')||data.staffId===actor.staffId&&has(actor,'till.cashMovement','payment.record');
 if(collection==='tillPolicy')return has(actor,'business.configure','till.view','till.open','till.close');
 if(collection==='paymentAccounts')return has(actor,'business.configure','payment.record','payment.split','payments.view','accounting.view');
 if(collection==='refunds')return has(actor,'order.refund','payment.reverse','payments.view','accounting.view');
 if(collection==='payments')return has(actor,'order.refund','payment.reverse','payments.view','accounting.view')||data.staffId===actor.staffId&&has(actor,'payment.record');
 if(collection==='businessDocuments')return ['KOT','BOT'].includes(data.type)?has(actor,'pos.sell','kds.view','system.configure'):has(actor,'payment.record','order.refund','payment.reverse','payments.view','accounting.view','reports.view');
 if(collection==='printJobs')return has(actor,'pos.sell','kds.view','payment.record','order.refund','payment.reverse','system.configure');
 return true;
}
export const filterRecords=(actor,records)=>records.filter(record=>visibleRecord(actor,record));
export const filterChangePage=(actor,page)=>({...page,changes:page.changes.map(change=>({...change,records:filterRecords(actor,change.records)}))});
