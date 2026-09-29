//! Native customer tabs, accounts receivable, settlement and reconciliation.
//! Financial entries are append-only; account policy is mutable.
use super::*;

fn minor(v:&Value,key:&str)->i64 {
    if let Some(n)=v.get(key).and_then(Value::as_i64){return n;}
    if let Some(n)=v.get(key).and_then(Value::as_f64){return (n*100.0).round() as i64;}
    0
}
fn amount_value(minor:i64)->Value { json!(minor as f64/100.0) }

pub fn balance_minor(tx:&Transaction,customer_id:&str)->Result<i64>{
    Ok(list(tx,"customerCreditEntries")?.into_iter()
        .filter(|r|r["data"]["customerId"].as_str()==Some(customer_id))
        .map(|r|r["data"]["balanceDeltaMinor"].as_i64().unwrap_or(0))
        .sum())
}
fn account(tx:&Transaction,customer_id:&str)->Result<Value>{
    get(tx,"customerCreditAccounts",customer_id).map(|(_,v)|v)
}
fn require(tx:&Transaction,user:&Session,permission:&str)->Result<()>{
    if permissions(&user.role).contains(&permission){Ok(())}
    else{Err(format!("Permission required: {permission}"))}
}
fn put_journal(tx:&Transaction,source_type:&str,source_id:&str,memo:String,lines:Vec<Value>,amount:i64,changes:&mut Vec<Value>)->Result<()>{
    let journal_id=id();let stamp=now();
    put(tx,"journalEntries",&journal_id,json!({
        "id":journal_id,"entryNumber":format!("JE-{}",&journal_id[..8]),"propertyId":"property",
        "occurredAt":stamp,"postedAt":stamp,"sourceType":source_type,"sourceId":source_id,"memo":memo,
        "lines":lines,"totalDebit":amount as f64/100.0,"totalCredit":amount as f64/100.0,"balanced":true
    }),changes)
}
fn fifo_allocations(tx:&Transaction,customer_id:&str,mut amount:i64)->Result<Vec<Value>>{
    let entries=list(tx,"customerCreditEntries")?;
    let mut charges=entries.iter().filter(|r|
        r["data"]["customerId"].as_str()==Some(customer_id)&&r["data"]["kind"]=="CHARGE"
    ).map(|r|r["data"].clone()).collect::<Vec<_>>();
    charges.sort_by_key(|v|v["occurredAt"].as_str().unwrap_or("").to_string());
    let mut out=Vec::new();
    for charge in charges{
        if amount<=0{break;}
        let charge_id=text(&charge,"id")?;
        let original=charge["amountMinor"].as_i64().unwrap_or(0);
        let direct_reversal:i64=entries.iter().filter(|r|r["data"]["reversesEntryId"].as_str()==Some(charge_id))
            .map(|r|r["data"]["balanceDeltaMinor"].as_i64().unwrap_or(0).abs()).sum();
        let allocated:i64=entries.iter().flat_map(|r|r["data"]["allocations"].as_array().cloned().unwrap_or_default())
            .filter(|a|a["chargeId"].as_str()==Some(charge_id)).map(|a|a["amountMinor"].as_i64().unwrap_or(0)).sum();
        let available=(original-direct_reversal-allocated).max(0);
        if available==0{continue;}
        let take=available.min(amount);
        out.push(json!({"chargeId":charge_id,"orderId":charge["orderId"],"amountMinor":take}));
        amount-=take;
    }
    if amount!=0{return Err("Credit ledger allocation does not reconcile".into());}
    Ok(out)
}

