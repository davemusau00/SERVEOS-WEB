use crate::auth::VerifiedRequest;
use rusqlite::{params,Connection,OptionalExtension,TransactionBehavior};
use sha2::{Digest,Sha256};
use std::path::Path;
use uuid::Uuid;

#[derive(Clone,Debug)]
pub struct JobStatus {
 pub job_id:String,
 pub envelope_hash:String,
 pub state:String,
 pub revision:i64,
 pub attempt:i64,
 pub detail:String,
}

/// Durable local delivery evidence. This is not permission to print.
/// A future service must authenticate and verify the immutable envelope before enqueue/send.
pub struct PrintJournal { connection:Connection }

fn error(message:impl ToString)->String{message.to_string()}
fn job_id(value:&str)->Result<(),String>{let parsed=Uuid::parse_str(value).map_err(|_|"Invalid job ID".to_string())?;if parsed.to_string()!=value{return Err("Job IDs must use canonical lowercase UUID notation".into());}Ok(())}
fn detail(value:&str)->Result<(),String>{if value.len()>2000||value.chars().any(|c|c.is_control()){Err("Delivery detail must be bounded text without control codes".into())}else{Ok(())}}
fn status(connection:&Connection,id:&str)->Result<Option<JobStatus>,String>{
 connection.query_row("SELECT job_id,envelope_hash,state,revision,attempt,detail FROM local_print_jobs WHERE job_id=?1",[id],|row|Ok(JobStatus{job_id:row.get(0)?,envelope_hash:row.get(1)?,state:row.get(2)?,revision:row.get(3)?,attempt:row.get(4)?,detail:row.get(5)?})).optional().map_err(error)
}
impl PrintJournal {
 pub(crate) fn open(path:&Path)->Result<Self,String>{
  let mut connection=Connection::open(path).map_err(error)?;
  connection.busy_timeout(std::time::Duration::from_secs(5)).map_err(error)?;
  connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;").map_err(error)?;
  let version:i64=connection.query_row("PRAGMA user_version",[],|row|row.get(0)).map_err(error)?;
  if version>2{return Err("This bridge journal needs a newer bridge release".into());}
  if version==0{
   let tx=connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
   tx.execute_batch("CREATE TABLE local_print_jobs(
    job_id TEXT PRIMARY KEY,envelope_hash TEXT NOT NULL CHECK(length(envelope_hash)=64),envelope TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('QUEUED','SENDING','SENT_TO_SPOOLER','DELIVERY_UNCERTAIN','FAILED','CANCELLED')),
    revision INTEGER NOT NULL CHECK(revision>=1),attempt INTEGER NOT NULL CHECK(attempt>=0),detail TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE local_print_events(
     job_id TEXT NOT NULL REFERENCES local_print_jobs(job_id),revision INTEGER NOT NULL,state TEXT NOT NULL,attempt INTEGER NOT NULL,detail TEXT NOT NULL,
     occurred_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(job_id,revision));
    CREATE TRIGGER local_print_identity_immutable BEFORE UPDATE OF job_id,envelope_hash,envelope ON local_print_jobs BEGIN SELECT RAISE(ABORT,'Immutable print envelope'); END;
    CREATE TRIGGER local_print_jobs_no_delete BEFORE DELETE ON local_print_jobs BEGIN SELECT RAISE(ABORT,'Retain print delivery evidence'); END;
    CREATE TRIGGER local_print_events_no_update BEFORE UPDATE ON local_print_events BEGIN SELECT RAISE(ABORT,'Immutable print event'); END;
    CREATE TRIGGER local_print_events_no_delete BEFORE DELETE ON local_print_events BEGIN SELECT RAISE(ABORT,'Immutable print event'); END;
    PRAGMA user_version=1;").map_err(error)?;
   tx.commit().map_err(error)?;
  }
  if version<2{
   let tx=connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
   tx.execute_batch("CREATE TABLE local_bridge_requests(
    request_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
    bridge_id TEXT NOT NULL,business_id TEXT NOT NULL,device_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('RECEIVED','COMPLETED')),response TEXT,
    received_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    completed_at TEXT,
    CHECK((state='RECEIVED' AND response IS NULL AND completed_at IS NULL) OR (state='COMPLETED' AND response IS NOT NULL AND completed_at IS NOT NULL)));
    CREATE TRIGGER local_requests_identity_immutable BEFORE UPDATE OF request_id,fingerprint,bridge_id,business_id,device_id ON local_bridge_requests BEGIN SELECT RAISE(ABORT,'Immutable bridge request identity'); END;
    CREATE TRIGGER local_requests_completed_immutable BEFORE UPDATE ON local_bridge_requests WHEN OLD.state='COMPLETED' BEGIN SELECT RAISE(ABORT,'Immutable completed bridge outcome'); END;
    CREATE TRIGGER local_requests_no_delete BEFORE DELETE ON local_bridge_requests BEGIN SELECT RAISE(ABORT,'Retain bridge replay evidence'); END;
    PRAGMA user_version=2;").map_err(error)?;
   tx.commit().map_err(error)?;
  }
  Ok(Self{connection})
 }
 /// Call only at exclusive service startup, after acquiring the installer/service singleton lock.
 /// Opening a second reader must never invalidate a genuinely active transport attempt.
 pub(crate) fn recover_interrupted_sends(&mut self)->Result<usize,String>{
  let tx=self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
  let changed=tx.execute("UPDATE local_print_jobs SET state='DELIVERY_UNCERTAIN',revision=revision+1,detail='Bridge restarted during transport; output may have printed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE state='SENDING'",[]).map_err(error)?;
  tx.execute("INSERT INTO local_print_events(job_id,revision,state,attempt,detail) SELECT job_id,revision,state,attempt,detail FROM local_print_jobs WHERE state='DELIVERY_UNCERTAIN' AND NOT EXISTS(SELECT 1 FROM local_print_events e WHERE e.job_id=local_print_jobs.job_id AND e.revision=local_print_jobs.revision)",[]).map_err(error)?;
  tx.commit().map_err(error)?;Ok(changed)
 }
 /// Persist the exact signed envelope. Cryptographic validation belongs before this boundary.
 pub fn enqueue(&mut self,id:&str,envelope:&str)->Result<JobStatus,String>{
  job_id(id)?;if envelope.is_empty()||envelope.len()>2*1024*1024{return Err("Print envelope is empty or exceeds 2 MiB".into());}
  let hash=format!("{:x}",Sha256::digest(envelope.as_bytes()));
  let tx=self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
  if let Some(existing)=status(&tx,id)?{
   if existing.envelope_hash!=hash{return Err("Job ID already belongs to a different immutable envelope".into());}
   tx.commit().map_err(error)?;return Ok(existing);
  }
  tx.execute("INSERT INTO local_print_jobs(job_id,envelope_hash,envelope,state,revision,attempt,detail) VALUES(?1,?2,?3,'QUEUED',1,0,'Accepted locally; not sent')",params![id,hash,envelope]).map_err(error)?;
  tx.execute("INSERT INTO local_print_events(job_id,revision,state,attempt,detail) SELECT job_id,revision,state,attempt,detail FROM local_print_jobs WHERE job_id=?1",[id]).map_err(error)?;
  let value=status(&tx,id)?.ok_or("Local print job is missing")?;tx.commit().map_err(error)?;Ok(value)
 }
 pub fn get(&self,id:&str)->Result<Option<JobStatus>,String>{job_id(id)?;status(&self.connection,id)}
 pub fn envelope(&self,id:&str)->Result<Option<String>,String>{job_id(id)?;self.connection.query_row("SELECT envelope FROM local_print_jobs WHERE job_id=?1",[id],|row|row.get(0)).optional().map_err(error)}
 /// Commit this before opening a printer transport. Never send if the commit fails.
 pub fn begin_send(&mut self,id:&str,revision:i64)->Result<JobStatus,String>{self.transition(id,revision,"SENDING","Transport attempt started",false)}
 /// Success means transport acceptance, never physical delivery.
 pub fn finish_send(&mut self,id:&str,revision:i64,state:&str,message:&str)->Result<JobStatus,String>{
  if !["SENT_TO_SPOOLER","DELIVERY_UNCERTAIN","FAILED"].contains(&state){return Err("Invalid transport outcome".into());}
  self.transition(id,revision,state,message,false)
 }
 pub fn retry(&mut self,id:&str,revision:i64,reason:&str,duplicate_acknowledged:bool)->Result<JobStatus,String>{
  if reason.trim().len()<3{return Err("Explain the retry decision".into());}self.transition(id,revision,"QUEUED",reason,duplicate_acknowledged)
 }
 pub fn cancel(&mut self,id:&str,revision:i64,reason:&str)->Result<JobStatus,String>{
  if reason.trim().len()<3{return Err("Explain the cancellation".into());}self.transition(id,revision,"CANCELLED",reason,false)
 }
 fn transition(&mut self,id:&str,revision:i64,next:&str,message:&str,duplicate_acknowledged:bool)->Result<JobStatus,String>{
  job_id(id)?;detail(message)?;
  let tx=self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
  let old=status(&tx,id)?.ok_or("Local print job is missing")?;
  if old.revision!=revision{return Err("Print job changed; review the current delivery state".into());}
  let allowed=match next{
   "SENDING"=>old.state=="QUEUED",
   "SENT_TO_SPOOLER"|"DELIVERY_UNCERTAIN"|"FAILED"=>old.state=="SENDING",
   "QUEUED"=>old.state=="FAILED"||duplicate_acknowledged&&["SENT_TO_SPOOLER","DELIVERY_UNCERTAIN"].contains(&old.state.as_str()),
   "CANCELLED"=>["QUEUED","FAILED"].contains(&old.state.as_str()),
   _=>false,
  };
  if !allowed{return Err("Print transition refused; uncertain output requires review and duplicate acknowledgement".into());}
  let revision=old.revision.checked_add(1).ok_or("Print revision limit reached")?;
  let attempt=old.attempt.checked_add(if next=="SENDING"{1}else{0}).ok_or("Print attempt limit reached")?;
  let message=if next=="QUEUED"&&duplicate_acknowledged{format!("Possible duplicate acknowledged: {message}")}else{message.to_string()};
  tx.execute("UPDATE local_print_jobs SET state=?2,revision=?3,attempt=?4,detail=?5,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE job_id=?1",params![id,next,revision,attempt,message]).map_err(error)?;
  tx.execute("INSERT INTO local_print_events(job_id,revision,state,attempt,detail) SELECT job_id,revision,state,attempt,detail FROM local_print_jobs WHERE job_id=?1",[id]).map_err(error)?;
  let value=status(&tx,id)?.ok_or("Local print job is missing")?;tx.commit().map_err(error)?;Ok(value)
 }
}

