import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const columns=`a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE(SUM(e.balance_delta_minor),0) AS "balanceMinor"`;
const projection=row=>({collection:'customerCreditAccounts',id:row.id,version:Number(row.version),archived:false,data:{customerId:row.id,customerName:row.customerName,status:row.status,limitMinor:Number(row.limitMinor),balanceMinor:Number(row.balanceMinor),availableMinor:Math.max(0,Number(row.limitMinor)-Number(row.balanceMinor)),termsDays:Number(row.termsDays),notes:row.notes,updatedBy:row.updatedBy,updatedAt:row.updatedAt.toISOString()}});

export async function customerCreditAccountProjections(db,businessId){
 const {rows}=await db.query(`SELECT a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE(SUM(e.balance_delta_minor),0) AS "balanceMinor" FROM customer_credit_accounts a JOIN business_customers c ON c.business_id=a.business_id AND c.id=a.customer_id LEFT JOIN customer_credit_entries e ON e.business_id=a.business_id AND e.customer_id=a.customer_id WHERE a.business_id=$1 GROUP BY a.business_id,a.customer_id,c.name ORDER BY lower(c.name),c.id`,[businessId]);
 return rows.map(projection);
}

export async function customerCreditEntryProjections(db,businessId){
 const {rows}=await db.query(`WITH running AS (SELECT e.id,e.customer_id AS "customerId",c.name AS "customerName",e.kind,e.balance_delta_minor AS "balanceDeltaMinor",e.amount_minor AS "amountMinor",e.order_id AS "orderId",e.due_at AS "dueAt",e.payment_method AS "paymentMethod",e.reference,e.allocations,e.reverses_entry_id AS "reversesEntryId",e.reason,e.actor_id AS "actorId",e.device_id AS "deviceId",e.source_command_id AS "sourceCommandId",e.occurred_at AS "occurredAt",SUM(e.balance_delta_minor) OVER(PARTITION BY e.customer_id ORDER BY e.occurred_at,e.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "balanceAfterMinor" FROM customer_credit_entries e JOIN business_customers c ON c.business_id=e.business_id AND c.id=e.customer_id WHERE e.business_id=$1), recent AS (SELECT * FROM running ORDER BY "occurredAt" DESC,id DESC LIMIT 1000) SELECT * FROM recent ORDER BY "occurredAt",id`,[businessId]);
 return rows.map(row=>({collection:'customerCreditEntries',id:row.id,version:1,archived:false,data:{...row,balanceDeltaMinor:Number(row.balanceDeltaMinor),amountMinor:Number(row.amountMinor),balanceAfterMinor:Number(row.balanceAfterMinor),dueAt:row.dueAt?.toISOString()??null,occurredAt:row.occurredAt.toISOString()}}));
}

const configure=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.manage'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer credit management permission is required.');
 const p=command.payload;
 if(!uuid(p.customerId)||p.id!==p.customerId)fail('Choose a valid customer account.');
 if(!Number.isSafeInteger(p.limitMinor)||p.limitMinor<0||p.limitMinor>9_000_000_000_000)fail('Credit limit must be a non-negative KES amount in minor units.');
 if(!Number.isSafeInteger(p.termsDays)||p.termsDays<0||p.termsDays>365)fail('Credit terms must be between 0 and 365 days.');
 if(!['ACTIVE','HOLD','CLOSED'].includes(p.status))fail('Credit status must be Active, Hold or Closed.');
 if(typeof p.notes!=='string'||p.notes.length>1000||/[\u0000-\u001f\u007f]/u.test(p.notes))fail('Credit account notes are invalid or too long.');
 if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.reason))fail('Enter a change reason between 3 and 500 characters.');
 const expected=p.expectedVersions?.find(row=>row?.collection==='customerCreditAccounts'&&row.id===p.customerId)?.version;
 if(!Number.isSafeInteger(expected)||expected<0)fail('Review the current customer credit account version before saving.');
 const {rows:customerRows}=await tx.client.query(`SELECT name,archived_at AS "archivedAt" FROM business_customers WHERE business_id=$1 AND id=$2 FOR SHARE`,[actor.businessId,p.customerId]);
 if(!customerRows.length||customerRows[0].archivedAt)throw new ApiProblem(409,'RESOURCE_CONFLICT','The customer is missing or archived. Refresh the customer list.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer-credit:${actor.businessId}:${p.customerId}`]);
 const version=await tx.bumpEntityVersion(actor.businessId,'customerCreditAccounts',p.customerId,expected);
 const {rows:priorRows}=await tx.client.query(`SELECT a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE((SELECT SUM(e.balance_delta_minor) FROM customer_credit_entries e WHERE e.business_id=a.business_id AND e.customer_id=a.customer_id),0) AS "balanceMinor" FROM customer_credit_accounts a JOIN business_customers c ON c.business_id=a.business_id AND c.id=a.customer_id WHERE a.business_id=$1 AND a.customer_id=$2 FOR UPDATE OF a`,[actor.businessId,p.customerId]);
 const prior=priorRows[0]??null;
 if(expected===0&&prior)throw new ApiProblem(409,'VERSION_CONFLICT','This customer credit account already exists. Refresh the account list.');
 if(expected>0&&!prior)throw new ApiProblem(409,'RESOURCE_CONFLICT','This customer credit account is no longer available. Refresh the account list.');
 const balance=Number(prior?.balanceMinor??0);
 if(!Number.isSafeInteger(balance))throw new ApiProblem(409,'CREDIT_BALANCE_RECONCILIATION_REQUIRED','Customer credit balance exceeds the supported range. Reconcile it before changing terms.');
 if(p.status==='CLOSED'&&balance!==0)throw new ApiProblem(409,'CREDIT_BALANCE_OPEN','Settle or write off the customer balance before closing credit.');
 await tx.client.query(`INSERT INTO customer_credit_accounts(business_id,customer_id,status,credit_limit_minor,terms_days,notes,version,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(business_id,customer_id) DO UPDATE SET status=EXCLUDED.status,credit_limit_minor=EXCLUDED.credit_limit_minor,terms_days=EXCLUDED.terms_days,notes=EXCLUDED.notes,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,p.customerId,p.status,p.limitMinor,p.termsDays,p.notes.trim(),version,actor.staffId,at]);
 const {rows}=await tx.client.query(`SELECT a.customer_id AS id,a.status,a.credit_limit_minor AS "limitMinor",a.terms_days AS "termsDays",a.notes,a.version,a.updated_by AS "updatedBy",a.updated_at AS "updatedAt",c.name AS "customerName",COALESCE((SELECT SUM(e.balance_delta_minor) FROM customer_credit_entries e WHERE e.business_id=a.business_id AND e.customer_id=a.customer_id),0) AS "balanceMinor" FROM customer_credit_accounts a JOIN business_customers c ON c.business_id=a.business_id AND c.id=a.customer_id WHERE a.business_id=$1 AND a.customer_id=$2`,[actor.businessId,p.customerId]);
 const value=projection(rows[0]);
 await tx.client.query(`INSERT INTO customer_credit_account_events(business_id,id,customer_id,version,event_type,reason,before_state,after_state,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,'TERMS_SAVED',$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,[actor.businessId,randomUUID(),p.customerId,version,p.reason.trim(),prior?JSON.stringify(projection(prior).data):null,JSON.stringify(value.data),command.commandId,actor.staffId,actor.deviceId,at]);
 return {value,records:[value]};
};

export const customerCreditCommandRegistry=new Map([['customerCredit.configure',{permission:'credit.manage',offlinePolicy:'ONLINE_ONLY',handler:configure}]]);
