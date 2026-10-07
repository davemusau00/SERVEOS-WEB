//! Office voucher for a manually confirmed supplier payment.
use crate::{actions::{BridgeAction,PrinterRole,ValidatedAction},rendering::PreparedDocument,purchase_order_rendering::{text,identity,amount,money,time}};
use serde_json::Value;
pub fn prepare_supplier_payment(input:&ValidatedAction)->Result<PreparedDocument,String>{
 let doc=match input.action(){BridgeAction::Submit{document,printer_role:PrinterRole::Office,..} if document.document_type=="SUPPLIER_PAYMENT_VOUCHER"=>document,_=>return Err("Supplier payment voucher requires office printer role".into())};
 let s:Value=serde_json::from_str(&doc.canonical_snapshot).map_err(|_|"Invalid supplier payment voucher snapshot")?;
 let payment_id=identity(&s,"supplierPaymentId")?;
 if s["schemaVersion"]!=1||text(&s,"currency",true)?!="KES"||doc.id!=payment_id||doc.document_number!=format!("SP-{payment_id}"){return Err("Invalid supplier voucher identity/schema/currency".into());}
 let business=&s["business"];let supplier=&s["supplier"];let account=&s["accountSnapshot"];
 let mut lines=vec![text(business,"businessName",true)?];lines.extend(crate::document_text::multiline(business,"address",2000)?);
 for key in ["contact","taxPin"]{let raw=text(business,key,false)?;if !raw.is_empty(){lines.push(raw);}}
 identity(supplier,"id")?;identity(&s,"supplierPayableId")?;identity(&s,"goodsReceiptId")?;identity(&s,"confirmedBy")?;identity(&s,"deviceId")?;
 lines.push("SUPPLIER PAYMENT VOUCHER".into());lines.push(doc.document_number.clone());lines.push(format!("Issued: {}",time(&s,"issuedAt")?));lines.push(format!("Supplier: {}",text(supplier,"name",true)?));
 lines.push(format!("Invoice: {}",text(&s,"invoiceNumber",true)?));let amount_paid=amount(&s,"amountMinor")?;if amount_paid==0{return Err("Supplier payment voucher must be positive".into());}
 let before=amount(&s,"paidBeforeMinor")?;let after=amount(&s,"paidAfterMinor")?;let credited=s.get("creditedMinor").map(|_|amount(&s,"creditedMinor")).transpose()?.unwrap_or(0);let liability=amount(&s,"liabilityMinor")?;let remaining=amount(&s,"outstandingAfterMinor")?;
 if before.checked_add(amount_paid)!=Some(after)||after>liability||credited>liability-after||liability-after-credited!=remaining{return Err("Supplier payment voucher balance does not reconcile".into());}
 lines.push(format!("Amount paid (KES): {}",money(amount_paid)));lines.push(format!("Previously paid: {}",money(before)));lines.push(format!("Paid to date: {}",money(after)));if credited>0{lines.push(format!("Supplier credit applied: {}",money(credited)));}lines.push(format!("Remaining payable: {}",money(remaining)));
 let method=text(account,"method",true)?;if !["CASH","BANK","MPESA"].contains(&method.as_str()){return Err("Unsupported supplier payment method".into());}
 let origin=text(&s,"origin",true)?;if (method=="CASH"&&origin!="MANUALLY_CONFIRMED_PETTY_CASH")||(method!="CASH"&&origin!="MANUALLY_CONFIRMED_EXTERNAL"){return Err("Supplier payment confirmation origin does not match tender".into());}
 lines.push(format!("Account: {} ({method})",text(account,"name",true)?));lines.push(format!("Reference: {}",text(&s,"reference",true)?));lines.push(format!("Actual paid: {}",time(&s,"paidAt")?));lines.push(format!("Reason: {}",text(&s,"reason",true)?));
 if method=="CASH"{lines.push("Manually confirmed petty cash outside the POS till.".into());}else{lines.push("External payment manually confirmed by operator; no provider verification is asserted.".into());}
 lines.push(format!("Confirmed by: {}",identity(&s,"confirmedBy")?));
 let footer_start=lines.len();lines.extend(crate::document_text::multiline(business,"footer",2000)?);
 let logo=match business.get("logoPngDataUrl"){None|Some(Value::Null)=>None,Some(Value::String(raw)) if raw.is_empty()=>None,Some(Value::String(raw))=>Some(raw.clone()),_=>return Err("Invalid supplier voucher logo".into())};
 Ok(PreparedDocument{lines,logo,qr:None,footer_start:Some(footer_start)})
}
