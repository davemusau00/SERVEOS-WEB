/** Explicit UI pilot cohorts. This does not grant any financial permission. */
export function pos2Capabilities(actor,raw=process.env.POS2_SIMPLE_CASHIER_COHORTS,ticketRaw=process.env.POS2_WAITER_TICKET_COHORTS){
 const matches=value=>{let cohorts;try{cohorts=JSON.parse(value||'[]')}catch{return false}return Boolean(actor.deviceId&&Array.isArray(cohorts)&&cohorts.some(cohort=>cohort&&cohort.businessId===actor.businessId&&cohort.deviceId===actor.deviceId&&cohort.staffId===actor.staffId));};
 const offline=matches(process.env.POS2_OFFLINE_CASH_COHORTS)&&['pos.sell','order.fire','payment.record'].every(permission=>actor.permissions?.includes('*')||actor.permissions?.includes(permission));
 const has=(...permissions)=>actor.permissions?.some(value=>value==='*'||permissions.includes(value));
 return {'operations.inbox':matches(process.env.OPERATIONS_INBOX_COHORTS),'operations.references':matches(process.env.OPERATIONS_REFERENCE_COHORTS),'operations.push':matches(process.env.OPERATIONS_PUSH_COHORTS),'pos2.simpleCashier':has('pos.sell')&&matches(raw),'pos2.waiterTickets':has('ticket.create','ticket.approve','business.configure')&&matches(ticketRaw),'pos2.offlineCash':offline,'pos2.localKitchenTickets':offline&&matches(process.env.POS2_LOCAL_PREP_PRINT_COHORTS),'pos2.offlineAuthV2':offline};
}
