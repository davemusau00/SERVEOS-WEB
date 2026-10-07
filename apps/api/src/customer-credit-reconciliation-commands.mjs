import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {customerCreditAccountProjections} from './customer-credit-commands.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const record=(collection,row,version,data)=>({collection,id:row.id,version,archived:false,data});

export async function customerCreditReconciliationProjections(db,businessId){
 const {rows}=await db.query(`SELECT id,customer_id AS "customerId",ledger_balance_minor AS "ledgerBalanceMinor",statement_balance_minor AS "statementBalanceMinor",variance_minor AS "varianceMinor",statement_reference AS "statementReference",notes,status,source_command_id AS "sourceCommandId",staff_id AS "staffId",device_id AS "deviceId",reconciled_at AS "reconciledAt" FROM customer_credit_reconciliations WHERE business_id=$1 ORDER BY reconciled_at DESC,id LIMIT 1000`,[businessId]);
 return rows.map(row=>record('customerCreditReconciliations',row,1,{...row,ledgerBalanceMinor:Number(row.ledgerBalanceMinor),statementBalanceMinor:Number(row.statementBalanceMinor),varianceMinor:Number(row.varianceMinor),reconciledAt:row.reconciledAt.toISOString()}));
}
export async function customerCreditDiscrepancyProjections(db,businessId){
 const {rows}=await db.query(`SELECT d.id,d.reconciliation_id AS "reconciliationId",d.customer_id AS "customerId",d.variance_minor AS "varianceMinor",d.opened_at AS "openedAt",r.statement_reference AS "statementReference",x.outcome,x.resolution,x.staff_id AS "resolvedBy",x.device_id AS "resolvedDeviceId",x.resolved_at AS "resolvedAt" FROM customer_credit_discrepancies d JOIN customer_credit_reconciliations r ON r.business_id=d.business_id AND r.id=d.reconciliation_id LEFT JOIN customer_credit_discrepancy_resolutions x ON x.business_id=d.business_id AND x.discrepancy_id=d.id WHERE d.business_id=$1 ORDER BY d.opened_at DESC,d.id LIMIT 1000`,[businessId]);
 return rows.map(row=>{const {resolvedAt,resolvedDeviceId,...data}=row;return record('customerCreditDiscrepancies',row,resolvedAt?2:1,{...data,varianceMinor:Number(data.varianceMinor),status:resolvedAt?'RESOLVED':'OPEN',openedAt:row.openedAt.toISOString(),...(resolvedAt?{resolvedDeviceId,resolvedAt:resolvedAt.toISOString()}:{})});});
}
const reconcile=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.reconcile'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer credit reconciliation permission is required.');
 const p=command.payload;if(!uuid(p.id)||!uuid(p.customerId)||command.expectedVersions[`customerCreditReconciliations:${p.id}`]!==0)fail('Choose a customer and a new reconciliation identity.');
 if(!Number.isSafeInteger(p.statementBalanceMinor)||p.statementBalanceMinor<0||p.statementBalanceMinor>9_000_000_000_000)fail('Statement balance must be a non-negative KES amount in minor units.');
 if(typeof p.statementReference!=='string'||p.statementReference.trim().length<1||p.statementReference.trim().length>160||/[\u0000-\u001f\u007f]/u.test(p.statementReference))fail('Enter a valid statement or review reference.');
 if(typeof p.notes!=='string'||p.notes.trim().length<3||p.notes.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.notes))fail('Reconciliation notes must be 3 to 500 characters.');
 const accountVersion=command.expectedVersions[`customerCreditAccounts:${p.customerId}`];if(!Number.isSafeInteger(accountVersion)||accountVersion<1)fail('Review the current customer credit account before reconciling.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer-credit:${actor.businessId}:${p.customerId}`]);
 const {rows:accounts}=await tx.client.query('SELECT version FROM customer_credit_accounts WHERE business_id=$1 AND customer_id=$2 FOR UPDATE',[actor.businessId,p.customerId]);
 if(!accounts.length||Number(accounts[0].version)!==accountVersion)throw new ApiProblem(409,'VERSION_CONFLICT','The customer credit account changed. Refresh before reconciling.');
 const {rows:balances}=await tx.client.query('SELECT COALESCE(sum(balance_delta_minor),0)::text AS balance FROM customer_credit_entries WHERE business_id=$1 AND customer_id=$2',[actor.businessId,p.customerId]);
 const ledgerBalanceMinor=Number(balances[0].balance);if(!Number.isSafeInteger(ledgerBalanceMinor)||Math.abs(ledgerBalanceMinor)>9_000_000_000_000)throw new ApiProblem(409,'CREDIT_BALANCE_RECONCILIATION_REQUIRED','The ledger balance exceeds the supported range. Reconcile its source entries before continuing.');
 const varianceMinor=p.statementBalanceMinor-ledgerBalanceMinor;if(!Number.isSafeInteger(varianceMinor))throw new ApiProblem(409,'CREDIT_BALANCE_RECONCILIATION_REQUIRED','The reconciliation variance exceeds the supported range.');
 const status=varianceMinor===0?'MATCHED':'DISCREPANCY_OPEN';
 await tx.bumpEntityVersion(actor.businessId,'customerCreditReconciliations',p.id,0);
 await tx.client.query(`INSERT INTO customer_credit_reconciliations(business_id,id,customer_id,ledger_balance_minor,statement_balance_minor,variance_minor,statement_reference,notes,status,source_command_id,staff_id,device_id,reconciled_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[actor.businessId,p.id,p.customerId,ledgerBalanceMinor,p.statementBalanceMinor,varianceMinor,p.statementReference.trim(),p.notes.trim(),status,command.commandId,actor.staffId,actor.deviceId,at]);
 const reconciliation={collection:'customerCreditReconciliations',id:p.id,version:1,archived:false,data:{id:p.id,customerId:p.customerId,ledgerBalanceMinor,statementBalanceMinor:p.statementBalanceMinor,varianceMinor,statementReference:p.statementReference.trim(),notes:p.notes.trim(),status,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,reconciledAt:at.toISOString()}};
 const records=[reconciliation];
 if(varianceMinor!==0){
  const discrepancyId=randomUUID();await tx.bumpEntityVersion(actor.businessId,'customerCreditDiscrepancies',discrepancyId,0);
  await tx.client.query(`INSERT INTO customer_credit_discrepancies(business_id,id,reconciliation_id,customer_id,variance_minor,opened_at) VALUES($1,$2,$3,$4,$5,$6)`,[actor.businessId,discrepancyId,p.id,p.customerId,varianceMinor,at]);
  records.push({collection:'customerCreditDiscrepancies',id:discrepancyId,version:1,archived:false,data:{id:discrepancyId,reconciliationId:p.id,customerId:p.customerId,varianceMinor,status:'OPEN',openedAt:at.toISOString()}});
 }
 records.push((await customerCreditAccountProjections(tx.client,actor.businessId,[p.customerId]))[0]);
 return {value:reconciliation,records};
};

const resolve=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('credit.reconcile'))throw new ApiProblem(403,'PERMISSION_DENIED','Customer credit reconciliation permission is required.');
 const p=command.payload;if(!uuid(p.discrepancyId)||p.id!==p.discrepancyId)fail('Choose an open customer credit discrepancy.');
 const expected=command.expectedVersions[`customerCreditDiscrepancies:${p.discrepancyId}`];if(expected!==1)fail('Review the current discrepancy before resolving it.');
 const allowedOutcomes=['STATEMENT_ERROR','MISSING_PAYMENT','MISSING_CHARGE','ACCEPTED_VARIANCE','WRITE_OFF_REQUIRED'];if(!allowedOutcomes.includes(p.outcome))fail('Choose a supported discrepancy outcome.');
 if(typeof p.resolution!=='string'||p.resolution.trim().length<3||p.resolution.trim().length>500||/[\u0000-\u001f\u007f]/u.test(p.resolution))fail('Resolution notes must be 3 to 500 characters.');
 if(['ACCEPTED_VARIANCE','WRITE_OFF_REQUIRED'].includes(p.outcome)&&!actor.permissions.includes('*')&&!actor.permissions.includes('credit.manage')&&!actor.permissions.includes('credit.write_off'))throw new ApiProblem(403,'PERMISSION_DENIED','A credit manager must approve an accepted variance or write-off disposition.');
 await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer-credit-discrepancy:${actor.businessId}:${p.discrepancyId}`]);
 const {rows}=await tx.client.query(`SELECT d.id,d.customer_id AS "customerId",d.variance_minor AS "varianceMinor",d.opened_at AS "openedAt",r.statement_reference AS "statementReference" FROM customer_credit_discrepancies d JOIN customer_credit_reconciliations r ON r.business_id=d.business_id AND r.id=d.reconciliation_id WHERE d.business_id=$1 AND d.id=$2 AND NOT EXISTS(SELECT 1 FROM customer_credit_discrepancy_resolutions x WHERE x.business_id=d.business_id AND x.discrepancy_id=d.id) FOR UPDATE OF d`,[actor.businessId,p.discrepancyId]);
 const discrepancy=rows[0];if(!discrepancy)throw new ApiProblem(409,'CREDIT_DISCREPANCY_CLOSED','This discrepancy is already resolved or no longer available. Refresh the exceptions list.');
 await tx.bumpEntityVersion(actor.businessId,'customerCreditDiscrepancies',p.discrepancyId,expected);
 const resolutionId=randomUUID();await tx.client.query(`INSERT INTO customer_credit_discrepancy_resolutions(business_id,id,discrepancy_id,outcome,resolution,source_command_id,staff_id,device_id,resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[actor.businessId,resolutionId,p.discrepancyId,p.outcome,p.resolution.trim(),command.commandId,actor.staffId,actor.deviceId,at]);
 const value={collection:'customerCreditDiscrepancies',id:p.discrepancyId,version:2,archived:false,data:{id:p.discrepancyId,customerId:discrepancy.customerId,varianceMinor:Number(discrepancy.varianceMinor),statementReference:discrepancy.statementReference,status:'RESOLVED',outcome:p.outcome,resolution:p.resolution.trim(),resolvedBy:actor.staffId,deviceId:actor.deviceId,openedAt:discrepancy.openedAt.toISOString(),resolvedAt:at.toISOString()}};
 const audit={collection:'customerCreditDiscrepancyResolutions',id:resolutionId,version:1,archived:false,data:{id:resolutionId,discrepancyId:p.discrepancyId,outcome:p.outcome,resolution:p.resolution.trim(),sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,resolvedAt:at.toISOString()}};
 return {value,records:[value,audit]};
};

export const customerCreditReconciliationCommandRegistry=new Map([
 ['credit.reconcile',{permission:'credit.reconcile',offlinePolicy:'ONLINE_ONLY',handler:reconcile}],
 ['credit.discrepancy.resolve',{permission:'credit.reconcile',offlinePolicy:'ONLINE_ONLY',handler:resolve}],
]);
