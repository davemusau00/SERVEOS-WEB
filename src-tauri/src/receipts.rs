//! Immutable documents captured in the payment transaction before audit/outbox commit.
use super::*;
pub const FOOTER: [&str; 3] = ["Built By Davemusau.co.ke", "info@davemusau.co.ke", "0746157440"];

pub fn capture(tx: &Transaction, user: &Session, order_id: &str, command_id: &str, changes: &mut Vec<Value>) -> Result<()> {
    let (_, order) = get(tx,"orders",order_id)?;
    let (_, business) = get(tx,"organization","business")?;
    let (_, property) = get(tx,"property","property")?;
    let outlet = order["outletId"].as_str().and_then(|key|get(tx,"outlets",key).ok()).map(|(_,v)|v).unwrap_or(json!({}));
    let payment_ids: Vec<String> = changes.iter().filter(|c|c["collection"]=="payments").filter_map(|c|c["id"].as_str().map(str::to_owned)).collect();
    let payments: Vec<Value> = list(tx,"payments")?.into_iter().map(|r|r["data"].clone()).filter(|p|p["orderId"]==order_id).map(|p|json!({
        "id":p["id"],"tenderType":p["tenderType"],"amountMinor":p["amountMinor"],"reference":p["referenceNumber"],
        "cashTenderedMinor":p["cashTenderedMinor"],"changeMinor":p["changeMinor"],"occurredAt":p["occurredAt"],
        "currentPayment":p["id"].as_str().is_some_and(|id|payment_ids.iter().any(|key|key==id))
    })).collect();
    let credit_entries: Vec<Value> = list(tx,"customerCreditEntries")?.into_iter().map(|r|r["data"].clone()).filter(|e|e["orderId"]==order_id&&e["kind"]=="CHARGE").collect();
    let credited_minor:i64=credit_entries.iter().map(|e|e["amountMinor"].as_i64().unwrap_or(0)).sum();
    let latest_credit=credit_entries.last().cloned().unwrap_or(json!({}));
    let items: Vec<Value> = order["items"].as_array().ok_or("Invalid receipt items")?.iter().filter(|i|i["state"]!="VOIDED").map(|i|json!({
        "id":i["id"],"description":i["productName"],"quantity":i["quantity"],
        "unitPriceMinor":(i["unitPrice"].as_f64().unwrap_or(0.0)*100.0).round() as i64,
        "amountMinor":(i["lineTotal"].as_f64().unwrap_or(0.0)*100.0).round() as i64+i["discountMinor"].as_i64().unwrap_or(0),
        "portion":i["portionSnapshot"]["name"],
        "modifiers":i["modifiers"].as_array().map(|mods|mods.iter().filter_map(|m|m["name"].as_str()).collect::<Vec<_>>()).unwrap_or_default()
    })).collect();
    let device = meta(tx,"terminal_id")?.unwrap_or_else(||"LOCAL".into());
    let receipt_id = format!("receipt-{command_id}");
    let sequence=meta(tx,"receipt_sequence")?.and_then(|v|v.parse::<u64>().ok()).unwrap_or(0).checked_add(1).ok_or("Receipt sequence exhausted")?;
    set_meta(tx,"receipt_sequence",&sequence.to_string())?;
    let total=money(&order,"grandTotal")?;
    let doc=json!({
        "id":receipt_id,"schemaVersion":1,"orderId":order_id,"sourceCommandId":command_id,"deviceId":device,
        "number":format!("{}-{:06}",device,sequence),"orderNumber":order["orderNumber"],"issuedAt":now(),
        "business":{"name":business["name"],"address":property["address"],"phone":property["phone"],"email":property["email"]},
        "outlet":outlet["name"],"cashier":user.name,"table":order["tableName"],"tab":order["tabName"],
        "currency":property["currency"].as_str().unwrap_or("KES"),"timezone":property["timezone"].as_str().unwrap_or("Africa/Nairobi"),
        "items":items,"subtotalMinor":total+money(&order,"discountTotal")?,"discountMinor":money(&order,"discountTotal")?,
        "netMinor":money(&order,"subtotal")?,"taxMinor":money(&order,"taxTotal")?,"levyMinor":money(&order,"cateringLevyTotal")?,
        "totalMinor":total,"paidMinor":money(&order,"amountPaid")?,"creditedMinor":credited_minor,"balanceMinor":total-money(&order,"amountPaid")?-credited_minor,"payments":payments,
        "customerCredit":if credited_minor>0{json!({"customerId":order["customerId"],"customerName":order["customerName"],"amountMinor":credited_minor,"dueAt":latest_credit["dueAt"],"accountBalanceMinor":customer_credit::balance_minor(tx,order["customerId"].as_str().unwrap_or(""))?})}else{Value::Null},
        "message":property["receiptFooter"].as_str().unwrap_or("Thank you for your business.")
    });
    put(tx,"receiptDocuments",&receipt_id,doc,changes)
}

pub fn load(db: &Connection, token: &str, order_id: &str, receipt_id: Option<&str>) -> Result<Value> {
    let user=actor(db,token,false)?;
    if !permissions(&user.role).contains(&"pos.sell"){return Err("Permission required: pos.sell".into());}
    if let Some(id)=receipt_id {
        let (_,doc)=get(db,"receiptDocuments",id)?;
        if doc["orderId"]!=order_id{return Err("Receipt does not belong to this order".into());}
        return Ok(doc);
    }
    list(db,"receiptDocuments")?.into_iter().rev().find(|r|r["data"]["orderId"]==order_id)
        .map(|r|r["data"].clone()).ok_or_else(||"No saved receipt for this historical order.".into())
}

