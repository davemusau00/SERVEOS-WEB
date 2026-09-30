use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Datelike, Duration, Timelike, Utc};
use rand_core::OsRng;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[path = "receipts.rs"]
pub mod receipts;
#[path = "customer_credit.rs"]
pub mod customer_credit;

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
    if version > 14 {
        return Err("Database requires a newer ServOS version".into());
    }
    if version < 1 {
        db.execute_batch(include_str!("../migrations/001.sql")).map_err(error)?;
    }
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(error)?;
    if version < 2 {
        db.execute_batch(include_str!("../migrations/002_bar_v2.sql")).map_err(error)?;
    }
    if version < 3 {
        db.execute_batch(include_str!("../migrations/003_receipts.sql")).map_err(error)?;
    }
    if version < 4 {
        db.execute_batch(include_str!("../migrations/004_import_center.sql")).map_err(error)?;
    }
    if version < 5 {
        db.execute_batch(include_str!("../migrations/005_import_apply.sql")).map_err(error)?;
    }
    if version < 6 {
        db.execute_batch(include_str!("../migrations/006_folios.sql")).map_err(error)?;
    }
    if version < 7 {
        db.execute_batch(include_str!("../migrations/007_assets_maintenance.sql")).map_err(error)?;
    }
    if version < 8 {
        db.execute_batch(include_str!("../migrations/008_asset_register_procurement.sql")).map_err(error)?;
    }
    if version < 9 {
        db.execute_batch(include_str!("../migrations/009_terminal_acceptance.sql")).map_err(error)?;
    }
    if version < 10 {
        db.execute_batch(include_str!("../migrations/010_guidance.sql")).map_err(error)?;
    }
    if version < 11 {
        db.execute_batch(include_str!("../migrations/011_inventory_count_drafts.sql")).map_err(error)?;
    }
    if version < 12 {
        db.execute_batch(include_str!("../migrations/012_count_sessions.sql")).map_err(error)?;
    }
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(error)?;
    if version < 13 {
        db.execute_batch(include_str!("../migrations/013_customer_credit.sql")).map_err(error)?;
    }
    let version:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(error)?;
    if version<14 {
        db.execute_batch(include_str!("../migrations/014_native_v2_outbox.sql")).map_err(error)?;
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

/// Initialize staged v2 sequence/feed state once from authenticated identity.
/// Later identity refreshes must not advance cursors past unapplied feed data
/// or acknowledgements; this function never enqueues business commands.
pub fn seed_native_v2_state(db: &Connection, identity: &Value) -> Result<()> {
    let device_id = text(identity, "deviceId")?;
    let business_id = text(identity, "businessId")?;
    let server_sequence = identity["lastSequence"].as_i64().unwrap_or(0).max(0);
    let server_cursor = identity["cursor"].as_i64().unwrap_or(0).max(0);
    let updated_at = now();
    let existing: Option<String> = db.query_row(
        "SELECT business_id FROM native_v2_state WHERE device_id=?",
        [device_id],
        |row| row.get(0),
    ).optional().map_err(error)?;
    if existing.as_deref().is_some_and(|value| value != business_id) {
        return Err("Paired terminal is already associated with a different business".into());
    }
    db.execute(
        "INSERT INTO native_v2_state(device_id,business_id,last_sequence,feed_cursor,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO NOTHING",
        params![device_id,business_id,server_sequence,server_cursor,updated_at],
    ).map_err(error)?;
    Ok(())
}

/// Atomically apply one ordered server-feed page into the isolated v2 replica.
/// This never mutates legacy `records` and never advances past a missing slot.
pub fn apply_native_v2_page(db: &mut Connection, device_id: &str, page: &Value) -> Result<()> {
    let cursor = page.get("cursor").and_then(Value::as_i64)
        .filter(|value| *value >= 0).ok_or("Invalid v2 change-feed cursor")?;
    let changes = page.get("changes").and_then(Value::as_array)
        .ok_or("Invalid v2 change-feed page")?;
    let tx = db.transaction().map_err(error)?;
    let (business_id, mut applied_cursor, complete): (String, i64, i64) = tx.query_row(
        "SELECT business_id,feed_cursor,snapshot_complete FROM native_v2_state WHERE device_id=?",
        [device_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).map_err(error)?;
    if complete != 1 { return Err("Install a complete v2 baseline before applying feed changes".into()); }
    if cursor < applied_cursor { return Err("V2 change-feed cursor moved backwards".into()); }
    if cursor == applied_cursor && changes.is_empty() { return Ok(()); }
    for change in changes {
        let sequence=change.get("sequence").and_then(Value::as_i64).filter(|n|*n>0).ok_or("Invalid v2 feed sequence")?;
        if sequence <= applied_cursor { continue; }
        if sequence != applied_cursor + 1 { return Err("V2 change-feed sequence gap; page retained for retry".into()); }
        let rows=change.get("records").and_then(Value::as_array).ok_or("Invalid v2 feed records")?;
        for row in rows {
            let collection=text(row,"collection")?;
            let record_id=text(row,"id")?;
            let version=row.get("version").and_then(Value::as_i64).filter(|v|*v>0).ok_or("Invalid v2 record version")?;
            let data=row.get("data").filter(|v|v.is_object()).ok_or("Invalid v2 record data")?;
            let archived=row.get("archived").and_then(Value::as_bool).ok_or("Invalid v2 archive state")?;
            tx.execute("INSERT INTO native_v2_records(collection,record_id,version,data,archived,feed_sequence) VALUES(?,?,?,?,?,?) ON CONFLICT(collection,record_id) DO UPDATE SET version=excluded.version,data=excluded.data,archived=excluded.archived,feed_sequence=excluded.feed_sequence",
                params![collection,record_id,version,data.to_string(),archived as i64,sequence]).map_err(error)?;
        }
        applied_cursor=sequence;
    }
    if applied_cursor != cursor { return Err("V2 feed cursor does not match complete page".into()); }
    tx.execute("UPDATE native_v2_state SET feed_cursor=?,updated_at=? WHERE device_id=? AND business_id=?",
        params![cursor,now(),device_id,business_id]).map_err(error)?;
    tx.commit().map_err(error)?;
    Ok(())
}

/// Install or refresh a stable authorized server snapshot as the isolated v2
/// baseline. A refresh is blocked while any v2 command awaits acknowledgement.
pub fn install_native_v2_snapshot(db: &mut Connection, device_id: &str, business_id: &str, cursor: i64, policy: &str, records: &[Value]) -> Result<()> {
    if cursor < 0 || policy.trim().is_empty() || records.len() > 100_000 {
        return Err("Invalid or oversized v2 baseline snapshot".into());
    }
    let tx = db.transaction().map_err(error)?;
    let legacy_pending:i64=tx.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|row|row.get(0)).map_err(error)?;
    if legacy_pending>0{return Err("Install the v2 baseline only after the legacy outbox is drained and reconciled".into());}
    let (stored_business,previous_cursor,complete):(String,i64,i64)=tx.query_row(
        "SELECT business_id,feed_cursor,snapshot_complete FROM native_v2_state WHERE device_id=?",
        [device_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).map_err(error)?;
    if stored_business != business_id { return Err("V2 snapshot business does not match paired terminal".into()); }
    let pending:i64=tx.query_row("SELECT COUNT(*) FROM native_v2_outbox WHERE state='PENDING'",[],|row|row.get(0)).map_err(error)?;
    if pending>0 { return Err("V2 snapshot refresh is blocked while commands await acknowledgement".into()); }
    if cursor < previous_cursor { return Err("V2 snapshot cursor moved behind the authenticated identity cursor".into()); }
    if complete==1 { tx.execute("DELETE FROM native_v2_records",[]).map_err(error)?; }
    for record in records {
        let collection=text(record,"collection")?;
        let record_id=text(record,"id")?;
        let version=record.get("version").and_then(Value::as_i64).filter(|value|*value>0).ok_or("Invalid v2 snapshot record version")?;
        let data=record.get("data").filter(|value|value.is_object()).ok_or("Invalid v2 snapshot record data")?;
        let archived=record.get("archived").and_then(Value::as_bool).ok_or("Invalid v2 snapshot archive state")?;
        tx.execute("INSERT INTO native_v2_records(collection,record_id,version,data,archived,feed_sequence) VALUES(?,?,?,?,?,?)",
            params![collection,record_id,version,data.to_string(),archived as i64,cursor]).map_err(error)?;
    }
    tx.execute("UPDATE native_v2_state SET feed_cursor=?,snapshot_complete=1,snapshot_policy=?,updated_at=? WHERE device_id=?",
        params![cursor,policy,now(),device_id]).map_err(error)?;
    tx.commit().map_err(error)?;
    Ok(())
}

pub fn queue_native_v2_command(db:&mut Connection,device_id:&str,business_id:&str,actor_id:&str,command:&BusinessCommand,expected_versions:&Value)->Result<Value>{
    if Uuid::parse_str(device_id).is_err()||Uuid::parse_str(actor_id).is_err()||Uuid::parse_str(&command.id).is_err(){return Err("Invalid v2 command identity".into());}
    let versions=expected_versions.as_array().ok_or("Command concurrency baseline is missing")?;
    let mut unique=std::collections::HashSet::new();
    for version in versions{
        let collection=text(version,"collection")?;let record_id=text(version,"id")?;
        if version["version"].as_i64().filter(|value|*value>=0).is_none()||!unique.insert(format!("{collection}:{record_id}")){return Err("Invalid or duplicate expected-version entry".into());}
    }
    let tx=db.transaction().map_err(error)?;
    let state:Option<(String,i64,i64)>=tx.query_row("SELECT business_id,last_sequence,snapshot_complete FROM native_v2_state WHERE device_id=?",[device_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).optional().map_err(error)?;
    let (stored_business,last_sequence,snapshot_complete)=state.ok_or("V2 device state is not initialized")?;
    if stored_business!=business_id{return Err("V2 command business does not match paired terminal".into());}
    if snapshot_complete!=1{return Err("Install a complete v2 baseline before submitting shared commands".into());}
    let legacy_pending:i64=tx.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|row|row.get(0)).map_err(error)?;
    if legacy_pending>0{return Err("V2 writes are blocked until the legacy outbox is drained and reconciled".into());}
    let v2_pending:i64=tx.query_row("SELECT COUNT(*) FROM native_v2_outbox WHERE device_id=? AND state='PENDING'",[device_id],|row|row.get(0)).map_err(error)?;
    if v2_pending>0{return Err("A v2 command is awaiting acknowledgement; synchronize it before submitting another".into());}
    let client_sequence=last_sequence.checked_add(1).ok_or("V2 command sequence exhausted")?;
    let envelope=json!({"id":command.id,"schemaVersion":2,"deviceId":device_id,"actorId":actor_id,"operation":command.operation,"payload":command.payload,"expectedVersions":expected_versions,"allocationRefs":[],"clientSequence":client_sequence,"occurredAt":now()});
    tx.execute("INSERT INTO native_v2_outbox(command_id,device_id,actor_id,client_sequence,envelope,state,created_at) VALUES(?,?,?,?,?,'PENDING',?)",params![command.id,device_id,actor_id,client_sequence,envelope.to_string(),now()]).map_err(error)?;
    tx.commit().map_err(error)?;
    Ok(envelope)
}

pub fn next_native_v2_pending(db:&Connection,device_id:&str)->Result<Option<(String,String,Value)>>{
    let row:Option<(String,String,String)>=db.query_row("SELECT command_id,actor_id,envelope FROM native_v2_outbox WHERE device_id=? AND state='PENDING' ORDER BY client_sequence LIMIT 1",[device_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).optional().map_err(error)?;
    row.map(|(command_id,actor_id,envelope)|Ok((command_id,actor_id,serde_json::from_str(&envelope).map_err(error)?))).transpose()
}

pub fn mark_native_v2_attempt(db:&Connection,command_id:&str)->Result<()>{
    db.execute("UPDATE native_v2_outbox SET attempts=attempts+1 WHERE command_id=? AND state='PENDING'",[command_id]).map_err(error)?;
    Ok(())
}

pub fn acknowledge_native_v2_command(db:&mut Connection,result:&Value)->Result<Value>{
    let command_id=text(result,"commandId")?;
    let status=text(result,"status")?;
    let state=match status{"SYNCHRONIZED"=>"SYNCHRONIZED","CONFLICT"=>"CONFLICT","REJECTED"=>"REJECTED",_=>return Err("Server returned an unknown v2 command status".into())};
    let tx=db.transaction().map_err(error)?;
    let queued:Option<(String,String,i64,String)>=tx.query_row("SELECT device_id,actor_id,client_sequence,envelope FROM native_v2_outbox WHERE command_id=? AND state='PENDING'",[command_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).optional().map_err(error)?;
    let (device_id,actor_id,client_sequence,envelope)=queued.ok_or("V2 acknowledgement has no matching pending command")?;
    let envelope:Value=serde_json::from_str(&envelope).map_err(error)?;
    if result["commandId"].as_str()!=Some(command_id)||envelope["actorId"].as_str()!=Some(actor_id.as_str()){return Err("V2 acknowledgement identity mismatch".into());}
    let server_sequence=result.get("serverSequence").and_then(Value::as_i64);
    tx.execute("UPDATE native_v2_outbox SET state=?,result=?,server_sequence=?,acknowledged_at=? WHERE command_id=?",params![state,result.to_string(),server_sequence,now(),command_id]).map_err(error)?;
    tx.execute("UPDATE native_v2_state SET last_sequence=MAX(last_sequence,?),updated_at=? WHERE device_id=?",params![client_sequence,now(),device_id]).map_err(error)?;
    tx.commit().map_err(error)?;
    Ok(json!({"commandId":command_id,"recordIds":result["recordVersions"].as_array().into_iter().flatten().filter_map(|entry|entry["id"].as_str()).collect::<Vec<_>>(),"auditReference":result["auditReference"],"sequence":server_sequence.unwrap_or(client_sequence)}))
}

pub fn native_v2_snapshot(db:&Connection,token:&str,device_id:&str)->Result<Value>{
    let user=actor(db,token,false)?;
    let legacy_pending:i64=db.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|row|row.get(0)).map_err(error)?;
    if legacy_pending>0{return Err("Shared v2 view is blocked until pending legacy work is drained and reconciled".into());}
    let (business_id,feed_cursor,policy,complete,updated_at):(String,i64,Option<String>,i64,String)=db.query_row("SELECT business_id,feed_cursor,snapshot_policy,snapshot_complete,updated_at FROM native_v2_state WHERE device_id=?",[device_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?))).map_err(error)?;
    if complete!=1{return Err("The v2 shadow baseline has not been installed".into());}
    let mut statement=db.prepare("SELECT collection,record_id,version,data,archived FROM native_v2_records ORDER BY collection,record_id").map_err(error)?;
    let mut records=statement.query_map([],|row|{
        let data:String=row.get(3)?;
        let data=serde_json::from_str::<Value>(&data).map_err(|error|rusqlite::Error::FromSqlConversionFailure(3,rusqlite::types::Type::Text,Box::new(error)))?;
        Ok(json!({"collection":row.get::<_,String>(0)?,"id":row.get::<_,String>(1)?,"version":row.get::<_,i64>(2)?,"data":data,"archived":row.get::<_,i64>(4)?!=0}))
    }).map_err(error)?.collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
    if permissions(&user.role).contains(&"folio.room_charge"){
        let mut room_targets=Vec::new();
        for folio in records.iter().filter(|record|record["collection"]=="folios"&&record["archived"]==false&&record["data"]["status"]=="OPEN"){
            let Some(folio_id)=folio["id"].as_str() else{continue};
            let find=|collection:&str,id:&str|records.iter().find(|record|record["collection"]==collection&&record["id"]==id&&record["archived"]==false);
            let Some(reservation)=find("roomReservations",folio_id) else{continue};
            let Some(stay)=find("stays",folio_id) else{continue};
            if reservation["data"]["status"]!="CHECKED_IN"||stay["data"]["status"]!="CHECKED_IN"{continue;}
            let room=reservation["data"]["roomId"].as_str().and_then(|id|find("rooms",id));
            let customer=reservation["data"]["customerId"].as_str().and_then(|id|find("customers",id));
            room_targets.push(json!({"collection":"roomChargeTargets","id":folio_id,"version":folio["version"],"data":{"id":folio_id,"folioId":folio_id,"folioVersion":folio["version"],"roomId":reservation["data"]["roomId"],"roomNumber":room.map(|value|value["data"]["number"].clone()).unwrap_or(Value::Null),"guestName":customer.map(|value|value["data"]["name"].clone()).unwrap_or(Value::Null),"balanceMinor":folio["data"]["balanceMinor"]},"archived":false}));
        }
        records.extend(room_targets);
    }
    let pending:i64=db.query_row("SELECT COUNT(*) FROM native_v2_outbox WHERE state='PENDING'",[],|row|row.get(0)).map_err(error)?;
    Ok(json!({"records":records,"pendingCount":pending,"lastSync":updated_at,"lastBackup":meta(db,"last_backup")?,"terminalId":device_id,"installationStage":installation_stage(db)?,"actor":{"id":user.staff_id,"name":user.name,"role":user.role,"permissions":permissions(&user.role)},"v2":{"businessId":business_id,"feedCursor":feed_cursor,"policyVersion":policy}}))
}


pub const ALL_PERMISSIONS: &[&str] = &[
    "business.view","business.configure","business.tax.configure",
    "staff.view","staff.create","staff.update","staff.deactivate","staff.reset_pin","staff.change_role",
    "pos.sell","pos.open_tab","pos.manage_table","order.fire","order.transfer","order.merge","order.void","order.discount","order.comp","order.refund",
    "payment.record","payment.split","payment.reverse",
    "till.open","till.close","till.cashMovement","till.override_variance",
    "mpesa.record","mpesa.reconcile",
    "credit.view","credit.manage","credit.charge","credit.settle","credit.reconcile","credit.write_off","credit.override_limit",
    "catalog.view","catalog.manage","pricing.manage",
    "inventory.view","inventory.receive","inventory.transfer","inventory.waste","inventory.count","inventory.adjust",
    "procurement.view","procurement.manage","procurement.receive","procurement.over_receive","procurement.pay",
    "floorplan.view","floorplan.manage","rooms.view","rooms.manage","rooms.operate","rooms.guests.view","folio.view","folio.manage","folio.reverse","folio.room_charge","assets.view","assets.manage","assets.operate","maintenance.view","maintenance.manage","kds.view","kds.update",
    "accounting.view","reports.view","audit.view","data.import.view","data.import.stage","data.import.execute","backup.create","backup.restore","sync.manual","system.configure","help.view"
];

pub fn permissions(role: &str) -> Vec<&'static str> {
    match role {
        "Admin" => ALL_PERMISSIONS.to_vec(),
        "Manager" => ALL_PERMISSIONS.iter().copied().filter(|p| ![
            "business.configure","business.tax.configure","staff.change_role","data.import.execute","backup.restore","system.configure"
        ].contains(p)).collect(),
        "Cashier" | "Server" => vec![
            "business.view","staff.view","pos.sell","pos.open_tab","pos.manage_table","order.fire",
            "payment.record","payment.split","till.open","till.close","mpesa.record","credit.view","credit.charge","credit.settle",
            "catalog.view","inventory.view","procurement.view","procurement.receive","floorplan.view","folio.room_charge","kds.view","kds.update","help.view"
        ],
        "Chef" => vec!["business.view","kds.view","kds.update","help.view"],
        "Housekeeper" => vec!["business.view","rooms.view","rooms.operate","help.view"],
        "Accountant" => vec!["business.view","accounting.view","reports.view","payments.view","audit.view","credit.view","credit.settle","credit.reconcile","credit.write_off","mpesa.reconcile","help.view"],
        "Custom" => vec!["business.view","help.view"],
        _ => Vec::new(),
    }
}

pub const STAFF_ROLES: &[&str] = &["Admin","Manager","Cashier","Server","Chef","Housekeeper","Accountant","Custom"];

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
        "order.compItem","payment.record","payment.split","payment.refund","payment.reverse","mpesa.reconcile","mpesa.discrepancy","mpesa.discrepancy.resolve","order.assignCustomer","customerCredit.configure","customerCredit.charge","customerCredit.settle","customerCredit.reconcile","customerCredit.discrepancy","customerCredit.discrepancy.resolve","customerCredit.writeOff","customerCredit.reverse",
        "inventory.receive","inventory.adjust","inventory.countLocation","inventory.waste","inventory.transfer","procurement.receiveDelivery","purchaseOrder.create","purchaseOrder.receive","supplierPayable.matchInvoice","supplierPayable.pay","table.ready","closeDay.generate","roomReservation.create","roomReservation.update","roomReservation.cancel","roomReservation.noShow","stay.checkIn","stay.move","stay.extend","stay.checkOut","folio.open","folio.postAccommodation","folio.postService","folio.deposit","folio.pay","folio.applyDeposit","folio.refundDeposit","folio.reverse","pos.roomCharge","asset.commission","asset.assign","asset.return","asset.transfer","asset.inspect","asset.lose","asset.retire","asset.dispose","maintenance.report","maintenance.assign","maintenance.start","maintenance.complete","maintenance.cancel"];
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
    initialize_from_intake_with_admin_id(db,terminal,pin,profile,&id())
}
pub fn initialize_from_intake_with_admin_id(
    db: &mut Connection,
    terminal: &str,
    pin: &str,
    profile: &Value,
    admin_staff_id: &str,
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

    let admin_id = if admin_staff_id.trim().is_empty(){return Err("Initial Administrator staff ID is required".into());}else{admin_staff_id.to_string()};
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
        "roomStayRoomTypeId":null,"roomStayRatePlanId":null,"nightlyCheckoutTime":"10:00","dayStayCutoffTime":"18:00",
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

pub fn guidance_progress(db: &Connection, token: &str) -> Result<Value> {
    let user = actor(db, token, true)?;
    let mut stmt = db.prepare("SELECT guide_id,guide_version,state,current_step_id,completed_step_ids,updated_at FROM guidance_progress WHERE staff_id=? ORDER BY updated_at DESC").map_err(error)?;
    let rows = stmt.query_map([user.staff_id], |row| {
        let completed: String = row.get(4)?;
        Ok(json!({
            "guideId":row.get::<_,String>(0)?,
            "guideVersion":row.get::<_,i64>(1)?,
            "state":row.get::<_,String>(2)?,
            "currentStepId":row.get::<_,Option<String>>(3)?,
            "completedStepIds":serde_json::from_str::<Value>(&completed).unwrap_or(json!([])),
            "updatedAt":row.get::<_,String>(5)?
        }))
    }).map_err(error)?;
    let items = rows.collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
    Ok(json!(items))
}

pub fn save_guidance_progress(db: &Connection, token: &str, progress: Value) -> Result<Value> {
    let user = actor(db, token, true)?;
    let guide_id = progress.get("guideId").and_then(Value::as_str).unwrap_or("").trim();
    if guide_id.is_empty() || guide_id.len() > 120 || !guide_id.chars().all(|c| c.is_ascii_alphanumeric() || ".-_".contains(c)) {
        return Err("Invalid guidance guide ID".into());
    }
    let guide_version = progress.get("guideVersion").and_then(Value::as_i64).filter(|v| *v > 0).ok_or("Invalid guidance version")?;
    let state = progress.get("state").and_then(Value::as_str).ok_or("Invalid guidance state")?;
    if !["IN_PROGRESS","COMPLETED","DISMISSED"].contains(&state) { return Err("Invalid guidance state".into()); }
    let current_step = progress.get("currentStepId").and_then(Value::as_str).filter(|s| !s.is_empty());
    if current_step.is_some_and(|s| s.len() > 120 || !s.chars().all(|c| c.is_ascii_alphanumeric() || ".-_".contains(c))) {
        return Err("Invalid guidance step ID".into());
    }
    let completed = progress.get("completedStepIds").and_then(Value::as_array).ok_or("Invalid completed guidance steps")?;
    if completed.len() > 100 || completed.iter().any(|s| s.as_str().is_none_or(|v| v.is_empty() || v.len() > 120 || !v.chars().all(|c| c.is_ascii_alphanumeric() || ".-_".contains(c)))) {
        return Err("Invalid completed guidance steps".into());
    }
    let completed_json = serde_json::to_string(completed).map_err(error)?;
    let updated_at = Utc::now().to_rfc3339();
    db.execute("INSERT INTO guidance_progress(staff_id,guide_id,guide_version,state,current_step_id,completed_step_ids,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(staff_id,guide_id) DO UPDATE SET guide_version=excluded.guide_version,state=excluded.state,current_step_id=excluded.current_step_id,completed_step_ids=excluded.completed_step_ids,updated_at=excluded.updated_at", params![user.staff_id,guide_id,guide_version,state,current_step,completed_json,updated_at]).map_err(error)?;
    Ok(json!({"guideId":guide_id,"guideVersion":guide_version,"state":state,"currentStepId":current_step,"completedStepIds":completed,"updatedAt":updated_at}))
}

pub fn inventory_count_draft(db: &Connection, token: &str, location_id: &str) -> Result<Value> {
    let user=actor(db,token,true)?;
    if location_id.trim().is_empty() || location_id.len()>120 { return Err("Invalid Storage Place".into()); }
    get(db,"stockLocations",location_id)?;
    let saved:Option<(String,String)>=db.query_row("SELECT payload,updated_at FROM inventory_count_drafts WHERE staff_id=? AND location_id=?",params![user.staff_id,location_id],|row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(error)?;
    if let Some((payload,updated_at))=saved {
        let mut draft:Value=serde_json::from_str(&payload).map_err(error)?;
        draft["updatedAt"]=json!(updated_at);
        Ok(draft)
    } else { Ok(Value::Null) }
}

pub fn save_inventory_count_draft(db: &Connection, token: &str, location_id: &str, draft: Value) -> Result<Value> {
    let user=actor(db,token,true)?;
    let tx=db.unchecked_transaction().map_err(error)?;
    let session_id=text(&draft,"sessionId")?;
    if session_id.len()>120 { return Err("Invalid count session identity".into()); }
    let revision=draft["revision"].as_u64().filter(|n|*n>0 && *n<i64::MAX as u64).ok_or("Count session revision is required")?;
    let closed:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM inventory_count_closed_sessions WHERE staff_id=? AND session_id=?)",params![user.staff_id,session_id],|r|r.get(0)).map_err(error)?;
    if closed { return Err("This count session is already closed".into()); }
    let previous=inventory_count_draft(&tx,token,location_id)?;
    if !previous.is_null() && !previous["sessionId"].is_null() {
        if previous["sessionId"]!=draft["sessionId"] { return Err("Another count session exists at this Storage Place".into()); }
        let old_revision=previous["revision"].as_u64().unwrap_or(0);
        if revision<old_revision { return Err("CONFLICT: count draft revision changed".into()); }
        if revision>old_revision && !previous["pendingCommand"].is_null() { return Err("Retry the reviewed count before editing this session".into()); }
    }
    if location_id.trim().is_empty() || location_id.len()>120 { return Err("Invalid Storage Place".into()); }
    get(db,"stockLocations",location_id)?;
    let counts=draft.get("counts").and_then(Value::as_object).ok_or("Count draft quantities are required")?;
    let scan_counts=draft.get("scanCounts").and_then(Value::as_object).ok_or("Count draft scan totals are required")?;
    if counts.len()>5000 || scan_counts.len()>5000 { return Err("Count draft contains too many stock items".into()); }
    let active:std::collections::HashSet<String>=list(db,"stockItems")?.iter().filter_map(|record|record["id"].as_str().map(str::to_string)).collect();
    let mut clean_counts=serde_json::Map::new();
    let mut clean_scans=serde_json::Map::new();
    for (stock_id,value) in counts {
        if !active.contains(stock_id) { return Err("Count draft refers to a stock item that is no longer active".into()); }
        let amount=value.as_f64().ok_or("Count draft quantities must be numeric")?;
        if !amount.is_finite() || amount<0.0 || amount>1_000_000_000.0 || (amount*1_000_000.0-(amount*1_000_000.0).round()).abs()>0.00001 { return Err("Count draft quantities must be non-negative with at most six decimals".into()); }
        clean_counts.insert(stock_id.clone(),json!(amount));
    }
    for (stock_id,value) in scan_counts {
        if !active.contains(stock_id) { return Err("Count draft refers to a stock item that is no longer active".into()); }
        let scans=value.as_u64().filter(|count|*count<=1_000_000).ok_or("Count draft scan totals are invalid")?;
        if scans>0 { clean_scans.insert(stock_id.clone(),json!(scans)); }
    }
    if scan_counts.keys().any(|stock_id|!counts.contains_key(stock_id)) { return Err("Count draft scan totals do not match counted items".into()); }
    let unknown=draft.get("unknownScans").and_then(Value::as_array).ok_or("Unknown barcode list is required")?;
    if unknown.len()>500 { return Err("Count draft has too many unrecognized barcodes".into()); }
    let mut clean_unknown=Vec::with_capacity(unknown.len());
    for entry in unknown {
        let barcode=text(entry,"barcode")?.trim();
        let count=entry["count"].as_u64().filter(|count|*count>0&&*count<=1_000_000).ok_or("Unknown barcode scan total is invalid")?;
        if barcode.len()>128 { return Err("Unknown barcode cannot exceed 128 characters".into()); }
        clean_unknown.push(json!({"barcode":barcode,"count":count}));
    }
    let updated_at=now();
    let baseline=draft["baseline"].as_object().filter(|b|b.len()<=5000).ok_or("Count baseline is required")?;
    for (stock_id,entry) in baseline {
        if stock_id.len()>120 { return Err("Invalid count item identity".into()); }
        quantity(entry,"expectedQuantity")?;
        text(entry,"name")?; text(entry,"baseUnit")?;
        if quantity(entry,"scanUnitQuantity")?<=0.0 { return Err("Invalid scan quantity".into()); }
    }
    if counts.keys().any(|key|!baseline.contains_key(key)) { return Err("Counted items require a saved baseline".into()); }
    let mut clean=json!({"sessionId":session_id,"revision":revision,"baseline":baseline,"locationId":location_id,"counts":clean_counts,"scanCounts":clean_scans,"unknownScans":clean_unknown,"updatedAt":updated_at});
    if let Some(pending)=draft.get("pendingCommand").filter(|p|!p.is_null()) {
        text(pending,"id")?;
        if pending["payload"]["draftSessionId"]!=session_id || pending["payload"]["draftRevision"]!=revision || pending["payload"]["locationId"]!=location_id { return Err("Reviewed count does not match its draft".into()); }
        clean["pendingCommand"]=pending.clone();
    }
    if previous["revision"].as_u64()==Some(revision) {
        let mut old=previous.clone(); let mut incoming=clean.clone();
        old.as_object_mut().unwrap().remove("updatedAt"); incoming.as_object_mut().unwrap().remove("updatedAt");
        if old==incoming { return Ok(previous); }
        return Err("CONFLICT: count draft revision changed".into());
    }
    let encoded=serde_json::to_string(&clean).map_err(error)?;
    tx.execute("INSERT INTO inventory_count_drafts(staff_id,location_id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(staff_id,location_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",params![user.staff_id,location_id,encoded,updated_at]).map_err(error)?;
    tx.commit().map_err(error)?;
    Ok(clean)
}

pub fn clear_inventory_count_draft(db: &Connection, token: &str, location_id: &str) -> Result<()> {
    let user=actor(db,token,true)?;
    let tx=db.unchecked_transaction().map_err(error)?;
    let draft=inventory_count_draft(&tx,token,location_id)?;
    if let Some(session_id)=draft["sessionId"].as_str() {
        tx.execute("INSERT OR IGNORE INTO inventory_count_closed_sessions(staff_id,session_id,closed_at) VALUES(?,?,?)",params![user.staff_id,session_id,now()]).map_err(error)?;
    }
    tx.execute("DELETE FROM inventory_count_drafts WHERE staff_id=? AND location_id=?",params![user.staff_id,location_id]).map_err(error)?;
    tx.commit().map_err(error)?;
    Ok(())
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
    if ingredients.is_empty(){if let Some(stock)=product["stockItemId"].as_str(){let volume=selected_portion.as_ref().and_then(|v|v["volume"].as_f64()).or_else(||product["portionVolume"].as_f64()).unwrap_or(1.0);let container=product["portionVolume"].as_f64().unwrap_or(0.0);let inventory_type=product["inventoryType"].as_str().or_else(||product["category"].as_str()).unwrap_or("").to_ascii_uppercase();let measured_spirit=["SPIRIT","SPIRITS","WINE"].contains(&inventory_type.as_str());let whole_container_sale=measured_spirit&&container>0.0&&(volume-container).abs()<0.000001;ingredients.push(json!({"stockItemId":stock,"quantity":volume,"tracked":true,"wholeContainerSale":whole_container_sale,"containerSize":if measured_spirit{json!(container)}else{Value::Null}}));}}
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
        | "events" | "promoters" | "reservations" | "waitlist" | "housekeeping" | "maintenance"
            => Some("business.configure"),
        "stockItems" | "stockLocations" => Some("inventory.adjust"),
        "tables" => Some("floorplan.manage"),
        "priceRules" => Some("pricing.manage"),
        "suppliers" => Some("procurement.manage"),
        "products" | "customers" | "recipes" => Some("catalog.manage"),
        _ => None,
    }
}
// SERVOS_PATCH_05_ROOMS_ENGINE
fn room_parse_time(raw:&str)->Result<chrono::DateTime<Utc>>{
    chrono::DateTime::parse_from_rfc3339(raw)
        .map(|v|v.with_timezone(&Utc))
        .map_err(|_|"VALIDATION_FAILED: room timestamps must be RFC3339".to_string())
}
fn room_overlap(a_start:chrono::DateTime<Utc>,a_end:chrono::DateTime<Utc>,b_start:chrono::DateTime<Utc>,b_end:chrono::DateTime<Utc>)->bool{
    a_start<b_end && b_start<a_end
}
fn room_any(tx:&Transaction,collection:&str,key:&str)->Result<Option<(i64,Value,bool)>>{
    tx.query_row(
        "SELECT version,data,archived FROM records WHERE collection=? AND id=?",
        params![collection,key],
        |r|{
            let raw:String=r.get(1)?;
            Ok((r.get(0)?,serde_json::from_str::<Value>(&raw).unwrap_or_else(|_|json!({})),r.get(2)?))
        }
    ).optional().map_err(error)
}
fn room_expect_version(current:Option<&(i64,Value,bool)>,expected:Option<i64>)->Result<()>{
    if current.map(|v|v.0)!=expected{return Err("CONFLICT: Room record changed; reload before saving".into());}
    Ok(())
}
fn room_put_archived(tx:&Transaction,collection:&str,key:&str,archived:bool,changes:&mut Vec<Value>)->Result<()>{
    let (version,data,_)=room_any(tx,collection,key)?.ok_or("Room master record not found")?;
    tx.execute(
        "UPDATE records SET archived=?,version=version+1 WHERE collection=? AND id=?",
        params![archived,collection,key]
    ).map_err(error)?;
    changes.push(json!({"collection":collection,"id":key,"version":version+1,"data":data,"archived":archived}));
    Ok(())
}
fn room_unique_text(tx:&Transaction,collection:&str,field:&str,key:&str,value:&str)->Result<()>{
    for record in list(tx,collection)?{
        if record["id"].as_str()==Some(key){continue;}
        if record["data"][field].as_str().is_some_and(|v|v.trim().eq_ignore_ascii_case(value.trim())){
            return Err(format!("DUPLICATE_REFERENCE: {field} already exists"));
        }
    }
    Ok(())
}
fn room_active_reference(tx:&Transaction,collection:&str,field:&str,key:&str,statuses:&[&str])->Result<bool>{
    Ok(list(tx,collection)?.iter().any(|r|
        r["data"][field].as_str()==Some(key) &&
        (statuses.is_empty() || statuses.contains(&r["data"]["status"].as_str().unwrap_or("")))
    ))
}
fn room_available(tx:&Transaction,room_id:&str,start:chrono::DateTime<Utc>,end:chrono::DateTime<Utc>,excluding:Option<&str>)->Result<()>{
    if end<=start{return Err("VALIDATION_FAILED: room interval".into());}
    let (_,room)=get(tx,"rooms",room_id)?;
    if room["maintenanceState"].as_str().unwrap_or("AVAILABLE")!="AVAILABLE"{
        return Err("ROOM_UNAVAILABLE: room is out of order".into());
    }
    for record in list(tx,"roomReservations")?{
        if excluding.is_some_and(|id|record["id"].as_str()==Some(id)){continue;}
        let data=&record["data"];
        if data["roomId"].as_str()!=Some(room_id){continue;}
        if !["RESERVED","CHECKED_IN"].contains(&data["status"].as_str().unwrap_or("")){continue;}
        let existing_start=room_parse_time(data["occupancyStartsAt"].as_str().or_else(||data["startsAt"].as_str()).ok_or("Invalid reservation start")?)?;
        let existing_end=room_parse_time(data["blockedUntil"].as_str().ok_or("Invalid reservation turnaround interval")?)?;
        if room_overlap(start,end,existing_start,existing_end){return Err("ROOM_UNAVAILABLE: reservation overlap".into());}
    }
    for record in list(tx,"roomBlocks")?{
        let data=&record["data"];
        if data["roomId"].as_str()!=Some(room_id)||data["status"].as_str()!=Some("ACTIVE"){continue;}
        let block_start=room_parse_time(data["startsAt"].as_str().ok_or("Invalid room block start")?)?;
        let block_end=room_parse_time(data["endsAt"].as_str().ok_or("Invalid room block end")?)?;
        if room_overlap(start,end,block_start,block_end){return Err("ROOM_UNAVAILABLE: availability block".into());}
    }
    Ok(())
}
fn room_nightly_units(start:chrono::DateTime<Utc>,end:chrono::DateTime<Utc>)->i64{
    let local_start=(start+Duration::hours(3)).date_naive();
    let local_end=(end+Duration::hours(3)).date_naive();
    (local_end-local_start).num_days()
}
fn room_stay_policy(property:&Value)->Result<(String,String)>{
    let checkout=property["nightlyCheckoutTime"].as_str().unwrap_or("10:00").to_string();
    let cutoff=property["dayStayCutoffTime"].as_str().unwrap_or("18:00").to_string();
    if parse_clock(&checkout).is_none()||parse_clock(&cutoff).is_none(){return Err("VALIDATION_FAILED: room stay policy times".into());}
    Ok((checkout,cutoff))
}
fn room_local_minutes(value:chrono::DateTime<Utc>)->i32{
    let local=value+Duration::hours(3);
    (local.hour() as i32)*60+local.minute() as i32
}
fn room_local_date(value:chrono::DateTime<Utc>)->chrono::NaiveDate{(value+Duration::hours(3)).date_naive()}
fn room_validate_interval(start:chrono::DateTime<Utc>,end:chrono::DateTime<Utc>)->Result<()>{
    if end<=start{return Err("VALIDATION_FAILED: stay interval".into());}
    if end-start>Duration::days(366){return Err("VALIDATION_FAILED: stay cannot exceed 366 days".into());}
    Ok(())
}
// SERVOS_PATCH_07_FOLIOS
fn folio_minor(v:&Value,key:&str)->Result<i64>{
    let value=v.get(key).and_then(Value::as_i64).ok_or_else(||format!("{key} must be an integer minor-unit amount"))?;
    if value<0||value>9_000_000_000_000_000{return Err(format!("VALIDATION_FAILED: {key}"));} Ok(value)
}
fn folio_unique_external_reference(tx:&Transaction,method:&str,reference:&str)->Result<()>{
    let normalized=reference.trim().to_ascii_uppercase();
    if normalized.is_empty(){return Err("VALIDATION_FAILED: external reference is required".into());}
    for record in list(tx,"payments")?{
        let p=&record["data"];
        if p["tenderType"].as_str()==Some(method)
            && p["referenceNumber"].as_str().is_some_and(|v|v.trim().eq_ignore_ascii_case(&normalized)){
            return Err("DUPLICATE_REFERENCE: external payment already recorded".into());
        }
    }
    Ok(())
}
fn folio_journal(tx:&Transaction,source_type:&str,source_id:&str,memo:&str,lines:Vec<Value>,changes:&mut Vec<Value>)->Result<String>{
    let debit:i64=lines.iter().map(|l|l["debitMinor"].as_i64().unwrap_or(0)).sum();
    let credit:i64=lines.iter().map(|l|l["creditMinor"].as_i64().unwrap_or(0)).sum();
    if debit!=credit{return Err("Journal is not balanced".into());}
    let journal_id=id();let stamp=now();
    put(tx,"journalEntries",&journal_id,json!({
        "id":journal_id,"entryNumber":format!("JE-{}",&journal_id[..8]),"propertyId":"property",
        "occurredAt":stamp,"postedAt":stamp,"sourceType":source_type,"sourceId":source_id,"memo":memo,
        "lines":lines,"totalDebit":debit as f64/100.0,"totalCredit":credit as f64/100.0,"balanced":true
    }),changes)?;
    Ok(journal_id)
}
fn folio_entry(tx:&Transaction,folio_id:&str,entry_id:&str,details:Value,balance_delta:i64,deposit_delta:i64,changes:&mut Vec<Value>)->Result<()>{
    if room_any(tx,"folioEntries",entry_id)?.is_some(){return Err("DUPLICATE_REFERENCE: folio entry already exists".into());}
    let (version,mut folio)=get(tx,"folios",folio_id)?;
    if folio["status"].as_str()!=Some("OPEN"){return Err("INVALID_STATE: folio closed".into());}
    let balance=folio["balanceMinor"].as_i64().unwrap_or(0).checked_add(balance_delta).ok_or("VALIDATION_FAILED: folio balance overflow")?;
    let deposit=folio["depositMinor"].as_i64().unwrap_or(0).checked_add(deposit_delta).ok_or("VALIDATION_FAILED: folio deposit overflow")?;
    if balance<0||deposit<0||balance>9_000_000_000_000_000||deposit>9_000_000_000_000{return Err("VALIDATION_FAILED: folio balance/deposit bounds".into());}
    let mut entry=details;
    entry["id"]=json!(entry_id);entry["folioId"]=json!(folio_id);entry["balanceDeltaMinor"]=json!(balance_delta);
    entry["depositDeltaMinor"]=json!(deposit_delta);entry["postedAt"]=json!(now());
    put(tx,"folioEntries",entry_id,entry,changes)?;
    folio["balanceMinor"]=json!(balance);folio["depositMinor"]=json!(deposit);folio["updatedAt"]=json!(now());
    put(tx,"folios",folio_id,folio,changes)?;
    let _=version;
    Ok(())
}
fn folio_charge(tx:&Transaction,folio_id:&str,entry_id:&str,gross:i64,tax_bps:i64,revenue_account:&str,details:Value,changes:&mut Vec<Value>)->Result<()>{
    if gross<0||gross>100_000_000_000_000||!(0..=10_000).contains(&tax_bps){return Err("VALIDATION_FAILED: charge money/tax".into());}
    let denominator=10_000i128+tax_bps as i128;
    let numerator=gross as i128*tax_bps as i128;
    let tax=((numerator+denominator/2)/denominator) as i64;
    let net=gross-tax;
    if gross>0{
        let mut lines=vec![
            json!({"id":id(),"accountId":"GUEST_RECEIVABLE","accountCode":"GUEST_RECEIVABLE","accountName":"Guest receivable","debit":gross as f64/100.0,"credit":0,"debitMinor":gross,"creditMinor":0}),
            json!({"id":id(),"accountId":revenue_account,"accountCode":revenue_account,"accountName":revenue_account,"debit":0,"credit":net as f64/100.0,"debitMinor":0,"creditMinor":net})
        ];
        if tax>0{lines.push(json!({"id":id(),"accountId":"TAX_PAYABLE","accountCode":"TAX_PAYABLE","accountName":"Tax payable","debit":0,"credit":tax as f64/100.0,"debitMinor":0,"creditMinor":tax}));}
        folio_journal(tx,"FOLIO",folio_id,"Folio charge",lines,changes)?;
    }
    let mut data=details;data["kind"]=json!("CHARGE");data["grossMinor"]=json!(gross);data["netMinor"]=json!(net);
    data["taxMinor"]=json!(tax);data["taxBasisPoints"]=json!(tax_bps);data["revenueAccount"]=json!(revenue_account);
    folio_entry(tx,folio_id,entry_id,data,gross,0,changes)
}
fn folio_period_key(folio_id:&str,period:i64)->String{
    let mut hasher=Sha256::new();hasher.update(format!("{folio_id}:{period}").as_bytes());
    format!("accommodation-{:x}",hasher.finalize())
}
fn folio_post_accommodation(tx:&Transaction,folio_id:&str,settle_booked:bool,changes:&mut Vec<Value>)->Result<()>{
    let (_,booking)=get(tx,"roomReservations",folio_id)?;let (_,stay)=get(tx,"stays",folio_id)?;
    if booking["status"].as_str()!=Some("CHECKED_IN")||stay["status"].as_str()!=Some("CHECKED_IN"){return Err("INVALID_STATE: accommodation requires active stay".into());}
    let rate=&booking["rateSnapshot"];let units=booking["units"].as_i64().ok_or("Reservation units are invalid")?;
    let start=room_parse_time(text(&booking,"startsAt")?)?;
    for period in 0..units{
        let due=start+Duration::days(period);
        if !settle_booked&&due>Utc::now(){continue;}
        let entry_id=folio_period_key(folio_id,period);
        if room_any(tx,"folioEntries",&entry_id)?.is_some(){continue;}
        let gross=rate["priceMinor"].as_i64().ok_or("Rate snapshot price is invalid")?;
        let tax_bps=rate["taxBasisPoints"].as_i64().unwrap_or(0);
        folio_charge(tx,folio_id,&entry_id,gross,tax_bps,"ACCOMMODATION_REVENUE",json!({
            "sourceType":"ACCOMMODATION","reservationId":folio_id,"period":period,
            "periodStartsAt":due.to_rfc3339(),"rateSnapshot":rate,
            "description":if rate["mode"].as_str()==Some("DAY_USE"){"Day-use accommodation"}else{"Nightly accommodation"}
        }),changes)?;
    }
    Ok(())
}
fn folio_active_till(tx:&Transaction)->Result<(String,Value)>{
    let active=list(tx,"tillSessions")?.into_iter().find(|v|v["data"]["status"]=="OPEN").ok_or("Open a till before accepting or paying out cash")?;
    Ok((active["id"].as_str().unwrap_or("").to_string(),active["data"].clone()))
}
fn folio_record_funds(tx:&Transaction,user:&Session,folio_id:&str,purpose:&str,p:&Value,changes:&mut Vec<Value>)->Result<String>{
    let amount=folio_minor(p,"amountMinor")?;if amount<=0{return Err("VALIDATION_FAILED: positive payment required".into());}
    let method=text(p,"method")?.to_ascii_uppercase();
    if !["CASH","MPESA","CARD"].contains(&method.as_str()){return Err("VALIDATION_FAILED: payment method".into());}
    if !permissions(&user.role).contains(&"payment.record"){return Err("Permission required: payment.record".into());}
    let (_,config)=get(tx,"paymentConfig","main")?;
    if !config["methods"].as_array().is_some_and(|v|v.iter().any(|m|m.as_str()==Some(method.as_str()))){return Err(format!("{method} is not enabled for this business"));}
    let mut reference=id();let mut receipt_id:Option<String>=None;let (active_till_id,mut active_till)=folio_active_till(tx)?;
    let till_id:Option<String>=Some(active_till_id.clone());let mut cash_tendered:Option<i64>=None;let mut change_minor:Option<i64>=None;
    if method=="CASH"{
        let tender=folio_minor(p,"cashTenderedMinor")?;if tender<amount{return Err("VALIDATION_FAILED: cash tendered".into());}
        cash_tendered=Some(tender);change_minor=Some(tender-amount);
        active_till["expectedCashInDrawer"]=json!((money(&active_till,"expectedCashInDrawer")?+amount) as f64/100.0);
        active_till["hotelCashReceived"]=json!((money(&active_till,"hotelCashReceived").unwrap_or(0)+amount) as f64/100.0);
        put(tx,"tillSessions",&active_till_id,active_till,changes)?;
    }else{
        if p["manuallyConfirmed"]!=true{return Err("VALIDATION_FAILED: manual payment confirmation required".into());}
        reference=text(p,"reference")?.trim().to_ascii_uppercase();
        if method=="MPESA"{
            if reference.len()<6||reference.len()>20||!reference.chars().all(|c|c.is_ascii_alphanumeric()){return Err("Enter a valid M-Pesa transaction code".into());}
            let account=text(p,"account")?.trim();
            let allowed=config["mpesaAccounts"].as_array().is_some_and(|a|a.iter().any(|x|x["number"].as_str()==Some(account)));
            if !allowed{return Err("Choose a configured business M-Pesa account".into());}
            let existing:Option<String>=tx.query_row("SELECT receipt_id FROM mpesa_codes WHERE account=? AND code=?",params![account,reference],|r|r.get(0)).optional().map_err(error)?;
            if existing.is_some(){return Err("DUPLICATE_REFERENCE: external payment already recorded".into());}
            let rid=id();let customer_id=get(tx,"folios",folio_id)?.1["customerId"].clone();
            tx.execute("INSERT INTO mpesa_codes VALUES(?,?,?)",params![account,reference,rid]).map_err(error)?;
            put(tx,"mpesaReceipts",&rid,json!({
                "id":rid,"code":reference,"account":account,"receivedAmount":amount as f64/100.0,"receivedAt":now(),
                "allocatedAmount":amount as f64/100.0,"unappliedAmount":0,"reconciliationStatus":"AWAITING_RECONCILIATION",
                "cashierId":user.staff_id,"customerId":customer_id
            }),changes)?;
            receipt_id=Some(rid);
        }else{
            folio_unique_external_reference(tx,&method,&reference)?;
        }
    }
    let payment_id=id();let stamp=now();
    put(tx,"payments",&payment_id,json!({
        "id":payment_id,"folioId":folio_id,"purpose":purpose,"amount":amount as f64/100.0,"amountMinor":amount,
        "currency":"KES","tenderType":method,"status":"PAID","referenceNumber":reference,"mpesaReceiptId":receipt_id,
        "tillSessionId":till_id,"occurredAt":stamp,"cashierId":user.staff_id,"cashierName":user.name,
        "confirmation":if method=="CASH"{"CASH_RECEIVED"}else{"MANUALLY_CONFIRMED"},
        "cashTenderedMinor":cash_tendered,"changeMinor":change_minor
    }),changes)?;
    let debit=if method=="CASH"{"CASH"}else{method.as_str()};
    let credit=if purpose=="DEPOSIT"{"GUEST_DEPOSITS"}else{"GUEST_RECEIVABLE"};
    folio_journal(tx,"FOLIO_PAYMENT",&payment_id,"Guest funds",vec![
        json!({"id":id(),"accountId":debit,"accountCode":debit,"accountName":debit,"debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0}),
        json!({"id":id(),"accountId":credit,"accountCode":credit,"accountName":credit,"debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount})
    ],changes)?;
    Ok(payment_id)
}
fn folio_refund_deposit(tx:&Transaction,user:&Session,folio_id:&str,p:&Value,changes:&mut Vec<Value>)->Result<()>{
    let (_,folio)=get(tx,"folios",folio_id)?;let amount=folio_minor(p,"amountMinor")?;
    if amount<=0||amount>folio["depositMinor"].as_i64().unwrap_or(0){return Err("VALIDATION_FAILED: deposit refund exceeds unapplied deposit".into());}
    let method=text(p,"method")?.to_ascii_uppercase();
    if !["CASH","MPESA","CARD"].contains(&method.as_str()){return Err("VALIDATION_FAILED: refund method".into());}
    let (_,config)=get(tx,"paymentConfig","main")?;
    if !config["methods"].as_array().is_some_and(|v|v.iter().any(|m|m.as_str()==Some(method.as_str()))){return Err(format!("{method} is not enabled for this business"));}
    let reference=if method=="CASH"{p.get("reference").and_then(Value::as_str).unwrap_or("").trim().to_ascii_uppercase()}else{
        if p["manuallyConfirmed"]!=true{return Err("VALIDATION_FAILED: manual payout confirmation required".into());}
        let r=text(p,"reference")?.trim().to_ascii_uppercase();
        if list(tx,"refunds")?.iter().any(|x|x["data"]["externalReference"].as_str().is_some_and(|v|v.eq_ignore_ascii_case(&r))){return Err("DUPLICATE_REFERENCE: payout already recorded".into());}
        r
    };
    let (active_till_id,mut active_till)=folio_active_till(tx)?;let till_id:Option<String>=Some(active_till_id.clone());
    if method=="CASH"{
        let expected=money(&active_till,"expectedCashInDrawer")?;if amount>expected{return Err("Cash refund exceeds expected cash in drawer".into());}
        active_till["cashPaidOut"]=json!((money(&active_till,"cashPaidOut")?+amount) as f64/100.0);active_till["expectedCashInDrawer"]=json!((expected-amount) as f64/100.0);
        put(tx,"tillSessions",&active_till_id,active_till,changes)?;
    }
    let refund_id=id();put(tx,"refunds",&refund_id,json!({
        "id":refund_id,"folioId":folio_id,"kind":"DEPOSIT_REFUND","amount":amount as f64/100.0,"amountMinor":amount,
        "tenderType":method,"externalReference":reference,"tillSessionId":till_id,"reason":text(p,"reason")?,
        "refundedBy":user.staff_id,"refundedAt":now()
    }),changes)?;
    folio_journal(tx,"FOLIO_REFUND",&refund_id,"Refund guest deposit",vec![
        json!({"id":id(),"accountId":"GUEST_DEPOSITS","accountCode":"GUEST_DEPOSITS","accountName":"Guest deposits","debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0}),
        json!({"id":id(),"accountId":method,"accountCode":method,"accountName":method,"debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount})
    ],changes)?;
    folio_entry(tx,folio_id,&format!("entry-{}",id()),json!({"kind":"DEPOSIT_REFUND","refundId":refund_id,"amountMinor":amount}),0,-amount,changes)
}
fn hotel_receipt_capture(tx:&Transaction,user:&Session,folio_id:&str,command_id:&str,changes:&mut Vec<Value>)->Result<String>{
    let (_,folio)=get(tx,"folios",folio_id)?;let (_,booking)=get(tx,"roomReservations",folio_id)?;
    let (_,business)=get(tx,"organization","business")?;let (_,property)=get(tx,"property","property")?;
    let room=get(tx,"rooms",text(&booking,"roomId")?).map(|(_,v)|v).unwrap_or(json!({}));
    let customer=get(tx,"customers",text(&booking,"customerId")?).map(|(_,v)|v).unwrap_or(json!({}));
    let entries:Vec<Value>=list(tx,"folioEntries")?.into_iter().map(|r|r["data"].clone()).filter(|e|e["folioId"]==folio_id).collect();
    let items:Vec<Value>=entries.iter().filter(|e|["CHARGE","POS_ROOM_CHARGE","REVERSAL"].contains(&e["kind"].as_str().unwrap_or(""))).map(|e|{
        let amount=e["balanceDeltaMinor"].as_i64().unwrap_or(0);
        json!({"id":e["id"],"description":e["description"].as_str().unwrap_or(e["sourceType"].as_str().unwrap_or("Folio entry")),"quantity":e["quantity"].as_i64().unwrap_or(1),"unitPriceMinor":if e["quantity"].as_i64().unwrap_or(1)>0{amount/e["quantity"].as_i64().unwrap_or(1)}else{amount},"amountMinor":amount,"portion":Value::Null,"modifiers":[]})
    }).collect();
    let total:i64=items.iter().map(|i|i["amountMinor"].as_i64().unwrap_or(0)).sum();
    let tax:i64=entries.iter().map(|e|e["taxMinor"].as_i64().unwrap_or(0)).sum();
    let levy:i64=entries.iter().map(|e|e["levyMinor"].as_i64().unwrap_or(0)).sum();
    let payments:Vec<Value>=list(tx,"payments")?.into_iter().map(|r|r["data"].clone()).filter(|p|p["folioId"]==folio_id&&p["purpose"]!="RECEIVABLE_TRANSFER").map(|p|json!({
        "id":p["id"],"tenderType":p["tenderType"],"amountMinor":p["amountMinor"],"reference":p["referenceNumber"],
        "cashTenderedMinor":p["cashTenderedMinor"],"changeMinor":p["changeMinor"],"occurredAt":p["occurredAt"],"currentPayment":false
    })).collect();
    let refunds:Vec<Value>=list(tx,"refunds")?.into_iter().map(|r|r["data"].clone()).filter(|r|r["folioId"]==folio_id&&r["kind"]=="DEPOSIT_REFUND").map(|r|json!({
        "id":r["id"],"tenderType":format!("{} REFUND",r["tenderType"].as_str().unwrap_or("REFUND")),"amountMinor":-r["amountMinor"].as_i64().unwrap_or(0),"reference":r["externalReference"],"currentPayment":false
    })).collect();
    let mut tender_lines=payments;tender_lines.extend(refunds);
    let device=meta(tx,"terminal_id")?.unwrap_or_else(||"LOCAL".into());
    let sequence=meta(tx,"receipt_sequence")?.and_then(|v|v.parse::<u64>().ok()).unwrap_or(0).checked_add(1).ok_or("Receipt sequence exhausted")?;
    set_meta(tx,"receipt_sequence",&sequence.to_string())?;
    let receipt_id=format!("receipt-{command_id}");
    let doc=json!({
        "id":receipt_id,"schemaVersion":1,"documentType":"HOTEL_FOLIO","orderId":format!("hotel-{folio_id}"),"sourceCommandId":command_id,"deviceId":device,
        "number":format!("{}-{:06}",device,sequence),"orderNumber":format!("ROOM-{}",room["number"].as_str().unwrap_or(folio_id)),"issuedAt":now(),
        "business":{"name":business["name"],"address":property["address"],"phone":property["phone"],"email":property["email"]},
        "outlet":"Front Desk","cashier":user.name,"table":Value::Null,"tab":format!("{} · Room {}",customer["name"].as_str().unwrap_or("Guest"),room["number"].as_str().unwrap_or("")),
        "currency":"KES","timezone":"Africa/Nairobi","items":items,"subtotalMinor":total,"discountMinor":0,
        "netMinor":total-tax-levy,"taxMinor":tax,"levyMinor":levy,"totalMinor":total,"paidMinor":total,"balanceMinor":0,"payments":tender_lines,
        "message":property["receiptFooter"].as_str().unwrap_or("Thank you for staying with us."),
        "folioId":folio_id,"guest":customer["name"],"stayStatus":"CHECKED_OUT","folioStatus":folio["status"]
    });
    put(tx,"receiptDocuments",&receipt_id,doc,changes)?;
    Ok(receipt_id)
}
// SERVOS_PATCH_08_ASSETS_MAINTENANCE
fn asset_date(value:&Value,key:&str)->Result<Option<String>>{
    let Some(raw)=value.get(key).and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()) else {return Ok(None);};
    chrono::NaiveDate::parse_from_str(raw,"%Y-%m-%d").map_err(|_|format!("VALIDATION_FAILED: {key} must use YYYY-MM-DD"))?;
    Ok(Some(raw.to_string()))
}
fn asset_open_maintenance(tx:&Transaction,asset_id:Option<&str>,room_id:Option<&str>)->Result<bool>{
    Ok(list(tx,"maintenanceOrders")?.iter().any(|record|{
        let data=&record["data"];
        !["COMPLETED","CANCELLED"].contains(&data["status"].as_str().unwrap_or(""))
            && asset_id.is_some_and(|id|data["assetId"].as_str()==Some(id))
                || (!["COMPLETED","CANCELLED"].contains(&data["status"].as_str().unwrap_or(""))
                    && room_id.is_some_and(|id|data["roomId"].as_str()==Some(id)))
    }))
}
fn asset_unique_text_all(tx:&Transaction,collection:&str,field:&str,id_key:&str,value:&str)->Result<()>{
    let normalized=value.trim().to_ascii_lowercase();
    let mut stmt=tx.prepare("SELECT id,data FROM records WHERE collection=? ORDER BY rowid").map_err(error)?;
    let rows=stmt.query_map([collection],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(error)?;
    for row in rows{
        let (id,data)=row.map_err(error)?;if id==id_key{continue;}
        let parsed:Value=serde_json::from_str(&data).map_err(error)?;
        if parsed[field].as_str().is_some_and(|v|v.trim().eq_ignore_ascii_case(&normalized)){return Err(format!("DUPLICATE_REFERENCE: {field} remains unique across history"));}
    }
    Ok(())
}
fn asset_event(tx:&Transaction,user:&Session,cmd:&BusinessCommand,asset_id:&str,operation:&str,reason:Option<&str>,before:Option<Value>,after:Option<Value>,changes:&mut Vec<Value>)->Result<()>{
    let event_id=format!("asset-{}",cmd.id);
    if room_any(tx,"assetEvents",&event_id)?.is_some(){return Err("DUPLICATE_REFERENCE: asset event".into());}
    put(tx,"assetEvents",&event_id,json!({
        "id":event_id,"assetId":asset_id,"operation":operation,"reason":reason,
        "before":before,"after":after,"actorId":user.staff_id,"actorName":user.name,
        "occurredAt":now(),"sourceCommandId":cmd.id
    }),changes)
}
fn maintenance_event(tx:&Transaction,user:&Session,cmd:&BusinessCommand,work_id:&str,operation:&str,before:Option<Value>,after:Value,changes:&mut Vec<Value>)->Result<()>{
    let event_id=format!("maintenance-{}",cmd.id);
    put(tx,"maintenanceEvents",&event_id,json!({
        "id":event_id,"maintenanceOrderId":work_id,"operation":operation,
        "before":before,"after":after,"actorId":user.staff_id,"actorName":user.name,
        "occurredAt":now(),"sourceCommandId":cmd.id
    }),changes)
}
fn asset_journal(tx:&Transaction,source_type:&str,source_id:&str,memo:&str,debit_account:(&str,&str,&str),credit_account:(&str,&str,&str),amount_minor:i64,changes:&mut Vec<Value>)->Result<()>{
    if amount_minor<=0{return Ok(());}
    let journal_id=id();let stamp=now();let amount=amount_minor as f64/100.0;
    put(tx,"journalEntries",&journal_id,json!({
        "id":journal_id,"entryNumber":format!("JE-{}",&journal_id[..8].to_ascii_uppercase()),
        "propertyId":"property","occurredAt":stamp,"postedAt":stamp,"sourceType":source_type,"sourceId":source_id,"memo":memo,
        "lines":[
            {"id":id(),"accountId":debit_account.0,"accountCode":debit_account.1,"accountName":debit_account.2,"debit":amount,"credit":0,"debitMinor":amount_minor,"creditMinor":0},
            {"id":id(),"accountId":credit_account.0,"accountCode":credit_account.1,"accountName":credit_account.2,"debit":0,"credit":amount,"debitMinor":0,"creditMinor":amount_minor}
        ],"totalDebit":amount,"totalCredit":amount,"balanced":true
    }),changes)
}
fn maintenance_issue_parts(tx:&Transaction,user:&Session,work_id:&str,parts:&[Value],changes:&mut Vec<Value>)->Result<i64>{
    if parts.len()>100{return Err("VALIDATION_FAILED: parts list".into());}
    let mut seen=Vec::<String>::new();let mut total_minor=0i64;
    for part in parts{
        let stock_id=text(part,"stockItemId")?.to_string();let location=text(part,"locationId")?.to_string();
        if seen.iter().any(|v|v==&stock_id){return Err("VALIDATION_FAILED: combine duplicate stock items".into());}
        seen.push(stock_id.clone());
        let qty=quantity(part,"quantity")?;if qty<=0.0{return Err("VALIDATION_FAILED: part quantity".into());}
        let (version,stock)=get(tx,"stockItems",&stock_id)?;
        if part["stockItemVersion"].as_i64()!=Some(version){return Err("CONFLICT: maintenance part stock changed; reload".into());}
        get(tx,"stockLocations",&location)?;
        let on_hand=stock["currentStock"][&location].as_f64().unwrap_or(0.0);
        if on_hand+0.000001<qty{return Err("ALLOCATION_EXHAUSTED: maintenance part stock".into());}
        let unit_cost=stock["averageUnitCost"].as_f64().unwrap_or(0.0);
        if !unit_cost.is_finite()||unit_cost<0.0{return Err("VALIDATION_FAILED: maintenance part cost".into());}
        let value_minor=(qty*unit_cost*100.0).round() as i64;
        total_minor=total_minor.checked_add(value_minor).ok_or("VALIDATION_FAILED: maintenance parts total")?;
        stock_delta_with_cost(tx,user,&stock_id,&location,-qty,"MAINTENANCE",work_id,"Maintenance part issue",Some(unit_cost),changes)?;
    }
    Ok(total_minor)
}
fn asset_execute(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<bool>{
    let op=cmd.operation.as_str();let p=&cmd.payload;
    if !(op.starts_with("asset.")||op.starts_with("assetCategory.")||op.starts_with("maintenance.")){return Ok(false);}

    if op.starts_with("assetCategory."){
        if !permissions(&user.role).contains(&"assets.manage"){return Err("Permission required: assets.manage".into());}
        let key=text(p,"id")?.to_string();let current=room_any(tx,"assetCategories",&key)?;
        match op{
            "assetCategory.save"=>{
                room_expect_version(current.as_ref(),cmd.target_version)?;
                if current.as_ref().is_some_and(|(_,_,archived)|*archived){return Err("VALIDATION_FAILED: reactivate archived asset category first".into());}
                let data=p["data"].as_object().ok_or("Asset category data is required")?;
                let name=data.get("name").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Asset category name is required")?;
                let code=data.get("code").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Asset category code is required")?.to_ascii_uppercase();
                asset_unique_text_all(tx,"assetCategories","code",&key,&code)?;
                let method=data.get("depreciationMethod").and_then(Value::as_str).unwrap_or("STRAIGHT_LINE");
                if !["STRAIGHT_LINE","NONE"].contains(&method){return Err("VALIDATION_FAILED: depreciation method".into());}
                let life=data.get("usefulLifeMonths").and_then(Value::as_i64).unwrap_or(0);
                if !(0..=1200).contains(&life)||method=="STRAIGHT_LINE"&&life==0{return Err("VALIDATION_FAILED: useful life months".into());}
                put(tx,"assetCategories",&key,json!({"id":key,"name":name,"code":code,"depreciationMethod":method,"usefulLifeMonths":life,"active":true,"updatedAt":now()}),changes)?;
            }
            "assetCategory.archive"=>{
                let (version,_,archived)=current.ok_or("Asset category not found")?;
                if archived{return Err("Asset category already archived".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Asset category changed".into());}
                if list(tx,"assets")?.iter().any(|a|a["data"]["assetCategoryId"].as_str()==Some(key.as_str())&&a["data"]["status"].as_str().is_some_and(|s|!["RETIRED","DISPOSED"].contains(&s))){
                    return Err("INVALID_STATE: active assets still use this category".into());
                }
                if list(tx,"assetAcquisitions")?.iter().any(|a|a["data"]["assetCategoryId"].as_str()==Some(key.as_str())&&a["data"]["status"].as_str()==Some("PENDING_COMMISSION")){
                    return Err("INVALID_STATE: pending procurement acquisitions still use this category".into());
                }
                room_put_archived(tx,"assetCategories",&key,true,changes)?;
            }
            "assetCategory.reactivate"=>{
                let (version,data,archived)=current.ok_or("Asset category not found")?;
                if !archived{return Err("Asset category already active".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Asset category changed".into());}
                asset_unique_text_all(tx,"assetCategories","code",&key,text(&data,"code")?)?;
                room_put_archived(tx,"assetCategories",&key,false,changes)?;
            }
            _=>return Err("PROTOCOL_UNSUPPORTED: asset category operation".into())
        }
        return Ok(true);
    }

    if op.starts_with("asset."){
        let permission=if ["asset.save","asset.archive","asset.reactivate","asset.commission"].contains(&op){"assets.manage"}else{"assets.operate"};
        if !permissions(&user.role).contains(&permission){return Err(format!("Permission required: {permission}"));}
        // SERVOS_PATCH_09_1_COMMISSION_ROUTING
        if op=="asset.commission"{
                let acquisition_id=text(p,"acquisitionId")?.to_string();
                let acquisition=room_any(tx,"assetAcquisitions",&acquisition_id)?.ok_or("Asset acquisition not found")?;
                if acquisition.2{return Err("INVALID_STATE: asset acquisition archived".into());}
                if cmd.target_version!=Some(acquisition.0){return Err("CONFLICT: Asset acquisition changed; reload".into());}
                if acquisition.1["status"].as_str()!=Some("PENDING_COMMISSION"){return Err("INVALID_STATE: acquisition already commissioned".into());}
                let category_id=text(&acquisition.1,"assetCategoryId")?.to_string();
                let category_record=room_any(tx,"assetCategories",&category_id)?.ok_or("Asset category not found")?;
                if category_record.2{return Err("INVALID_STATE: asset category is archived".into());}
                let category=category_record.1;
                let asset_id=p.get("assetId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string).unwrap_or_else(id);
                if room_any(tx,"assets",&asset_id)?.is_some(){return Err("DUPLICATE_REFERENCE: asset ID".into());}
                let tag=text(p,"tag")?.trim().to_ascii_uppercase();
                if tag.is_empty()||tag.len()>128{return Err("VALIDATION_FAILED: asset tag".into());}
                asset_unique_text_all(tx,"assets","tag",&asset_id,&tag)?;
                let room_id=p.get("roomId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
                let location_id=p.get("locationId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
                if room_id.is_none()&&location_id.is_none(){return Err("VALIDATION_FAILED: room or stock location required".into());}
                if let Some(id)=room_id.as_deref(){get(tx,"rooms",id)?;}
                if let Some(id)=location_id.as_deref(){get(tx,"stockLocations",id)?;}
                let warranty=asset_date(p,"warrantyUntil")?;
                let received_at=text(&acquisition.1,"receivedAt")?;
                let acquired=chrono::DateTime::parse_from_rfc3339(received_at)
                    .map_err(|_|"Asset acquisition timestamp is invalid".to_string())?
                    .date_naive().format("%Y-%m-%d").to_string();
                let cost=acquisition.1["unitCostMinor"].as_i64().ok_or("Asset acquisition unit cost is invalid")?;
                let supplier_id=acquisition.1["supplierId"].as_str().map(str::to_string);
                let next=json!({
                    "id":asset_id,"name":p.get("name").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).unwrap_or(acquisition.1["assetName"].as_str().unwrap_or("Asset")),
                    "tag":tag,"assetCategoryId":category_id,"assetCategoryName":category["name"],
                    "serialNumber":p.get("serialNumber").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()),
                    "roomId":room_id,"locationId":location_id,"supplierId":supplier_id,
                    "acquiredAt":acquired,"purchaseCostMinor":cost,"warrantyUntil":warranty,
                    "notes":p.get("notes").cloned().unwrap_or(json!("")),
                    "status":"ACTIVE","condition":"GOOD","custodianId":Value::Null,
                    "acquisitionSourceId":acquisition.1["goodsReceiptId"],"acquisitionLineId":acquisition.1["purchaseLineId"],
                    "acquisitionId":acquisition_id,"createdAt":now(),"updatedAt":now(),
                    "commissionedAt":now(),"commissionedBy":user.staff_id
                });
                put(tx,"assets",&asset_id,next.clone(),changes)?;
                let mut updated=acquisition.1.clone();
                updated["status"]=json!("COMMISSIONED");updated["assetId"]=json!(asset_id);updated["assetTag"]=json!(tag);
                updated["commissionedAt"]=json!(now());updated["commissionedBy"]=json!(user.staff_id);updated["commissionedByName"]=json!(user.name);
                put(tx,"assetAcquisitions",&acquisition_id,updated,changes)?;
                asset_journal(tx,"ASSET_COMMISSIONING",&asset_id,"Commission procured asset from clearing",
                    ("FIXED_ASSETS","1500","Fixed assets"),("ASSET_CLEARING","1505","Asset clearing"),cost,changes)?;
                asset_event(tx,user,cmd,&asset_id,"asset.commission",Some("Commissioned from accepted procurement unit"),None,Some(next),changes)?;
            return Ok(true);
        }
        let key=text(p,"id")?.to_string();let current=room_any(tx,"assets",&key)?;
        let before=current.as_ref().map(|(_,data,_)|data.clone());
        match op{
            "asset.save"=>{
                room_expect_version(current.as_ref(),cmd.target_version)?;
                if current.as_ref().is_some_and(|(_,_,archived)|*archived){return Err("VALIDATION_FAILED: reactivate archived asset first".into());}
                if current.as_ref().is_some_and(|(_,data,_)|["LOST","RETIRED","DISPOSED"].contains(&data["status"].as_str().unwrap_or(""))){return Err("INVALID_STATE: terminal asset cannot be edited".into());}
                let data=p["data"].as_object().ok_or("Asset details are required")?;
                let name=data.get("name").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Asset name is required")?;
                let tag=data.get("tag").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Asset tag is required")?.to_ascii_uppercase();
                if tag.len()>128{return Err("VALIDATION_FAILED: asset tag length".into());}
                asset_unique_text_all(tx,"assets","tag",&key,&tag)?;
                let category_id=data.get("assetCategoryId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Asset category is required")?;
                get(tx,"assetCategories",category_id)?;
                let room_id=data.get("roomId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
                let location_id=data.get("locationId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
                if room_id.is_none()&&location_id.is_none(){return Err("VALIDATION_FAILED: room or stock location required".into());}
                if let Some(id)=room_id.as_deref(){get(tx,"rooms",id)?;}
                if let Some(id)=location_id.as_deref(){get(tx,"stockLocations",id)?;}
                let supplier_id=data.get("supplierId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
                if let Some(id)=supplier_id.as_deref(){get(tx,"suppliers",id)?;}
                let cost=data.get("purchaseCostMinor").and_then(Value::as_i64).unwrap_or(0);
                if cost<0||cost>9_000_000_000_000_000{return Err("VALIDATION_FAILED: acquisition cost".into());}
                let acquired=asset_date(&Value::Object(data.clone()),"acquiredAt")?;
                let warranty=asset_date(&Value::Object(data.clone()),"warrantyUntil")?;
                if let Some((_,prior,_))=current.as_ref(){
                    if prior["roomId"].as_str()!=room_id.as_deref()||prior["locationId"].as_str()!=location_id.as_deref(){return Err("INVALID_STATE: use asset.transfer to change location".into());}
                    if prior.get("acquisitionSourceId").and_then(Value::as_str).is_some_and(|v|!v.is_empty())
                        && (prior["purchaseCostMinor"].as_i64()!=Some(cost)||prior["supplierId"].as_str()!=supplier_id.as_deref()){
                        return Err("INVALID_STATE: correct acquisition through procurement".into());
                    }
                }
                let created_at=current.as_ref().and_then(|(_,v,_)|v["createdAt"].as_str()).unwrap_or("").to_string();
                let mut next=json!({
                    "id":key,"name":name,"tag":tag,"assetCategoryId":category_id,
                    "serialNumber":data.get("serialNumber").cloned().unwrap_or(Value::Null),
                    "roomId":room_id,"locationId":location_id,"supplierId":supplier_id,
                    "acquiredAt":acquired,"purchaseCostMinor":cost,"warrantyUntil":warranty,
                    "notes":data.get("notes").cloned().unwrap_or(json!("")),
                    "status":current.as_ref().and_then(|(_,v,_)|v["status"].as_str()).unwrap_or("ACTIVE"),
                    "condition":current.as_ref().and_then(|(_,v,_)|v["condition"].as_str()).unwrap_or("GOOD"),
                    "custodianId":current.as_ref().map(|(_,v,_)|v["custodianId"].clone()).unwrap_or(Value::Null),
                    "createdAt":if created_at.is_empty(){now()}else{created_at},"updatedAt":now()
                });
                if let Some((_,prior,_))=current.as_ref(){
                    for field in ["acquisitionSourceId","acquisitionLineId","lastInspectedAt","nextInspectionAt"]{
                        if prior.get(field).is_some(){next[field]=prior[field].clone();}
                    }
                }
                put(tx,"assets",&key,next.clone(),changes)?;
                asset_event(tx,user,cmd,&key,op,None,before,Some(next),changes)?;
            }
            "asset.archive"|"asset.reactivate"=>{
                let (version,data,archived)=current.ok_or("Asset not found")?;
                if cmd.target_version!=Some(version){return Err("CONFLICT: Asset changed".into());}
                if op=="asset.archive"{
                    if archived{return Err("Asset already archived".into());}
                    if !["RETIRED","DISPOSED"].contains(&data["status"].as_str().unwrap_or("")){return Err("INVALID_STATE: retire/dispose asset before archive".into());}
                    if asset_open_maintenance(tx,Some(&key),None)?{return Err("INVALID_STATE: resolve maintenance before archive".into());}
                    room_put_archived(tx,"assets",&key,true,changes)?;
                }else{
                    if !archived{return Err("Asset already active".into());}
                    asset_unique_text_all(tx,"assets","tag",&key,text(&data,"tag")?)?;
                    room_put_archived(tx,"assets",&key,false,changes)?;
                }
                asset_event(tx,user,cmd,&key,op,p.get("reason").and_then(Value::as_str),Some(data.clone()),Some(data),changes)?;
            }
            "asset.assign"|"asset.return"|"asset.transfer"|"asset.inspect"|"asset.lose"|"asset.retire"|"asset.dispose"=>{
                let (version,mut data,archived)=current.ok_or("Asset not found")?;
                if archived{return Err("INVALID_STATE: asset is archived".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Asset changed; reload".into());}
                let reason=text(p,"reason")?.trim();if reason.len()>1000{return Err("VALIDATION_FAILED: asset reason length".into());}
                if data["status"]=="DISPOSED"{return Err("INVALID_STATE: disposed asset is final".into());}
                if ["asset.assign","asset.return","asset.transfer","asset.inspect","asset.lose"].contains(&op)&&data["status"]!="ACTIVE"{return Err("INVALID_STATE: asset is not active".into());}
                if op=="asset.assign"{
                    let custodian=text(p,"custodianId")?;let (_,employee)=get(tx,"employees",custodian)?;
                    if employee["status"].as_str()!=Some("ACTIVE"){return Err("INVALID_STATE: custodian is not active".into());}
                    if data.get("custodianId").and_then(Value::as_str).is_some_and(|v|!v.is_empty()){return Err("INVALID_STATE: return current assignment first".into());}
                    data["custodianId"]=json!(custodian);
                }else if op=="asset.return"{
                    if data.get("custodianId").and_then(Value::as_str).is_none_or(|v|v.is_empty()){return Err("INVALID_STATE: no custodian to return from".into());}
                    data["custodianId"]=Value::Null;
                }else if op=="asset.transfer"{
                    let room_id=p.get("roomId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
                    let location_id=p.get("locationId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
                    if room_id.is_none()&&location_id.is_none(){return Err("VALIDATION_FAILED: transfer destination".into());}
                    if let Some(id)=room_id.as_deref(){get(tx,"rooms",id)?;}
                    if let Some(id)=location_id.as_deref(){get(tx,"stockLocations",id)?;}
                    if data["roomId"].as_str()==room_id.as_deref()&&data["locationId"].as_str()==location_id.as_deref(){return Err("VALIDATION_FAILED: asset is already at destination".into());}
                    data["roomId"]=json!(room_id);data["locationId"]=json!(location_id);
                }else if op=="asset.inspect"{
                    let condition=text(p,"condition")?.to_ascii_uppercase();
                    if !["GOOD","FAIR","POOR","BROKEN"].contains(&condition.as_str()){return Err("VALIDATION_FAILED: asset condition".into());}
                    let next=asset_date(p,"nextInspectionAt")?;
                    data["condition"]=json!(condition);data["lastInspectedAt"]=json!(now());data["nextInspectionAt"]=json!(next);
                }else{
                    if asset_open_maintenance(tx,Some(&key),None)?{return Err("INVALID_STATE: resolve maintenance first".into());}
                    if op!="asset.lose"&&data.get("custodianId").and_then(Value::as_str).is_some_and(|v|!v.is_empty()){return Err("INVALID_STATE: return assigned asset before retirement/disposal".into());}
                    data["status"]=json!(if op=="asset.lose"{"LOST"}else if op=="asset.retire"{"RETIRED"}else{"DISPOSED"});
                    data["custodianId"]=Value::Null;
                }
                data["updatedAt"]=json!(now());
                put(tx,"assets",&key,data.clone(),changes)?;
                asset_event(tx,user,cmd,&key,op,Some(reason),before,Some(data),changes)?;
            }
            _=>return Err("PROTOCOL_UNSUPPORTED: asset operation".into())
        }
        return Ok(true);
    }

    let permission=if op=="maintenance.report"{"maintenance.manage"}else{"maintenance.manage"};
    if !permissions(&user.role).contains(&permission){return Err(format!("Permission required: {permission}"));}
    let key=text(p,"id")?.to_string();let current=room_any(tx,"maintenanceOrders",&key)?;
    match op{
        "maintenance.report"=>{
            if current.is_some(){return Err("DUPLICATE_REFERENCE: maintenance order".into());}
            if cmd.target_version.is_some(){return Err("CONFLICT: new maintenance order must not have a target version".into());}
            let asset_id=p.get("assetId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
            let room_id=p.get("roomId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
            if asset_id.is_none()&&room_id.is_none(){return Err("VALIDATION_FAILED: asset or room required".into());}
            if let Some(id)=asset_id.as_deref(){
                let (_,asset)=get(tx,"assets",id)?;if asset["status"]!="ACTIVE"{return Err("INVALID_STATE: inactive asset".into());}
                if let Some(room)=room_id.as_deref(){if asset["roomId"].as_str()!=Some(room){return Err("VALIDATION_FAILED: asset/room mismatch".into());}}
            }
            if let Some(id)=room_id.as_deref(){get(tx,"rooms",id)?;}
            let priority=text(p,"priority")?.to_ascii_uppercase();if !["LOW","MEDIUM","HIGH","CRITICAL"].contains(&priority.as_str()){return Err("VALIDATION_FAILED: priority".into());}
            let description=text(p,"description")?.trim();if description.len()>4000{return Err("VALIDATION_FAILED: maintenance description length".into());}
            let data=json!({"id":key,"assetId":asset_id,"roomId":room_id,"description":description,"priority":priority,"status":"REPORTED","reportedAt":now(),"reportedBy":user.staff_id,"reportedByName":user.name});
            put(tx,"maintenanceOrders",&key,data.clone(),changes)?;
            maintenance_event(tx,user,cmd,&key,op,None,data,changes)?;
        }
        "maintenance.assign"|"maintenance.start"|"maintenance.cancel"|"maintenance.complete"=>{
            let (version,mut work,archived)=current.ok_or("Maintenance order not found")?;
            if archived{return Err("INVALID_STATE: maintenance order archived".into());}
            if cmd.target_version!=Some(version){return Err("CONFLICT: Maintenance order changed; reload".into());}
            let before=work.clone();let status=work["status"].as_str().unwrap_or("");
            if ["COMPLETED","CANCELLED"].contains(&status){return Err("INVALID_STATE: maintenance is closed".into());}
            if op=="maintenance.assign"{
                if !["REPORTED","ASSIGNED"].contains(&status){return Err("INVALID_STATE: maintenance assignment".into());}
                let assignee=text(p,"assigneeId")?;let (_,employee)=get(tx,"employees",assignee)?;
                if employee["status"].as_str()!=Some("ACTIVE"){return Err("INVALID_STATE: assignee is not active".into());}
                work["status"]=json!("ASSIGNED");work["assigneeId"]=json!(assignee);work["assignedAt"]=json!(now());work["assignedBy"]=json!(user.staff_id);
            }else if op=="maintenance.start"{
                if status!="ASSIGNED"{return Err("INVALID_STATE: assign maintenance first".into());}
                work["status"]=json!("IN_PROGRESS");work["startedAt"]=json!(now());work["startedBy"]=json!(user.staff_id);
            }else if op=="maintenance.cancel"{
                let reason=text(p,"reason")?.trim();if reason.len()>2000{return Err("VALIDATION_FAILED: cancellation reason length".into());}
                work["status"]=json!("CANCELLED");work["reason"]=json!(reason);work["closedAt"]=json!(now());work["closedBy"]=json!(user.staff_id);
            }else{
                if status!="IN_PROGRESS"{return Err("INVALID_STATE: start maintenance first".into());}
                let resolution=text(p,"resolution")?.trim();if resolution.len()>4000{return Err("VALIDATION_FAILED: maintenance resolution length".into());}
                let parts=p["parts"].as_array().ok_or("VALIDATION_FAILED: parts list")?;
                let parts_cost=maintenance_issue_parts(tx,user,&key,parts,changes)?;
                if parts_cost>0{
                    asset_journal(tx,"MAINTENANCE_PARTS",&key,"Parts used for maintenance",("MAINTENANCE_EXPENSE","6100","Maintenance expense"),("INVENTORY","1400","Inventory"),parts_cost,changes)?;
                }
                let service_cost=p.get("serviceCostMinor").and_then(Value::as_i64).unwrap_or(0);
                if service_cost<0||service_cost>9_000_000_000_000_000{return Err("VALIDATION_FAILED: maintenance service cost".into());}
                let mut payable_id:Option<String>=None;
                if service_cost>0{
                    let supplier_id=text(p,"supplierId")?.to_string();let (_,supplier)=get(tx,"suppliers",&supplier_id)?;
                    let invoice=text(p,"invoiceReference")?.trim().to_string();if invoice.len()>100{return Err("VALIDATION_FAILED: supplier invoice reference length".into());}
                    if list(tx,"supplierPayables")?.iter().any(|r|r["data"]["supplierId"].as_str()==Some(supplier_id.as_str())&&r["data"]["supplierInvoiceNumber"].as_str().is_some_and(|v|v.trim().eq_ignore_ascii_case(&invoice))){
                        return Err("DUPLICATE_REFERENCE: supplier invoice".into());
                    }
                    let pid=format!("maintenance-{}",cmd.id);
                    put(tx,"supplierPayables",&pid,json!({
                        "id":pid,"payableNumber":format!("AP-{}",&pid[..8].to_ascii_uppercase()),"supplierId":supplier_id,
                        "supplierName":supplier["name"],"supplierInvoiceNumber":invoice,"sourceType":"MAINTENANCE","sourceId":key,
                        "amount":service_cost as f64/100.0,"paidAmount":0,"amountDue":service_cost as f64/100.0,
                        "status":"MATCHED_UNPAID","basis":"External maintenance service confirmed at work completion","createdAt":now()
                    }),changes)?;
                    asset_journal(tx,"MAINTENANCE_SERVICE",&key,"External maintenance service",("MAINTENANCE_EXPENSE","6100","Maintenance expense"),("ACCOUNTS_PAYABLE","2000","Accounts payable"),service_cost,changes)?;
                    payable_id=Some(pid);
                }
                work["status"]=json!("COMPLETED");work["resolution"]=json!(resolution);work["parts"]=json!(parts);
                work["partsCostMinor"]=json!(parts_cost);work["serviceCostMinor"]=json!(service_cost);work["supplierPayableId"]=json!(payable_id);
                work["completedAt"]=json!(now());work["completedBy"]=json!(user.staff_id);work["completedByName"]=json!(user.name);
            }
            work["updatedAt"]=json!(now());
            put(tx,"maintenanceOrders",&key,work.clone(),changes)?;
            maintenance_event(tx,user,cmd,&key,op,Some(before),work,changes)?;
        }
        _=>return Err("PROTOCOL_UNSUPPORTED: maintenance operation".into())
    }
    Ok(true)
}

fn folio_execute(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<bool>{
    let op=cmd.operation.as_str();
    if !(op.starts_with("folio.")||op.starts_with("hotelService.")||op=="pos.roomCharge"){return Ok(false);}

    if op.starts_with("hotelService."){
        if !permissions(&user.role).contains(&"folio.manage"){return Err("Permission required: folio.manage".into());}
        let key=text(&cmd.payload,"id")?.to_string();let current=room_any(tx,"hotelServices",&key)?;
        match op{
            "hotelService.save"=>{
                room_expect_version(current.as_ref(),cmd.target_version)?;
                let data=cmd.payload["data"].as_object().ok_or("Hotel service data is required")?;
                let name=data.get("name").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Hotel service name is required")?;
                let code=data.get("code").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Hotel service code is required")?;
                room_unique_text(tx,"hotelServices","code",&key,code)?;
                let price=data.get("priceMinor").and_then(Value::as_i64).ok_or("Hotel service priceMinor is required")?;
                let tax=data.get("taxBasisPoints").and_then(Value::as_i64).unwrap_or(0);
                if price<0||!(0..=10_000).contains(&tax)||data.get("currency").and_then(Value::as_str)!=Some("KES"){return Err("VALIDATION_FAILED: hotel service price/tax/currency".into());}
                put(tx,"hotelServices",&key,json!({"id":key,"name":name,"code":code,"category":data.get("category").cloned().unwrap_or(json!("SERVICE")),"priceMinor":price,"taxBasisPoints":tax,"currency":"KES","active":true,"updatedAt":now()}),changes)?;
            }
            "hotelService.archive"=>{
                let (version,_,archived)=current.ok_or("Hotel service not found")?;if archived{return Err("Hotel service already archived".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Hotel service changed".into());}
                room_put_archived(tx,"hotelServices",&key,true,changes)?;
            }
            "hotelService.reactivate"=>{
                let (version,data,archived)=current.ok_or("Hotel service not found")?;if !archived{return Err("Hotel service already active".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Hotel service changed".into());}
                room_unique_text(tx,"hotelServices","code",&key,text(&data,"code")?)?;room_put_archived(tx,"hotelServices",&key,false,changes)?;
            }
            _=>return Err("PROTOCOL_UNSUPPORTED: hotel service operation".into())
        }
        return Ok(true);
    }

    if op=="pos.roomCharge"{
        if !permissions(&user.role).contains(&"pos.sell")||!permissions(&user.role).contains(&"folio.room_charge"){return Err("Permission required: folio.room_charge".into());}
        let order_id=text(&cmd.payload,"orderId")?.to_string();let (order_version,mut order)=get(tx,"orders",&order_id)?;
        if cmd.target_version!=Some(order_version){return Err("CONFLICT: Order changed; reload before room charge".into());}
        if ["COMPLETED","VOIDED"].contains(&order["state"].as_str().unwrap_or("")){return Err("Order already closed".into());}
        let items=order["items"].as_array().ok_or("Invalid order items")?;
        if items.is_empty()||items.iter().any(|i|i["state"]!="VOIDED"&&i["stockFired"]!=true){return Err("Fire all active items before charging a room".into());}
        let folio_id=text(&cmd.payload,"folioId")?.to_string();let (folio_version,folio)=get(tx,"folios",&folio_id)?;
        if cmd.payload["folioVersion"].as_i64()!=Some(folio_version)||folio["status"].as_str()!=Some("OPEN"){return Err("CONFLICT: Folio changed or is not open".into());}
        let (_,booking)=get(tx,"roomReservations",&folio_id)?;let (_,stay)=get(tx,"stays",&folio_id)?;
        if booking["status"].as_str()!=Some("CHECKED_IN")||stay["status"].as_str()!=Some("CHECKED_IN"){return Err("INVALID_STATE: room charge requires checked-in guest".into());}
        let total=money(&order,"grandTotal")?;let paid=money(&order,"amountPaid")?;let amount=total-paid;
        if amount<=0{return Err("Order has no outstanding balance".into());}
        let (active_till_id,_)=folio_active_till(tx)?;
        let allocate=|tax:i64|->i64{
            let before=((tax as i128*paid as i128)+(total as i128/2))/(total as i128);
            tax-before as i64
        };
        let vat=allocate(money(&order,"taxTotal")?);let levy=allocate(money(&order,"cateringLevyTotal")?);
        if vat<0||levy<0||vat+levy>amount{return Err("VALIDATION_FAILED: remaining POS tax allocation".into());}
        let net=amount-vat-levy;
        let settlement_id=id();let stamp=now();
        put(tx,"payments",&settlement_id,json!({
            "id":settlement_id,"orderId":order_id,"folioId":folio_id,"purpose":"RECEIVABLE_TRANSFER","tenderType":"ROOM_CHARGE",
            "amount":amount as f64/100.0,"amountMinor":amount,"currency":"KES","status":"TRANSFERRED","referenceNumber":folio_id,
            "tillSessionId":active_till_id,"occurredAt":stamp,"cashierId":user.staff_id,"cashierName":user.name,"confirmation":"INTERNAL_TRANSFER"
        }),changes)?;
        let mut lines=vec![json!({"id":id(),"accountId":"GUEST_RECEIVABLE","accountCode":"GUEST_RECEIVABLE","accountName":"Guest receivable","debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0}),
            json!({"id":id(),"accountId":"SALES","accountCode":"4000","accountName":"Sales","debit":0,"credit":net as f64/100.0,"debitMinor":0,"creditMinor":net})];
        if vat>0{lines.push(json!({"id":id(),"accountId":"VAT","accountCode":"2100","accountName":"VAT payable","debit":0,"credit":vat as f64/100.0,"debitMinor":0,"creditMinor":vat}));}
        if levy>0{lines.push(json!({"id":id(),"accountId":"LEVY","accountCode":"2110","accountName":"Levy payable","debit":0,"credit":levy as f64/100.0,"debitMinor":0,"creditMinor":levy}));}
        folio_journal(tx,"POS_ROOM_CHARGE",&settlement_id,"POS sale transferred to guest folio",lines,changes)?;
        folio_entry(tx,&folio_id,&format!("pos-room-{order_id}"),json!({
            "kind":"POS_ROOM_CHARGE","sourceType":"POS","orderId":order_id,"settlementId":settlement_id,
            "description":format!("POS order {}",order["orderNumber"].as_str().unwrap_or(order_id.as_str())),
            "grossMinor":amount,"netMinor":net,"taxMinor":vat,"levyMinor":levy
        }),amount,0,changes)?;
        order["amountPaid"]=json!(total as f64/100.0);order["paymentMethod"]=json!("ROOM_CHARGE");order["roomChargeFolioId"]=json!(folio_id);
        order["state"]=json!("COMPLETED");order["completedAt"]=json!(stamp);
        if let Some(table_id)=order["tableId"].as_str(){let (_,mut table)=get(tx,"tables",table_id)?;table["currentOrderId"]=Value::Null;table["state"]=json!("CLEANING");put(tx,"tables",table_id,table,changes)?;}
        put(tx,"orders",&order_id,order,changes)?;
        return Ok(true);
    }

    if !permissions(&user.role).contains(&"folio.manage"){return Err("Permission required: folio.manage".into());}
    let folio_id=text(&cmd.payload,"id")?.to_string();
    if op=="folio.open"{
        if room_any(tx,"folios",&folio_id)?.is_some(){return Err("DUPLICATE_REFERENCE: reservation already has folio".into());}
        let (rv,booking)=get(tx,"roomReservations",&folio_id)?;
        if cmd.target_version!=Some(rv){return Err("CONFLICT: Reservation changed".into());}
        if !["RESERVED","CHECKED_IN"].contains(&booking["status"].as_str().unwrap_or("")){return Err("INVALID_STATE: reservation cannot open folio".into());}
        put(tx,"folios",&folio_id,json!({"id":folio_id,"reservationId":folio_id,"stayId":if booking["status"]=="CHECKED_IN"{Value::String(folio_id.clone())}else{Value::Null},"customerId":booking["customerId"],"currency":"KES","balanceMinor":0,"depositMinor":0,"status":"OPEN","openedAt":now(),"openedBy":user.staff_id}),changes)?;
        return Ok(true);
    }
    let (folio_version,folio)=get(tx,"folios",&folio_id)?;
    if cmd.target_version!=Some(folio_version){return Err("CONFLICT: Folio changed; reload".into());}
    if folio["status"].as_str()!=Some("OPEN"){return Err("INVALID_STATE: folio closed".into());}
    match op{
        "folio.postAccommodation"=>{
            folio_post_accommodation(tx,&folio_id,cmd.payload["settleBookedStay"].as_bool().unwrap_or(false),changes)?;
        }
        "folio.postService"=>{
            let (_,booking)=get(tx,"roomReservations",&folio_id)?;if booking["status"].as_str()!=Some("CHECKED_IN"){return Err("INVALID_STATE: services require checked-in guest".into());}
            let service_id=text(&cmd.payload,"serviceId")?;let (version,service)=get(tx,"hotelServices",service_id)?;
            if cmd.payload["serviceVersion"].as_i64()!=Some(version){return Err("CONFLICT: Hotel service changed".into());}
            let quantity=cmd.payload["quantity"].as_i64().ok_or("quantity must be an integer")?;if !(1..=1000).contains(&quantity){return Err("VALIDATION_FAILED: service quantity".into());}
            let gross=service["priceMinor"].as_i64().unwrap_or(0).checked_mul(quantity).ok_or("VALIDATION_FAILED: service total")?;
            folio_charge(tx,&folio_id,&format!("entry-{}",cmd.id),gross,service["taxBasisPoints"].as_i64().unwrap_or(0),"SERVICE_REVENUE",json!({
                "sourceType":"SERVICE","serviceId":service_id,"quantity":quantity,"serviceSnapshot":service,
                "description":service["name"]
            }),changes)?;
        }
        "folio.deposit"|"folio.pay"=>{
            let (_,booking)=get(tx,"roomReservations",&folio_id)?;
            if !["RESERVED","CHECKED_IN"].contains(&booking["status"].as_str().unwrap_or("")){return Err("INVALID_STATE: cannot receive funds for closed reservation".into());}
            let amount=folio_minor(&cmd.payload,"amountMinor")?;
            if op=="folio.pay"&&amount>folio["balanceMinor"].as_i64().unwrap_or(0){return Err("VALIDATION_FAILED: payment exceeds outstanding balance; record excess as deposit".into());}
            let payment_id=folio_record_funds(tx,user,&folio_id,if op=="folio.deposit"{"DEPOSIT"}else{"SETTLEMENT"},&cmd.payload,changes)?;
            folio_entry(tx,&folio_id,&format!("entry-{}",cmd.id),json!({"kind":if op=="folio.deposit"{"DEPOSIT"}else{"PAYMENT"},"paymentId":payment_id,"amountMinor":amount}),if op=="folio.pay"{-amount}else{0},if op=="folio.deposit"{amount}else{0},changes)?;
        }
        "folio.applyDeposit"=>{
            let amount=folio_minor(&cmd.payload,"amountMinor")?;
            if amount<=0||amount>folio["depositMinor"].as_i64().unwrap_or(0)||amount>folio["balanceMinor"].as_i64().unwrap_or(0){return Err("VALIDATION_FAILED: deposit application exceeds deposit or balance".into());}
            folio_journal(tx,"FOLIO",&format!("apply-{}",cmd.id),"Apply guest deposit",vec![
                json!({"id":id(),"accountId":"GUEST_DEPOSITS","accountCode":"GUEST_DEPOSITS","accountName":"Guest deposits","debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0}),
                json!({"id":id(),"accountId":"GUEST_RECEIVABLE","accountCode":"GUEST_RECEIVABLE","accountName":"Guest receivable","debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount})
            ],changes)?;
            folio_entry(tx,&folio_id,&format!("entry-{}",cmd.id),json!({"kind":"DEPOSIT_APPLIED","amountMinor":amount}),-amount,-amount,changes)?;
        }
        "folio.refundDeposit"=>folio_refund_deposit(tx,user,&folio_id,&cmd.payload,changes)?,
        "folio.reverse"=>{
            if !permissions(&user.role).contains(&"folio.reverse"){return Err("Permission required: folio.reverse".into());}
            let entry_id=text(&cmd.payload,"entryId")?;let (_,entry)=get(tx,"folioEntries",entry_id)?;
            let kind=entry["kind"].as_str().unwrap_or("");
            if entry["folioId"].as_str()!=Some(folio_id.as_str())||!["CHARGE","POS_ROOM_CHARGE"].contains(&kind){return Err("INVALID_STATE: only unpaid charge entries can be reversed; payments require payout workflow".into());}
            if list(tx,"folioEntries")?.iter().any(|r|r["data"]["reversesEntryId"].as_str()==Some(entry_id)){return Err("DUPLICATE_REFERENCE: entry already reversed".into());}
            let amount=entry["balanceDeltaMinor"].as_i64().unwrap_or_else(||entry["grossMinor"].as_i64().unwrap_or(0));
            if amount<=0||amount>folio["balanceMinor"].as_i64().unwrap_or(0){return Err("INVALID_STATE: paid charge requires refund workflow".into());}
            let reason=text(&cmd.payload,"reason")?;
            let net=entry["netMinor"].as_i64().unwrap_or(0);let tax=entry["taxMinor"].as_i64().unwrap_or(0);let levy=entry["levyMinor"].as_i64().unwrap_or(0);
            let account=if kind=="POS_ROOM_CHARGE"{"SALES"}else{entry["revenueAccount"].as_str().unwrap_or("SERVICE_REVENUE")};
            let mut lines=vec![
                json!({"id":id(),"accountId":"GUEST_RECEIVABLE","accountCode":"GUEST_RECEIVABLE","accountName":"Guest receivable","debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount}),
                json!({"id":id(),"accountId":account,"accountCode":account,"accountName":account,"debit":net as f64/100.0,"credit":0,"debitMinor":net,"creditMinor":0})
            ];
            if tax>0{lines.push(json!({"id":id(),"accountId":if kind=="POS_ROOM_CHARGE"{"VAT"}else{"TAX_PAYABLE"},"accountCode":if kind=="POS_ROOM_CHARGE"{"2100"}else{"TAX_PAYABLE"},"accountName":"Tax payable","debit":tax as f64/100.0,"credit":0,"debitMinor":tax,"creditMinor":0}));}
            if levy>0{lines.push(json!({"id":id(),"accountId":"LEVY","accountCode":"2110","accountName":"Levy payable","debit":levy as f64/100.0,"credit":0,"debitMinor":levy,"creditMinor":0}));}
            folio_journal(tx,"FOLIO",&format!("reverse-{}",cmd.id),"Reverse folio charge",lines,changes)?;
            if kind=="POS_ROOM_CHARGE"{
                let refund_id=id();let order_id=text(&entry,"orderId")?.to_string();
                put(tx,"refunds",&refund_id,json!({"id":refund_id,"paymentId":entry["settlementId"],"orderId":order_id,"folioId":folio_id,"kind":"ROOM_CHARGE_REVERSAL","amount":amount as f64/100.0,"amountMinor":amount,"tenderType":"ROOM_CHARGE","reason":reason,"externalReference":"","stockDisposition":"NO_AUTOMATIC_RESTOCK","refundedBy":user.staff_id,"refundedAt":now()}),changes)?;
                let (_,mut order)=get(tx,"orders",&order_id)?;
                order["refundedAmount"]=json!((money(&order,"refundedAmount").unwrap_or(0)+amount) as f64/100.0);
                order["roomChargeReversedMinor"]=json!(order["roomChargeReversedMinor"].as_i64().unwrap_or(0)+amount);
                put(tx,"orders",&order_id,order,changes)?;
            }
            folio_entry(tx,&folio_id,&format!("entry-{}",cmd.id),json!({"kind":"REVERSAL","sourceType":if kind=="POS_ROOM_CHARGE"{"POS"}else{"FOLIO"},"reversesEntryId":entry_id,"reason":reason,"amountMinor":amount,"grossMinor":-amount,"netMinor":-net,"taxMinor":-tax,"levyMinor":-levy,"description":"Charge reversal"}),-amount,0,changes)?;
        }
        _=>return Err("PROTOCOL_UNSUPPORTED: folio operation".into())
    }
    Ok(true)
}

fn room_execute(tx:&Transaction,user:&Session,cmd:&BusinessCommand,changes:&mut Vec<Value>)->Result<bool>{
    let op=cmd.operation.as_str();
    if !(op.starts_with("roomType.")||op.starts_with("room.")||op.starts_with("ratePlan.")||op.starts_with("roomReservation.")||op.starts_with("stay.")||op=="roomStay.settings"){return Ok(false);}
    let p=&cmd.payload;

    if op=="roomStay.settings"{
        if !permissions(&user.role).contains(&"business.configure"){return Err("Permission required: business.configure".into());}
        let (version,mut property)=get(tx,"property","property")?;
        if p["propertyVersion"].as_i64()!=Some(version){return Err("CONFLICT: Room stay settings changed; reopen Settings".into());}
        let room_type=text(p,"roomTypeId")?;let rate_id=text(p,"ratePlanId")?;
        get(tx,"roomTypes",room_type)?;let (_,rate)=get(tx,"ratePlans",rate_id)?;
        if rate["roomTypeId"].as_str()!=Some(room_type)||rate["mode"].as_str()!=Some("NIGHTLY"){return Err("VALIDATION_FAILED: configure one NIGHTLY room stay rate matching the room type".into());}
        let checkout=text(p,"nightlyCheckoutTime")?;let cutoff=text(p,"dayStayCutoffTime")?;
        let checkout_minutes=parse_clock(checkout).ok_or("VALIDATION_FAILED: nightly checkout time")?;let cutoff_minutes=parse_clock(cutoff).ok_or("VALIDATION_FAILED: day stay cutoff time")?;
        if checkout_minutes>=cutoff_minutes{return Err("VALIDATION_FAILED: nightly checkout must be before day stay cutoff".into());}
        property["roomStayRoomTypeId"]=json!(room_type);property["roomStayRatePlanId"]=json!(rate_id);property["nightlyCheckoutTime"]=json!(checkout);property["dayStayCutoffTime"]=json!(cutoff);property["updatedAt"]=json!(now());
        put(tx,"property","property",property,changes)?;return Ok(true);
    }

// SERVOS_PATCH_06_FRONT_DESK
    if op.starts_with("stay."){
        if !permissions(&user.role).contains(&"rooms.operate"){return Err("Permission required: rooms.operate".into());}
        let key=text(p,"id")?.to_string();
        match op {
            "stay.checkIn"=>{
                let reservation=room_any(tx,"roomReservations",&key)?.ok_or("Reservation not found")?;
                if reservation.2||reservation.1["status"].as_str()!=Some("RESERVED"){return Err("INVALID_STATE: reservation is not awaiting check-in".into());}
                if cmd.target_version!=Some(reservation.0){return Err("CONFLICT: Reservation changed; reload before check-in".into());}
                if room_any(tx,"stays",&key)?.is_some(){return Err("DUPLICATE_REFERENCE: stay already exists".into());}
                let room_id=text(&reservation.1,"roomId")?.to_string();
                let room=room_any(tx,"rooms",&room_id)?.ok_or("Room not found")?;
                let room_version=p["roomVersion"].as_i64().ok_or("roomVersion is required")?;
                if room.0!=room_version{return Err("CONFLICT: Room changed; reload before check-in".into());}
                if room.2{return Err("INVALID_STATE: room is archived".into());}
                if room.1["maintenanceState"].as_str().unwrap_or("AVAILABLE")!="AVAILABLE"{return Err("ROOM_UNAVAILABLE: room is out of order".into());}
                if room.1["housekeepingState"].as_str().unwrap_or("CLEAN")!="CLEAN"{return Err("ROOM_UNAVAILABLE: room must be clean before check-in".into());}
                let arrival=room_parse_time(text(&reservation.1,"startsAt")?)?;
                let departure=room_parse_time(text(&reservation.1,"endsAt")?)?;
                let blocked_until=room_parse_time(text(&reservation.1,"blockedUntil")?)?;
                let now_utc=Utc::now();
                if now_utc<arrival{return Err("INVALID_STATE: arrival time has not been reached".into());}
                if now_utc>=departure{return Err("INVALID_STATE: reservation departure has already passed".into());}
                room_available(tx,&room_id,arrival,blocked_until,Some(&key))?;
                let mut next_reservation=reservation.1.clone();
                let stamp=now();
                next_reservation["status"]=json!("CHECKED_IN");
                next_reservation["checkedInAt"]=json!(stamp);
                next_reservation["checkedInBy"]=json!(user.staff_id);
                next_reservation["updatedAt"]=json!(stamp);
                put(tx,"roomReservations",&key,next_reservation,changes)?;
                put(tx,"stays",&key,json!({
                    "id":key,"reservationId":key,"roomId":room_id,"customerId":reservation.1["customerId"],
                    "status":"CHECKED_IN","checkedInAt":stamp,"checkedInBy":user.staff_id,
                    "startsAt":reservation.1["startsAt"],"expectedEndAt":reservation.1["endsAt"],
                    "history":[{"type":"CHECK_IN","roomId":room_id,"at":stamp,"actorId":user.staff_id}]
                }),changes)?;
                if let Some((folio_version,folio,archived))=room_any(tx,"folios",&key)?{
                    if p["folioVersion"].as_i64()!=Some(folio_version){return Err("CONFLICT: Folio changed; reload before check-in".into());}
                    if archived||folio["status"].as_str()!=Some("OPEN")||folio["customerId"]!=reservation.1["customerId"]{
                        return Err("INVALID_STATE: existing reservation folio is not compatible with check-in".into());
                    }
                }else{
                    if p.get("folioVersion").is_some_and(|v|!v.is_null()){return Err("CONFLICT: Folio appeared after the screen loaded".into());}
                    put(tx,"folios",&key,json!({
                        "id":key,"reservationId":key,"stayId":key,"customerId":reservation.1["customerId"],
                        "currency":"KES","status":"OPEN","balanceMinor":0,"depositMinor":0,"createdAt":stamp,"openedBy":user.staff_id
                    }),changes)?;
                }
                folio_post_accommodation(tx,&key,false,changes)?;
            }
            "stay.move"=>{
                let stay=room_any(tx,"stays",&key)?.ok_or("Stay not found")?;
                if stay.2||stay.1["status"].as_str()!=Some("CHECKED_IN"){return Err("INVALID_STATE: only checked-in stays can move rooms".into());}
                if cmd.target_version!=Some(stay.0){return Err("CONFLICT: Stay changed; reload before room move".into());}
                let reservation=room_any(tx,"roomReservations",&key)?.ok_or("Reservation not found")?;
                let reservation_version=p["reservationVersion"].as_i64().ok_or("reservationVersion is required")?;
                if reservation.0!=reservation_version||reservation.1["status"].as_str()!=Some("CHECKED_IN"){return Err("CONFLICT: Reservation changed; reload before room move".into());}
                let folio=room_any(tx,"folios",&key)?.ok_or("Folio not found")?;
                if p["folioVersion"].as_i64()!=Some(folio.0)||folio.2||folio.1["status"].as_str()!=Some("OPEN"){return Err("CONFLICT: Folio changed or is closed; reload before room move".into());}
                let old_room_id=text(&stay.1,"roomId")?.to_string();
                let destination_id=text(p,"destinationRoomId")?.to_string();
                if destination_id==old_room_id{return Err("VALIDATION_FAILED: destination room must be different".into());}
                let old_room=room_any(tx,"rooms",&old_room_id)?.ok_or("Current room not found")?;
                let destination=room_any(tx,"rooms",&destination_id)?.ok_or("Destination room not found")?;
                if p["currentRoomVersion"].as_i64()!=Some(old_room.0)||p["destinationRoomVersion"].as_i64()!=Some(destination.0){
                    return Err("CONFLICT: A room changed; reload before room move".into());
                }
                if destination.2||destination.1["maintenanceState"].as_str().unwrap_or("AVAILABLE")!="AVAILABLE"{
                    return Err("ROOM_UNAVAILABLE: destination room is out of order".into());
                }
                if destination.1["housekeepingState"].as_str().unwrap_or("CLEAN")!="CLEAN"{
                    return Err("ROOM_UNAVAILABLE: destination room must be clean".into());
                }
                let guests=reservation.1["guests"].as_i64().unwrap_or(1);
                if guests>destination.1["capacity"].as_i64().unwrap_or(0){return Err("VALIDATION_FAILED: destination room capacity".into());}
                let now_utc=Utc::now();
                let departure=room_parse_time(text(&reservation.1,"endsAt")?)?;
                if now_utc>=departure{return Err("INVALID_STATE: stay departure has already passed".into());}
                let destination_turnaround=destination.1["turnaroundMinutes"].as_i64().unwrap_or(0);
                let destination_blocked_until=departure+Duration::minutes(destination_turnaround);
                room_available(tx,&destination_id,now_utc,destination_blocked_until,Some(&key))?;

                let stamp=now();
                let mut next_reservation=reservation.1.clone();
                next_reservation["roomId"]=json!(destination_id);
                next_reservation["turnaroundMinutes"]=json!(destination_turnaround);
                next_reservation["blockedUntil"]=json!(destination_blocked_until.to_rfc3339());
                next_reservation["updatedAt"]=json!(stamp);
                next_reservation["lastRoomMoveAt"]=json!(stamp);
                put(tx,"roomReservations",&key,next_reservation,changes)?;

                let mut next_stay=stay.1.clone();
                next_stay["roomId"]=json!(destination_id);
                next_stay["lastMovedAt"]=json!(stamp);
                let history=next_stay["history"].as_array_mut().ok_or("Stay history is invalid")?;
                history.push(json!({"type":"ROOM_MOVE","fromRoomId":old_room_id,"toRoomId":destination_id,"at":stamp,"actorId":user.staff_id,"reason":p.get("reason").cloned().unwrap_or(Value::Null)}));
                put(tx,"stays",&key,next_stay,changes)?;

                let mut old_room_data=old_room.1.clone();
                old_room_data["housekeepingState"]=json!("DIRTY");
                old_room_data["housekeepingAt"]=json!(stamp);
                old_room_data["housekeepingBy"]=json!(user.staff_id);
                put(tx,"rooms",&old_room_id,old_room_data,changes)?;

                let turnaround=old_room.1["turnaroundMinutes"].as_i64().unwrap_or(0);
                if turnaround>0{
                    let block_end=now_utc+Duration::minutes(turnaround);
                    let affected:Vec<String>=list(tx,"roomReservations")?.into_iter().filter_map(|record|{
                        if record["id"].as_str()==Some(key.as_str()){return None;}
                        let data=&record["data"];
                        if data["roomId"].as_str()!=Some(old_room_id.as_str())||!["RESERVED","CHECKED_IN"].contains(&data["status"].as_str().unwrap_or("")){return None;}
                        let start=room_parse_time(data["startsAt"].as_str()?).ok()?;
                        let end=room_parse_time(data["blockedUntil"].as_str()?).ok()?;
                        if room_overlap(now_utc,block_end,start,end){record["id"].as_str().map(str::to_string)}else{None}
                    }).collect();
                    let block_id=id();
                    put(tx,"roomBlocks",&block_id,json!({
                        "id":block_id,"roomId":old_room_id,"startsAt":now_utc.to_rfc3339(),"endsAt":block_end.to_rfc3339(),
                        "reason":"Room move turnaround","status":"ACTIVE","sourceType":"MOVE_TURNAROUND","stayId":key,
                        "affectedReservationIds":affected,"createdAt":stamp,"createdBy":user.staff_id
                    }),changes)?;
                }
            }
            "stay.extend"=>{
                if !permissions(&user.role).contains(&"folio.manage")||!permissions(&user.role).contains(&"payment.record"){return Err("Permission required: folio.manage/payment.record".into());}
                let stay=room_any(tx,"stays",&key)?.ok_or("Stay not found")?;
                if stay.2||stay.1["status"].as_str()!=Some("CHECKED_IN"){return Err("INVALID_STATE: extension requires active stay".into());}
                if cmd.target_version!=Some(stay.0){return Err("CONFLICT: Stay changed; reload".into());}
                let reservation=room_any(tx,"roomReservations",&key)?.ok_or("Reservation not found")?;
                let folio=room_any(tx,"folios",&key)?.ok_or("Folio not found")?;
                let room=room_any(tx,"rooms",text(&reservation.1,"roomId")?)?.ok_or("Room not found")?;
                if cmd.payload["reservationVersion"].as_i64()!=Some(reservation.0)||cmd.payload["folioVersion"].as_i64()!=Some(folio.0)||cmd.payload["roomVersion"].as_i64()!=Some(room.0){return Err("CONFLICT: Stay dependencies changed; reload".into());}
                if reservation.1["status"].as_str()!=Some("CHECKED_IN")||folio.1["status"].as_str()!=Some("OPEN"){return Err("INVALID_STATE: extension requires active reservation and folio".into());}
                let rate_id=text(p,"ratePlanId")?;let (rate_version,rate)=get(tx,"ratePlans",rate_id)?;
                if p["ratePlanVersion"].as_i64()!=Some(rate_version){return Err("CONFLICT: Rate plan changed".into());}
                if rate["roomTypeId"]!=room.1["roomTypeId"]||rate["currency"].as_str()!=Some("KES"){return Err("VALIDATION_FAILED: extension rate room type/currency".into());}
                let units=p["units"].as_i64().ok_or("units must be an integer")?;if !(1..=366).contains(&units){return Err("VALIDATION_FAILED: extension units".into());}
                let old_end=room_parse_time(text(&reservation.1,"endsAt")?)?;
                let new_end=if rate["mode"].as_str()==Some("NIGHTLY"){old_end+Duration::days(units)}else if rate["mode"].as_str()==Some("DAY_USE"){old_end+Duration::minutes(units*rate["durationMinutes"].as_i64().unwrap_or(0))}else{return Err("VALIDATION_FAILED: extension mode".into());};
                let start=room_parse_time(text(&reservation.1,"startsAt")?)?;if new_end<=Utc::now()||new_end-start>Duration::days(366){return Err("VALIDATION_FAILED: extension interval".into());}
                let blocked_until=new_end+Duration::minutes(room.1["turnaroundMinutes"].as_i64().unwrap_or(0));
                room_available(tx,text(&reservation.1,"roomId")?,old_end,blocked_until,Some(&key))?;
                let amount=rate["priceMinor"].as_i64().unwrap_or(0).checked_mul(units).ok_or("VALIDATION_FAILED: extension total")?;
                let payment=p.get("payment").ok_or("payment is required")?;if folio_minor(payment,"amountMinor")?!=amount{return Err("VALIDATION_FAILED: extension must be paid at exact quoted price".into());}
                let extension_id=format!("extension-{}",cmd.id);
                folio_charge(tx,&key,&extension_id,amount,rate["taxBasisPoints"].as_i64().unwrap_or(0),"ACCOMMODATION_REVENUE",json!({"sourceType":"EXTENSION","rateSnapshot":rate,"units":units,"description":"Paid stay extension"}),changes)?;
                let payment_id=folio_record_funds(tx,user,&key,"SETTLEMENT",payment,changes)?;
                folio_entry(tx,&key,&format!("extension-payment-{}",cmd.id),json!({"kind":"PAYMENT","paymentId":payment_id,"amountMinor":amount}),-amount,0,changes)?;
                put(tx,"stayExtensions",&format!("stay-extension-{}",cmd.id),json!({"stayId":key,"roomId":reservation.1["roomId"],"startsAt":reservation.1["endsAt"],"endsAt":new_end.to_rfc3339(),"rateSnapshot":rate,"units":units,"amountMinor":amount,"paymentId":payment_id,"sourceCommandId":cmd.id,"recordedAt":now(),"actorId":user.staff_id}),changes)?;
                let mut next_res=reservation.1.clone();next_res["endsAt"]=json!(new_end.to_rfc3339());next_res["blockedUntil"]=json!(blocked_until.to_rfc3339());next_res["extensionAmountMinor"]=json!(next_res["extensionAmountMinor"].as_i64().unwrap_or(0)+amount);next_res["updatedAt"]=json!(now());put(tx,"roomReservations",&key,next_res,changes)?;
                put(tx,"stayEvents",&format!("stay-event-{}",cmd.id),json!({"stayId":key,"operation":"stay.extend","roomId":reservation.1["roomId"],"previousEndsAt":reservation.1["endsAt"],"endsAt":new_end.to_rfc3339(),"extensionId":extension_id,"actorId":user.staff_id,"occurredAt":now(),"sourceCommandId":cmd.id}),changes)?;
            }
            "stay.checkOut"=>{
                let stay=room_any(tx,"stays",&key)?.ok_or("Stay not found")?;if stay.2||stay.1["status"].as_str()!=Some("CHECKED_IN"){return Err("INVALID_STATE: stay is not open".into());}
                if cmd.target_version!=Some(stay.0){return Err("CONFLICT: Stay changed; reload".into());}
                let reservation=room_any(tx,"roomReservations",&key)?.ok_or("Reservation not found")?;let folio=room_any(tx,"folios",&key)?.ok_or("Folio not found")?;let room=room_any(tx,"rooms",text(&reservation.1,"roomId")?)?.ok_or("Room not found")?;
                if p["reservationVersion"].as_i64()!=Some(reservation.0)||p["folioVersion"].as_i64()!=Some(folio.0)||p["roomVersion"].as_i64()!=Some(room.0){return Err("CONFLICT: Checkout dependencies changed; reload".into());}
                if reservation.1["status"].as_str()!=Some("CHECKED_IN")||folio.1["status"].as_str()!=Some("OPEN"){return Err("INVALID_STATE: stay is not open".into());}
                let units=reservation.1["units"].as_i64().unwrap_or(0);for period in 0..units{if room_any(tx,"folioEntries",&folio_period_key(&key,period))?.is_none(){return Err("SETTLEMENT_REQUIRED: post all booked accommodation periods before checkout".into());}}
                if folio.1["balanceMinor"].as_i64().unwrap_or(0)!=0||folio.1["depositMinor"].as_i64().unwrap_or(0)!=0{return Err("SETTLEMENT_REQUIRED: settle balance and apply/refund remaining deposit".into());}
                let stamp=now();let mut next_stay=stay.1.clone();next_stay["status"]=json!("CHECKED_OUT");next_stay["checkedOutAt"]=json!(stamp);next_stay["checkedOutBy"]=json!(user.staff_id);put(tx,"stays",&key,next_stay,changes)?;
                let mut next_res=reservation.1.clone();next_res["status"]=json!("CHECKED_OUT");next_res["checkedOutAt"]=json!(stamp);put(tx,"roomReservations",&key,next_res,changes)?;
                let mut next_folio=folio.1.clone();next_folio["status"]=json!("CLOSED");next_folio["closedAt"]=json!(stamp);next_folio["closedBy"]=json!(user.staff_id);put(tx,"folios",&key,next_folio,changes)?;
                let mut next_room=room.1.clone();next_room["housekeepingState"]=json!("DIRTY");next_room["housekeepingAt"]=json!(stamp);next_room["housekeepingBy"]=json!(user.staff_id);put(tx,"rooms",text(&reservation.1,"roomId")?,next_room,changes)?;
                let turnaround=room.1["turnaroundMinutes"].as_i64().unwrap_or(0);if turnaround>0{let until=Utc::now()+Duration::minutes(turnaround);let affected:Vec<String>=list(tx,"roomReservations")?.into_iter().filter_map(|r|{if r["id"].as_str()==Some(key.as_str())||r["data"]["roomId"]!=reservation.1["roomId"]||r["data"]["status"]!="RESERVED"{return None;}let a=room_parse_time(r["data"]["startsAt"].as_str()?).ok()?;let b=room_parse_time(r["data"]["blockedUntil"].as_str()?).ok()?;if room_overlap(Utc::now(),until,a,b){r["id"].as_str().map(str::to_string)}else{None}}).collect();let block_id=format!("turnaround-{}",cmd.id);put(tx,"roomBlocks",&block_id,json!({"roomId":reservation.1["roomId"],"startsAt":Utc::now().to_rfc3339(),"endsAt":until.to_rfc3339(),"reason":"Turnaround after guest departure","sourceType":"TURNAROUND","sourceCommandId":cmd.id,"status":"ACTIVE","affectedReservationIds":affected}),changes)?;}
                put(tx,"stayEvents",&format!("stay-event-{}",cmd.id),json!({"stayId":key,"operation":"stay.checkOut","roomId":reservation.1["roomId"],"actorId":user.staff_id,"occurredAt":stamp,"sourceCommandId":cmd.id}),changes)?;
                hotel_receipt_capture(tx,user,&key,&cmd.id,changes)?;
            }

            _=>return Err("PROTOCOL_UNSUPPORTED: stay operation".into())
        }
        return Ok(true);
    }

    if op.starts_with("roomReservation."){
        if !permissions(&user.role).contains(&"rooms.operate"){return Err("Permission required: rooms.operate".into());}
        let key=text(p,"id")?.to_string();
        let current=room_any(tx,"roomReservations",&key)?;
        match op {
            "roomReservation.create"|"roomReservation.update"=>{
                if op=="roomReservation.create" && current.is_some(){return Err("DUPLICATE_REFERENCE: reservation".into());}
                if op=="roomReservation.update"{
                    let (_,data,archived)=current.as_ref().ok_or("Reservation not found")?;
                    if *archived||data["status"].as_str()!=Some("RESERVED"){return Err("INVALID_STATE: only reserved bookings can be edited".into());}
                }
                room_expect_version(current.as_ref(),cmd.target_version)?;
                let room_id=text(p,"roomId")?.to_string();
                let customer_id=text(p,"customerId")?.to_string();
                let (_,room)=get(tx,"rooms",&room_id)?;
                let (_,property)=get(tx,"property","property")?;
                let rate_id=property["roomStayRatePlanId"].as_str().map(str::to_string).or_else(||p.get("ratePlanId").and_then(Value::as_str).map(str::to_string)).ok_or("VALIDATION_FAILED: configure the room stay rate in Settings")?;
                let (_,rate)=get(tx,"ratePlans",&rate_id)?;
                get(tx,"customers",&customer_id)?;
                if rate["roomTypeId"]!=room["roomTypeId"]{return Err("VALIDATION_FAILED: rate plan does not match room type".into());}
                let guests=p["guests"].as_i64().ok_or("VALIDATION_FAILED: guests must be an integer")?;
                let capacity=room["capacity"].as_i64().unwrap_or(0);
                if guests<1||guests>capacity{return Err("VALIDATION_FAILED: guest capacity".into());}
                let start=room_parse_time(text(p,"startsAt")?)?;
                let end=room_parse_time(text(p,"endsAt")?)?;
                room_validate_interval(start,end)?;
                let (checkout,cutoff)=room_stay_policy(&property)?;
                let explicit_stay_type=p.get("stayType").and_then(Value::as_str);
                let stay_type=explicit_stay_type.unwrap_or("NIGHTLY");
                if rate["mode"].as_str()==Some("DAY_USE"){return Err("VALIDATION_FAILED: configure the room stay rate as NIGHTLY".into());}
                let checkout_minutes=parse_clock(&checkout).unwrap();let cutoff_minutes=parse_clock(&cutoff).unwrap();
                let units=match (explicit_stay_type,stay_type){
                    (None,"NIGHTLY")=>{
                        let units=room_nightly_units(start,end);
                        if units<1||units>366{return Err("VALIDATION_FAILED: nightly arrival/departure dates".into());}
                        units
                    },
                    (_,"DAY")=>{
                        if room_local_date(start)!=room_local_date(end)||room_local_minutes(end)>cutoff_minutes{return Err("VALIDATION_FAILED: day stay must end by the configured cutoff".into());}
                        1
                    },
                    (_,"NIGHTLY")=>{
                        if room_local_minutes(end)!=checkout_minutes{return Err(format!("VALIDATION_FAILED: nightly departure must be at {checkout}"));}
                        let units=room_nightly_units(start,end);
                        if units<1||units>366{return Err("VALIDATION_FAILED: nightly arrival/departure dates".into());}
                        units
                    },
                    _=>return Err("VALIDATION_FAILED: stay type must be NIGHTLY or DAY".into())
                };
                let turnaround=room["turnaroundMinutes"].as_i64().unwrap_or(0);
                if !(0..=1440).contains(&turnaround){return Err("VALIDATION_FAILED: room turnaround".into());}
                let blocked_until=end+Duration::minutes(turnaround);
                room_available(tx,&room_id,start,blocked_until,Some(&key))?;
                if op=="roomReservation.update" && current.as_ref().is_some_and(|(_,d,_)|d["customerId"].as_str()!=Some(customer_id.as_str())) && get(tx,"folios",&key).is_ok(){
                    return Err("INVALID_STATE: an opened folio customer cannot be replaced".into());
                }
                let price=rate["priceMinor"].as_i64().ok_or("VALIDATION_FAILED: rate price")?;
                let stamp=now();
                let created=current.as_ref().and_then(|(_,d,_)|d["createdAt"].as_str()).unwrap_or(&stamp).to_string();
                put(tx,"roomReservations",&key,json!({
                    "id":key,"roomId":room_id,"ratePlanId":rate_id,"stayType":stay_type,"customerId":customer_id,"guests":guests,
                    "startsAt":start.to_rfc3339(),"occupancyStartsAt":start.to_rfc3339(),"endsAt":end.to_rfc3339(),
                    "blockedUntil":blocked_until.to_rfc3339(),"turnaroundMinutes":turnaround,
                    "status":"RESERVED","rateSnapshot":rate,"units":units,"quotedAmountMinor":price*units,
                    "taxInclusive":true,"createdAt":created,"updatedAt":stamp,"actorId":user.staff_id
                }),changes)?;
            }
            "roomReservation.cancel"|"roomReservation.noShow"=>{
                let (version,mut data,archived)=current.ok_or("Reservation not found")?;
                if archived||data["status"].as_str()!=Some("RESERVED"){return Err("INVALID_STATE: reservation is not reserved".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Reservation changed; reload before closing".into());}
                let reason=text(p,"reason")?;
                if let Ok((_,folio))=get(tx,"folios",&key){
                    if folio["balanceMinor"].as_i64().unwrap_or(0)!=0||folio["depositMinor"].as_i64().unwrap_or(0)!=0{
                        return Err("SETTLEMENT_REQUIRED: resolve reservation folio funds first".into());
                    }
                }
                if op=="roomReservation.noShow"{
                    let arrival=room_parse_time(data["startsAt"].as_str().ok_or("Invalid reservation arrival")?)?;
                    if Utc::now()<arrival{return Err("INVALID_STATE: arrival time has not passed".into());}
                }
                data["status"]=json!(if op=="roomReservation.cancel"{"CANCELLED"}else{"NO_SHOW"});
                data["reason"]=json!(reason);data["closedAt"]=json!(now());data["closedBy"]=json!(user.staff_id);
                put(tx,"roomReservations",&key,data,changes)?;
            }
            _=>return Err("PROTOCOL_UNSUPPORTED: reservation operation".into())
        }
        return Ok(true);
    }

    if !permissions(&user.role).contains(&"rooms.manage"){return Err("Permission required: rooms.manage".into());}

    if op.starts_with("roomType."){
        let key=text(p,"id")?.to_string();
        let current=room_any(tx,"roomTypes",&key)?;
        match op {
            "roomType.save"=>{
                if current.as_ref().is_some_and(|v|v.2){return Err("INVALID_STATE: reactivate room type before editing".into());}
                room_expect_version(current.as_ref(),cmd.target_version)?;
                let data=p["data"].as_object().ok_or("Room type data is required")?;
                for field in data.keys(){if !["name","code","maxGuests","features","notes"].contains(&field.as_str()){return Err(format!("VALIDATION_FAILED: room type field {field}"));}}
                let name=data.get("name").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Room type name is required")?;
                let code=data.get("code").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Room type code is required")?;
                let max_guests=data.get("maxGuests").and_then(Value::as_i64).ok_or("Room type maxGuests is required")?;
                if !(1..=1000).contains(&max_guests){return Err("VALIDATION_FAILED: room type capacity".into());}
                if data.get("features").is_some_and(|v|!v.is_array()){return Err("VALIDATION_FAILED: room type features must be an array".into());}
                room_unique_text(tx,"roomTypes","code",&key,code)?;
                let mut next=current.as_ref().map(|(_,v,_)|v.clone()).unwrap_or_else(||json!({"createdAt":now()}));
                next["name"]=json!(name);next["code"]=json!(code);next["maxGuests"]=json!(max_guests);
                let features=data.get("features").cloned().or_else(||next.get("features").cloned()).unwrap_or(json!([]));
                let notes=data.get("notes").cloned().or_else(||next.get("notes").cloned()).unwrap_or(json!(""));
                next["features"]=features;next["notes"]=notes;next["updatedAt"]=json!(now());
                put(tx,"roomTypes",&key,next,changes)?;
            }
            "roomType.archive"=>{
                let (version,_,archived)=current.ok_or("Room type not found")?;
                if archived{return Err("Room type is already archived".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Room type changed".into());}
                if room_active_reference(tx,"rooms","roomTypeId",&key,&[])?
                    ||room_active_reference(tx,"ratePlans","roomTypeId",&key,&[])?{
                    return Err("INVALID_STATE: room type has active rooms or rate plans".into());
                }
                room_put_archived(tx,"roomTypes",&key,true,changes)?;
            }
            "roomType.reactivate"=>{
                let (version,data,archived)=current.ok_or("Room type not found")?;
                if !archived{return Err("Room type is already active".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Room type changed".into());}
                room_unique_text(tx,"roomTypes","code",&key,text(&data,"code")?)?;
                room_put_archived(tx,"roomTypes",&key,false,changes)?;
            }
            _=>return Err("PROTOCOL_UNSUPPORTED: room type operation".into())
        }
        return Ok(true);
    }

    if op.starts_with("ratePlan."){
        let key=text(p,"id")?.to_string();
        let current=room_any(tx,"ratePlans",&key)?;
        match op {
            "ratePlan.save"=>{
                if current.as_ref().is_some_and(|v|v.2){return Err("INVALID_STATE: reactivate rate plan before editing".into());}
                room_expect_version(current.as_ref(),cmd.target_version)?;
                let data=p["data"].as_object().ok_or("Rate plan data is required")?;
                for field in data.keys(){if !["name","roomTypeId","mode","priceMinor","currency","taxBasisPoints","mealPlan","minNights","maxNights","notes"].contains(&field.as_str()){return Err(format!("VALIDATION_FAILED: rate field {field}"));}}
                let name=data.get("name").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Rate plan name is required")?;
                let room_type=data.get("roomTypeId").and_then(Value::as_str).ok_or("Rate plan room type is required")?;
                get(tx,"roomTypes",room_type)?;
                let price=data.get("priceMinor").and_then(Value::as_i64).ok_or("Rate priceMinor is required")?;
                if price<0{return Err("VALIDATION_FAILED: rate price".into());}
                if data.get("currency").and_then(Value::as_str)!=Some("KES"){return Err("VALIDATION_FAILED: rate currency must be KES".into());}
                let tax=data.get("taxBasisPoints").and_then(Value::as_i64).unwrap_or(0);
                if !(0..=10000).contains(&tax){return Err("VALIDATION_FAILED: rate tax".into());}
                let mode=data.get("mode").and_then(Value::as_str).unwrap_or("NIGHTLY");
                if mode!="NIGHTLY"{return Err("VALIDATION_FAILED: room stay rates must be NIGHTLY".into());}
                let min_nights=data.get("minNights").and_then(Value::as_i64).unwrap_or(1);
                let max_nights=data.get("maxNights").and_then(Value::as_i64).unwrap_or(366);
                if min_nights<1||max_nights<min_nights||max_nights>366{return Err("VALIDATION_FAILED: rate stay limits".into());}
                let mut next=current.as_ref().map(|(_,v,_)|v.clone()).unwrap_or_else(||json!({"createdAt":now()}));
                next["name"]=json!(name);next["roomTypeId"]=json!(room_type);next["mode"]=json!(mode);
                next["priceMinor"]=json!(price);next["currency"]=json!("KES");next["taxBasisPoints"]=json!(tax);
                next["durationMinutes"]=Value::Null;
                next["mealPlan"]=data.get("mealPlan").cloned().unwrap_or_else(||json!("ROOM_ONLY"));
                next["minNights"]=json!(min_nights);next["maxNights"]=json!(max_nights);
                let notes=data.get("notes").cloned().or_else(||next.get("notes").cloned()).unwrap_or(json!(""));
                next["notes"]=notes;next["updatedAt"]=json!(now());
                put(tx,"ratePlans",&key,next,changes)?;
            }
            "ratePlan.archive"=>{
                let (version,_,archived)=current.ok_or("Rate plan not found")?;
                if archived{return Err("Rate plan is already archived".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Rate plan changed".into());}
                if room_active_reference(tx,"roomReservations","ratePlanId",&key,&["RESERVED","CHECKED_IN"])?{
                    return Err("INVALID_STATE: rate plan has active reservations".into());
                }
                room_put_archived(tx,"ratePlans",&key,true,changes)?;
            }
            "ratePlan.reactivate"=>{
                let (version,data,archived)=current.ok_or("Rate plan not found")?;
                if !archived{return Err("Rate plan is already active".into());}
                if cmd.target_version!=Some(version){return Err("CONFLICT: Rate plan changed".into());}
                get(tx,"roomTypes",text(&data,"roomTypeId")?)?;
                room_put_archived(tx,"ratePlans",&key,false,changes)?;
            }
            _=>return Err("PROTOCOL_UNSUPPORTED: rate plan operation".into())
        }
        return Ok(true);
    }

    let key=text(p,"id")?.to_string();
    let target=if ["room.block","room.unblock"].contains(&op){"roomBlocks"}else{"rooms"};
    let current=room_any(tx,target,&key)?;
    match op {
        "room.save"=>{
            if current.as_ref().is_some_and(|v|v.2){return Err("INVALID_STATE: reactivate room before editing".into());}
            room_expect_version(current.as_ref(),cmd.target_version)?;
            let data=p["data"].as_object().ok_or("Room data is required")?;
            for field in data.keys(){if !["number","roomTypeId","capacity","turnaroundMinutes","floor","wing","amenities","notes","initialStatus"].contains(&field.as_str()){return Err(format!("VALIDATION_FAILED: room field {field}"));}}
            let number=data.get("number").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).ok_or("Room number is required")?;
            room_unique_text(tx,"rooms","number",&key,number)?;
            let room_type=data.get("roomTypeId").and_then(Value::as_str).ok_or("Room type is required")?;
            let (_,kind)=get(tx,"roomTypes",room_type)?;
            let capacity=data.get("capacity").and_then(Value::as_i64).ok_or("Room capacity is required")?;
            let max_guests=kind["maxGuests"].as_i64().unwrap_or(0);
            let turnaround=data.get("turnaroundMinutes").and_then(Value::as_i64).unwrap_or(30);
            if capacity<1||capacity>max_guests||!(0..=1440).contains(&turnaround){return Err("VALIDATION_FAILED: capacity or turnaround".into());}
            if data.get("amenities").is_some_and(|v|!v.is_array()){return Err("VALIDATION_FAILED: room amenities must be an array".into());}
            if let Some((_,prior,_))=&current{
                let changed=prior["roomTypeId"].as_str()!=Some(room_type)||prior["capacity"].as_i64()!=Some(capacity)||prior["turnaroundMinutes"].as_i64()!=Some(turnaround);
                if changed&&room_active_reference(tx,"roomReservations","roomId",&key,&["RESERVED","CHECKED_IN"])?{
                    return Err("INVALID_STATE: resolve active reservations before changing room constraints".into());
                }
                if data.contains_key("initialStatus"){return Err("VALIDATION_FAILED: initialStatus is only valid when creating a room".into());}
            }
            let mut next=current.as_ref().map(|(_,v,_)|v.clone()).unwrap_or_else(||json!({
                "housekeepingState":"CLEAN","maintenanceState":"AVAILABLE","createdAt":now()
            }));
            if current.is_none(){
                match data.get("initialStatus").and_then(Value::as_str).unwrap_or("READY"){
                    "READY"=>{next["housekeepingState"]=json!("CLEAN");next["maintenanceState"]=json!("AVAILABLE");},
                    "DIRTY"=>{next["housekeepingState"]=json!("DIRTY");next["maintenanceState"]=json!("AVAILABLE");},
                    "OUT_OF_ORDER"=>{next["housekeepingState"]=json!("CLEAN");next["maintenanceState"]=json!("OUT_OF_ORDER");},
                    _=>return Err("VALIDATION_FAILED: initial room status".into())
                }
            }
            next["number"]=json!(number);next["roomTypeId"]=json!(room_type);next["capacity"]=json!(capacity);next["turnaroundMinutes"]=json!(turnaround);
            for field in ["floor","wing","amenities","notes"]{if let Some(v)=data.get(field){next[field]=v.clone();}}
            next["updatedAt"]=json!(now());
            put(tx,"rooms",&key,next,changes)?;
        }
        "room.archive"=>{
            let (version,_,archived)=current.ok_or("Room not found")?;
            if archived{return Err("Room is already archived".into());}
            if cmd.target_version!=Some(version){return Err("CONFLICT: Room changed".into());}
            if room_active_reference(tx,"roomReservations","roomId",&key,&["RESERVED","CHECKED_IN"])?
                ||room_active_reference(tx,"roomBlocks","roomId",&key,&["ACTIVE"])?{
                return Err("INVALID_STATE: room has active reservations or blocks".into());
            }
            room_put_archived(tx,"rooms",&key,true,changes)?;
        }
        "room.reactivate"=>{
            let (version,data,archived)=current.ok_or("Room not found")?;
            if !archived{return Err("Room is already active".into());}
            if cmd.target_version!=Some(version){return Err("CONFLICT: Room changed".into());}
            room_unique_text(tx,"rooms","number",&key,text(&data,"number")?)?;
            get(tx,"roomTypes",text(&data,"roomTypeId")?)?;
            room_put_archived(tx,"rooms",&key,false,changes)?;
        }
        "room.housekeeping"=>{
            let (version,mut data,archived)=current.ok_or("Room not found")?;
            if archived{return Err("Room is archived".into());}
            if cmd.target_version!=Some(version){return Err("CONFLICT: Room changed".into());}
            let state=text(p,"state")?;
            let old=data["housekeepingState"].as_str().unwrap_or("CLEAN");
            let valid=(old=="DIRTY"&&state=="CLEANING")||(old=="CLEANING"&&state=="INSPECTION")||(old=="INSPECTION"&&["CLEAN","DIRTY"].contains(&state))||(old=="CLEAN"&&state=="DIRTY");
            if !valid{return Err("INVALID_STATE: housekeeping transition".into());}
            data["housekeepingState"]=json!(state);data["housekeepingAt"]=json!(now());data["housekeepingBy"]=json!(user.staff_id);
            put(tx,"rooms",&key,data,changes)?;
        }
        "room.condition"=>{
            let (version,mut data,archived)=current.ok_or("Room not found")?;
            if archived{return Err("Room is archived".into());}
            if cmd.target_version!=Some(version){return Err("CONFLICT: Room changed".into());}
            let state=text(p,"state")?;
            if !["AVAILABLE","OUT_OF_ORDER"].contains(&state){return Err("VALIDATION_FAILED: room condition".into());}
            if state=="OUT_OF_ORDER"&&room_active_reference(tx,"roomReservations","roomId",&key,&["RESERVED","CHECKED_IN"])?{
                return Err("INVALID_STATE: use a room block or resolve active reservations before taking the room out of order".into());
            }
            data["maintenanceState"]=json!(state);data["conditionReason"]=p.get("reason").cloned().unwrap_or(Value::Null);
            data["conditionAt"]=json!(now());data["conditionBy"]=json!(user.staff_id);
            put(tx,"rooms",&key,data,changes)?;
        }
        "room.block"=>{
            if current.is_some(){return Err("DUPLICATE_REFERENCE: room block".into());}
            if cmd.target_version.is_some(){return Err("CONFLICT: new room block must not have a target version".into());}
            let room_id=text(p,"roomId")?;
            let start=room_parse_time(text(p,"startsAt")?)?;let end=room_parse_time(text(p,"endsAt")?)?;
            room_validate_interval(start,end)?;
            let maintenance_order_id=p.get("maintenanceOrderId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
            if let Some(order_id)=maintenance_order_id.as_deref(){
                let (_,work)=get(tx,"maintenanceOrders",order_id)?;
                if work["roomId"].as_str()!=Some(room_id)||["COMPLETED","CANCELLED"].contains(&work["status"].as_str().unwrap_or("")){
                    return Err("VALIDATION_FAILED: maintenance room/status".into());
                }
            }
            room_available(tx,room_id,start,end,None)?;
            put(tx,"roomBlocks",&key,json!({
                "id":key,"roomId":room_id,"startsAt":start.to_rfc3339(),"endsAt":end.to_rfc3339(),
                "reason":text(p,"reason")?,"maintenanceOrderId":maintenance_order_id,"status":"ACTIVE","createdAt":now(),"createdBy":user.staff_id
            }),changes)?;
        }
        "room.unblock"=>{
            let (version,mut data,archived)=current.ok_or("Room block not found")?;
            if archived||data["status"].as_str()!=Some("ACTIVE"){return Err("INVALID_STATE: room block already released".into());}
            if cmd.target_version!=Some(version){return Err("CONFLICT: Room block changed".into());}
            if let Some(order_id)=data.get("maintenanceOrderId").and_then(Value::as_str).filter(|v|!v.trim().is_empty()){
                let (_,work)=get(tx,"maintenanceOrders",order_id)?;
                if !["COMPLETED","CANCELLED"].contains(&work["status"].as_str().unwrap_or("")){
                    return Err("INVALID_STATE: resolve maintenance before inspection/release".into());
                }
            }
            data["status"]=json!("RELEASED");data["releasedAt"]=json!(now());data["inspection"]=json!(text(p,"inspection")?);data["releasedBy"]=json!(user.staff_id);
            put(tx,"roomBlocks",&key,data,changes)?;
        }
        _=>return Err("PROTOCOL_UNSUPPORTED: room operation".into())
    }
    Ok(true)
}

pub fn execute(db: &mut Connection, token: &str, cmd: BusinessCommand) -> Result<Value> {
    let user = actor(db, token, true)?;
    execute_as(db, &user, cmd)
}
fn simple_setup_execute(tx: &Transaction, user: &Session, cmd: &BusinessCommand, changes: &mut Vec<Value>) -> Result<bool> {
    let p=&cmd.payload;
    let nested=|operation:&str,payload:Value|BusinessCommand{id:cmd.id.clone(),schema_version:cmd.schema_version,operation:operation.into(),target_version:None,payload};
    match cmd.operation.as_str() {
        "room.quickCreate" => {
            if !permissions(&user.role).contains(&"rooms.manage") { return Err("Permission required: rooms.manage".into()); }
            let numbers=p["numbers"].as_array().filter(|n|!n.is_empty()&&n.len()<=200).ok_or("Choose between 1 and 200 explicit room numbers")?;
            let mut seen=std::collections::HashSet::new();
            for number in numbers {
                let value=number.as_str().map(str::trim).filter(|s|!s.is_empty()&&s.len()<=40).ok_or("Invalid room number")?;
                if !seen.insert(value.to_lowercase()) { return Err("Duplicate room number in batch".into()); }
                room_unique_text(tx,"rooms","number","",value)?;
            }
            let type_id=if p["newType"].is_object() {
                let kind=&p["newType"]; let type_id=id();
                let name=text(kind,"name")?; let capacity=kind["capacity"].as_i64().ok_or("Capacity is required")?;
                let price=money(kind,"nightlyPrice")?;
                room_execute(tx,user,&nested("roomType.save",json!({"id":type_id,"data":{"name":name,"code":format!("TYPE-{}",&type_id[..8]),"maxGuests":capacity}})),changes)?;
                room_execute(tx,user,&nested("ratePlan.save",json!({"id":id(),"data":{"name":format!("{name} nightly"),"roomTypeId":type_id,"mode":"NIGHTLY","priceMinor":price,"currency":"KES","taxBasisPoints":0}})),changes)?;
                type_id
            } else { text(p,"roomTypeId")?.to_string() };
            let kind=get(tx,"roomTypes",&type_id)?.1;
            for number in numbers {
                let mut data=json!({"number":number.as_str().unwrap().trim(),"roomTypeId":type_id,"capacity":kind["maxGuests"],"turnaroundMinutes":30,"initialStatus":"READY"});
                if let Some(advanced)=p["details"].as_object() {
                    for (key,value) in advanced {
                        if !["capacity","turnaroundMinutes","initialStatus","floor","wing","notes"].contains(&key.as_str()) { return Err("Unsupported room detail".into()); }
                        data[key]=value.clone();
                    }
                }
                room_execute(tx,user,&nested("room.save",json!({"id":id(),"data":data})),changes)?;
            }
            Ok(true)
        }
        "asset.quickCreate" => {
            if !permissions(&user.role).contains(&"assets.manage") { return Err("Permission required: assets.manage".into()); }
            let category_id=if let Some(category)=p["assetCategoryId"].as_str().filter(|s|!s.is_empty()) { category.to_string() } else {
                let default_id="simple-property-unclassified";
                if room_any(tx,"assetCategories",default_id)?.is_none() {
                    asset_execute(tx,user,&nested("assetCategory.save",json!({"id":default_id,"data":{"name":"Unclassified property","code":"UNCLASSIFIED-PROPERTY","depreciationMethod":"NONE","usefulLifeMonths":0}})),changes)?;
                }
                get(tx,"assetCategories",default_id)?;
                default_id.to_string()
            };
            let asset_id=id();
            let data=json!({"name":text(p,"name")?,"tag":format!("PROP-{}",asset_id.to_ascii_uppercase()),"assetCategoryId":category_id,"roomId":p.get("roomId"),"locationId":p.get("locationId"),"purchaseCostMinor":p["purchaseCostMinor"].as_i64().unwrap_or(0),"notes":p.get("notes").cloned().unwrap_or(json!("Existing property registered; acquisition cost not supplied."))});
            asset_execute(tx,user,&nested("asset.save",json!({"id":asset_id,"data":data})),changes)?;
            Ok(true)
        }
        _=>Ok(false)
    }
}
// Shared procurement primitives run inside the caller's single business transaction.
fn procurement_create(tx: &Transaction, user: &Session, p: &Value, changes: &mut Vec<Value>) -> Result<String> {
            if !permissions(&user.role).contains(&"procurement.manage") { return Err("Purchase order management permission required".into()); }
            let supplier_id=text(p,"supplierId")?.to_string();
            let (_,supplier)=get(tx,"suppliers",&supplier_id)?;
            let requested=p["items"].as_array().ok_or("Add at least one purchase-order line")?;
            if requested.is_empty() || requested.len()>100 { return Err("Purchase orders require between 1 and 100 lines".into()); }
            let mut seen_stock=Vec::<String>::new();
            let mut seen_line_ids=Vec::<String>::new();
            let mut items=Vec::<Value>::new();
            let mut subtotal_minor=0i64;
            for line in requested {
                let treatment=line.get("treatment").and_then(Value::as_str).unwrap_or("STOCK").trim().to_ascii_uppercase();
                if !["STOCK","EXPENSE","ASSET"].contains(&treatment.as_str()) { return Err("VALIDATION_FAILED: purchase-line treatment".into()); }
                let line_id=line.get("lineId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string).unwrap_or_else(id);
                if line_id.len()>128||seen_line_ids.iter().any(|v|v==&line_id){return Err("DUPLICATE_REFERENCE: purchase line ID".into());}
                seen_line_ids.push(line_id.clone());
                let quantity_ordered=quantity(line,"quantityOrdered")?;
                if quantity_ordered<=0.0 { return Err("Ordered quantities must be greater than zero".into()); }
                let unit_price=quantity(line,"unitPrice")?;
                let line_total=((quantity_ordered*unit_price*100.0).round())/100.0;
                if !line_total.is_finite() || line_total>1_000_000_000.0 { return Err("Purchase order line total is too large".into()); }
                subtotal_minor=subtotal_minor.checked_add((line_total*100.0).round() as i64).ok_or("Purchase order total is too large")?;

                match treatment.as_str() {
                    "STOCK"=>{
                        let stock_id=text(line,"stockItemId")?.to_string();
                        if seen_stock.iter().any(|v|v==&stock_id) { return Err("Each stock item can appear only once on a purchase order".into()); }
                        seen_stock.push(stock_id.clone());
                        let (_,stock)=get(tx,"stockItems",&stock_id)?;
                        let package_id=line.get("purchasePackageId").and_then(Value::as_str).map(str::trim).filter(|value|!value.is_empty());
                        let purchase_package=if let Some(package_id)=package_id {
                            Some(stock["purchasePackages"].as_array().and_then(|packages|packages.iter().find(|package|package["id"].as_str()==Some(package_id))).cloned().ok_or("Selected purchase package does not belong to this stock item")?)
                        }else{None};
                        let quantity_per_package=purchase_package.as_ref().and_then(|package|package["baseQuantity"].as_f64()).filter(|value|value.is_finite()&&*value>0.0).unwrap_or(1.0);
                        if purchase_package.is_some()&&((quantity_ordered.round()-quantity_ordered).abs()>0.000001||quantity_per_package>1_000_000_000.0){return Err("VALIDATION_FAILED: purchase-package quantity must be a whole package within supported limits".into());}
                        let unit_symbol=purchase_package.as_ref().and_then(|package|package["name"].as_str()).unwrap_or_else(||stock["baseUnit"].as_str().unwrap_or("unit"));
                        let scan_unit=stock["scanUnitQuantity"].as_f64().filter(|value|value.is_finite()&&*value>0.0).unwrap_or(1.0);
                        items.push(json!({
                            "lineId":line_id,"treatment":"STOCK","displayName":stock["name"],
                            "stockItemId":stock_id,"stockItemName":stock["name"],"quantityOrdered":quantity_ordered,
                            "quantityDelivered":0,"quantityReceived":0,"quantityRejected":0,"unitPrice":unit_price,
                            "unitSymbol":unit_symbol,"scanUnitQuantity":scan_unit,
                            "purchasePackageId":package_id,"purchasePackageName":purchase_package.as_ref().map(|package|package["name"].clone()),
                            "quantityBasePerPackage":quantity_per_package,"quantityBaseUnit":stock["baseUnit"],"lineTotal":line_total
                        }));
                    }
                    "EXPENSE"=>{
                        let description=text(line,"description")?.trim();
                        if description.is_empty()||description.len()>240{return Err("VALIDATION_FAILED: expense description".into());}
                        let category=line.get("expenseCategory").and_then(Value::as_str).unwrap_or("GENERAL").trim().to_ascii_uppercase();
                        let (account_id,account_code,account_name)=match category.as_str(){
                            "GENERAL"=>("OPERATING_EXPENSE","6000","Operating expense"),
                            "REPAIRS"=>("MAINTENANCE_EXPENSE","6100","Maintenance expense"),
                            "MARKETING"=>("MARKETING_EXPENSE","6200","Marketing expense"),
                            "UTILITIES"=>("UTILITIES_EXPENSE","6300","Utilities expense"),
                            _=>return Err("VALIDATION_FAILED: expense category".into())
                        };
                        items.push(json!({
                            "lineId":line_id,"treatment":"EXPENSE","displayName":description,
                            "description":description,"expenseCategory":category,"expenseAccountId":account_id,
                            "expenseAccountCode":account_code,"expenseAccountName":account_name,
                            "quantityOrdered":quantity_ordered,"quantityDelivered":0,"quantityReceived":0,"quantityRejected":0,
                            "unitPrice":unit_price,"unitSymbol":"unit","scanUnitQuantity":1,"lineTotal":line_total
                        }));
                    }
                    "ASSET"=>{
                        if (quantity_ordered.round()-quantity_ordered).abs()>0.000001||quantity_ordered>100.0{return Err("VALIDATION_FAILED: asset quantity must be a whole number between 1 and 100".into());}
                        let category_id=text(line,"assetCategoryId")?.to_string();
                        let category_record=room_any(tx,"assetCategories",&category_id)?.ok_or("Asset category not found")?;
                        if category_record.2{return Err("INVALID_STATE: asset category is archived".into());}
                        let category=category_record.1;
                        let asset_name=text(line,"assetName")?.trim();
                        if asset_name.is_empty()||asset_name.len()>240{return Err("VALIDATION_FAILED: asset name".into());}
                        items.push(json!({
                            "lineId":line_id,"treatment":"ASSET","displayName":asset_name,
                            "assetName":asset_name,"assetCategoryId":category_id,"assetCategoryName":category["name"],"assetCategoryCode":category["code"],
                            "quantityOrdered":quantity_ordered,"quantityDelivered":0,"quantityReceived":0,"quantityRejected":0,
                            "unitPrice":unit_price,"unitSymbol":"asset","scanUnitQuantity":1,"lineTotal":line_total
                        }));
                    }
                    _=>unreachable!()
                }
            }
            if subtotal_minor>100_000_000_000 { return Err("Purchase order total is too large".into()); }
            let order_id=id();
            let po_number=format!("PO-{}",order_id[..8].to_ascii_uppercase());
            let total=subtotal_minor as f64/100.0;
            put(tx,"purchaseOrders",&order_id,json!({
                "id":order_id,"poNumber":po_number,"supplierId":supplier_id,"supplierName":supplier["name"],
                "propertyId":"property","createdAt":now(),"createdBy":user.staff_id,"createdByName":user.name,
                "approvedBy":user.name,"approvedById":user.staff_id,"approvedAt":now(),"status":"APPROVED",
                "items":items,"subtotal":total,"taxTotal":0,"grandTotal":total
            }),changes)?;
    Ok(order_id)
}
fn procurement_receive(tx: &Transaction, user: &Session, cmd: &BusinessCommand, changes: &mut Vec<Value>) -> Result<()> {
    let p=&cmd.payload;
            let order_id=text(p,"purchaseOrderId")?.to_string();
            authorize(tx,user,"procurement.receive",p,Some(&order_id))?;
            let (order_version,mut order)=get(tx,"purchaseOrders",&order_id)?;
            if cmd.target_version!=Some(order_version) { return Err("CONFLICT: Purchase order changed; reload before receiving".into()); }
            if !["APPROVED","PARTIALLY_RECEIVED"].contains(&order["status"].as_str().unwrap_or("")) {
                return Err("Only approved purchase orders with remaining quantities can receive a delivery".into());
            }
            let location_id=p.get("locationId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string);
            let requested=p["lines"].as_array().ok_or("Delivery lines are required")?;
            if requested.is_empty() { return Err("Enter at least one delivered quantity".into()); }
            if requested.len()>100 { return Err("A goods receipt cannot contain more than 100 lines".into()); }
            let mut order_items=order["items"].as_array().cloned().ok_or("Purchase order lines are invalid")?;
            let mut seen=Vec::<String>::new();
            let mut receipt_lines=Vec::<Value>::new();
            let mut accepted_value_minor=0i64;
            let mut stock_value_minor=0i64;
            let mut asset_value_minor=0i64;
            let mut expense_totals:Vec<(String,String,String,i64)>=vec![];
            let mut over_received=false;
            let mut has_delivered=false;
            let mut needs_stock_location=false;
            for line in requested {
                let request_line_id=line.get("lineId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty());
                let request_stock=line.get("stockItemId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty());
                let index=order_items.iter().position(|item|{
                    request_line_id.is_some_and(|id|item["lineId"].as_str()==Some(id))
                        || (request_line_id.is_none()&&request_stock.is_some_and(|id|item["stockItemId"].as_str()==Some(id)))
                }).ok_or("A delivered line is not on this purchase order")?;
                let line_id=order_items[index].get("lineId").and_then(Value::as_str).unwrap_or_else(||order_items[index]["stockItemId"].as_str().unwrap_or("")).to_string();
                if line_id.is_empty()||seen.iter().any(|id|id==&line_id){return Err("A purchase line can be received only once per GRN".into());}
                seen.push(line_id.clone());
                let delivered=quantity(line,"quantityDelivered")?;
                let accepted=quantity(line,"quantityAccepted")?;
                let rejected=quantity(line,"quantityRejected")?;
                if delivered<=0.0 { continue; }
                has_delivered=true;
                if accepted<0.0||rejected<0.0||(accepted+rejected-delivered).abs()>0.000001 { return Err("Delivered quantity must equal accepted plus rejected quantity".into()); }
                let rejection_reason=line.get("rejectionReason").and_then(Value::as_str).unwrap_or("").trim();
                if rejected>0.0 && rejection_reason.is_empty() { return Err("Enter a reason for every rejected delivery quantity".into()); }
                let ordered=quantity(&order_items[index],"quantityOrdered")?;
                let previously_accepted=order_items[index]["quantityReceived"].as_f64().unwrap_or(0.0);
                let previously_delivered=order_items[index]["quantityDelivered"].as_f64().unwrap_or(0.0);
                let previously_rejected=order_items[index]["quantityRejected"].as_f64().unwrap_or(0.0);
                if order_items[index].get("purchasePackageId").and_then(Value::as_str).is_some()&&[delivered,accepted,rejected].iter().any(|value|(value.round()-*value).abs()>0.000001){return Err("VALIDATION_FAILED: purchase-package receipt quantities must be whole packages".into());}
                if previously_accepted+accepted>ordered+0.000001 { over_received=true; }
                let treatment=order_items[index].get("treatment").and_then(Value::as_str).unwrap_or("STOCK").to_ascii_uppercase();
                if treatment=="ASSET" && ((accepted.round()-accepted).abs()>0.000001||(delivered.round()-delivered).abs()>0.000001||(rejected.round()-rejected).abs()>0.000001){
                    return Err("VALIDATION_FAILED: asset receipt quantities must be whole units".into());
                }
                if treatment=="STOCK"{needs_stock_location=true;}
                let unit_price=quantity(&order_items[index],"unitPrice")?;
                let raw_line_value=accepted*unit_price;
                if !raw_line_value.is_finite() || raw_line_value>1_000_000_000.0 { return Err("Accepted receipt value is too large".into()); }
                let line_value=(raw_line_value*100.0).round() as i64;
                accepted_value_minor=accepted_value_minor.checked_add(line_value).ok_or("Accepted receipt total is too large")?;
                match treatment.as_str(){
                    "STOCK"=>stock_value_minor=stock_value_minor.checked_add(line_value).ok_or("Stock receipt total is too large")?,
                    "ASSET"=>asset_value_minor=asset_value_minor.checked_add(line_value).ok_or("Asset receipt total is too large")?,
                    "EXPENSE"=>{
                        let aid=order_items[index]["expenseAccountId"].as_str().unwrap_or("OPERATING_EXPENSE").to_string();
                        let code=order_items[index]["expenseAccountCode"].as_str().unwrap_or("6000").to_string();
                        let name=order_items[index]["expenseAccountName"].as_str().unwrap_or("Operating expense").to_string();
                        if let Some(existing)=expense_totals.iter_mut().find(|v|v.0==aid){existing.3=existing.3.checked_add(line_value).ok_or("Expense receipt total is too large")?;}
                        else{expense_totals.push((aid,code,name,line_value));}
                    }
                    _=>return Err("VALIDATION_FAILED: stored purchase treatment".into())
                }
                order_items[index]["quantityDelivered"]=json!(previously_delivered+delivered);
                order_items[index]["quantityReceived"]=json!(previously_accepted+accepted);
                order_items[index]["quantityRejected"]=json!(previously_rejected+rejected);
                receipt_lines.push(json!({
                    "lineId":line_id,"treatment":treatment,"displayName":order_items[index]["displayName"],
                    "stockItemId":order_items[index].get("stockItemId").cloned().unwrap_or(Value::Null),
                    "stockItemName":order_items[index].get("stockItemName").cloned().unwrap_or(Value::Null),
                    "assetCategoryId":order_items[index].get("assetCategoryId").cloned().unwrap_or(Value::Null),
                    "assetCategoryName":order_items[index].get("assetCategoryName").cloned().unwrap_or(Value::Null),
                    "assetName":order_items[index].get("assetName").cloned().unwrap_or(Value::Null),
                    "expenseAccountId":order_items[index].get("expenseAccountId").cloned().unwrap_or(Value::Null),
                    "expenseAccountCode":order_items[index].get("expenseAccountCode").cloned().unwrap_or(Value::Null),
                    "expenseAccountName":order_items[index].get("expenseAccountName").cloned().unwrap_or(Value::Null),
                    "quantityDelivered":delivered,"quantityAccepted":accepted,"quantityRejected":rejected,
                    "unitSymbol":order_items[index]["unitSymbol"],"unitCost":unit_price,
                    "purchasePackageId":order_items[index]["purchasePackageId"],"purchasePackageName":order_items[index]["purchasePackageName"],
                    "quantityBasePerPackage":order_items[index]["quantityBasePerPackage"],"quantityBaseUnit":order_items[index]["quantityBaseUnit"],
                    "acceptedValue":line_value as f64/100.0,"rejectionReason":rejection_reason
                }));
            }
            if !has_delivered || receipt_lines.is_empty() { return Err("Enter a positive delivered quantity for at least one purchase order line".into()); }
            if needs_stock_location{
                let id=location_id.as_deref().ok_or("Choose a stock location for stock lines on this delivery")?;
                get(tx,"stockLocations",id)?;
            }
            if over_received { require_separate_approval(tx,user,"procurement.over_receive",p,&order_id)?; }
            let receipt_id=id();
            let grn_number=format!("GRN-{}",receipt_id[..8].to_ascii_uppercase());
            let supplier_id=text(&order,"supplierId")?.to_string();
            let invoice_reference=p.get("supplierInvoiceNumber").and_then(Value::as_str).unwrap_or("").trim().to_string();
            let delivery_note=p.get("deliveryNote").and_then(Value::as_str).unwrap_or("").trim().to_string();
            let receipt_time=now();
            put(tx,"goodsReceipts",&receipt_id,json!({
                "id":receipt_id,"grnNumber":grn_number,"purchaseOrderId":order_id,"poNumber":order["poNumber"],
                "supplierId":supplier_id,"supplierName":order["supplierName"],"locationId":location_id,
                "supplierInvoiceNumber":invoice_reference,"deliveryNote":delivery_note,"notes":p.get("notes"),
                "lines":receipt_lines,"receivedAt":receipt_time,"receivedBy":user.staff_id,"receivedByName":user.name,
                "acceptedValue":accepted_value_minor as f64/100.0,
                "treatmentTotals":{"stockMinor":stock_value_minor,"assetMinor":asset_value_minor,"expenseMinor":expense_totals.iter().map(|v|v.3).sum::<i64>()},
                "status":"POSTED"
            }),changes)?;

            for line in &receipt_lines {
                let accepted=line["quantityAccepted"].as_f64().unwrap_or(0.0);
                if accepted<=0.0 { continue; }
                let treatment=line["treatment"].as_str().unwrap_or("STOCK");
                if treatment=="STOCK"{
                    let stock_id=text(line,"stockItemId")?.to_string();
                    let package_count=accepted;
                    let base_per_package=line["quantityBasePerPackage"].as_f64().filter(|value|value.is_finite()&&*value>0.0).unwrap_or(1.0);
                    let base_accepted=package_count*base_per_package;
                    let package_cost=line["unitCost"].as_f64().unwrap_or(0.0);
                    let unit_cost=package_cost/base_per_package;
                    let location=location_id.as_deref().ok_or("Stock receipt location missing")?;
                    let (_,mut stock)=get(tx,"stockItems",&stock_id)?;
                    let stock_total=stock["currentStock"].as_object().map(|locations|locations.values().map(|value|value.as_f64().unwrap_or(0.0)).sum::<f64>()).unwrap_or(0.0);
                    let old_cost=stock["averageUnitCost"].as_f64().unwrap_or(0.0);
                    let next_cost=if stock_total+base_accepted>0.0 { ((stock_total*old_cost+base_accepted*unit_cost)/(stock_total+base_accepted)*1_000_000.0).round()/1_000_000.0 } else { unit_cost };
                    stock["averageUnitCost"]=json!(next_cost);
                    put(tx,"stockItems",&stock_id,stock,changes)?;
                    let inventory_receipt_id=id();
                    put(tx,"inventoryReceipts",&inventory_receipt_id,json!({
                        "id":inventory_receipt_id,"goodsReceiptId":receipt_id,"purchaseOrderId":order_id,
                        "purchaseLineId":line["lineId"],"stockItemId":stock_id,"locationId":location,"quantity":base_accepted,"packageCount":package_count,"packageCost":package_cost,"unitCost":unit_cost,
                        "supplierId":supplier_id,"reference":grn_number,"supplierInvoiceNumber":invoice_reference,
                        "receivedAt":receipt_time,"receivedBy":user.staff_id
                    }),changes)?;
                    stock_delta_with_cost(tx,user,&stock_id,location,base_accepted,"PURCHASE_RECEIPT",&receipt_id,&grn_number,Some(unit_cost),changes)?;
                }else if treatment=="ASSET"{
                    let units=accepted.round() as i64;
                    let unit_cost_minor=(line["unitCost"].as_f64().unwrap_or(0.0)*100.0).round() as i64;
                    for ordinal in 1..=units{
                        let source_key=format!("{receipt_id}:{}:{ordinal}",line["lineId"].as_str().unwrap_or("asset"));
                        let acquisition_id=id();
                        put(tx,"assetAcquisitions",&acquisition_id,json!({
                            "id":acquisition_id,"sourceUnitKey":source_key,"status":"PENDING_COMMISSION",
                            "goodsReceiptId":receipt_id,"grnNumber":grn_number,"purchaseOrderId":order_id,"poNumber":order["poNumber"],
                            "purchaseLineId":line["lineId"],"unitOrdinal":ordinal,
                            "assetName":line["assetName"],"assetCategoryId":line["assetCategoryId"],"assetCategoryName":line["assetCategoryName"],
                            "supplierId":supplier_id,"supplierName":order["supplierName"],"unitCostMinor":unit_cost_minor,
                            "receivedAt":receipt_time,"receivedBy":user.staff_id,"receivedByName":user.name
                        }),changes)?;
                    }
                }
            }

            if accepted_value_minor>0 {
                let payable_id=id();
                put(tx,"supplierPayables",&payable_id,json!({
                    "id":payable_id,"payableNumber":format!("AP-{}",payable_id[..8].to_ascii_uppercase()),
                    "supplierId":supplier_id,"supplierName":order["supplierName"],"purchaseOrderId":order_id,
                    "goodsReceiptId":receipt_id,"grnNumber":grn_number,"supplierInvoiceNumber":invoice_reference,
                    "amount":accepted_value_minor as f64/100.0,"paidAmount":0,"amountDue":accepted_value_minor as f64/100.0,"status":"RECEIVED_UNINVOICED",
                    "basis":"Accepted STOCK / EXPENSE / ASSET procurement lines at approved purchase-order cost","createdAt":receipt_time
                }),changes)?;
                let journal_id=id();let amount=accepted_value_minor as f64/100.0;let mut lines=Vec::<Value>::new();
                if stock_value_minor>0{lines.push(json!({"id":id(),"accountId":"INVENTORY","accountCode":"1400","accountName":"Inventory","debit":stock_value_minor as f64/100.0,"credit":0,"debitMinor":stock_value_minor,"creditMinor":0}));}
                if asset_value_minor>0{lines.push(json!({"id":id(),"accountId":"ASSET_CLEARING","accountCode":"1505","accountName":"Asset clearing","debit":asset_value_minor as f64/100.0,"credit":0,"debitMinor":asset_value_minor,"creditMinor":0}));}
                for (account_id,account_code,account_name,value_minor) in &expense_totals{
                    if *value_minor>0{lines.push(json!({"id":id(),"accountId":account_id,"accountCode":account_code,"accountName":account_name,"debit":*value_minor as f64/100.0,"credit":0,"debitMinor":value_minor,"creditMinor":0}));}
                }
                lines.push(json!({"id":id(),"accountId":"ACCOUNTS_PAYABLE","accountCode":"2000","accountName":"Accounts payable","debit":0,"credit":amount,"debitMinor":0,"creditMinor":accepted_value_minor}));
                put(tx,"journalEntries",&journal_id,json!({
                    "id":journal_id,"entryNumber":format!("JE-{}",journal_id[..8].to_ascii_uppercase()),
                    "propertyId":"property","occurredAt":receipt_time,"postedAt":receipt_time,
                    "sourceType":"SUPPLIER_RECEIPT","sourceId":receipt_id,"memo":format!("Accepted procurement receipt from {} ({grn_number})",order["supplierName"]),
                    "lines":lines,"totalDebit":amount,"totalCredit":amount,"balanced":true
                }),changes)?;
            }

            let fully_received=order_items.iter().all(|item|item["quantityReceived"].as_f64().unwrap_or(0.0)+0.000001>=item["quantityOrdered"].as_f64().unwrap_or(0.0));
            let any_delivered=order_items.iter().any(|item|item["quantityDelivered"].as_f64().unwrap_or(0.0)>0.0);
            order["items"]=json!(order_items);
            order["status"]=json!(if fully_received{"RECEIVED"}else if any_delivered{"PARTIALLY_RECEIVED"}else{"APPROVED"});
            order["lastGoodsReceiptId"]=json!(receipt_id);
            order["lastGoodsReceiptAt"]=json!(receipt_time);
            put(tx,"purchaseOrders",&order_id,order,changes)?;
    Ok(())
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
    if simple_setup_execute(&tx,user,&cmd,&mut changes)? {
        let result=finish(&tx,&cmd,&user.staff_id,changes)?;
        tx.commit().map_err(error)?;
        return Ok(result);
    }
    if customer_credit::execute(&tx,user,&cmd,&mut changes)? {
        if cmd.operation=="customerCredit.charge" { receipts::capture(&tx,user,text(p,"orderId")?,&cmd.id,&mut changes)?; }
        let result=finish(&tx,&cmd,&user.staff_id,changes)?;
        tx.commit().map_err(error)?;
        return Ok(result);
    }
    if asset_execute(&tx,user,&cmd,&mut changes)? {
        let result=finish(&tx,&cmd,&user.staff_id,changes)?;
        tx.commit().map_err(error)?;
        return Ok(result);
    }
    if folio_execute(&tx,user,&cmd,&mut changes)? {
        if cmd.operation=="pos.roomCharge" { receipts::capture(&tx,user,text(p,"orderId")?,&cmd.id,&mut changes)?; }
        let result=finish(&tx,&cmd,&user.staff_id,changes)?;
        tx.commit().map_err(error)?;
        return Ok(result);
    }
    if room_execute(&tx,user,&cmd,&mut changes)? {
        let result=finish(&tx,&cmd,&user.staff_id,changes)?;
        tx.commit().map_err(error)?;
        return Ok(result);
    }
    match cmd.operation.as_str() {
        "catalog.createWithOpeningStock" => {
            if cmd.target_version.is_some() {
                return Err("A new catalog setup command cannot target an existing record".into());
            }
            let mut product=p.get("product").filter(|v|v.is_object()).cloned();
            if product.is_some()&&!permissions(&user.role).contains(&"catalog.manage") {
                return Err("Permission required: catalog.manage".into());
            }
            if !permissions(&user.role).contains(&"inventory.adjust") {
                return Err("Permission required: inventory.adjust".into());
            }

            let mut stock=p.get("stockItem").filter(|v|v.is_object()).ok_or("Stock item data is required")?.clone();
            let location_id=text(p,"locationId")?;
            let starting_quantity=quantity(p,"startingQuantity")?;
            let location=get(&tx,"stockLocations",location_id)?.1;
            let product_id=product.as_ref().map(|_|id());
            let stock_id=id();

            if let Some(product)=product.as_mut() {
                text(product,"name")?;
                money(product,"price")?;
                let product_code=text(product,"code")?;
                if !["BAR","KITCHEN","SERVICE"].contains(&text(product,"routeTo")?) { return Err("Invalid preparation station".into()); }
                let outlets=product["outletIds"].as_array().filter(|items|!items.is_empty()).ok_or("Assign at least one outlet")?;
                for outlet in outlets { get(&tx,"outlets",outlet.as_str().ok_or("Invalid outlet")?)?; }
                let duplicate_product_code:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM records WHERE collection='products' AND archived=0 AND lower(json_extract(data,'$.code'))=lower(?))",[product_code],|r|r.get(0)).map_err(error)?;
                if duplicate_product_code { return Err("This code already belongs to another product".into()); }
            }

            let stock_code=text(&stock,"code")?;
            text(&stock,"name")?;
            text(&stock,"baseUnit")?;
            money(&stock,"averageUnitCost")?;
            if !stock["sealedContainerSize"].is_null() {
                let size=quantity(&stock,"sealedContainerSize")?;
                if size<=0.0||size>100_000.0||stock["baseUnit"].as_str()!=Some("ml"){return Err("Sealed/open bottle tracking requires a valid ml container size".into());}
            }
            if !stock["scanUnitQuantity"].is_null() && quantity(&stock,"scanUnitQuantity")?<=0.0 { return Err("Quantity represented by one scan must be greater than zero".into()); }
            if !stock["reorderLevel"].is_null() { quantity(&stock,"reorderLevel")?; }
            let duplicate_stock_code:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM records WHERE collection='stockItems' AND archived=0 AND lower(json_extract(data,'$.code'))=lower(?))",[stock_code],|r|r.get(0)).map_err(error)?;
            if duplicate_stock_code { return Err("This code already belongs to another stock item".into()); }
            if let Some(product)=product.as_mut(){
                let product_barcode=normalize_barcode_value(product)?;
                validate_unique_barcode(&tx,"products",product_id.as_deref().ok_or("Missing product identifier")?,product_barcode.as_deref())?;
            }
            let stock_barcode=normalize_barcode_value(&mut stock)?;
            validate_unique_barcode(&tx,"stockItems",&stock_id,stock_barcode.as_deref())?;

            if let Some(product)=product.as_mut(){
              if product.get("productFamilyId").and_then(Value::as_str).is_some_and(|value|!value.trim().is_empty()) {
                text(product,"productFamilyName")?;
                text(product,"packageType")?;
                let variant_label=text(product,"variantLabel")?;
                text(product,"containerUnit")?;
                if quantity(product,"containerQuantity")?<=0.0 || quantity(product,"portionVolume")?<=0.0 { return Err("Physical container and stock quantities must be greater than zero".into()); }
                let portions=product["portions"].as_array().filter(|items|!items.is_empty()).ok_or("Add at least one sale format for this physical size")?;
                for portion in portions { text(portion,"id")?; text(portion,"name")?; if quantity(portion,"volume")?<=0.0{return Err("Sale format stock quantity must be greater than zero".into());} money(portion,"price")?; }
                let duplicate_variant:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM records WHERE collection='products' AND archived=0 AND json_extract(data,'$.productFamilyId')=? AND lower(json_extract(data,'$.variantLabel'))=lower(?))",params![product["productFamilyId"].as_str(),variant_label],|r|r.get(0)).map_err(error)?;
                if duplicate_variant { return Err("This product family already has that physical size".into()); }
              }
              product["id"]=json!(product_id.as_deref().ok_or("Missing product identifier")?);
              product["stockItemId"]=json!(stock_id);
            }

            stock["id"]=json!(stock_id);
            let mut current_stock=serde_json::Map::new();
            if starting_quantity>0.0 { current_stock.insert(location_id.to_string(),json!(starting_quantity)); }
            stock["currentStock"]=Value::Object(current_stock);
            if let Some(size)=stock["sealedContainerSize"].as_f64().filter(|value|value.is_finite()&&*value>0.0) {
                let sealed=(starting_quantity/size).floor();
                let open=((starting_quantity-sealed*size)*1_000_000.0).round()/1_000_000.0;
                let mut by_location=serde_json::Map::new();
                by_location.insert(location_id.to_string(),json!({"sealedContainers":sealed,"openQuantity":open,"containerSize":size}));
                stock["sealedOpenStock"]=Value::Object(by_location);
            }
            if let (Some(product_id),Some(product))=(product_id.as_deref(),product){put(&tx,"products",product_id,product,&mut changes)?;}
            put(&tx,"stockItems",&stock_id,stock.clone(),&mut changes)?;
            if starting_quantity>0.0 {
                let movement_id=id();
                let cost=stock["averageUnitCost"].as_f64().unwrap_or(0.0);
                put(&tx,"stockMovements",&movement_id,json!({
                    "id":movement_id,"organizationId":"business","propertyId":"property","stockItemId":stock_id,
                    "stockItemName":stock["name"],"locationId":location_id,"locationName":location["name"],
                    "quantityDelta":starting_quantity,"baseUnit":stock["baseUnit"],"movementType":"OPENING_BALANCE",
                    "sealedOpenAfter":stock["sealedOpenStock"][location_id],
                    "sourceId":cmd.id,"reasonCode":"Initial quantity captured with new item",
                    "occurredAt":now(),"actorUserId":user.staff_id,"actorName":user.name,
                    "unitCostSnapshot":cost,"totalCostValuation":((starting_quantity*cost*100.0).round())/100.0
                }),&mut changes)?;
            }
        }
        "business.identity" => {
            authorize(&tx,user,"business.configure",p,None)?;
            let (organization_version,mut organization)=get(&tx,"organization","business")?;
            let (property_version,mut property)=get(&tx,"property","property")?;
            if p["organizationVersion"].as_i64()!=Some(organization_version)||p["propertyVersion"].as_i64()!=Some(property_version){return Err("CONFLICT: Business identity changed; reopen settings".into());}
            let data=&p["data"];text(data,"name")?;
            for key in ["name","legalName","registrationNumber","address","phone","email"] {
                let value=data[key].as_str().ok_or("Business identity fields must be text")?.trim();
                if value.len()>500{return Err("Business identity field is too long".into());}
                organization[key]=json!(value);
                if ["name","address","phone","email"].contains(&key){property[key]=json!(value);}
            }
            if let Some(kra)=data.get("kraPin").and_then(Value::as_str) {
                let kra=kra.trim(); if kra.len()>100{return Err("Business PIN is too long".into());}
                organization["kraPin"]=json!(kra); property["kraPin"]=json!(kra);
            }
            if let Some(currency)=data.get("currency").and_then(Value::as_str) {
                if currency!="KES"{return Err("Business identity currency must be KES".into());}
                property["currency"]=json!(currency);
            }
            if let Some(timezone)=data.get("timezone").and_then(Value::as_str) {
                if timezone!="Africa/Nairobi"{return Err("Business identity timezone must be Africa/Nairobi".into());}
                property["timezone"]=json!(timezone);
            }
            put(&tx,"organization","business",organization,&mut changes)?;
            put(&tx,"property","property",property,&mut changes)?;
        }
        "roomStay.settings" => {
            authorize(&tx,user,"business.configure",p,None)?;
            let (property_version,mut property)=get(&tx,"property","property")?;
            if p["propertyVersion"].as_i64()!=Some(property_version){return Err("CONFLICT: Room stay settings changed; reopen Settings".into());}
            let room_type=text(p,"roomTypeId")?;let rate_id=text(p,"ratePlanId")?;
            get(&tx,"roomTypes",room_type)?;
            let (_,rate)=get(&tx,"ratePlans",rate_id)?;
            if rate["roomTypeId"].as_str()!=Some(room_type){return Err("VALIDATION_FAILED: configured rate must match configured room type".into());}
            if rate["mode"].as_str()!=Some("NIGHTLY"){return Err("VALIDATION_FAILED: configured room stay rate must be NIGHTLY".into());}
            let checkout=text(p,"nightlyCheckoutTime")?;let cutoff=text(p,"dayStayCutoffTime")?;
            let checkout_minutes=parse_clock(checkout).ok_or("VALIDATION_FAILED: nightly checkout time")?;
            let cutoff_minutes=parse_clock(cutoff).ok_or("VALIDATION_FAILED: day stay cutoff time")?;
            if checkout_minutes>=cutoff_minutes{return Err("VALIDATION_FAILED: nightly checkout must be before day stay cutoff".into());}
            property["roomStayRoomTypeId"]=json!(room_type);property["roomStayRatePlanId"]=json!(rate_id);
            property["nightlyCheckoutTime"]=json!(checkout);property["dayStayCutoffTime"]=json!(cutoff);
            property["updatedAt"]=json!(now());
            put(&tx,"property","property",property,&mut changes)?;
        }
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
                    let credit_balance=customer_credit::balance_minor(&tx,record_id)?;
                    let credit_active=get(&tx,"customerCreditAccounts",record_id).ok().is_some_and(|(_,a)|a["status"]!="CLOSED");
                    if credit_balance!=0 || credit_active { return Err("Settle and close the customer credit account before archiving".into()); }
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
                if collection == "tillPolicy" {
                    crate::printer::PrinterProfile::from_policy(&data)?;
                    for key in ["defaultOpeningFloat","varianceThreshold"] { if !data[key].is_null(){money(&data,key)?;} }
                }
                if collection == "property" {
                    if data["currency"].as_str().is_some_and(|v|v!="KES")||data["timezone"].as_str().is_some_and(|v|v!="Africa/Nairobi") {return Err("This installation uses KES and Africa/Nairobi".into());}
                    if data["receiptFooter"].as_str().is_some_and(|v|v.len()>300){return Err("Receipt thank-you message cannot exceed 300 characters".into());}
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
                    } else if installation_stage(&tx)?=="LIVE" {
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
                    if let Some(recipe)=data.get("recipeIngredients") {
                        let lines=recipe.as_array().filter(|items|items.len()<=100).ok_or("Recipe ingredients must be a list of at most 100 lines")?;
                        let mut linked_stocks:Vec<String>=Vec::new();
                        for line in lines {
                            let stock_id=text(line,"stockItemId")?.to_string();
                            if linked_stocks.contains(&stock_id){return Err("A stock item can appear only once in a recipe".into());}
                            let (_,stock)=get(&tx,"stockItems",&stock_id)?;
                            quantity(line,"quantity")?;
                            if stock.get("baseUnit").and_then(Value::as_str).map_or(true,|unit|unit.trim().is_empty()){return Err("Recipe ingredient must have a stock unit".into());}
                            linked_stocks.push(stock_id);
                        }
                    }
                    if data.get("productFamilyId").and_then(Value::as_str).is_some_and(|id| !id.trim().is_empty()) {
                        let family_id=text(&data,"productFamilyId")?;
                        text(&data,"productFamilyName")?;
                        text(&data,"packageType")?;
                        let variant_label=text(&data,"variantLabel")?;
                        text(&data,"containerUnit")?;
                        if quantity(&data,"containerQuantity")?<=0.0 || quantity(&data,"portionVolume")?<=0.0 {
                            return Err("Physical container and stock quantities must be greater than zero".into());
                        }
                        let portions=data["portions"].as_array().filter(|items|!items.is_empty()).ok_or("Add at least one sale format for this physical size")?;
                        for portion in portions {
                            text(portion,"id")?;
                            text(portion,"name")?;
                            if quantity(portion,"volume")?<=0.0 { return Err("Sale format stock quantity must be greater than zero".into()); }
                            money(portion,"price")?;
                        }
                        let duplicate_variant:bool=tx.query_row(
                            "SELECT EXISTS(SELECT 1 FROM records WHERE collection='products' AND id<>? AND archived=0 AND json_extract(data,'$.productFamilyId')=? AND lower(json_extract(data,'$.variantLabel'))=lower(?))",
                            params![record_id,family_id,variant_label],|r|r.get(0)
                        ).map_err(error)?;
                        if duplicate_variant { return Err("This product family already has that physical size".into()); }
                        if let Some(stock_id)=data.get("stockItemId").and_then(Value::as_str).map(str::trim).filter(|id|!id.is_empty()) {
                            get(&tx,"stockItems",stock_id)?;
                            let shared_stock:bool=tx.query_row(
                                "SELECT EXISTS(SELECT 1 FROM records WHERE collection='products' AND id<>? AND archived=0 AND json_extract(data,'$.productFamilyId')=? AND json_extract(data,'$.stockItemId')=?)",
                                params![record_id,family_id,stock_id],|r|r.get(0)
                            ).map_err(error)?;
                            if shared_stock { return Err("Each physical size in a product family needs its own stock item".into()); }
                        }
                    }
                    let inventory_type=data["inventoryType"].as_str().or_else(||data["category"].as_str()).unwrap_or("").to_ascii_uppercase();
                    if ["SPIRIT","SPIRITS","WINE"].contains(&inventory_type.as_str())&&data["portionVolume"].as_f64().is_some() {
                        if let Some(stock_id)=data.get("stockItemId").and_then(Value::as_str).map(str::trim).filter(|id|!id.is_empty()) {
                            let (_,mut stock)=get(&tx,"stockItems",stock_id)?;
                            let size=quantity(&data,"portionVolume")?;
                            if size<=0.0||stock["baseUnit"].as_str()!=Some("ml"){return Err("Spirit and wine sealed/open tracking requires a linked stock item measured in ml".into());}
                            if stock["sealedContainerSize"].as_f64().is_some_and(|existing|(existing-size).abs()>0.000001){return Err("The linked stock item already uses a different sealed container size".into());}
                            stock["sealedContainerSize"]=json!(size);
                            put(&tx,"stockItems",stock_id,stock,&mut changes)?;
                        }
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
                    if collection=="stockItems" {
                        let aliases=data.get("barcodeAliases").and_then(Value::as_array).cloned().unwrap_or_default();
                        if aliases.len()>100{return Err("At most 100 stock barcode aliases may be assigned".into());}
                        let normalized:Vec<String>=aliases.iter().map(|alias|alias.as_str().map(str::trim).filter(|value|!value.is_empty()&&value.len()<=128).map(str::to_lowercase).ok_or("Stock barcode aliases must be non-empty text up to 128 characters")).collect::<Result<Vec<_>>>()?;
                        let mut unique=std::collections::HashSet::new();
                        if normalized.iter().any(|value|!unique.insert(value.clone())){return Err("Duplicate stock barcode alias".into());}
                        let primary=barcode.unwrap_or_default().to_lowercase();let stock_code=data.get("code").and_then(Value::as_str).unwrap_or("").trim().to_lowercase();
                        let package_barcodes:Vec<String>=data.get("purchasePackages").and_then(Value::as_array).into_iter().flatten().filter_map(|package|package.get("barcode").and_then(Value::as_str).map(|value|value.trim().to_lowercase())).collect();
                        if normalized.iter().any(|alias|alias==&primary||alias==&stock_code||package_barcodes.contains(alias))||(!primary.is_empty()&&package_barcodes.contains(&primary)){return Err("Barcode alias duplicates this stock item's code, primary barcode or purchase package barcode".into());}
                        for other in list(&tx,"stockItems")? {if other["id"].as_str()==Some(record_id){continue;}let d=&other["data"];let mut existing=vec![d["barcode"].as_str().unwrap_or("").trim().to_lowercase(),d["code"].as_str().unwrap_or("").trim().to_lowercase()];existing.extend(d["barcodeAliases"].as_array().into_iter().flatten().filter_map(Value::as_str).map(|value|value.trim().to_lowercase()));existing.extend(d["purchasePackages"].as_array().into_iter().flatten().filter_map(|package|package["barcode"].as_str()).map(|value|value.trim().to_lowercase()));if normalized.iter().any(|alias|existing.contains(alias))||(!primary.is_empty()&&existing.contains(&primary)){return Err("This barcode already belongs to another stock item".into());}}
                        data["barcodeAliases"]=json!(aliases.iter().filter_map(Value::as_str).map(str::trim).collect::<Vec<_>>());
                    }
                }
                put(&tx, collection, record_id, data, &mut changes)?;
            }
        }
        "setup.completeStep" => {
            if !permissions(&user.role).contains(&"business.configure") { return Err("Owner permission required".into()); }
            let step=text(p,"step")?;
            let allowed=["BUSINESS_IDENTITY","TAX","PAYMENTS","SERVICE_AREAS","STOCK_LOCATIONS","CATALOG","ROOM_STAYS","RECIPES_PORTIONS","OPENING_INVENTORY","FLOORPLAN","STAFF_ACCESS","TILL","BACKUP_SYNC"];
            if !allowed.contains(&step) { return Err("Unknown setup step".into()); }
            match step {
                "BUSINESS_IDENTITY" => { let (_,property)=get(&tx,"property","property")?; text(&property,"name")?; },
                "TAX" => { let (_,property)=get(&tx,"property","property")?; if property["taxConfigured"]!=true { return Err("Configure tax rates before completing this step".into()); } },
                "PAYMENTS" => { let (_,cfg)=get(&tx,"paymentConfig","main")?; let methods=cfg["methods"].as_array().ok_or("Choose at least one payment method")?; if methods.is_empty(){return Err("Choose at least one payment method".into());} },
                "SERVICE_AREAS" => { if list(&tx,"outlets")?.is_empty(){return Err("Create at least one service area".into());} },
                "STOCK_LOCATIONS" => { if list(&tx,"stockLocations")?.is_empty(){return Err("Create at least one stock location".into());} },
                "CATALOG" => { if list(&tx,"products")?.is_empty(){return Err("Create at least one sellable product".into());} },
                "ROOM_STAYS" => {
                    let (_,property)=get(&tx,"property","property")?;
                    let room_type=property["roomStayRoomTypeId"].as_str().filter(|value|!value.trim().is_empty()).ok_or("Configure a room stay room type before completing this step")?;
                    let rate_id=property["roomStayRatePlanId"].as_str().filter(|value|!value.trim().is_empty()).ok_or("Configure the room stay rate before completing this step")?;
                    get(&tx,"roomTypes",room_type)?;
                    let (_,rate)=get(&tx,"ratePlans",rate_id)?;
                    if rate["roomTypeId"].as_str()!=Some(room_type)||rate["mode"].as_str()!=Some("NIGHTLY"){return Err("Configure one NIGHTLY room stay rate matching the room type".into());}
                },
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
            let required=["BUSINESS_IDENTITY","TAX","PAYMENTS","SERVICE_AREAS","STOCK_LOCATIONS","CATALOG","ROOM_STAYS","OPENING_INVENTORY","STAFF_ACCESS","TILL","BACKUP_SYNC"];
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
            let room_type=property["roomStayRoomTypeId"].as_str().filter(|value|!value.trim().is_empty()).ok_or("Configure the room stay room type before Go Live")?;
            let rate_id=property["roomStayRatePlanId"].as_str().filter(|value|!value.trim().is_empty()).ok_or("Configure the room stay rate before Go Live")?;
            get(&tx,"roomTypes",room_type)?;
            let (_,rate)=get(&tx,"ratePlans",rate_id)?;
            if rate["roomTypeId"].as_str()!=Some(room_type)||rate["mode"].as_str()!=Some("NIGHTLY"){return Err("Configure one NIGHTLY room stay rate matching the room type".into());}
            if meta(&tx,"last_backup")?.is_none(){return Err("Create and verify a local backup before Go Live".into());}
            get(&tx,"paymentConfig","main")?;
            get(&tx,"tillPolicy","main")?;
            let admins:i64=tx.query_row("SELECT count(*) FROM staff WHERE active=1 AND role='Admin'",[],|r|r.get(0)).map_err(error)?;
            if admins<1{return Err("No active Admin configured".into());}
            let (_,mut progress)=get(&tx,"businessSetup","business")?;
            let done=progress["completedSteps"].as_array().cloned().unwrap_or_default();
            let required=["BUSINESS_IDENTITY","TAX","PAYMENTS","SERVICE_AREAS","STOCK_LOCATIONS","CATALOG","ROOM_STAYS","OPENING_INVENTORY","STAFF_ACCESS","TILL","BACKUP_SYNC"];
            let missing:Vec<&str>=required.iter().copied().filter(|s|!done.iter().any(|v|v==*s)).collect();
            if !missing.is_empty(){return Err(format!("Complete required setup steps: {}",missing.join(", ")));}
            progress["completedAt"]=json!(now()); progress["goLiveApprovedAt"]=json!(now()); progress["goLiveApprovedBy"]=json!(user.staff_id); progress["updatedAt"]=json!(now());
            put(&tx,"businessSetup","business",progress,&mut changes)?;
            set_meta(&tx,"installation_stage","LIVE")?;
        }
        "purchaseOrder.create" => { procurement_create(&tx,user,p,&mut changes)?; }
        "purchaseOrder.receive" => { procurement_receive(&tx,user,&cmd,&mut changes)?; }
        "procurement.receiveDelivery" => {
            if !permissions(&user.role).contains(&"procurement.manage") || !permissions(&user.role).contains(&"procurement.receive") {
                return Err("Purchasing and receiving permissions are both required for a delivery without a purchase order".into());
            }
            let reference=text(p,"supplierInvoiceNumber")?.trim();
            if reference.len()>120 { return Err("Delivery reference cannot exceed 120 characters".into()); }
            let lines=p["lines"].as_array().filter(|lines|!lines.is_empty() && lines.len()<=100).ok_or("Delivery requires between 1 and 100 items")?;
            let mut items=Vec::new(); let mut received=Vec::new();
            for line in lines {
                let stock_id=text(line,"stockItemId")?;
                let delivered=quantity(line,"quantityDelivered")?;
                let rejected=quantity(line,"quantityRejected")?;
                if delivered<=0.0 || rejected>delivered { return Err("Delivered quantity must be positive and cover rejected quantity".into()); }
                let line_id=id();
                items.push(json!({"lineId":line_id,"stockItemId":stock_id,"quantityOrdered":delivered,"unitPrice":quantity(line,"unitPrice")?}));
                received.push(json!({"lineId":line_id,"stockItemId":stock_id,"quantityDelivered":delivered,"quantityAccepted":((delivered-rejected)*1_000_000.0).round()/1_000_000.0,"quantityRejected":rejected,"rejectionReason":line.get("rejectionReason")}));
            }
            let order_id=procurement_create(&tx,user,&json!({"supplierId":text(p,"supplierId")?,"items":items}),&mut changes)?;
            let order_version=get(&tx,"purchaseOrders",&order_id)?.0;
            let receipt=BusinessCommand { id:cmd.id.clone(),schema_version:cmd.schema_version,operation:"purchaseOrder.receive".into(),target_version:Some(order_version),payload:json!({"purchaseOrderId":order_id,"locationId":text(p,"locationId")?,"supplierInvoiceNumber":reference,"deliveryNote":p.get("deliveryNote"),"lines":received}) };
            procurement_receive(&tx,user,&receipt,&mut changes)?;
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
                let billed_line_id=billed.get("lineId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty());
                let billed_stock=billed.get("stockItemId").and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty());
                let expected=expected_lines.iter().find(|line|{
                    line["quantityAccepted"].as_f64().unwrap_or(0.0)>0.0 &&
                    (billed_line_id.is_some_and(|id|line["lineId"].as_str()==Some(id))
                      || (billed_line_id.is_none()&&billed_stock.is_some_and(|id|line["stockItemId"].as_str()==Some(id))))
                }).ok_or("Invoice line is not an accepted line on this GRN")?;
                let key=expected.get("lineId").and_then(Value::as_str).or_else(||expected["stockItemId"].as_str()).ok_or("GRN line identity is missing")?.to_string();
                if seen.iter().any(|id|id==&key) { return Err("A GRN line can appear only once on an invoice match".into()); }
                seen.push(key);
                let label=expected["displayName"].as_str().or_else(||expected["stockItemName"].as_str()).unwrap_or("item");
                let quantity_billed=quantity(billed,"quantityBilled")?;
                let expected_quantity=expected["quantityAccepted"].as_f64().unwrap_or(0.0);
                if (quantity_billed-expected_quantity).abs()>0.000001 { return Err(format!("Invoice quantity for {label} does not match accepted GRN quantity {expected_quantity}")); }
                let invoice_unit_price=quantity(billed,"unitPrice")?;
                let agreed_unit_price=expected["unitCost"].as_f64().unwrap_or(0.0);
                if (invoice_unit_price-agreed_unit_price).abs()>0.000001 { return Err(format!("Invoice unit cost for {label} does not match the approved PO cost")); }
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
        "inventory.countLocation" => {
            authorize(&tx,user,"inventory.count",p,None)?;
            let location_id=text(p,"locationId")?;
            let location=get(&tx,"stockLocations",location_id)?.1;
            let rows=p["rows"].as_array().filter(|rows|!rows.is_empty()&&rows.len()<=5000).ok_or("Count must include between 1 and 5000 stock items")?;
            let draft = if let Some(session_id)=p["draftSessionId"].as_str() {
                let encoded:String=tx.query_row("SELECT payload FROM inventory_count_drafts WHERE staff_id=? AND location_id=?",params![user.staff_id,location_id],|r|r.get(0)).map_err(|_|"Count session is missing; reload before confirming".to_string())?;
                let saved:Value=serde_json::from_str(&encoded).map_err(error)?;
                if saved["sessionId"]!=session_id || saved["revision"]!=p["draftRevision"] { return Err("CONFLICT: count session changed before confirmation".into()); }
                if saved["pendingCommand"]["id"]!=cmd.id || saved["pendingCommand"]["payload"]!=*p { return Err("Confirm the exact reviewed count command".into()); }
                if !saved["unknownScans"].as_array().is_some_and(|entries|entries.is_empty()) { return Err("Resolve unknown scans before confirming".into()); }
                Some(saved)
            } else { None };
            let active_stock_ids:Vec<String>=list(&tx,"stockItems")?.iter().filter_map(|record|record["id"].as_str().map(str::to_string)).collect();
            if rows.len()!=active_stock_ids.len() { return Err("Count must include every active stock item".into()); }
            let reason=p.get("reason").and_then(Value::as_str).map(str::trim).filter(|reason|!reason.is_empty()).unwrap_or("Location stock count");
            if reason.len()>500 { return Err("Count note cannot exceed 500 characters".into()); }
            let mut seen=Vec::<String>::new();
            let mut counted=Vec::<(String,Value,f64,f64)>::with_capacity(rows.len());
            for row in rows {
                let stock_id=text(row,"stockItemId")?.to_string();
                if seen.contains(&stock_id) { return Err("A stock item can appear only once in a location count".into()); }
                seen.push(stock_id.clone());
                if !active_stock_ids.contains(&stock_id) { return Err("Count includes a stock item that is not active".into()); }
                let expected=quantity(row,"expectedQuantity")?;
                let actual=quantity(row,"countedQuantity")?;
                let (_,stock)=get(&tx,"stockItems",&stock_id)?;
                if let Some(saved)=&draft {
                    let baseline=&saved["baseline"][&stock_id];
                    if baseline["expectedQuantity"].as_f64()!=row["expectedQuantity"].as_f64() || saved["counts"][&stock_id].as_f64()!=row["countedQuantity"].as_f64() { return Err("Count quantities differ from the reviewed draft".into()); }
                    if baseline["name"]!=stock["name"] || baseline["baseUnit"]!=stock["baseUnit"] || baseline["scanUnitQuantity"].as_f64()!=Some(stock["scanUnitQuantity"].as_f64().filter(|q|*q>0.0).unwrap_or(1.0)) {
                        return Err("CONFLICT: stock catalog changed; recount the affected items".into());
                    }
                }
                let current=stock["currentStock"][location_id].as_f64().unwrap_or(0.0);
                if (current-expected).abs()>0.000001 { return Err(format!("CONFLICT: {} changed while this count was open; review the location again",stock["name"].as_str().unwrap_or("Stock item"))); }
                counted.push((stock_id,stock,expected,actual));
            }
            if seen.len()!=active_stock_ids.len() { return Err("Count must include every active stock item".into()); }
            let count_id=id();
            let mut matches=0usize; let mut short=0usize; let mut over=0usize;
            let mut count_rows=Vec::with_capacity(counted.len());
            for (stock_id,stock,expected,actual) in &counted {
                let variance=((actual-expected)*1_000_000.0).round()/1_000_000.0;
                if variance==0.0 { matches+=1; } else if variance<0.0 { short+=1; } else { over+=1; }
                count_rows.push(json!({"stockItemId":stock_id,"stockItemName":stock["name"],"baseUnit":stock["baseUnit"],"expectedQuantity":expected,"countedQuantity":actual,"variance":variance}));
            }
            put(&tx,"stockCounts",&count_id,json!({"id":count_id,"locationId":location_id,"locationName":location["name"],"rows":count_rows,"itemCount":counted.len(),"matches":matches,"short":short,"over":over,"reason":reason,"status":"COMMITTED","createdAt":now(),"createdBy":user.staff_id,"createdByName":user.name}),&mut changes)?;
            for (stock_id,_,expected,actual) in counted {
                let variance=((actual-expected)*1_000_000.0).round()/1_000_000.0;
                if variance!=0.0 { stock_delta(&tx,user,&stock_id,location_id,variance,"COUNT_ADJUSTMENT",&cmd.id,reason,&mut changes)?; }
            }
            if let Some(saved)=draft {
                tx.execute("INSERT INTO inventory_count_closed_sessions(staff_id,session_id,closed_at) VALUES(?,?,?)",params![user.staff_id,text(&saved,"sessionId")?,now()]).map_err(error)?;
                tx.execute("DELETE FROM inventory_count_drafts WHERE staff_id=? AND location_id=?",params![user.staff_id,location_id]).map_err(error)?;
            }
        }
        "inventory.openingBalance" | "inventory.receive" | "inventory.adjust" | "inventory.waste" | "inventory.transfer" => {
            let permission=match cmd.operation.as_str(){"inventory.receive"=>"inventory.receive","inventory.transfer"=>"inventory.transfer","inventory.waste"=>"inventory.waste","inventory.adjust"=>"inventory.adjust",_=>"inventory.adjust"};
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
                let reason=text(p,"reason")?;
                if p.get("sealedContainers").is_some()||p.get("openQuantity").is_some() {
                    let sealed=quantity(p,"sealedContainers")?;let open=quantity(p,"openQuantity")?;
                    let (_,stock)=get(&tx,"stockItems",stock_id)?;let size=stock["sealedContainerSize"].as_f64().ok_or("Configure a sealed container size before entering sealed/open correction")?;
                    if (sealed.round()-sealed).abs()>0.000001||open>=size{return Err("Sealed containers must be whole and open quantity must be less than one container".into());}
                    let counted=sealed*size+open;
                    if p.get("countedQty").and_then(Value::as_f64).is_some_and(|value|(value-counted).abs()>0.001){return Err("Corrected total does not match sealed containers plus open quantity".into());}
                    stock_delta_sealed_correction(&tx,&user,stock_id,location,sealed,open,&cmd.id,reason,&mut changes)?;
                } else {
                    let counted=quantity(p,"countedQty")?;
                    stock_delta(&tx,user,stock_id,location,counted-current,"ADMIN_CORRECTION",&cmd.id,reason,&mut changes)?;
                }
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
            let role=text(p,"role")?; if !STAFF_ROLES.contains(&role){return Err("Invalid role".into());}
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
            let staff_id=text(p,"staffId")?; let role=text(p,"role")?; if !STAFF_ROLES.contains(&role){return Err("Invalid role".into());}
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
                        if consumed>0.0{if ingredient["wholeContainerSale"]==true{stock_delta_whole_container(&tx,user,stock_id,&location,-consumed,"SALE_CONSUMPTION",order_id,"Whole-container sale",&mut changes)?;}else{stock_delta(&tx,user,stock_id,&location,-consumed,"SALE_CONSUMPTION",order_id,"Order fired",&mut changes)?;}}
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
            let till_id=text(p,"tillId")?; authorize(&tx,user,"till.cashMovement",p,Some(till_id))?; let (_,mut till)=get(&tx,"tillSessions",till_id)?; if till["status"]!="OPEN"{return Err("Till is not open".into());}
            let kind=text(p,"type")?; if !["IN","OUT"].contains(&kind){return Err("Cash movement type must be IN or OUT".into());} let amount=money(p,"amount")?; if amount<=0{return Err("Cash movement must be positive".into());} let reason=text(p,"reason")?;
            let expected=money(&till,"expectedCashInDrawer")?; if kind=="OUT"&&amount>expected{return Err("Paid out amount exceeds expected cash in drawer".into());}
            if kind=="IN"{till["cashPaidIn"]=json!((money(&till,"cashPaidIn")?+amount) as f64/100.0);till["expectedCashInDrawer"]=json!((expected+amount) as f64/100.0);}else{till["cashPaidOut"]=json!((money(&till,"cashPaidOut")?+amount) as f64/100.0);till["expectedCashInDrawer"]=json!((expected-amount) as f64/100.0);}
            put(&tx,"tillSessions",till_id,till,&mut changes)?; let movement_id=id(); put(&tx,"cashMovements",&movement_id,json!({"id":movement_id,"tillSessionId":till_id,"type":kind,"amount":amount as f64/100.0,"reason":reason,"actorId":user.staff_id,"occurredAt":now()}),&mut changes)?;
            let journal_id=id(); let (debit,credit)=if kind=="IN"{("CASH","CASH_ADJUSTMENT")}else{("CASH_ADJUSTMENT","CASH")}; put(&tx,"journalEntries",&journal_id,json!({"id":journal_id,"entryNumber":format!("JE-{}",&journal_id[..8]),"propertyId":"property","occurredAt":now(),"postedAt":now(),"sourceType":"CASH_MOVEMENT","sourceId":movement_id,"memo":reason,"lines":[{"id":id(),"accountId":debit,"accountCode":debit,"accountName":debit,"debit":amount as f64/100.0,"credit":0,"debitMinor":amount,"creditMinor":0},{"id":id(),"accountId":credit,"accountCode":credit,"accountName":credit,"debit":0,"credit":amount as f64/100.0,"debitMinor":0,"creditMinor":amount}],"totalDebit":amount as f64/100.0,"totalCredit":amount as f64/100.0,"balanced":true}),&mut changes)?;
        }
        "till.close" => {
            let till_id=text(p,"tillId")?; let (_,mut till)=get(&tx,"tillSessions",till_id)?; if till["status"]!="OPEN"{return Err("Till is already closed".into());}
            let open_orders=list(&tx,"orders")?.into_iter().filter(|r|!["COMPLETED","VOIDED"].contains(&r["data"]["state"].as_str().unwrap_or(""))).count(); if open_orders>0{return Err(format!("Resolve {open_orders} open tab(s) before closing the till"));}
            let counted=money(p,"countedCash")?; let expected=money(&till,"expectedCashInDrawer")?;let variance=counted-expected;
            if variance!=0 {
                let reason=text(p,"reason")?;
                let threshold=get(&tx,"tillPolicy","main").ok().map(|(_,policy)|money(&policy,"varianceThreshold").unwrap_or(0)).unwrap_or(0);
                if variance.abs()>threshold {authorize(&tx,user,"till.override_variance",p,Some(till_id))?;}
                till["varianceReason"]=json!(reason);
            }
            till["countedCashAtClose"]=json!(counted as f64/100.0);till["cashVariance"]=json!(variance as f64/100.0);till["closedAt"]=json!(now());till["status"]=json!("CLOSED");till["reason"]=json!(p.get("reason").and_then(Value::as_str).unwrap_or(""));till["closedBy"]=json!(user.staff_id);put(&tx,"tillSessions",till_id,till,&mut changes)?;
        }
        "closeDay.generate" => {
            if !permissions(&user.role).contains(&"reports.view"){return Err("Reports permission required".into());}
            let till_id=text(p,"tillId")?; let (_,till)=get(&tx,"tillSessions",till_id)?; if till["status"]!="CLOSED"{return Err("Close the till before generating the close-day report".into());}
            if list(&tx,"closeDayReports")?.iter().any(|record|record["data"]["tillSessionId"].as_str()==Some(till_id)){return Err("A close-day report already exists for this till. Historical close reports are immutable in this release".into());}
            let opened=text(&till,"openedAt")?.to_string(); let closed=text(&till,"closedAt")?.to_string();
            let payments:Vec<Value>=list(&tx,"payments")?.into_iter().map(|r|r["data"].clone()).filter(|v|v["tillSessionId"]==till_id).collect();
            let mut cash=0i64;let mut mpesa=0i64;let mut card=0i64;let mut order_ids=std::collections::HashSet::new();
            for pay in &payments{let amount=money(pay,"amount")?;match pay["tenderType"].as_str().unwrap_or(""){"CASH"=>cash+=amount,"MPESA"=>mpesa+=amount,"CARD"=>card+=amount,_=>{}} if let Some(x)=pay["orderId"].as_str(){order_ids.insert(x.to_string());}}
            let credit_entries:Vec<Value>=list(&tx,"customerCreditEntries")?.into_iter().map(|r|r["data"].clone()).filter(|e|e["occurredAt"].as_str().is_some_and(|t|t>=opened.as_str()&&t<=closed.as_str())).collect();
            let credit_sales=credit_entries.iter().filter(|e|e["kind"]=="CHARGE").map(|e|e["amountMinor"].as_i64().unwrap_or(0)).sum::<i64>();
            let credit_collections=credit_entries.iter().filter(|e|e["kind"]=="SETTLEMENT").map(|e|e["amountMinor"].as_i64().unwrap_or(0)).sum::<i64>();
            let credit_writeoffs=credit_entries.iter().filter(|e|e["kind"]=="WRITE_OFF").map(|e|e["amountMinor"].as_i64().unwrap_or(0)).sum::<i64>();
            for entry in credit_entries.iter().filter(|e|e["kind"]=="CHARGE"){if let Some(order_id)=entry["orderId"].as_str(){order_ids.insert(order_id.to_string());}}
            let ar_outstanding=list(&tx,"customerCreditEntries")?.into_iter().map(|r|r["data"]["balanceDeltaMinor"].as_i64().unwrap_or(0)).sum::<i64>();
            let orders:Vec<Value>=list(&tx,"orders")?.into_iter().map(|r|r["data"].clone()).filter(|o|order_ids.contains(o["id"].as_str().unwrap_or(""))).collect();
            let pos_gross=orders.iter().map(|o|money(o,"grandTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>(); let tax=orders.iter().map(|o|money(o,"taxTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>(); let levy=orders.iter().map(|o|money(o,"cateringLevyTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>(); let discounts=orders.iter().map(|o|money(o,"discountTotal")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>();
            let hotel_entries:Vec<Value>=list(&tx,"folioEntries")?.into_iter().map(|r|r["data"].clone()).filter(|e|["CHARGE","REVERSAL"].contains(&e["kind"].as_str().unwrap_or(""))&&e["sourceType"].as_str()!=Some("POS")&&e["postedAt"].as_str().is_some_and(|t|t>=opened.as_str()&&t<=closed.as_str())).collect();
            let hotel_gross=hotel_entries.iter().map(|e|e["balanceDeltaMinor"].as_i64().unwrap_or(0)).sum::<i64>();let hotel_tax=hotel_entries.iter().map(|e|e["taxMinor"].as_i64().unwrap_or(0)).sum::<i64>();let gross=pos_gross+hotel_gross;
            let comp_value=orders.iter().flat_map(|o|o["items"].as_array().cloned().unwrap_or_default()).filter(|i|i["comped"]==true).map(|i|i["discountMinor"].as_i64().unwrap_or(0)).sum::<i64>();
            let movements:Vec<Value>=list(&tx,"stockMovements")?.into_iter().map(|r|r["data"].clone()).filter(|m|m["occurredAt"].as_str().is_some_and(|t|t>=opened.as_str()&&t<=closed.as_str())).collect();
            let cogs=movements.iter().filter(|m|m["movementType"]=="SALE_CONSUMPTION").map(|m|(m["totalCostValuation"].as_f64().unwrap_or(0.0)*100.0).round().abs() as i64).sum::<i64>(); let waste=movements.iter().filter(|m|m["movementType"]=="WASTE").map(|m|(m["totalCostValuation"].as_f64().unwrap_or(0.0)*100.0).round().abs() as i64).sum::<i64>();
            let refunds:Vec<Value>=list(&tx,"refunds")?.into_iter().map(|r|r["data"].clone()).filter(|r|r["kind"].as_str()!=Some("DEPOSIT_REFUND")&&r["refundedAt"].as_str().is_some_and(|t|t>=opened.as_str()&&t<=closed.as_str())).collect(); let refund_total=refunds.iter().map(|r|money(r,"amount")).collect::<Result<Vec<_>>>()?.iter().sum::<i64>();
            let pending_mpesa=payments.iter().filter_map(|p|p["mpesaReceiptId"].as_str()).filter(|id|get(&tx,"mpesaReceipts",id).ok().is_some_and(|(_,r)|r["reconciliationStatus"]!="RECONCILED")).count();
            let mut product_counts=std::collections::HashMap::<String,f64>::new(); let mut staff_sales=std::collections::HashMap::<String,i64>::new();
            for order in &orders{let name=order["serverName"].as_str().unwrap_or("Unknown").to_string();*staff_sales.entry(name).or_insert(0)+=money(order,"grandTotal")?;for item in order["items"].as_array().cloned().unwrap_or_default(){*product_counts.entry(item["productName"].as_str().unwrap_or("Unknown").to_string()).or_insert(0.0)+=item["quantity"].as_f64().unwrap_or(0.0);}}
            let mut top_products:Vec<Value>=product_counts.into_iter().map(|(name,quantity)|json!({"name":name,"quantity":quantity})).collect();top_products.sort_by(|a,b|b["quantity"].as_f64().partial_cmp(&a["quantity"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));top_products.truncate(10);
            let staff:Vec<Value>=staff_sales.into_iter().map(|(name,amount)|json!({"name":name,"sales":amount as f64/100.0})).collect(); let pending:i64=tx.query_row("SELECT count(*) FROM outbox WHERE acknowledged_at IS NULL",[],|r|r.get(0)).map_err(error)?;
            let report_id=id();put(&tx,"closeDayReports",&report_id,json!({"id":report_id,"tillSessionId":till_id,"openedAt":opened,"closedAt":closed,"generatedAt":now(),"generatedBy":user.staff_id,"sales":{"gross":gross as f64/100.0,"net":(gross-tax-levy-hotel_tax-refund_total) as f64/100.0,"vat":tax as f64/100.0,"levy":levy as f64/100.0,"hotelTax":hotel_tax as f64/100.0,"hotelGross":hotel_gross as f64/100.0,"refunds":refund_total as f64/100.0},"tenders":{"cash":cash as f64/100.0,"mpesa":mpesa as f64/100.0,"card":card as f64/100.0,"credit":credit_sales as f64/100.0},"receivables":{"creditSales":credit_sales as f64/100.0,"collections":credit_collections as f64/100.0,"writeOffs":credit_writeoffs as f64/100.0,"outstanding":ar_outstanding as f64/100.0},"cash":{"openingFloat":till["openingFloat"],"paidIn":till["cashPaidIn"],"paidOut":till["cashPaidOut"],"expected":till["expectedCashInDrawer"],"actual":till["countedCashAtClose"],"variance":till["cashVariance"]},"adjustments":{"discounts":discounts as f64/100.0,"comps":comp_value as f64/100.0,"refunds":refund_total as f64/100.0},"inventory":{"cogs":cogs as f64/100.0,"waste":waste as f64/100.0},"margin":{"grossProfit":(gross-refund_total-cogs) as f64/100.0},"mpesa":{"pendingReconciliation":pending_mpesa},"topProducts":top_products,"staffSales":staff,"system":{"pendingSync":pending,"lastSync":meta(&tx,"last_sync")?,"lastBackup":meta(&tx,"last_backup")?}}),&mut changes)?;
        }
        _ => {
            return Err(format!(
                "Workflow not implemented in the native backend: {}",
                cmd.operation
            ))
        }
    }
    if ["payment.record", "payment.split"].contains(&cmd.operation.as_str()) {
        receipts::capture(&tx, user, text(p, "orderId")?, &cmd.id, &mut changes)?;
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
        json!({"id":payment_id,"orderId":order_id,"propertyId":"property","tillSessionId":active["id"],"tenderType":method,"amount":amount as f64/100.0,"amountMinor":amount,"currency":"KES","status":"PAID","referenceNumber":reference,"mpesaReceiptId":receipt_id,"occurredAt":stamp,"cashierId":user.staff_id,"cashierName":user.name,"confirmation":"MANUAL",
            "cashTenderedMinor":if method=="CASH"{Some(money(p,"cashTendered")?)}else{None},
            "changeMinor":if method=="CASH"{Some(money(p,"cashTendered")?-amount)}else{None}}),
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
    stock_delta_with_cost_and_container(tx,user,stock_id,location,delta,kind,source,reason,None,false,changes)
}
fn stock_delta_whole_container(tx:&Transaction,user:&Session,stock_id:&str,location:&str,delta:f64,kind:&str,source:&str,reason:&str,changes:&mut Vec<Value>)->Result<()> {
    stock_delta_with_cost_and_container(tx,user,stock_id,location,delta,kind,source,reason,None,true,changes)
}
fn stock_delta_sealed_correction(tx:&Transaction,user:&Session,stock_id:&str,location:&str,sealed:f64,open:f64,source:&str,reason:&str,changes:&mut Vec<Value>)->Result<()> {
    let (_,mut stock)=get(tx,"stockItems",stock_id)?;let (_,location_record)=get(tx,"stockLocations",location)?;
    let size=stock["sealedContainerSize"].as_f64().filter(|value|value.is_finite()&&*value>0.0&&*value<=100_000.0).ok_or("Sealed/open correction requires a configured container size")?;
    if stock["baseUnit"].as_str()!=Some("ml")||(sealed.round()-sealed).abs()>0.000001||sealed<0.0||open<0.0||open>=size{return Err("Invalid sealed/open stock correction".into());}
    let current=stock["currentStock"][location].as_f64().unwrap_or(0.0);let target=sealed*size+open;let delta=((target-current)*1_000_000.0).round()/1_000_000.0;
    let saved=&stock["sealedOpenStock"][location];let before_sealed=saved["sealedContainers"].as_f64().unwrap_or_else(||(current/size).floor());let before_open=saved["openQuantity"].as_f64().unwrap_or_else(||current-before_sealed*size);
    if ((before_sealed*size+before_open)-current).abs()>0.001{return Err("Existing sealed/open balance does not reconcile; reconcile it before correction".into());}
    if !stock["sealedOpenStock"].is_object(){stock["sealedOpenStock"]=json!({});}
    stock["sealedOpenStock"][location]=json!({"sealedContainers":sealed,"openQuantity":open,"containerSize":size});stock["currentStock"][location]=json!(target);
    let movement_id=id();let cost=stock["averageUnitCost"].as_f64().unwrap_or(0.0);
    put(tx,"stockMovements",&movement_id,json!({"id":movement_id,"organizationId":"business","propertyId":"property","stockItemId":stock_id,"stockItemName":stock["name"],"locationId":location,"locationName":location_record["name"],"quantityDelta":delta,"baseUnit":stock["baseUnit"],"movementType":"ADMIN_CORRECTION","sourceId":source,"reasonCode":reason,"occurredAt":now(),"actorUserId":user.staff_id,"actorName":user.name,"unitCostSnapshot":cost,"totalCostValuation":((delta*cost*100.0).round())/100.0,"sealedOpenEffect":{"containerSize":size,"sealedContainersBefore":before_sealed,"sealedContainersAfter":sealed,"openQuantityBefore":before_open,"openQuantityAfter":open}}),changes)?;
    put(tx,"stockItems",stock_id,stock,changes)
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
    stock_delta_with_cost_and_container(tx,user,stock_id,location,delta,kind,source,reason,unit_cost_override,false,changes)
}
fn stock_delta_with_cost_and_container(
    tx:&Transaction,user:&Session,stock_id:&str,location:&str,delta:f64,kind:&str,source:&str,reason:&str,
    unit_cost_override:Option<f64>,whole_container_sale:bool,changes:&mut Vec<Value>
) -> Result<()> {
    let (_, mut stock) = get(tx, "stockItems", stock_id)?;
    let (_, location_record) = get(tx, "stockLocations", location)?;
    let current = stock["currentStock"][location].as_f64().unwrap_or(0.0);
    let next = ((current + delta) * 1_000_000.0).round() / 1_000_000.0;
    if next < 0.0 {
        return Err("Insufficient stock; no movement was recorded".into());
    }
    let mut sealed_effect=None;
    let sealed_size=stock["sealedContainerSize"].as_f64().filter(|value|value.is_finite()&&*value>0.0&&*value<=100_000.0);
    if whole_container_sale&&(stock["baseUnit"].as_str()!=Some("ml")||sealed_size.is_none()){return Err("Whole-bottle sales require a configured sealed-container stock size".into());}
    if stock["baseUnit"].as_str()==Some("ml") {
        if let Some(size)=sealed_size {
            let saved=&stock["sealedOpenStock"][location];
            let mut sealed=saved["sealedContainers"].as_f64().unwrap_or_else(||(current/size).floor());
            let mut open=saved["openQuantity"].as_f64().unwrap_or_else(||current-sealed*size);
            let before_sealed=sealed;let before_open=open;
            let reconstructed=sealed*size+open;
            if sealed<0.0||open<0.0||open>=size+0.000001||(reconstructed-current).abs()>0.001{return Err("Sealed/open stock record is inconsistent with the canonical quantity; reconcile inventory before movement".into());}
            if delta>0.0 {
                let added_sealed=(delta/size).floor();
                sealed+=added_sealed;open+=delta-added_sealed*size;
                if open>=size-0.000001{let extra=(open/size).floor();sealed+=extra;open-=extra*size;}
            } else if delta<0.0 {
                let needed=-delta;
                if whole_container_sale {
                    let containers=(needed/size).round();
                    if (needed-containers*size).abs()>0.001||containers<1.0{return Err("Whole-container sale quantity does not match the configured bottle size".into());}
                    if sealed+0.000001<containers{return Err("No sealed bottle available; open liquid cannot satisfy a whole-bottle sale".into());}
                    sealed-=containers;
                } else {
                    if open+0.000001<needed {
                        let additional=( ((needed-open).max(0.0)/size)-0.000001 ).ceil();
                        if sealed+0.000001<additional{return Err("Insufficient sealed and open stock for this serving".into());}
                        sealed-=additional;open+=additional*size;
                    }
                    open-=needed;
                }
            }
            if open.abs()<0.000001{open=0.0;}
            if open<0.0||open>=size+0.000001||((sealed*size+open)-next).abs()>0.001{return Err("Sealed/open bottle quantities do not reconcile to stock balance".into());}
            if !stock["sealedOpenStock"].is_object(){stock["sealedOpenStock"]=json!({});}
            stock["sealedOpenStock"][location]=json!({"sealedContainers":sealed,"openQuantity":open,"containerSize":size});
            sealed_effect=Some(json!({"containerSize":size,"sealedContainersBefore":before_sealed,"sealedContainersAfter":sealed,"openQuantityBefore":before_open,"openQuantityAfter":open}));
        }
    }
    stock["currentStock"][location] = json!(next);
    let movement = id();
    let cost = unit_cost_override.unwrap_or_else(||stock["averageUnitCost"].as_f64().unwrap_or(0.0));
    let mut movement_data=json!({"id":movement,"organizationId":"business","propertyId":"property","stockItemId":stock_id,"stockItemName":stock["name"],"locationId":location,"locationName":location_record["name"],"quantityDelta":delta,"baseUnit":stock["baseUnit"],"movementType":kind,"sourceId":source,"reasonCode":reason,"occurredAt":now(),"actorUserId":user.staff_id,"actorName":user.name,"unitCostSnapshot":cost,"totalCostValuation":((delta*cost*100.0).round())/100.0});
    if let Some(effect)=sealed_effect{movement_data["sealedOpenEffect"]=effect;}
    put(
        tx,
        "stockMovements",
        &movement,
        movement_data,
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
pub fn production_health_audit(db: &Connection, token: &str) -> Result<Value> {
    let user = actor(db, token, false)?;
    if !permissions(&user.role).contains(&"audit.view") {
        return Err("Audit permission required".into());
    }

    let schema_version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(error)?;
    let quick_check: String = db.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(error)?;
    let stage = installation_stage(db)?;
    let terminal_id = meta(db, "terminal_id")?;
    let last_sync = meta(db, "last_sync")?;
    let last_backup = meta(db, "last_backup")?;
    let cloud_configured = meta(db, "cloud_url")?.is_some();
    let project_hostname=meta(db,"cloud_url")?.and_then(|url|url.strip_prefix("https://").map(str::to_string)).and_then(|url|url.split('/').next().map(str::to_string)).filter(|host|host.chars().all(|c|c.is_ascii_alphanumeric()||c=='.'||c=='-'));

    let staff_total: i64 = db.query_row("SELECT COUNT(*) FROM staff", [], |r| r.get(0)).map_err(error)?;
    let staff_active: i64 = db.query_row("SELECT COUNT(*) FROM staff WHERE active=1", [], |r| r.get(0)).map_err(error)?;
    let (record_total, record_active, record_archived): (i64, i64, i64) = db.query_row(
        "SELECT COUNT(*),COALESCE(SUM(CASE WHEN archived=0 THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN archived<>0 THEN 1 ELSE 0 END),0) FROM records",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).map_err(error)?;
    let commands: i64 = db.query_row("SELECT COUNT(*) FROM commands", [], |r| r.get(0)).map_err(error)?;
    let (audit_entries, first_audit, last_audit): (i64, Option<i64>, Option<i64>) = db.query_row(
        "SELECT COUNT(*),MIN(sequence),MAX(sequence) FROM audit", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))
    ).map_err(error)?;
    let (outbox_total, outbox_pending, outbox_acknowledged, last_outbox): (i64, i64, i64, i64) = db.query_row(
        "SELECT COUNT(*),COALESCE(SUM(CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN acknowledged_at IS NOT NULL THEN 1 ELSE 0 END),0),COALESCE(MAX(sequence),0) FROM outbox",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    ).map_err(error)?;
    let remote_requests: i64 = db.query_row("SELECT COUNT(*) FROM remote_requests", [], |r| r.get(0)).map_err(error)?;
    let open_tills: i64 = db.query_row(
        "SELECT COUNT(*) FROM records WHERE collection='tillSessions' AND archived=0 AND json_extract(data,'$.status')='OPEN'",
        [], |r| r.get(0)
    ).map_err(error)?;

    let collections = {
        let mut stmt = db.prepare("SELECT collection,COALESCE(SUM(CASE WHEN archived=0 THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN archived<>0 THEN 1 ELSE 0 END),0),COALESCE(MAX(version),0) FROM records GROUP BY collection ORDER BY collection").map_err(error)?;
        let rows = stmt.query_map([], |r| Ok(json!({
            "collection": r.get::<_, String>(0)?,
            "active": r.get::<_, i64>(1)?,
            "archived": r.get::<_, i64>(2)?,
            "maxVersion": r.get::<_, i64>(3)?,
        }))).map_err(error)?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(error)?
    };
    let manifest = {
        let mut stmt = db.prepare("SELECT collection,id,version,archived FROM records ORDER BY collection,id").map_err(error)?;
        let rows = stmt.query_map([], |r| Ok(json!({
            "collection": r.get::<_, String>(0)?,
            "id": r.get::<_, String>(1)?,
            "version": r.get::<_, i64>(2)?,
            "archived": r.get::<_, bool>(3)?,
        }))).map_err(error)?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(error)?
    };

    let mut warnings: Vec<String> = vec![];
    if quick_check != "ok" { warnings.push(format!("SQLite quick_check returned: {quick_check}")); }
    if stage != "LIVE" { warnings.push(format!("Installation stage is {stage}, not LIVE")); }
    if terminal_id.is_none() { warnings.push("Terminal identity is missing".into()); }
    if last_backup.is_none() { warnings.push("No successful local backup is recorded".into()); }
    if outbox_pending > 0 { warnings.push(format!("{outbox_pending} local operation(s) are still pending cloud acknowledgement")); }
    if !cloud_configured { warnings.push("Cloud synchronization is not configured".into()); }
    if open_tills > 0 { warnings.push("A till is currently open; take migration checkpoints after close where operationally possible".into()); }

    Ok(json!({
        "mode": "READ_ONLY_LOCAL_AUDIT",
        "generatedAt": now(),
        "appVersion": env!("CARGO_PKG_VERSION"),
        "database": {"schemaVersion": schema_version, "quickCheck": quick_check},
        "installation": {"stage": stage, "terminalId": terminal_id, "cloudConfigured": cloud_configured, "projectHostname":project_hostname, "lastSync": last_sync, "lastBackup": last_backup},
        "staff": {"total": staff_total, "active": staff_active},
        "operations": {"commands": commands, "auditEntries": audit_entries, "firstAuditSequence": first_audit, "lastAuditSequence": last_audit, "outboxTotal": outbox_total, "outboxPending": outbox_pending, "outboxAcknowledged": outbox_acknowledged, "lastOutboxSequence": last_outbox, "remoteRequests": remote_requests, "openTills": open_tills},
        "records": {"total": record_total, "active": record_active, "archived": record_archived, "collections": collections, "manifest": manifest},
        "warnings": warnings,
    }))
}

// SERVOS_PATCH_02A_RECONCILIATION
fn reconciliation_control_totals(records: &[(String, String, bool, Value)]) -> Value {
    let mut collections: std::collections::BTreeMap<String, (i64, i64)> = std::collections::BTreeMap::new();
    let mut stock_micros: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    let mut movement_micros: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    let mut financial_minor: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    let add = |map: &mut std::collections::BTreeMap<String, i64>, key: String, amount: i64| {
        let value = map.entry(key).or_default();
        *value = value.saturating_add(amount);
    };
    for (collection, record_id, archived, data) in records {
        let counts = collections.entry(collection.clone()).or_default();
        counts.0 += 1;
        if *archived { counts.1 += 1; }
        if collection == "stockItems" {
            if let Some(locations) = data.get("currentStock").and_then(Value::as_object) {
                for (location, quantity) in locations {
                    if let Some(quantity) = quantity.as_f64().filter(|value| value.is_finite()) {
                        add(&mut stock_micros, format!("{record_id}::{location}"), (quantity * 1_000_000.0).round() as i64);
                    }
                }
            }
        }
        if collection == "stockMovements" {
            if let (Some(stock_id), Some(location), Some(quantity)) = (
                data.get("stockItemId").and_then(Value::as_str),
                data.get("locationId").and_then(Value::as_str),
                data.get("quantityDelta").and_then(Value::as_f64).filter(|value| value.is_finite()),
            ) {
                add(&mut movement_micros, format!("{stock_id}::{location}"), (quantity * 1_000_000.0).round() as i64);
            }
        }
        let amount = match collection.as_str() {
            "orders" => data.get("grandTotal").and_then(Value::as_f64).filter(|value| value.is_finite()).map(|value| (value * 100.0).round() as i64),
            "goodsReceipts" => data.get("acceptedValue").and_then(Value::as_f64).filter(|value| value.is_finite()).map(|value| (value * 100.0).round() as i64),
            "payments" | "refunds" | "mpesaReceipts" | "customerCreditEntries" | "folioEntries" => data.get("amountMinor").and_then(Value::as_i64),
            "folios" => data.get("balanceMinor").and_then(Value::as_i64),
            _ => None,
        };
        if let Some(amount) = amount { add(&mut financial_minor, collection.clone(), amount); }
        if collection == "folios" {
            if let Some(deposit) = data.get("depositMinor").and_then(Value::as_i64) {
                add(&mut financial_minor, "folioDeposits".into(), deposit);
            }
        }
        if collection == "purchaseOrders" {
            let ordered_minor = data.get("items").and_then(Value::as_array).into_iter().flatten().map(|line| {
                let quantity = line.get("quantityOrdered").and_then(Value::as_f64).unwrap_or(0.0);
                let unit_price = line.get("unitPrice").and_then(Value::as_f64).unwrap_or(0.0);
                if quantity.is_finite() && unit_price.is_finite() { (quantity * unit_price * 100.0).round() as i64 } else { 0 }
            }).fold(0i64, i64::saturating_add);
            add(&mut financial_minor, "purchaseOrders".into(), ordered_minor);
        }
    }
    stock_micros.retain(|_, quantity| *quantity != 0);
    movement_micros.retain(|_, quantity| *quantity != 0);
    let inventory_reconciles = stock_micros == movement_micros;
    let collection_counts = collections.into_iter().map(|(name, (total, archived))| (name, json!({"total":total,"active":total-archived,"archived":archived}))).collect::<serde_json::Map<_,_>>();
    let to_json = |values: std::collections::BTreeMap<String, i64>| values.into_iter().map(|(key, value)| (key, json!(value))).collect::<serde_json::Map<_,_>>();
    json!({"inventoryReconciles":inventory_reconciles,"collections":collection_counts,"stockQuantityMicros":to_json(stock_micros),"movementQuantityMicros":to_json(movement_micros),"financialMinor":to_json(financial_minor)})
}

pub fn reconciliation_compare(db: &Connection, token: &str, cloud: &Value) -> Result<Value> {
    let user = actor(db, token, false)?;
    if !permissions(&user.role).contains(&"audit.view") {
        return Err("Audit permission required".into());
    }
    if cloud.get("mode").and_then(Value::as_str) != Some("READ_ONLY_CLOUD_REPLICA") {
        return Err("Unexpected cloud reconciliation payload".into());
    }

    let local_terminal = meta(db, "terminal_id")?.ok_or("Terminal identity is missing")?;
    let cloud_terminal = cloud
        .get("terminal")
        .and_then(|v| v.get("id"))
        .and_then(Value::as_str)
        .ok_or("Cloud reconciliation payload is missing terminal identity")?;
    if cloud_terminal != local_terminal {
        return Err("Cloud reconciliation payload belongs to a different terminal".into());
    }

    let cloud_records = cloud
        .get("records")
        .and_then(Value::as_array)
        .ok_or("Cloud reconciliation payload is missing records")?;
    if cloud_records.len() > 100_000 {
        return Err("Cloud reconciliation payload is too large".into());
    }

    let mut local_map: std::collections::BTreeMap<String, (String, String, i64, bool, Value)> =
        std::collections::BTreeMap::new();
    {
        let mut stmt = db
            .prepare("SELECT collection,id,version,archived,data FROM records ORDER BY collection,id")
            .map_err(error)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, bool>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(error)?;
        for row in rows {
            let (collection, record_id, version, archived, raw) = row.map_err(error)?;
            let data = serde_json::from_str::<Value>(&raw).map_err(error)?;
            let key = format!("{}\u{0}{}", collection, record_id);
            local_map.insert(key, (collection, record_id, version, archived, data));
        }
    }

    let mut cloud_map: std::collections::BTreeMap<String, (String, String, i64, bool, Value)> =
        std::collections::BTreeMap::new();
    for record in cloud_records {
        let collection = text(record, "collection")?.to_string();
        let record_id = text(record, "id")?.to_string();
        let version = record
            .get("version")
            .and_then(Value::as_i64)
            .filter(|v| *v > 0)
            .ok_or("Cloud record version must be a positive integer")?;
        let archived = record
            .get("archived")
            .and_then(Value::as_bool)
            .ok_or("Cloud record archived state is required")?;
        let data = record
            .get("data")
            .filter(|v| v.is_object())
            .cloned()
            .ok_or("Cloud record data must be an object")?;
        let key = format!("{}\u{0}{}", collection, record_id);
        if cloud_map
            .insert(key, (collection, record_id, version, archived, data))
            .is_some()
        {
            return Err("Cloud reconciliation payload contains a duplicate record identity".into());
        }
    }

    let keys: std::collections::BTreeSet<String> =
        local_map.keys().chain(cloud_map.keys()).cloned().collect();
    let mut results: Vec<Value> = vec![];
    let mut matched = 0i64;
    let mut local_ahead = 0i64;
    let mut cloud_missing = 0i64;
    let mut cloud_ahead = 0i64;
    let mut diverged = 0i64;

    for key in keys {
        let local = local_map.get(&key);
        let remote = cloud_map.get(&key);
        let (collection, record_id) = match (local, remote) {
            (Some(v), _) => (v.0.clone(), v.1.clone()),
            (None, Some(v)) => (v.0.clone(), v.1.clone()),
            (None, None) => continue,
        };

        let (classification, reason) = match (local, remote) {
            (Some(_), None) => {
                cloud_missing += 1;
                ("CLOUD_MISSING", "Record exists locally but is absent from the cloud replica")
            }
            (None, Some(_)) => {
                cloud_ahead += 1;
                ("CLOUD_AHEAD", "Record exists in the cloud replica but not in local SQLite")
            }
            (Some(l), Some(r)) if l.2 == r.2 && l.3 == r.3 && l.4 == r.4 => {
                matched += 1;
                ("MATCHED", "Version, archive state and record data match")
            }
            (Some(l), Some(r)) if l.2 > r.2 => {
                local_ahead += 1;
                ("LOCAL_AHEAD", "Local record version is newer than the cloud replica")
            }
            (Some(l), Some(r)) if r.2 > l.2 => {
                cloud_ahead += 1;
                ("CLOUD_AHEAD", "Cloud record version is newer than local SQLite")
            }
            (Some(_), Some(_)) => {
                diverged += 1;
                ("DIVERGED", "Same record version has different archive state or record data")
            }
            (None, None) => continue,
        };

        results.push(json!({
            "collection": collection,
            "id": record_id,
            "classification": classification,
            "localVersion": local.map(|v| v.2),
            "cloudVersion": remote.map(|v| v.2),
            "localArchived": local.map(|v| v.3),
            "cloudArchived": remote.map(|v| v.3),
            "reason": reason,
        }));
    }

    let schema_version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(error)?;
    let quick_check: String = db
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(error)?;
    let (last_outbox, pending_outbox): (i64, i64) = db
        .query_row(
            "SELECT COALESCE(MAX(sequence),0),COALESCE(SUM(CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END),0) FROM outbox",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(error)?;
    let cloud_last_sequence = cloud
        .get("terminal")
        .and_then(|v| v.get("lastSequence"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let cloud_last_seen = cloud
        .get("terminal")
        .and_then(|v| v.get("lastSeen"))
        .cloned()
        .unwrap_or(Value::Null);
    let cloud_operation_count = cloud
        .get("operations")
        .and_then(|v| v.get("count"))
        .and_then(Value::as_i64)
        .unwrap_or(0);

    let local_control_records = local_map.values().map(|(collection, record_id, _, archived, data)| (collection.clone(), record_id.clone(), *archived, data.clone())).collect::<Vec<_>>();
    let cloud_control_records = cloud_map.values().map(|(collection, record_id, _, archived, data)| (collection.clone(), record_id.clone(), *archived, data.clone())).collect::<Vec<_>>();
    let local_control_totals = reconciliation_control_totals(&local_control_records);
    let cloud_control_totals = reconciliation_control_totals(&cloud_control_records);
    let control_totals_match = local_control_totals["inventoryReconciles"] == true
        && cloud_control_totals["inventoryReconciles"] == true
        && local_control_totals == cloud_control_totals;

    let mut blockers: Vec<String> = vec![];
    let mut warnings: Vec<String> = vec![
        "This comparison is read-only. No local or cloud business record was repaired or overwritten.".into()
    ];
    if quick_check != "ok" {
        blockers.push(format!("SQLite quick_check returned: {quick_check}"));
    }
    if pending_outbox > 0 {
        blockers.push(format!("{pending_outbox} local operation(s) are still awaiting cloud acknowledgement"));
    }
    if local_ahead > 0 {
        blockers.push(format!("{local_ahead} record(s) are newer locally than in the cloud replica"));
    }
    if cloud_missing > 0 {
        blockers.push(format!("{cloud_missing} local record(s) are missing from the cloud replica"));
    }
    if cloud_ahead > 0 {
        blockers.push(format!("{cloud_ahead} record(s) are newer or exist only in the cloud replica"));
    }
    if diverged > 0 {
        blockers.push(format!("{diverged} record(s) have the same version but different content or archive state"));
    }
    if !control_totals_match {
        blockers.push("Migration control totals differ, or current stock does not reconcile to immutable movement history, for one or both replicas".into());
    }
    if cloud_last_sequence != last_outbox {
        blockers.push(format!(
            "Cloud operation sequence {cloud_last_sequence} does not equal local outbox sequence {last_outbox}"
        ));
    }
    if cloud_operation_count != cloud_last_sequence {
        warnings.push(format!(
            "Cloud stores {cloud_operation_count} operation envelope(s) while its terminal sequence is {cloud_last_sequence}; investigate gaps or retained history before cutover"
        ));
    }

    let total = results.len() as i64;
    let cutover_ready = blockers.is_empty() && matched == total;

    Ok(json!({
        "mode": "READ_ONLY_RECONCILIATION",
        "generatedAt": now(),
        "local": {
            "terminalId": local_terminal,
            "schemaVersion": schema_version,
            "quickCheck": quick_check,
            "lastOutboxSequence": last_outbox,
            "pendingOutbox": pending_outbox,
        },
        "cloud": {
            "terminalId": cloud_terminal,
            "lastSequence": cloud_last_sequence,
            "lastSeen": cloud_last_seen,
            "operationCount": cloud_operation_count,
        },
        "summary": {
            "total": total,
            "matched": matched,
            "localAhead": local_ahead,
            "cloudMissing": cloud_missing,
            "cloudAhead": cloud_ahead,
            "diverged": diverged,
        },
        "controlTotals": {"matches":control_totals_match,"local":local_control_totals,"cloud":cloud_control_totals},
        "cutoverReady": cutover_ready,
        "blockers": blockers,
        "warnings": warnings,
        "records": results,
    }))
}


// SERVOS_PATCH_03_IMPORT_CENTER
fn import_required_headers(key: &str) -> Result<&'static [&'static str]> {
    match key {
        "business" => Ok(&["external_id","trading_name","currency","timezone"]),
        "outlets" => Ok(&["external_id","name","type"]),
        "stock_locations" => Ok(&["external_id","name","kind"]),
        "suppliers" => Ok(&["external_id","name"]),
        "customers" => Ok(&["external_id","name"]),
        "employees" => Ok(&["external_id","full_name","job_title","role"]),
        "products" => Ok(&["external_id","code","name","selling_price"]),
        "inventory" => Ok(&["external_id","stock_item_external_id","stock_item_name","base_unit","location_external_id","opening_quantity"]),
        "room_types" => Ok(&["external_id","name","code","base_rate"]),
        "rooms" => Ok(&["external_id","room_number","room_type_external_id","initial_status"]),
        "rate_plans" => Ok(&["external_id","name","room_type_external_id","currency","nightly_rate"]),
        "hotel_services" => Ok(&["external_id","code","name","unit_price"]),
        "asset_categories" => Ok(&["external_id","name","code"]),
        "assets" => Ok(&["external_id","asset_tag","name","category_external_id","status"]),
        _ => Err("Unknown import template".into()),
    }
}
fn import_numeric_headers(key: &str) -> &'static [&'static str] {
    match key {
        "suppliers" => &["payment_terms_days"],
        "customers" => &["credit_limit"],
        "products" => &["selling_price"],
        "inventory" => &["opening_quantity","average_unit_cost","reorder_level"],
        "room_types" => &["capacity_adults","capacity_children","base_rate"],
        "rate_plans" => &["nightly_rate","min_nights","max_nights"],
        "hotel_services" => &["unit_price"],
        "asset_categories" => &["useful_life_months"],
        "assets" => &["acquisition_cost"],
        _ => &[],
    }
}
fn import_boolean_headers(_key: &str) -> &'static [&'static str] {
    &["active","taxable"]
}
fn import_enum_values(key: &str, header: &str) -> Option<&'static [&'static str]> {
    match (key,header) {
        ("employees","role") => Some(&["ADMIN","MANAGER","SERVER"]),
        ("outlets","type") => Some(&["BAR","PUB","LOUNGE","CLUB","RESTAURANT","RETAIL","OTHER"]),
        ("stock_locations","kind") => Some(&["MAIN","BAR","KITCHEN","COLD_STORE","ROOM","OTHER"]),
        ("products","route_to") => Some(&["BAR","KITCHEN","SERVICE"]),
        ("rooms","initial_status") => Some(&["READY","DIRTY","OUT_OF_ORDER"]),
        ("rate_plans","meal_plan") => Some(&["ROOM_ONLY","BB","HB","FB"]),
        ("asset_categories","depreciation_method") => Some(&["STRAIGHT_LINE","NONE"]),
        ("assets","status") => Some(&["IN_SERVICE","IN_STORAGE","MAINTENANCE","LOST","RETIRED","DISPOSED"]),
        _ => None,
    }
}
fn normalize_import_header(raw: &str) -> String {
    let raw=raw.trim().trim_start_matches('\u{feff}').to_ascii_lowercase();
    let mut out=String::new();
    let mut separator=false;
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            separator=false;
        } else if !separator && !out.is_empty() {
            out.push('_');
            separator=true;
        }
    }
    while out.ends_with('_') { out.pop(); }
    out
}
fn import_bool(raw: &str) -> Option<bool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "true"|"1"|"yes"|"y" => Some(true),
        "false"|"0"|"no"|"n" => Some(false),
        _ => None,
    }
}
fn import_batch_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let headers_raw:String=row.get(11)?;
    Ok(json!({
        "id":row.get::<_,String>(0)?,
        "templateKey":row.get::<_,String>(1)?,
        "fileName":row.get::<_,String>(2)?,
        "status":row.get::<_,String>(3)?,
        "createdBy":row.get::<_,String>(4)?,
        "createdAt":row.get::<_,String>(5)?,
        "updatedAt":row.get::<_,String>(6)?,
        "rowCount":row.get::<_,i64>(7)?,
        "validCount":row.get::<_,i64>(8)?,
        "invalidCount":row.get::<_,i64>(9)?,
        "sourceHash":row.get::<_,String>(10)?,
        "headers":serde_json::from_str::<Value>(&headers_raw).unwrap_or_else(|_|json!([])),
        "notes":row.get::<_,String>(12)?,
    }))
}
fn import_require(db: &Connection, token: &str, permission: &str, touch: bool) -> Result<Session> {
    let user=actor(db,token,touch)?;
    if !permissions(&user.role).contains(&permission) {
        return Err(format!("Permission required: {permission}"));
    }
    Ok(user)
}
pub fn import_list(db: &Connection, token: &str) -> Result<Value> {
    import_require(db,token,"data.import.view",false)?;
    let mut stmt=db.prepare(
        "SELECT id,template_key,file_name,status,created_by,created_at,updated_at,row_count,valid_count,invalid_count,source_hash,headers,notes FROM import_batches ORDER BY created_at DESC,id DESC LIMIT 100"
    ).map_err(error)?;
    let rows=stmt.query_map([],import_batch_row).map_err(error)?
        .collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
    Ok(Value::Array(rows))
}
pub fn import_detail(db: &Connection, token: &str, batch_id: &str) -> Result<Value> {
    import_require(db,token,"data.import.view",false)?;
    let mut batch=db.query_row(
        "SELECT id,template_key,file_name,status,created_by,created_at,updated_at,row_count,valid_count,invalid_count,source_hash,headers,notes FROM import_batches WHERE id=?",
        [batch_id],import_batch_row
    ).optional().map_err(error)?.ok_or("Import batch not found")?;
    let mut stmt=db.prepare(
        "SELECT row_number,status,external_id,normalized_json,errors,warnings FROM import_rows WHERE batch_id=? ORDER BY row_number LIMIT 500"
    ).map_err(error)?;
    let rows=stmt.query_map([batch_id],|r|{
        let normalized:String=r.get(3)?;
        let errors:String=r.get(4)?;
        let warnings:String=r.get(5)?;
        Ok(json!({
            "rowNumber":r.get::<_,i64>(0)?,
            "status":r.get::<_,String>(1)?,
            "externalId":r.get::<_,Option<String>>(2)?,
            "normalized":serde_json::from_str::<Value>(&normalized).unwrap_or_else(|_|json!({})),
            "errors":serde_json::from_str::<Value>(&errors).unwrap_or_else(|_|json!([])),
            "warnings":serde_json::from_str::<Value>(&warnings).unwrap_or_else(|_|json!([])),
        }))
    }).map_err(error)?.collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
    let total=batch["rowCount"].as_i64().unwrap_or(0);
    batch["rows"]=Value::Array(rows);
    batch["rowsTruncated"]=json!(total>500);
    Ok(batch)
}
pub fn import_stage(db: &mut Connection, token: &str, template_key: &str, file_name: &str, csv_text: &str) -> Result<Value> {
    let user=import_require(db,token,"data.import.stage",true)?;
    let required=import_required_headers(template_key)?;
    if file_name.trim().is_empty() || file_name.len()>240 || !file_name.to_ascii_lowercase().ends_with(".csv") {
        return Err("Import file must have a .csv name no longer than 240 characters".into());
    }
    if csv_text.trim().is_empty() { return Err("CSV file is empty".into()); }
    if csv_text.as_bytes().len()>5*1024*1024 { return Err("CSV file exceeds the 5 MB staging limit".into()); }

    let source_hash={
        let digest=Sha256::digest(csv_text.as_bytes());
        digest.iter().map(|b|format!("{b:02x}")).collect::<String>()
    };

    let clean=csv_text.trim_start_matches('\u{feff}');
    let mut reader=csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .flexible(false)
        .from_reader(clean.as_bytes());
    let raw_headers=reader.headers().map_err(|e|format!("CSV header error: {e}"))?.clone();
    if raw_headers.is_empty() { return Err("CSV requires a header row".into()); }
    let headers:Vec<String>=raw_headers.iter().map(normalize_import_header).collect();
    let mut header_seen=std::collections::BTreeSet::new();
    let restricted=["pin","password","password_confirm","device_token","device_secret","access_token","publishable_key","cloud_key"];
    for header in &headers {
        if header.is_empty() { return Err("CSV contains an empty column name".into()); }
        if !header_seen.insert(header.clone()) { return Err(format!("CSV contains duplicate column: {header}")); }
        if restricted.contains(&header.as_str()) {
            return Err(format!("Sensitive credential column '{header}' is not allowed in imports"));
        }
    }
    let missing:Vec<&str>=required.iter().copied().filter(|h|!headers.iter().any(|x|x==h)).collect();
    if !missing.is_empty() { return Err(format!("CSV is missing required column(s): {}",missing.join(", "))); }

    let numeric=import_numeric_headers(template_key);
    let booleans=import_boolean_headers(template_key);
    let mut external_ids=std::collections::BTreeSet::new();
    let mut parsed:Vec<(i64,Value,Value,String,Vec<String>,Vec<String>,Option<String>)>=vec![];
    let mut valid_count=0i64;
    let mut invalid_count=0i64;

    for (index,result) in reader.records().enumerate() {
        if index>=20_000 { return Err("CSV exceeds the 20,000 row staging limit".into()); }
        let record=result.map_err(|e|format!("CSV row {} cannot be parsed: {e}",index+2))?;
        let row_number=(index+2) as i64;
        let mut raw=serde_json::Map::new();
        let mut normalized=serde_json::Map::new();
        let mut errors:Vec<String>=vec![];
        let mut warnings:Vec<String>=vec![];

        for (column,header) in headers.iter().enumerate() {
            let value=record.get(column).unwrap_or("").trim();
            raw.insert(header.clone(),json!(value));
            if value.is_empty() {
                normalized.insert(header.clone(),Value::Null);
                continue;
            }
            if booleans.contains(&header.as_str()) {
                match import_bool(value) {
                    Some(v)=>{ normalized.insert(header.clone(),json!(v)); },
                    None=>{
                        errors.push(format!("{header} must be true/false, yes/no or 1/0"));
                        normalized.insert(header.clone(),json!(value));
                    }
                }
                continue;
            }
            if numeric.contains(&header.as_str()) {
                match value.parse::<f64>() {
                    Ok(v) if v.is_finite() && v>=0.0 && v<=1_000_000_000.0=>{
                        normalized.insert(header.clone(),json!(v));
                    }
                    _=>{
                        errors.push(format!("{header} must be a non-negative number"));
                        normalized.insert(header.clone(),json!(value));
                    }
                }
                continue;
            }
            if let Some(allowed)=import_enum_values(template_key,header) {
                let upper=value.to_ascii_uppercase();
                if !allowed.contains(&upper.as_str()) {
                    errors.push(format!("{header} must be one of: {}",allowed.join(", ")));
                }
                normalized.insert(header.clone(),json!(upper));
                continue;
            }
            if header.ends_with("_external_ids") {
                let values:Vec<String>=value.split(';').map(str::trim).filter(|v|!v.is_empty()).map(str::to_string).collect();
                normalized.insert(header.clone(),json!(values));
                continue;
            }
            if header=="email" || header.ends_with("_email") {
                if !value.contains('@') { errors.push(format!("{header} is not a valid email address")); }
                normalized.insert(header.clone(),json!(value.to_ascii_lowercase()));
                continue;
            }
            normalized.insert(header.clone(),json!(value));
        }

        for field in required {
            let missing=match normalized.get(*field) {
                None|Some(Value::Null)=>true,
                Some(Value::String(v))=>v.trim().is_empty(),
                Some(Value::Array(v))=>v.is_empty(),
                _=>false,
            };
            if missing { errors.push(format!("{field} is required")); }
        }
        if template_key=="business" && index>0 {
            errors.push("business.csv accepts exactly one business identity row".into());
        }
        let external_id=normalized.get("external_id").and_then(Value::as_str).map(str::to_string);
        if let Some(ref external_id)=external_id {
            if !external_ids.insert(external_id.to_ascii_lowercase()) {
                errors.push("external_id must be unique within the CSV file".into());
            }
        }
        if template_key=="employees" {
            warnings.push("Employee imports never contain PINs. Access credentials must be created through ServOS staff security after import.".into());
        }
        let status=if errors.is_empty() {
            valid_count+=1;
            "VALID"
        } else {
            invalid_count+=1;
            "INVALID"
        };
        parsed.push((row_number,Value::Object(raw),Value::Object(normalized),status.into(),errors,warnings,external_id));
    }
    if parsed.is_empty() { return Err("CSV has a header but no data rows".into()); }

    let batch_id=id();
    let created=now();
    let batch_status=if invalid_count==0 {"READY"} else {"NEEDS_REVIEW"};
    let tx=db.transaction().map_err(error)?;
    tx.execute(
        "INSERT INTO import_batches(id,template_key,file_name,status,created_by,created_at,updated_at,row_count,valid_count,invalid_count,source_hash,headers,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![batch_id,template_key,file_name,batch_status,user.staff_id,created,created,parsed.len() as i64,valid_count,invalid_count,source_hash,serde_json::to_string(&headers).map_err(error)?,""]
    ).map_err(error)?;
    for (row_number,raw,normalized,status,errors,warnings,external_id) in parsed {
        tx.execute(
            "INSERT INTO import_rows(batch_id,row_number,raw_json,normalized_json,status,errors,warnings,external_id) VALUES(?,?,?,?,?,?,?,?)",
            params![batch_id,row_number,raw.to_string(),normalized.to_string(),status,serde_json::to_string(&errors).map_err(error)?,serde_json::to_string(&warnings).map_err(error)?,external_id]
        ).map_err(error)?;
    }
    tx.execute(
        "INSERT INTO import_events(batch_id,event_type,actor_id,occurred_at,detail) VALUES(?,?,?,?,?)",
        params![batch_id,"BATCH_STAGED",user.staff_id,created,json!({"templateKey":template_key,"fileName":file_name,"rowCount":valid_count+invalid_count,"validCount":valid_count,"invalidCount":invalid_count,"sourceHash":source_hash}).to_string()]
    ).map_err(error)?;
    tx.commit().map_err(error)?;
    import_detail(db,token,&batch_id)
}
pub fn import_cancel(db: &mut Connection, token: &str, batch_id: &str) -> Result<()> {
    let user=import_require(db,token,"data.import.stage",true)?;
    let current:Option<String>=db.query_row("SELECT status FROM import_batches WHERE id=?",[batch_id],|r|r.get(0)).optional().map_err(error)?;
    let current=current.ok_or("Import batch not found")?;
    if current=="APPLIED" { return Err("Applied import batches cannot be cancelled".into()); }
    if current=="CANCELLED" { return Ok(()); }
    let stamp=now();
    let tx=db.transaction().map_err(error)?;
    tx.execute("UPDATE import_batches SET status='CANCELLED',updated_at=? WHERE id=?",params![stamp,batch_id]).map_err(error)?;
    tx.execute(
        "INSERT INTO import_events(batch_id,event_type,actor_id,occurred_at,detail) VALUES(?,?,?,?,?)",
        params![batch_id,"BATCH_CANCELLED",user.staff_id,stamp,json!({"previousStatus":current}).to_string()]
    ).map_err(error)?;
    tx.commit().map_err(error)?;
    Ok(())
}

// SERVOS_PATCH_04_CONTROLLED_IMPORT
fn import_string(row:&Value,key:&str)->Option<String>{
    row.get(key).and_then(Value::as_str).map(str::trim).filter(|v|!v.is_empty()).map(str::to_string)
}
fn import_number(row:&Value,key:&str)->Option<f64>{row.get(key).and_then(Value::as_f64)}
fn import_boolean(row:&Value,key:&str)->Option<bool>{row.get(key).and_then(Value::as_bool)}
fn import_code(raw:&str)->String{
    let mut value=raw.chars().map(|c|if c.is_ascii_alphanumeric(){c.to_ascii_uppercase()}else{'_'}).collect::<String>();
    while value.contains("__"){value=value.replace("__","_");}
    value.trim_matches('_').chars().take(64).collect()
}
fn import_mapping_lookup(db:&Connection,namespace:&str,external_id:&str)->Result<Option<(String,String)>>{
    db.query_row(
        "SELECT collection,record_id FROM import_external_ids WHERE namespace=? AND lower(external_id)=lower(?)",
        params![namespace,external_id],
        |r|Ok((r.get(0)?,r.get(1)?))
    ).optional().map_err(error)
}
fn import_find_candidates(db:&Connection,collection:&str,checks:&[(String,String)])->Result<Vec<(String,i64,Value)>>{
    let mut found:std::collections::BTreeMap<String,(String,i64,Value)>=std::collections::BTreeMap::new();
    for record in list(db,collection)? {
        for (field,wanted) in checks {
            if wanted.trim().is_empty(){continue;}
            let matches=record["data"][field].as_str().is_some_and(|actual|actual.trim().eq_ignore_ascii_case(wanted.trim()));
            if matches {
                let key=record["id"].as_str().unwrap_or("").to_string();
                found.insert(key.clone(),(key,record["version"].as_i64().unwrap_or(0),record["data"].clone()));
            }
        }
    }
    Ok(found.into_values().collect())
}
fn import_target(
    db:&Connection,
    namespace:&str,
    external_id:&str,
    collection:&str,
    checks:&[(String,String)]
)->Result<(String,Option<i64>,Option<Value>,Option<String>)>{
    if let Some((mapped_collection,record_id))=import_mapping_lookup(db,namespace,external_id)? {
        if mapped_collection!=collection {
            return Ok((record_id,None,None,Some(format!("External ID {external_id} is already mapped to {mapped_collection}, not {collection}"))));
        }
        return match get(db,collection,&record_id) {
            Ok((version,data))=>Ok((record_id,Some(version),Some(data),None)),
            Err(_)=>Ok((record_id,None,None,Some(format!("External ID {external_id} points to a missing or archived {collection} record")))),
        };
    }
    let candidates=import_find_candidates(db,collection,checks)?;
    if candidates.len()>1 {
        return Ok((String::new(),None,None,Some(format!("Natural keys for {external_id} match multiple {collection} records"))));
    }
    if let Some((record_id,version,data))=candidates.into_iter().next(){
        return Ok((record_id,Some(version),Some(data),None));
    }
    Ok((id(),None,None,None))
}
fn import_patch_matches(existing:&Value,desired:&Value)->bool{
    let Some(map)=desired.as_object() else{return false;};
    map.iter().all(|(key,value)|existing.get(key)==Some(value))
}
fn import_step(
    step_index:i64,row_number:i64,action:&str,operation:Option<&str>,collection:Option<&str>,
    target_id:Option<&str>,expected_version:Option<i64>,payload:Option<Value>,reason:String,
    map_namespace:Option<&str>,map_external_id:Option<&str>
)->Value{
    let status=match action{"NO_CHANGE"=>"SKIPPED","BLOCKED"|"CONFLICT"=>"BLOCKED",_=>"PLANNED"};
    json!({
        "stepIndex":step_index,"rowNumber":row_number,"action":action,"status":status,
        "operation":operation,"targetCollection":collection,"targetId":target_id,
        "expectedVersion":expected_version,
        "commandId":if status=="PLANNED"{Value::String(id())}else{Value::Null},
        "payload":payload,"reason":reason,
        "mapNamespace":map_namespace,"mapExternalId":map_external_id
    })
}
fn import_plan_row_record(
    db:&Connection,row_number:i64,template_key:&str,row:&Value,installation_stage:&str,step_index:&mut i64
)->Result<Vec<Value>>{
    let external_id=import_string(row,"external_id").ok_or("external_id is required")?;
    let mut steps=vec![];
    let mut one=|action:&str,operation:Option<&str>,collection:Option<&str>,target_id:Option<&str>,version:Option<i64>,payload:Option<Value>,reason:String,namespace:Option<&str>,map_id:Option<&str>|{
        *step_index+=1;
        steps.push(import_step(*step_index,row_number,action,operation,collection,target_id,version,payload,reason,namespace,map_id));
    };

    if template_key=="business" {
        let (organization_version,organization)=get(db,"organization","business")?;
        let (property_version,property)=get(db,"property","property")?;
        let currency=import_string(row,"currency").unwrap_or_else(||"KES".into());
        let timezone=import_string(row,"timezone").unwrap_or_else(||"Africa/Nairobi".into());
        if currency!="KES" || timezone!="Africa/Nairobi" {
            one("BLOCKED",None,Some("organization"),Some("business"),Some(organization_version),None,
                "This installation supports KES and Africa/Nairobi only".into(),Some("business"),Some(&external_id));
            return Ok(steps);
        }
        let data=json!({
            "name":import_string(row,"trading_name").unwrap_or_default(),
            "legalName":import_string(row,"legal_name").unwrap_or_default(),
            "registrationNumber":import_string(row,"registration_number").unwrap_or_default(),
            "kraPin":import_string(row,"kra_pin").unwrap_or_default(),
            "phone":import_string(row,"phone").unwrap_or_default(),
            "email":import_string(row,"email").unwrap_or_default(),
            "address":import_string(row,"address").unwrap_or_default(),
            "currency":currency,"timezone":timezone
        });
        let same=
            organization["name"]==data["name"] &&
            organization["legalName"]==data["legalName"] &&
            organization["registrationNumber"]==data["registrationNumber"] &&
            organization["phone"]==data["phone"] &&
            organization["email"]==data["email"] &&
            organization["address"]==data["address"] &&
            property["kraPin"]==data["kraPin"] &&
            property["currency"]==data["currency"] &&
            property["timezone"]==data["timezone"];
        let payload=json!({"data":data,"organizationVersion":organization_version,"propertyVersion":property_version});
        one(if same{"NO_CHANGE"}else{"UPDATE"},Some("business.identity"),Some("organization"),Some("business"),Some(organization_version),Some(payload),
            if same{"Business identity already matches the staged row".into()}else{"Update business identity through the dedicated atomic business command".into()},
            Some("business"),Some(&external_id));
        return Ok(steps);
    }

    if template_key=="employees" {
        one("BLOCKED",None,Some("employees"),None,None,None,
            "Employee credentials cannot be imported. Create staff accounts through Staff Access so each PIN is established securely.".into(),None,None);
        return Ok(steps);
    }
    if ["room_types","rooms","rate_plans"].contains(&template_key) {
        if import_boolean(row,"active")==Some(false) {
            one("BLOCKED",None,None,None,None,None,
                "Archived room masters are not imported implicitly. Apply the active record first, then archive it through Rooms Studio if required.".into(),None,None);
            return Ok(steps);
        }
        let (namespace,collection,operation,checks,desired,payload_data)=match template_key {
            "room_types"=>{
                let code=import_string(row,"code").unwrap_or_default();
                let max_guests=(import_number(row,"capacity_adults").unwrap_or(0.0)+import_number(row,"capacity_children").unwrap_or(0.0)).round() as i64;
                if max_guests<1||max_guests>1000 {
                    one("BLOCKED",None,Some("roomTypes"),None,None,None,"Room type total guest capacity must be between 1 and 1000".into(),Some("room_types"),Some(&external_id));
                    return Ok(steps);
                }
                let desired=json!({"name":import_string(row,"name").unwrap_or_default(),"code":code,"maxGuests":max_guests});
                ("room_types","roomTypes","roomType.save",vec![("code".into(),desired["code"].as_str().unwrap_or("").to_string())],desired.clone(),desired)
            },
            "rooms"=>{
                let room_type_external=import_string(row,"room_type_external_id").unwrap_or_default();
                let room_type_id=match import_mapping_lookup(db,"room_types",&room_type_external)?{
                    Some((_,id))=>id,
                    None=>{
                        one("CONFLICT",None,Some("rooms"),None,None,None,format!("Room type external ID {room_type_external} is not applied yet"),Some("rooms"),Some(&external_id));
                        return Ok(steps);
                    }
                };
                let (_,room_type)=get(db,"roomTypes",&room_type_id)?;
                let number=import_string(row,"room_number").unwrap_or_default();
                let desired=json!({
                    "number":number,"roomTypeId":room_type_id,"capacity":room_type["maxGuests"].as_i64().unwrap_or(1),
                    "turnaroundMinutes":30,"floor":import_string(row,"floor").unwrap_or_default(),
                    "wing":import_string(row,"wing").unwrap_or_default()
                });
                let mut payload=desired.clone();
                payload["initialStatus"]=json!(import_string(row,"initial_status").unwrap_or_else(||"READY".into()));
                ("rooms","rooms","room.save",vec![("number".into(),desired["number"].as_str().unwrap_or("").to_string())],desired,payload)
            },
            "rate_plans"=>{
                let room_type_external=import_string(row,"room_type_external_id").unwrap_or_default();
                let room_type_id=match import_mapping_lookup(db,"room_types",&room_type_external)?{
                    Some((_,id))=>id,
                    None=>{
                        one("CONFLICT",None,Some("ratePlans"),None,None,None,format!("Room type external ID {room_type_external} is not applied yet"),Some("rate_plans"),Some(&external_id));
                        return Ok(steps);
                    }
                };
                let (_,property)=get(db,"property","property")?;
                let currency=import_string(row,"currency").unwrap_or_else(||"KES".into());
                if currency!="KES" {
                    one("BLOCKED",None,Some("ratePlans"),None,None,None,"Rate-plan CSV currency must be KES".into(),Some("rate_plans"),Some(&external_id));
                    return Ok(steps);
                }
                let minimum=import_number(row,"min_nights").unwrap_or(1.0).round() as i64;
                let maximum=import_number(row,"max_nights").unwrap_or(366.0).round() as i64;
                if minimum<1||maximum<minimum||maximum>366 {
                    one("BLOCKED",None,Some("ratePlans"),None,None,None,"Rate-plan min/max nights are invalid".into(),Some("rate_plans"),Some(&external_id));
                    return Ok(steps);
                }
                let tax_bps=((property["vatRatePct"].as_f64().unwrap_or(0.0)+property["levyRatePct"].as_f64().unwrap_or(0.0))*100.0).round() as i64;
                let desired=json!({
                    "name":import_string(row,"name").unwrap_or_default(),"roomTypeId":room_type_id,"mode":"NIGHTLY",
                    "priceMinor":(import_number(row,"nightly_rate").unwrap_or(0.0)*100.0).round() as i64,
                    "currency":currency,"taxBasisPoints":tax_bps,
                    "mealPlan":import_string(row,"meal_plan").unwrap_or_else(||"ROOM_ONLY".into()),
                    "minNights":minimum,
                    "maxNights":maximum
                });
                ("rate_plans","ratePlans","ratePlan.save",vec![("name".into(),desired["name"].as_str().unwrap_or("").to_string())],desired.clone(),desired)
            },
            _=>unreachable!()
        };
        let (target_id,version,existing,match_error)=import_target(db,namespace,&external_id,collection,&checks)?;
        if let Some(reason)=match_error {
            one("CONFLICT",None,Some(collection),if target_id.is_empty(){None}else{Some(&target_id)},version,None,reason,Some(namespace),Some(&external_id));
            return Ok(steps);
        }
        let same=existing.as_ref().is_some_and(|prior|import_patch_matches(prior,&desired));
        let action=if same{"NO_CHANGE"}else if version.is_some(){"UPDATE"}else{"CREATE"};
        // Keep the staged row's create intent intact for audit, but omit the
        // create-only initial state from the actual versioned update command.
        let mut command_data=payload_data;
        if template_key=="rooms"&&action=="UPDATE" {
            if let Some(fields)=command_data.as_object_mut(){fields.remove("initialStatus");}
        }
        one(action,Some(operation),Some(collection),Some(&target_id),version,Some(json!({"id":target_id,"data":command_data})),
            if same{"Current room-domain record already matches the staged fields".into()}else if version.is_some(){"Versioned room-domain update".into()}else{"Create through the native rooms domain".into()},
            Some(namespace),Some(&external_id));
        return Ok(steps);
    }
    if template_key=="hotel_services" {
        if import_boolean(row,"active")==Some(false) {
            one("BLOCKED",None,None,None,None,None,"Archived hotel services are not imported implicitly.".into(),None,None);
            return Ok(steps);
        }
        let code=import_string(row,"code").unwrap_or_default();
        let (_,property)=get(db,"property","property")?;
        let tax_bps=((property["vatRatePct"].as_f64().unwrap_or(0.0)+property["levyRatePct"].as_f64().unwrap_or(0.0))*100.0).round() as i64;
        let desired=json!({
            "name":import_string(row,"name").unwrap_or_default(),"code":code,
            "category":import_string(row,"category").unwrap_or_else(||"SERVICE".into()),
            "priceMinor":(import_number(row,"unit_price").unwrap_or(0.0)*100.0).round() as i64,
            "taxBasisPoints":tax_bps,"currency":"KES"
        });
        let checks=vec![("code".into(),code)];
        let (target_id,version,existing,match_error)=import_target(db,"hotel_services",&external_id,"hotelServices",&checks)?;
        if let Some(reason)=match_error {
            one("CONFLICT",None,Some("hotelServices"),if target_id.is_empty(){None}else{Some(&target_id)},version,None,reason,Some("hotel_services"),Some(&external_id));
            return Ok(steps);
        }
        let same=existing.as_ref().is_some_and(|prior|import_patch_matches(prior,&desired));
        let action=if same{"NO_CHANGE"}else if version.is_some(){"UPDATE"}else{"CREATE"};
        one(action,Some("hotelService.save"),Some("hotelServices"),Some(&target_id),version,Some(json!({"id":target_id,"data":desired})),
            if same{"Current hotel service already matches the staged fields".into()}else{"Apply through the native folio service master command".into()},
            Some("hotel_services"),Some(&external_id));
        return Ok(steps);
    }
    if ["asset_categories","assets"].contains(&template_key) {
        if template_key=="asset_categories" {
            if import_boolean(row,"active")==Some(false) {
                one("BLOCKED",None,Some("assetCategories"),None,None,None,
                    "Archived asset categories are not imported implicitly. Apply the active category, then archive it through the Assets domain if required.".into(),
                    Some("asset_categories"),Some(&external_id));
                return Ok(steps);
            }
            let code=import_string(row,"code").unwrap_or_default().to_ascii_uppercase();
            let method=import_string(row,"depreciation_method").unwrap_or_else(||"STRAIGHT_LINE".into()).to_ascii_uppercase();
            let life=import_number(row,"useful_life_months").unwrap_or(0.0).round() as i64;
            if !["STRAIGHT_LINE","NONE"].contains(&method.as_str())||life<0||life>1200||method=="STRAIGHT_LINE"&&life==0 {
                one("BLOCKED",None,Some("assetCategories"),None,None,None,
                    "Asset category depreciation method/useful life is invalid.".into(),Some("asset_categories"),Some(&external_id));
                return Ok(steps);
            }
            let desired=json!({"name":import_string(row,"name").unwrap_or_default(),"code":code,"depreciationMethod":method,"usefulLifeMonths":life});
            let checks=vec![("code".into(),desired["code"].as_str().unwrap_or("").to_string())];
            let (target_id,version,existing,match_error)=import_target(db,"asset_categories",&external_id,"assetCategories",&checks)?;
            if let Some(reason)=match_error {
                one("CONFLICT",None,Some("assetCategories"),if target_id.is_empty(){None}else{Some(&target_id)},version,None,reason,Some("asset_categories"),Some(&external_id));
                return Ok(steps);
            }
            let same=existing.as_ref().is_some_and(|prior|import_patch_matches(prior,&desired));
            let action=if same{"NO_CHANGE"}else if version.is_some(){"UPDATE"}else{"CREATE"};
            one(action,Some("assetCategory.save"),Some("assetCategories"),Some(&target_id),version,Some(json!({"id":target_id,"data":desired})),
                if same{"Current asset category already matches the staged fields".into()}else{"Apply through the native Assets domain".into()},
                Some("asset_categories"),Some(&external_id));
            return Ok(steps);
        }

        let status=import_string(row,"status").unwrap_or_else(||"IN_SERVICE".into()).to_ascii_uppercase();
        if !["IN_SERVICE","ACTIVE"].contains(&status.as_str()) {
            one("BLOCKED",None,Some("assets"),None,None,None,
                "Asset imports create active assets only. Lost, retired or disposed lifecycle state must be recorded through explicit asset commands.".into(),
                Some("assets"),Some(&external_id));
            return Ok(steps);
        }
        let category_external=import_string(row,"category_external_id").unwrap_or_default();
        let category_id=match import_mapping_lookup(db,"asset_categories",&category_external)?{
            Some((_,id))=>id,
            None=>{
                one("CONFLICT",None,Some("assets"),None,None,None,format!("Asset category external ID {category_external} is not applied yet"),Some("assets"),Some(&external_id));
                return Ok(steps);
            }
        };
        let location_external=import_string(row,"location_external_id").unwrap_or_default();
        let room_mapping=import_mapping_lookup(db,"rooms",&location_external)?;
        let stock_mapping=import_mapping_lookup(db,"stock_locations",&location_external)?;
        if room_mapping.is_some()&&stock_mapping.is_some(){
            one("CONFLICT",None,Some("assets"),None,None,None,
                format!("Location external ID {location_external} resolves to both a room and stock location; use unambiguous migration IDs"),
                Some("assets"),Some(&external_id));
            return Ok(steps);
        }
        let (room_id,location_id)=match (room_mapping,stock_mapping){
            (Some((_,id)),None)=>(Some(id),None),
            (None,Some((_,id)))=>(None,Some(id)),
            _=>{
                one("CONFLICT",None,Some("assets"),None,None,None,
                    format!("Asset location external ID {location_external} is not applied as a room or stock location yet"),
                    Some("assets"),Some(&external_id));
                return Ok(steps);
            }
        };
        let acquired=import_string(row,"acquisition_date");
        if acquired.as_deref().is_some_and(|v|chrono::NaiveDate::parse_from_str(v,"%Y-%m-%d").is_err()){
            one("BLOCKED",None,Some("assets"),None,None,None,"Asset acquisition date must use YYYY-MM-DD".into(),Some("assets"),Some(&external_id));
            return Ok(steps);
        }
        let cost_minor=(import_number(row,"acquisition_cost").unwrap_or(0.0)*100.0).round() as i64;
        let desired=json!({
            "name":import_string(row,"name").unwrap_or_default(),
            "tag":import_string(row,"asset_tag").unwrap_or_default().to_ascii_uppercase(),
            "assetCategoryId":category_id,
            "serialNumber":import_string(row,"serial_number"),
            "roomId":room_id,"locationId":location_id,
            "acquiredAt":acquired,"purchaseCostMinor":cost_minor,
            "notes":import_string(row,"notes").unwrap_or_default()
        });
        let checks=vec![("tag".into(),desired["tag"].as_str().unwrap_or("").to_string())];
        let (target_id,version,existing,match_error)=import_target(db,"assets",&external_id,"assets",&checks)?;
        if let Some(reason)=match_error {
            one("CONFLICT",None,Some("assets"),if target_id.is_empty(){None}else{Some(&target_id)},version,None,reason,Some("assets"),Some(&external_id));
            return Ok(steps);
        }
        let same=existing.as_ref().is_some_and(|prior|import_patch_matches(prior,&desired));
        let action=if same{"NO_CHANGE"}else if version.is_some(){"UPDATE"}else{"CREATE"};
        one(action,Some("asset.save"),Some("assets"),Some(&target_id),version,Some(json!({"id":target_id,"data":desired})),
            if same{"Current asset already matches the staged fields".into()}else{"Apply through the native Assets domain".into()},
            Some("assets"),Some(&external_id));
        return Ok(steps);
    }

    let mut namespace="";
    let mut collection="";
    let mut checks:Vec<(String,String)>=vec![];
    let mut desired=json!({});
    let mut dependency_error:Option<String>=None;
    let mut map_external_id=external_id.clone();

    match template_key {
        "outlets"=>{
            namespace="outlets";collection="outlets";
            if let Some(name)=import_string(row,"name"){checks.push(("name".into(),name.clone()));}
            let mut data=serde_json::Map::new();
            data.insert("name".into(),json!(import_string(row,"name").unwrap_or_default()));
            data.insert("type".into(),json!(import_string(row,"type").unwrap_or_else(||"BAR".into())));
            data.insert("phone".into(),json!(import_string(row,"phone").unwrap_or_default()));
            data.insert("address".into(),json!(import_string(row,"address").unwrap_or_default()));
            data.insert("active".into(),json!(import_boolean(row,"active").unwrap_or(true)));
            data.insert("propertyId".into(),json!("property"));
            if let Some(location_external)=import_string(row,"default_stock_location_external_id"){
                match import_mapping_lookup(db,"stock_locations",&location_external)? {
                    Some((_,record_id))=>{data.insert("defaultStockLocationId".into(),json!(record_id));},
                    None=>dependency_error=Some(format!("Default stock location external ID {location_external} is not applied yet")),
                }
            }
            desired=Value::Object(data);
        },
        "stock_locations"=>{
            namespace="stock_locations";collection="stockLocations";
            let name=import_string(row,"name").unwrap_or_default();
            checks.push(("name".into(),name.clone()));
            let mut data=serde_json::Map::new();
            data.insert("name".into(),json!(name));
            data.insert("code".into(),json!(import_code(&external_id)));
            data.insert("type".into(),json!(import_string(row,"kind").unwrap_or_else(||"OTHER".into())));
            data.insert("active".into(),json!(import_boolean(row,"active").unwrap_or(true)));
            data.insert("propertyId".into(),json!("property"));
            if let Some(outlet_external)=import_string(row,"outlet_external_id"){
                match import_mapping_lookup(db,"outlets",&outlet_external)? {
                    Some((_,record_id))=>{data.insert("outletId".into(),json!(record_id));},
                    None=>dependency_error=Some(format!("Outlet external ID {outlet_external} is not applied yet")),
                }
            }
            desired=Value::Object(data);
        },
        "suppliers"=>{
            namespace="suppliers";collection="suppliers";
            if let Some(kra)=import_string(row,"kra_pin"){checks.push(("kraPin".into(),kra));}
            if let Some(name)=import_string(row,"name"){checks.push(("name".into(),name));}
            desired=json!({
                "name":import_string(row,"name").unwrap_or_default(),
                "code":import_code(&external_id),
                "contactPerson":import_string(row,"contact_person").unwrap_or_default(),
                "phone":import_string(row,"phone").unwrap_or_default(),
                "email":import_string(row,"email").unwrap_or_default(),
                "kraPin":import_string(row,"kra_pin").unwrap_or_default(),
                "paymentTermsDays":import_number(row,"payment_terms_days").unwrap_or(0.0),
                "active":import_boolean(row,"active").unwrap_or(true)
            });
        },
        "customers"=>{
            namespace="customers";collection="customers";
            if let Some(email)=import_string(row,"email"){checks.push(("email".into(),email));}
            if let Some(phone)=import_string(row,"phone"){checks.push(("phone".into(),phone));}
            desired=json!({
                "name":import_string(row,"name").unwrap_or_default(),
                "phone":import_string(row,"phone").unwrap_or_default(),
                "email":import_string(row,"email").unwrap_or_default(),
                "creditLimit":import_number(row,"credit_limit").unwrap_or(0.0),
                "notes":import_string(row,"notes").unwrap_or_default(),
                "active":import_boolean(row,"active").unwrap_or(true)
            });
        },
        "products"=>{
            namespace="products";collection="products";
            let code=import_string(row,"code").unwrap_or_default();
            checks.push(("code".into(),code.clone()));
            if let Some(barcode)=import_string(row,"barcode"){checks.push(("barcode".into(),barcode.clone()));}
            let mut outlet_ids=vec![];
            if let Some(externals)=row.get("outlet_external_ids").and_then(Value::as_array){
                for ext in externals.iter().filter_map(Value::as_str) {
                    match import_mapping_lookup(db,"outlets",ext)? {
                        Some((_,record_id))=>outlet_ids.push(record_id),
                        None=>dependency_error=Some(format!("Outlet external ID {ext} is not applied yet")),
                    }
                }
            }
            if outlet_ids.is_empty() && dependency_error.is_none(){dependency_error=Some("Products require at least one applied outlet external ID".into());}
            let mut data=serde_json::Map::new();
            data.insert("name".into(),json!(import_string(row,"name").unwrap_or_default()));
            data.insert("code".into(),json!(code));
            data.insert("category".into(),json!(import_string(row,"category").unwrap_or_else(||"OTHER".into())));
            data.insert("price".into(),json!(import_number(row,"selling_price").unwrap_or(0.0)));
            data.insert("taxable".into(),json!(import_boolean(row,"taxable").unwrap_or(true)));
            data.insert("routeTo".into(),json!(import_string(row,"route_to").unwrap_or_else(||"BAR".into())));
            data.insert("outletIds".into(),json!(outlet_ids));
            data.insert("active".into(),json!(import_boolean(row,"active").unwrap_or(true)));
            if let Some(barcode)=import_string(row,"barcode"){data.insert("barcode".into(),json!(barcode));}
            if let Some(stock_external)=import_string(row,"stock_item_external_id"){
                match import_mapping_lookup(db,"stock_items",&stock_external)? {
                    Some((_,record_id))=>{data.insert("stockItemId".into(),json!(record_id));},
                    None=>dependency_error=Some(format!("Stock item external ID {stock_external} is not applied yet")),
                }
            }
            desired=Value::Object(data);
        },
        "inventory"=>{
            namespace="stock_items";collection="stockItems";
            map_external_id=import_string(row,"stock_item_external_id").ok_or("stock_item_external_id is required")?;
            let code=import_string(row,"code").unwrap_or_default();
            checks.push(("code".into(),code.clone()));
            if let Some(barcode)=import_string(row,"barcode"){checks.push(("barcode".into(),barcode.clone()));}
            let mut data=serde_json::Map::new();
            data.insert("name".into(),json!(import_string(row,"stock_item_name").unwrap_or_default()));
            data.insert("code".into(),json!(code));
            data.insert("baseUnit".into(),json!(import_string(row,"base_unit").unwrap_or_else(||"unit".into())));
            data.insert("averageUnitCost".into(),json!(import_number(row,"average_unit_cost").unwrap_or(0.0)));
            data.insert("scanUnitQuantity".into(),json!(1.0));
            data.insert("reorderLevel".into(),json!(import_number(row,"reorder_level").unwrap_or(0.0)));
            if let Some(barcode)=import_string(row,"barcode"){data.insert("barcode".into(),json!(barcode));}
            desired=Value::Object(data);
        },
        _=>return Err("Unsupported import template".into())
    }

    let (target_id,version,existing,match_error)=import_target(db,namespace,&map_external_id,collection,&checks)?;
    if template_key=="inventory" && installation_stage=="LIVE" {
        if let Some(prior)=&existing {
            if let Some(cost)=prior.get("averageUnitCost") { desired["averageUnitCost"]=cost.clone(); }
        }
    }
    if let Some(reason)=match_error.or(dependency_error) {
        one("CONFLICT",None,Some(collection),if target_id.is_empty(){None}else{Some(&target_id)},version,None,reason,Some(namespace),Some(&map_external_id));
        return Ok(steps);
    }

    if template_key=="outlets" && installation_stage=="LIVE" && version.is_none() && desired["defaultStockLocationId"].as_str().is_none() {
        one("BLOCKED",None,Some(collection),Some(&target_id),version,None,
            "A new LIVE outlet requires an applied default_stock_location_external_id".into(),Some(namespace),Some(&map_external_id));
        return Ok(steps);
    }

    let same=existing.as_ref().is_some_and(|prior|import_patch_matches(prior,&desired));
    let action=if same{"NO_CHANGE"}else if version.is_some(){"UPDATE"}else{"CREATE"};
    let payload=json!({"collection":collection,"id":target_id,"data":desired});
    one(action,Some("record.save"),Some(collection),Some(&target_id),version,Some(payload),
        if same{"Current record already matches the staged fields".into()}else if version.is_some(){"Versioned update through record.save".into()}else{"Create through record.save".into()},
        Some(namespace),Some(&map_external_id));
    drop(one);

    if template_key=="inventory" {
        let location_external=import_string(row,"location_external_id").unwrap_or_default();
        let location_id=import_mapping_lookup(db,"stock_locations",&location_external)?.map(|(_,id)|id);
        let opening=import_number(row,"opening_quantity").unwrap_or(0.0);
        let current=existing.as_ref().and_then(|v|v["currentStock"].as_object())
            .and_then(|locations|location_id.as_ref().and_then(|id|locations.get(id)))
            .and_then(Value::as_f64).unwrap_or(0.0);
        if (opening-current).abs()>0.000001 {
            *step_index+=1;
            let movement=if location_id.is_none(){
                import_step(*step_index,row_number,"BLOCKED",None,Some("stockItems"),Some(&target_id),None,None,
                    format!("Stock location external ID {location_external} is not applied yet"),None,None)
            } else if installation_stage=="LIVE" {
                import_step(*step_index,row_number,"BLOCKED",None,Some("stockItems"),Some(&target_id),None,None,
                    "Opening inventory cannot be imported after Go Live. Use Procurement/Receive or a controlled inventory count instead.".into(),None,None)
            } else {
                import_step(*step_index,row_number,"UPDATE",Some("inventory.openingBalance"),Some("stockItems"),Some(&target_id),None,
                    Some(json!({"stockItemId":target_id,"locationId":location_id.unwrap(),"quantity":opening,"reason":format!("CSV opening balance · {external_id}")})),
                    format!("Set opening quantity from {current} to {opening} through inventory.openingBalance"),None,None)
            };
            steps.push(movement);
        }
    }
    Ok(steps)
}
fn import_plan_db_row(row:&rusqlite::Row<'_>)->rusqlite::Result<Value>{
    let summary:String=row.get(8)?;
    Ok(json!({
        "id":row.get::<_,String>(0)?,"batchId":row.get::<_,String>(1)?,"status":row.get::<_,String>(2)?,
        "createdBy":row.get::<_,String>(3)?,"createdAt":row.get::<_,String>(4)?,"updatedAt":row.get::<_,String>(5)?,
        "sourceHash":row.get::<_,String>(6)?,"installationStage":row.get::<_,String>(7)?,
        "summary":serde_json::from_str::<Value>(&summary).unwrap_or_else(|_|json!({}))
    }))
}
pub fn import_plan_detail(db:&Connection,token:&str,plan_id:&str)->Result<Value>{
    import_require(db,token,"data.import.view",false)?;
    let mut plan=db.query_row(
        "SELECT id,batch_id,status,created_by,created_at,updated_at,source_hash,installation_stage,summary FROM import_apply_plans WHERE id=?",
        [plan_id],import_plan_db_row
    ).optional().map_err(error)?.ok_or("Import plan not found")?;
    let mut stmt=db.prepare(
        "SELECT step_index,row_number,action,status,operation,target_collection,target_id,expected_version,reason,error FROM import_apply_steps WHERE plan_id=? ORDER BY step_index"
    ).map_err(error)?;
    let steps=stmt.query_map([plan_id],|r|Ok(json!({
        "stepIndex":r.get::<_,i64>(0)?,"rowNumber":r.get::<_,i64>(1)?,"action":r.get::<_,String>(2)?,
        "status":r.get::<_,String>(3)?,"operation":r.get::<_,Option<String>>(4)?,"targetCollection":r.get::<_,Option<String>>(5)?,
        "targetId":r.get::<_,Option<String>>(6)?,"expectedVersion":r.get::<_,Option<i64>>(7)?,
        "reason":r.get::<_,String>(8)?,"error":r.get::<_,Option<String>>(9)?
    }))).map_err(error)?.collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
    plan["steps"]=Value::Array(steps);
    Ok(plan)
}
pub fn import_plan(db:&mut Connection,token:&str,batch_id:&str)->Result<Value>{
    let user=import_require(db,token,"data.import.stage",true)?;
    let (template_key,batch_status,source_hash):(String,String,String)=db.query_row(
        "SELECT template_key,status,source_hash FROM import_batches WHERE id=?",
        [batch_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))
    ).optional().map_err(error)?.ok_or("Import batch not found")?;
    if batch_status!="READY" {return Err("Only READY import batches can be planned".into());}
    let stage=installation_stage(db)?;
    let mut stmt=db.prepare("SELECT row_number,normalized_json FROM import_rows WHERE batch_id=? AND status='VALID' ORDER BY row_number").map_err(error)?;
    let rows=stmt.query_map([batch_id],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).map_err(error)?
        .collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
    drop(stmt);
    let mut step_index=0i64;let mut steps=vec![];
    for (row_number,raw) in rows {
        let row:Value=serde_json::from_str(&raw).map_err(error)?;
        steps.extend(import_plan_row_record(db,row_number,&template_key,&row,&stage,&mut step_index)?);
    }
    let count=|name:&str|steps.iter().filter(|s|s["action"]==name).count() as i64;
    let summary=json!({"total":steps.len(),"create":count("CREATE"),"update":count("UPDATE"),"noChange":count("NO_CHANGE"),"blocked":count("BLOCKED"),"conflict":count("CONFLICT")});
    let blocked=summary["blocked"].as_i64().unwrap_or(0)+summary["conflict"].as_i64().unwrap_or(0)>0;
    let plan_id=id();let created=now();let plan_status=if blocked{"BLOCKED"}else{"READY"};
    let tx=db.transaction().map_err(error)?;
    tx.execute("UPDATE import_apply_plans SET status='SUPERSEDED',updated_at=? WHERE batch_id=? AND status IN ('READY','BLOCKED','PARTIAL')",params![created,batch_id]).map_err(error)?;
    tx.execute(
        "INSERT INTO import_apply_plans(id,batch_id,status,created_by,created_at,updated_at,source_hash,installation_stage,summary) VALUES(?,?,?,?,?,?,?,?,?)",
        params![plan_id,batch_id,plan_status,user.staff_id,created,created,source_hash,stage,summary.to_string()]
    ).map_err(error)?;
    for step in &steps {
        tx.execute(
            "INSERT INTO import_apply_steps(plan_id,step_index,row_number,action,status,operation,target_collection,target_id,expected_version,command_id,payload,reason,map_namespace,map_external_id,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)",
            params![
                plan_id,step["stepIndex"].as_i64(),step["rowNumber"].as_i64(),step["action"].as_str(),step["status"].as_str(),
                step["operation"].as_str(),step["targetCollection"].as_str(),step["targetId"].as_str(),step["expectedVersion"].as_i64(),
                step["commandId"].as_str(),step.get("payload").filter(|v|!v.is_null()).map(Value::to_string),
                step["reason"].as_str(),step["mapNamespace"].as_str(),step["mapExternalId"].as_str()
            ]
        ).map_err(error)?;
    }
    tx.execute(
        "INSERT INTO import_events(batch_id,event_type,actor_id,occurred_at,detail) VALUES(?,?,?,?,?)",
        params![batch_id,"PLAN_CREATED",user.staff_id,created,json!({"planId":plan_id,"status":plan_status,"summary":summary,"installationStage":stage}).to_string()]
    ).map_err(error)?;
    tx.commit().map_err(error)?;
    import_plan_detail(db,token,&plan_id)
}
pub fn import_apply(db:&mut Connection,token:&str,plan_id:&str)->Result<Value>{
    let user=import_require(db,token,"data.import.execute",true)?;
    let (batch_id,status,source_hash,planned_stage):(String,String,String,String)=db.query_row(
        "SELECT batch_id,status,source_hash,installation_stage FROM import_apply_plans WHERE id=?",
        [plan_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
    ).optional().map_err(error)?.ok_or("Import plan not found")?;
    if status=="APPLIED"{return import_plan_detail(db,token,plan_id);}
    if status!="READY"&&status!="PARTIAL"{return Err("Import plan is blocked or superseded; create a new dry run".into());}
    let current_stage=installation_stage(db)?;
    if current_stage!=planned_stage{return Err("Installation stage changed after dry run; create a new import plan".into());}
    let (current_hash,batch_status):(String,String)=db.query_row(
        "SELECT source_hash,status FROM import_batches WHERE id=?",
        [&batch_id],|r|Ok((r.get(0)?,r.get(1)?))
    ).map_err(error)?;
    if current_hash!=source_hash{return Err("Staged source changed after dry run".into());}
    if batch_status!="READY"{return Err("Import batch is no longer READY; create a new staged batch or plan".into());}
    let blockers:i64=db.query_row("SELECT COUNT(*) FROM import_apply_steps WHERE plan_id=? AND action IN ('BLOCKED','CONFLICT')",[plan_id],|r|r.get(0)).map_err(error)?;
    if blockers>0{return Err("Import plan contains blocked or conflicting steps".into());}

    db.execute("UPDATE import_apply_plans SET status='APPLYING',updated_at=? WHERE id=?",params![now(),plan_id]).map_err(error)?;
    let mut stmt=db.prepare(
        "SELECT step_index,operation,target_collection,target_id,expected_version,command_id,payload,map_namespace,map_external_id FROM import_apply_steps WHERE plan_id=? AND status IN ('PLANNED','FAILED') ORDER BY step_index"
    ).map_err(error)?;
    let rows=stmt.query_map([plan_id],|r|Ok((
        r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,Option<String>>(2)?,r.get::<_,Option<String>>(3)?,
        r.get::<_,Option<i64>>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?,
        r.get::<_,Option<String>>(7)?,r.get::<_,Option<String>>(8)?
    ))).map_err(error)?.collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
    drop(stmt);

    for (step_index,operation,target_collection,target_id,expected_version,command_id,payload_raw,map_namespace,map_external_id) in rows {
        if let (Some(namespace),Some(external_id),Some(collection),Some(record_id))=(map_namespace.as_deref(),map_external_id.as_deref(),target_collection.as_deref(),target_id.as_deref()) {
            if let Some((prior_collection,prior_id))=db.query_row(
                "SELECT collection,record_id FROM import_external_ids WHERE namespace=? AND lower(external_id)=lower(?)",
                params![namespace,external_id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))
            ).optional().map_err(error)? {
                if prior_collection!=collection||prior_id!=record_id {
                    let message="External ID mapping changed after dry run".to_string();
                    db.execute("UPDATE import_apply_steps SET status='FAILED',error=? WHERE plan_id=? AND step_index=?",params![message,plan_id,step_index]).map_err(error)?;
                    db.execute("UPDATE import_apply_plans SET status='PARTIAL',updated_at=? WHERE id=?",params![now(),plan_id]).map_err(error)?;
                    return Err(message);
                }
            }
        }
        let payload:Value=serde_json::from_str(&payload_raw).map_err(error)?;
        let command=BusinessCommand{id:command_id.clone(),schema_version:1,operation:operation.clone(),target_version:expected_version,payload};
        match execute_as(db,&user,command) {
            Ok(_)=>{
                if let (Some(namespace),Some(external_id),Some(collection),Some(record_id))=(map_namespace.as_deref(),map_external_id.as_deref(),target_collection.as_deref(),target_id.as_deref()){
                    let prior:Option<(String,String)>=db.query_row(
                        "SELECT collection,record_id FROM import_external_ids WHERE namespace=? AND lower(external_id)=lower(?)",
                        params![namespace,external_id],|r|Ok((r.get(0)?,r.get(1)?))
                    ).optional().map_err(error)?;
                    if let Some((prior_collection,prior_id))=prior {
                        if prior_collection!=collection||prior_id!=record_id {
                            let message="External ID mapping changed after dry run".to_string();
                            db.execute("UPDATE import_apply_steps SET status='FAILED',error=? WHERE plan_id=? AND step_index=?",params![message,plan_id,step_index]).map_err(error)?;
                            db.execute("UPDATE import_apply_plans SET status='PARTIAL',updated_at=? WHERE id=?",params![now(),plan_id]).map_err(error)?;
                            return Err(message);
                        }
                    } else {
                        db.execute(
                            "INSERT INTO import_external_ids(namespace,external_id,collection,record_id,batch_id,created_at) VALUES(?,?,?,?,?,?)",
                            params![namespace,external_id,collection,record_id,batch_id,now()]
                        ).map_err(error)?;
                    }
                }
                db.execute("UPDATE import_apply_steps SET status='APPLIED',error=NULL WHERE plan_id=? AND step_index=?",params![plan_id,step_index]).map_err(error)?;
            },
            Err(message)=>{
                db.execute("UPDATE import_apply_steps SET status='FAILED',error=? WHERE plan_id=? AND step_index=?",params![message,plan_id,step_index]).map_err(error)?;
                db.execute("UPDATE import_apply_plans SET status='PARTIAL',updated_at=? WHERE id=?",params![now(),plan_id]).map_err(error)?;
                db.execute(
                    "INSERT INTO import_events(batch_id,event_type,actor_id,occurred_at,detail) VALUES(?,?,?,?,?)",
                    params![batch_id,"APPLY_FAILED",user.staff_id,now(),json!({"planId":plan_id,"stepIndex":step_index,"error":message}).to_string()]
                ).map_err(error)?;
                return Err(format!("Import stopped at step {step_index}: {message}"));
            }
        }
    }
    let mut skipped=db.prepare(
        "SELECT target_collection,target_id,map_namespace,map_external_id FROM import_apply_steps WHERE plan_id=? AND status='SKIPPED' AND map_namespace IS NOT NULL AND map_external_id IS NOT NULL"
    ).map_err(error)?;
    let skipped_maps=skipped.query_map([plan_id],|r|Ok((
        r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?
    ))).map_err(error)?.collect::<std::result::Result<Vec<_>,_>>().map_err(error)?;
    drop(skipped);
    for (collection,record_id,namespace,external_id) in skipped_maps {
        if let Some((prior_collection,prior_id))=db.query_row(
            "SELECT collection,record_id FROM import_external_ids WHERE namespace=? AND lower(external_id)=lower(?)",
            params![namespace,external_id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))
        ).optional().map_err(error)? {
            if prior_collection!=collection||prior_id!=record_id { return Err("External ID mapping changed after dry run".into()); }
        } else {
            db.execute(
                "INSERT INTO import_external_ids(namespace,external_id,collection,record_id,batch_id,created_at) VALUES(?,?,?,?,?,?)",
                params![namespace,external_id,collection,record_id,batch_id,now()]
            ).map_err(error)?;
        }
    }

    let finished=now();
    db.execute("UPDATE import_apply_plans SET status='APPLIED',updated_at=? WHERE id=?",params![finished,plan_id]).map_err(error)?;
    db.execute("UPDATE import_batches SET status='APPLIED',updated_at=? WHERE id=?",params![finished,batch_id]).map_err(error)?;
    db.execute(
        "INSERT INTO import_events(batch_id,event_type,actor_id,occurred_at,detail) VALUES(?,?,?,?,?)",
        params![batch_id,"BATCH_APPLIED",user.staff_id,finished,json!({"planId":plan_id}).to_string()]
    ).map_err(error)?;
    import_plan_detail(db,token,plan_id)
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
    if permissions(&user.role).contains(&"folio.room_charge") {
        for folio_record in list(db,"folios")? {
            let data=&folio_record["data"];if data["status"].as_str()!=Some("OPEN"){continue;}
            let Some(folio_id)=folio_record["id"].as_str() else {continue;};
            let Ok((_,reservation))=get(db,"roomReservations",folio_id) else {continue;};
            let Ok((_,stay))=get(db,"stays",folio_id) else {continue;};
            if reservation["status"].as_str()!=Some("CHECKED_IN")||stay["status"].as_str()!=Some("CHECKED_IN"){continue;}
            let room=get(db,"rooms",reservation["roomId"].as_str().unwrap_or("")).map(|(_,v)|v).unwrap_or(json!({}));
            let customer=get(db,"customers",reservation["customerId"].as_str().unwrap_or("")).map(|(_,v)|v).unwrap_or(json!({}));
            records.push(json!({"collection":"roomChargeTargets","id":folio_id,"version":folio_record["version"],"data":{
                "id":folio_id,"folioId":folio_id,"folioVersion":folio_record["version"],"roomId":reservation["roomId"],
                "roomNumber":room["number"],"guestName":customer["name"],"balanceMinor":data["balanceMinor"]
            }}));
        }
    }
    let pending:i64=db.query_row("SELECT COUNT(*) FROM outbox WHERE acknowledged_at IS NULL",[],|r|r.get(0)).map_err(error)?;
    Ok(json!({
        "records":records,"pendingCount":pending,"lastSync":meta(db,"last_sync")?,"lastBackup":meta(db,"last_backup")?,"terminalId":meta(db,"terminal_id")?,
        "installationStage":installation_stage(db)?,"actor":{"id":user.staff_id,"name":user.name,"role":user.role,"permissions":permissions(&user.role)}
    }))
}
