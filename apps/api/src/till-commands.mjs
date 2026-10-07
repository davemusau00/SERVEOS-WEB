import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {requireManagerApproval} from './manager-approvals.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
export const moneyMinor=(value,allowZero=false)=>{if(!Number.isSafeInteger(value)||(allowZero?value<0:value<=0))fail('Money amounts must be non-negative integer minor currency units.');return value;};
const reason=value=>{if(typeof value!=='string'||value.trim().length<3||value.trim().length>500)fail('Enter a reason of 3 to 500 characters.');return value.trim();};
const expected=(command,collection,id)=>{const value=command.expectedVersions[`${collection}:${id}`];if(!Number.isSafeInteger(value)||value<0)fail(`Reviewed ${collection} version is required.`);return value;};
const policyColumns=`scope,variance_threshold_minor AS "varianceThresholdMinor",version,updated_by AS "updatedBy",updated_at AS "updatedAt"`;
const sessionColumns=`id,outlet_id AS "outletId",operator_id AS "operatorId",device_id AS "deviceId",status,opening_float_minor AS "openingFloatMinor",counted_cash_minor AS "countedCashMinor",expected_cash_minor AS "expectedCashMinor",variance_minor AS "varianceMinor",variance_reason AS "varianceReason",policy_snapshot AS "policySnapshot",version,opened_at AS "openedAt",counted_at AS "countedAt",closed_at AS "closedAt",closed_by AS "closedBy",review_reason AS "reviewReason"`;
const sessionProjection=row=>{
 const data={...row};for(const key of ['openingFloatMinor','countedCashMinor','expectedCashMinor','varianceMinor','version'])data[key]=row[key]===null?null:Number(row[key]);
 for(const key of ['openedAt','countedAt','closedAt'])data[key]=row[key]?.toISOString()??null;
 return {collection:'tillSessions',id:row.id,version:Number(row.version),archived:false,data};
};
const policyProjection=(businessId,row)=>({collection:'tillPolicy',id:businessId,version:Number(row.version),archived:false,data:{scope:row.scope,varianceThresholdMinor:Number(row.varianceThresholdMinor),updatedBy:row.updatedBy,updatedAt:row.updatedAt.toISOString()}});
export async function tillProjections(db,businessId){
 const sessions=await db.query(`SELECT ${sessionColumns} FROM till_sessions WHERE business_id=$1 ORDER BY opened_at DESC,id LIMIT 1000`,[businessId]);
 const policy=await db.query(`SELECT ${policyColumns} FROM business_till_policy WHERE business_id=$1`,[businessId]);
 const cash=await db.query(`SELECT id,till_session_id AS "tillSessionId",kind,amount_delta_minor AS "amountDeltaMinor",reason,source_command_id AS "sourceCommandId",staff_id AS "staffId",device_id AS "deviceId",occurred_at AS "occurredAt" FROM till_cash_entries WHERE business_id=$1 ORDER BY occurred_at DESC,id LIMIT 1000`,[businessId]);
 return [...sessions.rows.map(sessionProjection),...policy.rows.map(row=>policyProjection(businessId,row)),...cash.rows.map(row=>({collection:'cashMovements',id:row.id,version:1,archived:false,data:{...row,amountDeltaMinor:Number(row.amountDeltaMinor),occurredAt:row.occurredAt.toISOString()}}))];
}
export async function tillSessionProjection(db,businessId,id){const {rows}=await db.query(`SELECT ${sessionColumns} FROM till_sessions WHERE business_id=$1 AND id=$2`,[businessId,id]);return rows[0]?sessionProjection(rows[0]):null;}
async function result(tx,businessId,id,extra=[]){const {rows}=await tx.client.query(`SELECT ${sessionColumns} FROM till_sessions WHERE business_id=$1 AND id=$2`,[businessId,id]);const value=sessionProjection(rows[0]);return {value,records:[value,...extra]};}
async function businessLock(tx,businessId){await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`till-policy:${businessId}`]);}
export async function requireOpenTill(tx,actor,id,version){
 if(!uuid(id))fail('Choose an open till.');
 const {rows}=await tx.client.query(`SELECT ${sessionColumns} FROM till_sessions WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,id]);
 const row=rows[0];if(!row||row.status!=='OPEN')throw new ApiProblem(409,'TILL_NOT_OPEN','This till is no longer open.');
 if(Number(row.version)!==version)throw new ApiProblem(409,'VERSION_CONFLICT','This till changed. Review it before continuing.');
 if(row.operatorId!==actor.staffId||row.deviceId!==actor.deviceId)throw new ApiProblem(403,'TILL_OWNERSHIP_REQUIRED','Use the till opened by this operator on this device.');
 return row;
}
const savePolicy=async({tx,command,actor,at})=>{
 await businessLock(tx,actor.businessId);const p=command.payload;reason(p.reason);
 if(!['SINGLE_BUSINESS','OUTLET','OPERATOR_DEVICE'].includes(p.scope))fail('Choose a supported till scope.');
 const threshold=moneyMinor(p.varianceThresholdMinor,true);
 const active=await tx.client.query(`SELECT 1 FROM till_sessions WHERE business_id=$1 AND status<>'CLOSED' LIMIT 1`,[actor.businessId]);if(active.rows.length)throw new ApiProblem(409,'OPEN_TILLS_BLOCK_POLICY','Close and review all tills before changing till policy.');
 const version=await tx.bumpEntityVersion(actor.businessId,'tillPolicy',actor.businessId,expected(command,'tillPolicy',actor.businessId));
 const {rows}=await tx.client.query(`INSERT INTO business_till_policy(business_id,scope,variance_threshold_minor,version,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(business_id) DO UPDATE SET scope=EXCLUDED.scope,variance_threshold_minor=EXCLUDED.variance_threshold_minor,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING ${policyColumns}`,[actor.businessId,p.scope,threshold,version,actor.staffId,at]);
 const value=policyProjection(actor.businessId,rows[0]);return {value,records:[value]};
};
const open=async({tx,command,actor,at})=>{
 await businessLock(tx,actor.businessId);const p=command.payload;
 if(!uuid(p.id)||!uuid(p.outletId)||expected(command,'tillSessions',p.id)!==0)fail('A new till ID and outlet are required.');
 expected(command,'outlets',p.outletId);
 const outlet=await tx.client.query('SELECT 1 FROM business_outlets WHERE business_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE',[actor.businessId,p.outletId]);if(!outlet.rows.length)throw new ApiProblem(409,'RESOURCE_CONFLICT','The outlet is missing or archived.');
 const {rows}=await tx.client.query(`SELECT ${policyColumns} FROM business_till_policy WHERE business_id=$1`,[actor.businessId]);
 const policy=rows[0]?{scope:rows[0].scope,varianceThresholdMinor:Number(rows[0].varianceThresholdMinor),version:Number(rows[0].version)}:{scope:'SINGLE_BUSINESS',varianceThresholdMinor:0,version:0};
 if(expected(command,'tillPolicy',actor.businessId)!==policy.version)throw new ApiProblem(409,'VERSION_CONFLICT','Till policy changed. Review the current policy.');
 const scopeKey=policy.scope==='SINGLE_BUSINESS'?'business':policy.scope==='OUTLET'?`outlet:${p.outletId}`:`operator-device:${actor.staffId}:${actor.deviceId}`;
 const version=await tx.bumpEntityVersion(actor.businessId,'tillSessions',p.id,0);
 await tx.client.query(`INSERT INTO till_sessions(business_id,id,outlet_id,scope_key,policy_snapshot,operator_id,device_id,status,opening_float_minor,version,opened_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,'OPEN',$8,$9,$10)`,[actor.businessId,p.id,p.outletId,scopeKey,JSON.stringify(policy),actor.staffId,actor.deviceId,moneyMinor(p.openingFloatMinor,true),version,at]);return result(tx,actor.businessId,p.id);
};
const cashMovement=async({tx,command,actor,at})=>{
 const p=command.payload,id=p.tillSessionId,till=await requireOpenTill(tx,actor,id,expected(command,'tillSessions',id));
 if(!['PAID_IN','PAID_OUT'].includes(p.direction))fail('Choose cash paid in or paid out.');
 const amount=moneyMinor(p.amountMinor),note=reason(p.reason),delta=p.direction==='PAID_IN'?amount:-amount;
 const balance=await tx.client.query('SELECT COALESCE(sum(amount_delta_minor),0) AS delta FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[actor.businessId,id]);
 const next=Number(till.openingFloatMinor)+Number(balance.rows[0].delta)+delta;
 if(!Number.isSafeInteger(next)||next<0)throw new ApiProblem(409,'INSUFFICIENT_DRAWER_CASH','Cash movement exceeds the recorded drawer cash or amount limit.');
 const entryId=randomUUID();await tx.client.query(`INSERT INTO till_cash_entries(business_id,id,till_session_id,kind,amount_delta_minor,reason,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[actor.businessId,entryId,id,p.direction,delta,note,command.commandId,actor.staffId,actor.deviceId,at]);
 const version=await tx.bumpEntityVersion(actor.businessId,'tillSessions',id,Number(till.version));await tx.client.query('UPDATE till_sessions SET version=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,id,version]);
 return result(tx,actor.businessId,id,[{collection:'cashMovements',id:entryId,version:1,archived:false,data:{id:entryId,tillSessionId:id,kind:p.direction,amountDeltaMinor:delta,reason:note,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,occurredAt:at.toISOString()}}]);
};
const close=async({tx,command,actor,at})=>{
 await businessLock(tx,actor.businessId);
 const p=command.payload,id=p.id,till=await requireOpenTill(tx,actor,id,expected(command,'tillSessions',id));
 const counted=moneyMinor(p.countedCashMinor,true);
 const unresolved=await tx.client.query(`SELECT 1 FROM api_commands WHERE business_id=$1 AND command_id<>$2 AND status IN ('RECEIVED','PROCESSING') AND command_name IN ('payment.record','payment.split','payment.refund','payment.reverse','credit.settle','credit.reverse','till.cashMovement') LIMIT 1`,[actor.businessId,command.commandId]);
 if(unresolved.rows.length)throw new ApiProblem(409,'UNRESOLVED_MONEY_COMMANDS','Recover unresolved money command outcomes before closing the till.');
 const orders=await tx.client.query(`SELECT 1 FROM pos_orders WHERE business_id=$1 AND outlet_id=$2 AND state NOT IN ('COMPLETED','VOIDED') LIMIT 1`,[actor.businessId,till.outletId]);if(orders.rows.length)throw new ApiProblem(409,'UNSETTLED_ORDERS','Resolve open orders in this outlet before closing the till.');
 const entries=await tx.client.query('SELECT COALESCE(sum(amount_delta_minor),0) AS delta FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[actor.businessId,id]);
 const expectedCash=Number(till.openingFloatMinor)+Number(entries.rows[0].delta),variance=counted-expectedCash;
 if(!Number.isSafeInteger(expectedCash)||!Number.isSafeInteger(variance)||expectedCash<0)throw new ApiProblem(409,'INVALID_DRAWER_BALANCE','The drawer ledger requires review.');
 const note=variance?reason(p.varianceReason):null,review=Math.abs(variance)>till.policySnapshot.varianceThresholdMinor;
 const version=await tx.bumpEntityVersion(actor.businessId,'tillSessions',id,Number(till.version));
 await tx.client.query(`UPDATE till_sessions SET counted_cash_minor=$3,expected_cash_minor=$4,variance_minor=$5,variance_reason=$6,status=$7,version=$8,counted_at=$9,closed_at=$10,closed_by=$11 WHERE business_id=$1 AND id=$2`,[actor.businessId,id,counted,expectedCash,variance,note,review?'REVIEW_REQUIRED':'CLOSED',version,at,review?null:at,review?null:actor.staffId]);return result(tx,actor.businessId,id);
};
const review=async({tx,command,actor,at})=>{
 const p=command.payload;if(!uuid(p.id))fail('Choose a till for review.');const note=reason(p.reason),baseline=expected(command,'tillSessions',p.id);
 const managerApproval=await requireManagerApproval({tx,actor,at,token:p.approvalToken,permission:'till.override_variance',target:p.id,command});
 const {rows}=await tx.client.query(`SELECT status,version FROM till_sessions WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,p.id]);
 if(!rows.length||rows[0].status!=='REVIEW_REQUIRED')throw new ApiProblem(409,'REVIEW_NOT_REQUIRED','This till does not await variance review.');
 if(Number(rows[0].version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','The till review changed. Refresh it.');
 const version=await tx.bumpEntityVersion(actor.businessId,'tillSessions',p.id,baseline);await tx.client.query(`UPDATE till_sessions SET status='CLOSED',closed_by=$3,closed_at=$4,review_reason=$5,version=$6 WHERE business_id=$1 AND id=$2`,[actor.businessId,p.id,actor.staffId,at,note,version]);return result(tx,actor.businessId,p.id);
};
export const tillCommandRegistry=new Map([
 ['till.policy.save','business.configure',savePolicy],['till.open','till.open',open],['till.cashMovement','till.cashMovement',cashMovement],['till.close','till.close',close],['till.reviewVariance','till.override_variance',review],
].map(([name,permission,handler])=>[name,{permission,approvalPermission:name==='till.reviewVariance'?'till.override_variance':undefined,offlinePolicy:'ONLINE_ONLY',handler}]));
