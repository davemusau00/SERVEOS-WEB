import {createHash,randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {profitAndLossOnConnection} from './management-profit-and-loss.mjs';

// A reviewed management statement is not an accountant-certified ledger close.
// Do not activate authoritative close by accepting a client checkbox or by
// assuming that expired leases mean every browser's received cash has arrived.
const AUTHORITATIVE_CLOSE_SUPPORTED=false;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const has=(actor,...permissions)=>actor.permissions?.includes('*')||permissions.some(permission=>actor.permissions?.includes(permission));
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const conflict=(code,message)=>{throw new ApiProblem(409,code,message)};
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
const integer=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)conflict('PERIOD_EVIDENCE_REQUIRES_REVIEW','Period evidence contains an unsupported count.');return n};
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const iso=value=>value?.toISOString?.()??value??null;
const reason=value=>{if(typeof value!=='string'||value.trim().length<3||value.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail('Record a review reason of 3 to 500 characters.');return value.trim()};
const record=(collection,id,version,data)=>({collection,id,version,archived:false,data});
const periodColumns='id,from_date::text AS "from",to_date::text AS "to",time_zone AS "timeZone",status,version,current_review_id AS "currentReviewId",last_closed_review_id AS "lastClosedReviewId",created_by AS "createdBy",created_at AS "createdAt",updated_at AS "updatedAt",closed_by AS "closedBy",closed_at AS "closedAt"';
const policyColumns='business_id AS id,enabled,version,updated_by AS "updatedBy",updated_at AS "updatedAt"';
const reviewColumns='id,period_id AS "periodId",period_version AS "periodVersion",purpose,reason,assessment,statement_snapshot AS "statementSnapshot",snapshot_hash AS "snapshotHash",source_command_id AS "sourceCommandId",recorded_by AS "recordedBy",recorded_by_name AS "recordedByName",recorded_at AS "recordedAt"';
const reviewMetadataColumns='id,period_id AS "periodId",period_version AS "periodVersion",purpose,reason,assessment,snapshot_hash AS "snapshotHash",source_command_id AS "sourceCommandId",recorded_by AS "recordedBy",recorded_by_name AS "recordedByName",recorded_at AS "recordedAt",statement_snapshot->\'statement\'->>\'status\' AS "statementStatus",statement_snapshot->\'statement\'->>\'reportVersion\' AS "reportVersion",statement_snapshot->\'statement\'->>\'generatedAt\' AS "reportGeneratedAt",statement_snapshot->\'period\'->>\'from\' AS "from",statement_snapshot->\'period\'->>\'to\' AS "to",statement_snapshot->\'period\'->>\'timeZone\' AS "timeZone"';
const eventColumns='id,period_id AS "periodId",event_type AS "eventType",before_state AS "beforeState",after_state AS "afterState",reason,source_command_id AS "sourceCommandId",staff_id AS "staffId",device_id AS "deviceId",occurred_at AS "occurredAt"';
const projectPeriod=row=>record('accountingPeriods',row.id,integer(row.version),{...row,version:integer(row.version),createdAt:iso(row.createdAt),updatedAt:iso(row.updatedAt),closedAt:iso(row.closedAt)});
const projectPolicy=row=>record('accountingPeriodPolicy',row.id,integer(row.version),{...row,version:integer(row.version),authoritativeCloseSupported:AUTHORITATIVE_CLOSE_SUPPORTED,updatedAt:iso(row.updatedAt)});
const projectReview=(row,{full=false}={})=>{
 const {statementSnapshot,...data}=row,statement=statementSnapshot?.statement,period=statementSnapshot?.period;
 return record('accountingPeriodReviews',row.id,1,{...data,periodVersion:integer(row.periodVersion),recordedAt:iso(row.recordedAt),statementStatus:data.statementStatus??statement?.status,reportVersion:integer(data.reportVersion??statement?.reportVersion),reportGeneratedAt:data.reportGeneratedAt??statement?.generatedAt,from:data.from??period?.from,to:data.to??period?.to,timeZone:data.timeZone??period?.timeZone,...(full?{statementSnapshot}:{})});
};
const projectEvent=row=>record('accountingPeriodEvents',row.id,1,{...row,occurredAt:iso(row.occurredAt)});

export function accountingPeriodCapability(actor,raw=process.env.ACCOUNTING_PERIOD_COHORTS){
 if(!has(actor,'accounting.view','accounting.manage','reports.view'))return false;
 let cohorts;try{cohorts=JSON.parse(raw||'[]')}catch{return false}
 return Boolean(actor.deviceId&&Array.isArray(cohorts)&&cohorts.some(cohort=>cohort&&cohort.businessId===actor.businessId&&cohort.staffId===actor.staffId&&cohort.deviceId===actor.deviceId));
}

export async function acquireAccountingPeriodLock(db,businessId,{exclusive=false}={}){
 await db.query(`SELECT ${exclusive?'pg_advisory_xact_lock':'pg_advisory_xact_lock_shared'}(hashtextextended($1,0))`,[`accounting-period:${businessId}`]);
}

// Central payment/credit writers use a useful API conflict before their insert.
// Migration 084 also protects all direct procurement, hotel and expense inserts.
// Protection is independent of whether new reviews are currently enabled.
export async function guardAccountingPosting(db,businessId,occurredAt){
 await acquireAccountingPeriodLock(db,businessId);
 const blocked=await db.query(`SELECT from_date::text AS "from",to_date::text AS "to" FROM business_accounting_periods WHERE business_id=$1 AND status='CLOSED' AND ($2::timestamptz AT TIME ZONE time_zone)::date BETWEEN from_date AND to_date LIMIT 1`,[businessId,occurredAt]);
 if(blocked.rows.length)conflict('ACCOUNTING_PERIOD_CLOSED',`The posting date belongs to the closed period ${blocked.rows[0].from} to ${blocked.rows[0].to}. Request authorised reopening; preserve the original cash evidence and command identity.`);
}

const read=async(pool,work)=>{const db=await pool.connect();try{await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const value=await work(db);await db.query('COMMIT');return value}catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}};
export async function accountingPeriodProjections(db,businessId){
 const policy=await db.query(`SELECT ${policyColumns} FROM business_accounting_period_policy WHERE business_id=$1`,[businessId]);
 const periods=await db.query(`SELECT ${periodColumns} FROM business_accounting_periods WHERE business_id=$1 ORDER BY to_date DESC,id LIMIT 100`,[businessId]);
 const reviews=await db.query(`SELECT ${reviewMetadataColumns} FROM business_accounting_period_reviews WHERE business_id=$1 ORDER BY recorded_at DESC,id LIMIT 50`,[businessId]);
 const events=await db.query(`SELECT ${eventColumns} FROM business_accounting_period_events WHERE business_id=$1 ORDER BY occurred_at DESC,id LIMIT 100`,[businessId]);
 return [...policy.rows.map(projectPolicy),...periods.rows.map(projectPeriod),...reviews.rows.map(projectReview),...events.rows.map(projectEvent)];
}
export async function accountingPeriodState(pool,businessId){
 return read(pool,async db=>{
  const records=await accountingPeriodProjections(db,businessId);
  const counts=await db.query(`SELECT (SELECT count(*) FROM business_accounting_periods WHERE business_id=$1)::text AS periods,(SELECT count(*) FROM business_accounting_period_reviews WHERE business_id=$1)::text AS reviews,(SELECT count(*) FROM business_accounting_period_events WHERE business_id=$1)::text AS events,statement_timestamp() AS generated_at`,[businessId]);
  return {authoritativeCloseSupported:AUTHORITATIVE_CLOSE_SUPPORTED,generatedAt:iso(counts.rows[0].generated_at),policy:records.find(row=>row.collection==='accountingPeriodPolicy')??null,periods:records.filter(row=>row.collection==='accountingPeriods'),reviews:records.filter(row=>row.collection==='accountingPeriodReviews'),events:records.filter(row=>row.collection==='accountingPeriodEvents'),totalPeriods:integer(counts.rows[0].periods),totalReviews:integer(counts.rows[0].reviews),totalEvents:integer(counts.rows[0].events)};
 });
}
export async function accountingPeriodReview(pool,businessId,reviewId){
 if(!uuid(reviewId))fail('Choose a valid period review.');
 return read(pool,async db=>{const {rows}=await db.query(`SELECT ${reviewColumns} FROM business_accounting_period_reviews WHERE business_id=$1 AND id=$2`,[businessId,reviewId]);if(!rows.length)throw new ApiProblem(404,'RESOURCE_NOT_FOUND','The selected period review is unavailable.');if(createHash('sha256').update(stable(rows[0].statementSnapshot)).digest('hex')!==rows[0].snapshotHash.trim())conflict('PERIOD_SNAPSHOT_INTEGRITY_REQUIRED','The original review snapshot does not match its recorded hash. Preserve the evidence for authorised investigation.');return projectReview(rows[0],{full:true})});
}