#[derive(Clone,Debug)]
pub enum RequestDecision {
 /// Only this result permits first execution. A recovered RECEIVED request must be reconciled.
 Accepted,
 Existing { response:Option<String> },
}
impl PrintJournal {
 pub fn begin_request(&mut self,request:&VerifiedRequest)->Result<RequestDecision,String>{
  let tx=self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
  let existing:Option<(String,Option<String>)>=tx.query_row("SELECT fingerprint,response FROM local_bridge_requests WHERE request_id=?1",[request.request_id()],|row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(error)?;
  if let Some((fingerprint,response))=existing{
   if fingerprint!=request.fingerprint(){return Err("Request ID already belongs to different signed content".into());}
   tx.commit().map_err(error)?;return Ok(RequestDecision::Existing{response});
  }
  tx.execute("INSERT INTO local_bridge_requests(request_id,fingerprint,bridge_id,business_id,device_id,state) VALUES(?1,?2,?3,?4,?5,'RECEIVED')",params![request.request_id(),request.fingerprint(),request.bridge_id(),request.business_id(),request.device_id()]).map_err(error)?;
  tx.commit().map_err(error)?;Ok(RequestDecision::Accepted)
 }
 pub fn complete_request(&mut self,request:&VerifiedRequest,response:&str)->Result<(),String>{
  if response.is_empty()||response.len()>256*1024{return Err("Bridge response must be bounded to 256 KiB".into());}
  let tx=self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
  let existing:Option<(String,Option<String>)>=tx.query_row("SELECT fingerprint,response FROM local_bridge_requests WHERE request_id=?1",[request.request_id()],|row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(error)?;
  let (fingerprint,old_response)=existing.ok_or("Bridge request was not durably received")?;
  if fingerprint!=request.fingerprint(){return Err("Request ID belongs to different signed content".into());}
  if let Some(old)=old_response{if old!=response{return Err("Original bridge outcome is immutable".into());}tx.commit().map_err(error)?;return Ok(());}
  tx.execute("UPDATE local_bridge_requests SET state='COMPLETED',response=?2,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE request_id=?1",params![request.request_id(),response]).map_err(error)?;
  tx.commit().map_err(error)
 }
 /// A newly signed, authorized status request can look up an older expired request ID.
 /// Pending response is explicit, never interpreted as permission to execute again.
 pub fn request_status(&self,authorization:&VerifiedRequest,original_id:&str)->Result<Option<RequestDecision>,String>{
  job_id(original_id)?;
  self.connection.query_row("SELECT response FROM local_bridge_requests WHERE request_id=?1 AND bridge_id=?2 AND business_id=?3 AND device_id=?4",params![original_id,authorization.bridge_id(),authorization.business_id(),authorization.device_id()],|row|Ok(RequestDecision::Existing{response:row.get(0)?})).optional().map_err(error)
 }
}
