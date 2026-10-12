/** One concrete async-job domain: immutable *diagnostic* accounting coverage. */
import {createHash} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {completionReport,validateReportInput} from './completion-reports.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Exact canonical key ordering for reproducible diagnostic digests.
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')}}`;
export const coverageDigest=value=>createHash('sha256').update(stable(value)).digest('hex');
export async function enqueueCoverageSnapshot(pool,actor,input){
 if(!actor.permissions?.includes('*')&&!actor.permissions?.includes('accounting.view'))throw new ApiProblem(403,'PERMISSION_DENIED','Accounting access is required.');
 const requestId=String(input?.requestId||'');if(!UUID.test(requestId))throw new ApiProblem(400,'VALIDATION_FAILED','Submit a UUID requestId and reuse it after an uncertain response.');
 const params=validateReportInput({kind:'accounting-coverage',from:input.from,to:input.to,timeZone:input.timeZone});
 const payload={businessId:actor.businessId,requesterStaffId:actor.staffId,from:params.from,to:params.to,timeZone:params.timeZone};
 const client=await pool.connect();try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT business_id,job_type,payload,state FROM async_jobs WHERE id=$1 FOR UPDATE',[requestId]);
  if(existing.rows.length){const job=existing.rows[0];if(job.business_id!==actor.businessId||job.job_type!=='ACCOUNTING_COVERAGE_SNAPSHOT'||stable(job.payload)!==stable(payload))throw new ApiProblem(409,'JOB_ID_CONFLICT','The request ID belongs to different evidence. Recover the original request rather than reusing it.');
   await client.query('COMMIT');return {requestId,status:job.state,existing:true};}
  const inserted=await client.query(`INSERT INTO async_jobs(id,business_id,job_type,payload,max_attempts)
   VALUES($1,$2,'ACCOUNTING_COVERAGE_SNAPSHOT',$3::jsonb,5)
   ON CONFLICT(id) DO NOTHING RETURNING id`,[requestId,actor.businessId,JSON.stringify(payload)]);
  if(!inserted.rows.length){
   const concurrent=await client.query('SELECT business_id,job_type,payload,state FROM async_jobs WHERE id=$1',[requestId]);
   const job=concurrent.rows[0];
   if(!job||job.business_id!==actor.businessId||job.job_type!=='ACCOUNTING_COVERAGE_SNAPSHOT'||stable(job.payload)!==stable(payload))
    throw new ApiProblem(409,'JOB_ID_CONFLICT','This ID belongs to other evidence. Recover its original result.');
   await client.query('COMMIT');return {requestId,status:job.state,existing:true};
  }
  await client.query('COMMIT');return {requestId,status:'PENDING',existing:false};
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function coverageSnapshotState(pool,actor,requestId){
 if(!UUID.test(requestId))throw new ApiProblem(400,'VALIDATION_FAILED','Invalid request ID.');
 if(!actor.permissions?.includes('*')&&!actor.permissions?.includes('accounting.view'))throw new ApiProblem(403,'PERMISSION_DENIED','Accounting access is required.');
 const {rows}=await pool.query(`SELECT j.id,j.state,j.attempts,j.last_error_code,s.snapshot,s.snapshot_sha256,s.recorded_at
  FROM async_jobs j LEFT JOIN business_period_coverage_snapshots s ON s.business_id=j.business_id AND s.source_job_id=j.id
  WHERE j.business_id=$1 AND j.id=$2 AND j.job_type='ACCOUNTING_COVERAGE_SNAPSHOT'`,[actor.businessId,requestId]);
 if(!rows.length)throw new ApiProblem(404,'RESOURCE_NOT_FOUND','The requested coverage check was not found.');
 const row=rows[0];if(row.snapshot&&coverageDigest(row.snapshot)!==row.snapshot_sha256.trim())throw new ApiProblem(409,'SNAPSHOT_HASH_MISMATCH','Stored coverage evidence failed integrity verification.');
 return {requestId,status:row.state,attempts:row.attempts,errorCode:row.last_error_code||null,snapshot:row.snapshot||null,sha256:row.snapshot_sha256||null,recordedAt:row.recorded_at||null};
}
export function coverageSnapshotHandler(pool){return async(payload,{jobId})=>{
 if(!UUID.test(jobId)||!UUID.test(payload?.businessId))throw new Error('Invalid accounting coverage job scope.');
 const input=validateReportInput({kind:'accounting-coverage',from:payload.from,to:payload.to,timeZone:payload.timeZone});
 const report=await completionReport(pool,{businessId:payload.businessId,permissions:['*']},input);
 // Diagnostic snapshot is intentionally NOT a complete profit report or a period close.
 const snapshot={...report,sourceJobId:jobId,requesterStaffId:payload.requesterStaffId};
 const hash=coverageDigest(snapshot);
 const client=await pool.connect();try{await client.query('BEGIN');
  const {rows}=await client.query(`INSERT INTO business_period_coverage_snapshots
   (business_id,id,source_job_id,from_date,to_date,time_zone,snapshot,snapshot_sha256)
   VALUES($1,$2,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT (business_id,source_job_id) DO NOTHING RETURNING id`,
   [payload.businessId,jobId,input.from,input.to,input.timeZone,JSON.stringify(snapshot),hash]);
  if(!rows.length){const existing=await client.query('SELECT snapshot FROM business_period_coverage_snapshots WHERE business_id=$1 AND source_job_id=$2',[payload.businessId,jobId]);
    // Retries after a committed write must not re-author a timestamped snapshot.
    if(!existing.rows.length)throw new Error('Prior diagnostic snapshot is unavailable.');}
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
};}