async function permitted(context,{policyRequired=true}={}){
 const {tx,actor}=context;
 if(!has(actor,'accounting.manage'))throw new ApiProblem(403,'PERMISSION_DENIED','Accounting management permission is required for period review or reopening.');
 if(!accountingPeriodCapability(actor))throw new ApiProblem(403,'ACCOUNTING_PERIOD_PILOT_DISABLED','This staff and device are outside the period-review cohort. Existing records remain available to authorised readers.');
 // A review must not hold the checkout's business lock indefinitely. A timeout
 // preserves the original unresolved command for same-ID recovery.
 await tx.client.query("SET LOCAL statement_timeout='15s'");
 await tx.client.query("SET LOCAL lock_timeout='5s'");
 await acquireAccountingPeriodLock(tx.client,actor.businessId,{exclusive:true});
 const {rows}=await tx.client.query(`SELECT ${policyColumns} FROM business_accounting_period_policy WHERE business_id=$1`,[actor.businessId]);
 if(policyRequired&&!rows[0]?.enabled)throw new ApiProblem(403,'ACCOUNTING_PERIOD_POLICY_DISABLED','A manager must explicitly enable period reviews for this business.');
 return rows[0]??null;
}
function expected(command,collection,id){
 // Period commands must not acquire operational entity locks before the exclusive
 // accounting lock. They change their own period/policy resource only.
 const key=`${collection}:${id}`;
 if(Object.keys(command.expectedVersions).length!==1||!Object.hasOwn(command.expectedVersions,key))fail('Review exactly the current accounting period or policy version.');
 const n=command.expectedVersions[key];if(!Number.isSafeInteger(n)||n<0)fail('A valid reviewed version is required.');return n;
}
async function staffName(db,actor){const {rows}=await db.query('SELECT display_name FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2',[actor.businessId,actor.staffId]);return rows[0]?.display_name||'Authorised accountant'};
async function addEvent(context,{periodId=null,eventType,before={},after={},notes}){
 const {tx,actor,command,at}=context,id=randomUUID();
 await tx.client.query(`INSERT INTO business_accounting_period_events(business_id,id,period_id,event_type,before_state,after_state,reason,source_command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)`,[actor.businessId,id,periodId,eventType,JSON.stringify(before),JSON.stringify(after),notes,command.commandId,actor.staffId,actor.deviceId,at]);
 return projectEvent({id,periodId,eventType,beforeState:before,afterState:after,reason:notes,sourceCommandId:command.commandId,staffId:actor.staffId,deviceId:actor.deviceId,occurredAt:at});
}

