//! Immutable issued purchase order; does not assert transmission or stock receipt.
use crate::{actions::{BridgeAction,PrinterRole,ValidatedAction},rendering::PreparedDocument};
use chrono::{DateTime,FixedOffset};
use serde_json::Value;
use uuid::Uuid;
pub(crate) fn text(value:&Value,key:&str,required:bool)->Result<String,String>{match value.get(key){None|Some(Value::Null) if !required=>Ok(String::new()),Some(Value::String(raw)) if raw.len()<=2000&&!raw.chars().any(|c|c.is_control())&&(!required||!raw.trim().is_empty())=>Ok(raw.clone()),_=>Err(format!("Invalid purchase document {key}"))}}
pub(crate) fn identity(value:&Value,key:&str)->Result<String,String>{let raw=text(value,key,true)?;if Uuid::parse_str(&raw).map(|id|id.to_string()!=raw).unwrap_or(true){return Err("Invalid purchase document identity".into());}Ok(raw)}
pub(crate) fn amount(value:&Value,key:&str)->Result<i64,String>{value.get(key).and_then(Value::as_i64).filter(|n|(0..=9007199254740991).contains(n)).ok_or_else(||format!("Invalid purchase amount {key}"))}
pub(crate) fn money(value:i64)->String{format!("{}.{:02}",value/100,value%100)}
fn quantity(value:&Value,key:&str)->Result<(i128,String),String>{let number=value.get(key).and_then(Value::as_f64).filter(|n|n.is_finite()&&*n>0.0&&*n<=1e9).ok_or("Invalid purchase quantity")?;let scaled=number*1e6;if (scaled-scaled.round()).abs()>0.0001{return Err("Unsupported purchase quantity precision".into());}let formatted=format!("{number:.6}");Ok((scaled.round() as i128,formatted.trim_end_matches('0').trim_end_matches('.').to_string()))}
pub(crate) fn time(value:&Value,key:&str)->Result<String,String>{let issued=text(value,key,true)?;let time=DateTime::parse_from_rfc3339(&issued).map_err(|_|"Invalid purchase document timestamp")?;Ok(time.with_timezone(&FixedOffset::east_opt(10800).ok_or("Invalid local time zone")?).format("%Y-%m-%d %H:%M:%S EAT").to_string())}
pub fn prepare_purchase_order(input:&ValidatedAction)->Result<PreparedDocument,String>{
 let document=match input.action(){BridgeAction::Submit{document,printer_role:PrinterRole::Office,..} if document.document_type=="PURCHASE_ORDER"=>document,_=>return Err("Purchase order requires office printer role".into())};
 let snapshot:Value=serde_json::from_str(&document.canonical_snapshot).map_err(|_|"Invalid immutable purchase snapshot")?;
 if snapshot["schemaVersion"]!=1||text(&snapshot,"currency",true)?!="KES"||text(&snapshot,"documentNumber",true)?!=document.document_number{return Err("Unsupported purchase snapshot identity/schema/currency".into());}
 let business=&snapshot["business"];let supplier=&snapshot["supplier"];
 let mut lines=vec![text(business,"businessName",true)?];lines.extend(crate::document_text::multiline(business,"address",2000)?);
 for key in ["contact","taxPin"]{let raw=text(business,key,false)?;if !raw.is_empty(){lines.push(raw);}}
 lines.push("PURCHASE ORDER".into());lines.push(document.document_number.clone());lines.push(format!("Issued: {}",time(&snapshot,"issuedAt")?));
 lines.push(format!("PO ID: {}",identity(&snapshot,"purchaseOrderId")?));lines.push(format!("Supplier: {}",text(supplier,"name",true)?));lines.push(format!("Supplier code: {}",text(supplier,"code",true)?));identity(supplier,"id")?;
 lines.extend(crate::document_text::multiline(supplier,"address",2000)?);
 for (key,label) in [("contactName","Contact"),("phone","Phone"),("email","Email"),("taxPin","Tax PIN")]{let raw=text(supplier,key,false)?;if !raw.is_empty(){lines.push(format!("{label}: {raw}"));}}
 let terms=supplier.get("paymentTermsDays").and_then(Value::as_u64).filter(|n|*n<=365).ok_or("Invalid issued supplier terms")?;lines.push(format!("Payment terms: {terms} days"));
 let delivery=text(&snapshot,"expectedDeliveryDate",false)?;if !delivery.is_empty(){chrono::NaiveDate::parse_from_str(&delivery,"%Y-%m-%d").map_err(|_|"Invalid expected delivery date")?;lines.push(format!("Expected delivery: {delivery}"));}
 let items=snapshot.get("items").and_then(Value::as_array).ok_or("Missing issued purchase lines")?;
 if items.is_empty()||items.len()>100{return Err("Issued purchase line count exceeds bounds".into());}
 let mut ids=std::collections::HashSet::new();let mut stock_ids=std::collections::HashSet::new();let mut total=0i128;
 for (index,item) in items.iter().enumerate(){
  if !ids.insert(identity(item,"id")?)||!stock_ids.insert(identity(item,"stockItemId")?){return Err("Repeated issued purchase identity".into());}
  let stock=&item["stockSnapshot"];let stock_id=identity(stock,"id")?;if stock_id!=text(item,"stockItemId",true)?{return Err("Issued stock identity mismatch".into());}
  let (ordered,ordered_text)=quantity(item,"quantityOrdered")?;let (base,base_text)=quantity(item,"baseQuantityOrdered")?;
  let pack=item.get("purchasePackageSnapshot").filter(|value|!value.is_null());
  let unit=if let Some(pack)=pack{identity(pack,"id")?;let (per_package,_)=quantity(pack,"baseQuantity")?;if ordered%1000000!=0||ordered*per_package/1000000!=base{return Err("Issued package/base quantities do not reconcile".into());}text(pack,"name",true)?}else{if ordered!=base{return Err("Issued base quantity does not reconcile".into());}text(stock,"baseUnit",true)?};
  let price=amount(item,"unitPriceMinor")?;let line_total=amount(item,"lineTotalMinor")?;
  if (ordered*i128::from(price)+500000)/1000000!=i128::from(line_total){return Err("Issued purchase cost does not reconcile".into());}total+=i128::from(line_total);
  lines.push("--------------------------------".into());lines.push(format!("{}. {}",index+1,text(stock,"name",true)?));lines.push(format!("{ordered_text} {unit} x {} = {}",money(price),money(line_total)));lines.push(format!("Base quantity: {base_text} {}",text(stock,"baseUnit",true)?));
 }
 let subtotal=amount(&snapshot,"subtotalMinor")?;if total!=i128::from(subtotal){return Err("Issued purchase total does not reconcile".into());}lines.push(format!("PO TOTAL (KES): {}",money(subtotal)));
 lines.extend(crate::document_text::multiline(&snapshot,"notes",2000)?);
 lines.push(format!("Approved by: {}",identity(&snapshot,"approvedBy")?));lines.push(time(&snapshot,"approvedAt")?);lines.push(format!("Issued by: {}",identity(&snapshot,"issuedBy")?));
 lines.push("Issue does not confirm supplier transmission or receipt of goods.".into());
 let footer_start=lines.len();lines.extend(crate::document_text::multiline(business,"footer",2000)?);
 let logo=match business.get("logoPngDataUrl"){None|Some(Value::Null)=>None,Some(Value::String(raw)) if raw.is_empty()=>None,Some(Value::String(raw))=>Some(raw.clone()),_=>return Err("Invalid purchase logo snapshot".into())};
 Ok(PreparedDocument{lines,logo,qr:None,footer_start:Some(footer_start)})
}
