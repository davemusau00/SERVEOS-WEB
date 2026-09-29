use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Datelike, Duration, Timelike, Utc};
use rand_core::OsRng;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn id() -> String {
    Uuid::new_v4().to_string()
}
fn now() -> String {
    Utc::now().to_rfc3339()
}
pub fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| format!("{key} is required"))
}
fn money(v: &Value, key: &str) -> Result<i64> {
    let n = v
        .get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| format!("{key} must be a number"))?;
    if !n.is_finite()
        || n < 0.0
        || n > 1_000_000_000.0
        || ((n * 100.0).round() - n * 100.0).abs() > 0.0001
    {
        return Err(format!(
            "{key} must be a non-negative amount with at most two decimals"
        ));
    }
    Ok((n * 100.0).round() as i64)
}
fn quantity(v: &Value, key: &str) -> Result<f64> {
    let n = v[key]
        .as_f64()
        .ok_or_else(|| format!("{key} must be numeric"))?;
    if !n.is_finite()
        || n < 0.0
        || n > 1_000_000_000.0
        || (n * 1_000_000.0 - (n * 1_000_000.0).round()).abs() > 0.00001
    {
        return Err(format!(
            "{key} must be non-negative with at most six decimals"
        ));
    }
    Ok(n)
}
fn normalize_barcode_value(data: &mut Value) -> Result<Option<String>> {
    match data.get("barcode") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(raw)) => {
            let normalized=raw.trim().to_string();
            if normalized.len()>128 { return Err("Barcode cannot exceed 128 characters".into()); }
            data["barcode"]=if normalized.is_empty(){Value::Null}else{json!(normalized)};
            Ok(if normalized.is_empty(){None}else{Some(normalized)})
        }
        _ => Err("Barcode must be text".into()),
    }
}
fn validate_unique_barcode(tx: &Transaction, collection: &str, record_id: &str, barcode: Option<&str>) -> Result<()> {
    let Some(barcode)=barcode else { return Ok(()); };
    let normalized=barcode.to_lowercase();
    for record in list(tx,collection)? {
        if record["id"].as_str()==Some(record_id) { continue; }
        if record["data"]["barcode"].as_str().map(|value|value.trim().to_lowercase()).as_deref()==Some(normalized.as_str()) {
            return Err("This barcode already belongs to another record".into());
        }
    }
    Ok(())
}
pub fn open(path: &std::path::Path) -> Result<Connection> {
    let db = Connection::open(path).map_err(error)?;
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(error)?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
        .map_err(error)?;
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(error)?;
    if version > 2 {
        return Err("Database requires a newer ServOS version".into());
    }
    if version < 1 {
        db.execute_batch(include_str!("../migrations/001.sql")).map_err(error)?;
    }
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(error)?;
    if version < 2 {
        db.execute_batch(include_str!("../migrations/002_bar_v2.sql")).map_err(error)?;
    }
    Ok(db)
}
pub fn meta(db: &Connection, key: &str) -> Result<Option<String>> {
    db.query_row("SELECT value FROM metadata WHERE key=?", [key], |r| {
        r.get(0)
    })
    .optional()
    .map_err(error)
}
pub fn set_meta(db: &Connection, key: &str, value: &str) -> Result<()> {
    db.execute(
        "INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )
    .map_err(error)?;
    Ok(())
}


pub const ALL_PERMISSIONS: &[&str] = &[
    "business.view","business.configure","business.tax.configure",
    "staff.view","staff.create","staff.update","staff.deactivate","staff.reset_pin","staff.change_role",
    "pos.sell","pos.open_tab","pos.manage_table","order.fire","order.transfer","order.merge","order.void","order.discount","order.comp","order.refund",
    "payment.record","payment.split","payment.reverse",
    "till.open","till.close","till.cash_movement","till.override_variance",
    "mpesa.record","mpesa.reconcile",
    "catalog.view","catalog.manage","pricing.manage",
    "inventory.view","inventory.receive","inventory.transfer","inventory.waste","inventory.count","inventory.adjust",
    "procurement.view","procurement.manage","procurement.receive","procurement.over_receive","procurement.pay",
    "floorplan.view","floorplan.manage","kds.view","kds.update",
    "accounting.view","reports.view","audit.view","backup.create","backup.restore","sync.manual","system.configure","help.view"
];

pub fn permissions(role: &str) -> Vec<&'static str> {
    match role {
        "Admin" => ALL_PERMISSIONS.to_vec(),
        "Manager" => ALL_PERMISSIONS.iter().copied().filter(|p| ![
            "business.configure","business.tax.configure","staff.change_role","backup.restore","system.configure"
        ].contains(p)).collect(),
        _ => vec![
            "business.view","staff.view","pos.sell","pos.open_tab","pos.manage_table","order.fire",
            "payment.record","payment.split","till.open","till.close","mpesa.record",
            "catalog.view","inventory.view","procurement.view","procurement.receive","floorplan.view","kds.view","kds.update","help.view"
        ],
    }
}

pub fn installation_stage(db: &Connection) -> Result<String> {
    if let Some(stage) = meta(db, "installation_stage")? { return Ok(stage); }
    if meta(db, "terminal_id")?.is_some() { return Ok("SETUP_REQUIRED".into()); }
    if meta(db, "intake_profile")?.is_some() { return Ok("INTAKE_IN_PROGRESS".into()); }
    Ok("NEW".into())
}

fn live_required(tx: &Transaction, operation: &str) -> Result<()> {
    const TRADING: &[&str] = &[
        "till.open","till.cashMovement","till.close","order.create","order.addItem","order.updateItem",
        "order.removeItem","order.fire","order.kds","order.repeatRound","order.transfer","order.merge","order.void","order.discount",
        "order.compItem","payment.record","payment.split","payment.refund","payment.reverse","mpesa.reconcile","mpesa.discrepancy","mpesa.discrepancy.resolve",
        "inventory.receive","inventory.adjust","inventory.waste","inventory.transfer","purchaseOrder.create","purchaseOrder.receive","supplierPayable.matchInvoice","supplierPayable.pay","table.ready","closeDay.generate"
    ];
    if TRADING.contains(&operation) && installation_stage(tx)? != "LIVE" {
        return Err("Complete business setup and approve Go Live before trading".into());
    }
    Ok(())
}

fn verify_staff_pin(db: &Connection, staff_id: &str, pin: &str) -> Result<(String,String)> {
    let row: Option<(String,String,String)> = db.query_row(
        "SELECT name,role,pin_hash FROM staff WHERE id=? AND active=1", [staff_id],
        |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))
    ).optional().map_err(error)?;
    let (name,role,hash)=row.ok_or("Invalid approving staff member")?;
    if !["Admin","Manager"].contains(&role.as_str()) { return Err("Manager approval required".into()); }
    let parsed=PasswordHash::new(&hash).map_err(error)?;
    Argon2::default().verify_password(pin.as_bytes(),&parsed).map_err(|_|"Invalid approving PIN".to_string())?;
    Ok((name,role))
}

pub fn create_approval(db: &Connection, initiator_token: &str, approver_id: &str, pin: &str, permission: &str, target: Option<&str>) -> Result<Value> {
    let initiator=actor(db,initiator_token,true)?;
    if !ALL_PERMISSIONS.contains(&permission) { return Err("Unknown permission".into()); }
    let (approver_name,approver_role)=verify_staff_pin(db,approver_id,pin)?;
    if permission=="procurement.over_receive" && approver_id==initiator.staff_id.as_str() { return Err("A different Admin or Manager must approve an over-receipt".into()); }
    if !permissions(&approver_role).contains(&permission) { return Err("Approver does not have this permission".into()); }
    let token=id();
    let expires=Utc::now().timestamp()+120;
    db.execute("INSERT INTO approvals(token,initiator_id,approver_id,permission,target,expires_at) VALUES(?,?,?,?,?,?)",
        params![token,initiator.staff_id,approver_id,permission,target,expires]).map_err(error)?;
    Ok(json!({"token":token,"permission":permission,"target":target,"expiresAt":expires,"approvedBy":{"id":approver_id,"name":approver_name}}))
}

fn authorize(tx: &Transaction, user: &Session, permission: &str, payload: &Value, target: Option<&str>) -> Result<Option<String>> {
    if permissions(&user.role).contains(&permission) { return Ok(None); }
    let token=text(payload,"approvalToken")?;
    let row:Option<(String,String,Option<String>,i64,Option<i64>)>=tx.query_row(
        "SELECT initiator_id,approver_id,target,expires_at,used_at FROM approvals WHERE token=? AND permission=?",
        params![token,permission], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))
    ).optional().map_err(error)?;
    let (initiator,approver,approved_target,expires,used)=row.ok_or("Valid manager approval required")?;
    if initiator!=user.staff_id || used.is_some() || expires<Utc::now().timestamp() { return Err("Manager approval is expired or already used".into()); }
    if let (Some(expected),Some(actual))=(approved_target.as_deref(),target) { if expected!=actual { return Err("Manager approval applies to a different record".into()); } }
    tx.execute("UPDATE approvals SET used_at=? WHERE token=? AND used_at IS NULL",params![Utc::now().timestamp(),token]).map_err(error)?;
    Ok(Some(approver))
}

