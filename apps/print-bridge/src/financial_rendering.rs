//! Immutable financial snapshot formatting. No live price/tax/payment calculations.
use crate::{actions::{BridgeAction,PrinterRole,ValidatedAction},rendering::PreparedDocument};
use chrono::{DateTime,FixedOffset};
use serde_json::Value;
use uuid::Uuid;
fn text(value:&Value,key:&str,required:bool)->Result<String,String>{
 match value.get(key){None|Some(Value::Null) if !required=>Ok(String::new()),Some(Value::String(raw)) if raw.chars().count()<=500&&!raw.chars().any(|c|c.is_control())&&(!required||!raw.trim().is_empty())=>Ok(raw.clone()),_=>Err(format!("Invalid financial document {key}"))}
}
fn identity(value:&Value,key:&str)->Result<String,String>{let raw=text(value,key,true)?;if Uuid::parse_str(&raw).map(|id|id.to_string()!=raw).unwrap_or(true){return Err(format!("Invalid {key} identity"));}Ok(raw)}
fn amount(value:&Value,key:&str)->Result<i64,String>{value.get(key).and_then(Value::as_i64).filter(|value|(0..=9007199254740991).contains(value)).ok_or_else(||format!("Missing or invalid issued amount {key}"))}
fn money(value:i64)->String{format!("{}.{:02}",value/100,value%100)}
fn push_text(lines:&mut Vec<String>,value:&Value,key:&str,label:&str)->Result<(),String>{let raw=text(value,key,false)?;if !raw.is_empty(){lines.push(format!("{label}{raw}"));}Ok(())}
pub fn prepare_financial_document(input:&ValidatedAction)->Result<PreparedDocument,String>{
 let (document,role)=match input.action(){BridgeAction::Submit{document,printer_role,..}=>(document,*printer_role),_=>return Err("Financial rendering requires submit".into())};
 if role!=PrinterRole::Receipt{return Err("Financial documents require the receipt printer role".into());}
 let snapshot:Value=serde_json::from_str(&document.canonical_snapshot).map_err(|_|"Invalid immutable financial snapshot")?;
 let title=match document.document_type.as_str(){"PAYMENT_ACKNOWLEDGEMENT"=>"PAYMENT ACKNOWLEDGEMENT","REFUND_RECEIPT"=>"REFUND RECEIPT",_=>return Err("Unsupported financial layout".into())};
 let business=&snapshot["business"];
 let image=|key:&str|->Result<Option<String>,String>{match business.get(key){None|Some(Value::Null)=>Ok(None),Some(Value::String(raw)) if raw.is_empty()=>Ok(None),Some(Value::String(raw)) if raw.len()<=2_800_000&&raw.starts_with("data:image/png;base64,")=>Ok(Some(raw.clone())),_=>Err("Invalid embedded PNG snapshot".into())}};
 let logo=image("logoPngDataUrl")?;let qr=image("paymentQrPngDataUrl")?;
 let mut lines=Vec::new();
 for (key,label) in [("businessName",""),("address",""),("contact",""),("taxPin","Tax PIN: ")]{push_text(&mut lines,business,key,label)?;}
 lines.push(title.into());lines.push(document.document_number.clone());
 let issued=text(&snapshot,"issuedAt",true)?;let time=DateTime::parse_from_rfc3339(&issued).map_err(|_|"Invalid issued financial timestamp")?;
 lines.push(time.with_timezone(&FixedOffset::east_opt(10800).ok_or("Invalid local time zone")?).format("%Y-%m-%d %H:%M:%S EAT").to_string());
 lines.push(format!("Order ID: {}",identity(&snapshot,"orderId")?));push_text(&mut lines,&snapshot,"orderName","Order: ")?;
 lines.push("--------------------------------".into());
 if document.document_type=="PAYMENT_ACKNOWLEDGEMENT"{
  let currency=text(&snapshot,"currency",true)?;if currency.len()!=3||!currency.bytes().all(|b|b.is_ascii_uppercase()){return Err("Invalid issued currency".into());}
  for (key,label) in [("amountReceivedMinor","Received"),("orderTotalMinor","Order total"),("amountPaidMinor","Total paid"),("balanceMinor","Balance")]{lines.push(format!("{label} ({currency}): {}",money(amount(&snapshot,key)?)));}
  let payments=snapshot.get("payments").and_then(Value::as_array).ok_or("Payment acknowledgement requires issued tender records")?;
  if payments.is_empty()||payments.len()>50{return Err("Issued tender count exceeds bounds".into());}
  let mut total=0i64;let mut ids=std::collections::HashSet::new();
  for payment in payments{
   let id=identity(payment,"id")?;if !ids.insert(id){return Err("Issued payment identity repeats".into());}
   let method=text(payment,"method",true)?;if !["CASH","MPESA","CARD","BANK"].contains(&method.as_str()){return Err("Unsupported issued payment method".into());}
   let paid=amount(payment,"amountMinor")?;total=total.checked_add(paid).ok_or("Tender total exceeds bounds")?;
   lines.push(format!("{method}: {}",money(paid)));push_text(&mut lines,payment,"reference","Reference: ")?;
   if method=="CASH"{lines.push(format!("Tendered: {}",money(amount(payment,"cashTenderedMinor")?)));lines.push(format!("Change: {}",money(amount(payment,"changeMinor")?)));}
   if text(payment,"origin",true)?=="CASHIER_CONFIRMED_EXTERNAL"{lines.push("Manually confirmed by cashier".into());}
  }
  if total!=amount(&snapshot,"amountReceivedMinor")?{return Err("Issued tender amounts do not reconcile".into());}
 }else{
  lines.push(format!("Returned: {}",money(amount(&snapshot,"amountReturnedMinor")?)));
  push_text(&mut lines,&snapshot,"method","Method: ")?;lines.push(format!("Reason: {}",text(&snapshot,"reason",true)?));
  push_text(&mut lines,&snapshot,"externalReference","Return reference: ")?;
  lines.push(format!("Original payment: {}",identity(&snapshot,"paymentId")?));identity(&snapshot,"refundId")?;
  if let Some(tax)=snapshot.get("taxReversal").filter(|value|!value.is_null()){
   for (key,label) in [("netMinor","Net reversed"),("vatMinor","VAT reversed"),("levyMinor","Levy reversed")]{lines.push(format!("{label}: {}",money(amount(tax,key)?)));}
  }
  lines.push("No automatic stock return".into());push_text(&mut lines,&snapshot,"staffId","Staff: ")?;
 }
 lines.push("--------------------------------".into());
 let footer_start=lines.len();
 let footer=text(&snapshot,"footer",false)?;if footer.is_empty(){push_text(&mut lines,business,"footer","")?;}else{lines.push(footer);}
 Ok(PreparedDocument{lines,logo,qr,footer_start:Some(footer_start)})
}