async function assessment(db,businessId,period,statement,commandId){
 const params=[businessId,period.from,period.to,period.timeZone,commandId];
 const {rows}=await db.query(`SELECT
  (SELECT count(*) FROM api_commands c WHERE c.business_id=$1 AND c.command_id<>$5 AND c.status IN ('RECEIVED','PROCESSING') AND c.command_name NOT LIKE 'accountingPeriod.%')::text AS unresolved_commands,
  (SELECT count(*) FROM till_sessions t WHERE t.business_id=$1 AND t.status IN ('OPEN','REVIEW_REQUIRED') AND t.opened_at<(($3::date+1) AT TIME ZONE $4))::text AS unclosed_tills,
  (SELECT count(*) FROM pos_offline_capabilities c WHERE c.business_id=$1 AND c.revoked_at IS NULL AND c.issued_at<(($3::date+1) AT TIME ZONE $4))::text AS unended_offline_capabilities,
  (SELECT count(*) FROM offline_grants g WHERE g.business_id=$1 AND g.revoked_at IS NULL AND g.issued_at<(($3::date+1) AT TIME ZONE $4) AND EXISTS(SELECT 1 FROM unnest(g.allowed_commands) AS commands(command_name) WHERE commands.command_name~'^(order|payment|pos|till|credit)[.]'))::text AS legacy_offline_grants,
  (SELECT count(*) FROM pos_offline_cash_reconciliations r WHERE r.business_id=$1 AND r.status='RECONCILIATION_REQUIRED')::text AS cash_exceptions,
  (SELECT count(*) FROM business_expenses e WHERE e.business_id=$1 AND e.status='DRAFT' AND e.occurred_at<(($3::date+1) AT TIME ZONE $4))::text AS unposted_expenses,
  (SELECT count(*) FROM customer_credit_discrepancies d WHERE d.business_id=$1 AND NOT EXISTS(SELECT 1 FROM customer_credit_discrepancy_resolutions r WHERE r.business_id=d.business_id AND r.discrepancy_id=d.id))::text AS credit_exceptions,
  (SELECT count(*) FROM financial_journals j WHERE j.business_id=$1 AND (j.occurred_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date AND (j.total_debit_minor IS DISTINCT FROM (SELECT sum(l.debit_minor) FROM financial_journal_lines l WHERE l.business_id=j.business_id AND l.journal_id=j.id) OR j.total_credit_minor IS DISTINCT FROM (SELECT sum(l.credit_minor) FROM financial_journal_lines l WHERE l.business_id=j.business_id AND l.journal_id=j.id)))::text AS financial_journal_exceptions,
  (SELECT count(*) FROM business_hospitality_journals j WHERE j.business_id=$1 AND (j.occurred_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date AND (j.total_minor IS DISTINCT FROM (SELECT sum(l.debit_minor) FROM business_hospitality_journal_lines l WHERE l.business_id=j.business_id AND l.journal_id=j.id) OR j.total_minor IS DISTINCT FROM (SELECT sum(l.credit_minor) FROM business_hospitality_journal_lines l WHERE l.business_id=j.business_id AND l.journal_id=j.id)))::text AS hospitality_journal_exceptions,
  (SELECT count(*) FROM business_expense_journals j WHERE j.business_id=$1 AND (j.occurred_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date AND (j.amount_minor IS DISTINCT FROM (SELECT sum(l.debit_minor) FROM business_expense_journal_lines l WHERE l.business_id=j.business_id AND l.journal_id=j.id) OR j.amount_minor IS DISTINCT FROM (SELECT sum(l.credit_minor) FROM business_expense_journal_lines l WHERE l.business_id=j.business_id AND l.journal_id=j.id)))::text AS expense_journal_exceptions,
  (CURRENT_TIMESTAMP<(($3::date+1) AT TIME ZONE $4)) AS period_not_ended`,params);
 const counts=Object.fromEntries(Object.entries(rows[0]).filter(([key])=>key!=='period_not_ended').map(([key,value])=>[key,integer(value)])),blockers=[];
 const add=(code,count,message)=>{if(count===null||count>0)blockers.push({code,count,message})};
 add('UNRESOLVED_COMMANDS',counts.unresolved_commands,'Other server commands still have an unresolved outcome. Recover the original command before closing.');
 add('UNCLOSED_TILLS',counts.unclosed_tills,'Open or review-required tills may still contain period cash. Complete shift reconciliation and handoff.');
 add('UNENDED_OFFLINE_CAPABILITIES',counts.unended_offline_capabilities,'Cash capabilities have not completed checkout-ledger reconciliation. Expiry is not proof of a drained browser queue.');
 add('LEGACY_OFFLINE_GRANTS',counts.legacy_offline_grants,'Legacy financial grants remain outstanding. Preserve and recover original commands; revocation alone does not reconcile received cash.');
 add('CASH_RECONCILIATION',counts.cash_exceptions,'Locally received cash exceptions require manager reconciliation.');
 add('UNPOSTED_EXPENSES',counts.unposted_expenses,'Expense drafts dated on or before the end of this period remain unposted.');
 add('CREDIT_RECONCILIATION',counts.credit_exceptions,'Customer-credit discrepancies remain unresolved.');
 add('UNBALANCED_JOURNALS',counts.financial_journal_exceptions+counts.hospitality_journal_exceptions+counts.expense_journal_exceptions,'Journal headers and immutable source lines do not reconcile.');
 if(rows[0].period_not_ended)add('PERIOD_NOT_ENDED',null,'The business-calendar period has not ended.');
 for(const issue of statement.coverage)add(`STATEMENT_${issue.code}`,issue.count,issue.message);
 if(statement.reconciliation.timingDifferenceMinor!==0)add('REVENUE_BASIS_BRIDGE',null,'Issued sales and revenue journals require an approved timing bridge; no automatic adjustment is posted.');
 if(statement.status!=='COMPLETE')add('ACCOUNTING_COVERAGE_UNCERTIFIED',null,'This management statement is incomplete. A qualified accountant must approve accounting coverage before authoritative close.');
 add('OFFLINE_QUEUE_COVERAGE_UNPROVEN',null,'Server records cannot prove every terminal ledger was frozen, exported and reconciled. No browser queue is presumed empty.');
 if(!AUTHORITATIVE_CLOSE_SUPPORTED)add('AUTHORITATIVE_CLOSE_UNAVAILABLE',null,'This release preserves reviews and posting guards only. Accountant-approved closing adjustments and complete financial/queue certification remain required.');
 return {assessmentVersion:1,status:'REVIEW_REQUIRED',eligibleForClose:false,authoritativeCloseSupported:AUTHORITATIVE_CLOSE_SUPPORTED,counts,blockers,offlineQueueCoverage:'UNPROVEN',statementStatus:statement.status,assessedAt:statement.generatedAt};
}

