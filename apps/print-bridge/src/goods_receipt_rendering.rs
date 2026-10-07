//! Immutable receiving evidence. Never asserts a supplier invoice or payment.
use crate::{actions::{BridgeAction,PrinterRole,ValidatedAction},rendering::PreparedDocument,purchase_order_rendering::{text,identity,amount,money,time}};
use serde_json::Value;
fn quantity(value:&Value,key:&str)->Result<(i128,String),String>{
 let n=value.get(key).and_then(Value::as_f64).filter(|n|n.is_finite()&&*n>=0.0&&*n<=1e9).ok_or("Invalid GRN quantity")?;
 let scaled=n*1e6;if (scaled-scaled.round()).abs()>0.0001{return Err("Invalid GRN quantity precision".into());}
 let raw=format!("{n:.6}");Ok((scaled.round() as i128,raw.trim_end_matches('0').trim_end_matches('.').to_string()))
}
pub fn prepare_goods_receipt(input:&ValidatedAction)->Result<PreparedDocument,String>{
 let doc=match input.action(){BridgeAction::Submit{document,printer_role:PrinterRole::Office,..} if document.document_type=="GOODS_RECEIPT"=>document,_=>return Err("Goods receipt requires office printer role".into())};
 let s:Value=serde_json::from_str(&doc.canonical_snapshot).map_err(|_|"Invalid GRN snapshot")?;
 if s["schemaVersion"]!=1||text(&s,"currency",true)?!="KES"||doc.document_number!=format!("GRN-{}",identity(&s,"goodsReceiptId")?){return Err("Invalid GRN identity/schema/currency".into());}
 let business=&s["business"];let supplier=&s["supplier"];
 let mut lines=vec![text(business,"businessName",true)?];lines.extend(crate::document_text::multiline(business,"address",2000)?);
 for key in ["contact","taxPin"]{let raw=text(business,key,false)?;if !raw.is_empty(){lines.push(raw);}}
 lines.push("GOODS RECEIVED NOTE".into());lines.push(doc.document_number.clone());lines.push(format!("Received: {}",time(&s,"issuedAt")?));
 identity(&s,"purchaseOrderId")?;identity(supplier,"id")?;
 lines.push(format!("PO: {}",text(&s,"purchaseOrderNumber",true)?));lines.push(format!("Supplier: {}",text(supplier,"name",true)?));lines.push(format!("Delivery reference: {}",text(&s,"deliveryReference",true)?));lines.push(format!("Location: {}",identity(&s,"locationId")?));
 let items=s.get("items").and_then(Value::as_array).filter(|items|!items.is_empty()&&items.len()<=100).ok_or("Invalid GRN lines")?;
 let mut ids=std::collections::HashSet::new();let mut po_lines=std::collections::HashSet::new();let mut total=0i128;
 for (index,item) in items.iter().enumerate(){
  if !ids.insert(identity(item,"id")?)||!po_lines.insert(identity(item,"purchaseOrderLineId")?){return Err("Duplicate GRN line identity".into());}
  let stock=&item["stockSnapshot"];if identity(stock,"id")?!=identity(item,"stockItemId")?{return Err("GRN stock identity mismatch".into());}
  let (delivered,d)=quantity(item,"quantityDelivered")?;let (accepted,a)=quantity(item,"quantityAccepted")?;let (rejected,r)=quantity(item,"quantityRejected")?;let (base,b)=quantity(item,"baseQuantityAccepted")?;
  if delivered==0||accepted+rejected!=delivered{return Err("GRN delivered/accepted/rejected quantities do not reconcile".into());}
  let pack=item.get("purchasePackageSnapshot").filter(|v|!v.is_null());
  let unit=if let Some(pack)=pack{identity(pack,"id")?;let (per,_)=quantity(pack,"baseQuantity")?;if per==0||[delivered,accepted,rejected].iter().any(|q|q%1000000!=0)||accepted*per%1000000!=0||accepted*per/1000000!=base{return Err("GRN package quantities do not reconcile".into());}text(pack,"name",true)?}else{if base!=accepted{return Err("GRN base quantity mismatch".into());}text(stock,"baseUnit",true)?};
  let value=amount(item,"acceptedTotalMinor")?;amount(item,"unitPriceMinor")?;
  // Partial deliveries use cumulative rounding deltas; do not independently re-round each GRN line.
  if accepted==0{if base!=0||value!=0||!item["inventoryReceiptId"].is_null(){return Err("Rejected-only GRN line contains stock posting".into());}}else{identity(item,"inventoryReceiptId")?;if base==0{return Err("Accepted GRN line has no base stock".into());}}
  total+=i128::from(value);lines.push("--------------------------------".into());lines.push(format!("{}. {}",index+1,text(stock,"name",true)?));lines.push(format!("Unit: {unit}"));lines.push(format!("Delivered {d} / accepted {a} / rejected {r}"));lines.push(format!("Accepted base: {b} {}",text(stock,"baseUnit",true)?));lines.push(format!("Accepted value: {}",money(value)));
  if rejected>0{lines.push(format!("Rejection: {}",text(item,"rejectionReason",true)?));}
 }
 let accepted_total=amount(&s,"acceptedTotalMinor")?;if total!=i128::from(accepted_total){return Err("GRN accepted total does not reconcile".into());}
 lines.push(format!("ACCEPTED TOTAL (KES): {}",money(accepted_total)));lines.push(format!("Reason: {}",text(&s,"reason",true)?));lines.push(format!("Received by: {}",identity(&s,"receivedBy")?));identity(&s,"deviceId")?;
 match s.get("overReceiveAcknowledged"){Some(Value::Bool(true))=>lines.push("Over-receiving explicitly reviewed.".into()),Some(Value::Bool(false))=>{},_=>return Err("Missing GRN review flag".into())}
 lines.push("Goods receiving evidence only. Not a supplier invoice or payment confirmation.".into());
 let footer_start=lines.len();lines.extend(crate::document_text::multiline(business,"footer",2000)?);
 let logo=match business.get("logoPngDataUrl"){None|Some(Value::Null)=>None,Some(Value::String(raw)) if raw.is_empty()=>None,Some(Value::String(raw))=>Some(raw.clone()),_=>return Err("Invalid GRN logo".into())};
 Ok(PreparedDocument{lines,logo,qr:None,footer_start:Some(footer_start)})
}
