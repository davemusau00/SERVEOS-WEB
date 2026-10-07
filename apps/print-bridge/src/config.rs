//! Trusted installer-owned configuration. No remote self-enrollment or request-supplied keys.
use crate::{api_claim::ApiAuthority,api_client::ClaimCheckClient,
 auth::{PairedDevice,PublicJwk,SignedRequest},dispatcher::dispatch,
 routing::ConfiguredPrinters,BridgeSession};
use serde::Deserialize;
use std::{collections::HashMap,io::Read,path::Path};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct ApprovedDevice {
 device_id:String,origin:String,public_key:PublicJwk,approved_at:String,
 approval_reason:String,revoked:bool,
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct LocalConfiguration {
 schema_version:u32,bridge_id:String,business_id:String,api_origin:String,
 api_key_id:String,api_public_key:PublicJwk,devices:Vec<ApprovedDevice>,printer_configuration_json:String,
}
struct DeviceEntry {pairing:PairedDevice,origin:String,revoked:bool}
pub struct ApprovedConfiguration {
 bridge_id:String,business_id:String,devices:HashMap<String,DeviceEntry>,
 authority:ApiAuthority,client:ClaimCheckClient,printers:ConfiguredPrinters,
}
fn id(value:&str)->bool{Uuid::parse_str(value).map(|id|id.to_string()==value).unwrap_or(false)}
impl ApprovedConfiguration {
 /// Directory and file ACLs must be set by installer. Browser writes are never accepted here.
 pub fn read_installer_file(path:&Path)->Result<Self,String>{
  let file=std::fs::File::open(path).map_err(|_|"Cannot read approved bridge configuration")?;
  let mut bytes=Vec::new();file.take(256*1024+1).read_to_end(&mut bytes).map_err(|_|"Cannot read approved bridge configuration")?;
  if bytes.len()>256*1024{return Err("Approved bridge configuration exceeds 256 KiB".into());}
  let text=std::str::from_utf8(&bytes).map_err(|_|"Bridge configuration must be UTF-8")?;
  Self::from_installer_json(text)
 }
 pub fn from_installer_json(text:&str)->Result<Self,String>{
  if text.len()>256*1024{return Err("Approved bridge configuration exceeds 256 KiB".into());}
  let config:LocalConfiguration=serde_json::from_str(text).map_err(|_|"Invalid approved bridge configuration fields")?;
  if config.schema_version!=1||!id(&config.bridge_id)||!id(&config.business_id)||config.devices.len()>100{return Err("Invalid bridge identity, schema or pairing count".into());}
  let authority=ApiAuthority::from_pinned_key(config.api_key_id,config.api_public_key)?;
  let client=ClaimCheckClient::from_approved_origin(&config.api_origin)?;
  let printers=ConfiguredPrinters::from_local_json(&config.printer_configuration_json)?;
  let mut devices=HashMap::new();
  for device in config.devices{
   if chrono::DateTime::parse_from_rfc3339(&device.approved_at).is_err()||!(3..=500).contains(&device.approval_reason.trim().chars().count())||device.approval_reason.chars().any(|c|c.is_control()){return Err("Every pairing requires recorded local approval time and reason".into());}
   let pairing=PairedDevice::from_approved_pairing(config.bridge_id.clone(),config.business_id.clone(),device.device_id.clone(),device.origin.clone(),device.public_key)?;
   let entry=DeviceEntry{pairing,origin:device.origin,revoked:device.revoked};
   if devices.insert(device.device_id,entry).is_some(){return Err("Duplicate approved device identity".into());}
  }
  Ok(Self{bridge_id:config.bridge_id,business_id:config.business_id,devices,authority,client,printers})
 }
 /// For CORS preflight only. Actual dispatch still verifies the device signature and scope.
 pub fn permits_origin(&self,origin:&str)->bool{self.devices.values().any(|device|!device.revoked&&device.origin==origin)}
 pub fn dispatch(&self,session:&mut BridgeSession,origin:&str,signed:SignedRequest)->Result<String,String>{
  if signed.bridge_id!=self.bridge_id||signed.business_id!=self.business_id{return Err("Request does not match this bridge/business".into());}
  let device=self.devices.get(&signed.device_id).ok_or("Device is not locally approved")?;
  if device.revoked||device.origin!=origin{return Err("Device pairing is revoked or origin is not approved".into());}
  dispatch(session,&device.pairing,origin,signed,&self.authority,&self.client,&self.printers)
 }
}