const savePolicy=async context=>{
 const {tx,actor,command,at}=context,p=command.payload;
 if(p.id!==actor.businessId||typeof p.enabled!=='boolean')fail('Choose this business and an explicit period-review policy.');
 const reviewed=expected(command,'accountingPeriodPolicy',p.id),notes=reason(p.reason),current=await permitted(context,{policyRequired:false});
 if(integer(current?.version??0)!==reviewed)conflict('VERSION_CONFLICT','The period-review policy changed. Refresh before saving.');
 const version=await tx.bumpEntityVersion(actor.businessId,'accountingPeriodPolicy',p.id,reviewed);
 const {rows}=await tx.client.query(`INSERT INTO business_accounting_period_policy(business_id,enabled,version,updated_by,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(business_id) DO UPDATE SET enabled=EXCLUDED.enabled,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING ${policyColumns}`,[actor.businessId,p.enabled,version,actor.staffId,at]);
 const value=projectPolicy(rows[0]),event=await addEvent(context,{eventType:'POLICY_CHANGED',before:current?projectPolicy(current).data:{enabled:false},after:value.data,notes});
 return {value,records:[value,event]};
};

const reviewPeriod=purpose=>async context=>{
 const {tx,actor,command,at}=context,p=command.payload;
 if(!uuid(p.id)||!date(p.from)||!date(p.to)||p.from>p.to||(Date.parse(p.to)-Date.parse(p.from))/86400000>366)fail('Choose a period identity and valid range of at most 367 calendar days.');
 const reviewed=expected(command,'accountingPeriods',p.id),notes=reason(p.reason);await permitted(context);
 const {rows}=await tx.client.query(`SELECT ${periodColumns} FROM business_accounting_periods WHERE business_id=$1 AND id=$2`,[actor.businessId,p.id]),current=rows[0]??null;
 if(integer(current?.version??0)!==reviewed)conflict('VERSION_CONFLICT','The period changed. Review its latest status before submitting.');
 if(current?.status==='CLOSED')conflict('ACCOUNTING_PERIOD_CLOSED','This period is closed. Use authorised reasoned reopening before making a new review.');
 if(current&&(current.from!==p.from||current.to!==p.to))fail('An existing accounting period keeps its original calendar dates.');
 const overlap=await tx.client.query('SELECT 1 FROM business_accounting_periods WHERE business_id=$1 AND id<>$2 AND from_date<=$4::date AND to_date>=$3::date LIMIT 1',[actor.businessId,p.id,p.from,p.to]);
 if(overlap.rows.length)conflict('ACCOUNTING_PERIOD_OVERLAP','These dates overlap an existing accounting period. Select that period or choose a separate range.');
 const statement=await profitAndLossOnConnection(tx.client,actor.businessId,p.from,p.to,current?{timeZone:current.timeZone}:undefined),period={id:p.id,from:p.from,to:p.to,timeZone:current?.timeZone??statement.timeZone};
 const checks=await assessment(tx.client,actor.businessId,period,statement,command.commandId),version=await tx.bumpEntityVersion(actor.businessId,'accountingPeriods',p.id,reviewed);
 const status=purpose==='CLOSE_REQUEST'?'REVIEW_REQUIRED':current?.status??'OPEN';
 if(!current)await tx.client.query(`INSERT INTO business_accounting_periods(business_id,id,from_date,to_date,time_zone,status,version,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,[actor.businessId,p.id,p.from,p.to,period.timeZone,status,version,actor.staffId,at]);
 const reviewId=randomUUID(),snapshot={snapshotVersion:1,period:{...period,version,status},statement,assessment:checks},snapshotHash=createHash('sha256').update(stable(snapshot)).digest('hex'),recordedByName=await staffName(tx.client,actor);
 // Hash covers the statement and its assessment, not a later mutable projection.
 const review={id:reviewId,periodId:p.id,periodVersion:version,purpose,reason:notes,assessment:checks,statementSnapshot:snapshot,snapshotHash,sourceCommandId:command.commandId,recordedBy:actor.staffId,recordedByName,recordedAt:at};
 await tx.client.query(`INSERT INTO business_accounting_period_reviews(business_id,id,period_id,period_version,purpose,reason,assessment,statement_snapshot,snapshot_hash,source_command_id,recorded_by,recorded_by_name,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13)`,[actor.businessId,reviewId,p.id,version,purpose,notes,JSON.stringify(checks),JSON.stringify(snapshot),snapshotHash,command.commandId,actor.staffId,recordedByName,at]);
 const updated=await tx.client.query(`UPDATE business_accounting_periods SET status=$3,version=$4,current_review_id=$5,updated_at=$6 WHERE business_id=$1 AND id=$2 RETURNING ${periodColumns}`,[actor.businessId,p.id,status,version,reviewId,at]),value=projectPeriod(updated.rows[0]);
 const event=await addEvent(context,{periodId:p.id,eventType:purpose==='CLOSE_REQUEST'?'CLOSE_REQUIRES_REVIEW':'REVIEWED',before:current?projectPeriod(current).data:{},after:value.data,notes});
 return {value:{period:value,review:projectReview(review),status,message:purpose==='CLOSE_REQUEST'?'Close request recorded. The period remains open to postings and requires review; no authoritative ledger close occurred.':'Review snapshot recorded. No ledger close or financial adjustment occurred.'},records:[value,projectReview(review),event]};
};

const reopenPeriod=async context=>{
 const {tx,actor,command,at}=context,p=command.payload;if(!uuid(p.id))fail('Choose the closed accounting period.');
 const reviewed=expected(command,'accountingPeriods',p.id),notes=reason(p.reason);
 // Disabling new review creation must retain reasoned recovery of existing close
 // protection. Authorisation/cohort still apply, with no rewriting of snapshots.
 await permitted(context,{policyRequired:false});
 const {rows}=await tx.client.query(`SELECT ${periodColumns} FROM business_accounting_periods WHERE business_id=$1 AND id=$2`,[actor.businessId,p.id]),current=rows[0];
 if(!current||current.status!=='CLOSED')conflict('ACCOUNTING_PERIOD_NOT_CLOSED','Only a currently closed period can be reopened. Refresh its status.');
 if(integer(current.version)!==reviewed)conflict('VERSION_CONFLICT','This period changed. Review its current closed snapshot before reopening.');
 const version=await tx.bumpEntityVersion(actor.businessId,'accountingPeriods',p.id,reviewed);
 const updated=await tx.client.query(`UPDATE business_accounting_periods SET status='OPEN',version=$3,closed_by=NULL,closed_at=NULL,updated_at=$4 WHERE business_id=$1 AND id=$2 RETURNING ${periodColumns}`,[actor.businessId,p.id,version,at]),value=projectPeriod(updated.rows[0]);
 const event=await addEvent(context,{periodId:p.id,eventType:'REOPENED',before:projectPeriod(current).data,after:value.data,notes});
 return {value,records:[value,event]};
};

export const accountingPeriodCommandRegistry=new Map([
 ['accountingPeriod.policy.save',{permission:'accounting.manage',offlinePolicy:'ONLINE_ONLY',handler:savePolicy}],
 ['accountingPeriod.review',{permission:'accounting.manage',offlinePolicy:'ONLINE_ONLY',handler:reviewPeriod('REVIEW')}],
 ['accountingPeriod.close',{permission:'accounting.manage',offlinePolicy:'ONLINE_ONLY',handler:reviewPeriod('CLOSE_REQUEST')}],
 ['accountingPeriod.reopen',{permission:'accounting.manage',offlinePolicy:'ONLINE_ONLY',handler:reopenPeriod}],
]);