fn clean(value:&str)->String{value.chars().map(|c|if c.is_ascii()&&!c.is_control(){c}else{'?'}).collect()}
fn amount(value:&Value)->String{format!("{:.2}",value.as_i64().unwrap_or(0) as f64/100.0)}
fn pair(left:&str,right:&str,width:usize)->String{
    let left=clean(left);let right=clean(right);
    if left.len()+right.len()+1>width{return format!("{}\n{:>width$}",left,right,width=width);}
    format!("{}{}{}",left," ".repeat(width-left.len()-right.len()),right)
}
pub fn lines(doc:&Value,business_copy:bool,columns:usize,reprint:bool)->Vec<String>{
    let width=columns.clamp(24,64);let mut lines=vec![];
    let centered=|v:&str|format!("{:^width$}",clean(v),width=width);
    for key in ["name","address","phone","email"]{if let Some(v)=doc["business"][key].as_str().filter(|v|!v.is_empty()){lines.push(centered(v));}}
    if let Some(v)=doc["outlet"].as_str(){lines.push(centered(v));}
    lines.push(centered(if business_copy{"BUSINESS RECORD COPY"}else{"CUSTOMER COPY"}));
    if reprint{lines.push(centered("REPRINT"));}
    lines.push(format!("Receipt: {}",doc["number"].as_str().unwrap_or("")));
    lines.push(format!("Order: {}",doc["orderNumber"].as_str().unwrap_or("")));
    let stamp=doc["issuedAt"].as_str().unwrap_or("");
    let date=chrono::DateTime::parse_from_rfc3339(stamp).map(|v|v.with_timezone(&chrono::FixedOffset::east_opt(10800).unwrap()).format("%d/%m/%Y %H:%M EAT").to_string()).unwrap_or_else(|_|stamp.into());
    lines.push(format!("Date: {date}"));lines.push(format!("Cashier: {}",doc["cashier"].as_str().unwrap_or("")));
    for key in ["table","tab"]{if let Some(v)=doc[key].as_str().filter(|v|!v.is_empty()){lines.push(format!("{}: {}",key,v));}}
    lines.push("-".repeat(width));lines.push(pair("Item / Qty x Unit","Amount",width));
    for item in doc["items"].as_array().into_iter().flatten(){
        lines.push(clean(item["description"].as_str().unwrap_or("Item")));
        if let Some(v)=item["portion"].as_str(){lines.push(format!("  {}",clean(v)));}
        for modifier in item["modifiers"].as_array().into_iter().flatten().filter_map(Value::as_str){lines.push(format!("  + {}",clean(modifier)));}
        lines.push(pair(&format!("{} x {}",item["quantity"],amount(&item["unitPriceMinor"])),&amount(&item["amountMinor"]),width));
    }
    lines.push("-".repeat(width));
    for(label,key)in[("Subtotal","subtotalMinor"),("Discount","discountMinor"),("Net (after discount)","netMinor"),("VAT included","taxMinor"),("Levy included","levyMinor"),("TOTAL","totalMinor")]{
        if ["discountMinor","taxMinor","levyMinor"].contains(&key)&&doc[key].as_i64().unwrap_or(0)==0{continue;}
        lines.push(pair(label,&format!("{} {}{}",doc["currency"].as_str().unwrap_or("KES"),if key=="discountMinor"{"-"}else{""},amount(&doc[key])),width));
    }
    if doc["creditedMinor"].as_i64().unwrap_or(0)>0{lines.push(pair("CUSTOMER ACCOUNT",&amount(&doc["creditedMinor"]),width));if let Some(name)=doc["customerCredit"]["customerName"].as_str(){lines.push(format!("Account: {}",clean(name)));}if let Some(due)=doc["customerCredit"]["dueAt"].as_str(){lines.push(format!("Due: {}",clean(due)));}lines.push(pair("Account balance",&amount(&doc["customerCredit"]["accountBalanceMinor"]),width));}
    for payment in doc["payments"].as_array().into_iter().flatten(){
        lines.push(pair(payment["tenderType"].as_str().unwrap_or("Payment"),&amount(&payment["amountMinor"]),width));
        if let Some(reference)=payment["reference"].as_str().filter(|v|!v.is_empty()){lines.push(format!("Ref: {}",clean(reference)));}
        for(label,key)in[("Cash tendered","cashTenderedMinor"),("Change","changeMinor")]{if payment[key].is_i64(){lines.push(pair(label,&amount(&payment[key]),width));}}
    }
    lines.push(pair("Paid",&amount(&doc["paidMinor"]),width));lines.push(pair("Balance",&amount(&doc["balanceMinor"]),width));
    if business_copy{lines.push(format!("Transaction: {}",doc["orderId"].as_str().unwrap_or("")));}
    if let Some(message)=doc["message"].as_str().filter(|v|!v.is_empty()){lines.push(centered(message));}
    for footer in FOOTER{lines.push(centered(footer));}
    lines.into_iter().flat_map(|line|line.split('\n').map(str::to_owned).collect::<Vec<_>>()).collect()
}
