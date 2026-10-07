import {randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';
import {visibleRecord} from './projection-access.mjs';

export const printColumns=`id,document_id AS "documentId",printer_role AS "printerRole",state,copies,requested_by AS "requestedBy",requested_at AS "requestedAt",version,attempt,claimed_by AS "claimedBy",claimed_device_id AS "claimedDeviceId",claimed_at AS "claimedAt",updated_at AS "updatedAt"`;
export const printProjection=({id,version,...row})=>({collection:'printJobs',id,version:Number(version),archived:false,data:{...row,requestedAt:row.requestedAt.toISOString(),claimedAt:row.claimedAt?.toISOString()??null,updatedAt:row.updatedAt.toISOString()}});
export async function queueDocumentPrint(tx,{businessId,documentId,printerRole,staffId,at}){
 const id=randomUUID();await tx.bumpEntityVersion(businessId,'printJobs',id,0);
 const {rows}=await tx.client.query(`INSERT INTO document_print_jobs(business_id,id,document_id,printer_role,requested_by,requested_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING ${printColumns}`,[businessId,id,documentId,printerRole,staffId,at]);return printProjection(rows[0]);
}
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
export async function cancelUnsentOrderTickets(tx,{actor,command,at,orderId,reason}){
 const found=await tx.client.query(`SELECT j.id FROM document_print_jobs j JOIN business_documents d ON d.business_id=j.business_id AND d.id=j.document_id WHERE j.business_id=$1 AND d.document_type IN ('KOT','BOT') AND d.snapshot->>'orderId'=$2 ORDER BY j.id`,[actor.businessId,orderId]);
 const records=[],unresolvedTicketIds=[];
 for(const {id} of found.rows){
  // Match the kernel's lock order: entity advisory lock before the job row.
  await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`entity:${actor.businessId}:printJobs:${id}`]);
  const current=await tx.client.query(`SELECT ${printColumns} FROM document_print_jobs WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,id]);
  const job=current.rows[0];if(!job)continue;
  if(['SENDING','SENT_TO_SPOOLER','DELIVERY_UNCERTAIN'].includes(job.state)){unresolvedTicketIds.push(id);continue;}
  if(!['QUEUED','FAILED'].includes(job.state))continue;
  const version=await tx.bumpEntityVersion(actor.businessId,'printJobs',id,Number(job.version));
  const updated=await tx.client.query(`UPDATE document_print_jobs SET state='CANCELLED',version=$3,updated_at=$4 WHERE business_id=$1 AND id=$2 RETURNING ${printColumns}`,[actor.businessId,id,version,at]);
  await tx.client.query(`INSERT INTO document_print_events(business_id,id,job_id,job_version,event_type,reason,possible_duplicate_acknowledged,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,'order.void',$5,false,$6,$7,$8,$9)`,[actor.businessId,randomUUID(),id,version,`Order void: ${reason}`,command.commandId,actor.staffId,actor.deviceId,at]);
  records.push(printProjection(updated.rows[0]));
 }
 return {records,unresolvedTicketIds};
}
const change=action=>async({tx,command,actor,at})=>{
 const p=command.payload,id=p.jobId;
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))fail('Choose a print job.');
 const baseline=command.expectedVersions[`printJobs:${id}`];if(!Number.isSafeInteger(baseline)||baseline<1)fail('Reviewed print job version is required.');
 const {rows}=await tx.client.query(`SELECT ${printColumns} FROM document_print_jobs WHERE business_id=$1 AND id=$2 FOR UPDATE`,[actor.businessId,id]);
 const job=rows[0];if(!job)throw new ApiProblem(409,'RESOURCE_CONFLICT','This print job is missing.');
 if(Number(job.version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','This print job changed. Review its current delivery state.');
 const doc=await tx.client.query('SELECT document_type AS type,snapshot FROM business_documents WHERE business_id=$1 AND id=$2',[actor.businessId,job.documentId]);
 if(!doc.rows.length||!visibleRecord(actor,{collection:'businessDocuments',data:doc.rows[0]}))throw new ApiProblem(403,'PERMISSION_DENIED','You cannot print this document type.');
 if(['claim','retry'].includes(action)&&['KOT','BOT'].includes(doc.rows[0].type)){
  const order=await tx.client.query('SELECT state FROM pos_orders WHERE business_id=$1 AND id=$2',[actor.businessId,doc.rows[0].snapshot.orderId]);
  if(!order.rows.length||order.rows[0].state==='VOIDED')throw new ApiProblem(409,'ORDER_TICKET_CANCELLED','The order is voided or missing. Use its cancellation notice; do not resend the original preparation ticket.');
 }
 let next=job.state,attempt=job.attempt,claimedBy=job.claimedBy,device=job.claimedDeviceId,claimedAt=job.claimedAt;
 const note=typeof p.reason==='string'?p.reason.trim():'';
 if(note.length>500)fail('Print action reason is too long.');
 if(action==='claim'){
  if(job.state!=='QUEUED')throw new ApiProblem(409,'PRINT_NOT_QUEUED','Only a queued job can be claimed. Resolve uncertain delivery before retrying.');
  next='SENDING';attempt++;claimedBy=actor.staffId;device=actor.deviceId;claimedAt=at;
 }else if(action==='report'){
  if(job.state!=='SENDING'||claimedBy!==actor.staffId||device!==actor.deviceId)throw new ApiProblem(409,'PRINT_CLAIM_REQUIRED','Only the claiming operator/device can report this active attempt.');
  // Browser print cannot prove delivery. FAILED is reserved for preparation failure before transport.
  if(p.outcome==='PREPARATION_FAILED'){if(p.transportStarted!==false||note.length<3)fail('Confirm that printing never started and explain the preparation failure.');next='FAILED';}
  else if(p.outcome==='DELIVERY_UNCERTAIN')next='DELIVERY_UNCERTAIN';
  else fail('Choose preparation failed or delivery uncertain.');
 }else if(action==='confirm'){
  if(!['SENDING','SENT_TO_SPOOLER','DELIVERY_UNCERTAIN'].includes(job.state)||p.operatorConfirmedPrinted!==true||note.length<3)fail('Confirm that the document physically printed and record a reason.');
  next='CONFIRMED';
 }else if(action==='retry'){
  if(!['FAILED','SENDING','SENT_TO_SPOOLER','DELIVERY_UNCERTAIN'].includes(job.state))throw new ApiProblem(409,'PRINT_NOT_RETRYABLE','This print job cannot be retried.');
  if(note.length<3||job.state!=='FAILED'&&p.possibleDuplicateAcknowledged!==true)fail('Review the printer and explicitly acknowledge a possible duplicate before resending.');
  next='QUEUED';claimedBy=null;device=null;claimedAt=null;
 }else if(action==='cancel'){
  if(!['QUEUED','FAILED'].includes(job.state)||note.length<3)fail('Only an unsent queued/failed job can be cancelled with a reason.');next='CANCELLED';
 }
 const version=await tx.bumpEntityVersion(actor.businessId,'printJobs',id,baseline);
 const updated=await tx.client.query(`UPDATE document_print_jobs SET state=$3,attempt=$4,claimed_by=$5,claimed_device_id=$6,claimed_at=$7,version=$8,updated_at=$9 WHERE business_id=$1 AND id=$2 RETURNING ${printColumns}`,[actor.businessId,id,next,attempt,claimedBy,device,claimedAt,version,at]);
 await tx.client.query(`INSERT INTO document_print_events(business_id,id,job_id,job_version,event_type,reason,possible_duplicate_acknowledged,command_id,staff_id,device_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[actor.businessId,randomUUID(),id,version,command.name,note,p.possibleDuplicateAcknowledged===true,command.commandId,actor.staffId,actor.deviceId,at]);
 const value=printProjection(updated.rows[0]);return {value,records:[value]};
};
export const printCommandRegistry=new Map(['claim','report','confirm','retry','cancel'].map(action=>[`print.${action}`,{permission:'pos.sell',permissionAny:['pos.sell','payment.record','order.refund','payment.reverse','order.void','order.discount','order.comp','kds.view','kds.update','system.configure','reports.view','accounting.view','audit.view'],offlinePolicy:'ONLINE_ONLY',handler:change(action)}]));
