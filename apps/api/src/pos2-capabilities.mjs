/** Explicit UI pilot cohorts. This does not grant any financial permission. */
export function pos2Capabilities(actor,raw=process.env.POS2_SIMPLE_CASHIER_COHORTS,ticketRaw=process.env.POS2_WAITER_TICKET_COHORTS){
 const matches=value=>{let cohorts;try{cohorts=JSON.parse(value||'[]')}catch{return false}return Boolean(actor.deviceId&&Array.isArray(cohorts)&&cohorts.some(cohort=>cohort&&cohort.businessId===actor.businessId&&cohort.deviceId===actor.deviceId&&cohort.staffId===actor.staffId));};
 const has=(...permissions)=>actor.permissions?.some(value=>value==='*'||permissions.includes(value));
 return {'pos2.simpleCashier':has('pos.sell')&&matches(raw),'pos2.waiterTickets':has('ticket.create','ticket.approve','business.configure')&&matches(ticketRaw),'pos2.offlineCash':false,'pos2.localKitchenTickets':false,'pos2.offlineAuthV2':false};
}
