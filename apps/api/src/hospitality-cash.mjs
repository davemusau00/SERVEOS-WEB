import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {requireOpenTill,tillSessionProjection} from './till-commands.mjs';

/** Same owned drawer and immutable cash ledger used by POS; never create a till. */
export async function reviewedHospitalityTill(tx,actor,command,input){
 const id=input?.tillSessionId,version=command.expectedVersions[`tillSessions:${id}`];
 if(!Number.isSafeInteger(version)||version<1)throw new ApiProblem(400,'VALIDATION_FAILED','Review the open cashier shift before recording guest cash.');
 const till=await requireOpenTill(tx,actor,id,version);
 const enrolled=await tx.client.query('SELECT device_id FROM pos_checkout_terminals WHERE business_id=$1 AND outlet_id=$2 FOR SHARE',[actor.businessId,till.outletId]);
 if(!enrolled.rows[0]||enrolled.rows[0].device_id!==actor.deviceId)throw new ApiProblem(403,'CHECKOUT_DEVICE_REQUIRED','Guest cash requires the enrolled checkout terminal for this shift.');
 return till;
}

export async function recordHospitalityCash(tx,actor,command,at,till,amountMinor,paymentId){
 const cash=await tx.client.query('SELECT COALESCE(sum(amount_delta_minor),0) AS delta FROM till_cash_entries WHERE business_id=$1 AND till_session_id=$2',[actor.businessId,till.id]);
 const total=BigInt(till.openingFloatMinor)+BigInt(cash.rows[0].delta)+BigInt(amountMinor);
 if(total<0n||total>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiProblem(409,'DRAWER_AMOUNT_LIMIT','The drawer balance needs reconciliation before accepting more cash.');
 const id=randomUUID(),reason='Guest accommodation cash received';
 await tx.client.query(`INSERT INTO till_cash_entries(business_id,id,till_session_id,kind,amount_delta_minor,reason,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,'SALE',$4,$5,$6,$7,$8,$9)`,[actor.businessId,id,till.id,amountMinor,reason,command.commandId,actor.staffId,actor.deviceId,at]);
 const version=await tx.bumpEntityVersion(actor.businessId,'tillSessions',till.id,Number(till.version));
 await tx.client.query('UPDATE till_sessions SET version=$3 WHERE business_id=$1 AND id=$2',[actor.businessId,till.id,version]);
 return [{collection:'cashMovements',id,version:1,archived:false,data:{id,tillSessionId:till.id,kind:'SALE',amountDeltaMinor:amountMinor,reason,hospitalityPaymentId:paymentId,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,occurredAt:at.toISOString()}},await tillSessionProjection(tx.client,actor.businessId,till.id)];
}
