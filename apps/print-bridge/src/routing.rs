use crate::actions::PrinterRole;
use serde::Deserialize;
use serde_json::json;
use servos_printer_transport::PrinterProfile;
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(tag="transport",rename_all="SCREAMING_SNAKE_CASE",deny_unknown_fields)]
enum Destination {
 Tcp {host:String,#[serde(default="tcp_port")]port:u16},
 WindowsRaw {queue:String},
}
fn tcp_port()->u16{9100}
fn columns()->usize{48}
fn logo_width()->usize{576}
fn qr_width()->usize{320}
fn feed_lines()->usize{5}
fn yes()->bool{true}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct LocalRoute {
 destination:Destination,
 #[serde(default="columns")]columns:usize,
 #[serde(default="logo_width")]max_logo_width_dots:usize,
 #[serde(default="qr_width")]max_qr_width_dots:usize,
 #[serde(default="feed_lines")]feed_lines_before_cut:usize,
 #[serde(default="yes")]auto_cut:bool,
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct LocalConfig {schema_version:u32,roles:HashMap<PrinterRole,LocalRoute>}
/// Built only from approved installer-owned local configuration, never from a print request.
pub struct ConfiguredPrinters {profiles:HashMap<PrinterRole,PrinterProfile>}
impl ConfiguredPrinters {
 pub fn from_local_json(text:&str)->Result<Self,String>{
  if text.is_empty()||text.len()>32*1024{return Err("Printer configuration exceeds supported bounds".into());}
  let config:LocalConfig=serde_json::from_str(text).map_err(|e|format!("Invalid local printer configuration: {e}"))?;
  if config.schema_version!=1||config.roles.is_empty(){return Err("Configure at least one printer role using schema version 1".into());}
  let mut profiles=HashMap::new();
  for (role,route) in config.roles{
   let (mode,host,port,queue)=match route.destination{
    Destination::Tcp{host,port}=>{
     if host.len()>100{return Err("Printer host exceeds supported bounds".into());}
     ("XP80T_LAN_ESC_POS",host,port,String::new())
    },
    Destination::WindowsRaw{queue}=>{
     if !cfg!(windows){return Err("Windows RAW routing requires a Windows bridge".into());}
     if queue.trim().is_empty()||queue.len()>240{return Err("Windows queue name is empty or too long".into());}
     ("XP80T_USB_ESC_POS",String::new(),9100,queue)
    },
   };
   let policy=json!({"receiptPrinterMode":mode,"receiptPrinterHost":host,"receiptPrinterPort":port,"receiptPrinterQueue":queue,"receiptPaperColumns":route.columns,"receiptMaxLogoWidthDots":route.max_logo_width_dots,"receiptMaxQrWidthDots":route.max_qr_width_dots,"receiptFeedLines":route.feed_lines_before_cut,"receiptAutoCut":route.auto_cut});
   // Retain native local-network, local-queue, image-width and feed/cut validation.
   let profile=PrinterProfile::from_policy(&policy)?;
   profiles.insert(role,profile);
  }
  Ok(Self{profiles})
 }
 pub fn profile(&self,role:PrinterRole)->Result<&PrinterProfile,String>{self.profiles.get(&role).ok_or_else(||format!("Printer role {role:?} has no approved local route; use browser fallback"))}
}