fn require_separate_approval(tx: &Transaction, user: &Session, permission: &str, payload: &Value, target: &str) -> Result<String> {
    let token=text(payload,"approvalToken")?;
    let row:Option<(String,String,Option<String>,i64,Option<i64>)>=tx.query_row(
        "SELECT initiator_id,approver_id,target,expires_at,used_at FROM approvals WHERE token=? AND permission=?",
        params![token,permission], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))
    ).optional().map_err(error)?;
    let (initiator,approver,approved_target,expires,used)=row.ok_or("A different Admin or Manager must approve this over-receipt")?;
    if initiator!=user.staff_id || approver==user.staff_id || approved_target.as_deref()!=Some(target) || used.is_some() || expires<Utc::now().timestamp() {
        return Err("Over-receipt approval is expired, already used, or belongs to another purchase order".into());
    }
    let updated=tx.execute("UPDATE approvals SET used_at=? WHERE token=? AND used_at IS NULL",params![Utc::now().timestamp(),token]).map_err(error)?;
    if updated!=1 { return Err("Over-receipt approval was already used".into()); }
    Ok(approver)
}
pub fn hash_pin(pin: &str) -> Result<String> {
    if pin.len() < 6 || pin.len() > 12 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must contain 6–12 digits".into());
    }
    Argon2::default()
        .hash_password(pin.as_bytes(), &SaltString::generate(&mut OsRng))
        .map(|h| h.to_string())
        .map_err(error)
}
pub fn initialize(
    db: &mut Connection,
    terminal: &str,
    name: &str,
    pin: &str,
    business: &str,
) -> Result<()> {
    let profile=json!({
        "business":{"tradingName":business,"legalName":business,"registrationNumber":"","kraPin":"","phone":"","email":"","address":""},
        "owner":{"fullName":name,"phone":"","email":""},
        "initialAdministrator":{"fullName":name,"phone":"","email":"","jobTitle":"Owner","isBusinessOwner":true}
    });
    initialize_from_intake(db,terminal,pin,&profile)
}
pub fn initialize_from_intake(
    db: &mut Connection,
    terminal: &str,
    pin: &str,
    profile: &Value,
) -> Result<()> {
    let business=profile["business"]["tradingName"].as_str().map(str::trim).filter(|v|!v.is_empty()).ok_or("Business trading name is required")?;
    let admin_name=profile["initialAdministrator"]["fullName"].as_str().map(str::trim).filter(|v|!v.is_empty()).ok_or("Initial Administrator name is required")?;
    let admin_job=profile["initialAdministrator"]["jobTitle"].as_str().map(str::trim).filter(|v|!v.is_empty()).unwrap_or("System Administrator");
    let admin_phone=profile["initialAdministrator"]["phone"].as_str().unwrap_or("").trim();
    let admin_email=profile["initialAdministrator"]["email"].as_str().unwrap_or("").trim();
    let owner_name=profile["owner"]["fullName"].as_str().unwrap_or("").trim();
    let owner_phone=profile["owner"]["phone"].as_str().unwrap_or("").trim();
    let owner_email=profile["owner"]["email"].as_str().unwrap_or("").trim();
    let legal_name=profile["business"]["legalName"].as_str().map(str::trim).filter(|v|!v.is_empty()).unwrap_or(business);
    let registration=profile["business"]["registrationNumber"].as_str().unwrap_or("").trim();
    let kra_pin=profile["business"]["kraPin"].as_str().unwrap_or("").trim();
    let phone=profile["business"]["phone"].as_str().unwrap_or("").trim();
    let email=profile["business"]["email"].as_str().unwrap_or("").trim();
    let address=profile["business"]["address"].as_str().unwrap_or("").trim();
    let hash = hash_pin(pin)?;

    let tx = db.transaction().map_err(error)?;
    if meta(&tx, "terminal_id")?.is_some() { return Err("Terminal already enrolled".into()); }
    set_meta(&tx, "terminal_id", terminal)?;
    set_meta(&tx, "installation_stage", "SETUP_REQUIRED")?;

    let admin_id = id();
    tx.execute(
        "INSERT INTO staff(id,name,role,pin_hash) VALUES(?,?,'Admin',?)",
        params![admin_id, admin_name, hash],
    ).map_err(error)?;

    let mut changes = vec![];
    put(&tx,"organization","business",json!({
        "id":"business","name":business,"legalName":legal_name,"registrationNumber":registration,"code":"BUSINESS",
        "baseCurrency":"KES","phone":phone,"email":email,"address":address,
        "ownerName":owner_name,"ownerPhone":owner_phone,"ownerEmail":owner_email
    }),&mut changes)?;
    put(&tx,"property","property",json!({
        "id":"property","organizationId":"business","name":business,"code":"MAIN",
        "currency":"KES","timezone":"Africa/Nairobi","kraPin":kra_pin,"etimsCuNumber":"",
        "phone":phone,"email":email,"address":address,
        "taxConfigured":false,"pricesIncludeTax":true,"vatRatePct":0,"levyRatePct":0,"receiptFooter":""
    }),&mut changes)?;
    put(&tx,"employees",&admin_id,json!({
        "id":admin_id,"name":admin_name,"jobTitle":admin_job,"role":"Admin","status":"ACTIVE",
        "phone":admin_phone,"email":admin_email,"isBusinessOwner":profile["initialAdministrator"]["isBusinessOwner"].as_bool().unwrap_or(false)
    }),&mut changes)?;
    put(&tx,"installationProfile","initial",json!({
        "id":"initial","terminalId":terminal,"commissionedAt":now(),"initialAdministratorId":admin_id,
        "businessName":business,"owner":{"name":owner_name,"phone":owner_phone,"email":owner_email},
        "intake":profile.clone()
    }),&mut changes)?;
    put(&tx,"businessSetup","business",json!({
        "id":"business","version":1,"currentStep":"BUSINESS_IDENTITY","completedSteps":[],"skippedOptionalSteps":[],
        "startedAt":now(),"updatedAt":now(),"completedAt":null,"goLiveApprovedAt":null,"goLiveApprovedBy":null
    }),&mut changes)?;

    let command = BusinessCommand {
        id: id(), schema_version: 1, operation: "installation.enroll".into(), target_version: None,
        payload: json!({"business":business,"initialAdministratorId":admin_id})
    };
    finish(&tx,&command,&admin_id,changes)?;
    tx.commit().map_err(error)
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub token: String,
    pub staff_id: String,
    pub name: String,
    pub role: String,
}
pub fn login(db: &Connection, staff_id: &str, pin: &str) -> Result<Session> {
    let row: Option<(String, String, String, i64, i64)> = db
        .query_row(
            "SELECT name,role,pin_hash,failures,locked_until FROM staff WHERE id=? AND active=1",
            [staff_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .optional()
        .map_err(error)?;
    let (name, role, hash, failures, locked) = row.ok_or("Invalid staff or PIN")?;
    let stamp = Utc::now().timestamp();
    if locked > stamp {
        return Err("Too many attempts. Try again after five minutes.".into());
    }
    let parsed = PasswordHash::new(&hash).map_err(error)?;
    if Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_err()
    {
        let attempts = if locked > 0 { 1 } else { failures + 1 };
        db.execute(
            "UPDATE staff SET failures=?,locked_until=? WHERE id=?",
            params![
                attempts,
                if attempts >= 5 { stamp + 300 } else { 0 },
                staff_id
            ],
        )
        .map_err(error)?;
        return Err("Invalid staff or PIN".into());
    }
    db.execute(
        "UPDATE staff SET failures=0,locked_until=0 WHERE id=?",
        [staff_id],
    )
    .map_err(error)?;
    let token = id();
    db.execute(
        "INSERT INTO sessions VALUES(?,?,?)",
        params![token, staff_id, stamp],
    )
    .map_err(error)?;
    Ok(Session {
        token,
        staff_id: staff_id.into(),
        name,
        role,
    })
}
pub fn actor(db: &Connection, token: &str, touch: bool) -> Result<Session> {
    let row:Option<Session>=db.query_row("SELECT s.staff_id,u.name,u.role FROM sessions s JOIN staff u ON u.id=s.staff_id WHERE s.token=? AND u.active=1 AND s.last_seen>?",params![token,Utc::now().timestamp()-900],|r|Ok(Session{token:token.into(),staff_id:r.get(0)?,name:r.get(1)?,role:r.get(2)?})).optional().map_err(error)?;
    let user = row.ok_or("SESSION_EXPIRED: Unlock the terminal to continue")?;
    if touch {
        db.execute(
            "UPDATE sessions SET last_seen=? WHERE token=?",
            params![Utc::now().timestamp(), token],
        )
        .map_err(error)?;
    }
    Ok(user)
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BusinessCommand {
    pub id: String,
    pub schema_version: i64,
    pub operation: String,
    pub target_version: Option<i64>,
    pub payload: Value,
}

fn parse_clock(value: &str) -> Option<i32> {
    let mut parts=value.split(':');
    let h=parts.next()?.parse::<i32>().ok()?; let m=parts.next()?.parse::<i32>().ok()?;
    if !(0..24).contains(&h) || !(0..60).contains(&m) { return None; }
    Some(h*60+m)
}

fn active_price_rule(tx: &Connection, product: &Value, base_minor: i64) -> Result<(i64, Value)> {
    let local=Utc::now()+Duration::hours(3);
    let today=local.format("%Y-%m-%d").to_string();
    let weekday=format!("{:?}",local.weekday()).to_ascii_uppercase();
    let weekday_number=local.weekday().number_from_monday() as i64;
    let minute=(local.hour() as i32)*60+local.minute() as i32;
    let mut best: Option<(i64,Value)>=None;
    for record in list(tx,"priceRules")? {
        let rule=&record["data"];
        if rule["active"]==false { continue; }
        if let Some(start)=rule["startDate"].as_str(){if today.as_str()<start{continue;}}
        if let Some(end)=rule["endDate"].as_str(){if today.as_str()>end{continue;}}
        if let Some(days)=rule["days"].as_array(){
            let day_matches=days.is_empty() || days.iter().any(|d|{
                d.as_i64()==Some(weekday_number) ||
                d.as_str().is_some_and(|raw|{
                    let normalized=raw.trim().to_ascii_uppercase();
                    normalized==weekday || normalized.starts_with(&weekday)
                })
            });
            if !day_matches { continue; }
        }
        let starts=rule["startTime"].as_str().and_then(parse_clock);
        let ends=rule["endTime"].as_str().and_then(parse_clock);
        if let (Some(a),Some(b))=(starts,ends){let active=if a<=b{minute>=a&&minute<=b}else{minute>=a||minute<=b};if !active{continue;}}

        let scope_type=rule["scopeType"].as_str().or_else(||rule["scope"].as_str()).unwrap_or("ALL").to_ascii_uppercase();
        let scope_id=rule["scopeId"].as_str();
        let legacy_product=rule["productIds"].as_array().map(|ids|ids.iter().any(|v|v==&product["id"])).unwrap_or(false);
        let legacy_category=rule["category"].as_str().zip(product["category"].as_str()).map(|(a,b)|a.eq_ignore_ascii_case(b)).unwrap_or(false);
        let product_match=(scope_type=="PRODUCT" && scope_id==product["id"].as_str()) || legacy_product;
        let category_match=(scope_type=="CATEGORY" && scope_id.zip(product["category"].as_str()).is_some_and(|(a,b)|a.eq_ignore_ascii_case(b))) || legacy_category;
        let all=scope_type=="ALL";
        if !(product_match||category_match||all){continue;}

        let priority=rule["priority"].as_i64().unwrap_or(0);
        if best.as_ref().is_some_and(|(p,_)|*p>priority){continue;}
        best=Some((priority,rule.clone()));
    }
    if let Some((_,rule))=best {
        let kind=rule["type"].as_str().unwrap_or("PERCENT");
        let value=rule["value"].as_f64().unwrap_or(0.0);
        let effective=if kind=="FIXED"{(value*100.0).round() as i64}else{((base_minor as f64)*(1.0-value/100.0)).round() as i64};
        return Ok((effective.max(0),rule));
    }
    Ok((base_minor,Value::Null))
}

fn tax_split(policy: &Value, product: &Value, total_minor: i64) -> Result<(i64,i64,i64)> {
    let vat=if ["B_0","C_EXEMPT"].contains(&product["taxClassId"].as_str().unwrap_or("")){0.0}else{quantity(policy,"vatRatePct")?/100.0};
    let levy=quantity(policy,"levyRatePct")?/100.0;
    let vat_minor=(total_minor as f64*vat/(1.0+vat+levy)).round() as i64;
    let levy_minor=(total_minor as f64*levy/(1.0+vat+levy)).round() as i64;
    Ok((total_minor-vat_minor-levy_minor,vat_minor,levy_minor))
}

fn build_order_item(tx: &Connection, product_id: &str, payload: &Value, item_id: Option<&str>) -> Result<Value> {
    let (version,product)=get(tx,"products",product_id)?;
    let (_,policy)=get(tx,"property","property")?;
    if policy["taxConfigured"]!=true{return Err("An owner must configure the business tax rates before trading".into());}
    let quantity_value=payload.get("quantity").and_then(Value::as_f64).unwrap_or(1.0);
    if !quantity_value.is_finite()||quantity_value<=0.0||quantity_value>1000.0{return Err("Item quantity must be between 0 and 1000".into());}
    let selected_portion=payload.get("portionId").and_then(Value::as_str).and_then(|key|product["portions"].as_array().and_then(|items|items.iter().find(|x|x["id"].as_str()==Some(key)))).cloned();
    let base_price=if let Some(portion)=&selected_portion{money(portion,"price")?}else{money(&product,"price")?};
    let (rule_price,rule_snapshot)=active_price_rule(tx,&product,base_price)?;
    let selected_ids:Vec<&str>=payload.get("modifierIds").and_then(Value::as_array).map(|a|a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
    let mut modifiers=vec![]; let mut modifier_minor=0i64;
    for modifier in product["modifiers"].as_array().cloned().unwrap_or_default(){
        if selected_ids.iter().any(|id|Some(*id)==modifier["id"].as_str()){
            modifier_minor+=money(&modifier,"priceDelta").unwrap_or(0); modifiers.push(modifier);
        }
    }
    let unit_minor=(rule_price+modifier_minor).max(0);
    let line_minor=(unit_minor as f64*quantity_value).round() as i64;
    let (net,vat,levy)=tax_split(&policy,&product,line_minor)?;
    let mut ingredients=product["recipeIngredients"].as_array().cloned().unwrap_or_default();
    if ingredients.is_empty(){if let Some(stock)=product["stockItemId"].as_str(){let volume=selected_portion.as_ref().and_then(|v|v["volume"].as_f64()).or_else(||product["portionVolume"].as_f64()).unwrap_or(1.0);ingredients.push(json!({"stockItemId":stock,"quantity":volume,"tracked":true}));}}
    for modifier in &modifiers { for adjustment in modifier["ingredientAdjustments"].as_array().cloned().unwrap_or_default(){
        let stock=text(&adjustment,"stockItemId")?; let delta=adjustment["quantityDelta"].as_f64().ok_or("Invalid modifier ingredient quantity")?;
        if let Some(existing)=ingredients.iter_mut().find(|v|v["stockItemId"].as_str()==Some(stock)){existing["quantity"]=json!(existing["quantity"].as_f64().unwrap_or(0.0)+delta);}else if delta>0.0{ingredients.push(json!({"stockItemId":stock,"quantity":delta,"tracked":true}));}
    }}
    Ok(json!({
        "id":item_id.map(str::to_string).unwrap_or_else(id),"productId":product_id,"productName":product["name"],"quantity":quantity_value,
        "baseUnitPrice":base_price as f64/100.0,"unitPrice":unit_minor as f64/100.0,"lineTotal":line_minor as f64/100.0,"totalPrice":line_minor as f64/100.0,
        "netMinor":net,"vatMinor":vat,"levyMinor":levy,"taxAmount":vat as f64/100.0,"cateringLevy":levy as f64/100.0,
        "taxPolicySnapshot":policy,"priceRuleSnapshot":rule_snapshot,"portionSnapshot":selected_portion,"modifiers":modifiers,"ingredientSnapshot":ingredients,
        "state":"OPEN","courseStatus":"HELD","roundNo":payload.get("roundNo").and_then(Value::as_i64).unwrap_or(1),"courseName":payload.get("courseName").cloned().unwrap_or(json!("Bar")),"seatLabel":payload.get("seatLabel"),"note":payload.get("note"),
        "productSnapshot":product,"productVersion":version,"stockFired":false,"comped":false,"discountMinor":0
    }))
}

fn recalculate_order(order: &mut Value) -> Result<()> {
    let items=order["items"].as_array().ok_or("Invalid order items")?;
    let total=items.iter().map(|i|money(i,"lineTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>();
    let net=items.iter().map(|i|i["netMinor"].as_i64().unwrap_or(0)).sum::<i64>();
    let vat=items.iter().map(|i|i["vatMinor"].as_i64().unwrap_or(0)).sum::<i64>();
    let levy=items.iter().map(|i|i["levyMinor"].as_i64().unwrap_or(0)).sum::<i64>();
    let discount=items.iter().map(|i|i["discountMinor"].as_i64().unwrap_or(0)).sum::<i64>();
    order["subtotal"]=json!(net as f64/100.0); order["taxTotal"]=json!(vat as f64/100.0); order["cateringLevyTotal"]=json!(levy as f64/100.0); order["discountTotal"]=json!(discount as f64/100.0); order["grandTotal"]=json!(total as f64/100.0);
    Ok(())
}

pub fn get(db: &Connection, collection: &str, id: &str) -> Result<(i64, Value)> {
    let row: Option<(i64, String)> = db
        .query_row(
            "SELECT version,data FROM records WHERE collection=? AND id=? AND archived=0",
            params![collection, id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(error)?;
    let (version, data) = row.ok_or_else(|| format!("{collection} record not found"))?;
    Ok((version, serde_json::from_str(&data).map_err(error)?))
}
fn put(
    tx: &Transaction,
    collection: &str,
    record_id: &str,
    mut data: Value,
    changes: &mut Vec<Value>,
) -> Result<()> {
    data["id"] = json!(record_id);
    tx.execute("INSERT INTO records(collection,id,data) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data, version=records.version+1",params![collection,record_id,data.to_string()]).map_err(error)?;
    let version: i64 = tx
        .query_row(
            "SELECT version FROM records WHERE collection=? AND id=?",
            params![collection, record_id],
            |r| r.get(0),
        )
        .map_err(error)?;
    changes.push(json!({"collection":collection,"id":record_id,"version":version,"data":data,"archived":false}));
    Ok(())
}
fn finish(
    tx: &Transaction,
    cmd: &BusinessCommand,
    actor_id: &str,
    changes: Vec<Value>,
) -> Result<Value> {
    let audit_id = id();
    let occurred = now();
    let approved_by: Option<String> = cmd.payload.get("approvalToken").and_then(Value::as_str).and_then(|token| {
        tx.query_row("SELECT approver_id FROM approvals WHERE token=?", [token], |r| r.get(0)).optional().ok().flatten()
    });
    tx.execute("INSERT INTO audit(id,command_id,actor_id,operation,occurred_at,payload) VALUES(?,?,?,?,?,?)",params![audit_id,cmd.id,actor_id,cmd.operation,occurred,json!({"recordIds":changes.iter().map(|c|c["id"].clone()).collect::<Vec<_>>(),"approvedBy":approved_by}).to_string()]).map_err(error)?;
    let sequence = tx.last_insert_rowid();
    let envelope = json!({"sequence":sequence,"commandId":cmd.id,"operation":cmd.operation,"actorId":actor_id,"occurredAt":occurred,"changes":changes});
    tx.execute(
        "INSERT INTO outbox(sequence,command_id,envelope) VALUES(?,?,?)",
        params![sequence, cmd.id, envelope.to_string()],
    )
    .map_err(error)?;
    let result = json!({"commandId":cmd.id,"recordIds":changes.iter().map(|c|c["id"].clone()).collect::<Vec<_>>(),"auditReference":audit_id,"sequence":sequence});
    tx.execute(
        "INSERT INTO commands VALUES(?,?,?)",
        params![
            cmd.id,
            serde_json::to_string(cmd).map_err(error)?,
            result.to_string()
        ],
    )
    .map_err(error)?;
    Ok(result)
}
const MASTER: &[&str] = &[
    "products",
    "stockItems",
    "stockLocations",
    "tables",
    "outlets",
    "property",
    "customers",
    "suppliers",
    "rooms",
    "priceRules",
    "recipes",
    "events",
    "promoters",
    "reservations",
    "waitlist",
    "housekeeping",
    "maintenance",
    "organization",
    "paymentConfig",
    "tillPolicy",
];
fn master_permission(collection: &str) -> Option<&'static str> {
    match collection {
        "organization" | "property" | "paymentConfig" | "tillPolicy" | "outlets"
        | "rooms" | "events" | "promoters" | "reservations" | "waitlist" | "housekeeping" | "maintenance"
            => Some("business.configure"),
        "stockItems" | "stockLocations" => Some("inventory.adjust"),
        "tables" => Some("floorplan.manage"),
        "priceRules" => Some("pricing.manage"),
        "suppliers" => Some("procurement.manage"),
        "products" | "customers" | "recipes" => Some("catalog.manage"),
        _ => None,
    }
}
pub fn execute(db: &mut Connection, token: &str, cmd: BusinessCommand) -> Result<Value> {
    let user = actor(db, token, true)?;
    execute_as(db, &user, cmd)
}
pub fn execute_as(db: &mut Connection, user: &Session, cmd: BusinessCommand) -> Result<Value> {
    if cmd.schema_version != 1 || Uuid::parse_str(&cmd.id).is_err() {
        return Err("Unsupported command version or invalid ID".into());
    }
    let tx = db.transaction().map_err(error)?;
    let prior: Option<(String, String)> = tx
        .query_row(
            "SELECT fingerprint,result FROM commands WHERE id=?",
            [&cmd.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(error)?;
    if let Some((fingerprint, result)) = prior {
        let original: String = tx
            .query_row(
                "SELECT actor_id FROM audit WHERE command_id=?",
                [&cmd.id],
                |r| r.get(0),
            )
            .map_err(error)?;
        if original != user.staff_id || fingerprint != serde_json::to_string(&cmd).map_err(error)? {
            return Err(
                "Command ID was already used by another actor or for different input".into(),
            );
        }
        return serde_json::from_str(&result).map_err(error);
    }
    let mut changes = vec![];
    let p = &cmd.payload;
    live_required(&tx, &cmd.operation)?;
    match cmd.operation.as_str() {
        "record.save" | "record.archive" => {
            let collection = text(p, "collection")?;
            if !MASTER.contains(&collection) {
                return Err("This collection requires a dedicated business command".into());
            }
            let required = master_permission(collection)
                .ok_or("This collection requires a dedicated business command")?;
            if !permissions(&user.role).contains(&required) {
                return Err(format!("Permission required: {required}"));
            }
            let record_id = text(p, "id")?;
            let existing = get(&tx, collection, record_id).ok();
            if existing.as_ref().map(|x| x.0) != cmd.target_version {
                return Err("CONFLICT: Record changed; reload before saving".into());
            }
            if cmd.operation == "record.archive" {
                if existing.is_none() {
                    return Err("Record not found".into());
                }
                if ["organization","property","paymentConfig","tillPolicy","outlets"].contains(&collection) {
                    return Err("Primary business configuration cannot be archived through generic CRUD".into());
                }
                let data = &existing.as_ref().unwrap().1;
                if collection=="stockLocations" {
                    let stock_in_location=list(&tx,"stockItems")?.iter().any(|r|r["data"]["currentStock"][record_id].as_f64().unwrap_or(0.0)!=0.0);
                    if stock_in_location { return Err("Move or count stock to zero before archiving this location".into()); }
                    let used_by_outlet=list(&tx,"outlets")?.iter().any(|r|r["data"]["defaultStockLocationId"].as_str()==Some(record_id));
                    if used_by_outlet { return Err("Change the service area's default stock location before archiving this location".into()); }
                }
                if collection=="suppliers" {
                    let open_po=list(&tx,"purchaseOrders")?.iter().any(|r|r["data"]["supplierId"].as_str()==Some(record_id) && !["RECEIVED","INVOICED","PAID","CANCELLED"].contains(&r["data"]["status"].as_str().unwrap_or("")));
                    let open_payable=list(&tx,"supplierPayables")?.iter().any(|r|r["data"]["supplierId"].as_str()==Some(record_id) && r["data"]["amountDue"].as_f64().unwrap_or(0.0)>0.0);
                    if open_po || open_payable { return Err("Settle or close this supplier's open procurement records before archiving".into()); }
                }
                if collection=="customers" {
                    let open_order=list(&tx,"orders")?.iter().any(|r|r["data"]["customerId"].as_str()==Some(record_id) && !["COMPLETED","VOIDED"].contains(&r["data"]["state"].as_str().unwrap_or("")));
                    if open_order { return Err("Resolve the customer's open tab before archiving".into()); }
                }
                if collection == "tables" && data["currentOrderId"].as_str().is_some() {
                    return Err(
                        "Close or transfer the active order before archiving this table".into(),
                    );
                }
                if collection == "stockItems"
                    && data["currentStock"].as_object().is_some_and(|locations| {
                        locations.values().any(|q| q.as_f64().unwrap_or(0.0) != 0.0)
                    })
                {
                    return Err("Resolve remaining stock before archiving".into());
                }
                if collection == "stockItems" {
                    let referenced=list(&tx,"products")?.iter().any(|record|{
                        let product=&record["data"];
                        if product["stockItemId"].as_str()==Some(record_id){return true;}
                        if product["recipeIngredients"].as_array().is_some_and(|items|items.iter().any(|item|item["stockItemId"].as_str()==Some(record_id))){return true;}
                        product["modifiers"].as_array().is_some_and(|mods|mods.iter().any(|modifier|
                            modifier["ingredientAdjustments"].as_array().is_some_and(|items|items.iter().any(|item|item["stockItemId"].as_str()==Some(record_id)))
                        ))
                    });
                    if referenced { return Err("This stock item is still referenced by an active product, recipe or modifier".into()); }
                }
                tx.execute(
                    "UPDATE records SET archived=1,version=version+1 WHERE collection=? AND id=?",
                    params![collection, record_id],
                )
                .map_err(error)?;
                let (version, data) = existing.unwrap();
                changes.push(json!({"collection":collection,"id":record_id,"version":version+1,"data":data,"archived":true}));
            } else {
                let mut data = p
                    .get("data")
                    .filter(|v| v.is_object())
                    .ok_or("Record data is required")?
                    .clone();
                if let Some((_, prior)) = &existing {
                    if let (Some(target), Some(source)) = (data.as_object_mut(), prior.as_object())
                    {
                        for (key, value) in source {
                            target.entry(key.clone()).or_insert_with(|| value.clone());
                        }
                    }
                }
                if collection == "tables" {
                    text(&data, "label")?;
                } else {
                    text(&data, "name")?;
                }
                if collection == "property" && data["taxConfigured"] == true {
                    if quantity(&data, "vatRatePct")? > 100.0
                        || quantity(&data, "levyRatePct")? > 100.0
                    {
                        return Err("Tax rates must be between 0 and 100".into());
                    }
                    if data["pricesIncludeTax"] != true {
                        return Err("This release requires tax-inclusive selling prices".into());
                    }
                }
                if collection == "outlets" {
                    let location=data["defaultStockLocationId"].as_str().map(str::trim).filter(|value|!value.is_empty());
                    if let Some(location)=location {
                        get(&tx,"stockLocations",location)?;
                    } else if installation_stage(&tx)=="LIVE" {
                        return Err("Live service areas require a default stock location".into());
                    }
                }
                if collection == "products" {
                    money(&data, "price")?;
                    text(&data, "code")?;
                    if !["BAR", "KITCHEN", "SERVICE"].contains(&text(&data, "routeTo")?) {
                        return Err("Invalid preparation station".into());
                    }
                    let outlets = data["outletIds"]
                        .as_array()
                        .ok_or("Assign at least one outlet")?;
                    if outlets.is_empty() {
                        return Err("Assign at least one outlet".into());
                    }
                    for outlet in outlets {
                        get(&tx, "outlets", outlet.as_str().ok_or("Invalid outlet")?)?;
                    }
                }
                if collection == "stockItems" {
                    quantity(&data, "averageUnitCost")?;
                    text(&data, "code")?;
                    text(&data, "baseUnit")?;
                    if !data["scanUnitQuantity"].is_null() && quantity(&data, "scanUnitQuantity")? <= 0.0 {
                        return Err("Quantity represented by one scan must be greater than zero".into());
                    }
                    data["currentStock"] = existing
                        .as_ref()
                        .map(|(_, v)| v["currentStock"].clone())
                        .unwrap_or(json!({}));
                }
                if collection == "tables" {
                    if data["capacity"]
                        .as_u64()
                        .filter(|n| *n > 0 && *n <= 1000)
                        .is_none()
                    {
                        return Err("Table capacity must be between 1 and 1000".into());
                    }
                    get(&tx, "outlets", text(&data, "outletId")?)?;
                    data["state"] = existing
                        .as_ref()
                        .map(|(_, v)| v["state"].clone())
                        .unwrap_or(json!("AVAILABLE"));
                    data["currentOrderId"] = existing
                        .as_ref()
                        .map(|(_, v)| v["currentOrderId"].clone())
                        .unwrap_or(Value::Null);
                }
                if ["products", "stockItems", "suppliers"].contains(&collection) {
                    let code = text(&data, "code")?;
                    let duplicate:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM records WHERE collection=? AND id<>? AND archived=0 AND lower(json_extract(data,'$.code'))=lower(?))",params![collection,record_id,code],|r|r.get(0)).map_err(error)?;
                    if duplicate {
                        return Err("This code already belongs to another record".into());
                    }
                }
                if collection == "products" || collection == "stockItems" {
                    let barcode=normalize_barcode_value(&mut data)?;
                    validate_unique_barcode(&tx,collection,record_id,barcode.as_deref())?;
                }
                put(&tx, collection, record_id, data, &mut changes)?;
            }
        }
        "setup.completeStep" => {
            if !permissions(&user.role).contains(&"business.configure") { return Err("Owner permission required".into()); }
            let step=text(p,"step")?;
            let allowed=["BUSINESS_IDENTITY","TAX","PAYMENTS","SERVICE_AREAS","STOCK_LOCATIONS","CATALOG","RECIPES_PORTIONS","OPENING_INVENTORY","FLOORPLAN","STAFF_ACCESS","TILL","BACKUP_SYNC"];
            if !allowed.contains(&step) { return Err("Unknown setup step".into()); }
            match step {
                "BUSINESS_IDENTITY" => { let (_,property)=get(&tx,"property","property")?; text(&property,"name")?; },
                "TAX" => { let (_,property)=get(&tx,"property","property")?; if property["taxConfigured"]!=true { return Err("Configure tax rates before completing this step".into()); } },
                "PAYMENTS" => { let (_,cfg)=get(&tx,"paymentConfig","main")?; let methods=cfg["methods"].as_array().ok_or("Choose at least one payment method")?; if methods.is_empty(){return Err("Choose at least one payment method".into());} },
                "SERVICE_AREAS" => { if list(&tx,"outlets")?.is_empty(){return Err("Create at least one service area".into());} },
                "STOCK_LOCATIONS" => { if list(&tx,"stockLocations")?.is_empty(){return Err("Create at least one stock location".into());} },
                "CATALOG" => { if list(&tx,"products")?.is_empty(){return Err("Create at least one sellable product".into());} },
                "STAFF_ACCESS" => { let admins:i64=tx.query_row("SELECT count(*) FROM staff WHERE active=1 AND role='Admin'",[],|r|r.get(0)).map_err(error)?; if admins<1{return Err("At least one active Admin is required".into());} },
                "TILL" => { get(&tx,"tillPolicy","main")?; },
                "BACKUP_SYNC" => {
                    if meta(&tx,"last_backup")?.is_none(){return Err("Create a successful local backup before completing Backup & synchronization".into());}
                },
                _ => {}
            }
            let (_,mut progress)=get(&tx,"businessSetup","business")?;
            let mut done=progress["completedSteps"].as_array().cloned().unwrap_or_default();
            if !done.iter().any(|v|v==step){done.push(json!(step));}
            progress["completedSteps"]=json!(done.clone());
            progress["currentStep"]=p.get("nextStep").cloned().unwrap_or(json!(step));
            progress["updatedAt"]=json!(now());
            let required=["BUSINESS_IDENTITY","TAX","PAYMENTS","SERVICE_AREAS","STOCK_LOCATIONS","CATALOG","OPENING_INVENTORY","STAFF_ACCESS","TILL","BACKUP_SYNC"];
            if required.iter().all(|required_step|done.iter().any(|v|v==*required_step)){set_meta(&tx,"installation_stage","READY_FOR_GO_LIVE")?;}
            put(&tx,"businessSetup","business",progress,&mut changes)?;
        }
        "setup.goLive" => {
            if user.role!="Admin" { return Err("Owner permission required".into()); }
            let (_,property)=get(&tx,"property","property")?;
            if property["taxConfigured"]!=true { return Err("Tax configuration is missing".into()); }
            let outlets=list(&tx,"outlets")?;
            if outlets.is_empty(){return Err("No active service area configured".into());}
            if list(&tx,"stockLocations")?.is_empty(){return Err("No stock location configured".into());}
            for outlet in &outlets {
                let location=outlet["data"]["defaultStockLocationId"].as_str().map(str::trim).filter(|value|!value.is_empty()).ok_or("Every service area requires a default stock location before Go Live")?;
                get(&tx,"stockLocations",location)?;
            }
            if list(&tx,"products")?.is_empty(){return Err("No products configured".into());}
            if meta(&tx,"last_backup")?.is_none(){return Err("Create and verify a local backup before Go Live".into());}
            get(&tx,"paymentConfig","main")?;
            get(&tx,"tillPolicy","main")?;
            let admins:i64=tx.query_row("SELECT count(*) FROM staff WHERE active=1 AND role='Admin'",[],|r|r.get(0)).map_err(error)?;
            if admins<1{return Err("No active Admin configured".into());}
            let (_,mut progress)=get(&tx,"businessSetup","business")?;
            let done=progress["completedSteps"].as_array().cloned().unwrap_or_default();
            let required=["BUSINESS_IDENTITY","TAX","PAYMENTS","SERVICE_AREAS","STOCK_LOCATIONS","CATALOG","OPENING_INVENTORY","STAFF_ACCESS","TILL","BACKUP_SYNC"];
            let missing:Vec<&str>=required.iter().copied().filter(|s|!done.iter().any(|v|v==*s)).collect();
            if !missing.is_empty(){return Err(format!("Complete required setup steps: {}",missing.join(", ")));}
            progress["completedAt"]=json!(now()); progress["goLiveApprovedAt"]=json!(now()); progress["goLiveApprovedBy"]=json!(user.staff_id); progress["updatedAt"]=json!(now());
            put(&tx,"businessSetup","business",progress,&mut changes)?;
            set_meta(&tx,"installation_stage","LIVE")?;
        }
        "purchaseOrder.create" => {
            if !permissions(&user.role).contains(&"procurement.manage") { return Err("Purchase order management permission required".into()); }
            let supplier_id=text(p,"supplierId")?.to_string();
            let (_,supplier)=get(&tx,"suppliers",&supplier_id)?;
            let requested=p["items"].as_array().ok_or("Add at least one stock item to the purchase order")?;
            if requested.is_empty() || requested.len()>100 { return Err("Purchase orders require between 1 and 100 lines".into()); }
            let mut seen=Vec::<String>::new();
            let mut items=Vec::<Value>::new();
            let mut subtotal_minor=0i64;
            for line in requested {
                let stock_id=text(line,"stockItemId")?.to_string();
                if seen.iter().any(|id|id==&stock_id) { return Err("Each stock item can appear only once on a purchase order".into()); }
                seen.push(stock_id.clone());
                let (_,stock)=get(&tx,"stockItems",&stock_id)?;
                let quantity_ordered=quantity(line,"quantityOrdered")?;
                if quantity_ordered<=0.0 { return Err("Ordered quantities must be greater than zero".into()); }
                let unit_price=quantity(line,"unitPrice")?;
                let line_total=((quantity_ordered*unit_price*100.0).round())/100.0;
                if !line_total.is_finite() || line_total>1_000_000_000.0 { return Err("Purchase order line total is too large".into()); }
                subtotal_minor+=(line_total*100.0).round() as i64;
                let scan_unit=stock["scanUnitQuantity"].as_f64().filter(|value|value.is_finite()&&*value>0.0).unwrap_or(1.0);
                items.push(json!({
                    "stockItemId":stock_id,"stockItemName":stock["name"],"quantityOrdered":quantity_ordered,
                    "quantityDelivered":0,"quantityReceived":0,"quantityRejected":0,"unitPrice":unit_price,
                    "unitSymbol":stock["baseUnit"],"scanUnitQuantity":scan_unit,"lineTotal":line_total
                }));
            }
            if subtotal_minor>100_000_000_000 { return Err("Purchase order total is too large".into()); }
            let order_id=id();
            let po_number=format!("PO-{}",order_id[..8].to_ascii_uppercase());
            let total=subtotal_minor as f64/100.0;
            put(&tx,"purchaseOrders",&order_id,json!({
                "id":order_id,"poNumber":po_number,"supplierId":supplier_id,"supplierName":supplier["name"],
                "propertyId":"property","createdAt":now(),"createdBy":user.staff_id,"createdByName":user.name,
                "approvedBy":user.name,"approvedById":user.staff_id,"approvedAt":now(),"status":"APPROVED",
                "items":items,"subtotal":total,"taxTotal":0,"grandTotal":total
            }),&mut changes)?;
        }
        "purchaseOrder.receive" => {
            let order_id=text(p,"purchaseOrderId")?.to_string();
            authorize(&tx,user,"procurement.receive",p,Some(&order_id))?;
            let (order_version,mut order)=get(&tx,"purchaseOrders",&order_id)?;
            if cmd.target_version!=Some(order_version) { return Err("CONFLICT: Purchase order changed; reload before receiving".into()); }
            if !["APPROVED","PARTIALLY_RECEIVED"].contains(&order["status"].as_str().unwrap_or("")) {
                return Err("Only approved purchase orders with remaining quantities can receive a delivery".into());
            }
            let location_id=text(p,"locationId")?.to_string();
            get(&tx,"stockLocations",&location_id)?;
            let requested=p["lines"].as_array().ok_or("Delivery lines are required")?;
            if requested.is_empty() { return Err("Scan or enter at least one delivered quantity".into()); }
            if requested.len()>100 { return Err("A goods receipt cannot contain more than 100 lines".into()); }
            let mut order_items=order["items"].as_array().cloned().ok_or("Purchase order lines are invalid")?;
            let mut seen=Vec::<String>::new();
            let mut receipt_lines=Vec::<Value>::new();
            let mut accepted_value_minor=0i64;
            let mut over_received=false;
            let mut has_delivered=false;
            for line in requested {
                let stock_id=text(&line,"stockItemId")?.to_string();
                if seen.iter().any(|id|id==&stock_id) { return Err("A stock item can be received only once per GRN".into()); }
                seen.push(stock_id.clone());
                let index=order_items.iter().position(|item|item["stockItemId"].as_str()==Some(stock_id.as_str())).ok_or("A delivered stock item is not on this purchase order")?;
                let delivered=quantity(&line,"quantityDelivered")?;
                let accepted=quantity(&line,"quantityAccepted")?;
                let rejected=quantity(&line,"quantityRejected")?;
                if delivered<=0.0 { continue; }
                has_delivered=true;
                if (accepted+rejected-delivered).abs()>0.000001 { return Err("Delivered quantity must equal accepted plus rejected quantity".into()); }
                let rejection_reason=line.get("rejectionReason").and_then(Value::as_str).unwrap_or("").trim();
                if rejected>0.0 && rejection_reason.is_empty() { return Err("Enter a reason for every rejected delivery quantity".into()); }
                let ordered=quantity(&order_items[index],"quantityOrdered")?;
                let previously_accepted=order_items[index]["quantityReceived"].as_f64().unwrap_or(0.0);
                let previously_delivered=order_items[index]["quantityDelivered"].as_f64().unwrap_or(0.0);
                let previously_rejected=order_items[index]["quantityRejected"].as_f64().unwrap_or(0.0);
                if previously_accepted+accepted>ordered+0.000001 { over_received=true; }
                let unit_price=quantity(&order_items[index],"unitPrice")?;
                let raw_line_value=accepted*unit_price;
                if !raw_line_value.is_finite() || raw_line_value>1_000_000_000.0 { return Err("Accepted receipt value is too large".into()); }
                let line_value=(raw_line_value*100.0).round() as i64;
                accepted_value_minor+=line_value;
                order_items[index]["quantityDelivered"]=json!(previously_delivered+delivered);
                order_items[index]["quantityReceived"]=json!(previously_accepted+accepted);
                order_items[index]["quantityRejected"]=json!(previously_rejected+rejected);
                receipt_lines.push(json!({
                    "stockItemId":stock_id,"stockItemName":order_items[index]["stockItemName"],
                    "quantityDelivered":delivered,"quantityAccepted":accepted,"quantityRejected":rejected,
                    "unitSymbol":order_items[index]["unitSymbol"],"unitCost":unit_price,
                    "acceptedValue":line_value as f64/100.0,"rejectionReason":rejection_reason
                }));
            }
            if !has_delivered || receipt_lines.is_empty() { return Err("Enter a positive delivered quantity for at least one purchase order item".into()); }
            if over_received { require_separate_approval(&tx,user,"procurement.over_receive",p,&order_id)?; }
            let receipt_id=id();
            let grn_number=format!("GRN-{}",receipt_id[..8].to_ascii_uppercase());
            let supplier_id=text(&order,"supplierId")?.to_string();
            let invoice_reference=p.get("supplierInvoiceNumber").and_then(Value::as_str).unwrap_or("").trim().to_string();
            let delivery_note=p.get("deliveryNote").and_then(Value::as_str).unwrap_or("").trim().to_string();
            let receipt_time=now();
            put(&tx,"goodsReceipts",&receipt_id,json!({
                "id":receipt_id,"grnNumber":grn_number,"purchaseOrderId":order_id,"poNumber":order["poNumber"],
                "supplierId":supplier_id,"supplierName":order["supplierName"],"locationId":location_id,
                "supplierInvoiceNumber":invoice_reference,"deliveryNote":delivery_note,"notes":p.get("notes"),
                "lines":receipt_lines,"receivedAt":receipt_time,"receivedBy":user.staff_id,"receivedByName":user.name,
                "acceptedValue":accepted_value_minor as f64/100.0,"status":"POSTED"
            }),&mut changes)?;

            for line in &receipt_lines {
                let accepted=line["quantityAccepted"].as_f64().unwrap_or(0.0);
                if accepted<=0.0 { continue; }
                let stock_id=text(line,"stockItemId")?.to_string();
                let unit_cost=line["unitCost"].as_f64().unwrap_or(0.0);
                let (_,mut stock)=get(&tx,"stockItems",&stock_id)?;
                let stock_total=stock["currentStock"].as_object().map(|locations|locations.values().map(|value|value.as_f64().unwrap_or(0.0)).sum::<f64>()).unwrap_or(0.0);
                let old_cost=stock["averageUnitCost"].as_f64().unwrap_or(0.0);
                let next_cost=if stock_total+accepted>0.0 { ((stock_total*old_cost+accepted*unit_cost)/(stock_total+accepted)*1_000_000.0).round()/1_000_000.0 } else { unit_cost };
                stock["averageUnitCost"]=json!(next_cost);
                put(&tx,"stockItems",&stock_id,stock,&mut changes)?;
                let inventory_receipt_id=id();
                put(&tx,"inventoryReceipts",&inventory_receipt_id,json!({
                    "id":inventory_receipt_id,"goodsReceiptId":receipt_id,"purchaseOrderId":order_id,
                    "stockItemId":stock_id,"locationId":location_id,"quantity":accepted,"unitCost":unit_cost,
                    "supplierId":supplier_id,"reference":grn_number,"supplierInvoiceNumber":invoice_reference,
                    "receivedAt":receipt_time,"receivedBy":user.staff_id
                }),&mut changes)?;
                stock_delta_with_cost(&tx,user,&stock_id,&location_id,accepted,"PURCHASE_RECEIPT",&receipt_id,&grn_number,Some(unit_cost),&mut changes)?;
            }

            if accepted_value_minor>0 {
                let payable_id=id();
                put(&tx,"supplierPayables",&payable_id,json!({
                    "id":payable_id,"payableNumber":format!("AP-{}",payable_id[..8].to_ascii_uppercase()),
            "supplierId":supplier_id,"supplierName":order["supplierName"],"purchaseOrderId":order_id,
            "goodsReceiptId":receipt_id,"grnNumber":grn_number,"supplierInvoiceNumber":invoice_reference,
                    "amount":accepted_value_minor as f64/100.0,"paidAmount":0,"amountDue":accepted_value_minor as f64/100.0,"status":"RECEIVED_UNINVOICED",
                    "basis":"Accepted quantities at approved purchase-order cost","createdAt":receipt_time
                }),&mut changes)?;
                let journal_id=id();
                let amount=accepted_value_minor as f64/100.0;
                put(&tx,"journalEntries",&journal_id,json!({
                    "id":journal_id,"entryNumber":format!("JE-{}",journal_id[..8].to_ascii_uppercase()),
                    "propertyId":"property","occurredAt":receipt_time,"postedAt":receipt_time,
                    "sourceType":"SUPPLIER_RECEIPT","sourceId":receipt_id,"memo":format!("Accepted goods received from {} ({grn_number})",order["supplierName"]),
                    "lines":[
                        {"id":id(),"accountId":"INVENTORY","accountCode":"1400","accountName":"Inventory","debit":amount,"credit":0,"debitMinor":accepted_value_minor,"creditMinor":0},
                        {"id":id(),"accountId":"ACCOUNTS_PAYABLE","accountCode":"2000","accountName":"Accounts payable","debit":0,"credit":amount,"debitMinor":0,"creditMinor":accepted_value_minor}
                    ],"totalDebit":amount,"totalCredit":amount,"balanced":true
                }),&mut changes)?;
            }

            let fully_received=order_items.iter().all(|item|item["quantityReceived"].as_f64().unwrap_or(0.0)+0.000001>=item["quantityOrdered"].as_f64().unwrap_or(0.0));
            let any_delivered=order_items.iter().any(|item|item["quantityDelivered"].as_f64().unwrap_or(0.0)>0.0);
            order["items"]=json!(order_items);
            order["status"]=json!(if fully_received{"RECEIVED"}else if any_delivered{"PARTIALLY_RECEIVED"}else{"APPROVED"});
            order["lastGoodsReceiptId"]=json!(receipt_id);
            order["lastGoodsReceiptAt"]=json!(receipt_time);
            put(&tx,"purchaseOrders",&order_id,order,&mut changes)?;
        }
        "supplierPayable.matchInvoice" => {
            if !permissions(&user.role).contains(&"procurement.manage") { return Err("Supplier invoice matching permission required".into()); }
            let payable_id=text(p,"payableId")?.to_string();
            let (payable_version,mut payable)=get(&tx,"supplierPayables",&payable_id)?;
            if cmd.target_version!=Some(payable_version) { return Err("CONFLICT: Payable changed; reload before matching the invoice".into()); }
            if payable["status"]!="RECEIVED_UNINVOICED" { return Err("This payable is already matched or settled".into()); }
            let invoice_number=text(p,"invoiceNumber")?.trim().to_string();
            if invoice_number.len()>80 { return Err("Supplier invoice number cannot exceed 80 characters".into()); }
            let invoice_total=money(p,"invoiceAmount")?;
            let invoice_date=p.get("invoiceDate").and_then(Value::as_str).unwrap_or("").trim();
            if !invoice_date.is_empty() && chrono::NaiveDate::parse_from_str(invoice_date,"%Y-%m-%d").is_err() { return Err("Invoice date must use YYYY-MM-DD".into()); }
            let due_date=p.get("dueDate").and_then(Value::as_str).unwrap_or("").trim();
            if !due_date.is_empty() && chrono::NaiveDate::parse_from_str(due_date,"%Y-%m-%d").is_err() { return Err("Invoice due date must use YYYY-MM-DD".into()); }
            if !invoice_date.is_empty() && !due_date.is_empty() && due_date<invoice_date { return Err("Invoice due date cannot be earlier than invoice date".into()); }
            let supplier_id=text(&payable,"supplierId")?;
            let duplicate_invoice=list(&tx,"supplierPayables")?.iter().any(|record| {
                record["id"].as_str()!=Some(payable_id.as_str()) &&
                record["data"]["supplierId"].as_str()==Some(supplier_id) &&
                record["data"]["supplierInvoiceNumber"].as_str().map(|value|value.trim().to_lowercase())==Some(invoice_number.to_lowercase())
            });
            if duplicate_invoice { return Err("This supplier invoice number is already assigned to another receipt".into()); }
            let receipt_id=text(&payable,"goodsReceiptId")?;
            let (_,receipt)=get(&tx,"goodsReceipts",receipt_id)?;
            let order_id=text(&payable,"purchaseOrderId")?.to_string();
            let (_,mut order)=get(&tx,"purchaseOrders",&order_id)?;
            let expected_lines=receipt["lines"].as_array().ok_or("Goods receipt lines are invalid")?;
            let billed_lines=p["lines"].as_array().ok_or("Enter invoice line quantities and prices")?;
            if billed_lines.is_empty() || billed_lines.len()>100 { return Err("Invoice must contain between 1 and 100 matched lines".into()); }
            let mut seen=Vec::<String>::new();
            let mut invoice_line_total=0i64;
            for billed in billed_lines {
                let stock_id=text(billed,"stockItemId")?.to_string();
                if seen.iter().any(|id|id==&stock_id) { return Err("A stock item can appear only once on an invoice match".into()); }
                seen.push(stock_id.clone());
                let expected=expected_lines.iter().find(|line|line["stockItemId"].as_str()==Some(stock_id.as_str()) && line["quantityAccepted"].as_f64().unwrap_or(0.0)>0.0).ok_or("Invoice line is not an accepted line on this GRN")?;
                let quantity_billed=quantity(billed,"quantityBilled")?;
                let expected_quantity=expected["quantityAccepted"].as_f64().unwrap_or(0.0);
                if (quantity_billed-expected_quantity).abs()>0.000001 { return Err(format!("Invoice quantity for {} does not match accepted GRN quantity {}",expected["stockItemName"].as_str().unwrap_or("item"),expected_quantity)); }
                let invoice_unit_price=quantity(billed,"unitPrice")?;
                let agreed_unit_price=expected["unitCost"].as_f64().unwrap_or(0.0);
                if (invoice_unit_price-agreed_unit_price).abs()>0.000001 { return Err(format!("Invoice unit cost for {} does not match the approved PO cost",expected["stockItemName"].as_str().unwrap_or("item"))); }
                let raw_line_total=quantity_billed*invoice_unit_price;
                if !raw_line_total.is_finite() || raw_line_total>1_000_000_000.0 { return Err("Invoice line total is too large".into()); }
                invoice_line_total+=(raw_line_total*100.0).round() as i64;
            }
            let accepted_lines=expected_lines.iter().filter(|line|line["quantityAccepted"].as_f64().unwrap_or(0.0)>0.0).count();
            if billed_lines.len()!=accepted_lines { return Err("Invoice must account for every accepted GRN line and no rejected quantity".into()); }
            let payable_total=money(&payable,"amount")?;
            if invoice_line_total!=invoice_total || invoice_total!=payable_total { return Err(format!("Invoice line total must equal the accepted GRN payable of KES {:.2}; mismatch prevents payment",payable_total as f64/100.0)); }
            payable["supplierInvoiceNumber"]=json!(invoice_number);
            payable["invoiceAmount"]=json!(invoice_total as f64/100.0);
            payable["invoiceDate"]=json!(invoice_date);
            payable["dueDate"]=json!(due_date);
            payable["invoiceMatchedAt"]=json!(now());
            payable["invoiceMatchedBy"]=json!(user.staff_id);
            payable["invoiceMatchedByName"]=json!(user.name);
            payable["status"]=json!("MATCHED_UNPAID");
            put(&tx,"supplierPayables",&payable_id,payable,&mut changes)?;
            let all_grns_matched=list(&tx,"supplierPayables")?.iter().filter(|record|record["data"]["purchaseOrderId"].as_str()==Some(order_id.as_str())).all(|record|record["data"]["status"].as_str().is_some_and(|status|["MATCHED_UNPAID","PARTIALLY_PAID","PAID"].contains(&status)));
            if order["status"]=="RECEIVED" && all_grns_matched {
                order["status"]=json!("INVOICED");
                put(&tx,"purchaseOrders",&order_id,order,&mut changes)?;
            }
        }
        "supplierPayable.pay" => {
            if !permissions(&user.role).contains(&"procurement.pay") { return Err("Supplier payment permission required".into()); }
            let payable_id=text(p,"payableId")?.to_string();
            let (payable_version,mut payable)=get(&tx,"supplierPayables",&payable_id)?;
            if cmd.target_version!=Some(payable_version) { return Err("CONFLICT: Payable changed; reload before recording payment".into()); }
            if !["MATCHED_UNPAID","PARTIALLY_PAID"].contains(&payable["status"].as_str().unwrap_or("")) { return Err("Match the supplier invoice to its PO and GRN before paying this payable".into()); }
            if p["confirmed"]!=true { return Err("Confirm the supplier was actually paid before recording settlement".into()); }
            let amount=money(p,"amount")?;
            if amount<=0 { return Err("Payment amount must be positive".into()); }
            let amount_due=payable["amountDue"].as_f64().unwrap_or_else(||payable["amount"].as_f64().unwrap_or(0.0)-payable["paidAmount"].as_f64().unwrap_or(0.0));
            let amount_due_minor=(amount_due*100.0).round() as i64;
            if amount>amount_due_minor { return Err("Payment cannot exceed the outstanding payable balance".into()); }
            let method=text(p,"method")?;
            let (account_id,account_code,account_name)=match method {
                "CASH"=>("PETTY_CASH","1015","Petty cash outside POS till"),
                "BANK"=>("BANK","1010","Bank"),
                "MPESA"=>("MPESA","1020","Business M-Pesa"),
                _=>return Err("Choose CASH, BANK or MPESA for the manually confirmed supplier payment".into())
            };
            let reference=text(p,"reference")?.trim().to_string();
            if reference.len()>100 { return Err("Payment reference cannot exceed 100 characters".into()); }
            let duplicate_reference=list(&tx,"supplierPayments")?.iter().any(|record|record["data"]["method"].as_str()==Some(method) && record["data"]["reference"].as_str().map(|value|value.trim().to_lowercase())==Some(reference.to_lowercase()));
            if duplicate_reference { return Err("This supplier payment reference has already been recorded".into()); }
            let reason=text(p,"reason")?.trim().to_string();
            let payment_id=id();
            let stamp=now();
            let supplier_name=payable["supplierName"].as_str().unwrap_or("Supplier");
            put(&tx,"supplierPayments",&payment_id,json!({
                "id":payment_id,"paymentNumber":format!("SP-{}",&payment_id[..8].to_ascii_uppercase()),
                "supplierId":payable["supplierId"],"supplierName":supplier_name,"supplierPayableId":payable_id,
                "supplierInvoiceNumber":payable["supplierInvoiceNumber"],"amount":amount as f64/100.0,
                "method":method,"reference":reference,"reason":reason,"status":"MANUALLY_CONFIRMED",
                "confirmed":true,"occurredAt":stamp,"recordedBy":user.staff_id,"recordedByName":user.name
            }),&mut changes)?;
            let journal_id=id();
            put(&tx,"journalEntries",&journal_id,json!({
                "id":journal_id,"entryNumber":format!("JE-{}",&journal_id[..8].to_ascii_uppercase()),
                "propertyId":"property","occurredAt":stamp,"postedAt":stamp,"sourceType":"SUPPLIER_PAYMENT",
                "sourceId":payment_id,"memo":format!("Manually confirmed {} payment to {}",method,supplier_name),
                "lines":[
                    {"id":id(),"accountId":"ACCOUNTS_PAYABLE","accountCode":"2000","accountName":"Accounts payable","debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0},
                    {"id":id(),"accountId":account_id,"accountCode":account_code,"accountName":account_name,"debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount}
                ],"totalDebit":amount as f64/100.0,"totalCredit":amount as f64/100.0,"balanced":true
            }),&mut changes)?;
            let paid_before=payable["paidAmount"].as_f64().unwrap_or(0.0);
            let paid_after=((paid_before*100.0).round() as i64+amount) as f64/100.0;
            let remaining=amount_due_minor-amount;
            payable["paidAmount"]=json!(paid_after);
            payable["amountDue"]=json!(remaining as f64/100.0);
            payable["status"]=json!(if remaining==0 {"PAID"} else {"PARTIALLY_PAID"});
            payable["lastPaymentAt"]=json!(stamp);
            put(&tx,"supplierPayables",&payable_id,payable,&mut changes)?;
        }
        "inventory.openingBalance" | "inventory.receive" | "inventory.adjust" | "inventory.waste" | "inventory.transfer" => {
            let permission=match cmd.operation.as_str(){"inventory.receive"=>"inventory.receive","inventory.transfer"=>"inventory.transfer","inventory.waste"=>"inventory.waste","inventory.adjust"=>"inventory.count",_=>"inventory.adjust"};
            if !permissions(&user.role).contains(&permission){return Err(format!("Permission required: {permission}"));}
            let stock_id=text(p,"stockItemId")?;
            let location=text(p,"locationId")?;
            get(&tx,"stockLocations",location)?;
            let (_,stock)=get(&tx,"stockItems",stock_id)?;
            let current=stock["currentStock"][location].as_f64().unwrap_or(0.0);
            if cmd.operation=="inventory.openingBalance" {
                if installation_stage(&tx)?=="LIVE" { return Err("Opening balances are only available during setup".into()); }
                let counted=quantity(p,"quantity")?;
                stock_delta(&tx,user,stock_id,location,counted-current,"OPENING_BALANCE",&cmd.id,p.get("reason").and_then(Value::as_str).unwrap_or("Opening balance"),&mut changes)?;
            } else if cmd.operation=="inventory.receive" {
                let qty=quantity(p,"quantity")?; if qty<=0.0{return Err("Quantity must be positive".into());}
                let unit_cost=money(p,"unitCost")? as f64/100.0;
                let (_,mut fresh)=get(&tx,"stockItems",stock_id)?;
                let total_existing=fresh["currentStock"].as_object().map(|o|o.values().map(|v|v.as_f64().unwrap_or(0.0)).sum::<f64>()).unwrap_or(0.0);
                let old_cost=fresh["averageUnitCost"].as_f64().unwrap_or(0.0);
                let next_cost=if total_existing+qty>0.0{((total_existing*old_cost+qty*unit_cost)/(total_existing+qty)*1_000_000.0).round()/1_000_000.0}else{unit_cost};
                fresh["averageUnitCost"]=json!(next_cost);
                put(&tx,"stockItems",stock_id,fresh,&mut changes)?;
                let reference=p.get("reference").and_then(Value::as_str).filter(|s|!s.trim().is_empty()).or_else(||p.get("invoiceReference").and_then(Value::as_str).filter(|s|!s.trim().is_empty())).or_else(||p.get("deliveryNote").and_then(Value::as_str).filter(|s|!s.trim().is_empty())).ok_or("Receipt reference, invoice reference or delivery note is required")?.to_string();
                stock_delta_with_cost(&tx,user,stock_id,location,qty,"RECEIPT",&cmd.id,&reference,Some(unit_cost),&mut changes)?;
                let receipt_id=id();
                put(&tx,"inventoryReceipts",&receipt_id,json!({"id":receipt_id,"stockItemId":stock_id,"locationId":location,"quantity":qty,"unitCost":unit_cost,"supplierId":p.get("supplierId"),"deliveryNote":p.get("deliveryNote"),"invoiceReference":p.get("invoiceReference"),"reference":reference,"receivedAt":now(),"receivedBy":user.staff_id}),&mut changes)?;
            } else if cmd.operation=="inventory.adjust" {
                let counted=quantity(p,"countedQty")?;
                stock_delta(&tx,user,stock_id,location,counted-current,"COUNT_ADJUSTMENT",&cmd.id,text(p,"reason")?,&mut changes)?;
            } else {
                let qty=quantity(p,"quantity")?; if qty==0.0{return Err("Quantity must be positive".into());}
                if cmd.operation=="inventory.transfer" {
                    let target=text(p,"toLocationId")?; if target==location{return Err("Choose a different destination".into());} get(&tx,"stockLocations",target)?;
                    stock_delta(&tx,user,stock_id,location,-qty,"TRANSFER_OUT",&cmd.id,text(p,"reason")?,&mut changes)?;
                    stock_delta(&tx,user,stock_id,target,qty,"TRANSFER_IN",&cmd.id,text(p,"reason")?,&mut changes)?;
                } else {
                    stock_delta(&tx,user,stock_id,location,-qty,"WASTE",&cmd.id,text(p,"reason")?,&mut changes)?;
                }
            }
        }
        "staff.create" => {
            if !permissions(&user.role).contains(&"staff.create") { return Err("Staff administration permission required".into()); }
            let role=text(p,"role")?; if !["Admin","Manager","Server"].contains(&role){return Err("Invalid role".into());}
            if role=="Admin" && user.role!="Admin" {return Err("Only an Admin can create another Admin".into());}
            let staff_id=id(); let name=text(p,"name")?; let hash=hash_pin(text(p,"pin")?)?;
            tx.execute("INSERT INTO staff(id,name,role,pin_hash) VALUES(?,?,?,?)",params![staff_id,name,role,hash]).map_err(error)?;
            put(&tx,"employees",&staff_id,json!({"id":staff_id,"name":name,"jobTitle":p.get("jobTitle").and_then(Value::as_str).unwrap_or("Bar Operator"),"role":role,"status":"ACTIVE","phone":p.get("phone").and_then(Value::as_str).unwrap_or(""),"email":p.get("email").and_then(Value::as_str).unwrap_or("")}),&mut changes)?;
        }
        "staff.update" => {
            if !permissions(&user.role).contains(&"staff.update") { return Err("Staff administration permission required".into()); }
            let staff_id=text(p,"staffId")?;
            let name=text(p,"name")?;
            tx.execute("UPDATE staff SET name=? WHERE id=? AND active=1",params![name,staff_id]).map_err(error)?;
            let (_,mut employee)=get(&tx,"employees",staff_id)?; employee["name"]=json!(name);
            for key in ["jobTitle","phone","email"] { if let Some(v)=p.get(key){employee[key]=v.clone();} }
            put(&tx,"employees",staff_id,employee,&mut changes)?;
        }
        "staff.resetPin" => {
            if !permissions(&user.role).contains(&"staff.reset_pin") { return Err("Staff administration permission required".into()); }
            let staff_id=text(p,"staffId")?; let hash=hash_pin(text(p,"pin")?)?;
            tx.execute("UPDATE staff SET pin_hash=?,failures=0,locked_until=0 WHERE id=? AND active=1",params![hash,staff_id]).map_err(error)?;
            tx.execute("DELETE FROM sessions WHERE staff_id=?",[staff_id]).map_err(error)?;
        }
        "staff.changeRole" => {
            if user.role!="Admin" { return Err("Owner permission required".into()); }
            let staff_id=text(p,"staffId")?; let role=text(p,"role")?; if !["Admin","Manager","Server"].contains(&role){return Err("Invalid role".into());}
            let current:String=tx.query_row("SELECT role FROM staff WHERE id=? AND active=1",[staff_id],|r|r.get(0)).map_err(|_|"Active staff member not found")?;
            if current=="Admin" && role!="Admin" { let admins:i64=tx.query_row("SELECT count(*) FROM staff WHERE active=1 AND role='Admin'",[],|r|r.get(0)).map_err(error)?; if admins<=1{return Err("The final active Admin cannot be demoted".into());} }
            tx.execute("UPDATE staff SET role=? WHERE id=?",params![role,staff_id]).map_err(error)?; tx.execute("DELETE FROM sessions WHERE staff_id=?",[staff_id]).map_err(error)?;
            let (_,mut employee)=get(&tx,"employees",staff_id)?; employee["role"]=json!(role); put(&tx,"employees",staff_id,employee,&mut changes)?;
        }
        "staff.deactivate" => {
            if !permissions(&user.role).contains(&"staff.deactivate") { return Err("Staff administration permission required".into()); }
            let staff_id=text(p,"staffId")?; let current:String=tx.query_row("SELECT role FROM staff WHERE id=? AND active=1",[staff_id],|r|r.get(0)).map_err(|_|"Active staff member not found")?;
            if current=="Admin" { let admins:i64=tx.query_row("SELECT count(*) FROM staff WHERE active=1 AND role='Admin'",[],|r|r.get(0)).map_err(error)?; if admins<=1{return Err("The final active Admin cannot be deactivated".into());} }
            tx.execute("UPDATE staff SET active=0 WHERE id=?",[staff_id]).map_err(error)?; tx.execute("DELETE FROM sessions WHERE staff_id=?",[staff_id]).map_err(error)?;
            let (_,mut employee)=get(&tx,"employees",staff_id)?; employee["status"]=json!("INACTIVE"); employee["deactivatedAt"]=json!(now()); employee["deactivatedBy"]=json!(user.staff_id); put(&tx,"employees",staff_id,employee,&mut changes)?;
        }
        "till.open" => {
            if !permissions(&user.role).contains(&"till.open") { return Err("Till opening permission required".into()); }
            if list(&tx, "tillSessions")?
                .iter()
                .any(|v| v["data"]["status"] == "OPEN")
            {
                return Err("A till is already open".into());
            }
            let float = money(p, "floatAmount")?;
            let till_id = id();
            put(
                &tx,
                "tillSessions",
                &till_id,
                json!({"id":till_id,"terminalId":meta(&tx,"terminal_id")?,"terminalName":"POS terminal","employeeId":user.staff_id,"employeeName":user.name,"openedAt":now(),"openingFloat":float as f64/100.0,"cashSalesTotal":0,"cashPaidIn":0,"cashPaidOut":0,"expectedCashInDrawer":float as f64/100.0,"status":"OPEN"}),
                &mut changes,
            )?;
        }
        "floorplan.save" => {
            if !permissions(&user.role).contains(&"floorplan.manage") { return Err("Floorplan management permission required".into()); }
            let outlet_id = text(p, "outletId")?;
            get(&tx, "outlets", outlet_id)?;
            let baseline = p["baseline"]
                .as_array()
                .ok_or("Layout baseline is required")?;
            let tables = p["tables"]
                .as_array()
                .filter(|v| v.len() <= 500)
                .ok_or("Use at most 500 tables per outlet")?;
            let current: Vec<Value> = list(&tx, "tables")?
                .into_iter()
                .filter(|v| v["data"]["outletId"] == outlet_id)
                .collect();
            if baseline.len() != current.len()
                || current.iter().any(|r| {
                    !baseline
                        .iter()
                        .any(|b| b["id"] == r["id"] && b["version"] == r["version"])
                })
            {
                return Err("Layout changed; reopen the designer before saving".into());
            }
            let mut ids = std::collections::HashSet::new();
            let mut labels = std::collections::HashSet::new();
            for table in tables {
                let key = text(table, "id")?;
                if !current.iter().any(|r| r["id"] == key) && Uuid::parse_str(key).is_err() {
                    return Err("New table IDs must be UUIDs".into());
                }
                if !ids.insert(key.to_string())
                    || !labels.insert(text(table, "label")?.trim().to_lowercase())
                {
                    return Err("Table IDs and labels must be unique within the outlet".into());
                }
                if table["capacity"]
                    .as_u64()
                    .filter(|n| *n > 0 && *n <= 1000)
                    .is_none()
                {
                    return Err("Table capacity must be between 1 and 1000".into());
                }
                for axis in ["posX", "posY"] {
                    if quantity(table, axis)? > 100.0 {
                        return Err("Layout coordinates must be between 0 and 100".into());
                    }
                }
                if !["SQUARE", "RECTANGLE", "ROUND", "BAR_TOP"].contains(&text(table, "shape")?) {
                    return Err("Invalid table shape".into());
                }
                text(table, "section")?;
                money(table, "minimumSpend")?;
                let archived: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM records WHERE collection='tables' AND id=? AND archived=1)", [key], |r| r.get(0)).map_err(error)?;
                if archived {
                    return Err("Archived table IDs cannot be reused".into());
                }
                let prior = get(&tx, "tables", key).ok();
                if prior.is_some() && !current.iter().any(|r| r["id"] == key) {
                    return Err("Table belongs to another outlet".into());
                }
                let mut data = prior
                    .as_ref()
                    .map(|(_, v)| v.clone())
                    .unwrap_or(json!({"state":"AVAILABLE","currentOrderId":null}));
                let assigned = table["assignedServerId"].as_str().unwrap_or("");
                if !assigned.is_empty() {
                    let name: String = tx
                        .query_row(
                            "SELECT name FROM staff WHERE id=? AND active=1",
                            [assigned],
                            |r| r.get(0),
                        )
                        .map_err(|_| "Assigned staff member is unavailable")?;
                    data["assignedServerId"] = json!(assigned);
                    data["assignedServerName"] = json!(name);
                } else {
                    data["assignedServerId"] = Value::Null;
                    data["assignedServerName"] = json!("Unassigned");
                }
                for field in [
                    "label",
                    "capacity",
                    "section",
                    "shape",
                    "posX",
                    "posY",
                    "minimumSpend",
                    "isJoinable",
                ] {
                    data[field] = table[field].clone();
                }
                data["id"] = json!(key);
                data["propertyId"] = json!("property");
                data["outletId"] = json!(outlet_id);
                put(&tx, "tables", key, data, &mut changes)?;
            }
            for record in current {
                let key = text(&record, "id")?;
                if !ids.contains(key) {
                    if record["data"]["currentOrderId"].as_str().is_some() {
                        return Err("Cannot remove a table with an active order".into());
                    }
                    tx.execute("UPDATE records SET archived=1,version=version+1 WHERE collection='tables' AND id=?", [key]).map_err(error)?;
                    changes.push(json!({"collection":"tables","id":key,"version":record["version"].as_i64().unwrap()+1,"data":record["data"],"archived":true}));
                }
            }
        }
        "table.ready" => {
            let key = text(p, "tableId")?;
            let (version, mut table) = get(&tx, "tables", key)?;
            if cmd.target_version != Some(version) {
                return Err("Table changed; refresh and try again".into());
            }
            if table["state"] != "CLEANING" || table["currentOrderId"].as_str().is_some() {
                return Err(
                    "Only an unoccupied table awaiting cleaning can be marked ready".into(),
                );
            }
            table["state"] = json!("AVAILABLE");
            table["cleanedAt"] = json!(now());
            table["cleanedBy"] = json!(user.staff_id);
            put(&tx, "tables", key, table, &mut changes)?;
        }
        "order.create" => {
            if !permissions(&user.role).contains(&"pos.open_tab") { return Err("POS permission required".into()); }
            let order_id=id();
            let outlet_id=text(p,"outletId")?;
            get(&tx,"outlets",outlet_id)?;
            let customer_id=p.get("customerId").and_then(Value::as_str).map(str::trim).filter(|value|!value.is_empty());
            let customer=if let Some(customer_id)=customer_id { Some(get(&tx,"customers",customer_id)?.1) } else { None };
            let table_id=p.get("tableId").and_then(Value::as_str);
            let mut table=None;
            if let Some(t)=table_id {
                let (_,mut value)=get(&tx,"tables",t)?;
                if value["currentOrderId"].as_str().is_some(){return Err("Table already has an order".into());}
                if value["state"]!="AVAILABLE"{return Err("Table is not ready for seating".into());}
                if value["outletId"]!=outlet_id{return Err("Select a table in the current outlet".into());}
                value["currentOrderId"]=json!(order_id); value["state"]=json!("ORDERING"); table=Some((t.to_string(),value));
            }
            let requested_name=p.get("name").and_then(Value::as_str).map(str::trim).filter(|value|!value.is_empty());
            let tab_name=requested_name.or_else(||customer.as_ref().and_then(|value|value["name"].as_str())).unwrap_or("Walk-in");
            put(&tx,"orders",&order_id,json!({
                "id":order_id,"orderNumber":format!("ORD-{}",&order_id[..8]),"propertyId":"property","outletId":outlet_id,
                "tableId":table_id,"tableName":table.as_ref().and_then(|(_,v)|v.get("label")),"customerId":customer_id,
                "customerName":customer.as_ref().and_then(|value|value["name"].as_str()),"tabName":tab_name,
                "items":[],"currentRoundNo":1,"state":"OPEN","subtotal":0,"discountTotal":0,"taxTotal":0,"cateringLevyTotal":0,
                "grandTotal":0,"amountPaid":0,"createdAt":now(),"serverEmployeeId":user.staff_id,"serverName":user.name,
                "terminalId":meta(&tx,"terminal_id")?
            }),&mut changes)?;
            if let Some((key,value))=table{put(&tx,"tables",&key,value,&mut changes)?;}
        }
        "order.addItem" | "order.updateItem" | "order.removeItem" | "order.fire" | "order.kds" | "order.repeatRound" | "order.discount" | "order.compItem" => {
            let order_id=text(p,"orderId")?;
            let (_,mut order)=get(&tx,"orders",order_id)?;
            if ["COMPLETED","VOIDED"].contains(&order["state"].as_str().unwrap_or("")){return Err("Order is closed".into());}
            if order["amountPaid"].as_f64().unwrap_or(0.0)>0.0 && ["order.addItem","order.updateItem","order.removeItem","order.repeatRound","order.discount","order.compItem"].contains(&cmd.operation.as_str()){return Err("Partially paid orders cannot be edited".into());}
            if cmd.operation=="order.addItem" {
                let product_id=text(p,"productId")?;
                let mut input=p.clone();
                if input.get("roundNo").is_none(){input["roundNo"]=order["currentRoundNo"].clone();}
                let item=build_order_item(&tx,product_id,&input,None)?;
                order["items"].as_array_mut().ok_or("Invalid order items")?.push(item);
            } else if cmd.operation=="order.repeatRound" {
                if !permissions(&user.role).contains(&"pos.sell"){return Err("POS permission required".into());}
                let current_round=order["currentRoundNo"].as_i64().unwrap_or(1).max(1);
                let last_round=(current_round-1).max(1);
                let source_items=order["items"].as_array().ok_or("Invalid order items")?.iter()
                    .filter(|item|item["roundNo"].as_i64().unwrap_or(1)==last_round && item["stockFired"]==true && item["state"]!="VOIDED")
                    .cloned().collect::<Vec<_>>();
                if source_items.is_empty(){return Err("No fired round is available to repeat".into());}
                let mut copies=Vec::new();
                for source in source_items {
                    let product_id=text(&source,"productId")?.to_string();
                    let mut input=json!({
                        "quantity":source["quantity"],"roundNo":current_round,"courseName":source["courseName"],
                        "seatLabel":source["seatLabel"],"note":source["note"],
                        "modifierIds":source["modifiers"].as_array().cloned().unwrap_or_default().iter().filter_map(|modifier|modifier["id"].as_str()).collect::<Vec<_>>()
                    });
                    if let Some(portion)=source["portionSnapshot"]["id"].as_str(){input["portionId"]=json!(portion);}
                    copies.push(build_order_item(&tx,&product_id,&input,None)?);
                }
                order["items"].as_array_mut().ok_or("Invalid order items")?.extend(copies);
            } else if cmd.operation=="order.updateItem" {
                let item_id=text(p,"itemId")?;
                let items=order["items"].as_array_mut().ok_or("Invalid order items")?;
                let index=items.iter().position(|i|i["id"]==item_id).ok_or("Item not found")?;
                if items[index]["stockFired"]==true{return Err("Fired items cannot be repriced or reconfigured".into());}
                let product_id=items[index]["productId"].as_str().ok_or("Invalid item product")?.to_string();
                let mut merged=p.clone();
                if merged.get("seatLabel").is_none(){merged["seatLabel"]=items[index]["seatLabel"].clone();}
                if merged.get("courseName").is_none(){merged["courseName"]=items[index]["courseName"].clone();}
                if merged.get("note").is_none(){merged["note"]=items[index]["note"].clone();}
                if merged.get("quantity").is_none(){merged["quantity"]=items[index]["quantity"].clone();}
                if merged.get("roundNo").is_none(){merged["roundNo"]=items[index]["roundNo"].clone();}
                if merged.get("portionId").is_none(){if let Some(id)=items[index]["portionSnapshot"]["id"].as_str(){merged["portionId"]=json!(id);}}
                if merged.get("modifierIds").is_none(){merged["modifierIds"]=json!(items[index]["modifiers"].as_array().cloned().unwrap_or_default().iter().filter_map(|m|m["id"].as_str()).collect::<Vec<_>>());}
                let item=build_order_item(&tx,&product_id,&merged,Some(item_id))?;
                items[index]=item;
            } else if cmd.operation=="order.removeItem" {
                let item_id=text(p,"itemId")?; let items=order["items"].as_array_mut().ok_or("Invalid order items")?;
                let item=items.iter().find(|i|i["id"]==item_id).ok_or("Item not found")?; if item["stockFired"]==true{return Err("Fired items require a stock-disposition void".into());}
                items.retain(|i|i["id"]!=item_id);
            } else if cmd.operation=="order.fire" {
                if !permissions(&user.role).contains(&"order.fire"){return Err("Order firing permission required".into());}
                let outlet_id=order["outletId"].as_str().ok_or("Order outlet missing")?.to_string();
                let (_,outlet)=get(&tx,"outlets",&outlet_id)?; let location=outlet["defaultStockLocationId"].as_str().ok_or("Outlet has no default stock location")?.to_string();
                let mut fired_any=false;
                for item in order["items"].as_array_mut().ok_or("Invalid order items")?.iter_mut(){
                    if item["stockFired"]==true{continue;}
                    if let Some(course)=p.get("courseName").and_then(Value::as_str){if item["courseName"]!=course{continue;}}
                    let qty=item["quantity"].as_f64().unwrap_or(1.0);
                    for ingredient in item["ingredientSnapshot"].as_array().cloned().unwrap_or_default(){
                        if ingredient["tracked"]==false{continue;}
                        let stock_id=text(&ingredient,"stockItemId")?; let per=ingredient["quantity"].as_f64().ok_or("Invalid recipe quantity")?; let consumed=per*qty;
                        if !consumed.is_finite()||consumed<0.0{return Err("Invalid recipe quantity".into());}
                        if consumed>0.0{stock_delta(&tx,user,stock_id,&location,-consumed,"SALE_CONSUMPTION",order_id,"Order fired",&mut changes)?;}
                    }
                    item["stockFired"]=json!(true); item["state"]=json!("FIRED"); item["courseStatus"]=json!("FIRED"); item["firedAt"]=json!(now()); fired_any=true;
                }
                if fired_any && p.get("courseName").is_none(){order["currentRoundNo"]=json!(order["currentRoundNo"].as_i64().unwrap_or(1)+1);}
                order["state"]=json!("SENT");
            } else if cmd.operation=="order.kds" {
                let status=text(p,"status")?; if !["PREPARING","READY","SERVED"].contains(&status){return Err("Invalid preparation state".into());}
                let item_id=p.get("itemId").and_then(Value::as_str);
                let station=p.get("station").and_then(Value::as_str);
                let mut matched=0;
                for item in order["items"].as_array_mut().ok_or("Invalid order items")?.iter_mut(){
                    if item["stockFired"]!=true{continue;}
                    if let Some(id)=item_id{if item["id"]!=id{continue;}}
                    if let Some(route)=station{if item["productSnapshot"]["routeTo"]!=route{continue;}}
                    item["state"]=json!(status); item["courseStatus"]=json!(status); item["kdsUpdatedAt"]=json!(now()); matched+=1;
                }
                if matched==0{return Err("No routed items matched this KDS action".into());}
            } else if cmd.operation=="order.discount" {
                authorize(&tx,user,"order.discount",p,Some(order_id))?;
                let percent=p.get("percent").and_then(Value::as_f64).ok_or("Discount percentage is required")?;
                if !percent.is_finite()||percent<=0.0||percent>100.0{return Err("Discount must be between 0 and 100 percent".into());}
                let reason=text(p,"reason")?.to_string();
                let (_,policy)=get(&tx,"property","property")?;
                for item in order["items"].as_array_mut().ok_or("Invalid order items")?.iter_mut(){
                    if item["comped"]==true{continue;}
                    let original=(item["unitPrice"].as_f64().unwrap_or(0.0)*100.0*item["quantity"].as_f64().unwrap_or(1.0)).round() as i64;
                    let discount=(original as f64*percent/100.0).round() as i64; let next=(original-discount).max(0);
                    item["discountMinor"]=json!(discount); item["lineTotal"]=json!(next as f64/100.0); item["totalPrice"]=json!(next as f64/100.0);
                    let (net,vat,levy)=tax_split(&policy,&item["productSnapshot"],next)?; item["netMinor"]=json!(net); item["vatMinor"]=json!(vat); item["levyMinor"]=json!(levy); item["taxAmount"]=json!(vat as f64/100.0); item["cateringLevy"]=json!(levy as f64/100.0);
                }
                order["discountReason"]=json!(reason); order["discountPercent"]=json!(percent); order["discountedBy"]=json!(user.staff_id); order["discountedAt"]=json!(now());
            } else {
                let item_id=text(p,"itemId")?; authorize(&tx,user,"order.comp",p,Some(item_id))?; let reason=text(p,"reason")?.to_string(); let (_,policy)=get(&tx,"property","property")?;
                let item=order["items"].as_array_mut().ok_or("Invalid order items")?.iter_mut().find(|i|i["id"]==item_id).ok_or("Item not found")?;
                let original=money(item,"lineTotal")?; item["comped"]=json!(true); item["compReason"]=json!(reason); item["discountMinor"]=json!(original); item["lineTotal"]=json!(0); item["totalPrice"]=json!(0);
                let (net,vat,levy)=tax_split(&policy,&item["productSnapshot"],0)?; item["netMinor"]=json!(net);item["vatMinor"]=json!(vat);item["levyMinor"]=json!(levy);item["taxAmount"]=json!(0);item["cateringLevy"]=json!(0);
            }
            recalculate_order(&mut order)?;
            let zero_total = money(&order,"grandTotal")? == 0;
            let has_items = order["items"].as_array().is_some_and(|items| !items.is_empty());
            let all_fired = order["items"].as_array().is_some_and(|items| items.iter().all(|i| i["stockFired"] == true));
            if zero_total && has_items && all_fired {
                order["state"] = json!("COMPLETED"); order["completedAt"] = json!(now());
                if let Some(table_id)=order["tableId"].as_str(){let (_,mut table)=get(&tx,"tables",table_id)?;table["currentOrderId"]=Value::Null;table["state"]=json!("CLEANING");put(&tx,"tables",table_id,table,&mut changes)?;}
            }
            put(&tx,"orders",order_id,order,&mut changes)?;
        }
        "payment.record" => payment(&tx, &user, p, &mut changes)?,
        "order.transfer" | "order.merge" | "order.void" => {
            let order_id=text(p,"orderId")?;
            let permission=match cmd.operation.as_str(){"order.transfer"=>"order.transfer","order.merge"=>"order.merge",_=>"order.void"};
            authorize(&tx,user,permission,p,Some(order_id))?;
            let (_,mut order)=get(&tx,"orders",order_id)?;
            if ["COMPLETED","VOIDED"].contains(&order["state"].as_str().unwrap_or(""))||money(&order,"amountPaid")?>0{return Err("Only unpaid open orders can be moved, merged or voided".into());}
            let source_table=order["tableId"].as_str().map(str::to_string);
            if cmd.operation=="order.void" {
                let reason=text(p,"reason")?.to_string();
                let has_fired=order["items"].as_array().ok_or("Invalid order items")?.iter().any(|i|i["stockFired"]==true);
                let disposition=p.get("disposition").and_then(Value::as_str).unwrap_or(if has_fired{""}else{"NOT_FIRED"});
                if has_fired && !["RETURN_SEALED","WASTE","CONSUMED","MANAGER_ADJUSTMENT"].contains(&disposition){return Err("Choose stock disposition for fired items".into());}
                if disposition=="RETURN_SEALED" {
                    let outlet_id=order["outletId"].as_str().ok_or("Order outlet missing")?; let (_,outlet)=get(&tx,"outlets",outlet_id)?; let location=outlet["defaultStockLocationId"].as_str().ok_or("Outlet stock location missing")?.to_string();
                    for item in order["items"].as_array().ok_or("Invalid order items")?.iter().filter(|i|i["stockFired"]==true){
                        let qty=item["quantity"].as_f64().unwrap_or(1.0);
                        for ingredient in item["ingredientSnapshot"].as_array().cloned().unwrap_or_default(){if ingredient["tracked"]==false{continue;} let stock=text(&ingredient,"stockItemId")?; let amount=ingredient["quantity"].as_f64().unwrap_or(0.0)*qty; if amount>0.0{stock_delta(&tx,user,stock,&location,amount,"VOID_RETURN",order_id,&reason,&mut changes)?;}}
                    }
                }
                for item in order["items"].as_array_mut().ok_or("Invalid order items")?.iter_mut(){item["state"]=json!("VOIDED");item["voidDisposition"]=json!(disposition);}
                order["state"]=json!("VOIDED"); order["voidReason"]=json!(reason); order["voidDisposition"]=json!(disposition); order["voidedBy"]=json!(user.staff_id); order["voidedAt"]=json!(now());
            } else {
                let target_id=text(p,"targetTableId")?; if source_table.as_deref()==Some(target_id){return Err("Choose a different table".into());}
                let (_,mut target)=get(&tx,"tables",target_id)?; if target["outletId"]!=order["outletId"]{return Err("Transfers and merges must stay within the order outlet".into());}
                if cmd.operation=="order.transfer" {
                    if target["currentOrderId"].as_str().is_some(){return Err("Destination already has an order; use merge".into());}
                    if target["state"]!="AVAILABLE"{return Err("Destination table is not ready for seating".into());}
                    order["tableId"]=json!(target_id);order["tableName"]=target["label"].clone();target["currentOrderId"]=json!(order_id);target["state"]=json!("ORDERING");
                } else {
                    let target_order_id=text(&target,"currentOrderId")?.to_string(); let (_,mut target_order)=get(&tx,"orders",&target_order_id)?;
                    if ["COMPLETED","VOIDED"].contains(&target_order["state"].as_str().unwrap_or(""))||money(&target_order,"amountPaid")?>0{return Err("Destination must have an unpaid open order".into());}
                    let moved=order["items"].as_array().ok_or("Invalid source items")?.clone(); target_order["items"].as_array_mut().ok_or("Invalid destination items")?.extend(moved); recalculate_order(&mut target_order)?;
                    order["state"]=json!("VOIDED"); order["mergedInto"]=json!(target_order_id); order["items"]=json!([]); recalculate_order(&mut order)?;
                    put(&tx,"orders",&target_order_id,target_order,&mut changes)?;
                }
                put(&tx,"tables",target_id,target,&mut changes)?;
            }
            if let Some(source)=source_table { let (_,mut table)=get(&tx,"tables",&source)?; table["currentOrderId"]=Value::Null; table["state"]=json!("CLEANING"); put(&tx,"tables",&source,table,&mut changes)?; }
            put(&tx,"orders",order_id,order,&mut changes)?;
        }
        "payment.split" => {
            let splits = p["payments"]
                .as_array()
                .ok_or("Payment lines are required")?;
            if splits.is_empty() || splits.len() > 10 {
                return Err("Use between one and ten payment lines".into());
            }
            let order_id = text(p, "orderId")?;
            let (_, order) = get(&tx, "orders", order_id)?;
            let sum = splits
                .iter()
                .map(|s| money(s, "amount"))
                .collect::<Result<Vec<_>>>()?
                .iter()
                .sum::<i64>();
            if sum != money(&order, "grandTotal")? - money(&order, "amountPaid")? {
                return Err("Split amounts must equal the outstanding balance".into());
            }
            for split in splits {
                let mut line = split.clone();
                line["orderId"] = json!(order_id);
                payment(&tx, &user, &line, &mut changes)?;
            }
        }
        "payment.refund" | "payment.reverse" => {
            let payment_id=text(p,"paymentId")?;
            let permission=if cmd.operation=="payment.reverse" { "payment.reverse" } else { "order.refund" };
            authorize(&tx,user,permission,p,Some(payment_id))?;
            let (_,payment_record)=get(&tx,"payments",payment_id)?;
            if payment_record["status"]!="PAID"{return Err("Only paid transactions can be refunded".into());}
            let original=money(&payment_record,"amount")?;
            let refunded_before:Vec<i64> = list(&tx,"refunds")?.into_iter().filter(|r|r["data"]["paymentId"]==payment_id).map(|r|money(&r["data"],"amount")).collect::<Result<Vec<_>>>()?;
            let refunded_before=refunded_before.iter().sum::<i64>();
            let amount=if cmd.operation=="payment.reverse"{original-refunded_before}else{money(p,"amount")?};
            if amount<=0||refunded_before+amount>original{return Err("Refund exceeds the remaining refundable payment amount".into());}
            let method=text(&payment_record,"tenderType")?.to_string();
            let external_ref=if method=="CASH"{p.get("externalReference").and_then(Value::as_str).unwrap_or("").to_string()}else{text(p,"externalReference")?.to_string()};
            if method=="CASH"{
                let tills=list(&tx,"tillSessions")?; let active=tills.iter().find(|v|v["data"]["status"]=="OPEN").ok_or("Open a till before paying a cash refund")?; let mut till=active["data"].clone();
                let expected=money(&till,"expectedCashInDrawer")?; if amount>expected{return Err("Cash refund exceeds expected cash in drawer".into());}
                till["cashPaidOut"]=json!((money(&till,"cashPaidOut")?+amount) as f64/100.0); till["expectedCashInDrawer"]=json!((expected-amount) as f64/100.0); let tid=text(&till,"id")?.to_string(); put(&tx,"tillSessions",&tid,till,&mut changes)?;
            }
            let original_journal=list(&tx,"journalEntries")?.into_iter().find(|r|r["data"]["sourceId"]==payment_id).ok_or("Original payment journal not found")?["data"].clone();
            let cumulative=refunded_before+amount; let mut debit_parts:Vec<Value>=vec![]; let mut allocated_sum=0i64;
            for line in original_journal["lines"].as_array().cloned().unwrap_or_default(){
                let credit=line["creditMinor"].as_i64().unwrap_or(0); if credit<=0{continue;}
                let allocated=((credit as f64*cumulative as f64/original as f64).round()-(credit as f64*refunded_before as f64/original as f64).round()) as i64;
                if allocated>0{allocated_sum+=allocated; debit_parts.push(json!({"id":id(),"accountId":line["accountId"],"accountCode":line["accountCode"],"accountName":line["accountName"],"debit":allocated as f64/100.0,"credit":0,"debitMinor":allocated,"creditMinor":0,"description":"Refund reversal"}));}
            }
            if allocated_sum!=amount { if let Some(first)=debit_parts.first_mut(){let corrected=first["debitMinor"].as_i64().unwrap_or(0)+(amount-allocated_sum);first["debitMinor"]=json!(corrected);first["debit"]=json!(corrected as f64/100.0);} }
            debit_parts.push(json!({"id":id(),"accountId":method,"accountCode":method,"accountName":method,"debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount,"description":"Refund settlement"}));
            let refund_id=id(); let stamp=now();
            put(&tx,"refunds",&refund_id,json!({"id":refund_id,"paymentId":payment_id,"orderId":payment_record["orderId"],"amount":amount as f64/100.0,"tenderType":method,"reason":text(p,"reason")?,"externalReference":external_ref,"stockDisposition":"NO_AUTOMATIC_RESTOCK","refundedBy":user.staff_id,"refundedAt":stamp}),&mut changes)?;
            let journal_id=id(); put(&tx,"journalEntries",&journal_id,json!({"id":journal_id,"entryNumber":format!("JE-{}",&journal_id[..8]),"propertyId":"property","occurredAt":stamp,"postedAt":stamp,"sourceType":"REFUND","sourceId":refund_id,"memo":format!("Refund for payment {}",payment_id),"lines":debit_parts,"totalDebit":amount as f64/100.0,"totalCredit":amount as f64/100.0,"balanced":true}),&mut changes)?;
            let order_id=text(&payment_record,"orderId")?.to_string(); let (_,mut order)=get(&tx,"orders",&order_id)?; order["refundedAmount"]=json!((money(&order,"refundedAmount").unwrap_or(0)+amount) as f64/100.0); put(&tx,"orders",&order_id,order,&mut changes)?;
        }
        "mpesa.discrepancy" => {
            if !permissions(&user.role).contains(&"mpesa.reconcile"){return Err("M-Pesa reconciliation permission required".into());}
            let receipt_id=text(p,"receiptId")?;
            let (_,mut receipt)=get(&tx,"mpesaReceipts",receipt_id)?;
            if receipt["reconciliationStatus"]=="RECONCILED"||receipt["reconciliationStatus"]=="RECONCILED_WITH_DISCREPANCY"{return Err("Receipt already reconciled".into());}
            let statement=money(p,"statementAmount")?;
            let received=money(&receipt,"receivedAmount")?;
            if statement==received{return Err("Statement amount matches; reconcile the receipt directly".into());}
            let open=list(&tx,"mpesaDiscrepancies")?.into_iter().any(|r|r["data"]["receiptId"]==receipt_id&&r["data"]["status"]=="OPEN");
            if open{return Err("Resolve the existing M-Pesa discrepancy before recording another".into());}
            let discrepancy_id=id();
            let stamp=now();
            let statement_reference=text(p,"statementReference")?;
            let reason=text(p,"reason")?;
            if statement_reference.trim().is_empty()||reason.trim().is_empty(){return Err("Statement reference and discrepancy reason are required".into());}
            put(&tx,"mpesaDiscrepancies",&discrepancy_id,json!({"id":discrepancy_id,"receiptId":receipt_id,"receiptCode":receipt["code"],"account":receipt["account"],"receivedAmount":received as f64/100.0,"statementAmount":statement as f64/100.0,"variance":(statement-received) as f64/100.0,"statementReference":statement_reference,"reason":reason,"status":"OPEN","openedBy":user.staff_id,"openedAt":stamp}),&mut changes)?;
            receipt["reconciliationStatus"]=json!("DISCREPANCY"); receipt["discrepancyId"]=json!(discrepancy_id);
            put(&tx,"mpesaReceipts",receipt_id,receipt,&mut changes)?;
        }
        "mpesa.discrepancy.resolve" => {
            if !permissions(&user.role).contains(&"mpesa.reconcile"){return Err("M-Pesa reconciliation permission required".into());}
            let discrepancy_id=text(p,"discrepancyId")?;
            let (_,mut discrepancy)=get(&tx,"mpesaDiscrepancies",discrepancy_id)?;
            if discrepancy["status"]!="OPEN"{return Err("Only open M-Pesa discrepancies can be resolved".into());}
            let outcome=text(p,"outcome")?;
            if !["STATEMENT_ERROR","ACCEPTED_VARIANCE"].contains(&outcome){return Err("Choose STATEMENT_ERROR or ACCEPTED_VARIANCE".into());}
            let resolution=text(p,"resolution")?;
            if resolution.trim().is_empty(){return Err("A resolution note is required".into());}
            discrepancy["status"]=json!("RESOLVED"); discrepancy["outcome"]=json!(outcome); discrepancy["resolution"]=json!(resolution); discrepancy["resolvedBy"]=json!(user.staff_id); discrepancy["resolvedAt"]=json!(now());
            put(&tx,"mpesaDiscrepancies",discrepancy_id,discrepancy,&mut changes)?;
        }
        "mpesa.reconcile" => {
            if !permissions(&user.role).contains(&"mpesa.reconcile"){return Err("M-Pesa reconciliation permission required".into());}
            let receipt_id=text(p,"receiptId")?; let (_,mut receipt)=get(&tx,"mpesaReceipts",receipt_id)?; if receipt["reconciliationStatus"]=="RECONCILED"||receipt["reconciliationStatus"]=="RECONCILED_WITH_DISCREPANCY"{return Err("Receipt already reconciled".into());}
            let statement=money(p,"statementAmount")?; let received=money(&receipt,"receivedAmount")?;
            let statement_reference=text(p,"statementReference")?;
            if statement_reference.trim().is_empty(){return Err("Statement reference is required".into());}
            let resolved=list(&tx,"mpesaDiscrepancies")?.into_iter().rev().find(|r|r["data"]["receiptId"]==receipt_id&&r["data"]["status"]=="RESOLVED");
            let accepted=resolved.as_ref().is_some_and(|r|r["data"]["outcome"]=="ACCEPTED_VARIANCE"&&money(&r["data"],"statementAmount").ok()==Some(statement)&&r["data"]["statementReference"]==statement_reference);
            if statement!=received&&!accepted{return Err("Statement amount differs from the receipt; record and resolve the discrepancy first".into());}
            if receipt["reconciliationStatus"]=="DISCREPANCY"&&!accepted&&resolved.as_ref().map_or(true,|r|r["data"]["outcome"]!="STATEMENT_ERROR"){return Err("Resolve the open M-Pesa discrepancy before reconciliation".into());}
            receipt["statementReference"]=json!(statement_reference); receipt["reviewNotes"]=json!(p.get("notes").and_then(Value::as_str).unwrap_or("")); receipt["reviewedBy"]=json!(user.staff_id); receipt["reviewedAt"]=json!(now()); receipt["reconciliationStatus"]=json!(if accepted{"RECONCILED_WITH_DISCREPANCY"}else{"RECONCILED"}); put(&tx,"mpesaReceipts",receipt_id,receipt,&mut changes)?;
        }
        "till.cashMovement" => {
            let till_id=text(p,"tillId")?; authorize(&tx,user,"till.cash_movement",p,Some(till_id))?; let (_,mut till)=get(&tx,"tillSessions",till_id)?; if till["status"]!="OPEN"{return Err("Till is not open".into());}
            let kind=text(p,"type")?; if !["IN","OUT"].contains(&kind){return Err("Cash movement type must be IN or OUT".into());} let amount=money(p,"amount")?; if amount<=0{return Err("Cash movement must be positive".into());} let reason=text(p,"reason")?;
            let expected=money(&till,"expectedCashInDrawer")?; if kind=="OUT"&&amount>expected{return Err("Paid out amount exceeds expected cash in drawer".into());}
            if kind=="IN"{till["cashPaidIn"]=json!((money(&till,"cashPaidIn")?+amount) as f64/100.0);till["expectedCashInDrawer"]=json!((expected+amount) as f64/100.0);}else{till["cashPaidOut"]=json!((money(&till,"cashPaidOut")?+amount) as f64/100.0);till["expectedCashInDrawer"]=json!((expected-amount) as f64/100.0);}
            put(&tx,"tillSessions",till_id,till,&mut changes)?; let movement_id=id(); put(&tx,"cashMovements",&movement_id,json!({"id":movement_id,"tillSessionId":till_id,"type":kind,"amount":amount as f64/100.0,"reason":reason,"actorId":user.staff_id,"occurredAt":now()}),&mut changes)?;
            let journal_id=id(); let (debit,credit)=if kind=="IN"{("CASH","CASH_ADJUSTMENT")}else{("CASH_ADJUSTMENT","CASH")}; put(&tx,"journalEntries",&journal_id,json!({"id":journal_id,"entryNumber":format!("JE-{}",&journal_id[..8]),"propertyId":"property","occurredAt":now(),"postedAt":now(),"sourceType":"CASH_MOVEMENT","sourceId":movement_id,"memo":reason,"lines":[{"id":id(),"accountId":debit,"accountCode":debit,"accountName":debit,"debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0},{"id":id(),"accountId":credit,"accountCode":credit,"accountName":credit,"debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount}],"totalDebit":amount as f64/100.0,"totalCredit":amount as f64/100.0,"balanced":true}),&mut changes)?;
        }
        "till.close" => {
            let till_id=text(p,"tillId")?; let (_,mut till)=get(&tx,"tillSessions",till_id)?; if till["status"]!="OPEN"{return Err("Till is already closed".into());}
            let open_orders=list(&tx,"orders")?.into_iter().filter(|r|!["COMPLETED","VOIDED"].contains(&r["data"]["state"].as_str().unwrap_or(""))).count(); if open_orders>0{return Err(format!("Resolve {open_orders} open tab(s) before closing the till"));}
            let counted=money(p,"countedCash")?; let expected=money(&till,"expectedCashInDrawer")?; if counted!=expected {authorize(&tx,user,"till.override_variance",p,Some(till_id))?; text(p,"reason")?;}
            till["countedCashAtClose"]=json!(counted as f64/100.0);till["cashVariance"]=json!((counted-expected) as f64/100.0);till["closedAt"]=json!(now());till["status"]=json!("CLOSED");till["reason"]=json!(p.get("reason").and_then(Value::as_str).unwrap_or(""));till["closedBy"]=json!(user.staff_id);put(&tx,"tillSessions",till_id,till,&mut changes)?;
        }
        "closeDay.generate" => {
            if !permissions(&user.role).contains(&"reports.view"){return Err("Reports permission required".into());}
            let till_id=text(p,"tillId")?; let (_,till)=get(&tx,"tillSessions",till_id)?; if till["status"]!="CLOSED"{return Err("Close the till before generating the close-day report".into());}
            if list(&tx,"closeDayReports")?.iter().any(|record|record["data"]["tillSessionId"].as_str()==Some(till_id)){return Err("A close-day report already exists for this till. Historical close reports are immutable in this release".into());}
            let opened=text(&till,"openedAt")?.to_string(); let closed=text(&till,"closedAt")?.to_string();
            let payments:Vec<Value>=list(&tx,"payments")?.into_iter().map(|r|r["data"].clone()).filter(|v|v["tillSessionId"]==till_id).collect();
            let mut cash=0i64;let mut mpesa=0i64;let mut card=0i64;let mut order_ids=std::collections::HashSet::new();
            for pay in &payments{let amount=money(pay,"amount")?;match pay["tenderType"].as_str().unwrap_or(""){"CASH"=>cash+=amount,"MPESA"=>mpesa+=amount,"CARD"=>card+=amount,_=>{}} if let Some(x)=pay["orderId"].as_str(){order_ids.insert(x.to_string());}}
            let orders:Vec<Value>=list(&tx,"orders")?.into_iter().map(|r|r["data"].clone()).filter(|o|order_ids.contains(o["id"].as_str().unwrap_or(""))).collect();
            let gross=orders.iter().map(|o|money(o,"grandTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>(); let tax=orders.iter().map(|o|money(o,"taxTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>(); let levy=orders.iter().map(|o|money(o,"cateringLevyTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>(); let discounts=orders.iter().map(|o|money(o,"discountTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>();
            let comp_value=orders.iter().flat_map(|o|o["items"].as_array().cloned().unwrap_or_default()).filter(|i|i["comped"]==true).map(|i|i["discountMinor"].as_i64().unwrap_or(0)).sum::<i64>();
            let movements:Vec<Value>=list(&tx,"stockMovements")?.into_iter().map(|r|r["data"].clone()).filter(|m|m["occurredAt"].as_str().is_some_and(|t|t>=opened.as_str()&&t<=closed.as_str())).collect();
            let cogs=movements.iter().filter(|m|m["movementType"]=="SALE_CONSUMPTION").map(|m|(m["totalCostValuation"].as_f64().unwrap_or(0.0)*100.0).round().abs() as i64).sum::<i64>(); let waste=movements.iter().filter(|m|m["movementType"]=="WASTE").map(|m|(m["totalCostValuation"].as_f64().unwrap_or(0.0)*100.0).round().abs() as i64).sum::<i64>();
            let refunds:Vec<Value>=list(&tx,"refunds")?.into_iter().map(|r|r["data"].clone()).filter(|r|r["refundedAt"].as_str().is_some_and(|t|t>=opened.as_str()&&t<=closed.as_str())).collect(); let refund_total=refunds.iter().map(|r|money(r,"amount")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>();
            let pending_mpesa=payments.iter().filter_map(|p|p["mpesaReceiptId"].as_str()).filter(|id|get(&tx,"mpesaReceipts",id).ok().is_some_and(|(_,r)|r["reconciliationStatus"]!="RECONCILED")).count();
            let mut product_counts=std::collections::HashMap::<String,f64>::new(); let mut staff_sales=std::collections::HashMap::<String,i64>::new();
            for order in &orders{let name=order["serverName"].as_str().unwrap_or("Unknown").to_string();*staff_sales.entry(name).or_insert(0)+=money(order,"grandTotal")?;for item in order["items"].as_array().cloned().unwrap_or_default(){*product_counts.entry(item["productName"].as_str().unwrap_or("Unknown").to_string()).or_insert(0.0)+=item["quantity"].as_f64().unwrap_or(0.0);}}
            let mut top_products:Vec<Value>=product_counts.into_iter().map(|(name,quantity)|json!({"name":name,"quantity":quantity})).collect();top_products.sort_by(|a,b|b["quantity"].as_f64().partial_cmp(&a["quantity"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));top_products.truncate(10);
            let staff:Vec<Value>=staff_sales.into_iter().map(|(name,amount)|json!({"name":name,"sales":amount as f64/100.0})).collect(); let pending:i64=tx.query_row("SELECT count(*) FROM outbox WHERE acknowledged_at IS NULL",[],|r|r.get(0)).map_err(error)?;
            let report_id=id();put(&tx,"closeDayReports",&report_id,json!({"id":report_id,"tillSessionId":till_id,"openedAt":opened,"closedAt":closed,"generatedAt":now(),"generatedBy":user.staff_id,"sales":{"gross":gross as f64/100.0,"net":(gross-tax-levy-refund_total) as f64/100.0,"vat":tax as f64/100.0,"levy":levy as f64/100.0,"refunds":refund_total as f64/100.0},"tenders":{"cash":cash as f64/100.0,"mpesa":mpesa as f64/100.0,"card":card as f64/100.0},"cash":{"openingFloat":till["openingFloat"],"paidIn":till["cashPaidIn"],"paidOut":till["cashPaidOut"],"expected":till["expectedCashInDrawer"],"actual":till["countedCashAtClose"],"variance":till["cashVariance"]},"adjustments":{"discounts":discounts as f64/100.0,"comps":comp_value as f64/100.0,"refunds":refund_total as f64/100.0},"inventory":{"cogs":cogs as f64/100.0,"waste":waste as f64/100.0},"margin":{"grossProfit":(gross-refund_total-cogs) as f64/100.0},"mpesa":{"pendingReconciliation":pending_mpesa},"topProducts":top_products,"staffSales":staff,"system":{"pendingSync":pending,"lastSync":meta(&tx,"last_sync")?,"lastBackup":meta(&tx,"last_backup")?}}),&mut changes)?;
        }
        _ => {
            return Err(format!(
                "Workflow not implemented in the native backend: {}",
                cmd.operation
            ))
        }
    }
    let result = finish(&tx, &cmd, &user.staff_id, changes)?;
    tx.commit().map_err(error)?;
    Ok(result)
}
fn payment(tx: &Transaction, user: &Session, p: &Value, changes: &mut Vec<Value>) -> Result<()> {
    let order_id = text(p, "orderId")?;
    let (_, mut order) = get(tx, "orders", order_id)?;
    if ["COMPLETED", "VOIDED"].contains(&order["state"].as_str().unwrap_or("")) {
        return Err("Order already closed".into());
    }
    let total = money(&order, "grandTotal")?;
    let paid = money(&order, "amountPaid")?;
    let amount = money(p, "amount")?;
    if amount <= 0 || amount > total - paid {
        return Err("Payment must be positive and not exceed the outstanding balance".into());
    }
    let method = text(p, "method")?;
    if !["CASH", "MPESA", "CARD"].contains(&method) { return Err("This tender is not implemented".into()); }
    let permission = if method == "MPESA" { "mpesa.record" } else { "payment.record" };
    if !permissions(&user.role).contains(&permission) { return Err(format!("Permission required: {permission}")); }
    let (_, payment_config) = get(tx, "paymentConfig", "main")?;
    if !payment_config["methods"].as_array().is_some_and(|methods| methods.iter().any(|m| m.as_str() == Some(method))) { return Err(format!("{method} is not enabled for this business")); }
    let tills = list(tx, "tillSessions")?;
    let active = tills
        .iter()
        .find(|v| v["data"]["status"] == "OPEN")
        .ok_or("Open a till before accepting payment")?;
    let mut till = active["data"].clone();
    let mut reference = id();
    let mut receipt_id = None;
    if method == "MPESA" {
        let m = &p["mpesa"];
        if m["confirmed"] != true {
            return Err("Confirm the receipt on the business M-Pesa account first".into());
        }
        let code = text(m, "code")?.trim().to_ascii_uppercase();
        if code.len() < 6 || code.len() > 20 || !code.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err("Enter a valid M-Pesa transaction code".into());
        }
        let account = text(m, "account")?.trim();
        let account_allowed = payment_config["mpesaAccounts"].as_array().map(|accounts| accounts.iter().any(|a| a["number"].as_str() == Some(account))).unwrap_or(false);
        if !account_allowed { return Err("Choose a configured business M-Pesa account".into()); }
        let received = money(m, "receivedAmount")?;
        let date = text(m, "receivedAt")?;
        chrono::DateTime::parse_from_rfc3339(date)
            .map_err(|_| "Receipt time must include a timezone")?;
        let existing: Option<String> = tx
            .query_row(
                "SELECT receipt_id FROM mpesa_codes WHERE account=? AND code=?",
                params![account, code],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        let key = existing.clone().unwrap_or_else(id);
        let mut receipt = if existing.is_some() {
            get(tx, "mpesaReceipts", &key)?.1
        } else {
            json!({"id":key,"code":code,"account":account,"receivedAmount":received as f64/100.0,"receivedAt":date,"allocatedAmount":0,"reconciliationStatus":"AWAITING_RECONCILIATION","cashierId":user.staff_id})
        };
        if money(&receipt, "receivedAmount")? != received {
            return Err("Transaction code already exists with a different received amount".into());
        }
        let allocated = money(&receipt, "allocatedAmount")?;
        if allocated + amount > received {
            return Err("Transaction code has insufficient unallocated funds".into());
        }
        receipt["allocatedAmount"] = json!((allocated + amount) as f64 / 100.0);
        receipt["unappliedAmount"] = json!((received - allocated - amount) as f64 / 100.0);
        if received > allocated + amount {
            let customer_id = text(m, "customerId")?;
            get(tx, "customers", customer_id)?;
            if let Some(owner) = receipt["customerId"].as_str() {
                if owner != customer_id {
                    return Err("Unapplied receipt credit belongs to a different customer".into());
                }
            }
            receipt["customerId"] = json!(customer_id);
        }
        if existing.is_none() {
            tx.execute(
                "INSERT INTO mpesa_codes VALUES(?,?,?)",
                params![account, code, key],
            )
            .map_err(error)?;
        }
        put(tx, "mpesaReceipts", &key, receipt, changes)?;
        reference = code;
        receipt_id = Some(key);
    }
    if method == "CARD" {
        reference = text(p, "cardAuthCode")?.trim().into();
        if reference.len() < 2 { return Err("Enter the external card approval reference".into()); }
    }
    if method == "CASH" {
        if money(p, "cashTendered")? < amount {
            return Err("Cash tendered is below the payment amount".into());
        }
        till["cashSalesTotal"] = json!((money(&till, "cashSalesTotal")? + amount) as f64 / 100.0);
        till["expectedCashInDrawer"] =
            json!((money(&till, "expectedCashInDrawer")? + amount) as f64 / 100.0);
        let till_id = text(&till, "id")?.to_string();
        put(tx, "tillSessions", &till_id, till, changes)?;
    }
    let payment_id = id();
    let journal_id = id();
    let stamp = now();
    put(
        tx,
        "payments",
        &payment_id,
        json!({"id":payment_id,"orderId":order_id,"propertyId":"property","tillSessionId":active["id"],"tenderType":method,"amount":amount as f64/100.0,"amountMinor":amount,"currency":"KES","status":"PAID","referenceNumber":reference,"mpesaReceiptId":receipt_id,"occurredAt":stamp,"cashierId":user.staff_id,"cashierName":user.name,"confirmation":"MANUAL"}),
        changes,
    )?;
    // Cumulative allocation prevents tax rounding drift across partial payments.
    let allocate = |tax: i64| {
        ((tax as f64 * (paid + amount) as f64 / total as f64).round()
            - (tax as f64 * paid as f64 / total as f64).round()) as i64
    };
    let vat = allocate(money(&order, "taxTotal")?);
    let levy = allocate(money(&order, "cateringLevyTotal")?);
    let net = amount - vat - levy;
    let mut lines = vec![
        json!({"id":id(),"accountId":method,"accountCode":method,"accountName":method,"debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0,"description":"Receipt"}),
    ];
    for (account, code, title, credit) in [
        ("SALES", "4000", "Sales", net),
        ("VAT", "2100", "VAT payable", vat),
        ("LEVY", "2110", "Levy payable", levy),
    ] {
        if credit != 0 {
            lines.push(json!({"id":id(),"accountId":account,"accountCode":code,"accountName":title,"debit":0,"credit":credit as f64/100.0,"debitMinor":0,"creditMinor":credit,"description":"Sale allocation"}));
        }
    }
    put(
        tx,
        "journalEntries",
        &journal_id,
        json!({"id":journal_id,"entryNumber":format!("JE-{}",&journal_id[..8]),"propertyId":"property","occurredAt":stamp,"postedAt":stamp,"sourceType":"PAYMENT","sourceId":payment_id,"memo":format!("Manual {} receipt for {}",method,order["orderNumber"]),"lines":lines,"totalDebit":amount as f64/100.0,"totalCredit":amount as f64/100.0,"balanced":true}),
        changes,
    )?;
    order["amountPaid"] = json!((paid + amount) as f64 / 100.0);
    order["paymentMethod"] = json!(method);
    if paid + amount == total {
        order["state"] = json!("COMPLETED");
        order["completedAt"] = json!(stamp);
        if let Some(table_id) = order["tableId"].as_str() {
            let (_, mut table) = get(tx, "tables", table_id)?;
            table["currentOrderId"] = Value::Null;
            table["state"] = json!("CLEANING");
            put(tx, "tables", table_id, table, changes)?;
        }
    }
    put(tx, "orders", order_id, order, changes)
}
fn stock_delta(
    tx: &Transaction,
    user: &Session,
    stock_id: &str,
    location: &str,
    delta: f64,
    kind: &str,
    source: &str,
    reason: &str,
    changes: &mut Vec<Value>,
) -> Result<()> {
    stock_delta_with_cost(tx,user,stock_id,location,delta,kind,source,reason,None,changes)
}
fn stock_delta_with_cost(
    tx: &Transaction,
    user: &Session,
    stock_id: &str,
    location: &str,
    delta: f64,
    kind: &str,
    source: &str,
    reason: &str,
    unit_cost_override: Option<f64>,
    changes: &mut Vec<Value>,
) -> Result<()> {
    let (_, mut stock) = get(tx, "stockItems", stock_id)?;
    let (_, location_record) = get(tx, "stockLocations", location)?;
    let current = stock["currentStock"][location].as_f64().unwrap_or(0.0);
    let next = ((current + delta) * 1_000_000.0).round() / 1_000_000.0;
    if next < 0.0 {
        return Err("Insufficient stock; no movement was recorded".into());
    }
    stock["currentStock"][location] = json!(next);
    let movement = id();
    let cost = unit_cost_override.unwrap_or_else(||stock["averageUnitCost"].as_f64().unwrap_or(0.0));
    put(
        tx,
        "stockMovements",
        &movement,
        json!({"id":movement,"organizationId":"business","propertyId":"property","stockItemId":stock_id,"stockItemName":stock["name"],"locationId":location,"locationName":location_record["name"],"quantityDelta":delta,"baseUnit":stock["baseUnit"],"movementType":kind,"sourceId":source,"reasonCode":reason,"occurredAt":now(),"actorUserId":user.staff_id,"actorName":user.name,"unitCostSnapshot":cost,"totalCostValuation":((delta*cost*100.0).round())/100.0}),
        changes,
    )?;
    put(tx, "stockItems", stock_id, stock, changes)
}
pub fn list(db: &Connection, collection: &str) -> Result<Vec<Value>> {
    let mut stmt=db.prepare("SELECT id,version,data,archived FROM records WHERE collection=? AND archived=0 ORDER BY rowid").map_err(error)?;
    let rows = stmt
        .query_map([collection], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, bool>(3)?,
            ))
        })
        .map_err(error)?;
    rows.map(|r| {let (id,version,data,archived)=r.map_err(error)?; Ok(json!({"collection":collection,"id":id,"version":version,"data":serde_json::from_str::<Value>(&data).map_err(error)?,"archived":archived}))}).collect()
}
pub fn snapshot(db: &Connection, token: &str) -> Result<Value> {
    let user=actor(db,token,false)?;
    let mut records=vec![];
    let mut stmt=db.prepare("SELECT DISTINCT collection FROM records").map_err(error)?;
    let collections=stmt.query_map([],|r|r.get::<_,String>(0)).map_err(error)?;
    let server_allowed=["organization","property","outlets","products","stockItems","stockLocations","tables","orders","tillSessions","customers","payments","refunds","paymentConfig","employees","priceRules","closeDayReports","suppliers","purchaseOrders","goodsReceipts","inventoryReceipts"];
    for row in collections {
        let c=row.map_err(error)?;
        if user.role=="Server"&&!server_allowed.contains(&c.as_str()){continue;}
        let mut collection_records=list(db,&c)?;
        if user.role=="Server" {
            for record in &mut collection_records {
                let Some(data)=record.get_mut("data").and_then(Value::as_object_mut) else { continue; };
                match c.as_str() {
                    "products" => { data.remove("costPrice"); }
                    "suppliers" => { data.remove("contactPerson"); data.remove("phone"); data.remove("email"); data.remove("kraPin"); data.remove("paymentTermsDays"); }
                    "stockItems" => { data.remove("averageUnitCost"); }
                    "stockMovements" => { data.remove("unitCostSnapshot"); data.remove("totalCostValuation"); }
                    "purchaseOrders" => {
                        data.remove("subtotal"); data.remove("taxTotal"); data.remove("grandTotal");
                        if let Some(items)=data.get_mut("items").and_then(Value::as_array_mut) {
                            for item in items { if let Some(fields)=item.as_object_mut(){fields.remove("unitPrice");fields.remove("lineTotal");} }
                        }
                    }
                    "goodsReceipts" => {
                        data.remove("acceptedValue"); data.remove("supplierInvoiceNumber");
                        if let Some(lines)=data.get_mut("lines").and_then(Value::as_array_mut) {
                            for line in lines { if let Some(fields)=line.as_object_mut(){fields.remove("unitCost");fields.remove("acceptedValue");} }
                        }
                    }
                    "inventoryReceipts" => { data.remove("unitCost"); data.remove("supplierInvoiceNumber"); }
                    _ => {}
                }
            }
        }
        records.extend(collection_records);
    }
    let pending:i64=db.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|r|r.get(0)).map_err(error)?;
    Ok(json!({
        "records":records,"pendingCount":pending,"lastSync":meta(db,"last_sync")?,"lastBackup":meta(db,"last_backup")?,"terminalId":meta(db,"terminal_id")?,
        "installationStage":installation_stage(db)?,"actor":{"id":user.staff_id,"name":user.name,"role":user.role,"permissions":permissions(&user.role)}
    }))
}
