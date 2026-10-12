import type {ApiFinanceSummary,ApiOccupancyReport,ApiProfitAndLoss,ApiSalesSummary,ApiStatementSource} from './apiClient';
import type {BusinessRecord,WebSession} from './session';
import {allowed} from './session';
import type {QueuedCommand} from './BusinessStore';
import {scopedStockState} from './inventoryPresentation';

export type ManagerSalesSummary=ApiSalesSummary;
export type ManagerOccupancyReport=ApiOccupancyReport;
export type ManagerReportState<T>={state:'IDLE'|'LOADING'|'READY'|'EMPTY'|'FAILED'|'DENIED'|'UNSUPPORTED';data:T|null;message:string;retrievedAt:string|null};
export const initialManagerReport=<T>():ManagerReportState<T>=>({state:'IDLE',data:null,message:'Refresh to load the authenticated report.',retrievedAt:null});
export const managerMinor=(value:unknown):number|null=>typeof value==='number'&&Number.isSafeInteger(value)?value:null;
export type ManagerFilters={from:string;to:string;department:string};
export const managerFilterKey=(businessId:string,staffId:string,timeZone:string)=>`serveos.manager-filters.v1:${encodeURIComponent(JSON.stringify([businessId,staffId,timeZone]))}`;
/** Only non-sensitive report controls are retained, scoped to this tab and staff identity. */
export function managerStoredFilters(key:string,today:string):ManagerFilters {
 const fallback={from:today,to:today,department:'ALL'};
 try{
  const saved=window.sessionStorage.getItem(key);if(!saved||saved.length>512)return fallback;
  const value:unknown=JSON.parse(saved);if(!value||typeof value!=='object'||Array.isArray(value))return fallback;
  const fields=value as Record<string,unknown>;
  if(fields.version!==1||typeof fields.from!=='string'||typeof fields.to!=='string'||typeof fields.department!=='string'||!/^[A-Z][A-Z0-9_]{0,79}$/.test(fields.department))return fallback;
  managerDateRange(fields.from,fields.to);
  return {from:fields.from,to:fields.to,department:fields.department};
 }catch{return fallback;}
}
export function managerSaveFilters(key:string,filters:ManagerFilters):boolean {
 try{
  managerDateRange(filters.from,filters.to);
  if(!/^[A-Z][A-Z0-9_]{0,79}$/.test(filters.department))return false;
  window.sessionStorage.setItem(key,JSON.stringify({version:1,...filters}));return true;
 }catch{return false;}
}
export function managerSumMinor(values:unknown[]):number|null {
 let total=0n;
 for(const value of values){const amount=managerMinor(value);if(amount===null)return null;total+=BigInt(amount);}
 return total>BigInt(Number.MAX_SAFE_INTEGER)||total<BigInt(Number.MIN_SAFE_INTEGER)?null:Number(total);
}
/** Aging buckets are allocations, not a substitute for the authoritative account balance. */
export function managerReceivableEvidence(summary:ApiFinanceSummary|null):{sourceMinor:number|null;agingMinor:number|null;gapMinor:number|null;exceptionAccounts:number|null;reconciled:boolean;message:string} {
 const keys=['currentMinor','days1To30Minor','days31To60Minor','days61To90Minor','over90DaysMinor'];
 const agingMinor=summary?managerSumMinor(keys.map(key=>summary.debtorAging[key])):null;
 const raw=(summary as (ApiFinanceSummary&{debtorReconciliation?:unknown})|null)?.debtorReconciliation;
 const reconciliation=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 const sourceMinor=managerMinor(reconciliation?.sourceBalanceMinor),reportedAging=managerMinor(reconciliation?.agingTotalMinor),reportedGap=managerMinor(reconciliation?.differenceMinor);
 const exceptionAccounts=typeof reconciliation?.exceptionAccounts==='number'&&Number.isSafeInteger(reconciliation.exceptionAccounts)&&reconciliation.exceptionAccounts>=0?reconciliation.exceptionAccounts:null;
 const delta=sourceMinor!==null&&agingMinor!==null?BigInt(sourceMinor)-BigInt(agingMinor):null;
 const gapMinor=delta!==null&&delta<=BigInt(Number.MAX_SAFE_INTEGER)&&delta>=BigInt(Number.MIN_SAFE_INTEGER)?Number(delta):null;
 const reconciled=reconciliation?.reconciled===true&&sourceMinor!==null&&agingMinor!==null&&reportedAging===agingMinor&&reportedGap===gapMinor&&gapMinor===0&&exceptionAccounts===0;
 const message=sourceMinor===null?'The authoritative customer account balance is unavailable. Aging buckets show allocated balances only; they are not a certified total receivable.':agingMinor===null?'The ledger balance is loaded, but usable aging bucket evidence is unavailable. Review the current customer accounts.':reconciled?'The current customer ledger and aging allocations reconcile. Guest folios remain separate.':'The ledger and aging allocations are not reconciled. Legacy or unallocated balances require account review; the aging total is not the ledger total.';
 return {sourceMinor,agingMinor,gapMinor,exceptionAccounts,reconciled,message};
}
export function managerDateRange(from:string,to:string):{days:number;previousFrom:string;previousTo:string;dates:string[]} {
 const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
 if(!valid(from)||!valid(to)||from>to)throw new Error('Choose valid business dates with the end on or after the start.');
 const start=Date.parse(`${from}T00:00:00Z`),end=Date.parse(`${to}T00:00:00Z`),days=(end-start)/86_400_000+1;
 if(days>367)throw new Error('Choose a report period of at most 367 calendar days.');
 const previousFrom=new Date(start-days*86_400_000).toISOString().slice(0,10),previousTo=new Date(start-86_400_000).toISOString().slice(0,10);
 const dates=Array.from({length:days},(_,index)=>new Date(start+index*86_400_000).toISOString().slice(0,10));
 return {days,previousFrom,previousTo,dates};
}
/** Missing days mean no qualifying issued POS sales only after a complete server report. */
export function managerSalesTrend(report:ManagerSalesSummary):Array<{date:string;amountMinor:number;salesCount:number}>|null {
 if(!Array.isArray(report.daily))return null;
 let dates:string[];
 try{dates=managerDateRange(report.periodStart,report.periodEnd).dates;}catch{return null;}
 const rows=new Map<string,ManagerSalesSummary['daily'][number]>();
 for(const row of report.daily){
  if(!dates.includes(row.date)||rows.has(row.date)||!Number.isSafeInteger(row.salesCount)||row.salesCount<0||managerMinor(row.netSalesMinor)===null||managerMinor(row.grossMinor)===null)return null;
  rows.set(row.date,row);
 }
 if(managerSumMinor(report.daily.map(row=>row.netSalesMinor))!==managerMinor(report.totals.netSalesMinor)||managerSumMinor(report.daily.map(row=>row.salesCount))!==managerMinor(report.totals.salesCount))return null;
 return dates.map(date=>({date,amountMinor:rows.get(date)?.netSalesMinor??0,salesCount:rows.get(date)?.salesCount??0}));
}
export const managerDepartmentLabel=(value:string)=>({BAR:'Bar',KITCHEN:'Kitchen',OTHER_POS:'Other POS',UNALLOCATED_POS_RETURNS:'Unallocated POS returns',ACCOMMODATION:'Accommodation',HOTEL_SERVICES:'Hotel services',HOTEL_ADJUSTMENTS:'Hotel adjustments',BUSINESS:'Business'} as Record<string,string>)[value]||value.replace(/_/g,' ');
export const managerHumanText=(value:string|null|undefined,fallback:string)=>typeof value==='string'&&value.trim()&&!/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)?value:fallback;
export const managerAccountLabel=(value:string)=>({REVENUE_SALES:'Issued POS sales',REVENUE_SALES_RETURN:'Sales returns',REVENUE_ACCOMMODATION:'Accommodation revenue',REVENUE_SERVICE:'Hotel services',REVENUE_ADJUSTMENT:'Folio adjustments',EXPENSE_POS_COGS:'Historical POS consumption',EXPENSE_POS_COGS_RETURN:'Documented stock returns',EXPENSE_OPERATING:'Posted operating expenses',EXPENSE_BAD_DEBT:'Recorded bad debt',EXPENSE_VOID_CONSUMPTION:'Unrecovered void preparation',EXPENSE_STOCK_WASTE:'Stock waste',EXPENSE_STOCK_WASTE_REVERSAL:'Waste corrections',ASSET_TENDER:'Cash / payment account',GUEST_RECEIVABLE:'Guest receivable',GUEST_DEPOSITS:'Guest deposits liability',ASSET_CUSTOMER_AR:'Customer receivable',LIABILITY_VAT:'VAT payable',LIABILITY_LEVY:'Levy payable',LIABILITY_TAX:'Hotel tax liability',LIABILITY_ACCOUNTS_PAYABLE:'Supplier payable',ASSET_INVENTORY:'Inventory asset'} as Record<string,string>)[value]||'Other accounting account';
export const managerSourceMatches=(source:ApiStatementSource,department:string)=>['REVENUE','RETURNS'].includes(source.section)&&(department==='ALL'||source.department===department);
export function managerCostRate(value:string|null|undefined):string {
 if(typeof value!=='string'||!/^\d{1,30}(\.\d{1,18})?$/.test(value))return 'Unavailable';
 const [whole,fraction='']=value.split('.'),amount=BigInt(whole),decimals=`${String(amount%100n).padStart(2,'0')}${fraction}`.replace(/0+$/,'').padEnd(2,'0');
 return `KES ${(amount/100n).toLocaleString('en-KE')}.${decimals}`;
}
export function managerSourceWorkspace(source:ApiStatementSource):{workspace:string;label:string} {
 if(['stockMovements','movementCorrections'].includes(source.collection))return {workspace:'Inventory',label:'Open stock movement workspace'};
 if(source.collection==='hospitalityJournalEntries')return {workspace:'Guest Accounts',label:'Open guest account workspace'};
 if(source.collection==='businessDocuments')return {workspace:'POS',label:'Open cashier sale history workspace'};
 return {workspace:'Finance',label:'Open finance evidence workspace'};
}
export function managerDepartments(report:ApiProfitAndLoss):Array<{department:string;amountMinor:number|null;sourceCount:number}> {
 const groups=new Map<string,{values:unknown[];sourceCount:number}>();
 for(const line of report.lines.filter(row=>row.section==='REVENUE'||row.section==='RETURNS')){const entry=groups.get(line.department)||{values:[],sourceCount:0};entry.values.push(line.amountMinor);entry.sourceCount+=line.sourceCount;groups.set(line.department,entry);}
 return [...groups].map(([department,group])=>({department,amountMinor:managerSumMinor(group.values),sourceCount:group.sourceCount}));
}
export const managerRevenue=(report:ApiProfitAndLoss,department='ALL'):number|null=>department==='ALL'?managerMinor(report.totals.netRevenueMinor):managerSumMinor(report.lines.filter(row=>(row.section==='REVENUE'||row.section==='RETURNS')&&row.department===department).map(row=>row.amountMinor));
export function managerDifference(current:number|null,previous:number|null):{amountMinor:number|null;percentage:string} {
 if(current===null||previous===null)return {amountMinor:null,percentage:'Comparison unavailable'};
 const delta=BigInt(current)-BigInt(previous);
 const amountMinor=delta>BigInt(Number.MAX_SAFE_INTEGER)||delta<BigInt(Number.MIN_SAFE_INTEGER)?null:Number(delta);
 if(previous<=0)return {amountMinor,percentage:previous===0?'Previous period has no recorded revenue; percentage comparison is unavailable':'Percentage comparison is unavailable for a negative previous-period base'};
 const absolute=delta<0n?-delta:delta,basis=(absolute*1_000n+BigInt(previous)/2n)/BigInt(previous);
 return {amountMinor,percentage:`${delta<0n?'-':'+'}${basis/10n}.${basis%10n}%`};
}
const can=(session:WebSession,...permissions:string[])=>permissions.some(permission=>allowed(session,permission));
const active=(records:BusinessRecord[],collection:string)=>records.filter(row=>row.collection===collection&&!row.archived);
export function managerOperationalSnapshot(records:BusinessRecord[],queue:QueuedCommand[],session:WebSession) {
 const tillAccess=can(session,'till.view','till.override_variance','accounting.view','reports.view','audit.view');
 const stockAccess=can(session,'inventory.view','inventory.adjust','inventory.receive','inventory.count','inventory.transfer','inventory.waste');
 const roomAccess=can(session,'rooms.view','rooms.manage','rooms.operate');
 const stayAccess=can(session,'rooms.operate','rooms.guests.view','folio.view','folio.manage');
 const reconciliationAccess=can(session,'accounting.view','audit.view');
 const tills=tillAccess?active(records,'tillSessions'):[],stocks=stockAccess?active(records,'stockItems'):[],rooms=roomAccess?active(records,'rooms'):[];
 const stayRows=stayAccess?[...active(records,'stays'),...active(records,'roomReservations')].filter(row=>row.data.status==='CHECKED_IN'):[];
 const occupied=new Set(stayRows.map(row=>String(row.data.roomId||'')).filter(Boolean));
 const inService=rooms.filter(room=>room.data.maintenanceState==='AVAILABLE'),serviceIds=new Set(inService.map(room=>room.id));
 const roomCoverage=rooms.some(room=>!['AVAILABLE','OUT_OF_SERVICE'].includes(String(room.data.maintenanceState)))||[...occupied].some(id=>!serviceIds.has(id));
 const occupiedInService=[...occupied].filter(id=>serviceIds.has(id)).length;
 return {
  openTills:tillAccess?tills.filter(row=>row.data.status==='OPEN'):null,
  tillReviews:tillAccess?tills.filter(row=>row.data.status==='REVIEW_REQUIRED'):null,
  stock:stockAccess?{loaded:stocks.length,low:stocks.filter(row=>scopedStockState(row)==='LOW'),out:stocks.filter(row=>scopedStockState(row)==='OUT'),unknown:stocks.filter(row=>scopedStockState(row)==='UNKNOWN')}:null,
  rooms:roomAccess?{loaded:rooms.length,inService:inService.length,occupied:stayAccess?occupied.size:null,occupiedInService:stayAccess?occupiedInService:null,coverageIncomplete:roomCoverage||!stayAccess,occupancyPercent:stayAccess&&inService.length&&!roomCoverage?Math.round(occupiedInService*1_000/inService.length)/10:null}:null,
  cashExceptions:reconciliationAccess?active(records,'offlineCashReconciliations').filter(row=>row.data.status==='RECONCILIATION_REQUIRED'):null,
  printExceptions:active(records,'printJobs').filter(row=>row.data.state==='DELIVERY_UNCERTAIN'||row.data.state==='FAILED'),
  localPending:queue.filter(row=>row.state==='PENDING_SYNC').length,
  localUnknown:queue.filter(row=>row.state==='OUTCOME_UNKNOWN').length,
  localDeclined:queue.filter(row=>row.state==='CONFLICT'||row.state==='REJECTED').length,
 };
}

export function managerErrorState(error:unknown):{state:'FAILED'|'DENIED'|'UNSUPPORTED';message:string} {
 const status=error&&typeof error==='object'&&'status'in error?Number(error.status):null;
 if(status===401||status===403)return {state:'DENIED',message:'Your current session does not authorize this report. Sign in again or ask an authorized manager.'};
 if(status===404||status===501)return {state:'UNSUPPORTED',message:'This report is unavailable in the current API version. No values have been substituted.'};
 return {state:'FAILED',message:'This report could not be refreshed. Check the API connection and retry; no zero values have been substituted.'};
}
export function managerWhen(value:string|null|undefined,timeZone:string):string {
 if(!value||!Number.isFinite(Date.parse(value)))return 'Time unavailable';
 try{return new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone}).format(new Date(value));}catch{return 'Time zone unavailable';}
}
