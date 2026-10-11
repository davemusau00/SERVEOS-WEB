/** Explicit UI pilot cohorts. This does not grant any financial permission. */
export function pos2Capabilities(actor,raw=process.env.POS2_SIMPLE_CASHIER_COHORTS){
 const disabled={'pos2.simpleCashier':false};
 if(!actor.deviceId||!actor.permissions?.some(value=>value==='*'||value==='pos.sell'))return disabled;
 let cohorts;try{cohorts=JSON.parse(raw||'[]')}catch{return disabled}
 if(!Array.isArray(cohorts))return disabled;
 return {'pos2.simpleCashier':cohorts.some(cohort=>cohort&&cohort.businessId===actor.businessId&&cohort.deviceId===actor.deviceId&&cohort.staffId===actor.staffId)};
}
