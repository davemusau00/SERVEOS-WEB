//! Authenticated application boundary; hosting/pairing persistence remains separate.
use crate::{actions::{BridgeAction,ValidatedAction},api_claim::ApiAuthority,
 api_client::ClaimCheckClient,auth::{PairedDevice,SignedRequest,VerifiedRequest},
 delivery::deliver,journal::RequestDecision,routing::ConfiguredPrinters,BridgeSession};
use serde_json::{json,Value};
use std::time::{SystemTime,UNIX_EPOCH};
fn now()->Result<i64,String>{
 i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_|"Invalid system clock")?.as_secs()).map_err(|_|"Unsupported system clock".into())
}
fn recovery(session:&BridgeSession,request:&VerifiedRequest,original:&str)->Result<Value,String>{
 let saved=session.journal().request_status(request,original)?;
 match saved{
  None=>Ok(json!({"state":"NOT_FOUND"})),
  Some(RequestDecision::Existing{response:Some(response)})=>{
   let original_response:Value=serde_json::from_str(&response).map_err(|_|"Stored bridge response is invalid")?;
   Ok(json!({"state":"COMPLETED","response":original_response}))
  },
  Some(RequestDecision::Existing{response:None})=>{
   let attempt=session.journal().request_attempt_status(request,original)?;
   Ok(json!({"state":"RECONCILIATION_REQUIRED","attempt":attempt,"mayReplay":false}))
  },
  Some(RequestDecision::Accepted)=>Err("Invalid stored request decision".into()),
 }
}
/// Returns exact durably stored JSON for completed replays. Pending requests never execute again.
/// Host must bound HTTP body, select pairing from trusted local state and enforce HTTPS/origin.
pub fn dispatch(session:&mut BridgeSession,pairing:&PairedDevice,origin:&str,signed:SignedRequest,
 authority:&ApiAuthority,client:&ClaimCheckClient,printers:&ConfiguredPrinters)->Result<String,String>{
 let request=pairing.verify(origin,signed,now()?)?;
 let action=ValidatedAction::parse(&request)?;
 match session.journal_mut().begin_request(&request)?{
  RequestDecision::Existing{response:Some(response)}=>return Ok(response),
  RequestDecision::Existing{response:None}=>return serde_json::to_string(&recovery(session,&request,request.request_id())?).map_err(|_|"Cannot serialize recovery".into()),
  RequestDecision::Accepted=>{},
 }
 let outcome:Result<Value,String>=match action.action(){
  BridgeAction::Submit{..}=>submit(session,&request,action,authority,client,printers),
  BridgeAction::RequestStatus{original_request_id}=>recovery(session,&request,original_request_id),
  BridgeAction::Status{job_id}=>session.journal().scoped_job_status(&request,job_id).map(|delivery|json!({"state":"STATUS","delivery":delivery})),
  BridgeAction::Retry{..}|BridgeAction::Cancel{..}=>Ok(json!({"state":"REFUSED","code":"API_REVIEW_REQUIRED","message":"Review retry or cancellation through the API; local evidence does not grant print authority"})),
 };
 let response=match outcome{
  Ok(value)=>value,
  // Do not expose API tokens, document content, OS destinations or database details.
  Err(_)=>json!({"state":"RECONCILIATION_REQUIRED","code":"SUBMISSION_NOT_CONFIRMED","attempt":session.journal().request_attempt_status(&request,request.request_id())?,"mayReplay":false}),
 };
 let serialized=serde_json::to_string(&response).map_err(|_|"Cannot serialize bridge response")?;
 session.journal_mut().complete_request(&request,&serialized)?;
 Ok(serialized)
}
fn submit(session:&mut BridgeSession,request:&VerifiedRequest,action:ValidatedAction,
 authority:&ApiAuthority,client:&ClaimCheckClient,printers:&ConfiguredPrinters)->Result<Value,String>{
 let authorized=authority.authorize(request,action,now()?)?;
 let fresh=client.check(authority,authorized)?;
 let delivery=deliver(session,printers,request,fresh)?;
 Ok(json!({"state":"RECORDED","delivery":delivery}))
}