fn configure(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"credit.manage")?;
    let customer_id=text(p,"customerId")?;
    let (_,customer)=get(tx,"customers",customer_id)?;
    let limit=money(p,"limit")?;
    let terms=p["termsDays"].as_i64().filter(|n|*n>=0&&*n<=365).ok_or("Credit terms must be between 0 and 365 days")?;
    let status=text(p,"status")?;
    if !["ACTIVE","HOLD","CLOSED"].contains(&status){return Err("Credit status must be ACTIVE, HOLD or CLOSED".into());}
    let balance=balance_minor(tx,customer_id)?;
    if status=="CLOSED"&&balance!=0{return Err("Settle or write off the customer balance before closing credit".into());}
    put(tx,"customerCreditAccounts",customer_id,json!({
        "id":customer_id,"customerId":customer_id,"customerName":customer["name"],"status":status,
        "limitMinor":limit,"limit":limit as f64/100.0,"termsDays":terms,
        "notes":p.get("notes").and_then(Value::as_str).unwrap_or(""),
        "updatedAt":now(),"updatedBy":user.staff_id
    }),changes)
}
fn assign_customer(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"pos.open_tab")?;
    let order_id=text(p,"orderId")?;let customer_id=text(p,"customerId")?;
    let (_,customer)=get(tx,"customers",customer_id)?;
    let (_,mut order)=get(tx,"orders",order_id)?;
    if ["COMPLETED","VOIDED"].contains(&order["state"].as_str().unwrap_or("")){return Err("Closed orders cannot change customer".into());}
    if minor(&order,"amountPaid")>0||minor(&order,"amountCredited")>0{return Err("Assign the customer before settling any part of this tab".into());}
    order["customerId"]=json!(customer_id);order["customerName"]=customer["name"].clone();
    if order["tabName"].as_str().unwrap_or("").starts_with("Walk-in"){order["tabName"]=customer["name"].clone();}
    put(tx,"orders",order_id,order,changes)
}
fn charge(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"credit.charge")?;
    let order_id=text(p,"orderId")?;
    let (_,mut order)=get(tx,"orders",order_id)?;
    if ["COMPLETED","VOIDED"].contains(&order["state"].as_str().unwrap_or("")){return Err("Order already closed".into());}
    let customer_id=order["customerId"].as_str().filter(|v|!v.trim().is_empty()).ok_or("Link a customer before charging an account")?.to_string();
    let acct=account(tx,&customer_id)?;
    if acct["status"]!="ACTIVE"{return Err("Customer credit account is not active".into());}
    let total=money(&order,"grandTotal")?;let paid=money(&order,"amountPaid")?;let credited=minor(&order,"amountCredited");
    let amount=total-paid-credited;
    if amount<=0{return Err("Order has no balance to charge".into());}
    let current=balance_minor(tx,&customer_id)?;
    let limit=acct["limitMinor"].as_i64().unwrap_or(0);
    if current.saturating_add(amount)>limit{
        authorize(tx,user,"credit.override_limit",p,Some(&customer_id))?;
    }
    let terms=acct["termsDays"].as_i64().unwrap_or(0);
    let stamp=now();let due=(Utc::now()+Duration::days(terms)).to_rfc3339();
    let entry_id=id();
    let allocation_base=paid+credited;
    let allocate=|tax:i64|((tax as f64*(allocation_base+amount) as f64/total as f64).round()-(tax as f64*allocation_base as f64/total as f64).round()) as i64;
    let vat=allocate(money(&order,"taxTotal")?);let levy=allocate(money(&order,"cateringLevyTotal")?);let net=amount-vat-levy;
    put(tx,"customerCreditEntries",&entry_id,json!({
        "id":entry_id,"customerId":customer_id,"customerName":order["customerName"],"creditAccountId":customer_id,
        "kind":"CHARGE","balanceDeltaMinor":amount,"amountMinor":amount,"amount":amount as f64/100.0,
        "orderId":order_id,"orderNumber":order["orderNumber"],"sourceType":"ORDER","sourceId":order_id,
        "occurredAt":stamp,"dueAt":due,"actorId":user.staff_id,"actorName":user.name,
        "reference":order["orderNumber"],"notes":p.get("notes").and_then(Value::as_str).unwrap_or("")
    }),changes)?;
    let mut lines=vec![json!({"id":id(),"accountId":"CUSTOMER_AR","accountCode":"1105","accountName":"Customer Accounts Receivable","debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0,"description":"Customer credit sale"})];
    for(account_id,code,name,value)in[("SALES","4000","Sales",net),("VAT","2100","VAT payable",vat),("LEVY","2110","Levy payable",levy)]{
        if value!=0{lines.push(json!({"id":id(),"accountId":account_id,"accountCode":code,"accountName":name,"debit":0,"credit":value as f64/100.0,"debitMinor":0,"creditMinor":value,"description":"Credit sale allocation"}));}
    }
    put_journal(tx,"CUSTOMER_CREDIT_CHARGE",&entry_id,format!("Customer credit sale {}",order["orderNumber"].as_str().unwrap_or(order_id)),lines,amount,changes)?;
    order["amountCredited"]=amount_value(credited+amount);order["creditEntryId"]=json!(entry_id);order["paymentMethod"]=json!("CUSTOMER_CREDIT");
    if paid+credited+amount==total{
        order["state"]=json!("COMPLETED");order["completedAt"]=json!(stamp);
        if let Some(table_id)=order["tableId"].as_str(){let (_,mut table)=get(tx,"tables",table_id)?;table["currentOrderId"]=Value::Null;table["state"]=json!("CLEANING");put(tx,"tables",table_id,table,changes)?;}
    }
    put(tx,"orders",order_id,order,changes)
}
fn settle(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"credit.settle")?;
    let customer_id=text(p,"customerId")?;let acct=account(tx,customer_id)?;
    if acct["status"]=="CLOSED"{return Err("Customer credit account is closed".into());}
    let balance=balance_minor(tx,customer_id)?;
    let amount=money(p,"amount")?;
    if amount<=0||amount>balance{return Err("Settlement must be positive and cannot exceed the outstanding customer balance".into());}
    let method=text(p,"method")?;
    if !["CASH","MPESA","CARD"].contains(&method){return Err("Credit settlement method must be CASH, MPESA or CARD".into());}
    let (_,payment_config)=get(tx,"paymentConfig","main")?;
    if !payment_config["methods"].as_array().is_some_and(|methods|methods.iter().any(|m|m.as_str()==Some(method))){return Err(format!("{method} is not enabled for this business"));}
    let mut reference=id();let mut mpesa_receipt_id=Value::Null;
    if method=="CASH"{
        let tills=list(tx,"tillSessions")?;let active=tills.iter().find(|v|v["data"]["status"]=="OPEN").ok_or("Open a till before accepting a cash credit settlement")?;
        let mut till=active["data"].clone();let tid=text(&till,"id")?.to_string();
        till["creditCollectionsCash"]=amount_value(minor(&till,"creditCollectionsCash")+amount);
        till["expectedCashInDrawer"]=amount_value(money(&till,"expectedCashInDrawer")?+amount);
        put(tx,"tillSessions",&tid,till,changes)?;
    }else if method=="CARD"{
        reference=text(p,"cardAuthCode")?.trim().to_string();
        if reference.len()<2{return Err("Enter the external card approval reference".into());}
    }else{
        let m=&p["mpesa"];if m["confirmed"]!=true{return Err("Confirm the receipt on the business M-Pesa account first".into());}
        let code=text(m,"code")?.trim().to_ascii_uppercase();
        if code.len()<6||code.len()>20||!code.chars().all(|c|c.is_ascii_alphanumeric()){return Err("Enter a valid M-Pesa transaction code".into());}
        let account_no=text(m,"account")?.trim();
        let allowed=payment_config["mpesaAccounts"].as_array().is_some_and(|accounts|accounts.iter().any(|a|a["number"].as_str()==Some(account_no)));
        if !allowed{return Err("Choose a configured business M-Pesa account".into());}
        let received=money(m,"receivedAmount")?;if received!=amount{return Err("Customer credit settlement must equal the confirmed M-Pesa receipt amount".into());}
        let date=text(m,"receivedAt")?;chrono::DateTime::parse_from_rfc3339(date).map_err(|_|"Receipt time must include a timezone")?;
        let exists:Option<String>=tx.query_row("SELECT receipt_id FROM mpesa_codes WHERE account=? AND code=?",params![account_no,code],|r|r.get(0)).optional().map_err(error)?;
        if exists.is_some(){return Err("M-Pesa transaction code is already recorded".into());}
        let receipt_id=id();
        tx.execute("INSERT INTO mpesa_codes VALUES(?,?,?)",params![account_no,code,receipt_id]).map_err(error)?;
        put(tx,"mpesaReceipts",&receipt_id,json!({
            "id":receipt_id,"code":code,"account":account_no,"receivedAmount":amount as f64/100.0,"receivedAt":date,
            "allocatedAmount":amount as f64/100.0,"unappliedAmount":0,"reconciliationStatus":"AWAITING_RECONCILIATION",
            "cashierId":user.staff_id,"customerId":customer_id,"purpose":"CUSTOMER_CREDIT_SETTLEMENT"
        }),changes)?;
        reference=code;mpesa_receipt_id=json!(receipt_id);
    }
    let allocations=fifo_allocations(tx,customer_id,amount)?;
    let entry_id=id();let stamp=now();
    put(tx,"customerCreditEntries",&entry_id,json!({
        "id":entry_id,"customerId":customer_id,"customerName":acct["customerName"],"creditAccountId":customer_id,
        "kind":"SETTLEMENT","balanceDeltaMinor":-amount,"amountMinor":amount,"amount":amount as f64/100.0,
        "sourceType":method,"sourceId":reference,"reference":reference,"mpesaReceiptId":mpesa_receipt_id,
        "allocations":allocations,"occurredAt":stamp,"actorId":user.staff_id,"actorName":user.name,
        "notes":p.get("notes").and_then(Value::as_str).unwrap_or("")
    }),changes)?;
    let debit_name=if method=="MPESA"{"M-Pesa"}else if method=="CARD"{"Card"}else{"Cash"};
    put_journal(tx,"CUSTOMER_CREDIT_SETTLEMENT",&entry_id,format!("Customer credit settlement {}",acct["customerName"].as_str().unwrap_or(customer_id)),vec![
        json!({"id":id(),"accountId":method,"accountCode":method,"accountName":debit_name,"debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0,"description":"Customer credit collection"}),
        json!({"id":id(),"accountId":"CUSTOMER_AR","accountCode":"1105","accountName":"Customer Accounts Receivable","debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount,"description":"Reduce customer receivable"})
    ],amount,changes)
}
fn reconcile(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"credit.reconcile")?;
    let customer_id=text(p,"customerId")?;account(tx,customer_id)?;
    let expected=balance_minor(tx,customer_id)?;let statement=money(p,"statementBalance")?;
    if statement!=expected{return Err("Customer statement differs from ServOS; record a credit discrepancy first".into());}
    let reference=text(p,"reference")?;let rid=id();
    let entries=list(tx,"customerCreditEntries")?.into_iter().filter(|r|r["data"]["customerId"].as_str()==Some(customer_id)).collect::<Vec<_>>();
    let charges:i64=entries.iter().filter(|r|r["data"]["kind"]=="CHARGE").map(|r|r["data"]["amountMinor"].as_i64().unwrap_or(0)).sum();
    let settlements:i64=entries.iter().filter(|r|r["data"]["kind"]=="SETTLEMENT").map(|r|r["data"]["amountMinor"].as_i64().unwrap_or(0)).sum();
    let writeoffs:i64=entries.iter().filter(|r|r["data"]["kind"]=="WRITE_OFF").map(|r|r["data"]["amountMinor"].as_i64().unwrap_or(0)).sum();
    put(tx,"customerCreditReconciliations",&rid,json!({
        "id":rid,"customerId":customer_id,"expectedBalanceMinor":expected,"statementBalanceMinor":statement,"differenceMinor":0,
        "chargesMinor":charges,"settlementsMinor":settlements,"writeOffsMinor":writeoffs,"entryCount":entries.len(),
        "reference":reference,"notes":p.get("notes").and_then(Value::as_str).unwrap_or(""),
        "reviewedBy":user.staff_id,"reviewedAt":now()
    }),changes)
}
fn discrepancy(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"credit.reconcile")?;
    let customer_id=text(p,"customerId")?;account(tx,customer_id)?;
    if list(tx,"customerCreditDiscrepancies")?.iter().any(|r|r["data"]["customerId"].as_str()==Some(customer_id)&&r["data"]["status"]=="OPEN"){return Err("Resolve the existing customer credit discrepancy first".into());}
    let expected=balance_minor(tx,customer_id)?;let statement=money(p,"statementBalance")?;
    if expected==statement{return Err("Customer statement already matches ServOS".into());}
    let did=id();put(tx,"customerCreditDiscrepancies",&did,json!({
        "id":did,"customerId":customer_id,"expectedBalanceMinor":expected,"statementBalanceMinor":statement,
        "differenceMinor":statement-expected,"reference":text(p,"reference")?,"reason":text(p,"reason")?,
        "status":"OPEN","openedBy":user.staff_id,"openedAt":now()
    }),changes)
}
fn resolve_discrepancy(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"credit.reconcile")?;
    let did=text(p,"discrepancyId")?;let (_,mut d)=get(tx,"customerCreditDiscrepancies",did)?;
    if d["status"]!="OPEN"{return Err("Only open customer credit discrepancies can be resolved".into());}
    let outcome=text(p,"outcome")?;if !["STATEMENT_ERROR","MISSING_PAYMENT","MISSING_CHARGE","ACCEPTED_VARIANCE","WRITE_OFF_REQUIRED"].contains(&outcome){return Err("Invalid credit discrepancy outcome".into());}
    d["status"]=json!("RESOLVED");d["outcome"]=json!(outcome);d["resolution"]=json!(text(p,"resolution")?);d["resolvedBy"]=json!(user.staff_id);d["resolvedAt"]=json!(now());
    put(tx,"customerCreditDiscrepancies",did,d,changes)
}
fn write_off(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"credit.write_off")?;
    let customer_id=text(p,"customerId")?;let acct=account(tx,customer_id)?;
    let amount=money(p,"amount")?;let balance=balance_minor(tx,customer_id)?;
    if amount<=0||amount>balance{return Err("Write-off must be positive and cannot exceed the customer balance".into());}
    let reason=text(p,"reason")?;let allocations=fifo_allocations(tx,customer_id,amount)?;
    let eid=id();put(tx,"customerCreditEntries",&eid,json!({
        "id":eid,"customerId":customer_id,"customerName":acct["customerName"],"creditAccountId":customer_id,
        "kind":"WRITE_OFF","balanceDeltaMinor":-amount,"amountMinor":amount,"amount":amount as f64/100.0,
        "sourceType":"WRITE_OFF","sourceId":eid,"allocations":allocations,"reference":"BAD_DEBT",
        "notes":reason,"occurredAt":now(),"actorId":user.staff_id,"actorName":user.name
    }),changes)?;
    put_journal(tx,"CUSTOMER_CREDIT_WRITE_OFF",&eid,format!("Customer bad-debt write-off: {reason}"),vec![
        json!({"id":id(),"accountId":"BAD_DEBT","accountCode":"6200","accountName":"Bad debt expense","debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0}),
        json!({"id":id(),"accountId":"CUSTOMER_AR","accountCode":"1105","accountName":"Customer Accounts Receivable","debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount})
    ],amount,changes)
}
fn reverse(tx:&Transaction,user:&Session,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    require(tx,user,"credit.write_off")?;
    let original_id=text(p,"entryId")?;let (_,original)=get(tx,"customerCreditEntries",original_id)?;
    if list(tx,"customerCreditEntries")?.iter().any(|r|r["data"]["reversesEntryId"].as_str()==Some(original_id)){return Err("Customer credit entry already reversed".into());}
    let delta=original["balanceDeltaMinor"].as_i64().ok_or("Original credit delta missing")?;
    let amount=delta.abs();let customer_id=text(&original,"customerId")?;
    if original["kind"]=="SETTLEMENT"&&original["sourceType"]=="CASH"{
        let tills=list(tx,"tillSessions")?;let active=tills.iter().find(|v|v["data"]["status"]=="OPEN").ok_or("Open a till before reversing a cash credit settlement")?;
        let mut till=active["data"].clone();let tid=text(&till,"id")?.to_string();
        if amount>money(&till,"expectedCashInDrawer")?{return Err("Cash settlement reversal exceeds expected drawer cash".into());}
        till["creditCollectionsCash"]=amount_value((minor(&till,"creditCollectionsCash")-amount).max(0));
        till["expectedCashInDrawer"]=amount_value(money(&till,"expectedCashInDrawer")?-amount);put(tx,"tillSessions",&tid,till,changes)?;
    }
    if original["sourceType"]=="MPESA"&&text(p,"externalReference").is_err(){return Err("External reversal reference is required for M-Pesa credit settlement reversal".into());}
    let journal=list(tx,"journalEntries")?.into_iter().find(|r|r["data"]["sourceId"].as_str()==Some(original_id)).ok_or("Original customer credit journal not found")?["data"].clone();
    let lines=journal["lines"].as_array().cloned().unwrap_or_default().into_iter().map(|line|json!({
        "id":id(),"accountId":line["accountId"],"accountCode":line["accountCode"],"accountName":line["accountName"],
        "debit":line["credit"],"credit":line["debit"],"debitMinor":line["creditMinor"],"creditMinor":line["debitMinor"],
        "description":"Customer credit reversal"
    })).collect::<Vec<_>>();
    let eid=id();put(tx,"customerCreditEntries",&eid,json!({
        "id":eid,"customerId":customer_id,"customerName":original["customerName"],"creditAccountId":customer_id,
        "kind":if delta>0{"CHARGE_REVERSAL"}else{"SETTLEMENT_REVERSAL"},"balanceDeltaMinor":-delta,
        "amountMinor":amount,"amount":amount as f64/100.0,"reversesEntryId":original_id,"sourceType":"REVERSAL","sourceId":original_id,
        "reference":p.get("externalReference").and_then(Value::as_str).unwrap_or("INTERNAL_REVERSAL"),
        "notes":text(p,"reason")?,"occurredAt":now(),"actorId":user.staff_id,"actorName":user.name
    }),changes)?;
    put_journal(tx,"CUSTOMER_CREDIT_REVERSAL",&eid,format!("Reverse customer credit entry {original_id}"),lines,amount,changes)
}

pub fn execute(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<bool>{
    let p=&cmd.payload;
    match cmd.operation.as_str(){
        "customerCredit.configure"=>configure(tx,user,p,changes)?,
        "order.assignCustomer"=>assign_customer(tx,user,p,changes)?,
        "customerCredit.charge"=>charge(tx,user,p,changes)?,
        "customerCredit.settle"=>settle(tx,user,p,changes)?,
        "customerCredit.reconcile"=>reconcile(tx,user,p,changes)?,
        "customerCredit.discrepancy"=>discrepancy(tx,user,p,changes)?,
        "customerCredit.discrepancy.resolve"=>resolve_discrepancy(tx,user,p,changes)?,
        "customerCredit.writeOff"=>write_off(tx,user,p,changes)?,
        "customerCredit.reverse"=>reverse(tx,user,p,changes)?,
        _=>return Ok(false)
    }
    Ok(true)
}
